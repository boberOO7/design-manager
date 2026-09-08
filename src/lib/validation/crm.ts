import { z } from "zod";
import { isCountryCode } from "@/lib/countries";
import { PROJECT_TYPE_KEYS } from "@/lib/validation/project";

export const CRM_LEAD_STATUSES = ["new", "contacted", "discussion", "proposal", "won", "lost"] as const;
export const RECRUITING_STAGES = ["new", "interview_scheduled", "interview_completed", "test_task", "decision"] as const;
export const RECRUITING_OUTCOMES = ["hired", "reserve", "rejected"] as const;

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("");
const optionalUrl = z.union([z.literal(""), z.url().max(2000)]).optional().default("");
const optionalDate = z.union([z.literal(""), z.iso.date()]).optional().default("");
const optionalDateTime = z.union([z.literal(""), z.iso.datetime({ local: true })]).optional().default("");
const optionalUuid = z.union([z.literal(""), z.uuid()]).optional().default("");

export const crmLeadSchema = z.object({
  client_name: z.string().trim().min(1).max(200),
  company: optionalText(200),
  email: z.union([z.literal(""), z.email().max(320)]).optional().default(""),
  phone: optionalText(80),
  source: optionalText(160),
  request_description: optionalText(5000),
  expected_project_type: z.union([z.literal(""), z.enum(PROJECT_TYPE_KEYS)]).optional().default(""),
  expected_project_type_custom: optionalText(100),
  city: optionalText(160),
  city_geonames_id: z.union([z.literal(""), z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).optional().default(""),
  country_code: z.string().trim().refine((value) => value === "__legacy__" || isCountryCode(value)),
  approximate_area: z.union([z.literal(""), z.coerce.number().min(0).max(9999999999)]).optional().default(""),
  budget: z.string().trim().max(50),
  responsible_admin_id: optionalUuid,
  first_contact_date: z.iso.date(),
  next_contact_date: optionalDate,
  internal_notes: optionalText(10000),
  status: z.enum(CRM_LEAD_STATUSES),
});

export const crmCandidateSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.union([z.literal(""), z.email().max(320)]).optional().default(""),
  phone: optionalText(80),
  external_profile_url: optionalUrl,
  source: optionalText(160),
  responsible_admin_id: optionalUuid,
  internal_notes: optionalText(10000),
  target_position: z.string().trim().min(1).max(200),
});

export const crmCandidateContactSchema = crmCandidateSchema.omit({ target_position: true });

export const crmRecruitingCycleSchema = z.object({
  target_position: z.string().trim().min(1).max(200),
  stage: z.enum(RECRUITING_STAGES),
  outcome: z.union([z.literal(""), z.enum(RECRUITING_OUTCOMES)]),
  next_contact_date: optionalDate,
  interview_at: optionalDateTime,
  interview_notes: optionalText(10000),
  test_task_result: optionalText(10000),
  decision_notes: optionalText(10000),
});

export type CrmActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

export function formValues(formData: FormData) {
  return Object.fromEntries(formData.entries());
}
