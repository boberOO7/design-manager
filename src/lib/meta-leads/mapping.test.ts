import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mapMetaLead, metaSubmittedAt } from "./mapping";
import type { MetaLead } from "./graph";

const lead = (overrides: Partial<MetaLead> = {}): MetaLead => ({
  id: "456", created_time: "2026-10-30T23:30:00+0000", form_id: "789",
  field_data: [{ name: "full_name", values: ["  Олена Тест  "] }, { name: "email", values: ["CLIENT@EXAMPLE.COM"] }, { name: "phone_number", values: ["+380501234567"] }, { name: "custom_question", values: ["Відповідь", "Ще одна"] }], ...overrides,
});

describe("Meta to existing CRM mapping", () => {
  it("uses actual names, normalizes existing contact fields and preserves custom answers", () => {
    const result = mapMetaLead(lead());
    expect(result).toMatchObject({ client_name: "Олена Тест", email: "client@example.com", phone: "+380501234567", country_code: null, source: "Meta Lead Ads" });
    expect(result.internal_notes).toContain("custom_question: Відповідь, Ще одна");
    expect(result).not.toHaveProperty("studio_id"); expect(result).not.toHaveProperty("responsible_admin_id");
  });
  it("joins supplied first/last names but never substitutes email, phone or an invented name", () => {
    expect(mapMetaLead(lead({ field_data: [{ name: "first_name", values: ["Олена"] }, { name: "last_name", values: ["Тест"] }] })).client_name).toBe("Олена Тест");
    expect(() => mapMetaLead(lead({ field_data: [{ name: "email", values: ["client@example.test"] }] }))).toThrow("missing_client_name");
  });
  it("requires the actual submission time, preserving instants with timezone offsets", () => {
    expect(metaSubmittedAt(lead())).toBe("2026-10-30T23:30:00.000Z");
    expect(() => mapMetaLead(lead({ created_time: undefined }))).toThrow("missing_or_invalid_created_time");
    expect(() => mapMetaLead(lead({ created_time: "2026-10-31T10:30:00" }))).toThrow("missing_or_invalid_created_time");
    expect(() => mapMetaLead(lead({ created_time: "2026-02-30T10:30:00Z" }))).toThrow("missing_or_invalid_created_time");
  });
  it("uses platform only when Graph explicitly attributes it", () => {
    expect(mapMetaLead(lead({ platform: "ig" })).source).toBe("instagram");
    expect(mapMetaLead(lead({ platform: "fb" })).source).toBe("Facebook Lead Ads");
    expect(mapMetaLead(lead({ platform: "unknown" })).source).toBe("Meta Lead Ads");
  });
  it("keeps unknown country null and rejects invalid or oversized CRM fields", () => {
    expect(mapMetaLead(lead()).country_code).toBeNull();
    expect(() => mapMetaLead(lead({ field_data: [{ name: "full_name", values: ["x".repeat(201)] }] }))).toThrow("invalid_crm_fields");
    expect(() => mapMetaLead(lead({ field_data: [{ name: "full_name", values: ["Name"] }, { name: "email", values: ["invalid"] }] }))).toThrow("invalid_crm_fields");
  });
});
