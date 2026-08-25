export type LeaderboardAccessContext = {
  systemRole: string | null;
  leaderboardVisibleToEmployees: boolean;
};

/** Admins always retain leaderboard access; employees follow the studio setting. */
export function canAccessLeaderboard({ systemRole, leaderboardVisibleToEmployees }: LeaderboardAccessContext): boolean {
  return systemRole === "admin" || leaderboardVisibleToEmployees;
}
