import { z } from "zod";
import { isCountryCode } from "@/lib/countries";
import { PROJECT_TYPE_KEYS } from "@/lib/validation/project";
import { CRM_BUDGET_CURRENCIES } from "@/lib/crm-budget";
import { normalizeUkrainianPhone, shouldFormatAsUkrainianPhone } from "@/lib/ukrainian-phone";

export const CRM_LEAD_STATUSES = ["new", "contacted", "discussion", "proposal", "won", "lost"] as const;
export const CRM_LEAD_SOURCE_KEYS = ["website", "instagram", "referral", "partner"] as const;
export const RECRUITING_STAGES = ["new", "interview_scheduled", "interview_completed", "test_task", "decision"] as const;
export const RECRUITING_OUTCOMES = ["hired", "reserve", "rejected"] as const;

export type CrmLeadSourceKey = (typeof CRM_LEAD_SOURCE_KEYS)[number];
export type CrmLeadSourceSelection = CrmLeadSourceKey | "" | "other";

export function isCrmLeadStatus(value: string): value is (typeof CRM_LEAD_STATUSES)[number] {
  return CRM_LEAD_STATUSES.some((status) => status === value);
}

export function isCrmLeadSourceKey(value: string | null | undefined): value is CrmLeadSourceKey {
  return CRM_LEAD_SOURCE_KEYS.some((key) => key === value);
}

export function getCrmLeadSourceFormValues(value: string | null | undefined): { source: CrmLeadSourceSelection; sourceCustom: string } {
  if (isCrmLeadSourceKey(value)) return { source: value, sourceCustom: "" };
  return value ? { source: "other", sourceCustom: value } : { source: "", sourceCustom: "" };
}

export function resolveCrmLeadSourceValue(source: CrmLeadSourceSelection, sourceCustom: string): string {
  return source === "other" ? sourceCustom : source;
}

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("");
const optionalUrl = z.union([z.literal(""), z.url().max(2000)]).optional().default("");
const optionalDate = z.union([z.literal(""), z.iso.date()]).optional().default("");
const optionalDateTime = z.union([z.literal(""), z.iso.datetime({ local: true })]).optional().default("");
const optionalUuid = z.union([z.literal(""), z.uuid()]).optional().default("");
const optionalEmail = z.string().trim().toLowerCase().max(320).refine((value) => !value || z.email().safeParse(value).success).optional().default("");

export const crmLeadSchema = z.object({
  client_name: z.string().trim().min(1).max(200),
  company: optionalText(200),
  email: optionalEmail,
  phone: optionalText(80),
  source: z.union([z.literal(""), z.enum(CRM_LEAD_SOURCE_KEYS), z.literal("other")]),
  source_custom: optionalText(160),
  request_description: optionalText(5000),
  expected_project_type: z.union([z.literal(""), z.enum(PROJECT_TYPE_KEYS)]).optional().default(""),
  expected_project_type_custom: optionalText(100),
  city: optionalText(160),
  city_geonames_id: z.union([z.literal(""), z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).optional().default(""),
  country_code: z.string().trim().refine((value) => value === "__legacy__" || isCountryCode(value)),
  approximate_area: z.union([z.literal(""), z.coerce.number().min(0).max(9999999999)]).optional().default(""),
  budget_amount: z.string().trim().max(50),
  budget_currency: z.enum(CRM_BUDGET_CURRENCIES).optional().default("UAH"),
  responsible_admin_id: optionalUuid,
  first_contact_date: z.iso.date(),
  next_contact_date: optionalDate,
  internal_notes: optionalText(10000),
  status: z.enum(CRM_LEAD_STATUSES).optional().default("new"),
}).superRefine((value, context) => {
  if (value.phone && shouldFormatAsUkrainianPhone(value.phone, value.country_code, true) && !normalizeUkrainianPhone(value.phone)) {
    context.addIssue({ code: "custom", path: ["phone"], message: "Invalid Ukrainian phone number" });
  }
});

export const crmCandidateSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: optionalEmail,
  phone: optionalText(80),
  external_profile_url: optionalUrl,
  source: z.union([z.literal(""), z.enum(CRM_LEAD_SOURCE_KEYS), z.literal("other")]),
  source_custom: optionalText(160),
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
  test_task_result: optionalText(10000),
});

export type CrmActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

export function formValues(formData: FormData) {
  return Object.fromEntries(formData.entries());
}
