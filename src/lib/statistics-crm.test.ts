import { describe, expect, it } from "vitest";
import { buildCrmStatistics, type StatisticsLead, type StatisticsLeadHistory } from "@/lib/statistics-crm";
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
    expect(result.contactToStart).toEqual({ medianDays: 10, meanDays: 10, sample: 1, missing: 0, linkedWon: 1 });
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
    expect(result.contactToStart).toEqual({ medianDays: 10, meanDays: 10, sample: 2, missing: 6, linkedWon: 7 });
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
      lead({ id: "custom-a", source: "Partner Referral" }), lead({ id: "custom-b", source: "partner referral" }),
      lead({ id: "invalid", source: "Referral", status: "invalid", invalid_reason: "duplicate" }),
    ]);
    expect(result.sources.known.find(row => row.source === "instagram")?.count).toBe(3);
    expect(result.sources.known).toContainEqual({ source: "Partner Referral", count: 1 });
    expect(result.sources.known).toContainEqual({ source: "partner referral", count: 1 });
    expect(result.sources).toMatchObject({ knownCount: 5, unknownCount: 1 });
    expect(report([lead({ source: "Referral" })]).sources.knownCount).toBe(1);
  });

  it("measures observed CRM stage stays from actor-backed creation and stable transitions", () => {
    const history = (id: string, lead_id: string, event_type: string, actor_id: string | null,
      previous_status: StatisticsLeadHistory["previous_status"], new_status: StatisticsLeadHistory["new_status"], created_at: string): StatisticsLeadHistory => ({
      id, lead_id, event_type, actor_id, previous_status, new_status, created_at,
    });
    const leads = [
      lead({ id: "complete", status: "won", created_at: "2025-01-01T00:00:00Z" }),
      lead({ id: "backfill", status: "discussion", created_at: "2025-01-01T00:00:00Z" }),
      lead({ id: "open", status: "discussion", created_at: "2025-01-01T00:00:00Z" }),
      lead({ id: "repeat", status: "won", created_at: "2025-01-01T00:00:00Z" }),
      lead({ id: "ambiguous", status: "won", created_at: "2025-01-01T00:00:00Z" }),
    ];
    const historyRows = [
      history("complete-created", "complete", "created", "actor", null, "new", "2025-01-01T00:00:00Z"),
      history("complete-contact", "complete", "status_changed", "actor", "new", "contacted", "2025-01-03T00:00:00Z"),
      history("complete-discussion", "complete", "status_changed", "actor", "contacted", "discussion", "2025-01-06T00:00:00Z"),
      history("complete-proposal", "complete", "status_changed", "actor", "discussion", "proposal", "2025-01-10T00:00:00Z"),
      history("complete-won", "complete", "status_changed", "actor", "proposal", "won", "2025-01-15T00:00:00Z"),
      history("closed-lost", "complete", "status_changed", "actor", "won", "lost", "2025-01-16T00:00:00Z"),
      history("closed-won", "complete", "status_changed", "actor", "lost", "won", "2025-01-17T00:00:00Z"),
      // Legacy creation backfills have no actor and cannot start a measured stay.
      history("backfill-created", "backfill", "created", null, null, "new", "2025-01-01T00:00:00Z"),
      history("backfill-discussion", "backfill", "status_changed", "actor", "contacted", "discussion", "2025-01-04T00:00:00Z"),
      history("backfill-proposal", "backfill", "status_changed", "actor", "discussion", "proposal", "2025-01-06T00:00:00Z"),
      history("open-created", "open", "created", "actor", null, "new", "2025-01-01T00:00:00Z"),
      history("open-contact", "open", "status_changed", "actor", "new", "contacted", "2025-01-05T00:00:00Z"),
      history("repeat-created", "repeat", "created", "actor", null, "new", "2025-01-01T00:00:00Z"),
      history("repeat-same", "repeat", "status_changed", "actor", "new", "new", "2025-01-02T00:00:00Z"),
      history("repeat-contact", "repeat", "status_changed", "actor", "new", "contacted", "2025-01-03T00:00:00Z"),
      history("repeat-skipped", "repeat", "status_changed", "actor", "discussion", "proposal", "2025-01-04T00:00:00Z"),
      history("repeat-won", "repeat", "status_changed", "actor", "proposal", "won", "2025-01-06T00:00:00Z"),
      history("ambiguous-created", "ambiguous", "created", "actor", null, "new", "2025-01-01T00:00:00Z"),
      history("ambiguous-contact", "ambiguous", "status_changed", "actor", "new", "contacted", "2025-01-02T00:00:00Z"),
      history("ambiguous-lost", "ambiguous", "status_changed", "actor", "new", "lost", "2025-01-02T00:00:00Z"),
      history("future", "complete", "status_changed", "actor", "won", "lost", "2025-04-01T00:00:00Z"),
    ];
    // Repeated query IDs are one history row, not extra stage samples.
    historyRows.push(historyRows[1]);
    const result = buildCrmStatistics(leads, [], range, range.through, [], historyRows);
    expect(result.lifecycle.firstContact).toEqual({ sample: 2, medianDays: 3, meanDays: 3 });
    expect(result.lifecycle.stages).toEqual([
      { status: "contacted", sample: 1, medianDays: 3, meanDays: 3, leads: 1 },
      { status: "discussion", sample: 2, medianDays: 3, meanDays: 3, leads: 2 },
      { status: "proposal", sample: 2, medianDays: 3.5, meanDays: 3.5, leads: 2 },
    ]);
  });
});
