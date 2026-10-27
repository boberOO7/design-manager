"use client";

import * as Popover from "@radix-ui/react-popover";
import { MoreHorizontal, Settings2, X } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveProductivityStageShares } from "@/app/(app)/leaderboard/actions";
import { ProductivityStageSettings } from "@/components/administration/productivity-stage-settings";
import { LeaderboardBonusSettings } from "@/components/administration/leaderboard-bonus-settings";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import type { LeaderboardBonusConfig } from "@/lib/leaderboard-bonus-rules";

export function LeaderboardBonusMenu({ studioId, bonusConfig, stageOnePercent }: { stageOnePercent: number; studioId: string; bonusConfig: LeaderboardBonusConfig; leaderboardVisibleToEmployees: boolean }) {
  const t = useTranslations("Leaderboard");
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function openSettings() {
    setMenuOpen(false);
    setDrawerOpen(true);
  }

  function handleSaved() {
    setDrawerOpen(false);
    router.refresh();
  }

  return <>
    <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Popover.Trigger asChild><Button ref={triggerRef} type="button" size="sm" variant="ghost" className="size-11 shrink-0 p-0" aria-label={t("bonusActions")}><MoreHorizontal className="size-5" aria-hidden="true" /></Button></Popover.Trigger>
      <Popover.Portal><Popover.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-panel)]"><button type="button" onClick={openSettings} className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-3 text-left text-sm font-medium text-[var(--ui-text)] outline-none transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:bg-[var(--ui-surface-muted)]"><Settings2 className="size-4 text-[var(--ui-text-secondary)]" aria-hidden="true" />{t("configureBonuses")}</button></Popover.Content></Popover.Portal>
    </Popover.Root>
    <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} initialFocusRef={closeRef} returnFocusRef={triggerRef} title={t("settingsTitle")} className="w-full max-w-[34rem]">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--ui-border)] px-4 py-3 sm:px-5"><h2 className="text-lg font-semibold text-[var(--ui-text)]">{t("settingsTitle")}</h2><Button ref={closeRef} type="button" size="sm" variant="ghost" className="size-11 shrink-0 p-0" onClick={() => setDrawerOpen(false)} aria-label={t("closeBonusSettings")}><X className="size-4" aria-hidden="true" /></Button></header>
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-5"><div className="border-b border-[var(--ui-border)] pb-6"><ProductivityStageSettings initialPercent={stageOnePercent} onSave={async percent => { const saved = await saveProductivityStageShares(percent); if (saved) router.refresh(); return saved; }} /></div><LeaderboardBonusSettings studioId={studioId} initialConfig={bonusConfig} onSaved={handleSaved} /></main>
    </Drawer>
  </>;
}
