import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUserProfile, getLeaderboardData } from "@/data/queries";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard | StudioFlow",
};

export default async function LeaderboardPage() {
  const profile = await getCurrentUserProfile();

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

  let leaderboard;
  try {
    leaderboard = await getLeaderboardData();
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title="Productivity" description="Current-month completed work for the studio team." />
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">Monthly productivity could not be loaded. Please refresh and try again.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Productivity" description="Completed work this month in Europe/Kyiv. Area is credited from task completions or eligible project completion." />
      <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[3rem_minmax(12rem,2fr)_minmax(9rem,1fr)_5rem] border-b border-stone-200 px-5 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 sm:grid">
          <span>Rank</span>
          <span>Employee</span>
          <span>Completed m²</span>
          <span>Tasks</span>
        </div>
        {leaderboard.length === 0 ? <div className="px-5 py-10 text-center"><p className="font-medium text-stone-900">No completed work recorded this month.</p><p className="mt-1 text-sm text-stone-500">Completed task area and project fallback credit will appear here.</p></div> : leaderboard.map((entry) => (
          <div key={entry.user_id} className="grid gap-x-3 border-b border-stone-100 px-5 py-4 last:border-b-0 sm:grid-cols-[3rem_minmax(12rem,2fr)_minmax(9rem,1fr)_5rem] sm:items-center">
            <p className="row-start-1 text-sm font-semibold tabular-nums text-stone-500 sm:row-auto">#{entry.rank}</p>
            <div className="row-start-1 ml-9 min-w-0 sm:row-auto sm:ml-0"><p className="truncate font-semibold text-stone-900">{entry.full_name}</p><p className="mt-0.5 truncate text-sm text-stone-500">{entry.job_title}</p></div>
            <p className="mt-3 text-sm font-medium tabular-nums text-stone-900 sm:mt-0"><span className="text-stone-500 sm:hidden">Completed area · </span>{entry.completed_area_m2.toLocaleString("en-US", { maximumFractionDigits: 2 })} m²</p>
            <p className="mt-1 text-sm tabular-nums text-stone-700 sm:mt-0"><span className="text-stone-500 sm:hidden">Completed tasks · </span>{entry.completed_tasks}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
