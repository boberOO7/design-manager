"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { useLocale, useTranslations } from "next-intl";
import { Eye, EyeOff, MoreHorizontal, TreePalm } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import type { VacationPolicy } from "@/lib/administration";
import { vacationRecalculationPreviewSchema, type VacationRecalculationPreview } from "@/lib/vacation-policy";

export function VacationPolicySettings({ studioId, initialPolicy, initialVisible }: { studioId: string; initialPolicy: VacationPolicy; initialVisible: boolean }) {
  const t = useTranslations("Administration");
  const locale = useLocale();
  const router = useRouter();
  const yearBoundaryName = useId();
  const saveRef = useRef<HTMLButtonElement>(null);
  const [saved, setSaved] = useState(initialPolicy);
  const [visible, setVisible] = useState(initialVisible);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibilityError, setVisibilityError] = useState(false);
  const [annualDays, setAnnualDays] = useState(String(initialPolicy.annualDays));
  const [yearBoundary, setYearBoundary] = useState(initialPolicy.yearBoundary);
  const [carryRule, setCarryRule] = useState<VacationPolicy["carryRule"]>(initialPolicy.carryRule);
  const [carryCapDays, setCarryCapDays] = useState(String(initialPolicy.carryCapDays ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [application, setApplication] = useState("future_only");
  const [preview, setPreview] = useState<{ policy: VacationPolicy; value: VacationRecalculationPreview } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [confirmNegative, setConfirmNegative] = useState(false);
  const annual = Number(annualDays);
  const cap = Number(carryCapDays);
  const valid = annualDays !== "" && Number.isSafeInteger(annual) && annual >= 0
    && (carryRule !== "capped" || (carryCapDays !== "" && Number.isSafeInteger(cap) && cap >= 0));
  const next: VacationPolicy = { annualDays: annual, carryRule, carryCapDays: carryRule === "capped" ? cap : null, yearBoundary };
  const dirty = next.annualDays !== saved.annualDays || next.carryRule !== saved.carryRule || next.carryCapDays !== saved.carryCapDays || next.yearBoundary !== saved.yearBoundary;
  const monthly = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(annual / 12);
  const days = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(locale).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));

  async function save() {
    if (!valid || (!dirty && application !== "recalculate") || saving) return;
    setSaving(true); setError("");
    try {
      const input = { p_studio_id: studioId, p_annual_days: next.annualDays, p_carry_rule: next.carryRule, p_year_boundary: next.yearBoundary,
        ...(next.carryCapDays === null ? {} : { p_carry_cap_days: next.carryCapDays }) };
      if (application === "recalculate") {
        const result = await createClient().rpc("preview_studio_vacation_policy_recalculation", input);
        const parsed = vacationRecalculationPreviewSchema.safeParse(result.data);
        if (result.error || !parsed.success) throw new Error("preview_failed");
        setPreview({ policy: next, value: parsed.data }); setPreviewError(""); setConfirmNegative(false);
      } else {
        const result = await createClient().rpc("save_studio_vacation_policy", input);
        if (result.error) throw result.error;
        setSaved(next); router.refresh();
      }
    } catch {
      if (preview) setPreviewError(t("vacationPolicyPreviewFailed"));
      else setError(t(application === "recalculate" ? "vacationPolicyPreviewFailed" : "vacationPolicySaveFailed"));
    } finally { setSaving(false); }
  }

  async function applyRecalculation() {
    if (!preview || saving || (preview.value.hasShortfall && !confirmNegative)) return;
    setSaving(true); setPreviewError("");
    try {
      const result = await createClient().rpc("recalculate_studio_vacation_policy", {
        p_studio_id: studioId, p_annual_days: preview.policy.annualDays, p_carry_rule: preview.policy.carryRule, p_year_boundary: preview.policy.yearBoundary,
        ...(preview.policy.carryCapDays === null ? {} : { p_carry_cap_days: preview.policy.carryCapDays }),
        p_preview_digest: preview.value.digest, p_confirm_negative: confirmNegative,
      });
      if (result.error) {
        setPreviewError(t(result.error.message.includes("vacation_policy_preview_stale") ? "vacationPolicyPreviewStale"
          : result.error.code === "55P03" ? "vacationPolicyBusy" : "vacationPolicySaveFailed"));
        return;
      }
      setSaved(preview.policy); setPreview(null); setApplication("future_only"); router.refresh();
    } catch { setPreviewError(t("vacationPolicySaveFailed")); }
    finally { setSaving(false); }
  }

  async function toggleVisibility() {
    if (visibilitySaving) return;
    setVisibilitySaving(true); setVisibilityError(false);
    const { error: saveError } = await createClient().rpc("set_vacation_employee_visibility", { p_studio_id: studioId, p_visible: !visible });
    if (saveError) setVisibilityError(true);
    else { setVisible(!visible); setMenuOpen(false); }
    setVisibilitySaving(false);
  }

  return <section aria-labelledby="vacation-policy-heading" className="space-y-2">
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><TreePalm aria-hidden="true" className="size-4 text-[var(--ui-text-secondary)]" /><h2 id="vacation-policy-heading" className="text-base font-semibold text-[var(--ui-text)]">{t("vacationPolicy")}</h2></div><Popover.Root open={menuOpen} onOpenChange={setMenuOpen}><Popover.Trigger asChild><button type="button" aria-label={t("vacationActions")} aria-haspopup="menu" className="flex size-9 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><MoreHorizontal aria-hidden="true" className="size-5" /></button></Popover.Trigger><Popover.Portal><Popover.Content role="menu" align="end" sideOffset={6} className="z-[80] min-w-52 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]"><button type="button" role="menuitem" disabled={visibilitySaving} onClick={() => void toggleVisibility()} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-50">{visible ? <Eye aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-muted)]" /> : <EyeOff aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-muted)]" />}{visible ? t("vacationHideFromEmployees") : t("vacationShowToEmployees")}</button></Popover.Content></Popover.Portal></Popover.Root></div>
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <label className="grid w-[7.5rem] shrink-0 gap-1 text-sm font-medium text-[var(--ui-text-secondary)]"><span>{t("vacationAnnualDays")}</span><Input className="w-[7.5rem]" type="number" min="0" step="1" inputMode="numeric" value={annualDays} disabled={saving} onChange={(event) => setAnnualDays(event.target.value)} /></label>
      <div className="grid min-w-0 gap-1 text-sm font-medium text-[var(--ui-text-secondary)]"><span>{t("vacationMonthlyRate")}</span><p className="text-sm text-[var(--ui-text)]">{Number.isFinite(annual) && annualDays !== "" ? `${annual % 12 === 0 ? "" : "≈ "}${monthly} ${t("vacationDaysPerMonth")}` : "—"}</p></div>
      <label className="grid w-[10.5rem] max-w-full gap-1 text-sm font-medium text-[var(--ui-text-secondary)]"><span>{t("vacationCarryRule")}</span><Select disabled={saving} className="w-full" value={carryRule} onValueChange={(value) => setCarryRule(value === "capped" ? "capped" : value === "none" ? "none" : "carry_all")}><SelectItem value="carry_all">{t("vacationCarryAll")}</SelectItem><SelectItem value="capped">{t("vacationCarryCapped")}</SelectItem><SelectItem value="none">{t("vacationCarryNone")}</SelectItem></Select></label>
      {carryRule === "capped" ? <label className="grid w-[10.5rem] max-w-full gap-1 text-sm font-medium text-[var(--ui-text-secondary)]"><span>{t("vacationCarryCap")}</span><Input className="w-[7.5rem]" type="number" min="0" step="1" inputMode="numeric" value={carryCapDays} disabled={saving} onChange={(event) => setCarryCapDays(event.target.value)} /></label> : null}
    </div>
    <fieldset disabled={saving} className="min-w-0 space-y-1">
      <legend className="text-sm font-medium text-[var(--ui-text-secondary)]">{t("vacationYearBoundary")}</legend>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-1">
        {(["employee", "calendar"] as const).map(mode => <label key={mode} className="min-w-0 flex-auto cursor-pointer">
          <input type="radio" name={yearBoundaryName} value={mode} checked={yearBoundary === mode} onChange={() => setYearBoundary(mode)} className="peer sr-only" />
          <span className="block rounded-md px-3 py-2 text-center text-xs font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 peer-checked:bg-[var(--ui-surface)] peer-checked:text-[var(--ui-text)] peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ui-focus)] peer-disabled:cursor-default peer-disabled:opacity-50">{t(mode === "employee" ? "vacationYearEmployee" : "vacationYearCalendar")}</span>
        </label>)}
      </div>
    </fieldset>
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="space-y-1">
        <p className="text-xs text-[var(--ui-text-muted)]">{t(yearBoundary === "calendar" ? "vacationCalendarYearDescription" : "vacationWorkYear")}</p>
        {carryRule !== "carry_all" ? <p className="text-xs text-[var(--ui-text-muted)]">{t("vacationLegalNote")}</p> : null}
      </div>
      <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto"><label className="grid w-full gap-1 text-xs font-medium text-[var(--ui-text-secondary)] sm:w-80"><span>{t("vacationPolicyApplication")}</span><Select disabled={saving} value={application} onValueChange={setApplication}><SelectItem value="future_only">{t("vacationFutureOnly")}</SelectItem><SelectItem value="recalculate">{t("vacationRecalculate")}</SelectItem></Select></label><Button ref={saveRef} type="button" size="sm" disabled={!valid || (!dirty && application !== "recalculate") || saving} onClick={() => void save()}>{saving ? t("vacationSaving") : t(application === "recalculate" ? "vacationPreviewChanges" : "vacationSave")}</Button></div>
    </div>
    <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t(application === "recalculate" ? "vacationRecalculateDescription" : "vacationFutureOnlyDescription")}</p>
    {visibilityError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("vacationVisibilitySaveFailed")}</p> : null}
    {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    <Dialog isOpen={preview !== null} title={t("vacationPreviewTitle")} description={preview ? t("vacationPreviewDescription", { date: date(preview.value.asOf) }) : undefined} closeDisabled={saving} closeLabel={t("vacationPreviewCancel")} returnFocusRef={saveRef} onRequestClose={() => { if (!saving) setPreview(null); }}>
      {preview ? <>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-6">
          <p className="text-sm font-medium text-[var(--ui-text-secondary)]">{t("vacationYearBoundary")}: {t(preview.policy.yearBoundary === "calendar" ? "vacationYearCalendar" : "vacationYearEmployee")}</p>
          <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("vacationPreviewBaseline")}</p>
          {preview.value.hasShortfall ? <p role="alert" className="rounded-[var(--ui-radius-control)] bg-[var(--ui-warning-surface)] p-3 text-sm text-[var(--ui-warning-text)]">{t("vacationPreviewShortfall")}</p> : null}
          <div className="overflow-x-auto"><table className="w-full text-left text-xs [&_td]:px-3 [&_td]:py-3 [&_th]:px-3 [&_th]:py-3"><caption className="sr-only">{t("vacationPreviewTitle")}</caption><thead className="bg-[var(--ui-surface-subtle)] text-[var(--ui-text-secondary)]"><tr><th scope="col" className="min-w-44 font-medium">{t("vacationPreviewEmployee")}</th>{["vacationPreviewBefore", "vacationPreviewAfter", "vacationPreviewDelta", "vacationPreviewUsed", "vacationPreviewReserved"].map(key => <th scope="col" className="whitespace-nowrap text-right font-medium" key={key}>{t(key)}</th>)}</tr></thead><tbody>{preview.value.employees.map(employee => <tr key={employee.userId} className="border-t border-[var(--ui-border-subtle)]"><th scope="row" className="font-medium text-[var(--ui-text)]">{employee.name || employee.userId}<span className="mt-1 block text-[10px] font-normal leading-4 text-[var(--ui-text-muted)]">{employee.accrualFrom ? t("vacationPreviewFrom", { date: date(employee.accrualFrom) }) : t("vacationPreviewUnknown")}{employee.openingDays !== null ? ` · ${t("vacationPreviewOpening", { count: employee.openingDays })}` : ""}</span>{employee.minimumBalance !== null && employee.minimumBalance < 0 && employee.shortfallDate ? <span className="mt-1 block text-[10px] font-normal leading-4 text-[var(--ui-danger-text)]">{t("vacationPreviewDeficit", { days: days(-employee.minimumBalance), date: date(employee.shortfallDate) })}</span> : null}</th><td className="text-right tabular-nums">{days(employee.before)}</td><td className={`text-right font-medium tabular-nums ${employee.after !== null && employee.after < 0 ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text)]"}`}>{days(employee.after)}</td><td className="text-right tabular-nums">{employee.delta !== null && employee.delta > 0 ? "+" : ""}{days(employee.delta)}</td><td className="text-right tabular-nums">{days(employee.usedDays)}</td><td className="text-right tabular-nums">{days(employee.reservedDays)}</td></tr>)}</tbody></table></div>
          {!preview.value.employees.length ? <p className="text-sm text-[var(--ui-text-muted)]">{t("vacationPreviewEmpty")}</p> : null}
          {preview.value.hasShortfall ? <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-[var(--ui-text-secondary)]"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--ui-action-primary)]" checked={confirmNegative} disabled={saving} onChange={event => setConfirmNegative(event.target.checked)} /><span>{t("vacationConfirmNegative")}</span></label> : null}
          {previewError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{previewError}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--ui-border)] p-4 sm:px-6"><Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setPreview(null)}>{t("vacationPreviewCancel")}</Button>{previewError ? <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void save()}>{t("vacationPreviewRefresh")}</Button> : null}<Button type="button" size="sm" disabled={saving || Boolean(previewError) || (preview.value.hasShortfall && !confirmNegative)} onClick={() => void applyRecalculation()}>{saving ? t("vacationSaving") : t("vacationConfirmRecalculation")}</Button></div>
      </> : null}
    </Dialog>
  </section>;
}
