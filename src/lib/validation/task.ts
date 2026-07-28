import { z } from "zod";
import { TASK_PRIORITY_VALUES, TASK_STATUS_VALUES } from "../../types/tasks";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const optionalDateSchema = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().refine((value) => {
    if (!datePattern.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid date").optional(),
);

export const taskCreationSchema = z.object({
  title: z.string().trim().min(1, "Task title is required").max(200, "Task title is too long"),
  description: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().trim().max(5000, "Description is too long").optional(),
  ),
  assignee_id: z.uuid("Choose a valid project member"),
  priority: z.enum(TASK_PRIORITY_VALUES),
  due_date: optionalDateSchema,
});

export const taskStatusUpdateSchema = z.object({
  task_id: z.uuid("Choose a valid task"),
  status: z.enum(TASK_STATUS_VALUES),
});

export const taskStatusPayloadSchema = z.object({
  status: z.enum(TASK_STATUS_VALUES),
}).strict();

export const taskEditSchema = z.object({
  title: z.string().trim().min(1, "Task title is required").max(200, "Task title is too long"),
  description: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().trim().max(5000, "Description is too long").optional(),
  ),
  assignee_id: z.uuid("Choose a valid project member"),
  priority: z.enum(TASK_PRIORITY_VALUES),
  due_date: optionalDateSchema,
  status: z.enum(["todo", "in_progress", "completed"]),
}).strict();

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
    due_date: getFormString(formData, "due_date"),
  };
}

export function getTaskStatusInput(formData: FormData) {
  return {
    task_id: getFormString(formData, "task_id"),
    status: getFormString(formData, "status"),
  };
}
