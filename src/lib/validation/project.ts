import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().refine(
  (value) => {
    if (!datePattern.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  },
  "Enter a valid date",
);

const projectFields = {
  name: z.string().trim().min(1, "Project name is required").max(200, "Project name is too long"),
  project_code: z.string().trim().max(50, "Project code is too long").optional(),
  client_name: z.string().trim().max(200, "Client name is too long").optional(),
  description: z.string().trim().max(5000, "Description is too long").optional(),
  total_area_m2: z.coerce
    .number({ error: "Enter a valid total area" })
    .positive("Total area must be greater than zero"),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  start_date: dateSchema,
  due_date: z.preprocess((value) => (value === "" ? undefined : value), dateSchema.optional()),
};

function validateDateOrder(
  project: { start_date: string; due_date?: string },
  context: z.RefinementCtx,
) {
  if (project.due_date && project.due_date < project.start_date) {
    context.addIssue({
      code: "custom",
      message: "Due date cannot be earlier than the start date",
      path: ["due_date"],
    });
  }
}

export const projectSchema = z.object(projectFields).superRefine(validateDateOrder);

export const editProjectSchema = z
  .object({
    ...projectFields,
    status: z.enum(["planned", "active", "paused", "completed"]),
  })
  .superRefine(validateDateOrder);

export type ProjectFormValues = z.infer<typeof projectSchema>;
export type EditProjectFormValues = z.infer<typeof editProjectSchema>;
export type ProjectFormField = keyof EditProjectFormValues;

export type ProjectFormActionState = {
  formError?: string;
  fieldErrors?: Partial<Record<ProjectFormField, string>>;
};

function getOptionalString(formData: FormData, field: ProjectFormField): string | undefined {
  const value = formData.get(field);
  return typeof value === "string" ? value : undefined;
}

export function getProjectFormInput(formData: FormData, includeStatus: boolean) {
  return {
    name: getOptionalString(formData, "name"),
    project_code: getOptionalString(formData, "project_code"),
    client_name: getOptionalString(formData, "client_name"),
    description: getOptionalString(formData, "description"),
    total_area_m2: getOptionalString(formData, "total_area_m2"),
    priority: getOptionalString(formData, "priority"),
    start_date: getOptionalString(formData, "start_date"),
    due_date: getOptionalString(formData, "due_date"),
    ...(includeStatus ? { status: getOptionalString(formData, "status") } : {}),
  };
}

export function isEditableProjectStatus(
  status: string,
): status is EditProjectFormValues["status"] {
  return status === "planned" || status === "active" || status === "paused" || status === "completed";
}

export function isProjectPriority(
  priority: string,
): priority is EditProjectFormValues["priority"] {
  return priority === "low" || priority === "normal" || priority === "high" || priority === "urgent";
}
