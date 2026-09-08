import { describe, expect, it } from "vitest";
import { filterCandidates, filterLeads } from "@/lib/crm";
const lead = { client_name: "Anna", company: "North", email: "anna@test.com", phone: null, request_description: "Apartment", status: "new" };
const candidate = { full_name: "Oleh", email: null, phone: null, source: "Referral", cycles: [{ target_position: "Architect", outcome: null }] };

describe("CRM filters", () => {
  it("searches leads and filters their status", () => {
    expect(filterLeads([lead], "apartment", "new")).toEqual([lead]);
    expect(filterLeads([lead], "anna", "won")).toEqual([]);
  });

  it("keeps active and reserve candidates discoverable by position", () => {
    expect(filterCandidates([candidate], "oleh", "active", "Architect")).toEqual([candidate]);
    const reserve = { ...candidate, cycles: [{ ...candidate.cycles[0], outcome: "reserve" as const }] };
    expect(filterCandidates([reserve], "", "reserve", "")).toEqual([reserve]);
    expect(filterCandidates([reserve], "", "active", "")).toEqual([]);
  });
});
