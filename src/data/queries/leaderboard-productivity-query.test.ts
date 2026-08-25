import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const queryPath = new URL("./index.ts", import.meta.url);

describe("leaderboard productivity query", () => {
  it("filters live productivity inclusion without requiring a foreign-key relationship from immutable attribution history", async () => {
    const source = await readFile(queryPath, "utf8");

    expect(source).toContain('select("id, include_in_productivity")');
    expect(source).toContain('select("project_id, contributor_id, contributor_name, contributor_job_title, credited_area_m2, source_type, completed_at")');
    expect(source).toContain("excludedProjectIds.has(attribution.project_id)");
    expect(source).not.toContain("projects!inner(include_in_productivity)");
  });

  it("keeps server-side failure details available for diagnostics", async () => {
    const source = await readFile(queryPath, "utf8");
    expect(source).toContain('console.error("Unable to load productivity.", projectsError ?? error)');
  });

  it("does not load leaderboard data for employees when studio visibility is disabled", async () => {
    const source = await readFile(queryPath, "utf8");
    expect(source).toContain("canAccessLeaderboard({ systemRole: membership.system_role, leaderboardVisibleToEmployees: membership.leaderboardVisibleToEmployees })");
  });
});
