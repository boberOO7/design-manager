import { describe, expect, it } from "vitest";
import { buildProfileHeatmap, getCompletedTenureMonths, summarizeProfileContributions } from "./employee-profile";
import { selectLeaderboardAttributions, type ProductivityContributionAttribution } from "./productivity";
import { employeeProfileNoteSchema } from "./validation/employee-profile-note";

const attribution = (overrides: Partial<ProductivityContributionAttribution> = {}): ProductivityContributionAttribution => ({
  id: "record", project_id: "project", task_id: "task", contributor_id: "employee", contributor_name: "Employee", contributor_job_title: "Architect",
  source_type: "task", completed_at: "2026-10-01T10:00:00.000Z", credited_area_m2: 20, ...overrides,
});

describe("profile completion calendar", () => {
  const now = new Date("2026-10-03T21:30:00Z"); // October 4 in Kyiv.
  const find = (result: ReturnType<typeof buildProfileHeatmap>, date: string) => result.weeks.flat().find((day) => day.date === date);

  it("uses completion dates, deduplicates collaboration and omits unknown/out-of-range dates", () => {
    const result = buildProfileHeatmap({ joinedAt: null, now, tasks: [
      { id: "assigned", completed_at: "2026-10-04" }, { id: "assigned", completed_at: "2026-10-04" },
      { id: "collaborated", completed_at: "2026-10-04" }, { id: "legacy", completed_at: null },
      { id: "old", completed_at: "2024-01-01" }, { id: "future", completed_at: "2026-10-05" },
    ] });
    expect(result.weeks).toHaveLength(52);
    expect(result.weeks.every((week) => week.length === 7)).toBe(true);
    expect(result.total).toBe(2);
    expect(find(result, "2026-10-04")).toMatchObject({ count: 2, level: 2 });
    expect(new Set(result.weeks.flat().map((day) => day.date)).size).toBe(364);
  });

  it("excludes pre-employment and future cells instead of claiming inactivity", () => {
    const result = buildProfileHeatmap({ joinedAt: "2026-10-02", now: new Date("2026-10-01T21:30:00Z"), tasks: [
      { id: "before", completed_at: "2026-10-01" }, { id: "joined", completed_at: "2026-10-02" },
    ] });
    expect(find(result, "2026-10-01")).toMatchObject({ kind: "before_joining", count: 0 });
    expect(find(result, "2026-10-02")).toMatchObject({ kind: "day", count: 1 });
    expect(find(result, "2026-10-03")).toMatchObject({ kind: "future", count: 0 });
    expect(result.total).toBe(1);
  });

  it("marks approved absence, studio days off and weekends without erasing real completions", () => {
    const result = buildProfileHeatmap({ joinedAt: "2024-01-01", now, tasks: [{ id: "during-time-off", completed_at: "2026-10-02" }],
      timeOff: [{ start_date: "2026-10-01", end_date: "2026-10-02" }], studioDaysOff: ["2026-09-30"],
    });
    expect(find(result, "2026-09-30")).toMatchObject({ kind: "studio_day_off", count: 0 });
    expect(find(result, "2026-10-01")).toMatchObject({ kind: "time_off", count: 0 });
    expect(find(result, "2026-10-02")).toMatchObject({ kind: "time_off", count: 1 });
    expect(find(result, "2026-10-03")).toMatchObject({ kind: "weekend", count: 0 });
  });

  it("converts the joining instant to Kyiv before excluding pre-employment dates", () => {
    const result = buildProfileHeatmap({ joinedAt: "2026-10-03T22:30:00Z", now, tasks: [
      { id: "before-local-join", completed_at: "2026-10-03" }, { id: "join-day", completed_at: "2026-10-04" },
    ] });
    expect(find(result, "2026-10-03")).toMatchObject({ kind: "before_joining", count: 0 });
    expect(find(result, "2026-10-04")).toMatchObject({ count: 1 });
    expect(result.total).toBe(1);
  });

  it("keeps date-only bucketing through DST changes and uses discrete count levels", () => {
    const tasks = ["2026-03-28", "2026-03-29", "2026-03-30"].flatMap((completed_at, index) =>
      Array.from({ length: [1, 4, 7][index] }, (_, task) => ({ id: `${index}-${task}`, completed_at })));
    const result = buildProfileHeatmap({ joinedAt: null, now, tasks });
    expect(find(result, "2026-03-28")).toMatchObject({ count: 1, level: 1 });
    expect(find(result, "2026-03-29")).toMatchObject({ count: 4, level: 3 });
    expect(find(result, "2026-03-30")).toMatchObject({ count: 7, level: 4 });
    expect(result.total).toBe(12);
  });
});

describe("personal contribution aggregation", () => {
  it("uses canonical zero-area task counts, fallback area, and configured area exclusions", () => {
    const records = selectLeaderboardAttributions([
      attribution(), attribution({ id: "zero", credited_area_m2: 0 }),
      attribution({ id: "fallback", task_id: null, source_type: "project_fallback", credited_area_m2: 40 }),
      attribution({ id: "excluded", project_id: "excluded", credited_area_m2: 100 }),
      attribution({ id: "colleague", contributor_id: "colleague", credited_area_m2: 200 }),
    ], new Set(["excluded"]));
    expect(summarizeProfileContributions(records, "employee", new Date("2026-10-03T12:00:00Z"))).toMatchObject({ areaM2: 60, completedTasks: 3 });
  });

  it("groups history by Kyiv month boundaries and keeps older work in all-time totals", () => {
    const result = summarizeProfileContributions([
      attribution({ completed_at: "2026-09-30T20:59:59.999Z", credited_area_m2: 10 }),
      attribution({ completed_at: "2026-09-30T21:00:00+00:00", credited_area_m2: 30 }),
      attribution({ completed_at: "2025-01-01T10:00:00.000Z", credited_area_m2: 60 }),
    ], "employee", new Date("2026-10-03T12:00:00Z"));
    expect(result).toMatchObject({ areaM2: 100, completedTasks: 3 });
    expect(result.history).toHaveLength(6);
    expect(result.history[4]).toMatchObject({ areaM2: 10, completedTasks: 1 });
    expect(result.history[5]).toMatchObject({ areaM2: 30, completedTasks: 1 });
  });

  it("returns real zeros for an empty ledger", () => {
    const result = summarizeProfileContributions([], "employee");
    expect(result.areaM2).toBe(0);
    expect(result.completedTasks).toBe(0);
    expect(result.history.every((entry) => entry.areaM2 === 0 && entry.completedTasks === 0)).toBe(true);
  });
});

describe("profile tenure and note inputs", () => {
  it("derives completed months from the work start date in Kyiv", () => {
    expect(getCompletedTenureMonths("2024-10-03", new Date("2026-10-02T21:00:00Z"))).toBe(24);
    expect(getCompletedTenureMonths("2024-10-04", new Date("2026-10-02T21:00:00Z"))).toBe(23);
    expect(getCompletedTenureMonths("2024-10-03T22:30:00Z", new Date("2026-10-03T12:00:00Z"))).toBe(23);
    expect(getCompletedTenureMonths(null)).toBeNull();
    expect(getCompletedTenureMonths("2030-01-01", new Date("2026-10-03T00:00:00Z"))).toBeNull();
  });

  it("validates an independent review month and nonblank note", () => {
    const input = { employeeId: "92000000-0000-4000-8000-000000000012", reviewMonth: "2026-09", note: "  Helpful feedback  " };
    expect(employeeProfileNoteSchema.parse(input).note).toBe("Helpful feedback");
    for (const reviewMonth of ["2026-13", "2026-00", "2026-9", "0000-01", "2026-09-01"]) expect(employeeProfileNoteSchema.safeParse({ ...input, reviewMonth }).success).toBe(false);
    expect(employeeProfileNoteSchema.safeParse({ ...input, note: " \n\t " }).success).toBe(false);
    expect(employeeProfileNoteSchema.safeParse({ ...input, employeeId: "invalid" }).success).toBe(false);
  });
});
