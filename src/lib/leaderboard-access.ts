export type LeaderboardAccessContext = {
  systemRole: string | null;
  /** Retained for existing call sites; leaderboard access is now admin-only. */
  leaderboardVisibleToEmployees?: boolean;
};

/** Credited productivity metrics are available only to active studio admins. */
export function canAccessLeaderboard({ systemRole }: LeaderboardAccessContext): boolean {
  return systemRole === "admin";
}
