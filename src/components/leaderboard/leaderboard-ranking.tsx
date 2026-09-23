"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ProductivityLeaderboardEntry, ProductivityProjectContribution } from "@/lib/productivity";
import type { TaskStage } from "@/lib/task-stages";

type RankedEntry = ProductivityLeaderboardEntry & { bonusPercent: number };

export function LeaderboardRanking({ entries, contributions, locale, monthlyBonusesApply, stageLabels }: {
  entries: RankedEntry[];
  contributions: Record<string, ProductivityProjectContribution[]>;
  locale: string;
  monthlyBonusesApply: boolean;
  stageLabels: Record<TaskStage, string>;
}) {
  const t = useTranslations("Leaderboard");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const contributionScrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expandedUserId) return;

    const handleWheel = (event: WheelEvent) => {
      const scroller = contributionScrollerRef.current;
      if (!scroller || event.defaultPrevented || event.ctrlKey || event.deltaY === 0) return;
      const bounds = scroller.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;

      const lineHeight = Number.parseFloat(getComputedStyle(scroller).lineHeight);
      const delta = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? Number.isFinite(lineHeight) ? lineHeight : 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? scroller.clientHeight : 1);
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const currentScrollTop = Math.min(maxScrollTop, scroller.scrollTop);
      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, currentScrollTop + delta));
      const remainder = delta - (nextScrollTop - currentScrollTop);
      let handled = nextScrollTop !== currentScrollTop;
      scroller.scrollTop = nextScrollTop;

      if (remainder !== 0) {
        let pageScroller: HTMLElement | null = null;
        for (let parent = scroller.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const overflowY = getComputedStyle(parent).overflowY;
          if ((overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") && parent.scrollHeight > parent.clientHeight) {
            pageScroller = parent;
            break;
          }
        }

        if (pageScroller) {
          const previous = pageScroller.scrollTop;
          pageScroller.scrollTop = Math.max(0, Math.min(pageScroller.scrollHeight - pageScroller.clientHeight, previous + remainder));
          handled ||= pageScroller.scrollTop !== previous;
        } else {
          const previous = window.scrollY;
          window.scrollBy(0, remainder);
          handled ||= window.scrollY !== previous;
        }
      }

      if (handled) event.preventDefault();
    };

    document.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => document.removeEventListener("wheel", handleWheel, true);
  }, [expandedUserId]);
  const formatArea = (value: number) => `${value.toLocaleString(locale, { maximumFractionDigits: 2 })} m²`;
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Kyiv" }).format(new Date(value));

  return <ol className="divide-y divide-[var(--ui-border)]">{entries.map((entry) => {
    const expanded = expandedUserId === entry.user_id;
    const groups = contributions[entry.user_id] ?? [];
    const panelId = `leaderboard-contributions-${entry.user_id}`;
    const toggle = () => setExpandedUserId(expanded ? null : entry.user_id);
    const areaButton = <button type="button" aria-expanded={expanded} aria-controls={panelId} aria-label={t("contributionsFor", { name: entry.full_name, area: formatArea(entry.completed_area_m2) })} onClick={toggle} className="ui-numeric -mx-2 -my-2 inline-flex min-h-9 cursor-pointer items-center justify-end gap-1 rounded-[var(--ui-radius-control)] border border-transparent bg-transparent px-2 py-2 text-right text-sm font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 motion-reduce:transition-none">{formatArea(entry.completed_area_m2)}<ChevronDown aria-hidden="true" className={`size-3.5 text-[var(--ui-text-muted)] transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} /></button>;
    return <li key={entry.user_id}>
      <div className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:px-5 ${monthlyBonusesApply ? "sm:grid-cols-[3rem_minmax(0,1fr)_8rem_5.5rem_5.5rem]" : "sm:grid-cols-[3rem_minmax(0,1fr)_8rem_5.5rem]"}`}>
        <p className={`ui-numeric text-sm font-semibold ${entry.bonusPercent > 0 ? "text-[var(--ui-text)]" : "text-[var(--ui-text-muted)]"}`}>#{entry.rank}</p>
        <div className="flex min-w-0 items-center gap-2"><UserAvatar imageUrl={entry.avatar_url} name={entry.full_name} size="boardCard" decorative /><div className="min-w-0"><p className="truncate font-medium text-[var(--ui-text)]">{entry.full_name}</p><p className="truncate text-sm text-[var(--ui-text-secondary)]">{entry.job_title}</p></div></div>
        <div className="hidden justify-self-end sm:block">{areaButton}</div>
        <p className="hidden text-right text-sm ui-numeric text-[var(--ui-text-secondary)] sm:block">{t("tasks", { count: entry.completed_tasks })}</p>
        {monthlyBonusesApply ? <div className="justify-self-end">{entry.bonusPercent > 0 ? <span className="inline-flex rounded-full border border-[var(--ui-violet-border)] bg-[var(--ui-violet-surface)] px-2 py-1 text-xs font-semibold tabular-nums text-[var(--ui-violet-text)]">{t("bonus", { bonus: entry.bonusPercent })}</span> : <span className="text-xs text-[var(--ui-text-muted)]">—</span>}</div> : null}
        <div className="col-span-2 flex items-center gap-3 text-xs text-[var(--ui-text-secondary)] sm:hidden">{areaButton}<span className="ui-numeric">{t("tasks", { count: entry.completed_tasks })}</span></div>
      </div>
      <div id={panelId} aria-hidden={!expanded} inert={!expanded} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden"><div ref={expanded ? contributionScrollerRef : null} className="max-h-[calc(min(28rem,55vh)_+_25px)] overscroll-y-contain overflow-y-auto border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)]">
          <div className="px-4 py-3 sm:px-5">{groups.length ? <div className="space-y-2">{groups.map((group) => <section key={group.project_id} aria-label={group.project_name ?? t("unavailableProject")}>
            <h3 className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--ui-text-secondary)]"><span className="min-w-0 truncate">{group.project_name ?? t("unavailableProject")}</span><span className="ui-numeric shrink-0 text-[var(--ui-text)]">{formatArea(group.completed_area_m2)}</span></h3>
            <ul className="px-1 py-1">{group.records.map((record) => <li key={record.id} className="flex items-start justify-between gap-4 px-2 py-1.5 text-sm"><div className="min-w-0"><p className="break-words text-[var(--ui-text-secondary)]">{record.source_type === "project_fallback" ? t("projectCredit") : record.task_title ?? t("unavailableTask")}</p><p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{record.task_stage ? `${stageLabels[record.task_stage]} · ` : ""}{formatDate(record.completed_at)}</p></div><span className="ui-numeric shrink-0 font-medium text-[var(--ui-text)]">+{formatArea(record.credited_area_m2)}</span></li>)}</ul>
          </section>)}</div> : <p className="text-sm text-[var(--ui-text-muted)]">{t("noAreaContributions")}</p>}</div>
        </div></div>
      </div>
    </li>;
  })}</ol>;
}
