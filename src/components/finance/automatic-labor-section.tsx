"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { previewAutomaticLabor, saveAutomaticLabor, type AutomaticLaborActivationPreview } from "@/app/(app)/finance/reports/automatic-labor-actions";
import { FinanceActionForm } from "@/components/finance/finance-action-form";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { FormField, Input } from "@/components/ui/form-field";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { financeAmountText, financeAmountUnits, formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import type { FinanceLaborData } from "@/lib/finance-labor";
import { formatDateOnly } from "@/lib/utils";

type Project = { id: string; name: string };
const panel = "min-w-0 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5";
const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;
function minutesFromHours(value: string) {
  const minutes = Number(value) * 60;
  return Number.isSafeInteger(minutes) && minutes > 0 ? String(minutes) : "";
}

function exactSum(values: Array<string | number | null | undefined>, digits: number) {
  if (values.some(value => value === null || value === undefined)) return null;
  try { return financeAmountText(values.reduce((sum, value) => sum + financeAmountUnits(String(value), digits), BigInt(0)), digits); }
  catch { return null; }
}
function effectiveCapacity(rows: NonNullable<FinanceLaborData["capacity"]>, employeeId: string | null, date: string) {
  return rows.filter(row => row.employee_id === employeeId && row.effective_from <= date)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from)).at(-1);
}

export function AutomaticLaborSection({ data, projects, currencies, baseCurrency, from, to, today }: {
  data: FinanceLaborData; projects: Project[]; currencies: FinanceCurrency[]; baseCurrency: string; from: string; to: string; today: string;
}) {
  const t = useTranslations("Finance.labor.auto"), locale = useLocale(), router = useRouter();
  const automation = data.automation ?? null;
  const periods = (data.automaticPeriods ?? []).filter(period => period.periodStart <= to && period.periodEnd >= from);
  const internalProject = projects.find(project => project.id === automation?.internalProjectId);
  const date = (value: string) => formatDateOnly(value, locale);
  const money = (value: string | null, code = baseCurrency) => {
    const unit = currencies.find(item => item.code === code);
    return value === null ? t("unknownAmount") : unit ? formatFinanceAmount(value, unit, locale) : `${value} ${code}`;
  };
  const refresh = () => router.refresh();

  return <Panel className={`${panel} space-y-3`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-semibold">{t("title")}</h3><p className="mt-1 max-w-3xl text-sm text-[var(--ui-text-secondary)]">{t("help")}</p></div>
      {automation ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("activeFrom", { date: date(automation.startsOn) })}{internalProject ? ` · ${t("internalProject", { project: internalProject.name })}` : ""}</p> : null}
    </div>
    {!automation ? <ActivationForm projects={projects} capacity={data.capacity ?? []} today={today} locale={locale} onSaved={refresh}/> : <>
      <AnimatedDisclosure title={t("editActivationTitle")}><ActivationForm projects={projects} capacity={data.capacity ?? []} today={today} locale={locale} internalProjectId={automation.internalProjectId} changingActivation onSaved={refresh}/></AnimatedDisclosure>
      {!data.capacity?.length ? <p className="rounded-[var(--ui-radius-control)] border border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] p-3 text-sm text-[var(--ui-warning-text)]">{t("capacityMissing")}</p> : null}
      <AnimatedDisclosure title={t("capacityTitle", { count: data.capacity?.length ?? 0 })}>
        <CapacityForm capacity={data.capacity ?? []} employees={data.employees ?? []} locale={locale} today={today} internalProjectId={automation.internalProjectId} onSaved={refresh}/>
      </AnimatedDisclosure>
      {!periods.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("noPeriods")}</p> : <ul className="divide-y divide-[var(--ui-border)]">{periods.map(period => {
        const provisional = period.status === "provisional";
        const amountCurrency = provisional ? period.reportingCurrency ?? baseCurrency : baseCurrency;
        const amountDigits = currencies.find(item => item.code === amountCurrency)?.minor_units ?? 2;
        const poolIds = new Set(period.pools.map(pool => pool.id));
        const allocated = new Map<string, bigint>();
        for (const item of data.allocations) if (poolIds.has(item.entry_id)) allocated.set(item.project_id, (allocated.get(item.project_id) ?? BigInt(0)) + financeAmountUnits(item.amount, amountDigits));
        const savedProjectRows = [...allocated].map(([projectId, amount]) => ({ projectId, amount: financeAmountText(amount, amountDigits) })).filter(item => item.projectId !== automation.internalProjectId && item.projectId !== "");
        const projectRows = provisional ? period.provisionalAllocations ?? [] : savedProjectRows;
        const totalPool = provisional
          ? exactSum([...projectRows.map(item => item.amount), period.provisionalRemainder], amountDigits)
          : period.pools.length
          ? exactSum(period.pools.map(pool => pool.available), amountDigits)
          : period.source && financeAmountUnits(period.source.knownCost, 4) === BigInt(0) ? "0" : null;
        const totalAllocated = provisional ? null : exactSum(projectRows.map(item => item.amount), amountDigits);
        const remainder = provisional ? period.provisionalRemainder ?? null : totalPool === null || totalAllocated === null ? null : financeAmountText(financeAmountUnits(totalPool, amountDigits) - financeAmountUnits(totalAllocated, amountDigits), amountDigits);
        const statusKey = period.manual ? "manual" : provisional ? "provisional" : period.status;
        return <li key={`${period.obligationId}-${period.periodStart}`} className="space-y-2 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{period.label} · {new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${period.periodStart}T00:00:00Z`))}</p><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{date(period.periodStart)} – {date(period.periodEnd)} · {t(`status.${statusKey}`)}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums">{provisional ? t("provisionalSubtotal", { amount: money(totalPool, amountCurrency) }) : `${t("payrollCost")}: ${period.source ? money(period.source.knownCost, period.source.currency) : t("unknownAmount")}`}</p>{provisional && period.source ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("payrollCost")}: {money(period.source.knownCost, period.source.currency)}</p> : null}</div></div>
          {provisional ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("provisionalCoverage", { from: date(period.accruedFrom ?? period.periodStart), asOf: date(period.asOf ?? to) })}</p> : null}
          <div className="grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs text-[var(--ui-text-muted)]">{t("projectAllocations")}</p>{projectRows.length ? <ul className="mt-1 space-y-1">{projectRows.map(item => <li key={item.projectId} className="flex justify-between gap-3"><span>{projects.find(project => project.id === item.projectId)?.name ?? t("projectUnavailable")}</span><span className="tabular-nums">{money(item.amount)}</span></li>)}</ul> : <p className="mt-1 text-[var(--ui-text-secondary)]">{t("noProjectCost")}</p>}</div><div><p className="text-xs text-[var(--ui-text-muted)]">{provisional ? t("provisionalRemainder") : t("studioRemainder")}</p><p className="mt-1 tabular-nums">{money(remainder)}</p><p className="mt-2 text-xs text-[var(--ui-text-muted)]">{t("coverage", { completed: period.completedDays, required: period.requiredDays })}</p></div></div>
          {period.manual ? <p className="text-xs text-[var(--ui-warning-text)]">{t("manualOwned")}</p> : null}
          {(period.issues.length || !period.manual && period.missingDates.length) ? <div className="space-y-1 text-xs text-[var(--ui-warning-text)]"><ul className="list-inside list-disc">{period.issues.map((issue, index) => <li key={`${issue}-${index}`}>{t(`issue.${issue}`)}</li>)}</ul>{!period.manual && period.missingDates.length ? <p>{t("missingReports", { dates: period.missingDates.map(date).join(", ") })}</p> : null}<div className="flex flex-wrap gap-x-3"><Link className="underline underline-offset-2" href="/finance/schedules">{t("openPayroll")}</Link><Link className="underline underline-offset-2" href={`/team/${period.employeeId}`}>{t("openWorkTracking")}</Link></div></div> : null}
          {(period.status === "pending_review" || period.status === "exception") && !period.issues.some(issue => ["missing_capacity", "source_unavailable"].includes(issue)) && !period.manual && period.source?.sourceReady && period.source.canConfirm ? <CorrectionProposal period={period} projects={projects} current={projectRows} money={money} onSaved={refresh}/> : null}
          {!period.manual && !provisional && period.status !== "pending_review" && period.status !== "exception" && period.source?.sourceReady && period.source.canConfirm ? <FinanceActionForm action={saveAutomaticLabor} onSaved={refresh} label={t("recalculate")} className="pt-1" showMessage><input type="hidden" name="intent" value="recalculate"/><input type="hidden" name="obligationId" value={period.obligationId}/><input type="hidden" name="digest" value={period.digest}/></FinanceActionForm> : null}
        </li>;
      })}</ul>}
      <p className="border-t border-[var(--ui-border)] pt-3 text-xs text-[var(--ui-text-secondary)]">{t("profitabilityNote")}</p>
    </>}
  </Panel>;
}

function ActivationForm({ projects, capacity, today, locale, onSaved, internalProjectId, changingActivation = false }: {
  projects: Project[]; capacity: NonNullable<FinanceLaborData["capacity"]>; today: string; locale: string; onSaved: () => void;
  internalProjectId?: string; changingActivation?: boolean;
}) {
  const t = useTranslations("Finance.labor.auto");
  const studioCapacity = effectiveCapacity(capacity, null, today);
  const form = <CapacitySettingsForm mode={changingActivation ? "activation" : "initial"} projects={projects} employees={[]} capacityRows={capacity} today={today} locale={locale} onSaved={onSaved} internalProjectId={internalProjectId} initialCapacity={studioCapacity}/>;
  return changingActivation ? form : <AnimatedDisclosure title={t("activateTitle")}>{form}</AnimatedDisclosure>;
}

function CapacityForm({ capacity, employees, locale, today, internalProjectId, onSaved }: {
  capacity: NonNullable<FinanceLaborData["capacity"]>; employees: { id: string; name: string }[]; locale: string; today: string; internalProjectId: string; onSaved: () => void;
}) {
  const t = useTranslations("Finance.labor.auto"), studioCapacity = effectiveCapacity(capacity, null, today);
  return <div className="space-y-3 py-3"><ul className="space-y-1 text-xs text-[var(--ui-text-secondary)]">{capacity.map(item => <li key={item.id}>{employees.find(employee => employee.id === item.employee_id)?.name ?? (item.employee_id ? t("employeeUnavailable") : t("studioDefault"))} · {formatDateOnly(item.effective_from, locale)} · {item.daily_minutes / 60}h · {item.weekdays.map(day => t(`weekday.${day}`)).join(", ")}</li>)}</ul><CapacitySettingsForm mode="capacity" projects={[]} employees={employees} capacityRows={capacity} today={today} locale={locale} onSaved={onSaved} internalProjectId={internalProjectId} initialCapacity={studioCapacity}/></div>;
}

type ConfigFormMode = "initial" | "activation" | "capacity";
function monthStart(value: string) { return `${value.slice(0, 7)}-01`; }
function formKey(values: { effectiveFrom: string; dailyMinutes: string; weekdays: number[]; employeeId: string; internalProjectId: string; changeActivation: boolean; confirmed: boolean }) {
  return JSON.stringify([values.effectiveFrom, values.dailyMinutes, JSON.stringify(values.weekdays), values.employeeId, values.internalProjectId, values.changeActivation, values.confirmed]);
}

function CapacitySettingsForm({ mode, projects, employees, capacityRows = [], today, locale, onSaved, internalProjectId: existingInternalProjectId, initialCapacity }: {
  mode: ConfigFormMode; projects: Project[]; employees: { id: string; name: string }[]; capacityRows?: NonNullable<FinanceLaborData["capacity"]>; today: string; locale: string; onSaved: () => void; internalProjectId?: string;
  initialCapacity?: NonNullable<FinanceLaborData["capacity"]>[number];
}) {
  const t = useTranslations("Finance.labor.auto"), formRef = useRef<HTMLFormElement>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(today), [hours, setHours] = useState(initialCapacity ? String(initialCapacity.daily_minutes / 60) : "");
  const [selectedDays, setSelectedDays] = useState<number[]>(initialCapacity?.weekdays ?? [1, 2, 3, 4, 5]);
  const [employeeId, setEmployeeId] = useState(""), [internalProjectId, setInternalProjectId] = useState(existingInternalProjectId ?? ""), [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<{ value: AutomaticLaborActivationPreview; key: string } | null>(null), [previewPending, setPreviewPending] = useState(false), [previewError, setPreviewError] = useState("");
  const dailyMinutes = minutesFromHours(hours), changingActivation = mode === "activation", needsDesignation = mode === "initial";
  const currentKey = formKey({ effectiveFrom, dailyMinutes, weekdays: selectedDays, employeeId, internalProjectId, changeActivation: changingActivation, confirmed });
  const historical = effectiveFrom < today, previewMatches = preview?.key === currentKey;
  const clearPreview = () => { setPreview(null); setPreviewError(""); };
  const capacityFor = (person: string, date: string) => effectiveCapacity(capacityRows, person || null, date)
    ?? (person ? effectiveCapacity(capacityRows, null, date) : undefined);
  const changeDate = (value: string) => {
    setEffectiveFrom(value);
    const capacity = capacityFor(employeeId, value);
    setHours(capacity ? String(capacity.daily_minutes / 60) : "");
    setSelectedDays(capacity?.weekdays ?? [1, 2, 3, 4, 5]);
    clearPreview();
  };
  const handlePreview = async () => {
    const form = formRef.current;
    if (!form || !dailyMinutes || (needsDesignation && (!internalProjectId || !confirmed))) return;
    const formData = new FormData();
    formData.set("effectiveFrom", effectiveFrom); formData.set("dailyMinutes", dailyMinutes); formData.set("weekdays", JSON.stringify(selectedDays));
    formData.set("employeeId", employeeId); formData.set("intent", "configure");
    if (internalProjectId) formData.set("internalProjectId", internalProjectId);
    if (needsDesignation && confirmed) formData.set("internalDesignationConfirmed", "true");
    if (changingActivation) formData.set("changeActivation", "true");
    setPreviewPending(true); setPreview(null); setPreviewError("");
    try {
      const result = await previewAutomaticLabor(formData);
      if (result.status === "success") setPreview({ value: result.preview, key: currentKey });
      else setPreviewError(result.message);
    } catch { setPreviewError(t("previewErrors.failed")); }
    finally { setPreviewPending(false); }
  };
  const denominatorMonthStart = monthStart(effectiveFrom);
  const hasStudioCapacityAtMonthStart = capacityRows.some(row => row.employee_id === null && row.effective_from <= denominatorMonthStart);
  const capacityFrom = mode === "capacity" || mode === "activation" && hasStudioCapacityAtMonthStart ? effectiveFrom : denominatorMonthStart;
  const submitLabel = historical ? t("applyPreview") : mode === "capacity" ? t("saveCapacity") : mode === "activation" ? t("saveActivation") : t("activate");
  return <div className="space-y-3">
    <FinanceActionForm action={saveAutomaticLabor} onSaved={onSaved} label={submitLabel} formRef={formRef} disabled={!dailyMinutes || historical && (!previewMatches || previewPending) || needsDesignation && (!internalProjectId || !confirmed)} className="space-y-3">
      <input type="hidden" name="intent" value="configure"/><input type="hidden" name="dailyMinutes" value={dailyMinutes}/><input type="hidden" name="weekdays" value={JSON.stringify(selectedDays)}/>{!needsDesignation ? <input type="hidden" name="internalProjectId" value={internalProjectId}/> : null}
      {changingActivation ? <input type="hidden" name="changeActivation" value="true"/> : null}
      {previewMatches && preview ? <input type="hidden" name="previewDigest" value={preview.value.digest}/> : null}
      {needsDesignation && confirmed ? <input type="hidden" name="internalDesignationConfirmed" value="true"/> : null}
      <p className="text-sm text-[var(--ui-text-secondary)]">{t("effectiveDate", { date: formatDateOnly(effectiveFrom, locale) })}</p>
      <p className="text-xs text-[var(--ui-text-secondary)]">{t("futureCapacityNote", { date: formatDateOnly(effectiveFrom, locale) })}</p>
      {mode !== "capacity" && capacityFrom === denominatorMonthStart ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("firstCapacityMonth", { date: formatDateOnly(capacityFrom, locale) })}</p> : <p className="text-xs text-[var(--ui-text-secondary)]">{t("capacityEffectiveFrom", { date: formatDateOnly(capacityFrom, locale) })}</p>}
      <div className="grid gap-3 sm:grid-cols-2"><FormField label={t("effectiveFromLabel")}><DatePicker name="effectiveFrom" value={effectiveFrom} onValueChange={changeDate} locale={locale} required/></FormField><FormField label={t("employeeOptional")}><select className="min-h-10 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm" name="employeeId" value={employeeId} onChange={event => { const nextEmployee = event.target.value; setEmployeeId(nextEmployee); const value = capacityFor(nextEmployee, effectiveFrom); setHours(value ? String(value.daily_minutes / 60) : ""); setSelectedDays(value?.weekdays ?? [1, 2, 3, 4, 5]); clearPreview(); }}><option value="">{t("studioDefault")}</option>{mode === "capacity" ? employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>) : null}</select></FormField></div>
      <FormField label={t("dailyHours")}><Input type="number" min="0.01" step="any" value={hours} onChange={event => { setHours(event.target.value); clearPreview(); }} required placeholder={t("hoursPlaceholder")}/></FormField>
      <WeekdayPicker selected={selectedDays} onChange={days => { setSelectedDays(days); clearPreview(); }}/>
      {needsDesignation ? <><FormField label={t("internalProjectLabel")}><select className="min-h-10 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm" name="internalProjectId" value={internalProjectId} onChange={event => { setInternalProjectId(event.target.value); clearPreview(); }} required><option value="">{t("chooseProject")}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></FormField><label className="flex items-start gap-2 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" checked={confirmed} onChange={event => { setConfirmed(event.target.checked); clearPreview(); }} className="mt-1" required/><span>{t("internalDesignationConfirmation")}</span></label></> : null}
      {historical ? <Button type="button" variant="outline" disabled={!dailyMinutes || previewPending || needsDesignation && (!internalProjectId || !confirmed)} onClick={handlePreview}>{previewPending ? t("previewing") : t("previewImpact")}</Button> : null}
      {previewError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{previewError}</p> : null}
      {historical && previewMatches && preview ? <ActivationPreviewPanel preview={preview.value} locale={locale} t={t}/> : null}
    </FinanceActionForm>
  </div>;
}

function ActivationPreviewPanel({ preview, locale, t }: { preview: AutomaticLaborActivationPreview; locale: string; t: ReturnType<typeof useTranslations> }) {
  return <div className="space-y-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-3 text-sm">
    <p className="font-medium">{t("previewTitle")}</p>
    <p className="text-xs text-[var(--ui-text-secondary)]">{t("previewBoundaries", { startsOn: formatDateOnly(preview.startsOn, locale), capacityFrom: formatDateOnly(preview.capacityFrom, locale), recognitionStart: formatDateOnly(preview.recognitionStart, locale) })}</p>
    {preview.existingAutomationStart ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("existingActivation", { date: formatDateOnly(preview.existingAutomationStart, locale) })}</p> : null}
    <ul className="divide-y divide-[var(--ui-border)]">{preview.periods.map((period, index) => <li key={`${period.employeeId}-${period.periodStart}-${index}`} className="py-2"><p className="font-medium">{period.label} · {formatDateOnly(period.periodStart, locale)} – {formatDateOnly(period.periodEnd, locale)}</p><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t("previewPeriodDetails", { known: period.knownCost ?? t("unknownAmount"), currency: period.currency ?? "", recognized: period.recognizedCost, days: period.completedDays })}</p>{period.manual || period.protected ? <p className="mt-1 text-xs text-[var(--ui-warning-text)]">{t(period.manual ? "previewManual" : "previewProtected")}</p> : null}</li>)}</ul>
  </div>;
}

type PeriodWithProposal = NonNullable<FinanceLaborData["automaticPeriods"]>[number] & {
  proposedAllocations?: { projectId: string; amount: string }[];
  proposedRemainder?: string | null;
};

function CorrectionProposal({ period, projects, current, money, onSaved }: {
  period: PeriodWithProposal; projects: Project[]; current: { projectId: string; amount: string }[];
  money: (value: string | null, code?: string) => string; onSaved: () => void;
}) {
  const t = useTranslations("Finance.labor.auto"), valued = period.proposedRemainder !== null && period.proposedRemainder !== undefined;
  return <div className="space-y-2 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-3 text-sm">
    <p className="font-medium">{t("correctionTitle")}</p>
    <div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-[var(--ui-text-muted)]">{t("currentSaved")}</p>{current.length ? <ul>{current.map(item => <li key={item.projectId}>{projects.find(project => project.id === item.projectId)?.name ?? t("projectUnavailable")} · {money(item.amount)}</li>)}</ul> : <p>{t("noProjectCost")}</p>}</div><div><p className="text-xs text-[var(--ui-text-muted)]">{t("proposedAmounts")}</p>{valued ? <>{period.proposedAllocations?.length ? <ul>{period.proposedAllocations.map(item => <li key={item.projectId}>{projects.find(project => project.id === item.projectId)?.name ?? t("projectUnavailable")} · {money(item.amount)}</li>)}</ul> : <p>{t("noProjectCost")}</p>}<p className="mt-1">{t("studioRemainder")}: {money(period.proposedRemainder ?? null)}</p></> : <div className="space-y-2"><p className="text-xs text-[var(--ui-warning-text)]">{t("fxPreviewUnavailable")}</p><Link className="text-xs underline underline-offset-2" href="/finance/schedules">{t("openPayroll")}</Link></div>}</div></div>
    {valued ? <FinanceActionForm action={saveAutomaticLabor} onSaved={onSaved} label={t("approveCorrection")} className="pt-1"><input type="hidden" name="intent" value="approve"/><input type="hidden" name="obligationId" value={period.obligationId}/><input type="hidden" name="digest" value={period.digest}/></FinanceActionForm> : <FinanceActionForm action={saveAutomaticLabor} onSaved={onSaved} label={t("recalculate")} className="pt-1"><input type="hidden" name="intent" value="recalculate"/><input type="hidden" name="obligationId" value={period.obligationId}/><input type="hidden" name="digest" value={period.digest}/></FinanceActionForm>}
  </div>;
}

function WeekdayPicker({ selected, onChange }: { selected: number[]; onChange: (days: number[]) => void }) {
  const t = useTranslations("Finance.labor.auto");
  return <fieldset className="space-y-2"><legend className="text-sm font-medium">{t("weekdaysLabel")}</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{weekdays.map(day => <label key={day} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(day)} onChange={event => onChange(event.target.checked ? [...selected, day].sort() : selected.filter(value => value !== day))}/>{t(`weekday.${day}`)}</label>)}</div></fieldset>;
}
