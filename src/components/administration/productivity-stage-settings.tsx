"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import { productivityStagePercentSchema } from "@/lib/productivity-settings";

export function ProductivityStageSettings({ initialPercent, onSave }: { initialPercent: number; onSave: (percent: number) => Promise<boolean> }) {
  const t = useTranslations("Administration");
  const stages = useTranslations("TaskStages");
  const [value, setValue] = useState(String(initialPercent));
  const [saved, setSaved] = useState(initialPercent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const percent = Number(value);
  const valid = value.trim() !== "" && productivityStagePercentSchema.safeParse(percent).success;

  async function save() {
    if (!valid || saving || percent === saved) return;
    setSaving(true); setError(false);
    try {
      if (!await onSave(percent)) { setError(true); return; }
      setSaved(percent);
    } catch { setError(true); }
    finally { setSaving(false); }
  }

  return <section aria-labelledby="productivity-stages-heading" className="space-y-3">
    <h2 id="productivity-stages-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--ui-text)]"><Ruler aria-hidden="true" className="size-4 text-[var(--ui-text-secondary)]" />{t("productivityStageShares")}</h2>
    <p className="text-sm leading-5 text-[var(--ui-text-muted)]">{t("productivityStageSharesDescription")}</p>
    <div className="grid grid-cols-2 gap-3">
      <label className="grid gap-1.5 text-sm text-[var(--ui-text-secondary)]">{stages("stage_1")}<span className="relative"><Input type="number" min="0" max="100" step="any" inputMode="decimal" value={value} disabled={saving} className="ui-numeric pr-8" onChange={event => setValue(event.target.value)} /><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--ui-text-muted)]">%</span></span></label>
      <div className="grid content-start gap-1.5 text-sm text-[var(--ui-text-secondary)]"><span id="productivity-stage-three-label">{stages("stage_3")}</span><output aria-labelledby="productivity-stage-three-label" className="ui-numeric flex h-11 items-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] px-3">{valid ? `${Number((100 - percent).toFixed(10))}%` : "—"}</output></div>
    </div>
    <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("productivityStageSharesRecalculate")}</p>
    {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("productivityStageSharesSaveFailed")}</p> : null}
    <div className="flex justify-end"><Button type="button" size="sm" disabled={!valid || percent === saved || saving} onClick={() => void save()}>{saving ? t("vacationSaving") : t("vacationSave")}</Button></div>
  </section>;
}
