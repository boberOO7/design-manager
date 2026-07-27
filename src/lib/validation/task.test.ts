import { describe, expect, it } from "vitest";
import { TASK_PRIORITY_VALUES } from "../../types/tasks";
import { toTaskStatusActionState } from "../task-status-mutation";
import { taskCreationSchema, taskEditSchema, taskStatusPayloadSchema, taskStatusUpdateSchema } from "./task";

const validTask = {
  title: "  Prepare lighting plan  ",
  description: "",
  assignee_id: "123e4567-e89b-12d3-a456-426614174000",
  priority: "normal",
  due_date: "",
};

describe("task creation validation", () => {
  it("trims a task title", () => {
    const result = taskCreationSchema.parse(validTask);
    expect(result.title).toBe("Prepare lighting plan");
  });

  it("rejects a missing task title", () => {
    const result = taskCreationSchema.safeParse({ ...validTask, title: "   " });
    expect(result.success).toBe(false);
  });

  it("accepts every priority supported by the task schema", () => {
    for (const priority of TASK_PRIORITY_VALUES) {
      expect(taskCreationSchema.safeParse({ ...validTask, priority }).success).toBe(true);
    }
    expect(taskCreationSchema.safeParse({ ...validTask, priority: "medium" }).success).toBe(false);
  });
});

describe("task status validation", () => {
  it("rejects a status outside the database check constraint", () => {
    const result = taskStatusUpdateSchema.safeParse({
      task_id: "123e4567-e89b-12d3-a456-426614174000",
      status: "blocked",
    });
    expect(result.success).toBe(false);
  });

  it("accepts only a status in the Board API payload", () => {
    expect(taskStatusPayloadSchema.safeParse({ status: "todo" }).success).toBe(true);
    expect(taskStatusPayloadSchema.safeParse({ status: "todo", task_id: validTask.assignee_id }).success).toBe(false);
  });
});

describe("task editing validation", () => {
  const validEdit = {
    title: "  Update lighting plan  ",
    description: "  Confirm the final fixture schedule.  ",
    assignee_id: validTask.assignee_id,
    priority: "high",
    due_date: "2026-08-01",
    status: "in_progress",
  };

  it("trims titles and descriptions and rejects missing titles", () => {
    const parsed = taskEditSchema.parse(validEdit);
    expect(parsed.title).toBe("Update lighting plan");
    expect(parsed.description).toBe("Confirm the final fixture schedule.");
    expect(taskEditSchema.safeParse({ ...validEdit, title: "  " }).success).toBe(false);
  });

  it("rejects invalid priority, non-MVP status, and invalid dates", () => {
    expect(taskEditSchema.safeParse({ ...validEdit, priority: "medium" }).success).toBe(false);
    expect(taskEditSchema.safeParse({ ...validEdit, status: "review" }).success).toBe(false);
    expect(taskEditSchema.safeParse({ ...validEdit, due_date: "2026-02-30" }).success).toBe(false);
  });
});

describe("task status mutation result handling", () => {
  it("returns a safe success response without server-only fields", () => {
    expect(toTaskStatusActionState({ success: true, projectId: validTask.assignee_id })).toEqual({ success: true });
  });

  it("preserves a safe mutation error for the Server Action and Route Handler", () => {
    expect(toTaskStatusActionState({ success: false, formError: "The task was not found or is not available." })).toEqual({
      formError: "The task was not found or is not available.",
    });
  });
});
