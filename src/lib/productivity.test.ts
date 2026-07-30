import { describe, expect, it } from "vitest";
import { canCompleteAttributedTask, getKyivMonthBounds, getProjectAttributionMode, isEligibleProjectFallbackContributor, projectProductivityLeaderboard } from "./productivity";

describe("monthly productivity projection", () => {
  it("uses Europe/Kyiv month boundaries across a DST month", () => {
    expect(getKyivMonthBounds(new Date("2026-03-31T20:30:00.000Z"))).toEqual({
      start: "2026-02-28T22:00:00.000Z",
      end: "2026-03-31T21:00:00.000Z",
    });
  });

  it("credits task area to its completion assignee and project fallback to each contributor", () => {
    const entries = projectProductivityLeaderboard([
      { contributor_id: "architect", contributor_name: "Avery", contributor_job_title: "Architect", credited_area_m2: 500, source_type: "project_fallback" },
      { contributor_id: "designer", contributor_name: "Dani", contributor_job_title: "Designer", credited_area_m2: 500, source_type: "project_fallback" },
      { contributor_id: "designer", contributor_name: "Dani", contributor_job_title: "Designer", credited_area_m2: 42.5, source_type: "task" },
    ]);
    expect(entries).toEqual([
      { rank: 1, user_id: "designer", full_name: "Dani", job_title: "Designer", completed_area_m2: 542.5, completed_tasks: 1 },
      { rank: 2, user_id: "architect", full_name: "Avery", job_title: "Architect", completed_area_m2: 500, completed_tasks: 0 },
    ]);
  });

  it("gives equal totals the same deterministic rank and orders names predictably", () => {
    expect(projectProductivityLeaderboard([
      { contributor_id: "b", contributor_name: "Bea", contributor_job_title: "Designer", credited_area_m2: 10, source_type: "task" },
      { contributor_id: "a", contributor_name: "Ari", contributor_job_title: "Architect", credited_area_m2: 10, source_type: "task" },
    ])).toMatchObject([{ rank: 1, full_name: "Ari" }, { rank: 1, full_name: "Bea" }]);
  });

  it("credits a 500 m² fallback project to both genuine architect and designer contributors", () => {
    const contributors = [
      { userId: "architect", role: "Architect" },
      { userId: "designer", role: "Designer" },
    ];
    expect(contributors.every(() => isEligibleProjectFallbackContributor({ hasActiveProjectMembership: true, hasActiveStudioMembership: true, hasActiveProfile: true }))).toBe(true);
    expect(projectProductivityLeaderboard(contributors.map((contributor) => ({ contributor_id: contributor.userId, contributor_name: contributor.userId, contributor_job_title: contributor.role, credited_area_m2: 500, source_type: "project_fallback" as const })))).toMatchObject([
      { user_id: "architect", completed_area_m2: 500 },
      { user_id: "designer", completed_area_m2: 500 },
    ]);
  });

  it("opts a partially allocated project into task-level attribution", () => {
    expect(getProjectAttributionMode([{ completed_area_m2: 60 }, { completed_area_m2: null }])).toBe("task_level");
    expect(getProjectAttributionMode([{ completed_area_m2: null }])).toBe("project_fallback");
  });

  it("requires an active project-member assignee for an area-bearing completion", () => {
    expect(canCompleteAttributedTask({ completedAreaM2: 20, assigneeId: null, isActiveProjectMember: false })).toBe(false);
    expect(canCompleteAttributedTask({ completedAreaM2: 20, assigneeId: "architect", isActiveProjectMember: false })).toBe(false);
    expect(canCompleteAttributedTask({ completedAreaM2: 20, assigneeId: "architect", isActiveProjectMember: true })).toBe(true);
  });

  it("does not treat studio or admin access as project contribution", () => {
    expect(isEligibleProjectFallbackContributor({ hasActiveProjectMembership: false, hasActiveStudioMembership: true, hasActiveProfile: true })).toBe(false);
  });
});
