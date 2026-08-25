import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const menuPath = new URL("./leaderboard-bonus-menu.tsx", import.meta.url);

describe("leaderboard admin action menu", () => {
  it("keeps bonus configuration and adds a localized employee visibility toggle", async () => {
    const source = await readFile(menuPath, "utf8");

    expect(source).toContain('t("configureBonuses")');
    expect(source).toContain('rpc("set_leaderboard_employee_visibility"');
    expect(source).toContain('leaderboardVisibleToEmployees ? t("hideFromEmployees") : t("showToEmployees")');
    expect(source).toContain("EyeOff");
    expect(source).toContain("Eye");
    expect(source).toContain("router.refresh()");
  });
});
