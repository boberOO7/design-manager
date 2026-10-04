"use client";

import Link from "next/link";
import { z } from "zod";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { saveFinanceLabor } from "@/app/(app)/finance/reports/labor-actions";
import { saveFinanceManagement } from "@/app/(app)/finance/reports/actions";
import { FinanceActionForm } from "@/components/finance/finance-action-form";
import { FinanceFxFields } from "@/components/finance/finance-fx-fields";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Panel } from "@/components/ui/panel";
import { Select, SelectItem } from "@/components/ui/select";
import { financeAmountText, financeAmountUnits, formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { laborSourceIssues, unallocatedLaborAmount, type FinanceLaborData, type LaborPool, type LaborSource } from "@/lib/finance-labor";
import { formatDateOnly } from "@/lib/utils";

type Project = { id: string; name: string };
type SplitItem = { id: string; projectId: string; amount: string };
const panel = "min-w-0 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5";

function exactSum(values: string[], digits: number) {
  try {
    return financeAmountText(values.reduce((sum, value) => sum + financeAmountUnits(value, digits), BigInt(0)), digits);
  } catch {
    return null;
  }
}

function displayAmount(value: string | null, currency: FinanceCurrency | undefined, locale: string, code: string) {
  return value === null ? "—" : currency ? formatFinanceAmount(value, currency, locale) : `${value} ${code}`;
}

function snapshotRecord(value: unknown): Record<string, unknown> | undefined {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function snapshotValue(value: unknown, key: string) {
  const result = snapshotRecord(value)?.[key];
  return typeof result === "string" || typeof result === "number" ? String(result) : null;
}

function selectedAllocations(data: FinanceLaborData, entryIds: Set<string>, digits: number) {
  const totals = new Map<string, bigint>();
  for (const item of data.allocations) {
    if (!entryIds.has(item.entry_id)) continue;
    totals.set(item.project_id, (totals.get(item.project_id) ?? BigInt(0)) + financeAmountUnits(item.amount, digits));
  }
  return [...totals].map(([projectId, amount]) => ({ projectId, amount: financeAmountText(amount, digits) }));
}

export function ManagementLaborSection({ data, projects, currencies, baseCurrency, from, to }: {
  data: FinanceLaborData; projects: Project[]; currencies: FinanceCurrency[]; baseCurrency: string; from: string; to: string; today: string;
}) {
  const t = useTranslations("Finance.labor"), locale = useLocale(), router = useRouter();
  const sources = data.sources.filter(source => source.periodStart <= to && source.periodEnd >= from);
  const pools = data.pools.filter(pool => pool.period_start <= to && pool.period_end >= from);
  const issues = laborSourceIssues(data.sources, from, to);
  const missingPeriods = data.missingPeriods.filter(period => period.periodStart <= to && period.periodEnd >= from);
  const currency = (code: string) => currencies.find(item => item.code === code);
  const money = (value: string | null, code: string) => displayAmount(value, currency(code), locale, code);
  const date = (value: string) => formatDateOnly(value, locale);
  const refresh = () => router.refresh();

  return <section className="space-y-4" aria-label={t("title")}>
    <div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="text-lg font-semibold">{t("title")}</h2><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{date(from)} – {date(to)} · {baseCurrency}</p></div></div>
    {issues.length + missingPeriods.length ? <div role="status" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] p-3 text-sm text-[var(--ui-warning-text)]"><p>{t("unknownWarning", { count: issues.length + missingPeriods.length })}</p><ul className="mt-1 list-inside list-disc">{[...new Set(issues.map(issue => `${issue.label} · ${t(`issue.${issue.kind}`)}`))].map(issue => <li key={issue}>{issue}</li>)}</ul>{missingPeriods.length ? <ul className="mt-1 list-inside list-disc">{missingPeriods.map(period => <li key={`${period.scheduleId}-${period.periodStart}`}>{period.label} · {t("missingPeriod", { from: date(period.periodStart), to: date(period.periodEnd) })} <Link href="/finance/schedules" className="underline">{t("openPayroll")}</Link></li>)}</ul> : null}</div> : null}
    <Panel className={`${panel} space-y-3`}>
      <div><h3 className="font-semibold">{t("employeeMonthTitle")}</h3><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("employeeMonthHelp")}</p></div>
      {!sources.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("noSources")}</p> : <ul className="divide-y divide-[var(--ui-border)]">{sources.map(source => {
        const hasUnknown = (source.basis === "net" && source.deductionsStatus !== "fixed") || source.employerStatus !== "fixed";
        const periods = `${date(source.periodStart)} – ${date(source.periodEnd)}`;
        const positiveRemainder = financeAmountUnits(source.remainingCost, 4) > BigInt(0);
        const sourcePools = data.pools.filter(pool => pool.obligation_id === source.obligationId);
        const hasRecordedPools = sourcePools.length > 0;
        const needsReconciliation = source.canConfirm && hasRecordedPools && financeAmountUnits(source.remainingCost, 4) < BigInt(0);
        return <li key={source.obligationId} className="py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2"><div className="min-w-0"><p className="break-words font-medium">{source.label} <span className="font-normal text-[var(--ui-text-secondary)]">· {new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${source.periodStart}T00:00:00Z`))} · {t(`kind.${source.kind}`)}</span></p><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{periods}</p></div>
            <div className="grid w-full grid-cols-3 gap-3 text-sm sm:w-auto sm:min-w-[24rem]"><div><p className="text-xs text-[var(--ui-text-muted)]">{t("known")}</p><p className="mt-1 font-semibold tabular-nums">{money(source.knownCost, source.currency)}</p></div><div><p className="text-xs text-[var(--ui-text-muted)]">{t("recognized")}</p><p className="mt-1 font-semibold tabular-nums">{money(source.recognizedCost, source.currency)}</p></div><div><p className="text-xs text-[var(--ui-text-muted)]">{t("remaining")}</p><p className="mt-1 font-semibold tabular-nums">{money(source.remainingCost, source.currency)}</p></div></div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--ui-text-secondary)]"><span>{t("basis", { basis: t(`basisKind.${source.basis}`) })}</span>{source.basis === "net" ? <StatusLabel label={t("deductions")} status={source.deductionsStatus}/> : null}<StatusLabel label={t("employerCost")} status={source.employerStatus}/>{hasUnknown ? <span className="text-[var(--ui-warning-text)]">{t("unknownNotZero")}</span> : null}</div>
          {hasUnknown ? <p className="mt-1 text-xs text-[var(--ui-warning-text)]">{t("repairHelp")} <Link href={source.kind === "payroll" ? "/finance/schedules" : "/finance/expected?filter=outgoing"} className="underline underline-offset-2">{t(source.kind === "payroll" ? "openPayroll" : "openExpected")}</Link></p> : null}
          <AnimatedDisclosure title={t("snapshotDetails")} className="mt-2">
            <ul className="space-y-1 pt-1 text-xs text-[var(--ui-text-secondary)]">
              {snapshotValue(source.snapshot.terms, "amount") ? <li>{t("contractValue")}: {snapshotValue(source.snapshot.terms, "amount")} {source.currency}</li> : null}
              {snapshotValue(source.snapshot.terms, "employee_payout") ? <li>{t("employeePayout")}: {snapshotValue(source.snapshot.terms, "employee_payout")} {source.currency}</li> : null}
              {snapshotValue(source.snapshot.terms, "employee_deductions") ? <li>{t("deductionsAmount")}: {snapshotValue(source.snapshot.terms, "employee_deductions")} {source.currency}</li> : null}
              {snapshotValue(source.snapshot.terms, "employer_cost") ? <li>{t("employerAmount")}: {snapshotValue(source.snapshot.terms, "employer_cost")} {source.currency}</li> : null}
              {snapshotValue(source.snapshot.payout, "amount") ? <li>{t("payoutAmount")}: {snapshotValue(source.snapshot.payout, "amount")} {source.currency}</li> : null}
              {!snapshotValue(source.snapshot.terms, "amount") && !snapshotValue(source.snapshot.payout, "amount") ? <li>{t("snapshotMissing")}</li> : null}
            </ul>
          </AnimatedDisclosure>
          {!source.canConfirm ? <p className="mt-2 text-xs text-[var(--ui-text-muted)]">{source.sourceReady ? t("openPeriod", { date: date(source.periodEnd) }) : t("sourceUnavailable")}</p> : null}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {source.canConfirm && positiveRemainder ? <AnimatedDisclosure title={t("confirmCost")} className="w-full"><ConfirmForm source={source} baseCurrency={baseCurrency} onSaved={refresh}/></AnimatedDisclosure> : null}
            {needsReconciliation ? <AnimatedDisclosure title={t("reconcileCost")} className="w-full"><ReconcileForm source={source} pools={sourcePools} data={data} currencies={currencies} projects={projects} baseCurrency={baseCurrency} onSaved={refresh}/></AnimatedDisclosure> : null}
          </div>
        </li>;
      })}</ul>}
    </Panel>

    <Panel className={`${panel} space-y-3`}>
      <div><h3 className="font-semibold">{t("poolsTitle")}</h3><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("poolsHelp", { currency: baseCurrency })}</p></div>
      {!pools.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("noPools")}</p> : <ul className="divide-y divide-[var(--ui-border)]">{pools.map(pool => <PoolRow key={pool.id} pool={pool} allocations={data.allocations.filter(item => item.entry_id === pool.id)} projects={projects} currencies={currencies} onSaved={refresh}/>)}</ul>}
      <AnimatedDisclosure title={t("allocationHistoryTitle", { count: data.allocationHistory.length })}>
        <ol className="divide-y divide-[var(--ui-border)] pb-2">{[...data.allocationHistory].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.revision - a.revision).map(history => {
          const pool = data.pools.find(item => item.id === history.entryId);
          const unit = currency(baseCurrency);
          return <li key={history.id} className="py-2 text-xs">
            <p className="font-medium">{pool?.description ?? t("historicalSource", { id: history.entryId })} · v{history.revision}</p>
            <p className="mt-1 text-[var(--ui-text-secondary)]">{date(history.createdAt.slice(0, 10))} · {t("allocationMethod")}: {t("manualManagement")} · {t("allocationAuthor")}: {history.createdBy} · {history.reason}</p>
            {history.items.length ? <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[var(--ui-text-secondary)]">{history.items.map((item, index) => <li key={`${history.id}-${item.projectId}-${index}`}>{projects.find(project => project.id === item.projectId)?.name ?? t("projectUnavailable")} · {displayAmount(item.amount, unit, locale, baseCurrency)}</li>)}</ul> : <p className="mt-1 text-[var(--ui-text-muted)]">{t("allocationCleared")}</p>}
          </li>;
        })}</ol>
      </AnimatedDisclosure>
    </Panel>
  </section>;
}

function StatusLabel({ label, status }: { label: string; status: "unknown" | "estimated" | "fixed" }) {
  const t = useTranslations("Finance.labor");
  return <span>{label} · <span className={status === "fixed" ? "text-[var(--ui-success-text)]" : "text-[var(--ui-warning-text)]"}>{t(`status.${status}`)}</span></span>;
}

function ConfirmForm({ source, baseCurrency, onSaved }: { source: LaborSource; baseCurrency: string; onSaved: () => void }) {
  const t = useTranslations("Finance.labor");
  return <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3">
    <p className="mb-3 text-sm text-[var(--ui-text-secondary)]">{t("confirmHelp", { amount: source.remainingCost, currency: source.currency, from: source.periodStart, to: source.periodEnd })}</p>
    <FinanceActionForm action={saveFinanceLabor} label={t("confirmCost")} onSaved={onSaved}>
      <input type="hidden" name="intent" value="confirm"/><input type="hidden" name="obligationId" value={source.obligationId}/><input type="hidden" name="version" value={source.version}/>
      {source.currency !== baseCurrency ? <FinanceFxFields currency={source.currency} base={baseCurrency}/> : null}
      <FormField label={t("reason")}><Textarea name="reason" rows={2} maxLength={2000} required/></FormField>
    </FinanceActionForm>
  </div>;
}

function PoolRow({ pool, allocations, projects, currencies, onSaved }: { pool: LaborPool; allocations: FinanceLaborData["allocations"]; projects: Project[]; currencies: FinanceCurrency[]; onSaved: () => void }) {
  const t = useTranslations("Finance.labor"), locale = useLocale();
  const unit = currencies.find(currency => currency.code === pool.reporting_currency);
  const digits = unit?.minor_units ?? 2;
  const unallocated = unallocatedLaborAmount(pool, digits);
  const names = new Map(projects.map(project => [project.id, project.name]));
  const currentItems = allocations.map(item => ({ projectId: item.project_id, amount: item.amount }));
  return <li className="py-3">
    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"><div className="min-w-0"><p className="break-words font-medium">{pool.description} <span className="font-normal text-[var(--ui-text-secondary)]">· {formatDateOnly(pool.period_start, locale)} – {formatDateOnly(pool.period_end, locale)}</span></p><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t("recognizedOn", { date: formatDateOnly(pool.recognized_on, locale) })}</p>
      {allocations.length ? <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ui-text-muted)]">{allocations.map(item => <li key={`${item.project_id}-${item.revision}`}>{names.get(item.project_id) ?? t("projectUnavailable")} · {displayAmount(item.amount, unit, locale, pool.reporting_currency)}</li>)}</ul> : <p className="mt-2 text-xs text-[var(--ui-text-muted)]">{t("noAllocations")}</p>}
      <AnimatedDisclosure title={t("historyDetails")} className="mt-2">
        {pool.fx_rate ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("fxDetail", { rate: pool.fx_rate, currency: pool.reporting_currency, date: formatDateOnly(pool.fx_effective_date ?? pool.recognized_on, locale), source: pool.fx_source ?? "" })}</p> : <p className="text-xs text-[var(--ui-text-secondary)]">{t("fxMissingDetails")}</p>}
      </AnimatedDisclosure>
    </div><dl className="grid grid-cols-3 gap-3 text-sm sm:min-w-[24rem]"><div><dt className="text-xs text-[var(--ui-text-muted)]">{t("poolTotal")}</dt><dd className="mt-1 font-semibold tabular-nums">{displayAmount(pool.available_reporting_amount, unit, locale, pool.reporting_currency)}</dd></div><div><dt className="text-xs text-[var(--ui-text-muted)]">{t("allocated")}</dt><dd className="mt-1 font-semibold tabular-nums">{displayAmount(pool.allocated_amount, unit, locale, pool.reporting_currency)}</dd></div><div><dt className="text-xs text-[var(--ui-text-muted)]">{t("unallocated")}</dt><dd className="mt-1 font-semibold tabular-nums">{displayAmount(unallocated, unit, locale, pool.reporting_currency)}</dd></div></dl></div>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
      <AnimatedDisclosure title={pool.available_reporting_amount === null ? t("repairFx") : t("allocationTitle")} className="w-full">
        {pool.available_reporting_amount === null ? <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3"><p className="text-sm text-[var(--ui-warning-text)]">{t("poolFxMissing")}</p><PoolValuationForm pool={pool} onSaved={onSaved}/></div> : <AllocationForm pool={pool} currentItems={currentItems} projects={projects} digits={digits} unit={unit} onSaved={onSaved}/>}
      </AnimatedDisclosure>
    </div>
  </li>;
}

function PoolValuationForm({ pool, onSaved }: { pool: LaborPool; onSaved: () => void }) {
  const t = useTranslations("Finance.labor");
  return <FinanceActionForm action={saveFinanceManagement} label={t("repairFx")} onSaved={onSaved} showMessage={false} className="space-y-3">
    <input type="hidden" name="intent" value="value"/><input type="hidden" name="entryId" value={pool.id}/>
    <FinanceFxFields currency={pool.currency} base={pool.reporting_currency} initialMode={pool.fx_source === "manual" ? "manual" : "nbu"} initialRate={pool.fx_rate ?? ""}/>
  </FinanceActionForm>;
}

function AllocationForm({ pool, currentItems, projects, digits, unit, onSaved }: { pool: LaborPool; currentItems: { projectId: string; amount: string }[]; projects: Project[]; digits: number; unit: FinanceCurrency | undefined; onSaved: () => void }) {
  const t = useTranslations("Finance.labor"), locale = useLocale();
  const [items, setItems] = useState<SplitItem[]>(() => currentItems.map(item => ({ ...item, id: item.projectId })));
  const [reason, setReason] = useState("");
  const total = items.some(item => !item.projectId || !item.amount.trim()) ? null : exactSum(items.map(item => item.amount), digits);
  const incomplete = total === null;
  const overCapacity = total !== null && financeAmountUnits(total, digits) > financeAmountUnits(pool.available_reporting_amount ?? "0", digits);
  const payload = JSON.stringify(items.map(({ projectId, amount }) => ({ projectId, amount })));
  const update = (id: string, patch: Partial<SplitItem>) => setItems(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row));
  return <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3">
    <p className="mb-3 text-sm text-[var(--ui-text-secondary)]">{t("allocationHelp", { currency: pool.reporting_currency })}</p>
    <FinanceActionForm action={saveFinanceLabor} label={t("saveAllocation")} onSaved={onSaved} disabled={overCapacity || incomplete}>
      <input type="hidden" name="intent" value="allocate"/><input type="hidden" name="entryId" value={pool.id}/><input type="hidden" name="revision" value={pool.allocation_revision}/><input type="hidden" name="items" value={payload}/>
      <div className="space-y-2">{items.map(item => <div key={item.id} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.55fr)_auto] sm:items-end">
        <FormField label={t("project")}><Select name={`project-${item.id}`} value={item.projectId} onValueChange={projectId => update(item.id, { projectId })} required><SelectItem value="">{t("selectProject")}</SelectItem>{projects.map(project => <SelectItem key={project.id} value={project.id} disabled={items.some(other => other.id !== item.id && other.projectId === project.id)}>{project.name}</SelectItem>)}</Select></FormField>
        <FormField label={t("amount", { currency: pool.reporting_currency })}><Input value={item.amount} onChange={event => update(item.id, { amount: event.target.value })} inputMode="decimal" required/></FormField>
        <Button type="button" variant="outline" size="sm" aria-label={t("removeProject")} onClick={() => setItems(rows => rows.filter(row => row.id !== item.id))}>{t("removeProject")}</Button>
      </div>)}</div>
      {!items.length ? <p className="mt-2 text-sm text-[var(--ui-text-secondary)]">{t("noProjectAttribution")}</p> : null}
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setItems(rows => [...rows, { id: crypto.randomUUID(), projectId: "", amount: "" }])}>{t("addProject")}</Button>
      <p className={`mt-2 text-sm tabular-nums ${overCapacity ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text-secondary)]"}`}>{t("allocationTotal", { amount: total === null ? "—" : displayAmount(total, unit, locale, pool.reporting_currency), capacity: displayAmount(pool.available_reporting_amount, unit, locale, pool.reporting_currency) })}</p>
      {overCapacity ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("overCapacity")}</p> : null}
      {incomplete ? <p className="text-sm text-[var(--ui-text-muted)]">{t("splitIncomplete")}</p> : null}
      <FormField label={t("reason")} className="mt-3"><Textarea name="reason" rows={2} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} required/></FormField>
    </FinanceActionForm>
  </div>;
}

function ReconcileForm({ source, pools, data, currencies, projects, baseCurrency, onSaved }: { source: LaborSource; pools: LaborPool[]; data: FinanceLaborData; currencies: FinanceCurrency[]; projects: Project[]; baseCurrency: string; onSaved: () => void }) {
  const t = useTranslations("Finance.labor"), locale = useLocale();
  const unit = currencies.find(currency => currency.code === baseCurrency);
  const digits = unit?.minor_units ?? 2;
  const poolIds = new Set(pools.map(pool => pool.id));
  const defaults = selectedAllocations(data, poolIds, digits);
  const [items, setItems] = useState<SplitItem[]>(() => defaults.map(item => ({ ...item, id: item.projectId })));
  const [reason, setReason] = useState("");
  const total = items.some(item => !item.projectId || !item.amount.trim()) ? null : exactSum(items.map(item => item.amount), digits);
  const incomplete = total === null;
  const nativeCapacity = source.currency === baseCurrency ? source.knownCost : null;
  const overCapacity = nativeCapacity !== null && total !== null && financeAmountUnits(total, digits) > financeAmountUnits(nativeCapacity, digits);
  const payload = JSON.stringify(items.map(({ projectId, amount }) => ({ projectId, amount })));
  const update = (id: string, patch: Partial<SplitItem>) => setItems(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row));
  const poolIdsLabel = pools.map(pool => pool.description).join(", ");
  return <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3">
    <p className="mb-3 text-sm text-[var(--ui-warning-text)]">{t("reconcileHelp", { known: money(source.knownCost, currencyFor(source.currency, currencies), locale, source.currency), recognized: money(source.recognizedCost, currencyFor(source.currency, currencies), locale, source.currency), pools: poolIdsLabel })}</p>
    <FinanceActionForm action={saveFinanceLabor} label={t("confirmReconcile")} onSaved={onSaved} disabled={overCapacity || incomplete}>
      <input type="hidden" name="intent" value="reconcile"/><input type="hidden" name="obligationId" value={source.obligationId}/><input type="hidden" name="version" value={source.version}/><input type="hidden" name="items" value={payload}/>
      {source.currency !== baseCurrency ? <><FinanceFxFields currency={source.currency} base={baseCurrency}/><p className="mb-3 text-xs text-[var(--ui-text-muted)]">{t("foreignCapacityHelp", { currency: baseCurrency })}</p></> : null}
      <p className="mb-2 text-xs text-[var(--ui-text-secondary)]">{t("replacementSplitHelp", { currency: baseCurrency })}</p>
      <div className="space-y-2">{items.map(item => <div key={item.id} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.55fr)_auto] sm:items-end">
        <FormField label={t("project")}><Select name={`project-${item.id}`} value={item.projectId} onValueChange={projectId => update(item.id, { projectId })} required><SelectItem value="">{t("selectProject")}</SelectItem>{projects.map(project => <SelectItem key={project.id} value={project.id} disabled={items.some(other => other.id !== item.id && other.projectId === project.id)}>{project.name}</SelectItem>)}</Select></FormField>
        <FormField label={t("amount", { currency: baseCurrency })}><Input value={item.amount} onChange={event => update(item.id, { amount: event.target.value })} inputMode="decimal" required/></FormField>
        <Button type="button" variant="outline" size="sm" aria-label={t("removeProject")} onClick={() => setItems(rows => rows.filter(row => row.id !== item.id))}>{t("removeProject")}</Button>
      </div>)}</div>
      {!items.length ? <p className="mt-2 text-sm text-[var(--ui-text-secondary)]">{t("noProjectAttribution")}</p> : null}
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setItems(rows => [...rows, { id: crypto.randomUUID(), projectId: "", amount: "" }])}>{t("addProject")}</Button>
      {nativeCapacity !== null ? <p className={`mt-2 text-sm tabular-nums ${overCapacity ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text-secondary)]"}`}>{t("allocationTotal", { amount: total === null ? "—" : displayAmount(total, unit, locale, baseCurrency), capacity: displayAmount(nativeCapacity, unit, locale, baseCurrency) })}</p> : <p className="mt-2 text-sm text-[var(--ui-text-secondary)]">{t("allocationTotalUnknown")}</p>}
      {overCapacity ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("overCapacity")}</p> : null}
      {incomplete ? <p className="text-sm text-[var(--ui-text-muted)]">{t("splitIncomplete")}</p> : null}
      <FormField label={t("reason")} className="mt-3"><Textarea name="reason" rows={2} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} required/></FormField>
    </FinanceActionForm>
  </div>;
}

function currencyFor(code: string, currencies: FinanceCurrency[]) { return currencies.find(currency => currency.code === code); }
function money(value: string | null, currency: FinanceCurrency | undefined, locale: string, code: string) { return displayAmount(value, currency, locale, code); }
