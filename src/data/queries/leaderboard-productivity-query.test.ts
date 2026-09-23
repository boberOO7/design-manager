import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const queryPath = new URL("./index.ts", import.meta.url);

describe("leaderboard productivity query", () => {
  it("filters live productivity inclusion without requiring a foreign-key relationship from immutable attribution history", async () => {
    const source = await readFile(queryPath, "utf8");

    expect(source).toContain('admin.from("projects").select("id, include_in_productivity")');
    expect(source).toContain('supabase.from("projects").select("id, name")');
    expect(source).toContain("createAdminClient()");
    expect(source).toContain('select("profile:profiles!studio_members_user_id_fkey!inner(id, full_name, job_title, avatar_url)")');
    expect(source).toContain('.eq("is_active", true)');
    expect(source).toContain('.eq("profile.is_active", true)');
    expect(source).toContain('.in("profile.job_title", PROFESSIONAL_ROLES)');
    expect(source).toContain("projectProductivityLeaderboard(selected, eligibleMembers)");
    expect(source).toContain("projectProductivityContributions(selected, eligibleMembers, projectNames, taskTitles)");
    expect(source).toContain('select("id, project_id, task_id, contributor_id, contributor_name, contributor_job_title, credited_area_m2, source_type, task_stage, completed_at"');
    expect(source).toContain("selectLeaderboardAttributions(attributions, excludedProjectIds)");
    expect(source).toContain('.eq("studio_id", studioId).in("id", projectIds.slice(index, index + 100))');
    expect(source).toContain('.is("voided_at", null)');
    expect(source).toContain('.gte("completed_at", bounds.start)');
    expect(source).toContain('.lt("completed_at", bounds.end)');
    expect(source).toContain("const referenceTime = new Date();");
    expect(source).toContain("getLeaderboardForPeriod(membership.studio_id, period, 0, referenceTime, true)");
    expect(source).toContain("getLeaderboardForPeriod(membership.studio_id, period, -1, referenceTime)");
    expect(source).not.toContain("filterProductivityAttributionsForPeriod(data.filter");
    expect(source).not.toContain("projects!inner(include_in_productivity)");
  });

  it("keeps server-side failure details available for diagnostics", async () => {
    const source = await readFile(queryPath, "utf8");
    expect(source).toContain('console.error("Unable to load productivity.", cause)');
  });

  it("does not load leaderboard data for employees when studio visibility is disabled", async () => {
    const source = await readFile(queryPath, "utf8");
    expect(source).toContain("canAccessLeaderboard({ systemRole: membership.system_role, leaderboardVisibleToEmployees: membership.leaderboardVisibleToEmployees })");
  });
});
