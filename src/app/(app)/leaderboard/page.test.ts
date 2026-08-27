import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pagePath = new URL("./page.tsx", import.meta.url);

describe("leaderboard page access", () => {
  it("redirects hidden employees on the server before loading leaderboard data", async () => {
    const source = await readFile(pagePath, "utf8");
    const accessCheck = source.indexOf("canAccessLeaderboard");
    const overviewLoad = source.indexOf("getLeaderboardOverviewData(period)");

    expect(source).toContain('redirect("/dashboard")');
    expect(accessCheck).toBeGreaterThan(-1);
    expect(overviewLoad).toBeGreaterThan(accessCheck);
  });

  it("passes the studio visibility state to the admin action menu", async () => {
    const source = await readFile(pagePath, "utf8");
    expect(source).toContain("leaderboardVisibleToEmployees={membership.leaderboardVisibleToEmployees}");
  });

  it("keeps the empty-period leader state when the ranking has only zero-result members", async () => {
    const source = await readFile(pagePath, "utf8");
    expect(source).toContain("overview.current.find(hasQualifyingProductivity) ?? null");
    expect(source).toContain("overview.current.some(hasQualifyingProductivity)");
  });
});
