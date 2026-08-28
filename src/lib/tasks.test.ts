import { describe, expect, it } from "vitest";
import {
  canMoveTask,
  canEditTaskDetails,
  canEditTaskWork,
  areProjectTaskSnapshotsEqual,
  getBoardColumn,
  getOptimisticTaskForStatus,
  getTaskStatusForDrop,
  getWritableStatusForBoardColumn,
  getProjectTaskSnapshotUpdate,
  groupTasksByBoardColumn,
  groupMyTasks,
  isTaskOverdue,
  reconcileProjectTasks,
  setProjectTaskStatus,
  mergeProjectTask,
  shouldOpenTaskDrawer,
  BOARD_COLUMNS,
  DEFAULT_STAGE_COLUMN_STATUSES,
} from "./tasks";
import type { MyTask, ProjectTask } from "../types/tasks";

function makeTask(overrides: Partial<ProjectTask> = {}): ProjectTask {
  const task: ProjectTask = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    project_id: "123e4567-e89b-12d3-a456-426614174001",
    title: "Task",
    description: null,
    status: "todo",
    priority: "normal",
    stage: "stage_1",
    assignee_id: "123e4567-e89b-12d3-a456-426614174002",
    due_date: null,
    completed_at: null,
    created_at: "2026-07-01T09:00:00.000Z",
    created_by: "123e4567-e89b-12d3-a456-426614174003",
    completed_area_m2: null,
    manual_progress_override: false,
    production_completion: 0,
    progress_weight: 1,
    checklist_items: [],
    assignee: {
      id: "123e4567-e89b-12d3-a456-426614174002",
      full_name: "Alex Employee",
      job_title: "Designer",
    },
    collaborators: [],
    creator: {
      id: "123e4567-e89b-12d3-a456-426614174003",
      full_name: "Morgan Admin",
      job_title: "Director",
    },
    ...overrides,
  };
  return task;
}

describe("task Board status mapping", () => {
  it("renders the five-status workflow in operational order", () => {
    expect(BOARD_COLUMNS.map((column) => [column.label, column.status])).toEqual([["To do", "todo"], ["In progress", "in_progress"], ["Internal review", "internal_review"], ["Client review", "review"], ["Done", "completed"]]);
    expect(DEFAULT_STAGE_COLUMN_STATUSES).toEqual(BOARD_COLUMNS.map((column) => column.status));
  });
  it("maps Board columns to the five writable database statuses", () => {
    expect(getWritableStatusForBoardColumn("todo")).toBe("todo");
    expect(getWritableStatusForBoardColumn("in-progress")).toBe("in_progress");
    expect(getWritableStatusForBoardColumn("internal-review")).toBe("internal_review");
    expect(getWritableStatusForBoardColumn("client-review")).toBe("review");
    expect(getWritableStatusForBoardColumn("done")).toBe("completed");
  });

  it("maps every database status into exactly one display column", () => {
    expect(getBoardColumn("todo")).toBe("todo");
    expect(getBoardColumn("in_progress")).toBe("in-progress");
    expect(getBoardColumn("internal_review")).toBe("internal-review");
    expect(getBoardColumn("review")).toBe("client-review");
    expect(getBoardColumn("completed")).toBe("done");
    expect(getBoardColumn("cancelled")).toBe("done");
  });

  it.each([
    ["todo", "todo"],
    ["in_progress", "in-progress"],
    ["internal_review", "internal-review"],
    ["review", "client-review"],
    ["completed", "done"],
    ["cancelled", "done"],
  ])("treats dropping %s into %s as a no-op", (status, columnId) => {
    if (columnId === "todo" || columnId === "in-progress" || columnId === "client-review" || columnId === "done") {
      expect(getTaskStatusForDrop(status, columnId)).toBeNull();
    }
  });

  it("moves future-compatible statuses into normal MVP statuses", () => {
    expect(getTaskStatusForDrop("review", "done")).toBe("completed");
    expect(getTaskStatusForDrop("cancelled", "in-progress")).toBe("in_progress");
  });

  it("groups every task exactly once", () => {
    const tasks = [
      makeTask({ id: "1", status: "todo" }),
      makeTask({ id: "2", status: "in_progress" }),
      makeTask({ id: "3", status: "review" }),
      makeTask({ id: "4", status: "completed" }),
      makeTask({ id: "5", status: "cancelled" }),
    ];
    const groups = groupTasksByBoardColumn(tasks);
    const groupedIds = [...groups.todo, ...groups["in-progress"], ...groups["client-review"], ...groups.done]
      .map((task) => task.id);

    expect(groups.todo).toHaveLength(1);
    expect(groups["in-progress"]).toHaveLength(1);
    expect(groups["client-review"]).toHaveLength(1);
    expect(groups.done).toHaveLength(2);
    expect(new Set(groupedIds).size).toBe(tasks.length);
    expect(groupedIds).toHaveLength(tasks.length);
  });
});

describe("task movement permission", () => {
  const employeeId = "employee-1";

  it("allows an admin to move an accessible project task", () => {
    expect(canMoveTask({ assigneeId: "employee-2", currentUserId: employeeId, isAdmin: true, isProjectReadOnly: false })).toBe(true);
  });

  it("allows an employee to move their own task", () => {
    expect(canMoveTask({ assigneeId: employeeId, currentUserId: employeeId, isAdmin: false, isProjectReadOnly: false })).toBe(true);
  });

  it("prevents employees from moving other employees' or unassigned tasks", () => {
    expect(canMoveTask({ assigneeId: "employee-2", currentUserId: employeeId, isAdmin: false, isProjectReadOnly: false })).toBe(false);
    expect(canMoveTask({ assigneeId: null, currentUserId: employeeId, isAdmin: false, isProjectReadOnly: false })).toBe(false);
  });

  it("makes archived projects read-only for everyone", () => {
    expect(canMoveTask({ assigneeId: employeeId, currentUserId: employeeId, isAdmin: true, isProjectReadOnly: true })).toBe(false);
    expect(canMoveTask({ assigneeId: employeeId, currentUserId: employeeId, isAdmin: false, isProjectReadOnly: true })).toBe(false);
  });
});

describe("task detail editing permission", () => {
  it("allows only admins to edit details and keeps archived projects read-only", () => {
    expect(canEditTaskDetails({ isAdmin: true, isProjectReadOnly: false })).toBe(true);
    expect(canEditTaskDetails({ isAdmin: false, isProjectReadOnly: false })).toBe(false);
    expect(canEditTaskDetails({ isAdmin: true, isProjectReadOnly: true })).toBe(false);
  });
});

describe("task work editing permission", () => {
  it("allows admins and the assignee to edit an active checklist, but respects workflow read-only states", () => {
    expect(canEditTaskWork({ assigneeId: "employee-1", currentUserId: "employee-1", isAdmin: false, isProjectReadOnly: false, status: "in_progress" })).toBe(true);
    expect(canEditTaskWork({ assigneeId: "employee-2", currentUserId: "employee-1", isAdmin: true, isProjectReadOnly: false, status: "todo" })).toBe(true);
    expect(canEditTaskWork({ assigneeId: "employee-1", currentUserId: "employee-1", isAdmin: false, isProjectReadOnly: false, status: "review" })).toBe(false);
    expect(canEditTaskWork({ assigneeId: "employee-1", currentUserId: "employee-1", isAdmin: true, isProjectReadOnly: true, status: "in_progress" })).toBe(false);
  });
});

describe("task overdue behavior", () => {
  it("does not mark completed or cancelled tasks overdue", () => {
    expect(isTaskOverdue(makeTask({ due_date: "2026-07-01", status: "todo" }), "2026-07-27")).toBe(true);
    expect(isTaskOverdue(makeTask({ due_date: "2026-07-01", status: "completed" }), "2026-07-27")).toBe(false);
    expect(isTaskOverdue(makeTask({ due_date: "2026-07-01", status: "cancelled" }), "2026-07-27")).toBe(false);
  });
});

describe("optimistic task Board state", () => {
  it("moves a task into its optimistic column immediately", () => {
    const tasks = [
      makeTask({ id: "task-1", status: "todo" }),
      makeTask({ id: "task-2", status: "in_progress" }),
    ];

    const optimisticTasks = setProjectTaskStatus(tasks, "task-1", "completed");
    const groups = groupTasksByBoardColumn(optimisticTasks);

    expect(groups.todo.map((task) => task.id)).toEqual([]);
    expect(groups.done.map((task) => task.id)).toEqual(["task-1"]);
  });

  it("rolls back only the failed task", () => {
    const optimisticTasks = [
      makeTask({ id: "task-1", status: "completed" }),
      makeTask({ id: "task-2", status: "completed" }),
    ];

    const rolledBackTasks = setProjectTaskStatus(optimisticTasks, "task-1", "todo");

    expect(rolledBackTasks.find((task) => task.id === "task-1")?.status).toBe("todo");
    expect(rolledBackTasks.find((task) => task.id === "task-2")?.status).toBe("completed");
  });

  it("optimistically completes a checklist for Client review and restores it when the move is rejected", () => {
    const initial = [makeTask({ id: "task-1", status: "in_progress", checklist_items: [{ id: "item", task_id: "task-1", title: "Drawings", is_completed: false, weight: 1, position: 0, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" }] })];
    const optimistic = setProjectTaskStatus(initial, "task-1", "review");
    expect(groupTasksByBoardColumn(optimistic)["client-review"]).toHaveLength(1);
    expect(optimistic[0]?.checklist_items[0]?.is_completed).toBe(true);
    expect(optimistic[0]?.production_completion).toBe(0);
    const rolledBack = mergeProjectTask(optimistic, initial[0]);
    expect(groupTasksByBoardColumn(rolledBack)["in-progress"]).toHaveLength(1);
    expect(rolledBack[0].checklist_items[0]?.is_completed).toBe(false);
  });

  it("does not change checklist data for status transitions outside Client review", () => {
    const task = makeTask({ status: "in_progress", checklist_items: [{ id: "item", task_id: "task-1", title: "Drawings", is_completed: false, weight: 1, position: 0, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" }] });
    expect(getOptimisticTaskForStatus(task, "completed").checklist_items[0]?.is_completed).toBe(false);
  });

  it("uses the shared workflow rule for optimistic first-pass and rework moves", () => {
    expect(getOptimisticTaskForStatus(makeTask({ status: "todo" }), "in_progress")).toMatchObject({ status: "in_progress", production_completion: 0 });
    for (const status of ["internal_review", "review", "completed"] as const) {
      expect(getOptimisticTaskForStatus(makeTask({ status }), "in_progress")).toMatchObject({ status: "in_progress", production_completion: 70 });
    }
    expect(getOptimisticTaskForStatus(makeTask({ status: "review" }), "internal_review").production_completion).toBe(0);
  });

  it("does not replace an explicit manual override during a status move", () => {
    const task = makeTask({ status: "review", manual_progress_override: true, production_completion: 93 });
    expect(getOptimisticTaskForStatus(task, "in_progress")).toMatchObject({ status: "in_progress", production_completion: 93, manual_progress_override: true });
  });

  it("does not let stale server props overwrite a pending optimistic status", () => {
    const serverTasks = [makeTask({ id: "task-1", status: "todo" })];
    const optimisticTasks = setProjectTaskStatus(serverTasks, "task-1", "completed");

    const reconciledTasks = reconcileProjectTasks(
      serverTasks,
      optimisticTasks,
      new Set(["task-1"]),
      new Map(),
    );

    expect(reconciledTasks).toHaveLength(1);
    expect(reconciledTasks[0]?.status).toBe("completed");
  });

  it("preserves the local array reference for unchanged server tasks", () => {
    const currentTasks = [makeTask({ id: "task-1" })];
    const serverTasks = [makeTask({ id: "task-1" })];
    expect(reconcileProjectTasks(serverTasks, currentTasks, new Set(), new Map())).toBe(currentTasks);
  });

  it("does not repeat a mount snapshot update after Board and Workspace agree", () => {
    const initialTasks = [makeTask({ id: "task-1" })];
    const boardEmission = [makeTask({ id: "task-1" })];
    const contextTasks = getProjectTaskSnapshotUpdate(initialTasks, boardEmission);
    expect(getProjectTaskSnapshotUpdate(contextTasks, boardEmission)).toBe(contextTasks);
  });

  it("does not create a parent snapshot update for semantically identical Board tasks", () => {
    const currentTasks = [makeTask({ id: "task-1" })];
    const nextTasks = [makeTask({ id: "task-1" })];
    expect(areProjectTaskSnapshotsEqual(currentTasks, nextTasks)).toBe(true);
    expect(getProjectTaskSnapshotUpdate(currentTasks, nextTasks)).toBe(currentTasks);
  });

  it("emits one distinct snapshot for an optimistic drag and one for its rollback", () => {
    const initialTasks = [makeTask({ id: "task-1", status: "todo" })];
    const optimisticTasks = setProjectTaskStatus(initialTasks, "task-1", "completed");
    const rolledBackTasks = setProjectTaskStatus(optimisticTasks, "task-1", "todo");
    expect(getProjectTaskSnapshotUpdate(initialTasks, optimisticTasks)).toBe(optimisticTasks);
    expect(getProjectTaskSnapshotUpdate(optimisticTasks, optimisticTasks)).toBe(optimisticTasks);
    expect(getProjectTaskSnapshotUpdate(optimisticTasks, rolledBackTasks)).toBe(rolledBackTasks);
  });

  it("keeps a confirmed optimistic move stable until refreshed server data agrees", () => {
    const serverTasks = [makeTask({ id: "task-1", status: "todo" })];
    const optimisticTasks = setProjectTaskStatus(serverTasks, "task-1", "completed");
    const reconciledTasks = reconcileProjectTasks(serverTasks, optimisticTasks, new Set(), new Map<string, "completed">([["task-1", "completed"]]));
    expect(reconciledTasks).toBe(optimisticTasks);
  });

  it("updates a derived context snapshot for task edits without requiring server reconciliation", () => {
    const currentTasks = [makeTask({ id: "task-1", title: "Draft" })];
    const editedTasks = mergeProjectTask(currentTasks, makeTask({ id: "task-1", title: "Approved" }));
    expect(getProjectTaskSnapshotUpdate(currentTasks, editedTasks)).toBe(editedTasks);
  });

  it("updates a derived context snapshot when a new task is added without a Board refetch", () => {
    const currentTasks = [makeTask({ id: "task-1" })];
    const createdTasks = [...currentTasks, makeTask({ id: "task-2", title: "New task" })];
    expect(getProjectTaskSnapshotUpdate(currentTasks, createdTasks)).toBe(createdTasks);
  });

  it("deduplicates tasks while reconciling refreshed server props", () => {
    const serverTask = makeTask({ id: "task-1", status: "completed" });

    const reconciledTasks = reconcileProjectTasks(
      [serverTask, serverTask],
      [serverTask],
      new Set(),
      new Map(),
    );

    expect(reconciledTasks.map((task) => task.id)).toEqual(["task-1"]);
  });

  it("merges an updated task without duplicates and moves it to its new column", () => {
    const originalTask = makeTask({ id: "task-1", status: "todo" });
    const updatedTask = makeTask({ id: "task-1", status: "completed", title: "Updated task" });
    const mergedTasks = mergeProjectTask([originalTask, originalTask], updatedTask);
    const groups = groupTasksByBoardColumn(mergedTasks);

    expect(mergedTasks).toEqual([updatedTask]);
    expect(groups.done.map((task) => task.id)).toEqual(["task-1"]);
  });

  it("opens a card only when a drag was not activated", () => {
    expect(shouldOpenTaskDrawer(false)).toBe(true);
    expect(shouldOpenTaskDrawer(true)).toBe(false);
  });

  it("regroups a merged My Tasks item immediately after its status changes", () => {
    const task: MyTask = {
      ...makeTask({ id: "my-task", due_date: "2026-07-01", status: "todo" }),
      project: { id: "project-1", name: "Workspace", status: "active", archived_at: null },
    };
    const mergedTasks = mergeProjectTask([task], { ...task, status: "completed" });
    const groups = groupMyTasks(mergedTasks, "2026-07-28");

    expect(groups.overdue).toHaveLength(0);
    expect(groups.completed.map((item) => item.id)).toEqual(["my-task"]);
  });
});
