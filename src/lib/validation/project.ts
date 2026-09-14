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
export type ProjectValidationMessages = {
  areaInvalid: string;
  areaPositive: string;
  cityGeoNamesInvalid: string;
  cityTooLong: string;
  clientNameTooLong: string;
  completionDateFuture: string;
  countryInvalid: string;
  dateInvalid: string;
  descriptionTooLong: string;
  dueDateBeforeStart: string;
  nameRequired: string;
  nameTooLong: string;
  priorityInvalid: string;
  projectTypeCustomTooLong: string;
  projectTypeInvalid: string;
};

type ProjectValidationMessageKey = `validation.${keyof ProjectValidationMessages}`;

export function getProjectValidationMessages(translate: (key: ProjectValidationMessageKey) => string): ProjectValidationMessages {
  return {
    areaInvalid: translate("validation.areaInvalid"),
    areaPositive: translate("validation.areaPositive"),
    cityGeoNamesInvalid: translate("validation.cityGeoNamesInvalid"),
    cityTooLong: translate("validation.cityTooLong"),
    clientNameTooLong: translate("validation.clientNameTooLong"),
    completionDateFuture: translate("validation.completionDateFuture"),
    countryInvalid: translate("validation.countryInvalid"),
    dateInvalid: translate("validation.dateInvalid"),
    descriptionTooLong: translate("validation.descriptionTooLong"),
    dueDateBeforeStart: translate("validation.dueDateBeforeStart"),
    nameRequired: translate("validation.nameRequired"),
    nameTooLong: translate("validation.nameTooLong"),
    priorityInvalid: translate("validation.priorityInvalid"),
    projectTypeCustomTooLong: translate("validation.projectTypeCustomTooLong"),
    projectTypeInvalid: translate("validation.projectTypeInvalid"),
  };
}

function createDateSchema(message: string) {
  return z.string({ error: message }).refine(
    (value) => {
      if (!datePattern.test(value)) return false;
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    },
    message,
  );
}

function createProjectFields(messages: ProjectValidationMessages) {
  const dateSchema = createDateSchema(messages.dateInvalid);
  return {
    name: z.string({ error: messages.nameRequired }).trim().min(1, messages.nameRequired).max(200, messages.nameTooLong),
    project_type: z.preprocess((value) => value === "" ? null : value, z.enum(PROJECT_TYPE_KEYS, { error: messages.projectTypeInvalid }).nullable()),
    project_type_custom: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().max(100, messages.projectTypeCustomTooLong).optional()),
    country_code: z.string({ error: messages.countryInvalid }).trim().refine(isCountryCode, messages.countryInvalid),
    city: z.string().trim().max(100, messages.cityTooLong).optional(),
    city_geonames_id: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number({ error: messages.cityGeoNamesInvalid }).int(messages.cityGeoNamesInvalid).positive(messages.cityGeoNamesInvalid).max(Number.MAX_SAFE_INTEGER, messages.cityGeoNamesInvalid).optional()),
    client_name: z.string().trim().max(200, messages.clientNameTooLong).optional(),
    description: z.string().trim().max(5000, messages.descriptionTooLong).optional(),
    total_area_m2: z.coerce.number({ error: messages.areaInvalid }).positive(messages.areaPositive),
    priority: z.enum(["low", "normal", "high", "urgent"], { error: messages.priorityInvalid }),
    start_date: dateSchema,
    due_date: z.preprocess((value) => (value === "" ? undefined : value), dateSchema.optional()),
  };
}

function validateDateOrder(
  project: { start_date: string; due_date?: string },
  context: z.RefinementCtx,
  message: string,
) {
  if (project.due_date && project.due_date < project.start_date) {
    context.addIssue({
      code: "custom",
      message,
      path: ["due_date"],
    });
  }
}

export function createProjectSchema(messages: ProjectValidationMessages) {
  return z.object(createProjectFields(messages)).superRefine((project, context) => validateDateOrder(project, context, messages.dueDateBeforeStart));
}

export function createEditProjectSchema(messages: ProjectValidationMessages) {
  return z.object(createProjectFields(messages)).strict().superRefine((project, context) => validateDateOrder(project, context, messages.dueDateBeforeStart));
}

export function createProjectCompletionDateSchema(messages: ProjectValidationMessages) {
  return z.object({ completed_at: createDateSchema(messages.dateInvalid) }).strict().superRefine((project, context) => {
    if (project.completed_at > getKyivDateOnly()) {
      context.addIssue({ code: "custom", message: messages.completionDateFuture, path: ["completed_at"] });
    }
  });
}

export type ProjectFormValues = z.infer<ReturnType<typeof createProjectSchema>>;
export type EditProjectFormValues = z.infer<ReturnType<typeof createEditProjectSchema>>;
export type ProjectFormField = keyof EditProjectFormValues;

export type ProjectFormActionState = {
  formError?: string;
  fieldErrors?: Partial<Record<ProjectFormField | "completed_at", string>>;
  projectId?: string;
};

const projectFormFields: Record<ProjectFormField, true> = {
  city: true,
  city_geonames_id: true,
  client_name: true,
  country_code: true,
  description: true,
  due_date: true,
  name: true,
  priority: true,
  project_type: true,
  project_type_custom: true,
  start_date: true,
  total_area_m2: true,
};

function isProjectFormField(value: PropertyKey): value is ProjectFormField {
  return Object.hasOwn(projectFormFields, value);
}

export function getProjectValidationFailure(error: z.ZodError, formError: string): ProjectFormActionState {
  const fieldErrors: Partial<Record<ProjectFormField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (isProjectFormField(field) && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return { formError, fieldErrors };
}

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
