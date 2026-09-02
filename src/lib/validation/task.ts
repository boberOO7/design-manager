import { z } from "zod";
import { TASK_PRIORITY_VALUES } from "../../types/tasks";
import { TASK_STAGES } from "@/lib/task-stages";
import { TASK_MILESTONE_STATUSES } from "@/lib/task-deadlines";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const optionalDateSchema = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().refine((value) => {
    if (!datePattern.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid date").optional(),
);

const optionalCompletedAreaSchema = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().finite("Enter a valid area").positive("Area must be greater than zero").max(1_000_000, "Area is too large").optional(),
);

const optionalAssigneeSchema = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.uuid("Choose a valid project member").nullable(),
);
const collaboratorIdsSchema = z.array(z.uuid("Choose valid project members")).max(50).default([])
  .refine((ids) => new Set(ids).size === ids.length, "Choose each co-assignee only once");
const taskDeadlineSchema = z.object({ target_status: z.enum(TASK_MILESTONE_STATUSES), due_date: optionalDateSchema }).strict();
const taskDeadlinesSchema = z.array(taskDeadlineSchema).max(TASK_MILESTONE_STATUSES.length)
  .refine((deadlines) => deadlines.every((deadline) => deadline.due_date !== undefined), "Enter a valid deadline date")
  .refine((deadlines) => new Set(deadlines.map((deadline) => deadline.target_status)).size === deadlines.length, "Choose each workflow point only once");

const progressWeightSchema = z.coerce.number().finite("Enter a valid weight").positive("Weight must be greater than zero").max(1000, "Weight is too large");
const checklistWeightSchema = z.coerce.number().finite("Enter a valid weight").int("Weight must be a whole number").positive("Weight must be greater than zero").max(1000, "Weight is too large");
const checklistTemplateItemsSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string" || value === "") return [];
    try { return JSON.parse(value); } catch { return value; }
  },
  z.array(z.object({ title: z.string().trim().min(1).max(200), weight: checklistWeightSchema }).strict()).max(50),
);

export const taskCreationSchema = z.object({
  title: z.string().trim().min(1, "Task title is required").max(200, "Task title is too long"),
  description: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().trim().max(5000, "Description is too long").optional(),
  ),
  assignee_id: optionalAssigneeSchema,
  priority: z.enum(TASK_PRIORITY_VALUES),
  stage: z.enum(TASK_STAGES),
  status: z.enum(["todo", "in_progress", "internal_review", "review", "completed"]),
  due_date: optionalDateSchema,
  completed_area_m2: optionalCompletedAreaSchema,
  checklist_items: checklistTemplateItemsSchema,
});

export const taskStatusUpdateSchema = z.object({
  task_id: z.uuid("Choose a valid task"),
  status: z.enum(["todo", "in_progress", "internal_review", "review", "completed"]),
});

export const taskStatusPayloadSchema = z.object({
  status: z.enum(["todo", "in_progress", "internal_review", "review", "completed"]),
}).strict();

export const taskBulkStatusMovePayloadSchema = z.object({
  stage: z.enum(TASK_STAGES),
  source_statuses: z.array(z.enum(["todo", "in_progress", "internal_review", "review", "completed", "cancelled"])).min(1).max(2),
  target_status: z.enum(["todo", "in_progress", "internal_review", "review", "completed"]),
  task_ids: z.array(z.uuid("Choose valid tasks")).min(1).max(200),
}).strict().refine((value) => new Set(value.task_ids).size === value.task_ids.length, "Choose unique tasks");

export const taskBulkStageAssignmentPayloadSchema = z.object({
  stage: z.enum(TASK_STAGES),
  assignee_id: z.uuid("Choose a valid project member"),
  scope: z.enum(["unassigned", "all"]),
}).strict();

export const taskEditSchema = z.object({
  title: z.string().trim().min(1, "Task title is required").max(200, "Task title is too long"),
  description: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().trim().max(5000, "Description is too long").optional(),
  ),
  assignee_id: optionalAssigneeSchema,
  collaborator_ids: collaboratorIdsSchema,
  priority: z.enum(TASK_PRIORITY_VALUES),
  deadlines: taskDeadlinesSchema.default([]),
  completed_area_m2: optionalCompletedAreaSchema,
  progress_weight: progressWeightSchema,
  stage: z.enum(TASK_STAGES),
}).strict();

export const taskProductionProgressSchema = z.object({
  production_completion: z.coerce.number().finite("Enter a valid percentage").min(0).max(100),
}).strict();

export const checklistItemCreateSchema = z.object({
  title: z.string().trim().min(1, "Checklist item title is required").max(200, "Checklist item title is too long"),
  weight: checklistWeightSchema.default(1),
}).strict();

export const checklistItemUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  weight: checklistWeightSchema.optional(),
  is_completed: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide a checklist change");

export type TaskEditInput = z.infer<typeof taskEditSchema>;
export type TaskEditField = keyof TaskEditInput;

export type TaskCreationInput = z.infer<typeof taskCreationSchema>;
export type TaskCreationField = keyof TaskCreationInput;

export type TaskActionState = {
  success?: boolean;
  formError?: string;
  fieldErrors?: Partial<Record<TaskCreationField, string>>;
};

export type TaskStatusActionState = {
  success?: boolean;
  projectStatus?: string;
  formError?: string;
};

function getFormString(formData: FormData, field: string): string | undefined {
  const value = formData.get(field);
  return typeof value === "string" ? value : undefined;
}

export function getTaskCreationInput(formData: FormData) {
  return {
    title: getFormString(formData, "title"),
    description: getFormString(formData, "description"),
    assignee_id: getFormString(formData, "assignee_id"),
    priority: getFormString(formData, "priority"),
    stage: getFormString(formData, "stage"),
    status: getFormString(formData, "status"),
    due_date: getFormString(formData, "due_date"),
    completed_area_m2: getFormString(formData, "completed_area_m2"),
    checklist_items: getFormString(formData, "checklist_items"),
    progress_weight: getFormString(formData, "progress_weight"),
  };
}

export function getTaskStatusInput(formData: FormData) {
  return {
    task_id: getFormString(formData, "task_id"),
    status: getFormString(formData, "status"),
  };
}
