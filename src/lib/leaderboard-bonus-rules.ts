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

export function hasLeaderboardBonuses(config: LeaderboardBonusConfig): boolean {
  return config.enabled && config.rules.length > 0;
}
