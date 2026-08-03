import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUserProfile, getLeaderboardOverviewData } from "@/data/queries";
import { getLeaderboardBonusPercent, getLeaderboardTotals } from "@/lib/productivity";
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
        <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-6 text-center">
          <p className="text-sm text-[var(--ui-text-secondary)]">You must be logged in to view the leaderboard.</p>
        </div>
      </div>
    );
  }

  let overview;
  try {
    overview = await getLeaderboardOverviewData();
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title="Productivity" description="Current-month completed work for the studio team." />
        <div role="alert" className="rounded-xl border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] p-5 text-sm text-[var(--ui-danger-text)]">Monthly productivity could not be loaded. Please refresh and try again.</div>
      </div>
    );
  }

  const currentLeader = overview.current[0] ?? null;
  const previousLeader = overview.previous[0] ?? null;
  const totals = getLeaderboardTotals(overview.current);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Productivity" description="Monthly completed work in Europe/Kyiv. Bonus eligibility is a rank indicator only." />
      <section className="grid overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] md:grid-cols-[minmax(0,1.25fr)_minmax(15rem,0.75fr)]">
        <div className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ui-text-muted)]">Current month leader</p>
          {currentLeader ? <><div className="mt-3 flex items-start justify-between gap-4"><div className="min-w-0"><h2 className="truncate text-2xl font-semibold tracking-tight text-[var(--ui-text)]">{currentLeader.full_name}</h2><p className="mt-1 truncate text-sm text-[var(--ui-text-secondary)]">{currentLeader.job_title}</p></div><BonusBadge rank={currentLeader.rank} /></div><div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--ui-text-secondary)]"><span><strong className="ui-numeric font-semibold text-[var(--ui-text)]">{formatArea(currentLeader.completed_area_m2)}</strong> completed</span><span><strong className="ui-numeric font-semibold text-[var(--ui-text)]">{currentLeader.completed_tasks}</strong> tasks</span>{overview.current.filter((entry) => entry.rank === 1).length > 1 ? <span>Shared lead</span> : null}</div></> : <div className="mt-3"><h2 className="text-lg font-semibold text-[var(--ui-text)]">No leader yet</h2><p className="mt-1 text-sm leading-6 text-[var(--ui-text-secondary)]">Completed work will appear here as it is recorded this month.</p></div>}
        </div>
        <div className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-5 md:border-l md:border-t-0 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ui-text-muted)]">Previous month</p>{previousLeader ? <div className="mt-3"><p className="truncate font-semibold text-[var(--ui-text)]">{previousLeader.full_name}</p><p className="mt-1 truncate text-sm text-[var(--ui-text-secondary)]">{previousLeader.job_title}</p><p className="mt-4 text-sm text-[var(--ui-text-secondary)]"><span className="ui-numeric font-semibold text-[var(--ui-text)]">{formatArea(previousLeader.completed_area_m2)}</span> completed</p>{overview.previous.filter((entry) => entry.rank === 1).length > 1 ? <p className="mt-1 text-xs text-[var(--ui-text-muted)]">Shared previous lead</p> : null}</div> : <p className="mt-3 text-sm leading-6 text-[var(--ui-text-secondary)]">No completed work was recorded last month.</p>}</div>
      </section>
      <section aria-labelledby="monthly-ranking-heading" className="overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)]">
        <div className="flex flex-col gap-3 border-b border-[var(--ui-border)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="monthly-ranking-heading" className="font-semibold text-[var(--ui-text)]">Monthly ranking</h2><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{overview.current.length ? `${overview.current.length} contributors · ${formatArea(totals.completed_area_m2)} completed` : "No completed work yet"}</p></div>{overview.current.length ? <p className="text-xs leading-5 text-[var(--ui-text-muted)]">Rank 1 +15% · Rank 2 +10% · Rank 3 +5%</p> : null}</div>
        {overview.current.length === 0 ? <div className="px-5 py-10 text-center"><p className="font-medium text-[var(--ui-text)]">No completed work recorded this month.</p><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">Completed task area and eligible project fallback credit will appear here.</p></div> : <ol className="divide-y divide-[var(--ui-border)]">{overview.current.map((entry) => <li key={entry.user_id} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:grid-cols-[3rem_minmax(0,1fr)_8rem_5.5rem_5.5rem] sm:px-5"><p className={`ui-numeric text-sm font-semibold ${entry.rank <= 3 ? "text-[var(--ui-text)]" : "text-[var(--ui-text-muted)]"}`}>#{entry.rank}</p><div className="min-w-0"><p className="truncate font-medium text-[var(--ui-text)]">{entry.full_name}</p><p className="truncate text-sm text-[var(--ui-text-secondary)]">{entry.job_title}</p></div><p className="hidden text-right text-sm ui-numeric font-medium text-[var(--ui-text)] sm:block">{formatArea(entry.completed_area_m2)}</p><p className="hidden text-right text-sm ui-numeric text-[var(--ui-text-secondary)] sm:block">{entry.completed_tasks} tasks</p><div className="justify-self-end"><BonusBadge rank={entry.rank} compact /></div><div className="col-span-2 flex gap-3 text-xs text-[var(--ui-text-secondary)] sm:hidden"><span className="ui-numeric">{formatArea(entry.completed_area_m2)}</span><span className="ui-numeric">{entry.completed_tasks} tasks</span></div></li>)}</ol>}
      </section>
    </div>
  );
}

function BonusBadge({ compact = false, rank }: { compact?: boolean; rank: number }) {
  const bonus = getLeaderboardBonusPercent(rank);
  if (bonus === 0) return compact ? <span className="text-xs text-[var(--ui-text-muted)]">—</span> : null;
  return <span className="inline-flex rounded-full border border-[var(--ui-violet-border)] bg-[var(--ui-violet-surface)] px-2 py-1 text-xs font-semibold tabular-nums text-[var(--ui-violet-text)]">+{bonus}% bonus</span>;
}

function formatArea(value: number) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} m²`;
}
