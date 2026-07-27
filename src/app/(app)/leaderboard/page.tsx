import { PageHeader } from "@/components/shared/page-header";
import { getLeaderboardData } from "@/data/queries";
import type { Metadata } from "next";
import type { Profile } from "@/types";

export const metadata: Metadata = {
  title: "Leaderboard | StudioFlow",
};

export default function LeaderboardPage({ profile }: { profile: Profile | null }) {
  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Leaderboard" description="Please log in to view the leaderboard." />
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
          <p className="text-sm text-stone-600">You must be logged in to view the leaderboard.</p>
        </div>
      </div>
    );
  }

  const leaderboard = getLeaderboardData();

  return (
    <div className="space-y-6">
      <PageHeader title="Leaderboard" description="Current month productivity for the studio team." />
      <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_2fr_1fr_1fr] border-b border-stone-200 px-5 py-3 text-sm font-medium text-stone-500">
          <span>Rank</span>
          <span>Employee</span>
          <span>Completed m²</span>
          <span>Tasks</span>
        </div>
        {leaderboard.map((entry) => (
          <div key={entry.user_id} className="grid grid-cols-[1fr_2fr_1fr_1fr] border-b border-stone-100 px-5 py-4 last:border-b-0">
            <p className="font-semibold text-stone-900">#{entry.rank}</p>
            <div>
              <p className="font-semibold text-stone-900">{entry.full_name}</p>
              <p className="text-sm text-stone-500">{entry.job_title}</p>
            </div>
            <p className="text-stone-700">{entry.completed_area_m2} m²</p>
            <p className="text-stone-700">{entry.completed_tasks}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
