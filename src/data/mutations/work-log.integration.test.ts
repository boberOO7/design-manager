import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../../../tests/helpers/task-review-fixture";
import { addCalendarDays, instantToDateOnly, startOfMondayWeek } from "@/lib/calendar";
import { completedReviewCredits, summarizeLoggedTime, workLogDayBounds } from "@/lib/work-log";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), resolve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.resolve }));
import { getDailyWorkLog, getEmployeeWorkStatistics, getWeeklyWorkLog, getWorkLogReminders } from "@/data/queries/work-log";

describe("persisted daily work log and reviewer statistics", () => {
  let fixture: TaskReviewFixture;
  const date = instantToDateOnly(new Date().toISOString());
  beforeAll(async () => { fixture = await createTaskReviewFixture(); }, 60_000);
  afterAll(async () => { if (fixture) await fixture.dispose(); });
  const scope = (account: TaskReviewFixture["assignee"]) => {
    mocks.createClient.mockResolvedValue(account.client);
    mocks.resolve.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { studio_id: fixture.studioId, authenticatedUserId: account.id, joined_at: "2026-09-28T00:00:00Z", system_role: account === fixture.admin ? "admin" : "employee" } });
  };

  it("saves, edits and removes task rows atomically with own-user RLS", async () => {
    const { assignee, reviewer, admin, taskId, fallbackTaskId } = fixture;
    const row = { activity_kind: "task", task_id: taskId, review_round_id: null, minutes: 90 };
    await assignee.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [row, { ...row, task_id: fallbackTaskId, minutes: 20 }] }).throwOnError();
    const before = await assignee.client.from("work_log_entries").select("id,minutes").eq("work_date", date).eq("task_id", taskId).single().throwOnError();
    await assignee.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [{ ...row, minutes: 120 }] }).throwOnError();
    expect((await assignee.client.from("work_log_entries").select("id,minutes").eq("work_date", date).single().throwOnError()).data).toEqual({ id: before.data.id, minutes: 120 });
    expect((await reviewer.client.from("work_log_entries").select("id")).data).toEqual([]);
    expect((await admin.client.from("work_log_entries").select("id")).data).toHaveLength(1);
    expect((await assignee.client.from("work_log_entries").update({ minutes: 900 }).eq("id", before.data.id)).error).not.toBeNull();
    expect((await assignee.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [{ ...row, minutes: 10 }, { ...row, task_id: randomUUID() }] })).error).not.toBeNull();
    expect((await fixture.outsider.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [row] })).error).not.toBeNull();
    expect((await assignee.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [{ ...row, activity_kind: "calendar" }] })).error).not.toBeNull();
    expect((await assignee.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [{ ...row, minutes: 1.5 }] })).error).not.toBeNull();
    expect((await assignee.client.from("work_log_entries").select("minutes").eq("work_date", date).single().throwOnError()).data.minutes).toBe(120);
    scope(assignee);
    expect((await getDailyWorkLog(date))?.rows.find(item => item.task_id === taskId)?.minutes).toBe(120);
  });

  it("persists time for Review #1 and #2 separately and gives reviewers no task/m² credit", async () => {
    const { admin, assignee, reviewer, taskId, projectId } = fixture;
    reviewSql(`update public.projects set total_area_m2=100 where id=${sqlId(projectId)};`);
    await admin.client.rpc("update_task_review", { p_task_id: taskId, p_action: "configure", p_reviewer_ids: [reviewer.id] }).throwOnError();
    await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
    const first = (await reviewer.client.from("task_review_rounds").select("id").eq("task_id", taskId).single().throwOnError()).data;
    const row = { activity_kind: "review", task_id: taskId, review_round_id: first.id, minutes: 25 };
    scope(reviewer);
    const tomorrow = addCalendarDays(date, 1);
    expect((await getDailyWorkLog(tomorrow))?.rows.find(item => item.review_round_id === first.id)).toBeUndefined();
    await reviewer.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [row] }).throwOnError();
    expect((await assignee.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [row] })).error).not.toBeNull();
    expect((await reviewer.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [{ ...row, task_id: fixture.fallbackTaskId }] })).error).not.toBeNull();
    await reviewer.client.rpc("update_task_review", { p_task_id: taskId, p_action: "rework", p_round_id: first.id, p_comment: "Fix drawings" }).throwOnError();
    await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
    const second = (await reviewer.client.from("task_review_rounds").select("id").eq("task_id", taskId).eq("round_number", 2).single().throwOnError()).data;
    await reviewer.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [row, { ...row, review_round_id: second.id, minutes: 15 }] }).throwOnError();
    await reviewer.client.rpc("update_task_review", { p_task_id: taskId, p_action: "approved", p_round_id: second.id }).throwOnError();
    await assignee.client.from("tasks").update({ status: "completed" }).eq("id", taskId).throwOnError();
    expect((await getDailyWorkLog(tomorrow))?.rows.filter(item => item.activity_kind === "review")).toEqual([]);
    const rounds = await reviewer.client.from("task_review_rounds").select("id,reviewer_id,result,completed_at,reviewers:task_review_round_reviewers(reviewer_id,approved_at)").eq("task_id", taskId).throwOnError();
    expect(completedReviewCredits(rounds.data).filter(row => row.userId === reviewer.id)).toHaveLength(2);
    scope(reviewer);
    expect(await getEmployeeWorkStatistics(fixture.studioId, reviewer.id)).toMatchObject({ reviewsCompleted: 2, taskMinutes: 0, reviewMinutes: 40 });
    const log = await getDailyWorkLog(date);
    expect(log?.rows.filter(row => row.activity_kind === "review").map(row => ({ round: row.roundNumber, minutes: row.minutes })).sort((a, b) => (a.round ?? 0) - (b.round ?? 0))).toEqual([{ round: 1, minutes: 25 }, { round: 2, minutes: 15 }]);
    expect((await reviewer.client.from("tasks").select("id", { count: "exact", head: true }).eq("status", "completed").eq("assignee_id", reviewer.id)).count).toBe(0);
    expect(reviewSql(`select count(*) from public.productivity_attributions where task_id=${sqlId(taskId)} and contributor_id=${sqlId(reviewer.id)};`)).toBe("0");
    expect(Number(reviewSql(`select coalesce(sum(credited_area_m2),0) from public.productivity_attributions where task_id=${sqlId(taskId)} and contributor_id=${sqlId(assignee.id)};`))).toBeGreaterThan(0);
  });

  it("defaults to eight hours and persists an admin's nine-hour standard day", async () => {
    const { admin, assignee, studioId } = fixture;
    const read = async () => (await assignee.client.from("studios").select("standard_workday_minutes").eq("id", studioId).single().throwOnError()).data.standard_workday_minutes;
    expect(await read()).toBe(480);
    expect((await assignee.client.rpc("set_standard_workday_minutes", { p_studio_id: studioId, p_minutes: 540 })).error).not.toBeNull();
    await admin.client.rpc("set_standard_workday_minutes", { p_studio_id: studioId, p_minutes: 540 }).throwOnError();
    expect(await read()).toBe(540);
    expect((await admin.client.rpc("set_standard_workday_minutes", { p_studio_id: studioId, p_minutes: 0 })).error).not.toBeNull();
    expect(await read()).toBe(540);
  });

  it("rejects future empty and positive submissions through the authenticated RPC without changing saved logs", async () => {
    const { assignee, admin, taskId } = fixture;
    const futureDate = addCalendarDays(date, 1);
    const saved = await assignee.client.from("work_log_entries").select("id,work_date,minutes").eq("user_id", assignee.id).throwOnError();
    const submitted = await assignee.client.from("work_log_days").select("work_date,submitted_at").eq("user_id", assignee.id).throwOnError();
    for (const account of [assignee, admin]) {
      for (const entries of [[], [{ activity_kind: "task", task_id: taskId, review_round_id: null, minutes: 60 }]]) {
        const rejected = await account.client.rpc("save_daily_work_log", { p_work_date: futureDate, p_entries: entries });
        expect(rejected.error?.message).toContain("future date");
      }
      expect((await account.client.from("work_log_days").select("work_date").eq("work_date", futureDate).throwOnError()).data).toEqual([]);
      expect((await account.client.from("work_log_entries").select("id").eq("work_date", futureDate).throwOnError()).data).toEqual([]);
    }
    expect((await assignee.client.from("work_log_entries").select("id,work_date,minutes").eq("user_id", assignee.id).throwOnError()).data).toEqual(saved.data);
    expect((await assignee.client.from("work_log_days").select("work_date,submitted_at").eq("user_id", assignee.id).throwOnError()).data).toEqual(submitted.data);
  });

  it("persists empty submissions, protects their ownership and leaves failed saves missing", async () => {
    const { assignee, reviewer, admin, outsider, taskId } = fixture;
    const emptyDate = "2026-09-29", invalidDate = "2026-09-30";
    scope(assignee);
    expect((await getDailyWorkLog(emptyDate))?.submittedAt).toBeNull();
    await assignee.client.rpc("save_daily_work_log", { p_work_date: emptyDate, p_entries: [] }).throwOnError();
    const daily = await getDailyWorkLog(emptyDate);
    expect(daily?.submittedAt).toBeTruthy();
    expect(daily?.rows.every(row => row.minutes === 0)).toBe(true);
    expect((await assignee.client.from("work_log_entries").select("id").eq("work_date", emptyDate).throwOnError()).data).toEqual([]);
    expect((await reviewer.client.from("work_log_days").select("work_date").eq("user_id", assignee.id).throwOnError()).data).toEqual([]);
    expect((await admin.client.from("work_log_days").select("work_date").eq("user_id", assignee.id).eq("work_date", emptyDate).throwOnError()).data).toHaveLength(1);
    expect((await outsider.client.from("work_log_days").select("work_date").eq("user_id", assignee.id).throwOnError()).data).toEqual([]);
    expect((await assignee.client.from("work_log_days").insert({ studio_id: fixture.studioId, user_id: reviewer.id, work_date: invalidDate })).error).not.toBeNull();
    expect((await assignee.client.from("work_log_days").delete().eq("work_date", emptyDate)).error).not.toBeNull();
    expect((await assignee.client.rpc("save_daily_work_log", { p_work_date: invalidDate, p_entries: [{ activity_kind: "review", task_id: taskId, review_round_id: randomUUID(), minutes: 10 }] })).error).not.toBeNull();
    expect((await getDailyWorkLog(invalidDate))?.submittedAt).toBeNull();
    const reminders = await getWorkLogReminders(new Date("2026-10-01T12:00:00Z"));
    expect(reminders?.missingDates).toEqual([]); // Before Work Tracking rollout.
    expect((await getWeeklyWorkLog(emptyDate))?.days.find(day => day.date === emptyDate)).toMatchObject({ totalMinutes: 0, missing: false, submittedAt: daily?.submittedAt });
  });

  it("keeps weekly statuses and task/review/Calendar minutes identical to daily reads", async () => {
    const { reviewer } = fixture;
    scope(reviewer);
    const { start } = workLogDayBounds(date);
    const event = await reviewer.client.rpc("create_calendar_event_with_invites", { p_studio_id: fixture.studioId,
      p_title: "Weekly Work Log Calendar parity", p_event_type: "meeting", p_starts_at: start,
      p_ends_at: new Date(Date.parse(start) + 45 * 60_000).toISOString(), p_all_day: false, p_meeting_mode: "online" }).throwOnError();
    try {
      const weekly = await getWeeklyWorkLog(date);
      expect(weekly).not.toBeNull();
      for (let index = 0; index < 7; index++) {
        const day = addCalendarDays(startOfMondayWeek(date), index), daily = await getDailyWorkLog(day);
        if (!daily) throw new Error("Daily read required");
        expect(weekly?.days[index]).toMatchObject({ date: day, submittedAt: daily.submittedAt, ...summarizeLoggedTime(daily.rows, daily.calendar.minutes) });
      }
      expect(weekly?.days.find(day => day.date === date)?.calendarMinutes).toBe(45);
      expect((await reviewer.client.from("work_log_entries").select("activity_kind").throwOnError()).data.every(row => row.activity_kind !== "calendar")).toBe(true);
    } finally {
      const eventId = event.data;
      if (eventId) reviewSql(`delete from public.calendar_events where id=${sqlId(eventId)};`);
    }
  });

  it("applies approved full-day time off and studio holidays while keeping partial/pending/cancelled absences eligible", async () => {
    const { reviewer, admin, studioId } = fixture;
    async function absence(day: string, allDay: boolean, approve: boolean) {
      const request = await reviewer.client.from("time_off_requests").insert({ studio_id: studioId, user_id: reviewer.id,
        request_type: "other", private_note: "Work Log eligibility test", start_date: day, end_date: day, all_day: allDay,
        start_time: allDay ? null : "10:00", end_time: allDay ? null : "11:00" }).select("id").single().throwOnError();
      if (approve) await admin.client.rpc("approve_time_off_request", { p_request_id: request.data.id }).throwOnError();
      return request.data.id;
    }
    try {
      await absence("2026-11-02", true, true);
      await absence("2026-11-03", false, true);
      await absence("2026-11-04", true, false);
      const cancelled = await absence("2026-11-05", true, true);
      await admin.client.from("time_off_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", cancelled).throwOnError();
      await admin.client.from("studio_days_off").insert({ studio_id: studioId, date: "2026-11-06", name: "Work Log holiday test", created_by: admin.id }).throwOnError();
      scope(reviewer);
      const data = await getWorkLogReminders(new Date("2026-11-09T12:00:00Z"));
      expect(data?.missingDates).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
      expect(data?.latestEligibleDate).toBe("2026-11-05");
      expect(data?.previousWeekMissing).toHaveLength(3);
    } finally {
      reviewSql(`delete from public.time_off_requests where studio_id=${sqlId(studioId)};
        delete from public.notifications where studio_id=${sqlId(studioId)};
        delete from public.studio_days_off where studio_id=${sqlId(studioId)};`);
    }
  });

  it("bounds the real reminder query while historical logs remain readable and editable", async () => {
    const { assignee, taskId } = fixture;
    scope(assignee);
    const historicalDate = "2026-09-28";
    const row = { activity_kind: "task", task_id: taskId, review_round_id: null, minutes: 45 };
    await assignee.client.rpc("save_daily_work_log", { p_work_date: historicalDate, p_entries: [row] }).throwOnError();
    const oldWeek = await getWeeklyWorkLog(historicalDate, new Date("2026-11-12T12:00:00Z"));
    expect(oldWeek?.days.every(day => !day.missing)).toBe(true);
    expect(oldWeek?.days[0]).toMatchObject({ taskMinutes: 45, totalMinutes: 45 });
    expect(oldWeek?.days[0].submittedAt).toBeTruthy();
    await assignee.client.rpc("save_daily_work_log", { p_work_date: historicalDate, p_entries: [{ ...row, minutes: 90 }] }).throwOnError();
    expect((await getDailyWorkLog(historicalDate))?.rows.find(item => item.task_id === taskId)?.minutes).toBe(90);
    const data = await getWorkLogReminders(new Date("2026-11-12T12:00:00Z"));
    expect(data?.missingDates).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(data?.previousWeekMissing).toHaveLength(5);
    const rollout = await getWorkLogReminders(new Date("2026-10-08T12:00:00Z"));
    expect(rollout?.missingDates).toEqual(["2026-10-07"]);
  });
});
