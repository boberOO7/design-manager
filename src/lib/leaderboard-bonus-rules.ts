export type LeaderboardBonusRule = {
  place: number;
  bonusPercent: number;
};

export type LeaderboardBonusConfig = {
  enabled: boolean;
  rules: LeaderboardBonusRule[];
};

export const MAX_LEADERBOARD_BONUS_PLACES = 20;

export function getLeaderboardBonusPercent(rank: number, config: LeaderboardBonusConfig): number {
  if (!config.enabled) return 0;
  return config.rules.find((rule) => rule.place === rank)?.bonusPercent ?? 0;
}

export function getLeaderboardEntryBonusPercent(input: {
  rank: number;
  completedAreaM2: number;
  completedTasks: number;
}, config: LeaderboardBonusConfig): number {
  if (input.completedAreaM2 <= 0 && input.completedTasks <= 0) return 0;
  return getLeaderboardBonusPercent(input.rank, config);
}

export function hasLeaderboardBonuses(config: LeaderboardBonusConfig): boolean {
  return config.enabled && config.rules.length > 0;
}
