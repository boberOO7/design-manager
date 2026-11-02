import "server-only";

import { z } from "zod";
import { instantToDateOnly } from "@/lib/calendar";
import { isCountryCode } from "@/lib/countries";
import { crmLeadSchema } from "@/lib/validation/crm";
import { normalizePhoneForCountry, normalizeUkrainianPhone, shouldFormatAsUkrainianPhone } from "@/lib/ukrainian-phone";
import { MetaLeadError, type MetaLead } from "./graph";

// Meta need not collect a country. Keep it unknown rather than using the manual
// form's required country selection or inventing a country from the phone.
const importedLeadSchema = z.object({ ...crmLeadSchema.shape, country_code: z.union([z.literal(""), crmLeadSchema.shape.country_code]) }).superRefine((value, context) => {
  if (value.phone && shouldFormatAsUkrainianPhone(value.phone, value.country_code, true) && !normalizeUkrainianPhone(value.phone)) {
    context.addIssue({ code: "custom", path: ["phone"], message: "Invalid Ukrainian phone number" });
  }
});

export function metaSubmittedAt(lead: MetaLead): string {
  // Missing timestamps must not turn a historical inquiry into today's inquiry.
  const parsed = z.iso.datetime({ offset: true }).safeParse(lead.created_time?.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (!parsed.success) {
    throw new MetaLeadError("missing_or_invalid_created_time", false);
  }
  return new Date(parsed.data).toISOString();
}

// Only exact Meta field keys are mapped. Custom/localized questions remain
// answers, never guessed contact fields. Retain all original values in notes.
export function metaAnswer(lead: MetaLead, name: string) {
  return lead.field_data.filter(field => field.name === name)
    .flatMap(field => field.values).map(value => value.trim()).find(Boolean) ?? "";
}

export function metaContactAnswers(lead: MetaLead) {
  return {
    client_name: metaAnswer(lead, "full_name") || [metaAnswer(lead, "first_name"), metaAnswer(lead, "last_name")].filter(Boolean).join(" "),
    phone: metaAnswer(lead, "phone_number"), email: metaAnswer(lead, "email"),
  };
}

export function mapMetaLead(lead: MetaLead) {
  const answer = (name: string) => metaAnswer(lead, name);
  const contacts = metaContactAnswers(lead);
  const clientName = contacts.client_name;
  if (!clientName) throw new MetaLeadError("missing_client_name", false);
  const country = answer("country").toUpperCase();
  const source = lead.platform === "ig" ? "instagram" : lead.platform === "fb" ? "Facebook Lead Ads" : "Meta Lead Ads";
  const parsed = importedLeadSchema.safeParse({
    client_name: clientName, company: answer("company_name"), email: contacts.email, phone: contacts.phone,
    city: answer("city"), site_address: answer("street_address"), country_code: isCountryCode(country) ? country : "",
    source: source === "instagram" ? "instagram" : "other", source_custom: source,
    budget_amount: "", first_contact_date: instantToDateOnly(metaSubmittedAt(lead)),
    // The complete structured answers stay in the private inbox, including any
    // content exceeding the existing CRM notes limit.
    internal_notes: [
      ...lead.field_data.map(field => `${field.name}: ${field.values.join(", ")}`),
      ...(lead.custom_disclaimer_responses ?? []).map(item => `custom_disclaimer_responses.${item.checkbox_key}: ${item.is_checked}`),
    ].join("\n").slice(0, 10000),
  });
  if (!parsed.success) throw new MetaLeadError("invalid_crm_fields", false);
  const value = parsed.data;
  return {
    client_name: value.client_name, company: value.company || null, email: value.email || null,
    phone: normalizePhoneForCountry(value.phone, value.country_code) || null,
    city: value.city || null, site_address: value.site_address || null, country_code: value.country_code || null,
    source, internal_notes: value.internal_notes || null,
  };
}
