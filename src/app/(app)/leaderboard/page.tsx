import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUserProfile, getLeaderboardOverviewData } from "@/data/queries";
import { getKyivPeriodLabel, getKyivPeriodRangeLabel, getLeaderboardTotals, hasQualifyingProductivity, isLeaderboardPeriod, type LeaderboardPeriod, type ProductivityLeaderboardEntry } from "@/lib/productivity";
import { getLeaderboardEntryBonusPercent, hasLeaderboardBonuses, type LeaderboardBonusConfig } from "@/lib/leaderboard-bonus-rules";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import { UserAvatar } from "@/components/ui/user-avatar";
import { LeaderboardPeriodSwitcher } from "@/components/leaderboard/leaderboard-period-switcher";
import { LeaderboardBonusMenu } from "@/components/leaderboard/leaderboard-bonus-menu";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { canAccessLeaderboard } from "@/lib/leaderboard-access";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Leaderboard");
  return { title: t("productivity") };
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const requestedPeriod = (await searchParams).period;
  const period: LeaderboardPeriod = isLeaderboardPeriod(requestedPeriod) ? requestedPeriod : "month";
  const [t, roles, locale, profile, membership] = await Promise.all([
    getTranslations("Leaderboard"),
    getTranslations("Roles"),
    getLocale(),
    getCurrentUserProfile(),
    getActiveStudioMembership(),
  ]);

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("loginDescription")} />
        <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-6 text-center">
          <p className="text-sm text-[var(--ui-text-secondary)]">{t("loginRequired")}</p>
        </div>
      </div>
    );
  }

  if (!membership || !canAccessLeaderboard({ systemRole: membership.system_role, leaderboardVisibleToEmployees: membership.leaderboardVisibleToEmployees })) {
    redirect("/dashboard");
  }

  let overview;
  try {
    overview = await getLeaderboardOverviewData(period);
  } catch (error) {
    console.error("Unable to load leaderboard overview", error);
    return (
      <div className="space-y-6">
        <PageHeader title={t("productivity")} description={t("loadDescription")} />
        <div role="alert" className="rounded-xl border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] p-5 text-sm text-[var(--ui-danger-text)]">{t("loadFailed")}</div>
      </div>
    );
  }

  overview = {
    current: overview.current.map((entry) => { const roleKey = getCanonicalRoleTranslationKey(entry.job_title); return roleKey ? { ...entry, job_title: roles(roleKey) } : entry; }),
    previous: overview.previous.map((entry) => { const roleKey = getCanonicalRoleTranslationKey(entry.job_title); return roleKey ? { ...entry, job_title: roles(roleKey) } : entry; }),
    bonusConfig: overview.bonusConfig,
  };

  const currentLeader = overview.current.find(hasQualifyingProductivity) ?? null;
  const previousLeader = overview.previous.find(hasQualifyingProductivity) ?? null;
  const totals = getLeaderboardTotals(overview.current);
  const periodLabel = getKyivPeriodLabel(period, locale);
  const previousPeriodLabel = getKyivPeriodLabel(period, locale, undefined, -1);
  const periodRange = getKyivPeriodRangeLabel(period, locale);
  const monthlyBonusesApply = period === "month" && hasLeaderboardBonuses(overview.bonusConfig) && overview.current.some(hasQualifyingProductivity);
  const formatBonusRules = overview.bonusConfig.rules.map((rule) => t("bonusRule", { place: rule.place, bonus: rule.bonusPercent })).join(" · ");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader className="flex-col items-start sm:flex-row sm:items-center" title={t("productivity")} description={t("description", { period: t(period) })} descriptionClassName="min-h-10" action={<div className="flex items-center gap-1"><LeaderboardPeriodSwitcher period={period} labels={{ month: t("month"), quarter: t("quarter"), year: t("year") }} />{membership.system_role === "admin" ? <LeaderboardBonusMenu studioId={membership.studio_id} bonusConfig={overview.bonusConfig} leaderboardVisibleToEmployees={membership.leaderboardVisibleToEmployees} /> : null}</div>} />
      <section className="grid overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] md:grid-cols-[minmax(0,1.25fr)_minmax(15rem,0.75fr)]">
        <div className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ui-text-muted)]">{t("currentLeader", { period: t(period) })}</p>
          <p className="mt-1 text-xs text-[var(--ui-text-muted)]">{periodRange}</p>
          {currentLeader ? <><div className="mt-3 flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><UserAvatar className="size-12 text-sm" imageUrl={currentLeader.avatar_url} name={currentLeader.full_name} /><div className="min-w-0"><h2 className="truncate text-2xl font-semibold tracking-tight text-[var(--ui-text)]">{currentLeader.full_name}</h2><p className="mt-1 truncate text-sm text-[var(--ui-text-secondary)]">{currentLeader.job_title}</p></div></div>{monthlyBonusesApply ? <BonusBadge config={overview.bonusConfig} entry={currentLeader} t={t} /> : null}</div><div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--ui-text-secondary)]"><span><strong className="ui-numeric font-semibold text-[var(--ui-text)]">{formatArea(currentLeader.completed_area_m2, locale)}</strong> {t("completed")}</span><span>{t("tasks", { count: currentLeader.completed_tasks })}</span>{overview.current.filter((entry) => entry.rank === 1).length > 1 ? <span>{t("sharedLead")}</span> : null}</div></> : <div className="mt-3"><h2 className="text-lg font-semibold text-[var(--ui-text)]">{t("noLeader")}</h2><p className="mt-1 text-sm leading-6 text-[var(--ui-text-secondary)]">{t("noLeaderDescription", { period: t(period) })}</p></div>}
        </div>
        <div className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-5 md:border-l md:border-t-0 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ui-text-muted)]">{t("previousPeriod", { period: previousPeriodLabel })}</p>{previousLeader ? <div className="mt-3"><p className="truncate font-semibold text-[var(--ui-text)]">{previousLeader.full_name}</p><p className="mt-1 truncate text-sm text-[var(--ui-text-secondary)]">{previousLeader.job_title}</p><p className="mt-4 text-sm text-[var(--ui-text-secondary)]"><span className="ui-numeric font-semibold text-[var(--ui-text)]">{formatArea(previousLeader.completed_area_m2, locale)}</span> {t("completed")}</p>{overview.previous.filter((entry) => entry.rank === 1).length > 1 ? <p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("sharedPreviousLead")}</p> : null}</div> : <p className="mt-3 text-sm leading-6 text-[var(--ui-text-secondary)]">{t("noPrevious", { period: previousPeriodLabel })}</p>}</div>
      </section>
      <section aria-labelledby="period-ranking-heading" className="overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)]">
        <div className="flex flex-col gap-3 border-b border-[var(--ui-border)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="period-ranking-heading" className="font-semibold text-[var(--ui-text)]">{t("ranking", { period: periodLabel })}</h2><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{overview.current.length ? t("contributorsSummary", { count: overview.current.length, area: formatArea(totals.completed_area_m2, locale) }) : t("noCompleted")}</p></div>{monthlyBonusesApply && overview.current.length ? <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("bonusRanks", { rules: formatBonusRules })}</p> : null}</div>
        {overview.current.length === 0 ? <div className="px-5 py-10 text-center"><p className="font-medium text-[var(--ui-text)]">{t("noCompletedPeriod", { period: t(period) })}</p><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("noCompletedPeriodDescription")}</p></div> : <ol className="divide-y divide-[var(--ui-border)]">{overview.current.map((entry) => { const bonus = getLeaderboardEntryBonusPercent({ rank: entry.rank, completedAreaM2: entry.completed_area_m2, completedTasks: entry.completed_tasks }, overview.bonusConfig); return <li key={entry.user_id} className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:px-5 ${monthlyBonusesApply ? "sm:grid-cols-[3rem_minmax(0,1fr)_8rem_5.5rem_5.5rem]" : "sm:grid-cols-[3rem_minmax(0,1fr)_8rem_5.5rem]"}`}><p className={`ui-numeric text-sm font-semibold ${bonus > 0 ? "text-[var(--ui-text)]" : "text-[var(--ui-text-muted)]"}`}>#{entry.rank}</p><div className="flex min-w-0 items-center gap-2"><UserAvatar imageUrl={entry.avatar_url} name={entry.full_name} size="boardCard" decorative /><div className="min-w-0"><p className="truncate font-medium text-[var(--ui-text)]">{entry.full_name}</p><p className="truncate text-sm text-[var(--ui-text-secondary)]">{entry.job_title}</p></div></div><p className="hidden text-right text-sm ui-numeric font-medium text-[var(--ui-text)] sm:block">{formatArea(entry.completed_area_m2, locale)}</p><p className="hidden text-right text-sm ui-numeric text-[var(--ui-text-secondary)] sm:block">{t("tasks", { count: entry.completed_tasks })}</p>{monthlyBonusesApply ? <div className="justify-self-end"><BonusBadge config={overview.bonusConfig} entry={entry} compact t={t} /></div> : null}<div className="col-span-2 flex gap-3 text-xs text-[var(--ui-text-secondary)] sm:hidden"><span className="ui-numeric">{formatArea(entry.completed_area_m2, locale)}</span><span className="ui-numeric">{t("tasks", { count: entry.completed_tasks })}</span></div></li>; })}</ol>}
      </section>
    </div>
  );
}

function BonusBadge({ compact = false, config, entry, t }: { compact?: boolean; config: LeaderboardBonusConfig; entry: ProductivityLeaderboardEntry; t: Awaited<ReturnType<typeof getTranslations>> }) {
  const bonus = getLeaderboardEntryBonusPercent({ rank: entry.rank, completedAreaM2: entry.completed_area_m2, completedTasks: entry.completed_tasks }, config);
  if (bonus === 0) return compact ? <span className="text-xs text-[var(--ui-text-muted)]">—</span> : null;
  return <span className="inline-flex rounded-full border border-[var(--ui-violet-border)] bg-[var(--ui-violet-surface)] px-2 py-1 text-xs font-semibold tabular-nums text-[var(--ui-violet-text)]">{t("bonus", { bonus })}</span>;
}

function formatArea(value: number, locale: string) {
  return `${value.toLocaleString(locale, { maximumFractionDigits: 2 })} m²`;
}
