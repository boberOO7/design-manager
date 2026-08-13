"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import type { LeaderboardPeriod } from "@/lib/productivity";
import { useRouter } from "next/navigation";

export function LeaderboardPeriodSwitcher({ labels, period }: { labels: Record<LeaderboardPeriod, string>; period: LeaderboardPeriod }) {
  const router = useRouter();
  return <SegmentedControl ariaLabel="Leaderboard period" className="w-full sm:w-auto [&_button]:flex-1" items={[
    { value: "month", label: labels.month },
    { value: "quarter", label: labels.quarter },
    { value: "year", label: labels.year },
  ]} value={period} onValueChange={(nextPeriod) => router.replace(nextPeriod === "month" ? "/leaderboard" : `/leaderboard?period=${nextPeriod}`)} />;
}
