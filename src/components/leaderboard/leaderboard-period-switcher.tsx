"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarRange } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LeaderboardMonthTimeline } from "@/components/leaderboard/leaderboard-month-timeline";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { getKyivPeriodLabel, parseLeaderboardMonthRange, type LeaderboardMonthRange, type LeaderboardPeriod, type LeaderboardPeriodMode } from "@/lib/productivity";

export function LeaderboardPeriodSwitcher({ period, initialRange, locale }: { period: LeaderboardPeriod; initialRange: LeaderboardMonthRange; locale: string }) {
  const t = useTranslations("Leaderboard");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedMode: LeaderboardPeriodMode = typeof period === "string" ? period : "custom";
  const activeRange = typeof period === "string" ? initialRange : period;
  const [open, setOpen] = useState(false);

  function replaceQuery(mode: LeaderboardPeriodMode, range: LeaderboardMonthRange) {
    const params = new URLSearchParams(searchParams.toString());
    if (mode === "month") params.delete("period");
    else params.set("period", mode);
    if (mode === "custom" || params.has("from") || params.has("through")) {
      params.set("from", range.from);
      params.set("through", range.through);
    }
    const query = params.toString();
    if (query === searchParams.toString()) return;
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function changeMode(mode: LeaderboardPeriodMode) {
    setOpen(false);
    if (mode === "custom") {
      const remembered = parseLeaderboardMonthRange(searchParams.get("from") ?? undefined, searchParams.get("through") ?? undefined) ?? activeRange;
      replaceQuery(mode, remembered);
      return;
    }
    replaceQuery(mode, activeRange);
  }

  const rangeLabel = getKyivPeriodLabel(activeRange, locale);

  return <div className="flex max-w-full flex-wrap items-center gap-1">
    <SegmentedControl ariaLabel={t("periodSelector")} className="w-full sm:w-auto [&_button]:flex-1 [&_button]:px-2 sm:[&_button]:px-3" items={[
      { value: "month", label: t("month") },
      { value: "quarter", label: t("quarter") },
      { value: "year", label: t("year") },
      { value: "custom", label: t("period") },
    ]} value={selectedMode} onValueChange={changeMode} />
    {selectedMode === "custom" ? <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button type="button" variant="outline" aria-label={t("chooseMonthRange")} aria-expanded={open} aria-haspopup="dialog" className="max-w-full gap-2 px-3 font-medium text-[var(--ui-text)]">
          <CalendarRange className="size-4 shrink-0 text-[var(--ui-text-secondary)]" aria-hidden="true" />
          <span className="truncate capitalize">{rangeLabel}</span>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content aria-label={t("chooseMonthRange")} align="end" sideOffset={6} collisionPadding={8} className="z-[80] w-[min(23rem,calc(100vw-1rem))] rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-3 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)] motion-safe:data-[state=open]:animate-[checklist-picker-in_180ms_ease-out] motion-safe:data-[state=closed]:animate-[people-picker-out_160ms_ease-in]">
          <LeaderboardMonthTimeline value={activeRange} locale={locale} onCommit={(range) => replaceQuery("custom", range)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root> : null}
  </div>;
}
