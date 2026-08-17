import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { LeaderboardBonusConfig } from "@/lib/leaderboard-bonus-rules";

export async function getStudioLeaderboardBonusConfig(studioId: string): Promise<LeaderboardBonusConfig> {
  const supabase = await createClient();
  const [studioResult, rulesResult] = await Promise.all([
    supabase.from("studios").select("leaderboard_bonuses_enabled").eq("id", studioId).single(),
    supabase.from("leaderboard_bonus_rules").select("place, bonus_percent").eq("studio_id", studioId).order("place"),
  ]);
  if (studioResult.error || !studioResult.data || rulesResult.error) {
    throw new Error("Unable to load leaderboard bonus rules.", { cause: studioResult.error ?? rulesResult.error });
  }
  return {
    enabled: studioResult.data.leaderboard_bonuses_enabled,
    rules: (rulesResult.data ?? []).map((rule) => ({ place: rule.place, bonusPercent: Number(rule.bonus_percent) })),
  };
}
