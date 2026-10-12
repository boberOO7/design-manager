import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../../../tests/helpers/task-review-fixture";
import { completedReviewCredits, completedReviewSessions } from "@/lib/work-log";

const mocks = vi.hoisted(() => ({ client: vi.fn(), membership: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.membership }));
import { getTaskReviewQueue } from "@/data/queries/task-reviews";
import { getDailyWorkLog, getEmployeeWorkStatistics } from "@/data/queries/work-log";

describe("review assignment and shared work sessions", () => {
  let fixture: TaskReviewFixture;
  beforeAll(async () => { fixture = await createTaskReviewFixture(); }, 60_000);
  afterAll(async () => { if (fixture) await fixture.dispose(); });

  async function createRound(reviewerIds: string[], stage = "stage_1") {
    const taskId = randomUUID();
    reviewSql(`insert into public.tasks(id,project_id,title,stage,status,assignee_id,created_by)
      values (${sqlId(taskId)},${sqlId(fixture.projectId)},'Review improvements','${stage}','in_progress',${sqlId(fixture.assignee.id)},${sqlId(fixture.admin.id)});`);
    await fixture.admin.client.rpc("update_task_review", { p_task_id: taskId, p_action: "configure", p_reviewer_ids: reviewerIds }).throwOnError();
    await fixture.assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
    const round = (await fixture.admin.client.from("task_review_rounds").select("id").eq("task_id", taskId).single().throwOnError()).data;
    return { id: round.id, taskId };
  }
  function useAccount(account: TaskReviewFixture["admin"]) {
    mocks.client.mockResolvedValue(account.client);
    mocks.membership.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: {
      studio_id: fixture.studioId, authenticatedUserId: account.id, system_role: account.id === fixture.admin.id ? "admin" : "employee",
    } });
  }
  const start = async (account: TaskReviewFixture["admin"], roundIds: string[]): Promise<string> => {
    const id = randomUUID();
    await account.client.rpc("control_review_timer", { p_action: "start", p_session_id: id, p_round_ids: roundIds }).throwOnError();
    return id;
  };
  const backdate = (id: string, minutes: number) => reviewSql(`update public.review_timer_sessions set accounted_at=clock_timestamp()-interval '${minutes} minutes' where id=${sqlId(id)};`);
  const readSessions = async (account: TaskReviewFixture["admin"]) => (await account.client.from("review_timer_sessions")
    .select("id,work_session_id,user_id,state,elapsed_us,members:review_timer_members(round_id,finished_at)").eq("user_id", account.id).throwOnError()).data;

  it("filters admin and employee personal queues to their current steps, preserving management reads", async () => {
    const { admin, reviewer } = fixture;
    const futureAdmin = await createRound([reviewer.id, admin.id]);
    const currentAdmin = await createRound([admin.id, reviewer.id]);
    useAccount(admin);
    expect((await getTaskReviewQueue()).map(row => row.id)).toEqual([currentAdmin.id]);
    expect((await admin.client.from("task_review_rounds").select("id").in("id", [futureAdmin.id, currentAdmin.id]).throwOnError()).data).toHaveLength(2);
    useAccount(reviewer);
    expect((await getTaskReviewQueue()).map(row => row.id)).toEqual([futureAdmin.id]);
    expect((await reviewer.client.rpc("control_review_timer", { p_action: "start", p_session_id: randomUUID(), p_round_ids: [currentAdmin.id] })).error).not.toBeNull();
    await admin.client.rpc("update_task_review", { p_task_id: currentAdmin.taskId, p_action: "approved", p_round_id: currentAdmin.id, p_expected_reviewer_id: admin.id }).throwOnError();
    expect((await getTaskReviewQueue()).map(row => row.id)).toEqual([futureAdmin.id, currentAdmin.id]);
    useAccount(admin);
    expect(await getTaskReviewQueue()).toEqual([]);
  });

  it("adds a subsequent reviewer, replaces the current reviewer, and preserves decisions, timers and Work Log attribution", async () => {
    const { reviewer, admin, assignee, outsider } = fixture;
    const round = await createRound([reviewer.id, admin.id]);
    const reassign = (account: typeof admin, ids: string[], expected = reviewer.id) => account.client.rpc("update_task_review", {
      p_task_id: round.taskId, p_action: "reassign", p_round_id: round.id, p_expected_reviewer_id: expected, p_reviewer_ids: ids,
    });
    const first = await start(reviewer, [round.id]);
    backdate(first, 2);
    expect((await reassign(outsider, [admin.id])).error).not.toBeNull();
    expect((await reassign(admin, [reviewer.id, outsider.id])).error).not.toBeNull();
    await reassign(admin, [reviewer.id, admin.id, assignee.id]).throwOnError();
    expect((await readSessions(reviewer)).find(session => session.id === first)?.state).toBe("active");
    await reviewer.client.rpc("update_task_review", { p_task_id: round.taskId, p_action: "approved", p_round_id: round.id, p_expected_reviewer_id: reviewer.id }).throwOnError();
    const approved = (await admin.client.from("task_review_round_reviewers").select("*").eq("round_id", round.id).eq("reviewer_id", reviewer.id).single().throwOnError()).data;
    useAccount(reviewer);
    expect(await getEmployeeWorkStatistics(fixture.studioId, reviewer.id)).toMatchObject({ reviewsCompleted: 1, reviewSessionsCompleted: 1 });
    const outgoing = await start(admin, [round.id]);
    backdate(outgoing, 3);
    expect((await reassign(admin, [assignee.id], admin.id)).error?.message).toContain("Preserve approved");
    expect((await reassign(admin, [reviewer.id], admin.id)).error).not.toBeNull();
    await reassign(admin, [reviewer.id, assignee.id], admin.id).throwOnError();
    expect((await admin.client.from("task_review_round_reviewers").select("*").eq("round_id", round.id).eq("reviewer_id", reviewer.id).single().throwOnError()).data).toEqual(approved);
    expect((await readSessions(admin)).find(session => session.id === outgoing)).toMatchObject({ state: "completed", elapsed_us: expect.any(Number) });
    expect((await admin.client.from("tasks").select("status").eq("id", round.taskId).single().throwOnError()).data.status).toBe("internal_review");
    expect((await reassign(admin, [reviewer.id, admin.id], admin.id)).error?.message).toContain("step is no longer active");
    expect((await admin.client.rpc("update_task_review", { p_task_id: round.taskId, p_action: "approved", p_round_id: round.id, p_expected_reviewer_id: admin.id })).error).not.toBeNull();
    const incoming = await start(assignee, [round.id]);
    backdate(incoming, 4);
    await assignee.client.rpc("update_task_review", { p_task_id: round.taskId, p_action: "approved", p_round_id: round.id, p_expected_reviewer_id: assignee.id }).throwOnError();
    const closed = (await admin.client.from("task_review_rounds").select("id,reviewer_id,result,completed_at,reviewers:task_review_round_reviewers(reviewer_id,approved_at)").eq("id", round.id).single().throwOnError()).data;
    expect(completedReviewCredits([closed]).map(row => row.userId).sort()).toEqual([reviewer.id, assignee.id].sort());
    const logs = (await fixture.service.from("work_log_entries").select("user_id,minutes").eq("review_round_id", round.id).throwOnError()).data;
    expect(logs.sort((a, b) => a.minutes-b.minutes)).toEqual([{ user_id: reviewer.id, minutes: 2 }, { user_id: admin.id, minutes: 3 }, { user_id: assignee.id, minutes: 4 }]);
    useAccount(admin);
    const date = reviewSql("select (clock_timestamp() at time zone 'Europe/Kyiv')::date;");
    const workLog = await getDailyWorkLog(date);
    expect(workLog?.rows.find(row => row.review_round_id === round.id)).toMatchObject({ minutes: 3, roundNumber: 1 });
    expect((await admin.client.from("project_activity").select("changes").eq("entity_id", round.taskId).throwOnError()).data.filter(row =>
      row.changes && typeof row.changes === "object" && !Array.isArray(row.changes) && row.changes.review_action === "reassigned")).toHaveLength(2);
  });

  it("starts one exact shared subset, resumes without duplicate counts, and allocates each reviewer's own work", async () => {
    const { reviewer, admin } = fixture;
    const rounds: Awaited<ReturnType<typeof createRound>>[] = [];
    for (let index = 0; index < 10; index++) rounds.push(await createRound([reviewer.id, admin.id]));
    const excluded = await createRound([reviewer.id]);
    const wrongStage = await createRound([reviewer.id], "stage_2");
    expect((await reviewer.client.rpc("control_review_timer", { p_action: "start", p_session_id: randomUUID(), p_round_ids: [rounds[0].id, wrongStage.id] })).error?.message).toContain("one project and stage");
    const ids = rounds.map(round => round.id);
    const first = await start(reviewer, ids);
    backdate(first, 10);
    await reviewer.client.rpc("control_review_timer", { p_action: "pause", p_session_id: first }).throwOnError();
    expect(completedReviewSessions(await readSessions(reviewer)).some(session => session.sessionId === first)).toBe(false);
    const resumed = await start(reviewer, ids);
    backdate(resumed, 20);
    expect((await readSessions(reviewer)).filter(session => [first, resumed].includes(session.id)).map(session => session.work_session_id)).toEqual([first, first]);
    expect((await readSessions(reviewer)).filter(session => session.state === "active")).toHaveLength(1);
    await reviewer.client.rpc("update_task_review", { p_task_id: rounds[0].taskId, p_action: "approved", p_round_id: rounds[0].id, p_expected_reviewer_id: reviewer.id }).throwOnError();
    const remaining = await start(reviewer, ids.slice(1));
    backdate(remaining, 9);
    expect((await readSessions(reviewer)).find(session => session.id === remaining)?.work_session_id).toBe(first);
    for (const round of rounds.slice(1)) await reviewer.client.rpc("update_task_review", { p_task_id: round.taskId, p_action: "approved", p_round_id: round.id, p_expected_reviewer_id: reviewer.id }).throwOnError();
    expect(completedReviewSessions(await readSessions(reviewer)).filter(session => session.sessionId === first)).toHaveLength(1);
    const reviewerLogs = (await fixture.service.from("work_log_entries").select("minutes,review_round_id,user_id").in("review_round_id", ids).eq("user_id", reviewer.id).throwOnError()).data;
    expect(reviewerLogs).toHaveLength(10);
    expect(reviewerLogs.find(row => row.review_round_id === ids[0])?.minutes).toBe(3);
    expect(reviewerLogs.filter(row => row.review_round_id !== ids[0]).map(row => row.minutes)).toEqual(Array(9).fill(4));
    expect((await fixture.service.from("review_timer_daily").select("round_id").eq("round_id", excluded.id).throwOnError()).data).toEqual([]);
    const management = await start(admin, ids);
    backdate(management, 20);
    for (const round of rounds) await admin.client.rpc("update_task_review", { p_task_id: round.taskId, p_action: "approved", p_round_id: round.id, p_expected_reviewer_id: admin.id }).throwOnError();
    const adminLogs = (await fixture.service.from("work_log_entries").select("minutes").in("review_round_id", ids).eq("user_id", admin.id).throwOnError()).data;
    expect(adminLogs.map(row => row.minutes)).toEqual(Array(10).fill(2));
    const completed = (await admin.client.from("task_review_rounds").select("id,reviewer_id,result,completed_at,reviewers:task_review_round_reviewers(reviewer_id,approved_at)").in("id", ids).throwOnError()).data;
    expect(completedReviewCredits(completed).filter(row => row.userId === reviewer.id)).toHaveLength(10);
    expect(completedReviewCredits(completed).filter(row => row.userId === admin.id)).toHaveLength(10);
    expect(completedReviewSessions(await readSessions(admin)).filter(session => session.sessionId === management)).toHaveLength(1);
  }, 30_000);
});
