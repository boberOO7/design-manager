import { describe, expect, it } from "vitest";
import type { ProductivityContributionAttribution } from "@/lib/productivity";
import {
  buildStatistics,
  recordedProjectDuration,
  recordedProjectAge,
  type StatisticsActivity,
  type StatisticsProject,
  type StatisticsSources,
} from "@/lib/statistics";

const project = (overrides: Partial<StatisticsProject> = {}): StatisticsProject => ({
  id: "project-1", name: "Project", status: "completed", archived_at: null, started_at: "2025-03-01", completed_at: "2025-03-12",
  include_in_productivity: true, total_area_m2: 100, ...overrides,
});
const activity = (id: string, from: string, to: string, created_at: string): StatisticsActivity => ({
  project_id: id, created_at, changes: { status: { from, to } },
});
const attribution = (overrides: Partial<ProductivityContributionAttribution> = {}): ProductivityContributionAttribution => ({
  id: "credit-1", project_id: "project-1", task_id: "task-1", contributor_id: "person-1", contributor_name: "Person",
  contributor_job_title: "Designer", credited_area_m2: 100, source_type: "task", task_stage: "stage_2",
  completed_at: "2025-03-12T10:00:00.000Z", ...overrides,
});
const emptySources = (overrides: Partial<StatisticsSources> = {}): StatisticsSources => ({
  projects: [], tasks: [], activities: [], attributions: [], ...overrides,
});
describe("Statistics metric definitions", () => {
  it("keeps 100 physical m² separate from 200 legitimate discipline credits and deduplicates repeated source IDs", () => {
    const designer = attribution();
    const architect = attribution({ id: "credit-2", task_id: "task-2", contributor_id: "architect", credited_area_m2: 100 });
    const task = { id: "task-1", project_id: "project-1", completed_at: "2025-03-12" };
    const report = buildStatistics(emptySources({ projects: [project(), project()],
      tasks: [task, task, { ...task, id: "task-2" }], attributions: [designer, architect, designer],
    }), "all", "2025-04-30");
    expect(report.totals).toMatchObject({ physicalArea: 100, creditedArea: 200, completedProjects: 1, completedTasks: 2, contributors: 2 });
  });

  it("preserves canonical snapshot credits after deletion and on unfinished projects", () => {
    const report = buildStatistics(emptySources({ projects: [project({ status: "active", completed_at: null })],
      attributions: [attribution({ task_id: null }), attribution({ id: "deleted-project-credit", project_id: "deleted", task_id: null })],
    }), "all", "2025-04-30");
    expect(report.totals.creditedArea).toBe(200);
    expect(report.totals.physicalArea).toBeNull();
  });

  it("uses authoritative actual dates without needing audit events or estimating missing starts", () => {
    expect(recordedProjectDuration(project({ completed_at: "2025-03-20" }), "2025-04-01")).toMatchObject({ started: "2025-03-01", completed: "2025-03-20", days: 19 });
    expect(recordedProjectDuration(project({ started_at: "2025-03-12" }), "2025-04-01")?.days).toBe(0);
    for (const overrides of [{ started_at: null }, { started_at: "2025-03-13" }, { started_at: "2025-02-30" }, { completed_at: "not-a-date" }, { completed_at: null }, { completed_at: "2025-05-01" }]) {
      expect(recordedProjectDuration(project(overrides), "2025-04-01")).toBeNull();
    }
  });

  it("includes and recalculates a legacy project only after its actual start is corrected", () => {
    const sources = emptySources({ projects: [project({ started_at: null })], activities: [activity("project-1", "planned", "active", "2025-03-01T10:00:00Z")] });
    const missing = buildStatistics(sources, "all", "2025-04-30");
    expect(missing.durations).toEqual([]);
    expect(missing.coverage).toMatchObject({ durationProjects: 0, selectedProjects: 1 });
    sources.projects[0].started_at = "2024-12-01";
    expect(buildStatistics(sources, "all", "2025-04-30").totals.medianDays).toBe(101);
    sources.projects[0].started_at = "2025-03-01";
    expect(buildStatistics(sources, "all", "2025-04-30").totals.medianDays).toBe(11);
  });

  it("excludes ongoing projects with missing or future actual starts", () => {
    expect(recordedProjectAge(project({ status: "active", completed_at: null, started_at: null }), "2025-04-01")).toBeNull();
    expect(recordedProjectAge(project({ status: "paused", completed_at: null, started_at: "2025-04-02" }), "2025-04-01")).toBeNull();
  });

  it("measures active and paused project age as of today independently of selected period", () => {
    const projects = [
      project({ id: "active", started_at: "2025-01-01", status: "active", completed_at: null }),
      project({ id: "paused", started_at: "2025-02-01", status: "paused", completed_at: null }),
      project({ id: "planned", status: "planned", completed_at: null }),
      project({ id: "completed", status: "completed", completed_at: "2025-03-15" }),
      project({ id: "archived", status: "active", archived_at: "2025-03-10", completed_at: null }),
      project({ id: "unreliable", started_at: null, status: "active", completed_at: null }),
      project({ id: "paused-unreliable", started_at: null, status: "paused", completed_at: null }),
    ];
    const activities = [
      activity("active", "planned", "active", "2025-01-01T10:00:00Z"),
      activity("paused", "planned", "active", "2025-02-01T10:00:00Z"),
      activity("unreliable", "paused", "active", "2025-01-01T10:00:00Z"),
    ];
    const narrow = buildStatistics(emptySources({ projects, activities }), "3", "2025-04-30");
    const wide = buildStatistics(emptySources({ projects, activities }), "all", "2025-04-30");
    expect(narrow.ongoing).toEqual(wide.ongoing);
    expect(narrow.ongoing.map(({ id, days }) => [id, days])).toEqual([["active", 119], ["paused", 88]]);
    expect(narrow.coverage.ongoingProjects).toBe(4);
    expect(narrow.coverage.pausedOngoingProjects).toBe(2);
    // Excluding paused projects must also exclude those without a reliable start.
    expect(narrow.coverage.ongoingProjects - narrow.coverage.pausedOngoingProjects).toBe(2);
  });

  it("counts completed physical project area once, including archived production projects, and excludes non-production projects", () => {
    const report = buildStatistics(emptySources({ projects: [
      project({ id: "done", total_area_m2: 80 }),
      project({ id: "archived", status: "archived", archived_at: "2025-04-01", completed_at: "2025-04-01", total_area_m2: 120 }),
      project({ id: "admin", include_in_productivity: false, total_area_m2: 900 }),
    ] }), "all", "2025-04-30");
    expect(report.totals.physicalArea).toBe(200);
    expect(report.totals.completedProjects).toBe(2);
  });

  it("keeps pre-coverage months unavailable and excludes future completion and attribution dates", () => {
    const report = buildStatistics(emptySources({
      projects: [project({ completed_at: "2025-03-12" }), project({ id: "future", completed_at: "2025-05-01", total_area_m2: 50 })],
      tasks: [{ id: "task-1", project_id: "project-1", completed_at: "2025-03-12" },
        { id: "future-task", project_id: "future", completed_at: "2025-05-01" }],
      attributions: [attribution({ completed_at: "2025-03-12T10:00:00.000Z" }),
        attribution({ id: "future-credit", task_id: "future-task", project_id: "future", completed_at: "2025-05-01T10:00:00.000Z" })],
    }), "3", "2025-04-30");
    expect(report.months.find(month => month.month === "2025-02-01")?.physicalArea).toBeNull();
    expect(report.months.find(month => month.month === "2025-02-01")?.creditedArea).toBeNull();
    expect(report.totals.physicalArea).toBe(100);
    expect(report.totals.creditedArea).toBe(100);
  });

  it("uses task completion dates and canonical attribution shares, counting a task once even with multiple contributors", () => {
    const report = buildStatistics(emptySources({
      projects: [project()],
      tasks: [
        { id: "task-1", project_id: "project-1", completed_at: "2025-03-12" },
        { id: "legacy", project_id: "project-1", completed_at: null },
      ],
      attributions: [
        attribution({ contributor_id: "a", credited_area_m2: 40 }),
        attribution({ id: "credit-2", contributor_id: "b", credited_area_m2: 60 }),
        attribution({ id: "legacy-credit", task_id: "legacy", credited_area_m2: 50 }),
      ],
    }), "all", "2025-04-30");
    expect(report.months.find(month => month.month === "2025-03-01")?.completedTasks).toBe(1);
    expect(report.months.find(month => month.month === "2025-03-01")?.creditedArea).toBe(100);
    expect(report.coverage.excludedCredits).toBe(1);
  });

  it("places UTC timestamps in the Kyiv calendar day", () => {
    const report = buildStatistics(emptySources({
      projects: [project({ completed_at: "2025-03-01" })],
      tasks: [{ id: "task-1", project_id: "project-1", completed_at: "2025-03-01" }],
      attributions: [attribution({ completed_at: "2025-02-28T22:30:00.000Z" })],
    }), "3", "2025-03-31");
    expect(report.months.find(month => month.month === "2025-03-01")?.creditedArea).toBe(100);
    expect(report.months.find(month => month.month === "2025-02-01")?.creditedArea).toBeNull();
  });

  it("includes pause time and ignores administrative activity timestamps", () => {
    const report = buildStatistics(emptySources({ projects: [project()], activities: [
      activity("project-1", "planned", "active", "2025-03-12T10:00:00Z"),
      activity("project-1", "active", "paused", "2025-03-03T10:00:00Z"),
      activity("project-1", "paused", "active", "2025-03-10T10:00:00Z"),
    ] }), "all", "2025-04-01");
    expect(report.durations[0].days).toBe(11);
  });
});
