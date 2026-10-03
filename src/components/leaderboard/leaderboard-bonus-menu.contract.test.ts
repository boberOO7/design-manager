import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const menuPath = new URL("./leaderboard-bonus-menu.tsx", import.meta.url);

describe("leaderboard admin action menu", () => {
  it("keeps bonus configuration without exposing a leaderboard visibility toggle", async () => {
    const source = await readFile(menuPath, "utf8");

    expect(source).toContain('t("configureBonuses")');
    expect(source).not.toContain('rpc("set_leaderboard_employee_visibility"');
    expect(source).not.toContain("toggleEmployeeVisibility");
    expect(source).toContain("router.refresh()");
  });
});
