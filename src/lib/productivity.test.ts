import { describe, expect, it } from "vitest";
import { canCompleteAttributedTask, filterProductivityAttributionsForPeriod, getKyivMonthBounds, getKyivPeriodBounds, getKyivPeriodLabel, getLeaderboardTotals, getProjectAttributionMode, hasQualifyingProductivity, isEligibleProjectFallbackContributor, projectProductivityLeaderboard } from "./productivity";
import { getLeaderboardBonusPercent, getLeaderboardEntryBonusPercent } from "./leaderboard-bonus-rules";

describe("monthly productivity projection", () => {
  it("uses Europe/Kyiv month boundaries across a DST month", () => {
    expect(getKyivMonthBounds(new Date("2026-03-31T20:30:00.000Z"))).toEqual({
      start: "2026-02-28T22:00:00.000Z",
      end: "2026-03-31T21:00:00.000Z",
    });
  });

  it("returns the previous Kyiv month boundaries without changing current-month behavior", () => {
    expect(getKyivMonthBounds(new Date("2026-04-15T12:00:00.000Z"), -1)).toEqual({
      start: "2026-02-28T22:00:00.000Z",
      end: "2026-03-31T21:00:00.000Z",
    });
  });

  it("uses Kyiv quarter boundaries across a year transition", () => {
    expect(getKyivPeriodBounds("quarter", new Date("2026-01-01T00:30:00.000Z"))).toEqual({
      start: "2025-12-31T22:00:00.000Z",
      end: "2026-03-31T21:00:00.000Z",
    });
    expect(getKyivPeriodBounds("quarter", new Date("2026-01-01T00:30:00.000Z"), -1)).toEqual({
      start: "2025-09-30T21:00:00.000Z",
      end: "2025-12-31T22:00:00.000Z",
    });
  });

  it("uses Kyiv year boundaries and period labels for a year transition", () => {
    const now = new Date("2026-01-01T00:30:00.000Z");
    expect(getKyivPeriodBounds("year", now)).toEqual({ start: "2025-12-31T22:00:00.000Z", end: "2026-12-31T22:00:00.000Z" });
    expect(getKyivPeriodBounds("year", now, -1)).toEqual({ start: "2024-12-31T22:00:00.000Z", end: "2025-12-31T22:00:00.000Z" });
    expect(getKyivPeriodLabel("quarter", "en", now)).toBe("Q1 2026");
    expect(getKyivPeriodLabel("quarter", "en", now, -1)).toBe("Q4 2025");
    expect(getKyivPeriodLabel("year", "en", now, -1)).toBe("2025");
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

  it("keeps all eligible members in a stable member-first ranking with zero metrics", () => {
    const entries = projectProductivityLeaderboard([
      { contributor_id: "architect-admin", contributor_name: "Ada", contributor_job_title: "Architect", credited_area_m2: 25, source_type: "task" },
      { contributor_id: "manager", contributor_name: "Morgan", contributor_job_title: "Manager", credited_area_m2: 100, source_type: "task" },
    ], [
      { user_id: "architect-admin", full_name: "Ada", job_title: "Architect" },
      { user_id: "designer", full_name: "Dani", job_title: "Designer" },
      { user_id: "architect", full_name: "Zara", job_title: "Architect" },
    ]);

    expect(entries).toEqual([
      { rank: 1, user_id: "architect-admin", full_name: "Ada", job_title: "Architect", avatar_url: null, completed_area_m2: 25, completed_tasks: 1 },
      { rank: 2, user_id: "designer", full_name: "Dani", job_title: "Designer", avatar_url: null, completed_area_m2: 0, completed_tasks: 0 },
      { rank: 2, user_id: "architect", full_name: "Zara", job_title: "Architect", avatar_url: null, completed_area_m2: 0, completed_tasks: 0 },
    ]);
  });

  it("aggregates completed tasks and project fallback credit in one selected period", () => {
    const entries = projectProductivityLeaderboard([
      { contributor_id: "a", contributor_name: "Ari", contributor_job_title: "Architect", credited_area_m2: 80, source_type: "task" },
      { contributor_id: "a", contributor_name: "Ari", contributor_job_title: "Architect", credited_area_m2: 20, source_type: "task" },
      { contributor_id: "b", contributor_name: "Bea", contributor_job_title: "Designer", credited_area_m2: 95, source_type: "project_fallback" },
    ]);
    expect(entries.map(({ user_id, completed_area_m2, completed_tasks }) => ({ user_id, completed_area_m2, completed_tasks }))).toEqual([
      { user_id: "a", completed_area_m2: 100, completed_tasks: 2 },
      { user_id: "b", completed_area_m2: 95, completed_tasks: 0 },
    ]);
    expect(getLeaderboardTotals(entries)).toEqual({ completed_area_m2: 195, completed_tasks: 2 });
  });

  it("keeps task and project credit in their completed Kyiv months before ranking", () => {
    const march = new Date("2026-03-16T12:00:00.000Z");
    const current = filterProductivityAttributionsForPeriod([
      { contributor_id: "a", contributor_name: "Ari", contributor_job_title: "Architect", credited_area_m2: 20, source_type: "task", completed_at: "2026-03-01T00:00:00.000Z" },
      { contributor_id: "a", contributor_name: "Ari", contributor_job_title: "Architect", credited_area_m2: 100, source_type: "project_fallback", completed_at: "2026-02-28T21:59:59.999Z" },
      { contributor_id: "b", contributor_name: "Bea", contributor_job_title: "Designer", credited_area_m2: 30, source_type: "task", completed_at: "2026-03-31T20:59:59.999Z" },
      { contributor_id: "b", contributor_name: "Bea", contributor_job_title: "Designer", credited_area_m2: 40, source_type: "task", completed_at: "2026-03-31T21:00:00.000Z" },
    ], "month", march);
    expect(projectProductivityLeaderboard(current)).toMatchObject([
      { user_id: "b", completed_area_m2: 30, completed_tasks: 1 },
      { user_id: "a", completed_area_m2: 20, completed_tasks: 1 },
    ]);
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

  it("allows unassigned work to complete without attribution while retaining the active-member guard for assigned work", () => {
    expect(canCompleteAttributedTask({ requiresProductivityAttribution: false, assigneeId: null, isActiveProjectMember: false })).toBe(true);
    expect(canCompleteAttributedTask({ requiresProductivityAttribution: true, assigneeId: null, isActiveProjectMember: false })).toBe(true);
    expect(canCompleteAttributedTask({ requiresProductivityAttribution: true, assigneeId: "architect", isActiveProjectMember: false })).toBe(false);
    expect(canCompleteAttributedTask({ requiresProductivityAttribution: true, assigneeId: "architect", isActiveProjectMember: true })).toBe(true);
  });

  it("does not treat studio or admin access as project contribution", () => {
    expect(isEligibleProjectFallbackContributor({ hasActiveProjectMembership: false, hasActiveStudioMembership: true, hasActiveProfile: true })).toBe(false);
  });

  it("maps configured places to bonus eligibility", () => {
    const config = { enabled: true, rules: [{ place: 1, bonusPercent: 15 }, { place: 2, bonusPercent: 10 }, { place: 3, bonusPercent: 5 }, { place: 4, bonusPercent: 2.5 }] };
    expect(getLeaderboardBonusPercent(1, config)).toBe(15);
    expect(getLeaderboardBonusPercent(2, config)).toBe(10);
    expect(getLeaderboardBonusPercent(3, config)).toBe(5);
    expect(getLeaderboardBonusPercent(4, config)).toBe(2.5);
    expect(getLeaderboardBonusPercent(5, config)).toBe(0);
    expect(getLeaderboardBonusPercent(1, { ...config, enabled: false })).toBe(0);
  });

  it("gives tied leaders the same bonus and keeps empty months healthy", () => {
    const entries = projectProductivityLeaderboard([
      { contributor_id: "a", contributor_name: "Ari", contributor_job_title: "Architect", credited_area_m2: 20, source_type: "task" },
      { contributor_id: "b", contributor_name: "Bea", contributor_job_title: "Designer", credited_area_m2: 20, source_type: "task" },
      { contributor_id: "c", contributor_name: "Cam", contributor_job_title: "Visualizer", credited_area_m2: 10, source_type: "task" },
    ]);
    const config = { enabled: true, rules: [{ place: 1, bonusPercent: 15 }, { place: 2, bonusPercent: 10 }, { place: 3, bonusPercent: 5 }] };
    expect(entries.map((entry) => [entry.rank, getLeaderboardBonusPercent(entry.rank, config)])).toEqual([[1, 15], [1, 15], [3, 5]]);
    expect(getLeaderboardTotals([])).toEqual({ completed_area_m2: 0, completed_tasks: 0 });
  });

  it("does not assign a bonus or leader status to zero-result members", () => {
    const zeroResult = { rank: 1, completed_area_m2: 0, completed_tasks: 0 };
    const config = { enabled: true, rules: [{ place: 1, bonusPercent: 15 }] };

    expect(hasQualifyingProductivity(zeroResult)).toBe(false);
    expect(getLeaderboardEntryBonusPercent({ rank: zeroResult.rank, completedAreaM2: zeroResult.completed_area_m2, completedTasks: zeroResult.completed_tasks }, config)).toBe(0);
  });
});
