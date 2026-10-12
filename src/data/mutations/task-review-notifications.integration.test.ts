import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../../../tests/helpers/task-review-fixture";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), resolveMembership: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.resolveMembership }));
import { getTaskReviewQueue } from "@/data/queries/task-reviews";
import { notificationFromRealtimeRow, unreadNotificationCount } from "@/lib/notifications";

describe("task review notification delivery", () => {
  let fixture: TaskReviewFixture;
  beforeAll(async () => { fixture = await createTaskReviewFixture(); }, 60_000);
  afterAll(async () => { if (fixture) await fixture.dispose(); });

  it("assigns an existing Internal Review task and notifies current reviewers through atomic edits", async () => {
    const { admin, assignee, reviewer, projectId } = fixture;
    const taskId = randomUUID();
    reviewSql(`insert into public.tasks(id,project_id,title,stage,status,assignee_id,created_by)
      values (${sqlId(taskId)},${sqlId(projectId)},'Existing Internal Review','stage_1','internal_review',${sqlId(assignee.id)},${sqlId(admin.id)});`);
    const notices = async () => (await Promise.all([reviewer, assignee, admin].map(account => account.client.from("notifications")
      .select("id,recipient_id,actor_id,metadata,created_at").eq("entity_id", taskId).eq("notification_type", "task_review_requested").throwOnError())))
      .flatMap(result => result.data).sort((left, right) => left.created_at.localeCompare(right.created_at));
    const edit = { title: "Existing Internal Review", description: null, assignee_id: assignee.id, priority: "normal", stage: "stage_1", progress_weight: 1 };
    const save = (reviewerIds: string[], context = {}, changes = {}) => admin.client.rpc("update_task_details_with_collaborators", {
      p_task_id: taskId, p_task: { ...edit, ...changes, reviewer_ids: reviewerIds, ...context }, p_collaborator_ids: [], p_deadlines: [],
    });
    await save([reviewer.id, assignee.id]).throwOnError();
    const first = (await admin.client.from("task_review_rounds").select("*").eq("task_id", taskId).single().throwOnError()).data;
    expect(first).toMatchObject({ reviewer_id: reviewer.id, round_number: 1, completed_at: null });
    expect((await notices()).map(row => row.recipient_id)).toEqual([reviewer.id]);
    expect((await admin.client.from("tasks").select("status").eq("id", taskId).single().throwOnError()).data.status).toBe("internal_review");
    const session = randomUUID();
    await reviewer.client.rpc("control_review_timer", { p_action: "start", p_session_id: session, p_round_ids: [first.id] }).throwOnError();
    reviewSql(`update public.review_timer_sessions set accounted_at=clock_timestamp()-interval '2 minutes' where id=${sqlId(session)};`);
    const originalContext = { review_round_id: first.id, review_reviewer_id: reviewer.id };
    // A metadata failure rolls back reassignment, its notification and timer checkpoint together.
    expect((await save([assignee.id, reviewer.id], originalContext, { priority: "invalid" })).error).not.toBeNull();
    expect(await notices()).toHaveLength(1);
    expect((await admin.client.from("review_timer_sessions").select("state").eq("id", session).single().throwOnError()).data.state).toBe("active");
    await save([assignee.id, reviewer.id], originalContext).throwOnError();
    expect((await notices()).map(row => row.recipient_id)).toEqual([reviewer.id, assignee.id]);
    expect((await admin.client.from("review_timer_sessions").select("state").eq("id", session).single().throwOnError()).data.state).toBe("completed");
    expect((await fixture.service.from("work_log_entries").select("user_id,minutes").eq("review_round_id", first.id).single().throwOnError()).data).toEqual({ user_id: reviewer.id, minutes: 2 });
    expect((await save([reviewer.id, assignee.id], originalContext)).error?.message).toContain("step is no longer active");
    const currentContext = { review_round_id: first.id, review_reviewer_id: assignee.id };
    await save([assignee.id, reviewer.id, admin.id], currentContext).throwOnError();
    expect(await notices()).toHaveLength(2);
    await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "approved", p_round_id: first.id, p_expected_reviewer_id: assignee.id }).throwOnError();
    expect((await notices()).map(row => row.recipient_id)).toEqual([reviewer.id, assignee.id, reviewer.id]);
    const approved = (await admin.client.from("task_review_round_reviewers").select("*").eq("round_id", first.id).eq("reviewer_id", assignee.id).single().throwOnError()).data;
    await save([assignee.id, reviewer.id], originalContext).throwOnError();
    expect(await notices()).toHaveLength(3);
    expect((await admin.client.from("task_review_round_reviewers").select("*").eq("round_id", first.id).eq("reviewer_id", assignee.id).single().throwOnError()).data).toEqual(approved);
    expect((await save([reviewer.id, assignee.id], originalContext)).error?.message).toContain("Preserve approved");
    expect((await admin.client.from("task_review_rounds").select("id,round_number").eq("task_id", taskId).throwOnError()).data).toEqual([{ id: first.id, round_number: 1 }]);
    await reviewer.client.rpc("update_task_review", { p_task_id: taskId, p_action: "approved", p_round_id: first.id, p_expected_reviewer_id: reviewer.id }).throwOnError();
  });

  it("notifies only the current reviewer on submit, handoff and resubmit; reading does not remove review work", async () => {
    const { admin, assignee, reviewer, outsider, taskId, projectId, studioId } = fixture;
    const notifications = async (client: typeof reviewer.client) => (await client.from("notifications")
      .select("*").eq("entity_id", taskId).eq("notification_type", "task_review_requested")
      .order("created_at").throwOnError()).data;
    const queueAs = async (account: typeof reviewer, systemRole = "employee") => {
      mocks.createClient.mockResolvedValue(account.client);
      mocks.resolveMembership.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { system_role: systemRole, studio_id: studioId, authenticatedUserId: account.id } });
      return getTaskReviewQueue();
    };
    await admin.client.rpc("update_task_review", { p_task_id: taskId, p_action: "configure", p_reviewer_ids: [reviewer.id, admin.id] }).throwOnError();
    expect(await notifications(reviewer.client)).toEqual([]);
    expect(await queueAs(reviewer)).toEqual([]);
    await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
    const [first] = await notifications(reviewer.client);
    const [round] = await queueAs(reviewer);
    if (!first || !round) throw new Error("Missing review request");
    expect(first).toMatchObject({ recipient_id: reviewer.id, actor_id: assignee.id, read_at: null,
      href: `/projects/${projectId}?task=${taskId}`, metadata: { roundId: round.id, roundNumber: 1, subject: "Review lifecycle task", projectName: "Review rounds project" } });
    const delivered = notificationFromRealtimeRow(first, reviewer.id);
    if (!delivered) throw new Error("Invalid realtime notification row");
    expect(unreadNotificationCount([delivered])).toBe(1);
    expect(await notifications(admin.client)).toEqual([]);
    expect(await notifications(assignee.client)).toEqual([]);
    expect(await notifications(outsider.client)).toEqual([]);
    // Invalid duplicate submissions do not emit another request.
    expect((await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" })).error).not.toBeNull();
    expect(await notifications(reviewer.client)).toHaveLength(1);
    await reviewer.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", first.id).throwOnError();
    expect((await notifications(reviewer.client))[0].read_at).not.toBeNull();
    expect((await queueAs(reviewer)).map((entry) => entry.id)).toEqual([round.id]);
    await reviewer.client.rpc("update_task_review", { p_task_id: taskId, p_action: "approved", p_round_id: round.id, p_expected_reviewer_id: reviewer.id }).throwOnError();
    expect(await queueAs(reviewer)).toEqual([]);
    const [handoff] = await notifications(admin.client);
    expect(handoff).toMatchObject({ recipient_id: admin.id, actor_id: reviewer.id, metadata: { roundId: round.id, roundNumber: 1 } });
    expect((await queueAs(admin, "admin"))[0].reviewer_id).toBe(admin.id);
    // A stale decision cannot create duplicate handoff messages.
    expect((await reviewer.client.rpc("update_task_review", { p_task_id: taskId, p_action: "approved", p_round_id: round.id, p_expected_reviewer_id: reviewer.id })).error).not.toBeNull();
    expect(await notifications(admin.client)).toHaveLength(1);
    await admin.client.rpc("update_task_review", { p_task_id: taskId, p_action: "rework", p_round_id: round.id, p_expected_reviewer_id: admin.id, p_comment: "Fix the plan" }).throwOnError();
    expect(await queueAs(reviewer)).toEqual([]);
    expect(await notifications(reviewer.client)).toHaveLength(1);
    await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
    const requests = await notifications(reviewer.client);
    expect(requests).toHaveLength(2);
    expect(requests[0].read_at).not.toBeNull();
    expect(requests[1]).toMatchObject({ read_at: null, metadata: { roundNumber: 2 } });
    const [round2] = await queueAs(reviewer);
    expect(round2.round_number).toBe(2);
    await reviewer.client.rpc("update_task_review", { p_task_id: taskId, p_action: "approved", p_round_id: round2.id, p_expected_reviewer_id: reviewer.id }).throwOnError();
    expect(await notifications(admin.client)).toHaveLength(2);
    await admin.client.rpc("update_task_review", { p_task_id: taskId, p_action: "approved", p_round_id: round2.id, p_expected_reviewer_id: admin.id }).throwOnError();
    expect(await queueAs(admin, "admin")).toEqual([]);
    expect(await notifications(admin.client)).toHaveLength(2);
    expect(await notifications(reviewer.client)).toHaveLength(2);
  });

  it("keeps source rollback, self-notification suppression and recipient privacy", async () => {
    const { admin, assignee, reviewer, fallbackTaskId } = fixture;
    await admin.client.rpc("update_task_review", { p_task_id: fallbackTaskId, p_action: "configure", p_reviewer_ids: [admin.id, reviewer.id] }).throwOnError();
    reviewSql(`insert into public.task_checklist_items(task_id,title) values (${sqlId(fallbackTaskId)},'Must complete before review');`);
    expect((await assignee.client.rpc("update_task_review", { p_task_id: fallbackTaskId, p_action: "submit" })).error).not.toBeNull();
    expect((await admin.client.from("notifications").select("id").eq("entity_id", fallbackTaskId).throwOnError()).data).toEqual([]);
    reviewSql(`update public.task_checklist_items set is_completed=true where task_id=${sqlId(fallbackTaskId)};`);
    // Ordinary status submission uses the same round trigger as the RPC.
    await admin.client.from("tasks").update({ status: "internal_review" }).eq("id", fallbackTaskId).throwOnError();
    expect((await admin.client.from("notifications").select("id").eq("entity_id", fallbackTaskId).throwOnError()).data).toEqual([]);
    expect((await reviewer.client.from("notifications").insert({ studio_id: fixture.studioId, recipient_id: reviewer.id, notification_type: "task_review_requested", title: "Forged", body: "Forged", href: "/my-tasks" })).error).not.toBeNull();
    expect((await reviewer.client.from("task_review_rounds").insert({ task_id: fallbackTaskId, project_id: fixture.projectId, round_number: 2, reviewer_id: reviewer.id })).error).not.toBeNull();
    const { data: round } = await admin.client.from("task_review_rounds").select("id").eq("task_id", fallbackTaskId).single().throwOnError();
    // An inactive recipient is skipped without aborting the source transition.
    await fixture.service.from("profiles").update({ is_active: false }).eq("id", reviewer.id).throwOnError();
    await admin.client.rpc("update_task_review", { p_task_id: fallbackTaskId, p_action: "approved", p_round_id: round.id, p_expected_reviewer_id: admin.id }).throwOnError();
    expect((await fixture.service.from("task_review_rounds").select("reviewer_id").eq("id", round.id).single().throwOnError()).data.reviewer_id).toBe(reviewer.id);
    expect(reviewSql(`select count(*) from public.notifications where entity_id=${sqlId(fallbackTaskId)} and notification_type='task_review_requested';`)).toBe("0");
  });
});
