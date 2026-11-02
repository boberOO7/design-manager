import { correctionReviewTask, wasCorrectionAssignedOnDate } from "./task-corrections";
import { getActiveTaskReview, getLatestTaskReview } from "./task-reviews";
import { canDragTaskOnBoard, getTaskBoardDropStatus, groupTasksByBoardColumn, mergeProjectTask } from "./tasks";
import { describe, expect, it } from "vitest";
import { getMyTasksInbox, type InboxFilters } from "./my-tasks-inbox";
import type { MyTask } from "@/types/tasks";
import type { MyOfficeAssignment } from "@/data/queries/office-assignments";

const today = "2026-09-25";
const filters: InboxFilters = { period: "all", search: "", project: "all", type: "all", state: "active" };

function task(id: string, projectId: string, deadline: string | null, status: MyTask["status"] = "todo"): MyTask {
  return {
    id, project_id: projectId, project: { id: projectId, name: projectId, status: "active", archived_at: null },
    title: `Task ${id}`, description: null, stage: "stage_1", status, priority: "normal", assignee_id: null,
    due_date: status === "completed" || status === "cancelled" ? null : deadline, deadlines: deadline ? [{ id: `deadline-${id}`, target_status: "completed", due_date: deadline }] : [],
    completed_at: null, completed_area_m2: null, manual_progress_override: false, production_completion: 0,
    progress_weight: 1, created_at: "2026-09-01T00:00:00Z", created_by: "creator",
    currentStatusEnteredAt: null, checklist_template_id: null, checklist_items: [], assignee: null, collaborators: [], creator: null,
  };
}

const assignments: MyOfficeAssignment[] = [
  { id: "office-overdue", title: "Urgent office", deadline: "2026-09-23", status: "assigned" },
  { id: "office-done", title: "Finished office", deadline: "2026-09-24", status: "done" },
  { id: "office-cancelled", title: "Cancelled office", deadline: null, status: "cancelled" },
];
const tasks = [
  task("late", "Alpha", "2026-09-24"), task("today", "Alpha", today), task("soon", "Alpha", "2026-09-26"),
  task("later", "Alpha", "2026-10-03"), task("none", "Alpha", null), task("done", "Alpha", "2026-09-20", "completed"),
  task("future", "Beta", "2026-09-27"), task("cancelled", "Beta", null, "cancelled"),
];

describe("My Tasks inbox", () => {
  it("orders groups and rows by active deadline urgency, leaving undated work last", () => {
    const groups = getMyTasksInbox(tasks, assignments, filters, today);
    expect(groups.map((group) => group.id)).toEqual(["office", "Alpha", "Beta"]);
    expect(groups.find((group) => group.id === "Alpha")?.items.map((item) => item.title)).toEqual([
      "Task late", "Task today", "Task soon", "Task later", "Task none",
    ]);
    expect(groups[0].items).toHaveLength(1);
  });

  it("shows completed work separately and keeps active rows ahead in All", () => {
    const completed = getMyTasksInbox(tasks, assignments, { ...filters, state: "completed" }, today);
    expect(completed.map((group) => [group.id, group.items.map((item) => item.title)])).toEqual([
      ["office", ["Finished office"]], ["Alpha", ["Task done"]],
    ]);
    const all = getMyTasksInbox(tasks, assignments, { ...filters, state: "all" }, today);
    expect(all.map((group) => [group.id, group.items.length])).toEqual([["office", 2], ["Alpha", 6], ["Beta", 1]]);
    expect(all.find((group) => group.id === "Alpha")?.items.at(-1)?.title).toBe("Task done");
    expect(getMyTasksInbox(tasks, assignments, { ...filters, state: "completed", type: "project", search: "done" }, today).map((group) => group.id)).toEqual(["Alpha"]);
    expect(getMyTasksInbox(tasks, assignments, { ...filters, state: "completed", project: "office" }, today)[0]?.items.map((item) => item.title)).toEqual(["Finished office"]);
  });

  it("applies period, title, project and type filters before counts and groups", () => {
    expect(getMyTasksInbox(tasks, assignments, { ...filters, period: "overdue" }, today).map((group) => [group.id, group.items.length])).toEqual([["office", 1], ["Alpha", 1]]);
    expect(getMyTasksInbox(tasks, assignments, { ...filters, period: "today" }, today).map((group) => [group.id, group.items.length])).toEqual([["Alpha", 1]]);
    expect(getMyTasksInbox(tasks, assignments, { ...filters, period: "week" }, today).map((group) => [group.id, group.items.length])).toEqual([["Alpha", 2], ["Beta", 1]]);
    expect(getMyTasksInbox(tasks, assignments, { ...filters, search: "URGENT", type: "office" }, today).map((group) => [group.id, group.items.length])).toEqual([["office", 1]]);
    expect(getMyTasksInbox(tasks, assignments, { ...filters, project: "Alpha", type: "office" }, today)).toEqual([]);
    expect(getMyTasksInbox(tasks, assignments, { ...filters, project: "Beta" }, today).map((group) => group.id)).toEqual(["Beta"]);
  });
});

describe("correction work on completed tasks", () => {
  const correction: NonNullable<MyTask["corrections"]>[number] = {
    id: "correction",task_id: "done",description: "Adjust dimensions",assignee_id: "other",created_by: "admin",
    status: "in_progress",due_date: "2026-09-24",created_at: "2026-09-23T08:00:00Z",updated_at: "2026-09-23T08:00:00Z",closed_at: null,
    reviewer_ids: ["admin"],assignee: null,creator: null,events: [],
  };
  it("shows one active work item with the correction deadline and preserves the completed task", () => {
    const original = { ...task("done","Alpha",null,"completed"),completed_at: "2026-09-18",corrections: [correction] };
    const groups = getMyTasksInbox([original],[],filters,today);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0]).toMatchObject({ completed: false,overdue: true,deadline: "2026-09-24",task: { status: "completed",completed_at: "2026-09-18" } });
    expect(getMyTasksInbox([{ ...original,corrections: [{ ...correction,status: "closed",closed_at: "2026-09-25T12:00:00Z" }] }],[],filters,today)).toEqual([]);
  });
  it("moves the same card through correction columns without changing original completion or area", () => {
    const original = { ...task("done","Alpha",null,"completed"),completed_at: "2026-09-18",completed_area_m2: 12,corrections: [correction] };
    const before = structuredClone(original);
    const work = groupTasksByBoardColumn([original]);
    expect(work["in-progress"]).toEqual([original]);
    expect(work["in-progress"][0]).toBe(original);
    expect(work.done).toEqual([]);
    const review = { ...original,corrections: [{ ...correction,status: "internal_review" }] };
    expect(groupTasksByBoardColumn([review])["internal-review"]).toEqual([review]);
    const client = { ...original,corrections: [{ ...correction,status: "review" }] };
    expect(groupTasksByBoardColumn([client])["client-review"]).toEqual([client]);
    const closed = { ...original,corrections: [{ ...correction,status: "closed",closed_at: "2026-09-25T12:00:00Z" }] };
    expect(groupTasksByBoardColumn([closed]).done).toEqual([closed]);
    expect(original).toEqual(before);
    expect(review).toMatchObject({ status: "completed",completed_at: "2026-09-18",completed_area_m2: 12 });
    expect(closed).toMatchObject({ status: "completed",completed_at: "2026-09-18",completed_area_m2: 12 });
  });
  it("allows correction dragging for its executor or admin while retaining archive and review guards", () => {
    const original = { ...task("done","Alpha",null,"completed"),assignee_id: "original-worker",corrections: [correction] };
    const access = { task: original,currentUserId: correction.assignee_id,isAdmin: false,isProjectReadOnly: true,correctionsReadOnly: false };
    expect(canDragTaskOnBoard(access)).toBe(true);
    expect(canDragTaskOnBoard({ ...access,currentUserId: "original-worker" })).toBe(false);
    expect(canDragTaskOnBoard({ ...access,currentUserId: "admin",isAdmin: true })).toBe(true);
    expect(canDragTaskOnBoard({ ...access,correctionsReadOnly: true })).toBe(false);
    expect(canDragTaskOnBoard({ ...access,task: { ...original,corrections: [] } })).toBe(false);
    expect(canDragTaskOnBoard({ ...access,task: { ...original,corrections: [{ ...correction,status: "internal_review" }] } })).toBe(false);
    expect(getTaskBoardDropStatus(original,"internal-review")).toBe("internal_review");
    for (const column of ["todo","in-progress","client-review","done"] as const) expect(getTaskBoardDropStatus(original,column)).toBeNull();
    expect(getTaskBoardDropStatus({ ...original,corrections: [{ ...correction,status: "internal_review" }] },"done")).toBeNull();
    const client = { ...original,corrections: [{ ...correction,status: "review" }] };
    expect(canDragTaskOnBoard({ ...access,task: client })).toBe(true);
    expect(getTaskBoardDropStatus(client,"done")).toBe("completed");
    expect(getTaskBoardDropStatus(client,"in-progress")).toBe("in_progress");
    expect(getTaskBoardDropStatus(client,"internal-review")).toBeNull();
    expect(original.status).toBe("completed");
  });
  it("keeps original approval history separate and updates same-status correction UI snapshots", () => {
    const primary = { correction_id: null,id: "primary",task_id: "done",project_id: "Alpha",round_number: 1,reviewer_id: "admin",reviewer: null,
      submitted_at: "2026-09-17T10:00:00Z",completed_at: "2026-09-18T10:00:00Z",result: "approved",rework_comment: null };
    const own = { ...primary,correction_id: correction.id,id: "correction-round",round_number: 2,completed_at: null,result: null };
    const original = { ...task("done","Alpha",null,"completed"),corrections: [correction],review_rounds: [primary,own] };
    expect(getLatestTaskReview(original)?.id).toBe("primary");
    expect(getActiveTaskReview(correctionReviewTask(original,{ ...correction,status: "internal_review" }))?.id).toBe("correction-round");
    const changed = { ...original,corrections: [{ ...correction,description: "Updated correction" }] };
    expect(mergeProjectTask([original],changed)[0]).toEqual(changed);
    expect(original.status).toBe("completed");
  });
  it("retains historical time ownership across reassignment and Kyiv date boundaries", () => {
    const events = [{ id: "1",created_at: "2026-11-02T20:00:00Z",changes: { to: { assignee_id: "first" } } },
      { id: "2",created_at: "2026-11-03T10:00:00Z",changes: { to: { assignee_id: "second" } } }];
    expect(wasCorrectionAssignedOnDate(events,"first","2026-11-02")).toBe(true);
    expect(wasCorrectionAssignedOnDate(events,"second","2026-11-02")).toBe(false);
    expect(wasCorrectionAssignedOnDate(events,"first","2026-11-03")).toBe(true);
    expect(wasCorrectionAssignedOnDate(events,"first","2026-11-04")).toBe(false);
    expect(wasCorrectionAssignedOnDate(events,"second","2026-11-04")).toBe(true);
  });

});
