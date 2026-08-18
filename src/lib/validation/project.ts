import { z } from "zod";
import { isCountryCode } from "@/lib/countries";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const PROJECT_TYPE_KEYS = [
  "private",
  "commercial",
  "horeca",
  "medical",
  "other",
] as const;

export type ProjectTypeKey = (typeof PROJECT_TYPE_KEYS)[number];

export function isProjectTypeKey(value: string | null | undefined): value is ProjectTypeKey {
  return PROJECT_TYPE_KEYS.some((key) => key === value);
}

export function getProjectTypeDisplayName(
  projectType: string | null | undefined,
  projectTypeCustom: string | null | undefined,
  getCanonicalLabel: (key: ProjectTypeKey) => string,
): string | null {
  if (!projectType) return null;
  if (projectType === "other" && projectTypeCustom?.trim()) return projectTypeCustom;
  return isProjectTypeKey(projectType) ? getCanonicalLabel(projectType) : projectType;
}
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
  project_type: z.preprocess((value) => value === "" ? null : value, z.enum(PROJECT_TYPE_KEYS).nullable()),
  project_type_custom: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().max(100, "Custom project type is too long").optional()),
  country_code: z.string().trim().refine(isCountryCode, "Choose a valid country"),
  city: z.string().trim().max(100, "City is too long").optional(),
  city_geonames_id: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional()),
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

export const editProjectSchema = z.object(projectFields).strict().superRefine(validateDateOrder);
export const projectProgressMethodSchema = z.object({
  progress_method: z.enum(["equal", "area", "weighted"]),
}).strict();

export type ProjectFormValues = z.infer<typeof projectSchema>;
export type EditProjectFormValues = z.infer<typeof editProjectSchema>;
export type ProjectFormField = keyof EditProjectFormValues;

export type ProjectFormActionState = {
  formError?: string;
  fieldErrors?: Partial<Record<ProjectFormField, string>>;
  projectId?: string;
};

function getOptionalString(formData: FormData, field: string): string | undefined {
  const value = formData.get(field);
  return typeof value === "string" ? value : undefined;
}

export function getProjectFormInput(formData: FormData) {
  return {
    name: getOptionalString(formData, "project_name"),
    project_type: getOptionalString(formData, "project_type"),
    project_type_custom: getOptionalString(formData, "project_type_custom"),
    country_code: getOptionalString(formData, "country_code"),
    city: getOptionalString(formData, "city"),
    city_geonames_id: getOptionalString(formData, "city_geonames_id"),
    client_name: getOptionalString(formData, "client_name"),
    description: getOptionalString(formData, "description"),
    total_area_m2: getOptionalString(formData, "total_area_m2"),
    priority: getOptionalString(formData, "priority"),
    start_date: getOptionalString(formData, "start_date"),
    due_date: getOptionalString(formData, "due_date"),
  };
}

export function getKyivDateOnly(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isProjectPriority(
  priority: string,
): priority is EditProjectFormValues["priority"] {
  return priority === "low" || priority === "normal" || priority === "high" || priority === "urgent";
}
