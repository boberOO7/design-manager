import { describe, expect, it } from "vitest";
import { TASK_PRIORITY_VALUES } from "../../types/tasks";
import { taskCreationSchema, taskStatusUpdateSchema } from "./task";

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
});
