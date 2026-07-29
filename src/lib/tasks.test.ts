import { describe, expect, it } from "vitest";
import {
  canMoveTask,
  canEditTaskDetails,
  areProjectTaskSnapshotsEqual,
  getBoardColumn,
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
} from "./tasks";
import type { MyTask, ProjectTask } from "../types/tasks";

function makeTask(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    project_id: "123e4567-e89b-12d3-a456-426614174001",
    title: "Task",
    description: null,
    status: "todo",
    priority: "normal",
    assignee_id: "123e4567-e89b-12d3-a456-426614174002",
    due_date: null,
    completed_at: null,
    created_at: "2026-07-01T09:00:00.000Z",
    created_by: "123e4567-e89b-12d3-a456-426614174003",
    assignee: {
      id: "123e4567-e89b-12d3-a456-426614174002",
      full_name: "Alex Employee",
      job_title: "Designer",
    },
    creator: {
      id: "123e4567-e89b-12d3-a456-426614174003",
      full_name: "Morgan Admin",
      job_title: "Director",
    },
    ...overrides,
  };
}

describe("task Board status mapping", () => {
  it("maps Board columns to the three writable database statuses", () => {
    expect(getWritableStatusForBoardColumn("todo")).toBe("todo");
    expect(getWritableStatusForBoardColumn("in-progress")).toBe("in_progress");
    expect(getWritableStatusForBoardColumn("done")).toBe("completed");
  });

  it("maps every database status into exactly one display column", () => {
    expect(getBoardColumn("todo")).toBe("todo");
    expect(getBoardColumn("in_progress")).toBe("in-progress");
    expect(getBoardColumn("review")).toBe("in-progress");
    expect(getBoardColumn("completed")).toBe("done");
    expect(getBoardColumn("cancelled")).toBe("done");
  });

  it.each([
    ["todo", "todo"],
    ["in_progress", "in-progress"],
    ["review", "in-progress"],
    ["completed", "done"],
    ["cancelled", "done"],
  ])("treats dropping %s into %s as a no-op", (status, columnId) => {
    if (columnId === "todo" || columnId === "in-progress" || columnId === "done") {
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
    const groupedIds = [...groups.todo, ...groups["in-progress"], ...groups.done]
      .map((task) => task.id);

    expect(groups.todo).toHaveLength(1);
    expect(groups["in-progress"]).toHaveLength(2);
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
      project: { id: "project-1", name: "Workspace" },
    };
    const mergedTasks = mergeProjectTask([task], { ...task, status: "completed" });
    const groups = groupMyTasks(mergedTasks, "2026-07-28");

    expect(groups.overdue).toHaveLength(0);
    expect(groups.completed.map((item) => item.id)).toEqual(["my-task"]);
  });
});
