"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import { createClient } from "@/lib/supabase/client";
import { MAX_LEADERBOARD_BONUS_PLACES, type LeaderboardBonusConfig, type LeaderboardBonusRule } from "@/lib/leaderboard-bonus-rules";

const DEFAULT_BONUS_PERCENT = 0;

export function LeaderboardBonusSettings({ studioId, initialConfig, onSaved }: { studioId: string; initialConfig: LeaderboardBonusConfig; onSaved?: () => void }) {
  const t = useTranslations("Administration");
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [rules, setRules] = useState(initialConfig.rules);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const isDirty = enabled !== initialConfig.enabled || JSON.stringify(rules) !== JSON.stringify(initialConfig.rules);

  function setPlaceCount(value: number) {
    const count = Math.max(1, Math.min(MAX_LEADERBOARD_BONUS_PLACES, value));
    setRules((current) => Array.from({ length: count }, (_, index) => current[index] ?? { place: index + 1, bonusPercent: DEFAULT_BONUS_PERCENT }));
  }

  function setBonusPercent(place: number, value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setRules((current) => current.map((rule) => rule.place === place ? { ...rule, bonusPercent: Math.max(0, Math.min(100, parsed)) } : rule));
  }

  async function save() {
    if (isSaving || !isDirty) return;
    setIsSaving(true);
    setError("");
    const { error: saveError } = await createClient().rpc("save_leaderboard_bonus_rules", { p_studio_id: studioId, p_enabled: enabled, p_rules: rules });
    if (saveError) setError(t("leaderboardBonusSaveFailed"));
    else if (onSaved) onSaved();
    else window.location.reload();
    setIsSaving(false);
  }

  return <section aria-labelledby="leaderboard-bonuses-heading" className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="max-w-xl"><div className="flex items-center gap-2"><Trophy className="size-4 text-[var(--ui-text-secondary)]" aria-hidden="true" /><h2 id="leaderboard-bonuses-heading" className="text-base font-semibold text-[var(--ui-text)]">{t("leaderboardBonuses")}</h2></div><p className="mt-1 text-sm leading-5 text-[var(--ui-text-muted)]">{t("leaderboardBonusesDescription")}</p></div><label className="flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--ui-text)]"><input type="checkbox" checked={enabled} disabled={isSaving} onChange={(event) => setEnabled(event.target.checked)} className="size-5 rounded border-[var(--ui-border-strong)] accent-[var(--ui-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2" />{t("leaderboardBonusesEnabled")}</label></div>
    <div className="grid gap-4 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-3 sm:p-4">
      <label className="grid max-w-72 gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]"><span>{t("leaderboardBonusPlaceCount")}</span><Input type="number" min="1" max={MAX_LEADERBOARD_BONUS_PLACES} step="1" inputMode="numeric" value={rules.length} disabled={isSaving} onChange={(event) => setPlaceCount(Number(event.target.value))} onBlur={(event) => setPlaceCount(Number(event.target.value) || 1)} /></label>
      <ol className="divide-y divide-[var(--ui-border)] border-y border-[var(--ui-border)]">{rules.map((rule) => <BonusRuleRow key={rule.place} rule={rule} disabled={isSaving} onChange={setBonusPercent} placeLabel={t("leaderboardBonusPlace", { place: rule.place })} percentLabel={t("leaderboardBonusPercent", { place: rule.place })} />)}</ol>
      {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
      <div className="flex justify-end"><Button type="button" size="sm" className="min-h-11" disabled={!isDirty || isSaving} onClick={() => void save()}>{isSaving ? t("leaderboardBonusSaving") : t("leaderboardBonusSave")}</Button></div>
    </div>
  </section>;
}

function BonusRuleRow({ rule, disabled, onChange, placeLabel, percentLabel }: { rule: LeaderboardBonusRule; disabled: boolean; onChange: (place: number, value: string) => void; placeLabel: string; percentLabel: string }) {
  return <li className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 py-2.5"><p className="text-sm font-medium text-[var(--ui-text)]">{placeLabel}</p><label className="relative"><span className="sr-only">{percentLabel}</span><Input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={rule.bonusPercent} disabled={disabled} className="pr-8 text-right ui-numeric" onChange={(event) => onChange(rule.place, event.target.value)} /><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--ui-text-muted)]">%</span></label></li>;
}
