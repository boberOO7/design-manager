"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { TreePalm } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { VacationPolicy } from "@/lib/administration";

export function VacationPolicySettings({ studioId, initialPolicy }: { studioId: string; initialPolicy: VacationPolicy }) {
  const t = useTranslations("Administration");
  const locale = useLocale();
  const [saved, setSaved] = useState(initialPolicy);
  const [annualDays, setAnnualDays] = useState(String(initialPolicy.annualDays));
  const [carryRule, setCarryRule] = useState<VacationPolicy["carryRule"]>(initialPolicy.carryRule);
  const [carryCapDays, setCarryCapDays] = useState(String(initialPolicy.carryCapDays ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const annual = Number(annualDays);
  const cap = Number(carryCapDays);
  const valid = annualDays !== "" && Number.isSafeInteger(annual) && annual >= 0
    && (carryRule !== "capped" || (carryCapDays !== "" && Number.isSafeInteger(cap) && cap >= 0));
  const next: VacationPolicy = { annualDays: annual, carryRule, carryCapDays: carryRule === "capped" ? cap : null };
  const dirty = next.annualDays !== saved.annualDays || next.carryRule !== saved.carryRule || next.carryCapDays !== saved.carryCapDays;
  const monthly = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(annual / 12);

  async function save() {
    if (!valid || !dirty || saving) return;
    setSaving(true); setError("");
    const { error: saveError } = await createClient().rpc("save_studio_vacation_policy", {
      p_studio_id: studioId, p_annual_days: next.annualDays, p_carry_rule: next.carryRule,
      ...(next.carryCapDays === null ? {} : { p_carry_cap_days: next.carryCapDays }),
    });
    if (saveError) setError(t("vacationPolicySaveFailed"));
    else setSaved(next);
    setSaving(false);
  }

  return <section aria-labelledby="vacation-policy-heading" className="space-y-2">
    <div className="flex items-center gap-2"><TreePalm aria-hidden="true" className="size-4 text-[var(--ui-text-secondary)]" /><h2 id="vacation-policy-heading" className="text-base font-semibold text-[var(--ui-text)]">{t("vacationPolicy")}</h2></div>
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <label className="grid w-[7.5rem] shrink-0 gap-1 text-sm font-medium text-[var(--ui-text-secondary)]"><span>{t("vacationAnnualDays")}</span><Input className="w-[7.5rem]" type="number" min="0" step="1" inputMode="numeric" value={annualDays} disabled={saving} onChange={(event) => setAnnualDays(event.target.value)} /></label>
      <div className="grid min-w-0 gap-1 text-sm font-medium text-[var(--ui-text-secondary)]"><span>{t("vacationMonthlyRate")}</span><p className="text-sm text-[var(--ui-text)]">{Number.isFinite(annual) && annualDays !== "" ? `${annual % 12 === 0 ? "" : "≈ "}${monthly} ${t("vacationDaysPerMonth")}` : "—"}</p></div>
      <label className="grid w-[10.5rem] max-w-full gap-1 text-sm font-medium text-[var(--ui-text-secondary)]"><span>{t("vacationCarryRule")}</span><Select className="w-full" value={carryRule} onValueChange={(value) => setCarryRule(value === "capped" ? "capped" : value === "none" ? "none" : "carry_all")}><SelectItem value="carry_all">{t("vacationCarryAll")}</SelectItem><SelectItem value="capped">{t("vacationCarryCapped")}</SelectItem><SelectItem value="none">{t("vacationCarryNone")}</SelectItem></Select></label>
      {carryRule === "capped" ? <label className="grid w-[10.5rem] max-w-full gap-1 text-sm font-medium text-[var(--ui-text-secondary)]"><span>{t("vacationCarryCap")}</span><Input className="w-[7.5rem]" type="number" min="0" step="1" inputMode="numeric" value={carryCapDays} disabled={saving} onChange={(event) => setCarryCapDays(event.target.value)} /></label> : null}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="space-y-1">
        <p className="text-xs text-[var(--ui-text-muted)]">{t("vacationWorkYear")}</p>
        {carryRule !== "carry_all" ? <p className="text-xs text-[var(--ui-text-muted)]">{t("vacationLegalNote")}</p> : null}
      </div>
      <Button type="button" size="sm" disabled={!valid || !dirty || saving} onClick={() => void save()}>{saving ? t("vacationSaving") : t("vacationSave")}</Button>
    </div>
    {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
  </section>;
}
