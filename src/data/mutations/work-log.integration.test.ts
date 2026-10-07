import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../../../tests/helpers/task-review-fixture";
import { instantToDateOnly } from "@/lib/calendar";
import { completedReviewCredits } from "@/lib/work-log";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), resolve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.resolve }));
import { getDailyWorkLog, getEmployeeWorkStatistics } from "@/data/queries/work-log";

describe("persisted daily work log and reviewer statistics", () => {
  let fixture: TaskReviewFixture;
  const date = instantToDateOnly(new Date().toISOString());
  beforeAll(async () => { fixture = await createTaskReviewFixture(); }, 60_000);
  afterAll(async () => { if (fixture) await fixture.dispose(); });
  const scope = (account: TaskReviewFixture["assignee"]) => {
    mocks.createClient.mockResolvedValue(account.client);
    mocks.resolve.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { studio_id: fixture.studioId, authenticatedUserId: account.id, system_role: account === fixture.admin ? "admin" : "employee" } });
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
    await reviewer.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [row] }).throwOnError();
    expect((await assignee.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [row] })).error).not.toBeNull();
    expect((await reviewer.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [{ ...row, task_id: fixture.fallbackTaskId }] })).error).not.toBeNull();
    await reviewer.client.rpc("update_task_review", { p_task_id: taskId, p_action: "rework", p_round_id: first.id, p_comment: "Fix drawings" }).throwOnError();
    await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
    const second = (await reviewer.client.from("task_review_rounds").select("id").eq("task_id", taskId).eq("round_number", 2).single().throwOnError()).data;
    await reviewer.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [row, { ...row, review_round_id: second.id, minutes: 15 }] }).throwOnError();
    await reviewer.client.rpc("update_task_review", { p_task_id: taskId, p_action: "approved", p_round_id: second.id }).throwOnError();
    await assignee.client.from("tasks").update({ status: "completed" }).eq("id", taskId).throwOnError();
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
});
