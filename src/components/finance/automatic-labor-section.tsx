"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { previewAutomaticLabor, saveAutomaticLabor, type AutomaticLaborActivationPreview } from "@/app/(app)/finance/reports/automatic-labor-actions";
import { FinanceActionForm } from "@/components/finance/finance-action-form";
import { FinanceFxFields } from "@/components/finance/finance-fx-fields";
import { AnimatedDisclosure, AnimatedFormContent } from "@/components/ui/animated-form-content";
import { FormField, Input } from "@/components/ui/form-field";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { financeAmountText, financeAmountUnits, formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { laborCapacityDefaults, type FinanceLaborData } from "@/lib/finance-labor";
import { formatDateOnly } from "@/lib/utils";

type Project = { id: string; name: string };
const panel = "min-w-0 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5";
const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;
function minutesFromHours(value: string) {
  const minutes = Number(value) * 60;
  return Number.isSafeInteger(minutes) && minutes > 0 ? String(minutes) : "";
}
function monthStart(value: string) { return `${value.slice(0, 7)}-01`; }

function exactSum(values: Array<string | number | null | undefined>, digits: number) {
  if (values.some(value => value === null || value === undefined)) return null;
  try { return financeAmountText(values.reduce((sum, value) => sum + financeAmountUnits(String(value), digits), BigInt(0)), digits); }
  catch { return null; }
}

export function AutomaticLaborSection({ data, projects, currencies, baseCurrency, from, to, today, recognitionStart }: {
  data: FinanceLaborData; projects: Project[]; currencies: FinanceCurrency[]; baseCurrency: string; from: string; to: string; today: string; recognitionStart: string | null;
}) {
  const t = useTranslations("Finance.labor.auto"), locale = useLocale(), router = useRouter();
  const automation = data.automation ?? null;
  const periods = (data.automaticPeriods ?? []).filter(period => recognitionStart && period.periodEnd >= recognitionStart && period.periodStart <= to && period.periodEnd >= from);
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
    <SalaryConditions data={data} money={money} date={date} today={today}/>
    <AnimatedDisclosure title={t(automation ? "settingsTitle" : "activateTitle")} defaultOpen={!automation || data.sourceReview?.reviewed === false}>
      <CapacitySettingsForm projects={projects} employees={data.employees ?? []} capacityRows={data.capacity ?? []} sourceReview={data.sourceReview} salaryConditions={data.salaryConditions} studioDailyMinutes={data.studioDailyMinutes} today={recognitionStart && !automation && today < recognitionStart ? recognitionStart : today} locale={locale} onSaved={refresh} internalProjectId={automation?.internalProjectId ?? undefined} currentActivationStart={automation?.startsOn}/>
    </AnimatedDisclosure>
    {automation ? <>
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
          : period.source?.sourceReady && period.source.employerStatus === "fixed" && (period.source.basis !== "net" || period.source.deductionsStatus === "fixed")
            && financeAmountUnits(period.source.knownCost, 4) === BigInt(0) ? "0" : null;
        const totalAllocated = provisional ? null : exactSum(projectRows.map(item => item.amount), amountDigits);
        const remainder = provisional ? period.provisionalRemainder ?? null : totalPool === null || totalAllocated === null ? null : financeAmountText(financeAmountUnits(totalPool, amountDigits) - financeAmountUnits(totalAllocated, amountDigits), amountDigits);
        const statusKey = period.manual ? "manual" : provisional ? "provisional" : period.status;
        return <li key={`${period.obligationId}-${period.periodStart}`} className="space-y-2 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{period.label} · {new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${period.periodStart}T00:00:00Z`))}</p><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{date(period.periodStart)} – {date(period.periodEnd)} · {t(`status.${statusKey}`)}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums">{provisional ? t("provisionalSubtotal", { amount: money(totalPool, amountCurrency) }) : `${t("payrollCost")}: ${period.source ? money(period.source.knownCost, period.source.currency) : t("unknownAmount")}`}</p>{provisional && period.source ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("payrollCost")}: {money(period.source.knownCost, period.source.currency)}</p> : null}</div></div>
          {provisional ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("provisionalCoverage", { from: date(period.accruedFrom ?? period.periodStart), asOf: date(period.asOf ?? to) })}</p> : null}
          <div className="grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs text-[var(--ui-text-muted)]">{t("projectAllocations")}</p>{projectRows.length ? <ul className="mt-1 space-y-1">{projectRows.map(item => <li key={item.projectId} className="flex justify-between gap-3"><span>{projects.find(project => project.id === item.projectId)?.name ?? t("projectUnavailable")}</span><span className="tabular-nums">{money(item.amount)}</span></li>)}</ul> : <p className="mt-1 text-[var(--ui-text-secondary)]">{t("noProjectCost")}</p>}</div><div><p className="text-xs text-[var(--ui-text-muted)]">{provisional ? t("provisionalRemainder") : t("studioRemainder")}</p><p className="mt-1 tabular-nums">{money(remainder)}</p><p className="mt-2 text-xs text-[var(--ui-text-muted)]">{t("coverage", { completed: period.completedDays, required: period.requiredDays })}</p></div></div>
          {period.manual ? <p className="text-xs text-[var(--ui-warning-text)]">{t("manualOwned")}</p> : null}
          {provisional && period.issues.includes("fx_required") && period.source?.sourceReady ? <FinanceActionForm action={saveAutomaticLabor} onSaved={refresh} label={t("recalculate")}>
            <input type="hidden" name="intent" value="recalculate"/><input type="hidden" name="obligationId" value={period.obligationId}/><input type="hidden" name="digest" value={period.digest}/>
            <FinanceFxFields currency={period.source.currency} base={baseCurrency}/>
          </FinanceActionForm> : null}
          {(period.issues.length || !period.manual && period.missingDates.length) ? <div className="space-y-1 text-xs text-[var(--ui-warning-text)]"><ul className="list-inside list-disc">{period.issues.map((issue, index) => <li key={`${issue}-${index}`}>{t(`issue.${issue}`)}</li>)}</ul>{!period.manual && period.missingDates.length ? <p>{t("missingReports", { dates: period.missingDates.map(date).join(", ") })}</p> : null}<div className="flex flex-wrap gap-x-3"><Link className="underline underline-offset-2" href="/finance/schedules">{t("openPayroll")}</Link><Link className="underline underline-offset-2" href={`/team/${period.employeeId}`}>{t("openWorkTracking")}</Link></div></div> : null}
          {(period.status === "pending_review" || period.status === "exception") && !period.issues.some(issue => ["missing_capacity", "source_unavailable", "payroll_source_review"].includes(issue)) && !period.manual && period.source?.sourceReady && period.source.canConfirm ? <CorrectionProposal period={period} projects={projects} current={projectRows} money={money} onSaved={refresh}/> : null}
          {!period.manual && !provisional && period.status !== "pending_review" && period.status !== "exception" && period.source?.sourceReady && period.source.canConfirm ? <FinanceActionForm action={saveAutomaticLabor} onSaved={refresh} label={t("recalculate")} className="pt-1" showMessage><input type="hidden" name="intent" value="recalculate"/><input type="hidden" name="obligationId" value={period.obligationId}/><input type="hidden" name="digest" value={period.digest}/></FinanceActionForm> : null}
        </li>;
      })}</ul>}
      <p className="border-t border-[var(--ui-border)] pt-3 text-xs text-[var(--ui-text-secondary)]">{t("profitabilityNote")}</p>
    </> : null}
  </Panel>;
}

function SalaryConditions({ data, money, date, today }: { data: FinanceLaborData; money: (amount: string | null, code: string) => string; date: (value: string) => string; today: string }) {
  const t = useTranslations("Finance.labor.auto");
  const missing = (data.employees ?? []).filter(employee => !data.salaryConditions?.some(condition => condition.employeeId === employee.id && condition.effectiveFrom <= today && (condition.effectiveThrough === null || condition.effectiveThrough >= today)));
  return <AnimatedDisclosure title={t("salarySetup")} defaultOpen={!data.salaryConditions?.length}>
    <div className="space-y-3 pb-3 text-sm">
      <p className="text-[var(--ui-text-secondary)]">{t("setupHelp")}</p>
      <Link href="/finance/schedules" className="inline-flex min-h-11 items-center underline underline-offset-2">{t("openPayroll")}</Link>
      {missing.length ? <p role="status" className="text-[var(--ui-warning-text)]">{t("missingSalary", { names: missing.map(employee => employee.name).join(", ") })}</p> : null}
      <ul className="divide-y divide-[var(--ui-border)]">{data.salaryConditions?.map(condition => <li key={condition.termId} className="space-y-1 py-2">
        <p className="font-medium">{condition.name} · {money(condition.amount, condition.currency)} · {t(condition.basis)}</p>
        <p className="text-xs text-[var(--ui-text-secondary)]">{date(condition.effectiveFrom)}{condition.effectiveThrough ? ` – ${date(condition.effectiveThrough)}` : ""}</p>
        <p className="text-xs">{t("salaryComponents", { payout: money(condition.payout, condition.currency), deductions: money(condition.deductions, condition.currency), employer: money(condition.employerCost, condition.currency) })}</p>
        {(condition.basis === "net" && condition.deductions === null) || condition.employerStatus !== "fixed" ? <p className="text-xs text-[var(--ui-warning-text)]">{t("salaryIncomplete")}</p> : null}
      </li>)}</ul>
      <p className="text-xs text-[var(--ui-text-secondary)]">{t("setupFx")}</p>
    </div>
  </AnimatedDisclosure>;
}

function CapacitySettingsForm({ projects, employees, capacityRows, sourceReview, salaryConditions, studioDailyMinutes, today, locale, onSaved, internalProjectId: existingInternalProjectId, currentActivationStart }: {
  projects: Project[]; employees: { id: string; name: string }[]; capacityRows: NonNullable<FinanceLaborData["capacity"]>; today: string; locale: string; onSaved: () => void; internalProjectId?: string;
  studioDailyMinutes?: number; currentActivationStart?: string;
  sourceReview: FinanceLaborData["sourceReview"]; salaryConditions: FinanceLaborData["salaryConditions"];
}) {
  const t = useTranslations("Finance.labor.auto"), formRef = useRef<HTMLFormElement>(null);
  const changingActivation = Boolean(currentActivationStart);
  const [effectiveFrom, setEffectiveFrom] = useState(currentActivationStart ?? today);
  const [capacityFrom, setCapacityFrom] = useState(() => !currentActivationStart && !laborCapacityDefaults(capacityRows, studioDailyMinutes, monthStart(today)).effectiveFrom ? monthStart(today) : today);
  const [editActivationDate, setEditActivationDate] = useState(false);
  const [changeCapacity, setChangeCapacity] = useState(false), [employeeId, setEmployeeId] = useState("");
  const initialCapacity = laborCapacityDefaults(capacityRows, studioDailyMinutes, today);
  const [hours, setHours] = useState(initialCapacity.dailyMinutes ? String(initialCapacity.dailyMinutes / 60) : "");
  const [selectedDays, setSelectedDays] = useState<number[]>(initialCapacity.weekdays);
  const [internalProjectId, setInternalProjectId] = useState(existingInternalProjectId ?? "");
  const unresolvedIds = sourceReview && !sourceReview.reviewed
    ? new Set(sourceReview.unresolvedTermIds ?? sourceReview.recurring.filter(term => !sourceReview.cashTermIds.includes(term.termId) && !term.hasRecognizedExpense).map(term => term.termId))
    : new Set<string>();
  const unresolvedSources = (sourceReview?.recurring ?? []).filter(term => unresolvedIds.has(term.termId));
  const [sourceChoices, setSourceChoices] = useState<Record<string, string>>({});
  const cashTermIds = [...new Set([...(sourceReview?.cashTermIds ?? []), ...unresolvedSources.filter(term => sourceChoices[term.termId] === "cash").map(term => term.termId)])];
  const sourcesReady = unresolvedSources.every(term => Boolean(sourceChoices[term.termId]));
  const [preview, setPreview] = useState<{ value: AutomaticLaborActivationPreview; key: string } | null>(null), [previewPending, setPreviewPending] = useState(false), [previewError, setPreviewError] = useState("");
  const dailyMinutes = minutesFromHours(hours);
  const denominatorStart = monthStart(effectiveFrom);
  const denominatorCapacity = laborCapacityDefaults(capacityRows, studioDailyMinutes, denominatorStart, employeeId || null);
  const monthSalaryConditions = (salaryConditions ?? []).filter(condition => monthStart(condition.effectiveFrom) <= denominatorStart && (condition.effectiveThrough === null || condition.effectiveThrough >= denominatorStart));
  const employeeSchedulesCoverMonth = !employeeId && monthSalaryConditions.length > 0 && monthSalaryConditions.every(condition => Boolean(laborCapacityDefaults(capacityRows, studioDailyMinutes, denominatorStart, condition.employeeId).effectiveFrom));
  const historicalCapacityMissing = (!changingActivation || editActivationDate || changeCapacity) && denominatorStart < today && !denominatorCapacity.effectiveFrom && !employeeSchedulesCoverMonth;
  const capacityProposalDate = changeCapacity || historicalCapacityMissing ? capacityFrom : effectiveFrom;
  const applicableCapacity = laborCapacityDefaults(capacityRows, studioDailyMinutes, capacityProposalDate, employeeId || null);
  const previewKey = JSON.stringify([effectiveFrom, editActivationDate, capacityFrom, changeCapacity, employeeId, dailyMinutes, selectedDays, internalProjectId, sourceReview?.digest, sourceChoices]);
  const previewMatches = preview?.key === previewKey;
  const clearPreview = () => { setPreview(null); setPreviewError(""); };
  const capacityFor = (person: string, date: string) => laborCapacityDefaults(capacityRows, studioDailyMinutes, date, person || null);
  const changeScheduleDate = (value: string) => {
    setCapacityFrom(value);
    const capacity = capacityFor(employeeId, value);
    setHours(capacity.dailyMinutes ? String(capacity.dailyMinutes / 60) : "");
    setSelectedDays(capacity.weekdays);
    clearPreview();
  };
  const toggleCapacity = (enabled: boolean) => {
    setChangeCapacity(enabled);
    if (enabled) changeScheduleDate(changingActivation ? today : effectiveFrom);
    else clearPreview();
  };
  const toggleActivationDate = (enabled: boolean) => {
    setEditActivationDate(enabled);
    if (!currentActivationStart) return;
    const date = enabled ? monthStart(currentActivationStart) : today;
    setEffectiveFrom(currentActivationStart);
    changeScheduleDate(date);
  };
  const changeDate = (value: string) => {
    setEffectiveFrom(value);
    setCapacityFrom(monthStart(value));
    const capacity = capacityFor(employeeId, value);
    setHours(capacity.dailyMinutes ? String(capacity.dailyMinutes / 60) : "");
    setSelectedDays(capacity.weekdays);
    clearPreview();
  };
  const handlePreview = async () => {
    const form = formRef.current;
    if (!form || !sourcesReady || changeCapacity && !dailyMinutes) return;
    const formData = new FormData();
    formData.set("effectiveFrom", effectiveFrom); formData.set("intent", "configure");
    if (changingActivation && editActivationDate) formData.set("changeActivation", "true");
    if (changeCapacity) {
      formData.set("dailyMinutes", dailyMinutes); formData.set("weekdays", JSON.stringify(selectedDays));
      if (employeeId) formData.set("employeeId", employeeId);
    }
    if (historicalCapacityMissing || changeCapacity) formData.set("capacityFrom", capacityFrom);
    if (!existingInternalProjectId && internalProjectId) formData.set("internalProjectId", internalProjectId);
    if (unresolvedSources.length) {
      formData.set("payrollSourceDigest", sourceReview?.digest ?? "");
      formData.set("payrollCashTermIds", JSON.stringify(cashTermIds));
    }
    setPreviewPending(true); setPreview(null); setPreviewError("");
    try {
      const result = await previewAutomaticLabor(formData);
      if (result.status === "success") setPreview({ value: result.preview, key: previewKey });
      else setPreviewError(result.message);
    } catch { setPreviewError(t("previewErrors.failed")); }
    finally { setPreviewPending(false); }
  };
  const submitLabel = currentActivationStart ? t("saveSettings") : t("activate");
  return <div className="space-y-3">
    <FinanceActionForm action={saveAutomaticLabor} onSaved={onSaved} label={submitLabel} formRef={formRef} disabled={!sourcesReady || changeCapacity && !dailyMinutes || historicalCapacityMissing && !capacityFrom || !previewMatches || previewPending} className="space-y-3">
      {unresolvedSources.length ? <fieldset className="space-y-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-3">
        <legend className="px-1 text-sm font-medium">{t("sourceReviewTitle")}</legend>
        <p className="text-xs text-[var(--ui-text-secondary)]">{t("sourceReviewHelp")}</p>
        <Link href="/finance/schedules" className="text-xs underline underline-offset-2">{t("openPayroll")}</Link>
        {unresolvedSources.map(term => <FormField key={term.termId} label={`${term.name} · ${term.amount} ${term.currency}`}>
          <p className="mb-1 text-xs text-[var(--ui-text-muted)]">{term.category} · {formatDateOnly(term.effectiveFrom, locale)}{term.effectiveThrough ? ` – ${formatDateOnly(term.effectiveThrough, locale)}` : ""}</p>
          <select className="ui-form-control min-h-11 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm" value={sourceChoices[term.termId] ?? ""} required onChange={event => { setSourceChoices(choices => ({ ...choices, [term.termId]: event.target.value })); clearPreview(); }}>
            <option value="">{t("sourceChoose")}</option><option value="cash" disabled={term.hasRecognizedExpense}>{t("sourceCashOnly")}</option><option value="separate">{t("sourceSeparate")}</option>
          </select>
          {term.hasRecognizedExpense ? <p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("sourceRecognizedExpense")}</p> : null}
        </FormField>)}
      </fieldset> : null}
      {changingActivation && editActivationDate ? <input type="hidden" name="changeActivation" value="true"/> : null}
      {unresolvedSources.length ? <><input type="hidden" name="payrollSourceDigest" value={sourceReview?.digest ?? ""}/><input type="hidden" name="payrollCashTermIds" value={JSON.stringify(cashTermIds)}/></> : null}
      <input type="hidden" name="intent" value="configure"/>
      {changeCapacity ? <><input type="hidden" name="dailyMinutes" value={dailyMinutes}/><input type="hidden" name="weekdays" value={JSON.stringify(selectedDays)}/>{employeeId ? <input type="hidden" name="employeeId" value={employeeId}/>:null}</> : null}
      {(historicalCapacityMissing || changeCapacity) ? <input type="hidden" name="capacityFrom" value={capacityFrom}/> : null}
      {!existingInternalProjectId && internalProjectId ? <input type="hidden" name="internalProjectId" value={internalProjectId}/> : null}
      {previewMatches && preview ? <input type="hidden" name="previewDigest" value={preview.value.digest}/> : null}
      <p className="text-sm text-[var(--ui-text-secondary)]">{t("effectiveDate", { date: formatDateOnly(effectiveFrom, locale) })}</p>
      {changingActivation ? <><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="shrink-0" checked={editActivationDate} onChange={event => { toggleActivationDate(event.target.checked); clearPreview(); }}/><span className="min-w-0">{t("changeActivationDate")}</span></label><AnimatedFormContent isOpen={editActivationDate}><fieldset disabled={!editActivationDate}><FormField label={t("effectiveFromLabel")}><DatePicker aria-label={t("effectiveFromLabel")} name={editActivationDate ? "effectiveFrom" : undefined} value={effectiveFrom} onValueChange={changeDate} locale={locale} required/></FormField></fieldset></AnimatedFormContent>{!editActivationDate ? <input type="hidden" name="effectiveFrom" value={currentActivationStart}/> : null}</> : <FormField label={t("effectiveFromLabel")}><DatePicker aria-label={t("effectiveFromLabel")} name="effectiveFrom" value={effectiveFrom} onValueChange={changeDate} locale={locale} required/></FormField>}
      {historicalCapacityMissing || changeCapacity ? <FormField label={t("capacityDateLabel")}><DatePicker aria-label={t("capacityDateLabel")} value={capacityFrom} onValueChange={changeScheduleDate} locale={locale} required/></FormField> : null}
      {historicalCapacityMissing ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("historicalCapacityHint")}</p> : null}
      <p className="text-sm text-[var(--ui-text-secondary)]">{!changeCapacity && !applicableCapacity.effectiveFrom && employeeSchedulesCoverMonth ? t("employeeCapacityDefaults") : t(applicableCapacity.effectiveFrom ? "datedCapacityDefaults" : "currentCapacityDefaults", { hours: applicableCapacity.dailyMinutes ? applicableCapacity.dailyMinutes / 60 : "—", weekdays: applicableCapacity.weekdays.map(day => t(`weekday.${day}`)).join(", ") })}</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="shrink-0" checked={changeCapacity} onChange={event => toggleCapacity(event.target.checked)}/><span className="min-w-0">{t("changeCapacity")}</span></label>
      <AnimatedFormContent isOpen={changeCapacity}><fieldset disabled={!changeCapacity} className="grid gap-3 sm:grid-cols-2"><FormField label={t("employeeOptional")}><select className="ui-form-control min-h-10 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm" value={employeeId} onChange={event => { const nextEmployee = event.target.value; setEmployeeId(nextEmployee); const value = capacityFor(nextEmployee, capacityFrom); setHours(value.dailyMinutes ? String(value.dailyMinutes / 60) : ""); setSelectedDays(value.weekdays); clearPreview(); }}><option value="">{t("studioDefault")}</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></FormField><FormField label={t("dailyHours")}><Input type="number" min="0.01" step="any" value={hours} onChange={event => { setHours(event.target.value); clearPreview(); }} required placeholder={t("hoursPlaceholder")}/></FormField><div className="sm:col-span-2"><WeekdayPicker selected={selectedDays} onChange={days => { setSelectedDays(days); clearPreview(); }}/></div></fieldset></AnimatedFormContent>
      {!changingActivation ? <AnimatedDisclosure title={t("internalProjectOptional")}><div className="space-y-2"><p className="text-xs text-[var(--ui-text-secondary)]">{t("internalProjectHelp")}</p><FormField label={t("internalProjectLabel")}><select className="ui-form-control min-h-10 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm" value={internalProjectId} onChange={event => { setInternalProjectId(event.target.value); clearPreview(); }}><option value="">{t("none")}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></FormField></div></AnimatedDisclosure> : null}
      <Button type="button" variant="outline" disabled={!sourcesReady || changeCapacity && !dailyMinutes || previewPending} onClick={handlePreview}>{previewPending ? t("previewing") : t("previewImpact")}</Button>
      {previewError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{previewError}</p> : null}
      {previewMatches && preview ? <ActivationPreviewPanel preview={preview.value} projects={projects} locale={locale} t={t}/> : null}
    </FinanceActionForm>
  </div>;
}

function ActivationPreviewPanel({ preview, projects, locale, t }: { preview: AutomaticLaborActivationPreview; projects: Project[]; locale: string; t: ReturnType<typeof useTranslations> }) {
  const historical = useTranslations("Finance.historicalLabor");
  const amount = (value: string | null) => value === null ? t("unknownAmount") : `${value} ${preview.costPreview.reportingCurrency ?? ""}`;
  return <div className="space-y-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-3 text-sm">
    <p className="font-medium">{t("previewTitle")}</p>
    <p className="text-xs text-[var(--ui-text-secondary)]">{t("previewBoundaries", { startsOn: formatDateOnly(preview.startsOn, locale), capacityFrom: formatDateOnly(preview.capacityFrom, locale), recognitionStart: preview.recognitionStart ? formatDateOnly(preview.recognitionStart, locale) : "—" })}</p>
    {preview.existingAutomationStart ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("existingActivation", { date: formatDateOnly(preview.existingAutomationStart, locale) })}</p> : null}
    <p className="text-xs text-[var(--ui-text-secondary)]">{t("costPreviewHelp")}</p>
    <ul className="divide-y divide-[var(--ui-border)]">{preview.costPreview.periods.map(period => <li key={period.sourceKey} className="space-y-1 py-2">
      <p className="font-medium">{period.label} · {formatDateOnly(period.periodStart, locale)} – {formatDateOnly(period.periodEnd, locale)}</p>
      <p className="text-xs">{t("calculatedCost")}: {amount(period.calculatedCost)} · {t("provisionalRemainder")}: {amount(period.unattributedCost)}</p>
      <p className="text-xs text-[var(--ui-text-secondary)]">{t("projectAllocations")}</p>
      {period.allocations.length ? <ul className="text-xs">{period.allocations.map(item => <li key={item.projectId}>{projects.find(project => project.id === item.projectId)?.name ?? t("projectUnavailable")}: {amount(item.amount)}</li>)}</ul> : <p className="text-xs text-[var(--ui-text-secondary)]">{t("noProjectCost")}</p>}
      {period.issues.length ? <p className="text-xs text-[var(--ui-warning-text)]">{period.issues.map(issue => historical.has(`issue.${issue}`) ? historical(`issue.${issue}`) : historical("missingInput")).join(" · ")}</p> : null}
    </li>)}</ul>
    {preview.periods.some(period => period.manual || period.protected) ? <p className="text-xs text-[var(--ui-warning-text)]">{t("previewProtected")}</p> : null}
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
    {valued ? <FinanceActionForm action={saveAutomaticLabor} onSaved={onSaved} label={t("approveCorrection")} className="pt-1"><input type="hidden" name="intent" value="approve"/><input type="hidden" name="obligationId" value={period.obligationId}/><input type="hidden" name="digest" value={period.digest}/></FinanceActionForm> : <FinanceActionForm action={saveAutomaticLabor} onSaved={onSaved} label={t("recalculate")} className="pt-1"><input type="hidden" name="intent" value="recalculate"/><input type="hidden" name="obligationId" value={period.obligationId}/><input type="hidden" name="digest" value={period.digest}/>{period.source ? <FinanceFxFields currency={period.source.currency} base={period.reportingCurrency ?? period.source.currency}/> : null}</FinanceActionForm>}
  </div>;
}

function WeekdayPicker({ selected, onChange }: { selected: number[]; onChange: (days: number[]) => void }) {
  const t = useTranslations("Finance.labor.auto");
  return <fieldset className="space-y-2"><legend className="text-sm font-medium">{t("weekdaysLabel")}</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{weekdays.map(day => <label key={day} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(day)} onChange={event => onChange(event.target.checked ? [...selected, day].sort() : selected.filter(value => value !== day))}/>{t(`weekday.${day}`)}</label>)}</div></fieldset>;
}
