import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../../../tests/helpers/task-review-fixture";
import { backdateWorkLogProject } from "../../../tests/helpers/work-log-fixture";
import { instantToDateOnly, addCalendarDays } from "@/lib/calendar";
import { summarizeLoggedTime } from "@/lib/work-log";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), resolve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.resolve }));
import { getDailyWorkLog, getEmployeeWorkStatistics, getWeeklyWorkLog } from "@/data/queries/work-log";

describe("Work Log internal activities and conservative suggestions", () => {
  let fixture: TaskReviewFixture;
  const today = instantToDateOnly(new Date().toISOString());
  beforeEach(async () => { fixture = await createTaskReviewFixture(); }, 60_000);
  afterEach(async () => { if (fixture) await fixture.dispose(); });
  function scope(account: TaskReviewFixture["admin"], admin = false) {
    mocks.createClient.mockResolvedValue(account.client);
    mocks.resolve.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { studio_id: fixture.studioId,
      authenticatedUserId: account.id, joined_at: "2026-05-01T00:00:00Z", system_role: admin ? "admin" : "employee" } });
  }
  const internal = { activity_kind: "internal", internal_activity_type: "team_walkthrough", task_id: null, review_round_id: null, minutes: 45 };

  it("allows only active admins to create, reopen, edit and remove internal time", async () => {
    const { admin, assignee, outsider } = fixture;
    for (const account of [assignee, outsider]) {
      expect((await account.client.rpc("save_daily_work_log", { p_work_date: today, p_entries: [internal] })).error?.message).toContain("administrators");
    }
    await admin.client.rpc("save_daily_work_log", { p_work_date: today, p_entries: [internal], p_timer_snapshot: {} }).throwOnError();
    scope(admin, true);
    expect((await getDailyWorkLog(today))?.canLogInternalWork).toBe(true);
    expect((await getDailyWorkLog(today))?.rows).toContainEqual(expect.objectContaining({ ...internal, projectId: null, stage: null }));
    const row = (await admin.client.from("work_log_entries").select("id,minutes").eq("activity_kind", "internal").single().throwOnError()).data;
    expect((await assignee.client.from("work_log_entries").select("id").eq("id", row.id).throwOnError()).data).toEqual([]);
    expect((await outsider.client.from("work_log_entries").select("id").eq("id", row.id).throwOnError()).data).toEqual([]);
    expect((await assignee.client.from("work_log_entries").insert({ studio_id: fixture.studioId, user_id: assignee.id, work_date: today, ...internal })).error).not.toBeNull();
    expect((await admin.client.from("work_log_entries").update({ minutes: 999 }).eq("id", row.id)).error).not.toBeNull();
    expect((await admin.client.rpc("save_daily_work_log", { p_work_date: today, p_entries: [{ ...internal, task_id: fixture.taskId }] })).error).not.toBeNull();
    expect((await admin.client.rpc("save_daily_work_log", { p_work_date: today, p_entries: [{ ...internal, internal_activity_type: "unknown" }] })).error).not.toBeNull();
    expect((await admin.client.rpc("save_daily_work_log", { p_work_date: today, p_entries: [internal, internal], p_timer_snapshot: {} })).error).not.toBeNull();
    await admin.client.rpc("save_daily_work_log", { p_work_date: today, p_entries: [{ ...internal, minutes: 90 }], p_timer_snapshot: {} }).throwOnError();
    expect((await admin.client.from("work_log_entries").select("id,minutes").eq("activity_kind", "internal").single().throwOnError()).data).toEqual({ id: row.id, minutes: 90 });
    expect(await getEmployeeWorkStatistics(fixture.studioId, admin.id)).toMatchObject({ internalMinutes: 90, totalMinutes: 90, taskMinutes: 0, reviewMinutes: 0, reviewsCompleted: 0 });
    expect((await getWeeklyWorkLog(today))?.totals).toMatchObject({ internalMinutes: 90, totalMinutes: 90 });
    expect(reviewSql(`select count(*) from public.work_log_entries w join public.tasks t on t.id=w.task_id where w.id=${sqlId(row.id)};`)).toBe("0");

    // Demotion hides privileged history even through the definer snapshot; saving
    // an empty ordinary day must not delete that hidden history.
    reviewSql(`update public.studio_members set system_role='employee' where user_id=${sqlId(admin.id)};`);
    try {
      expect((await admin.client.from("work_log_entries").select("id").eq("id", row.id).throwOnError()).data).toEqual([]);
      scope(admin);
      expect((await getDailyWorkLog(today))?.rows).toEqual([]);
      expect((await admin.client.rpc("save_daily_work_log", { p_work_date: today, p_entries: [internal] })).error).not.toBeNull();
      await admin.client.rpc("save_daily_work_log", { p_work_date: today, p_entries: [] }).throwOnError();
      expect(reviewSql(`select minutes from public.work_log_entries where id=${sqlId(row.id)};`)).toBe("90");
    } finally {
      reviewSql(`update public.studio_members set system_role='admin' where user_id=${sqlId(admin.id)};`);
    }
    scope(admin, true);
    await admin.client.rpc("save_daily_work_log", { p_work_date: today, p_entries: [], p_timer_snapshot: {} }).throwOnError();
    const day = await getDailyWorkLog(today);
    expect(day?.rows).toEqual([]);
    expect(day?.submittedAt).toBeTruthy();
    expect((await getWeeklyWorkLog(today))?.days.find(day => day.date === today)).toMatchObject({ internalMinutes: 0, totalMinutes: 0, missing: false });
  });

  it("suppresses today's administrative entry of a historical completed project and preserves manual history", async () => {
    const { admin, taskId } = fixture;
    backdateWorkLogProject(fixture);
    scope(admin, true);
    expect((await getDailyWorkLog(today))?.rows).toEqual([]);
    expect((await getDailyWorkLog("2026-05-20"))?.rows).toEqual([]);
    expect((await getDailyWorkLog(today))?.activeTasks.some(task => task.id === taskId)).toBe(true); // Explicit manual choice.
    const row = { activity_kind: "task", task_id: taskId, review_round_id: null, minutes: 75 };
    await admin.client.rpc("save_daily_work_log", { p_work_date: "2026-05-20", p_entries: [row] }).throwOnError();
    const before = (await admin.client.from("work_log_entries").select("id,created_at,updated_at,minutes").eq("work_date", "2026-05-20").single().throwOnError()).data;
    expect((await getDailyWorkLog("2026-05-20"))?.rows).toContainEqual(expect.objectContaining(row));
    await getDailyWorkLog(today);
    expect((await admin.client.from("work_log_entries").select("id,created_at,updated_at,minutes").eq("work_date", "2026-05-20").single().throwOnError()).data).toEqual(before);
    await admin.client.rpc("save_daily_work_log", { p_work_date: "2026-05-20", p_entries: [{ ...row, minutes: 90 }] }).throwOnError();
    expect((await getDailyWorkLog("2026-05-20"))?.rows[0].minutes).toBe(90);
  });

  it("uses genuine actor-owned workflow/progress and excludes metadata/backdated task corrections", async () => {
    const { admin, assignee, projectId, taskId, fallbackTaskId } = fixture;
    await assignee.client.from("tasks").update({ status: "completed" }).eq("id", taskId).throwOnError();
    scope(assignee);
    expect((await getDailyWorkLog(today))?.rows.some(row => row.task_id === taskId)).toBe(true);
    reviewSql(`begin; select set_config('request.jwt.claim.sub','${admin.id}',true);
      update public.tasks set completed_at='2026-05-20' where id=${sqlId(taskId)}; commit;`);
    expect((await getDailyWorkLog(today))?.rows.some(row => row.task_id === taskId)).toBe(false);
    await assignee.client.from("tasks").update({ status: "todo" }).eq("id", fallbackTaskId).throwOnError();
    // Give only the title edit today's timestamp; the previous workflow is yesterday.
    reviewSql(`update public.project_activity set created_at=now()-interval '1 day' where project_id=${sqlId(projectId)};`);
    reviewSql(`begin; select set_config('request.jwt.claim.sub','${admin.id}',true);
      update public.tasks set title='Metadata-only correction',description='Historical import details' where id=${sqlId(fallbackTaskId)}; commit;`);
    expect((await getDailyWorkLog(today))?.rows).toEqual([]);
    await assignee.client.from("tasks").update({ status: "in_progress" }).eq("id", fallbackTaskId).throwOnError();
    expect((await getDailyWorkLog(today))?.rows.some(row => row.task_id === fallbackTaskId)).toBe(true);
    expect((await getDailyWorkLog(addCalendarDays(today, -3)))?.rows).toEqual([]);
    scope(admin, true);
    expect((await getDailyWorkLog(today))?.rows).toEqual([]); // Colleague's workflow is not admin work.
  });

  it("suggests reviews from actual decisions/timers, never assignment or an admin approving for someone else", async () => {
    const { admin, assignee, reviewer, taskId, fallbackTaskId } = fixture;
    for (const id of [taskId, fallbackTaskId]) {
      await admin.client.rpc("update_task_review", { p_task_id: id, p_action: "configure", p_reviewer_ids: [reviewer.id] }).throwOnError();
      await assignee.client.rpc("update_task_review", { p_task_id: id, p_action: "submit" }).throwOnError();
    }
    const rounds = (await reviewer.client.from("task_review_rounds").select("id,task_id").in("task_id", [taskId, fallbackTaskId]).throwOnError()).data;
    const first = rounds.find(row => row.task_id === taskId), second = rounds.find(row => row.task_id === fallbackTaskId);
    if (!first || !second) throw new Error("Review rounds required");
    scope(reviewer);
    expect((await getDailyWorkLog(today))?.rows).toEqual([]);
    await admin.client.rpc("update_task_review", { p_task_id: taskId, p_round_id: first.id, p_action: "approved" }).throwOnError();
    expect((await getDailyWorkLog(today))?.rows).toEqual([]);
    await reviewer.client.rpc("control_review_timer", { p_action: "start", p_session_id: randomUUID(), p_round_ids: [second.id] }).throwOnError();
    expect((await getDailyWorkLog(today))?.rows).toContainEqual(expect.objectContaining({ review_round_id: second.id, minutes: 0 }));
    await reviewer.client.rpc("update_task_review", { p_task_id: fallbackTaskId, p_round_id: second.id, p_action: "rework", p_comment: "Actual reviewer decision" }).throwOnError();
    expect((await getDailyWorkLog(today))?.rows).toContainEqual(expect.objectContaining({ activity_kind: "review", review_round_id: second.id }));
    expect(summarizeLoggedTime((await getDailyWorkLog(today))?.rows ?? []).taskMinutes).toBe(0);
    expect((await getDailyWorkLog(addCalendarDays(today, 1)))?.rows).toEqual([]);
  });
});
