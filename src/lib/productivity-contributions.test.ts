import { describe, expect, it } from "vitest";
import {
  filterProductivityAttributionsForPeriod,
  projectProductivityContributions,
  projectProductivityLeaderboard,
  selectLeaderboardAttributions,
  type LeaderboardPeriod,
  type ProductivityContributionAttribution,
  type ProductivityLeaderboardMember,
} from "./productivity";

type Fixture = ProductivityContributionAttribution & { voided_at: string | null };
const now = new Date("2026-05-15T12:00:00.000Z");
const members: ProductivityLeaderboardMember[] = [
  { user_id: "ada", full_name: "Ada", job_title: "Architect" },
  { user_id: "bea", full_name: "Bea", job_title: "Designer" },
];

function row(id: string, completedAt: string, area: number, overrides: Partial<Fixture> = {}): Fixture {
  return {
    id,
    project_id: "project-a",
    task_id: id,
    contributor_id: "ada",
    contributor_name: "Ada",
    contributor_job_title: "Architect",
    source_type: "task",
    task_stage: "stage_2",
    credited_area_m2: area,
    completed_at: completedAt,
    voided_at: null,
    ...overrides,
  };
}

const ledger: Fixture[] = [
  row("may-one", "2026-05-01T10:00:00.000Z", 10),
  row("may-two", "2026-05-04T10:00:00.000Z", 5.125),
  row("fallback", "2026-05-06T10:00:00.000Z", 2.5, { project_id: "project-b", task_id: null, source_type: "project_fallback", task_stage: null }),
  row("april", "2026-04-04T10:00:00.000Z", 4.5),
  row("june", "2026-06-04T10:00:00.000Z", 3.25),
  row("january", "2026-01-04T10:00:00.000Z", 8.75),
  row("december", "2026-12-04T10:00:00.000Z", 1.5),
  row("last-year", "2025-12-04T10:00:00.000Z", 1000),
  row("excluded", "2026-05-07T10:00:00.000Z", 100, { project_id: "excluded-project", task_stage: "stage_1" }),
  row("voided", "2026-05-08T10:00:00.000Z", 200, { voided_at: "2026-05-09T10:00:00.000Z" }),
  row("other-member", "2026-05-09T10:00:00.000Z", 500, { contributor_id: "former", contributor_name: "Former" }),
  row("stage-four", "2026-05-10T10:00:00.000Z", 0, { project_id: "excluded-project", task_stage: "stage_4" }),
];

describe("Leaderboard contribution selector", () => {
  it("keeps qualifying task counts while removing only excluded project area", () => {
    const selected = selectLeaderboardAttributions([
      row("included", "2026-05-01T10:00:00.000Z", 12),
      row("excluded-task", "2026-05-02T10:00:00.000Z", 40, { project_id: "excluded-project" }),
      row("excluded-fallback", "2026-05-03T10:00:00.000Z", 20, { project_id: "excluded-project", task_id: null, source_type: "project_fallback", task_stage: null }),
    ], new Set(["excluded-project"]));
    expect(projectProductivityLeaderboard(selected, members).find((entry) => entry.user_id === "ada")).toMatchObject({
      completed_area_m2: 12,
      completed_tasks: 2,
    });
    expect(selected.map((attribution) => attribution.credited_area_m2)).toEqual([12, 0, 0]);
  });

  it.each([
    ["month", 17.625],
    ["quarter", 25.375],
    ["year", 35.625],
  ] as const)("reconciles %s project and record totals with the displayed ranking", (period: LeaderboardPeriod, expectedArea: number) => {
    const active = ledger.filter((attribution) => attribution.voided_at === null);
    const inPeriod = filterProductivityAttributionsForPeriod(active, period, now);
    const selected = selectLeaderboardAttributions(inPeriod, new Set(["excluded-project"]));
    const ranking = projectProductivityLeaderboard(selected, members);
    const contributions = projectProductivityContributions(selected, members, new Map([["project-a", "Project A"], ["project-b", "Project B"]]), new Map([["may-one", "First task"]]));

    expect(ranking.find((entry) => entry.user_id === "ada")?.completed_area_m2).toBe(expectedArea);
    for (const entry of ranking) {
      const groups = contributions[entry.user_id] ?? [];
      const recordTotal = groups.flatMap((group) => group.records).reduce((sum, record) => sum + record.credited_area_m2, 0);
      const projectTotal = groups.reduce((sum, group) => sum + group.completed_area_m2, 0);
      expect(recordTotal).toBeCloseTo(entry.completed_area_m2, 8);
      expect(projectTotal).toBeCloseTo(entry.completed_area_m2, 8);
    }
    expect(contributions.ada).toHaveLength(2);
    expect(contributions.ada[0].project_name).toBe("Project A");
    expect(contributions.ada[0].records[0].task_title).toBe("First task");
    expect(contributions.ada[0].records[0].task_stage).toBe("stage_2");
    expect(contributions.ada[1].records[0].source_type).toBe("project_fallback");
    expect(contributions.former).toBeUndefined();
    expect(ranking.find((entry) => entry.user_id === "ada")?.completed_tasks).toBe(selected.filter((attribution) => attribution.contributor_id === "ada" && attribution.source_type === "task").length);
    expect(selected.find((attribution) => attribution.id === "excluded")?.credited_area_m2).toBe(0);
    expect(contributions.ada.flatMap((group) => group.records).some((record) => record.id === "stage-four")).toBe(false);
  });
});
