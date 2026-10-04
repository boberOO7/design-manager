import { describe, expect, it } from "vitest";
import { buildCrmStatistics, type StatisticsLead } from "@/lib/statistics-crm";
import type { StatisticsActivity } from "@/lib/statistics";

const range = { from: "2025-01-01", through: "2025-03-31" };
const lead = (overrides: Partial<StatisticsLead> = {}): StatisticsLead => ({
  id: "lead-1", created_at: "2025-01-10T09:00:00Z", first_contact_date: "2025-01-10",
  status: "new", invalid_reason: null, project_id: null, source: null, ...overrides,
});
const activity = (project_id: string, from: string, to: string, created_at: string): StatisticsActivity => ({
  project_id, changes: { status: { from, to } }, created_at,
});
const report = (leads: StatisticsLead[], activities: StatisticsActivity[] = []) =>
  buildCrmStatistics(leads, activities, range, range.through);

describe("CRM statistics", () => {
  it("uses all eligible creation-cohort leads, including open leads, for current success rate", () => {
    const result = report([
      lead({ id: "won", status: "won" }),
      lead({ id: "open", status: "discussion" }),
      lead({ id: "lost", status: "lost" }),
      lead({ id: "duplicate", status: "invalid", invalid_reason: "duplicate" }),
      lead({ id: "false", status: "invalid", invalid_reason: "not_submitted" }),
      lead({ id: "older-won", status: "won", created_at: "2024-12-01T10:00:00Z" }),
      lead({ id: "future", created_at: "2025-04-01T10:00:00Z" }),
    ]);
    expect(result.cohort).toEqual({ sample: 3, won: 1, open: 1, lost: 1, successRate: 1 / 3, excludedInvalid: 2 });
    expect(result.months).toEqual([
      { month: "2025-01-01", newLeads: 3 }, { month: "2025-02-01", newLeads: 0 }, { month: "2025-03-01", newLeads: 0 },
    ]);
    expect(result.asOf).toBe("2025-03-31");
  });

  it("deduplicates identities and uses current outcomes without multiplying lifecycle cycles", () => {
    const won = lead({ status: "won", project_id: "project-1" });
    const result = report([lead(), won, won], [
      activity("project-1", "planned", "active", "2025-01-20T10:00:00Z"),
      activity("project-1", "active", "paused", "2025-01-22T10:00:00Z"),
      activity("project-1", "paused", "active", "2025-02-01T10:00:00Z"),
    ]);
    expect(result.cohort).toMatchObject({ sample: 1, won: 1, successRate: 1 });
    expect(result.contactToStart).toEqual({ medianDays: 10, sample: 1, missing: 0, linkedWon: 1 });
  });

  it("keeps an open small sample and an empty cohort honest", () => {
    expect(report([lead()]).cohort).toMatchObject({ sample: 1, open: 1, won: 0, successRate: 0 });
    expect(report([]).cohort.successRate).toBeNull();
    expect(report([]).contactToStart).toMatchObject({ medianDays: null, sample: 0, missing: 0 });
  });

  it("places creation and project activation timestamps in the Kyiv calendar day", () => {
    const result = report([
      lead({ status: "won", project_id: "project-1", created_at: "2024-12-31T22:30:00Z", first_contact_date: "2025-01-01" }),
      lead({ id: "february", created_at: "2025-01-31T22:30:00Z" }),
    ], [activity("project-1", "planned", "active", "2025-01-01T22:30:00Z")]);
    expect(result.months.map(month => month.newLeads)).toEqual([1, 1, 0]);
    expect(result.contactToStart.medianDays).toBe(1);
  });

  it("uses actual start evidence and reports missing pairs instead of substituting created dates", () => {
    const result = report([
      lead({ id: "valid", status: "won", project_id: "valid" }),
      lead({ id: "same-day", status: "won", project_id: "same-day" }),
      lead({ id: "unlinked", status: "won" }),
      lead({ id: "absent", status: "won", project_id: "absent" }),
      lead({ id: "legacy", status: "won", project_id: "legacy" }),
      lead({ id: "bad-contact", status: "won", project_id: "bad-contact", first_contact_date: "2025-02-30" }),
      lead({ id: "before-contact", status: "won", project_id: "before-contact" }),
      lead({ id: "future-start", status: "won", project_id: "future-start" }),
    ], [
      activity("valid", "planned", "active", "2025-01-30T10:00:00Z"),
      activity("same-day", "planned", "active", "2025-01-10T10:00:00Z"),
      activity("legacy", "paused", "active", "2025-01-30T10:00:00Z"),
      activity("bad-contact", "planned", "active", "2025-03-15T10:00:00Z"),
      activity("before-contact", "planned", "active", "2025-01-09T10:00:00Z"),
      activity("future-start", "planned", "active", "2025-04-01T10:00:00Z"),
    ]);
    expect(result.contactToStart).toEqual({ medianDays: 10, sample: 2, missing: 6, linkedWon: 7 });
  });

  it("does not measure a linked open lead as won, and clips evidence to the observation cutoff", () => {
    const result = buildCrmStatistics([
      lead({ id: "open", project_id: "open" }),
      lead({ id: "won", status: "won", project_id: "won" }),
      lead({ id: "future", created_at: "2025-02-01T10:00:00Z" }),
    ], [
      activity("open", "planned", "active", "2025-01-20T10:00:00Z"),
      activity("won", "planned", "active", "2025-02-01T10:00:00Z"),
    ], range, "2025-01-31");
    expect(result.through).toBe("2025-01-31");
    expect(result.cohort.sample).toBe(2);
    expect(result.contactToStart).toMatchObject({ sample: 0, missing: 1, linkedWon: 1 });
    expect(result.months).toHaveLength(1);
  });

  it("rejects a logged administrative start contradicted by earlier completed work", () => {
    const result = buildCrmStatistics([lead({ status: "won", project_id: "imported" })],
      [activity("imported", "planned", "active", "2025-02-20T10:00:00Z")], range, range.through,
      [{ id: "earlier-task", project_id: "imported", completed_at: "2025-01-20" }]);
    expect(result.contactToStart).toMatchObject({ sample: 0, missing: 1, medianDays: null });
  });

  it("reports acquisition coverage without invented free-text normalization or a sample threshold", () => {
    const result = report([
      lead({ id: "a", source: " Instagram " }), lead({ id: "b", source: "instagram" }),
      lead({ id: "c", source: "Instagram" }), lead({ id: "unknown", source: "  " }),
      lead({ id: "invalid", source: "Referral", status: "invalid", invalid_reason: "duplicate" }),
    ]);
    expect(result.sources).toEqual({
      known: [{ source: "Instagram", count: 2 }, { source: "instagram", count: 1 }], knownCount: 3, unknownCount: 1,
    });
    expect(report([lead({ source: "Referral" })]).sources.knownCount).toBe(1);
  });
});
