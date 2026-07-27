import { describe, expect, it } from "vitest";
import { TASK_PRIORITY_VALUES } from "../../types/tasks";
import { toTaskStatusActionState } from "../task-status-mutation";
import { taskCreationSchema, taskStatusPayloadSchema, taskStatusUpdateSchema } from "./task";

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
