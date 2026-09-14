import { describe, expect, it } from "vitest";
import { filterCandidates, filterCrmLeadsNeedingAttention, filterLeads, getCrmFollowUpFormValues, getCrmFollowUpQuickChoice, isCrmFollowUpOverdue, resolveCrmFollowUpAt } from "@/lib/crm";
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

  it("resolves lead follow-ups to concrete Kyiv timestamps", () => {
    expect(resolveCrmFollowUpAt("2026-09-15", "15:00")).toBe("2026-09-15T12:00:00.000Z");
    expect(resolveCrmFollowUpAt("2026-09-15", "")).toBe("2026-09-15T06:00:00.000Z");
    expect(getCrmFollowUpFormValues("2026-09-15T12:00:00.000Z")).toEqual({ date: "2026-09-15", time: "15:00" });
  });

  it("keeps quick choices concrete and overdue until explicitly cleared", () => {
    const morning = new Date("2026-09-15T08:12:00.000Z");
    expect(getCrmFollowUpQuickChoice("today", morning)).toEqual({ date: "2026-09-15", time: "11:45" });
    expect(getCrmFollowUpQuickChoice("tomorrow", morning)).toEqual({ date: "2026-09-16", time: "09:00" });
    expect(getCrmFollowUpQuickChoice("after_lunch", morning)).toEqual({ date: "2026-09-15", time: "15:00" });
    expect(getCrmFollowUpQuickChoice("after_lunch", new Date("2026-09-15T13:00:00.000Z"))).toEqual({ date: "2026-09-16", time: "15:00" });
    expect(isCrmFollowUpOverdue("2026-09-15T12:00:00.000Z", new Date("2026-09-15T12:01:00.000Z").getTime())).toBe(true);
  });

  it("finds only active overdue follow-ups assigned to the current administrator", () => {
    const overdue = { ...lead, id: "overdue", next_contact_at: "2026-09-15T11:59:00.000Z", responsible_admin_id: "me", notification_read_at: "2026-09-15T12:00:00.000Z" };
    const leads = [
      overdue,
      { ...overdue, id: "future", next_contact_at: "2026-09-15T12:01:00.000Z" },
      { ...overdue, id: "completed", next_contact_at: null },
      { ...overdue, id: "other-admin", responsible_admin_id: "someone-else" },
      { ...overdue, id: "invalid", status: "invalid" },
    ];

    expect(filterCrmLeadsNeedingAttention(leads, "me", new Date("2026-09-15T12:00:00.000Z").getTime())).toEqual([overdue]);
    expect(filterCrmLeadsNeedingAttention(leads, null)).toEqual([]);
  });
});
