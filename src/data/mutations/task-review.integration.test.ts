import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../../../tests/helpers/task-review-fixture";
import { getActiveTaskReview, getLatestTaskReview, isTaskInRework } from "@/lib/task-reviews";
import { taskReviewActionSchema } from "@/lib/validation/task-review";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), resolveMembership: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.resolveMembership }));
import { getTaskReviewQueue } from "@/data/queries/task-reviews";
import { bulkUpdateTaskReviewMutation, updateTaskReviewMutation } from "./task-review";
import { getProjectTaskById } from "@/data/queries/tasks";

describe("persisted task review lifecycle", () => {
  let fixture: TaskReviewFixture;
  beforeAll(async () => { fixture = await createTaskReviewFixture(); }, 60_000);
  afterAll(async () => { if (fixture) await fixture.dispose(); });

  it("submits, requires rework context, resubmits as #2, and approves into client review", async () => {
    const { admin, assignee, reviewer, outsider, taskId, projectId, studioId } = fixture;
    const action = (client: typeof admin.client, p_action: string, rest = {}) => client.rpc("update_task_review", { p_task_id: taskId, p_action, ...rest });
    const read = async () => {
      const task = await assignee.client.from("tasks").select("status").eq("id", taskId).single().throwOnError();
      const rounds = await assignee.client.from("task_review_rounds").select("*, reviewer:profiles!task_review_rounds_reviewer_id_fkey(id, full_name, job_title)").eq("task_id", taskId).order("round_number").throwOnError();
      return { status: task.data.status, review_rounds: rounds.data };
    };
    expect((await action(assignee.client, "configure", { p_requires_review: true, p_reviewer_id: reviewer.id })).error).not.toBeNull();
    expect((await action(admin.client, "configure", { p_requires_review: true, p_reviewer_id: outsider.id })).error).not.toBeNull();
    expect((await action(admin.client, "configure", { p_requires_review: true, p_reviewer_id: reviewer.id })).error).toBeNull();
    expect((await assignee.client.from("tasks").update({ status: "review" }).eq("id", taskId)).error).not.toBeNull();
    mocks.createClient.mockResolvedValue(assignee.client);
    mocks.resolveMembership.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { system_role: "employee", studio_id: studioId, authenticatedUserId: assignee.id } });
    const submitted = await updateTaskReviewMutation(taskId, { action: "submit" });
    expect(submitted.success).toBe(true);
    if (!submitted.success) throw new Error(submitted.formError);
    expect(submitted.task.reviewer?.id).toBe(reviewer.id);
    expect(getActiveTaskReview(submitted.task)?.round_number).toBe(1);
    const first = await read();
    const active = getActiveTaskReview(first);
    expect(first.status).toBe("internal_review");
    expect(first.review_rounds).toHaveLength(1);
    expect(active?.round_number).toBe(1);
    if (!active) throw new Error("Missing first review");
    expect((await action(assignee.client, "submit")).error).not.toBeNull();
    expect((await action(assignee.client, "approved", { p_round_id: active.id })).error).not.toBeNull();
    expect((await action(outsider.client, "approved", { p_round_id: active.id })).error).not.toBeNull();
    expect((await outsider.client.from("task_review_rounds").select("id").eq("task_id", taskId)).data).toEqual([]);
    expect((await reviewer.client.from("task_review_rounds").update({ result: "approved" }).eq("id", active.id)).error).not.toBeNull();
    expect((await assignee.client.from("tasks").update({ status: "in_progress" }).eq("id", taskId)).error).not.toBeNull();
    expect((await admin.client.rpc("bulk_move_project_tasks", { p_project_id: projectId, p_stage: "stage_1", p_source_statuses: ["internal_review"], p_target_status: "completed", p_task_ids: [taskId] })).error).not.toBeNull();
    expect((await action(reviewer.client, "rework", { p_round_id: active.id, p_comment: "  " })).error).not.toBeNull();
    expect(taskReviewActionSchema.safeParse({ action: "rework", round_id: active.id, comment: "  " }).success).toBe(false);
    expect((await action(reviewer.client, "rework", { p_round_id: active.id, p_comment: "  Fix the drawings  " })).error).toBeNull();
    const returned = await read();
    expect(returned.status).toBe("in_progress");
    expect(isTaskInRework(returned)).toBe(true);
    expect(getLatestTaskReview(returned)?.rework_comment).toBe("Fix the drawings");
    expect(returned.review_rounds[0].completed_at).not.toBeNull();
    expect((await assignee.client.from("tasks").update({ status: "completed" }).eq("id", taskId)).error).not.toBeNull();
    expect((await action(assignee.client, "submit")).error).toBeNull();
    const second = await read();
    const round2 = getActiveTaskReview(second);
    expect(second.review_rounds).toHaveLength(2);
    expect(round2?.round_number).toBe(2);
    expect(second.review_rounds[0]).toEqual(returned.review_rounds[0]);
    if (!round2) throw new Error("Missing second review");
    expect((await action(reviewer.client, "approved", { p_round_id: active.id })).error).not.toBeNull();

    mocks.createClient.mockResolvedValue(reviewer.client);
    mocks.resolveMembership.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { system_role: "employee", studio_id: studioId, authenticatedUserId: reviewer.id } });
    const queue = await getTaskReviewQueue();
    expect(queue.map((round) => [round.task.id, round.round_number])).toEqual([[taskId, 2]]);
    expect((await action(reviewer.client, "approved", { p_round_id: round2.id })).error).toBeNull();
    const approved = await read();
    expect(approved.status).toBe("review");
    expect(getActiveTaskReview(approved)).toBeNull();
    expect(approved.review_rounds.map((round) => round.result)).toEqual(["rework", "approved"]);
    expect(approved.review_rounds[0]).toEqual(returned.review_rounds[0]);
    expect(await getTaskReviewQueue()).toEqual([]);
  });

  it("uses the next enabled step and keeps the checklist guard and queue ordering", async () => {
    const { admin, assignee, reviewer, taskId, fallbackTaskId, studioId } = fixture;
    await admin.client.rpc("update_task_review", { p_task_id: fallbackTaskId, p_action: "configure", p_requires_review: true, p_reviewer_id: reviewer.id }).throwOnError();
    reviewSql(`insert into public.task_checklist_items(task_id,title) values (${sqlId(fallbackTaskId)},'Resolve before review');`);
    const rejected = await assignee.client.rpc("update_task_review", { p_task_id: fallbackTaskId, p_action: "submit" });
    expect(rejected.error?.message).toContain("Complete every checklist item");
    reviewSql(`update public.task_checklist_items set is_completed=true where task_id=${sqlId(fallbackTaskId)};`);
    await assignee.client.rpc("update_task_review", { p_task_id: fallbackTaskId, p_action: "submit" }).throwOnError();
    // A reopened approved task must have another review, and the older normal
    // priority task stays ahead of the newly submitted high priority task.
    await assignee.client.from("tasks").update({ status: "in_progress" }).eq("id", taskId).throwOnError();
    await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
    mocks.createClient.mockResolvedValue(reviewer.client);
    mocks.resolveMembership.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { system_role: "employee", studio_id: studioId, authenticatedUserId: reviewer.id } });
    const queue = await getTaskReviewQueue();
    expect(queue.map((round) => round.task.id)).toEqual([fallbackTaskId, taskId]);
    const fallback = queue.find((round) => round.task.id === fallbackTaskId);
    if (!fallback) throw new Error("Missing fallback review");
    await reviewer.client.rpc("update_task_review", { p_task_id: fallbackTaskId, p_action: "approved", p_round_id: fallback.id }).throwOnError();
    const result = await assignee.client.from("tasks").select("status").eq("id", fallbackTaskId).single().throwOnError();
    expect(result.data.status).toBe("completed");
  });

  it("saves task fields and the ordered reviewer sequence atomically, including clearing review", async () => {
    const { admin, assignee, reviewer, outsider, projectId } = fixture;
    const taskId = randomUUID();
    reviewSql(`insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by) values
      (${sqlId(taskId)},${sqlId(projectId)},'Atomic review settings','stage_1','in_progress','normal',${sqlId(assignee.id)},${sqlId(admin.id)});`);
    const edit = { title: "Edited task", description: "Updated together", assignee_id: assignee.id, priority: "high", stage: "stage_1", progress_weight: 1 };
    const save = (reviewerIds: string[], fields = edit) => admin.client.rpc("update_task_details_with_collaborators", {
      p_task_id: taskId, p_task: { ...fields, reviewer_ids: reviewerIds }, p_collaborator_ids: [], p_deadlines: [],
    });
    const read = async () => (await admin.client.from("tasks").select("title, description, priority, stage, requires_review, reviewer_id").eq("id", taskId).single().throwOnError()).data;
    expect((await save([reviewer.id, admin.id])).error).toBeNull();
    expect(await read()).toMatchObject({ title: edit.title, description: edit.description, priority: "high", requires_review: true, reviewer_id: reviewer.id });
    const saved = await read();
    expect((await save([reviewer.id, outsider.id], { ...edit, title: "Must roll back" })).error).not.toBeNull();
    expect(await read()).toEqual(saved);
    expect((await save([reviewer.id, reviewer.id], { ...edit, title: "Duplicate" })).error).not.toBeNull();
    expect(await read()).toEqual(saved);
    expect((await save([], { ...edit, priority: "invalid" })).error).not.toBeNull();
    expect(await read()).toEqual(saved);
    expect((await admin.client.from("task_reviewers").select("reviewer_id, position").eq("task_id", taskId).order("position").throwOnError()).data)
      .toEqual([{ reviewer_id: reviewer.id, position: 0 }, { reviewer_id: admin.id, position: 1 }]);
    expect((await outsider.client.from("task_reviewers").select("task_id").eq("task_id", taskId)).data).toEqual([]);
    expect((await reviewer.client.from("task_reviewers").delete().eq("task_id", taskId)).error).not.toBeNull();
    // Clearing the sequence also allows moving to a stage without review.
    reviewSql(`update public.project_task_stage_columns set enabled_statuses=array['todo','in_progress','completed'] where project_id=${sqlId(projectId)} and stage='stage_3';`);
    expect((await save([], { ...edit, stage: "stage_3" })).error).toBeNull();
    expect(await read()).toMatchObject({ stage: "stage_3", requires_review: false, reviewer_id: null });
    expect((await admin.client.from("task_reviewers").select("reviewer_id").eq("task_id", taskId)).data).toEqual([]);
  });

  it("reviews sequentially, returns the whole round for rework, and restarts the sequence in round #2", async () => {
    const { admin, assignee, reviewer, outsider, projectId, studioId } = fixture;
    const taskId = randomUUID();
    reviewSql(`insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by) values
      (${sqlId(taskId)},${sqlId(projectId)},'Sequential review','stage_1','in_progress','normal',${sqlId(assignee.id)},${sqlId(admin.id)});`);
    const edit = { title: "Sequential review", assignee_id: assignee.id, priority: "normal", stage: "stage_1", progress_weight: 1 };
    const save = (reviewerIds: string[], title = edit.title) => admin.client.rpc("update_task_details_with_collaborators", { p_task_id: taskId, p_task: { ...edit, title, reviewer_ids: reviewerIds } });
    await save([reviewer.id, admin.id]).throwOnError();
    const action = (client: typeof admin.client, p_action: string, rest = {}) => client.rpc("update_task_review", { p_task_id: taskId, p_action, ...rest });
    const read = async () => {
      mocks.createClient.mockResolvedValue(assignee.client);
      const task = await getProjectTaskById(taskId);
      if (!task) throw new Error("Missing sequential task");
      return task;
    };
    const queueFor = async (account: typeof admin, role: "admin" | "employee") => {
      mocks.createClient.mockResolvedValue(account.client);
      mocks.resolveMembership.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { system_role: role, studio_id: studioId, authenticatedUserId: account.id } });
      return (await getTaskReviewQueue()).filter((round) => round.task.id === taskId);
    };
    await action(assignee.client, "submit").throwOnError();
    const firstTask = await read();
    const first = getActiveTaskReview(firstTask);
    if (!first) throw new Error("Missing first sequential round");
    expect(firstTask.reviewers?.map((step) => step.reviewer_id).sort()).toEqual([admin.id, reviewer.id].sort());
    expect(first.reviewer_id).toBe(reviewer.id);
    expect((await outsider.client.from("task_review_round_reviewers").select("round_id").eq("round_id", first.id)).data).toEqual([]);
    expect((await reviewer.client.from("task_review_round_reviewers").update({ approved_at: new Date().toISOString() }).eq("round_id", first.id)).error).not.toBeNull();
    expect((await save([admin.id, reviewer.id], "Must roll back")).error).not.toBeNull();
    expect((await read()).title).toBe(edit.title);
    await save([reviewer.id, admin.id], "General edit during review").throwOnError();
    expect((await read()).title).toBe("General edit during review");
    expect((await action(assignee.client, "approved", { p_round_id: first.id, p_expected_reviewer_id: reviewer.id })).error).not.toBeNull();
    expect((await action(admin.client, "approved", { p_round_id: first.id })).error?.message).toContain("step is no longer active");
    const decisions = await Promise.all([
      action(reviewer.client, "approved", { p_round_id: first.id, p_expected_reviewer_id: reviewer.id }),
      action(reviewer.client, "approved", { p_round_id: first.id, p_expected_reviewer_id: reviewer.id }),
    ]);
    expect(decisions.filter((decision) => !decision.error)).toHaveLength(1);
    const forwardedTask = await read();
    const forwarded = getActiveTaskReview(forwardedTask);
    expect(forwardedTask.status).toBe("internal_review");
    expect(forwarded).toMatchObject({ id: first.id, round_number: 1, reviewer_id: admin.id, result: null, completed_at: null });
    expect(forwarded?.reviewers?.find((step) => step.reviewer_id === reviewer.id)?.approved_at).not.toBeNull();
    expect(forwarded?.reviewers?.find((step) => step.reviewer_id === admin.id)?.approved_at).toBeNull();
    expect(await queueFor(reviewer, "employee")).toEqual([]);
    expect((await queueFor(admin, "admin"))[0]?.reviewer_id).toBe(admin.id);
    expect((await action(admin.client, "approved", { p_round_id: first.id, p_expected_reviewer_id: reviewer.id })).error?.message).toContain("step is no longer active");
    await action(admin.client, "rework", { p_round_id: first.id, p_expected_reviewer_id: admin.id, p_comment: "Fix after management review" }).throwOnError();
    const returned = await read();
    expect(returned.status).toBe("in_progress");
    const closedFirst = returned.review_rounds?.find((round) => round.id === first.id);
    expect(closedFirst).toMatchObject({ result: "rework", rework_comment: "Fix after management review" });
    expect(closedFirst?.completed_at).not.toBeNull();
    await action(assignee.client, "submit").throwOnError();
    const second = getActiveTaskReview(await read());
    if (!second) throw new Error("Missing second sequential round");
    expect(second.round_number).toBe(2);
    expect(second.reviewer_id).toBe(reviewer.id);
    expect(second.reviewers?.map((step) => step.approved_at)).toEqual([null, null]);
    await action(reviewer.client, "approved", { p_round_id: second.id, p_expected_reviewer_id: reviewer.id }).throwOnError();
    await action(admin.client, "approved", { p_round_id: second.id, p_expected_reviewer_id: admin.id }).throwOnError();
    const approved = await read();
    expect(approved.status).toBe("review");
    expect(getActiveTaskReview(approved)).toBeNull();
    expect(approved.review_rounds?.find((round) => round.id === first.id)).toEqual(closedFirst);
    const closedSecond = approved.review_rounds?.find((round) => round.id === second.id);
    expect(closedSecond?.result).toBe("approved");
    expect(closedSecond?.reviewers?.every((step) => step.approved_at !== null)).toBe(true);
    await save([admin.id, reviewer.id]).throwOnError();
    const reordered = await read();
    expect(reordered.reviewers?.find((step) => step.position === 0)?.reviewer_id).toBe(admin.id);
    expect(reordered.review_rounds?.find((round) => round.id === second.id)).toEqual(closedSecond);
    await save([]).throwOnError();
    expect((await read()).review_rounds?.find((round) => round.id === second.id)).toEqual(closedSecond);
  });

  it("assigns an ordered sequence to selected tasks atomically and preserves active and historical rounds", async () => {
    const { admin, assignee, reviewer, outsider, projectId, studioId, fallbackTaskId } = fixture;
    const taskIds: string[] = [randomUUID(), randomUUID()];
    const firstId = taskIds[0], secondId = taskIds[1];
    reviewSql(`insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by) values
      (${sqlId(firstId)},${sqlId(projectId)},'Bulk review A','stage_1','in_progress','normal',${sqlId(assignee.id)},${sqlId(admin.id)}),
      (${sqlId(secondId)},${sqlId(projectId)},'Bulk review B','stage_1','in_progress','normal',${sqlId(assignee.id)},${sqlId(admin.id)});`);
    const args = { p_project_id: projectId, p_stage: "stage_1", p_task_ids: taskIds, p_reviewer_ids: [reviewer.id, admin.id] };
    const read = async () => (await admin.client.from("task_reviewers").select("task_id, reviewer_id, position").in("task_id", taskIds).order("task_id").order("position").throwOnError()).data;
    expect((await assignee.client.rpc("bulk_configure_task_review", args)).error).not.toBeNull();
    expect((await outsider.client.rpc("bulk_configure_task_review", args)).error).not.toBeNull();
    expect((await admin.client.rpc("bulk_configure_task_review", { ...args, p_task_ids: [firstId, firstId] })).error).not.toBeNull();
    mocks.createClient.mockResolvedValue(admin.client);
    mocks.resolveMembership.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { system_role: "admin", studio_id: studioId, authenticatedUserId: admin.id } });
    const result = await bulkUpdateTaskReviewMutation(projectId, { stage: "stage_1", task_ids: taskIds, reviewer_ids: [reviewer.id, admin.id] });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.formError);
    expect(result.tasks.filter((task) => taskIds.includes(task.id)).map((task) => task.requires_review)).toEqual([true, true]);
    const assigned = await read();
    for (const taskId of taskIds) expect(assigned.filter((assignment) => assignment.task_id === taskId).map((assignment) => assignment.reviewer_id)).toEqual([reviewer.id, admin.id]);
    expect((await admin.client.rpc("bulk_configure_task_review", { ...args, p_task_ids: [firstId, fallbackTaskId], p_reviewer_ids: [] })).error).not.toBeNull();
    expect(await read()).toEqual(assigned);
    expect((await admin.client.rpc("bulk_configure_task_review", { ...args, p_reviewer_ids: [outsider.id] })).error).not.toBeNull();
    expect(await read()).toEqual(assigned);
    await assignee.client.rpc("update_task_review", { p_task_id: secondId, p_action: "submit" }).throwOnError();
    const round = (await admin.client.from("task_review_rounds").select("*").eq("task_id", secondId).single().throwOnError()).data;
    // The first task is configured before the active second task rejects;
    // the complete transaction must roll back, including the first task.
    expect((await admin.client.rpc("bulk_configure_task_review", { ...args, p_reviewer_ids: [] })).error).not.toBeNull();
    expect(await read()).toEqual(assigned);
    expect((await admin.client.from("task_review_rounds").select("*").eq("id", round.id).single().throwOnError()).data).toEqual(round);
    await reviewer.client.rpc("update_task_review", { p_task_id: secondId, p_action: "approved", p_round_id: round.id, p_expected_reviewer_id: reviewer.id }).throwOnError();
    await admin.client.rpc("update_task_review", { p_task_id: secondId, p_action: "approved", p_round_id: round.id, p_expected_reviewer_id: admin.id }).throwOnError();
    const closed = (await admin.client.from("task_review_rounds").select("*, reviewers:task_review_round_reviewers(*)").eq("id", round.id).single().throwOnError()).data;
    await admin.client.rpc("bulk_configure_task_review", { ...args, p_reviewer_ids: [] }).throwOnError();
    expect(await read()).toEqual([]);
    expect((await admin.client.from("tasks").select("requires_review, reviewer_id").in("id", taskIds).throwOnError()).data)
      .toEqual([{ requires_review: false, reviewer_id: null }, { requires_review: false, reviewer_id: null }]);
    expect((await admin.client.from("task_review_rounds").select("*, reviewers:task_review_round_reviewers(*)").eq("id", round.id).single().throwOnError()).data).toEqual(closed);
  });
});
