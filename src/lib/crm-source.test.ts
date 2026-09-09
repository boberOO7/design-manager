import { describe, expect, it } from "vitest";
import { crmLeadSchema, getCrmLeadSourceFormValues, resolveCrmLeadSourceValue } from "@/lib/validation/crm";

const validLead = {
  approximate_area: "",
  budget_amount: "",
  budget_currency: "UAH",
  city: "",
  city_geonames_id: "",
  client_name: "Client",
  company: "",
  country_code: "UA",
  email: "",
  expected_project_type: "",
  expected_project_type_custom: "",
  first_contact_date: "2026-09-08",
  internal_notes: "",
  next_contact_date: "",
  phone: "",
  request_description: "",
  responsible_admin_id: "",
  source_custom: " BELONG agency ",
  status: "new",
};

describe("CRM lead source selection", () => {
  it("stores stable keys for predefined sources and the entered meaning for Other", () => {
    expect(crmLeadSchema.parse({ ...validLead, source: "instagram" }).source).toBe("instagram");
    const custom = crmLeadSchema.parse({ ...validLead, source: "other" });
    expect(resolveCrmLeadSourceValue(custom.source, custom.source_custom)).toBe("BELONG agency");
  });

  it("restores arbitrary legacy source text through Other without losing it", () => {
    expect(getCrmLeadSourceFormValues("Architecture expo")).toEqual({ source: "other", sourceCustom: "Architecture expo" });
    expect(getCrmLeadSourceFormValues("website")).toEqual({ source: "website", sourceCustom: "" });
    expect(getCrmLeadSourceFormValues(null)).toEqual({ source: "", sourceCustom: "" });
  });

  it("rejects unrecognized values submitted as predefined options", () => {
    expect(crmLeadSchema.safeParse({ ...validLead, source: "Architecture expo" }).success).toBe(false);
  });

  it("normalizes optional email and validates email and Ukrainian phone values", () => {
    const normalized = crmLeadSchema.parse({ ...validLead, source: "", email: "  NAME@Example.COM ", phone: "+380 (67) 123-45-67" });
    expect(normalized.email).toBe("name@example.com");
    expect(crmLeadSchema.safeParse({ ...validLead, source: "", email: "not-an-email" }).success).toBe(false);
    expect(crmLeadSchema.safeParse({ ...validLead, source: "", phone: "+380 (67) 123" }).success).toBe(false);
    expect(crmLeadSchema.safeParse({ ...validLead, source: "", phone: "+44 20 1234 5678" }).success).toBe(true);
  });
});
