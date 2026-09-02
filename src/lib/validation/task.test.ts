import { describe, expect, it } from "vitest";
import { TASK_PRIORITY_VALUES } from "../../types/tasks";
import { toTaskStatusActionState } from "../task-status-mutation";
import { checklistItemCreateSchema, checklistItemUpdateSchema, taskBulkStageAssignmentPayloadSchema, taskCreationSchema, taskEditSchema, taskStatusPayloadSchema, taskStatusUpdateSchema } from "./task";

const validTask = {
  title: "  Prepare lighting plan  ",
  description: "",
  assignee_id: "123e4567-e89b-12d3-a456-426614174000",
  priority: "normal",
  stage: "stage_1",
  status: "todo",
  due_date: "",
  completed_area_m2: "",
};

describe("task creation validation", () => {
  it("trims a task title", () => {
    const result = taskCreationSchema.parse(validTask);
    expect(result.title).toBe("Prepare lighting plan");
  });

  it("accepts an empty assignee as an unassigned task", () => {
    expect(taskCreationSchema.parse({ ...validTask, assignee_id: "" }).assignee_id).toBeNull();
    expect(taskCreationSchema.parse({ ...validTask, assignee_id: undefined }).assignee_id).toBeNull();
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

  it("accepts only one of the four persisted project stages", () => {
    expect(taskCreationSchema.safeParse({ ...validTask, stage: "stage_4" }).success).toBe(true);
    expect(taskCreationSchema.safeParse({ ...validTask, stage: "stage_5" }).success).toBe(false);
  });

  it("accepts optional positive task area and rejects zero or negative values", () => {
    expect(taskCreationSchema.parse({ ...validTask, completed_area_m2: "42.5" }).completed_area_m2).toBe(42.5);
    expect(taskCreationSchema.safeParse({ ...validTask, completed_area_m2: "0" }).success).toBe(false);
    expect(taskCreationSchema.safeParse({ ...validTask, completed_area_m2: "-1" }).success).toBe(false);
  });

  it("defaults to no checklist and validates an edited checklist template payload", () => {
    expect(taskCreationSchema.parse(validTask).checklist_items).toEqual([]);
    expect(taskCreationSchema.parse({ ...validTask, checklist_items: JSON.stringify([{ title: "Plans", weight: 2 }]) }).checklist_items).toEqual([{ title: "Plans", weight: 2 }]);
    expect(taskCreationSchema.safeParse({ ...validTask, checklist_items: JSON.stringify([{ title: "Plans", weight: 1.5 }]) }).success).toBe(false);
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
    expect(taskStatusPayloadSchema.safeParse({ status: "cancelled" }).success).toBe(false);
    expect(taskStatusUpdateSchema.safeParse({ task_id: validTask.assignee_id, status: "cancelled" }).success).toBe(false);
  });

  it("accepts only supported bulk stage assignment scopes", () => {
    expect(taskBulkStageAssignmentPayloadSchema.safeParse({ stage: "stage_1", assignee_id: validTask.assignee_id, scope: "unassigned" }).success).toBe(true);
    expect(taskBulkStageAssignmentPayloadSchema.safeParse({ stage: "stage_1", assignee_id: validTask.assignee_id, scope: "all" }).success).toBe(true);
    expect(taskBulkStageAssignmentPayloadSchema.safeParse({ stage: "stage_1", assignee_id: validTask.assignee_id, scope: "selected" }).success).toBe(false);
  });
});

describe("checklist validation", () => {
  it("defaults to whole-number weight one and rejects invalid weight values", () => {
    expect(checklistItemCreateSchema.parse({ title: "Drawings" }).weight).toBe(1);
    expect(checklistItemCreateSchema.parse({ title: "Drawings", weight: "3" }).weight).toBe(3);
    expect(checklistItemCreateSchema.safeParse({ title: "Drawings", weight: "1.5" }).success).toBe(false);
    expect(checklistItemCreateSchema.safeParse({ title: "Drawings", weight: "0" }).success).toBe(false);
    expect(checklistItemCreateSchema.safeParse({ title: "Drawings", weight: "-1" }).success).toBe(false);
    expect(checklistItemUpdateSchema.safeParse({ weight: "1.5" }).success).toBe(false);
  });
});

describe("task editing validation", () => {
  const validEdit = {
    title: "  Update lighting plan  ",
    description: "  Confirm the final fixture schedule.  ",
    assignee_id: validTask.assignee_id,
    priority: "high",
    stage: "stage_2",
    deadlines: [{ target_status: "completed", due_date: "2026-08-01" }],
    completed_area_m2: "70",
    progress_weight: "2.5",
  };

  it("trims titles and descriptions and rejects missing titles", () => {
    const parsed = taskEditSchema.parse(validEdit);
    expect(parsed.title).toBe("Update lighting plan");
    expect(parsed.description).toBe("Confirm the final fixture schedule.");
    expect(taskEditSchema.safeParse({ ...validEdit, title: "  " }).success).toBe(false);
  });

  it("allows an existing assignee to be cleared", () => {
    expect(taskEditSchema.parse({ ...validEdit, assignee_id: "" }).assignee_id).toBeNull();
    expect(taskEditSchema.parse({ ...validEdit, assignee_id: null }).assignee_id).toBeNull();
  });

  it("validates unique milestone deadlines alongside the other edit fields", () => {
    expect(taskEditSchema.safeParse({ ...validEdit, priority: "medium" }).success).toBe(false);
    expect(taskEditSchema.safeParse({ ...validEdit, deadlines: [{ target_status: "review", due_date: "2026-08-01" }] }).success).toBe(true);
    expect(taskEditSchema.safeParse({ ...validEdit, deadlines: [{ target_status: "review", due_date: "2026-08-01" }, { target_status: "review", due_date: "2026-08-02" }] }).success).toBe(false);
    expect(taskEditSchema.safeParse({ ...validEdit, progress_weight: "0" }).success).toBe(false);
    expect(taskEditSchema.safeParse({ ...validEdit, deadlines: [{ target_status: "review", due_date: "2026-02-30" }] }).success).toBe(false);
  });

  it("accepts the status-free, legacy-date-free Task Details PATCH payload", () => {
    const result = taskEditSchema.parse(validEdit);

    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("due_date");
    expect(result.deadlines).toEqual([{ target_status: "completed", due_date: "2026-08-01" }]);
  });

  it("reports deadline-row errors under the visible deadlines field", () => {
    const result = taskEditSchema.safeParse({
      ...validEdit,
      deadlines: [{ id: "persisted-row", target_status: "completed", due_date: "2026-08-01" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.deadlines).toBeTruthy();
  });
});

describe("task status mutation result handling", () => {
  it("returns a safe success response without server-only fields", () => {
    expect(toTaskStatusActionState({ success: true, projectId: validTask.assignee_id, projectStatus: "active" })).toEqual({ success: true, projectStatus: "active" });
  });

  it("preserves a safe mutation error for the Server Action and Route Handler", () => {
    expect(toTaskStatusActionState({ success: false, formError: "The task was not found or is not available." })).toEqual({
      formError: "The task was not found or is not available.",
    });
  });
});
