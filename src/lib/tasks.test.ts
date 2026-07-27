import { describe, expect, it } from "vitest";
import {
  canMoveTask,
  getBoardColumn,
  getTaskStatusForDrop,
  getWritableStatusForBoardColumn,
  groupTasksByBoardColumn,
  isTaskOverdue,
  reconcileProjectTasks,
  setProjectTaskStatus,
} from "./tasks";
import type { ProjectTask } from "../types/tasks";

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
    assignee: {
      id: "123e4567-e89b-12d3-a456-426614174002",
      full_name: "Alex Employee",
      job_title: "Designer",
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
});
