import { describe, expect, it } from "vitest";
import { canAccessLeaderboard } from "./leaderboard-access";

describe("leaderboard access", () => {
  it("always allows administrators", () => {
    expect(canAccessLeaderboard({ systemRole: "admin", leaderboardVisibleToEmployees: false })).toBe(true);
  });

  it("keeps leaderboard access administrator-only regardless of the legacy visibility setting", () => {
    expect(canAccessLeaderboard({ systemRole: "employee", leaderboardVisibleToEmployees: false })).toBe(false);
    expect(canAccessLeaderboard({ systemRole: "employee", leaderboardVisibleToEmployees: true })).toBe(false);
  });
});
