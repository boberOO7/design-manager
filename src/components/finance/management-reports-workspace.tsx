"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Download } from "lucide-react";
import { saveFinanceManagement } from "@/app/(app)/finance/reports/actions";
import { ManagementTripSection } from "./management-trip-section";
import { ManagementLaborSection } from "./management-labor-section";
import { laborSourceIssues } from "@/lib/finance-labor";
import { FinanceActionForm } from "@/components/finance/finance-action-form";
import { FinanceFxFields } from "@/components/finance/finance-fx-fields";
import { DisplayCurrencySelect } from "@/components/finance/display-currency-select";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Panel } from "@/components/ui/panel";
import { Select, SelectItem } from "@/components/ui/select";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { financeAmountUnits, formatFinanceAmount } from "@/lib/finance";
import { managementCoverageIssues, recognitionSourceHref, summarizeManagementEntries, type RecognitionEntry, type RecognitionSource } from "@/lib/finance-management";
import type { FinanceManagementData } from "@/data/queries/finance-management";
import { formatDateOnly } from "@/lib/utils";

const panel = "min-w-0 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5";
const field = "min-w-0";
const classifications = ["revenue", "direct_cost", "labor", "overhead"] as const;
const coverageFields = [
  { key: "revenue", name: "revenue", column: "revenue_reviewed" },
  { key: "direct_cost", name: "direct_costs", column: "direct_costs_reviewed" },
  { key: "labor", name: "labor", column: "labor_reviewed" },
  { key: "overhead", name: "overhead", column: "overhead_reviewed" },
] as const;

function monthStarts(from: string, to: string) {
  const current = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const last = `${to.slice(0, 7)}-01`;
  const months: string[] = [];
  while (current.toISOString().slice(0, 10) <= last) {
    months.push(current.toISOString().slice(0, 10));
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return months;
}

function amountDateInSource(source: RecognitionSource | undefined, today: string) {
  if (source?.periodStart && today < source.periodStart) return source.periodStart;
  if (source?.periodEnd && today > source.periodEnd) return source.periodEnd;
  return today;
}

export function ManagementReportsWorkspace({ data }: { data: FinanceManagementData }) {
  const t = useTranslations("Finance.management"), locale = useLocale(), router = useRouter();
  const recognitionStart = data.settings?.recognition_start_month ?? null;
  const startMonth = `${data.today.slice(0, 7)}-01`;
  const earliestEntryDate = recognitionStart ?? startMonth;
  const eligibleSources = useMemo(() => data.sources.filter(source => (!recognitionStart || recognitionStart <= data.today) && financeAmountUnits(source.remaining, 4) > BigInt(0)
    && (!source.periodEnd || source.periodEnd >= earliestEntryDate)
    && (!source.periodStart || source.periodStart <= data.today)), [data.sources, data.today, earliestEntryDate, recognitionStart]);
  const [selectedSourceId, setSelectedSourceId] = useState(eligibleSources[0]?.sourceId ?? "");
  const source = eligibleSources.find(item => item.sourceId === selectedSourceId);
  const [sourceAmount, setSourceAmount] = useState(source?.remaining ?? "");
  const [periodStart, setPeriodStart] = useState(source?.periodStart && source.periodStart > earliestEntryDate ? source.periodStart : earliestEntryDate);
  const [periodEnd, setPeriodEnd] = useState(source?.periodEnd && source.periodEnd < data.today ? source.periodEnd : data.today);
  const [recognizedOn, setRecognizedOn] = useState(amountDateInSource(source, data.today));
  const [sourceDescription, setSourceDescription] = useState(source?.label ?? "");
  const [projectForSource, setProjectForSource] = useState(source?.projectId ?? "");
  const [historyClassification, setHistoryClassification] = useState<(typeof classifications)[number] | null>(null);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [coverageMonth, setCoverageMonth] = useState(earliestEntryDate.slice(0, 7));
  const projectId = data.filters.projectId ?? null;
  const periodUnavailable = !recognitionStart || data.filters.to < recognitionStart;
  const periodPartial = Boolean(recognitionStart && data.filters.from < recognitionStart && data.filters.to >= recognitionStart);
  const periodEffectiveFrom = recognitionStart && data.filters.from < recognitionStart ? recognitionStart : data.filters.from;
  const periodRows = useMemo(() => (projectId ? data.projectRows : data.amountRows).filter(entry => entry.recognized_on >= periodEffectiveFrom && entry.recognized_on <= data.filters.to && (!projectId || entry.project_id === projectId)), [data.projectRows, data.amountRows, data.filters.to, periodEffectiveFrom, projectId]);
  const summary = summarizeManagementEntries(periodRows, data.filters.from, data.filters.to, data.currency.minor_units);
  const comparisonRange = data.filters.compareFrom && data.filters.compareTo ? { from: data.filters.compareFrom, to: data.filters.compareTo } : null;
  const comparisonUnavailable = Boolean(comparisonRange && (!recognitionStart || comparisonRange.to < recognitionStart));
  const comparisonPartial = Boolean(comparisonRange && recognitionStart && comparisonRange.from < recognitionStart && comparisonRange.to >= recognitionStart);
  const comparisonEffectiveFrom = comparisonRange && recognitionStart && comparisonRange.from < recognitionStart ? recognitionStart : comparisonRange?.from;
  const comparisonRows = comparisonRange && !comparisonUnavailable && comparisonEffectiveFrom
    ? summarizeManagementEntries((projectId ? data.projectRows : data.amountRows).filter(entry => entry.recognized_on >= comparisonEffectiveFrom && entry.recognized_on <= comparisonRange.to && (!projectId || entry.project_id === projectId)), comparisonEffectiveFrom, comparisonRange.to, data.currency.minor_units)
    : null;
  const coverageIssues = periodUnavailable ? [] : managementCoverageIssues(data.coverage, periodEffectiveFrom, data.filters.to, projectId);
  const comparisonCoverageIssues = comparisonRange && !comparisonUnavailable && comparisonEffectiveFrom ? managementCoverageIssues(data.coverage, comparisonEffectiveFrom, comparisonRange.to, projectId) : [];
  const laborIssues = laborSourceIssues(data.labor.sources, periodEffectiveFrom, data.filters.to);
  const missingLaborPeriods = data.labor.missingPeriods.filter(period => period.periodStart <= data.filters.to && period.periodEnd >= periodEffectiveFrom);
  const pendingTrips = data.tripSources.filter(source => source.date >= periodEffectiveFrom && source.date <= data.filters.to && (!projectId || source.projectId === projectId));
  const months = monthStarts(data.filters.from, data.filters.to).map(month => {
    const rawFrom = data.filters.from > month ? data.filters.from : month;
    const through = month === data.filters.to.slice(0, 7) + "-01" ? data.filters.to : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const unavailable = !recognitionStart || through < recognitionStart;
    const from = recognitionStart && rawFrom < recognitionStart ? recognitionStart : rawFrom;
    return { month, through, unavailable, partial: Boolean(recognitionStart && rawFrom < recognitionStart && through >= recognitionStart), totals: summarizeManagementEntries(periodRows, from, through, data.currency.minor_units) };
  });
  const historyRows = data.history.filter(entry => (!historyClassification || entry.classification === historyClassification) && entry.recognized_on >= data.filters.from && entry.recognized_on <= data.filters.to && (!projectId || entry.project_id === projectId || data.projectRows.some(row => row.project_id === projectId && row.source_entry_id === entry.id)));
  const selectedProject = data.projects.find(project => project.id === projectId);
  const currency = data.displayCurrency;
  const money = (value: string | null) => value === null ? "—" : `${formatFinanceAmount(value, data.currency, locale, "decimal")} ${currency}`;
  const nativeMoney = (value: string, code: string) => `${formatFinanceAmount(value, data.currencies.find(item => item.code === code) ?? data.currency, locale, "decimal")} ${code}`;
  const reportingMoney = (value: string, code: string) => `${formatFinanceAmount(value, data.currencies.find(item => item.code === code) ?? data.currency, locale, "decimal")} ${code}`;
  const date = (value: string) => formatDateOnly(value, locale);
  const classificationLabel = (classification: (typeof classifications)[number]) => t(`classification.${classification}`);
  const csvParams = new URLSearchParams({ from: data.filters.from, to: data.filters.to, report: data.filters.mode, scope: data.filters.lifetime ? "lifetime" : "period" });
  if (data.filters.compareFrom && data.filters.compareTo) {
    csvParams.set("compareFrom", data.filters.compareFrom);
    csvParams.set("compareTo", data.filters.compareTo);
  }
  if (projectId) csvParams.set("project", projectId);
  const onSaved = () => router.refresh();
  const updateSource = (id: string) => {
    const next = eligibleSources.find(item => item.sourceId === id);
    setSelectedSourceId(id);
    setSourceAmount(next?.remaining ?? "");
    setPeriodStart(next?.periodStart && next.periodStart > earliestEntryDate ? next.periodStart : earliestEntryDate);
    setPeriodEnd(next?.periodEnd && next.periodEnd < data.today ? next.periodEnd : data.today);
    setRecognizedOn(amountDateInSource(next, data.today));
    setSourceDescription(next?.label ?? "");
    setProjectForSource(next?.projectId ?? "");
  };
  const sourceNeedsProject = source?.classification === "direct_cost" && !source.projectId;
  const rowsById = new Map(historyRows.map(entry => [entry.id, entry]));
  const reversedIds = new Set(data.history.filter(entry => entry.kind === "reversal" && entry.related_entry_id).map(entry => entry.related_entry_id));

  return <div className="w-full min-w-0 space-y-5">
    <PageHeader title={t("title")} description={t("description", { currency })} className="flex-wrap" action={<div className="flex flex-wrap items-center gap-2"><DisplayCurrencySelect value={data.displayCurrency}/><Link href={`/finance/reports/export?${csvParams}&version=${encodeURIComponent(data.version)}`} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--ui-radius-control)] px-3 text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Download aria-hidden="true" className="size-4"/>{t("exportCsv")}</Link></div>}/>

    <nav aria-label={t("title")} className="flex flex-wrap gap-4 text-sm"><Link href="/finance/reports" aria-current="page" className="font-semibold underline underline-offset-4">{t("title")}</Link><Link href={`/finance/reports?report=projects&from=${data.filters.from}&to=${data.filters.to}`} className="underline underline-offset-4">{t("projectsReport")}</Link></nav>

    {!recognitionStart ? <Panel className={`${panel} space-y-3`}>
      <div><h2 className="font-semibold">{t("activateTitle")}</h2><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("activateHelp")}</p></div>
      <FinanceActionForm action={saveFinanceManagement} label={t("activate")} onSaved={onSaved}>
        <input type="hidden" name="intent" value="activation"/>
        <FormField label={t("recognitionStart")} className="max-w-xs"><DatePicker name="month" monthOnly defaultValue={startMonth} min={startMonth} locale={locale}/></FormField>
      </FinanceActionForm>
    </Panel> : <div className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] px-4 py-3 text-sm text-[var(--ui-text-secondary)]">{t("activeSince", { date: date(recognitionStart) })}</div>}

    <section aria-label={t("periodSummary")} className="overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--ui-border-subtle)] px-4 py-3 sm:px-5">
        <div><h2 className="font-semibold">{t("periodSummary")}</h2><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{date(data.filters.from)} – {date(data.filters.to)} · {currency}</p></div>
        <p className="text-sm text-[var(--ui-text-secondary)]">{t("knownResult")}: <strong className="text-base text-[var(--ui-text)] tabular-nums">{periodUnavailable ? "—" : money(summary.knownResult)}</strong></p>
      </div>
      <div className="overflow-x-auto px-4 py-2 sm:px-5">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead><tr className="border-b border-[var(--ui-border-subtle)] text-left text-xs text-[var(--ui-text-muted)]"><th className="py-2 pr-3 font-medium">{t("classificationTitle")}</th><th className="px-2 py-2 text-right font-medium">{t("periodAmount")}</th>{comparisonRange ? <th className="px-2 py-2 text-right font-medium">{t("comparisonAmount", { from: date(comparisonRange.from), to: date(comparisonRange.to) })}</th> : null}</tr></thead>
          <tbody>{classifications.map(key => <tr key={key} className="border-b border-[var(--ui-border-subtle)] last:border-0"><th className="py-2 pr-3 text-left font-medium"><Link href="#fx-history" onClick={() => setHistoryClassification(key)} className="underline decoration-[var(--ui-border)] underline-offset-4">{classificationLabel(key)}</Link></th><td className="px-2 py-2 text-right tabular-nums">{periodUnavailable ? "—" : money(summary.totals[key].known)}</td>{comparisonRange ? <td className="px-2 py-2 text-right tabular-nums">{comparisonRows ? money(comparisonRows.totals[key].known) : "—"}</td> : null}</tr>)}
            <tr className="border-t border-[var(--ui-border)] font-semibold"><th className="py-2 pr-3 text-left">{t("knownResult")}</th><td className="px-2 py-2 text-right tabular-nums">{periodUnavailable ? "—" : money(summary.knownResult)}</td>{comparisonRange ? <td className="px-2 py-2 text-right tabular-nums">{comparisonRows ? money(comparisonRows.knownResult) : "—"}</td> : null}</tr>
          </tbody>
        </table>
      </div>
      {periodUnavailable ? <p className="px-4 pb-3 text-xs text-[var(--ui-warning-text)] sm:px-5">{t("reportUnavailable", { date: date(recognitionStart ?? startMonth) })}</p> : null}
      {periodPartial ? <p className="px-4 pb-3 text-xs text-[var(--ui-warning-text)] sm:px-5">{t("reportPartial", { date: date(recognitionStart ?? "") })}</p> : null}
      {comparisonUnavailable ? <p className="px-4 pb-3 text-xs text-[var(--ui-warning-text)] sm:px-5">{recognitionStart ? t("comparisonUnavailable", { date: date(recognitionStart) }) : t("comparisonInactive")}</p> : null}
      {comparisonPartial ? <p className="px-4 pb-3 text-xs text-[var(--ui-warning-text)] sm:px-5">{t("comparisonPartial", { date: date(recognitionStart ?? "") })}</p> : null}
      {comparisonCoverageIssues.length ? <p className="px-4 pb-3 text-xs text-[var(--ui-warning-text)] sm:px-5">{t("comparisonCoverage", { count: comparisonCoverageIssues.length })}</p> : null}
      {comparisonRows?.missingFx ? <p className="px-4 pb-3 text-xs text-[var(--ui-warning-text)] sm:px-5">{t("comparisonMissingFx", { count: comparisonRows.missingFx })} <Link href="#fx-history" className="underline underline-offset-2">{t("reviewFxAction")}</Link></p> : null}
      <p className="px-4 pb-3 text-xs text-[var(--ui-text-muted)] sm:px-5">{t("knownResultHelp")}</p>
    </section>

    <Panel className={`${panel} space-y-3`}>
      <h2 className="font-semibold">{t("filtersTitle")}</h2>
      <form method="get" action="/finance/reports" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(12rem,1.3fr)_auto] xl:items-end">
        <FormField label={t("from")} className={field}><DatePicker key={data.filters.from} name="from" defaultValue={data.filters.from} locale={locale}/></FormField>
        <FormField label={t("to")} className={field}><DatePicker key={data.filters.to} name="to" defaultValue={data.filters.to} locale={locale}/></FormField>
        <FormField label={t("project")} className={field}><Select key={projectId ?? ""} name="project" defaultValue={projectId ?? ""}><SelectItem value="">{t("allProjects")}</SelectItem>{data.projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</Select></FormField>
        <input type="hidden" name="report" value={data.filters.mode}/><input type="hidden" name="scope" value={data.filters.lifetime ? "lifetime" : "period"}/>
        <AnimatedDisclosure title={t("comparisonFilters")} className="sm:col-span-2 xl:col-span-3">
          <div className="grid min-w-0 gap-3 pt-3 sm:grid-cols-2">
            <FormField label={t("compareFrom")} className={field}><DatePicker key={data.filters.compareFrom ?? ""} name="compareFrom" defaultValue={data.filters.compareFrom ?? ""} locale={locale}/></FormField>
            <FormField label={t("compareTo")} className={field}><DatePicker key={data.filters.compareTo ?? ""} name="compareTo" defaultValue={data.filters.compareTo ?? ""} locale={locale}/></FormField>
          </div>
        </AnimatedDisclosure>
        <Button type="submit" className="sm:col-span-2 xl:col-span-1">{t("applyFilters")}</Button>
      </form>
    </Panel>

    <section aria-label={t("warningsTitle")} className="space-y-2">
      {!periodUnavailable && summary.missingFx ? <div role="status" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] p-3 text-sm text-[var(--ui-warning-text)]">{t("missingFxWarning", { count: summary.missingFx })} <Link href="#fx-history" className="ml-1 underline underline-offset-2">{t("reviewFxAction")}</Link></div> : null}
      {coverageIssues.length ? <div role="status" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] p-3 text-sm text-[var(--ui-warning-text)]"><p>{t("coverageWarning", { count: coverageIssues.length })}</p><AnimatedDisclosure title={t("coverageMissingDetails")} className="mt-2 text-[var(--ui-text)]">
        <ul className="space-y-2 pt-2 text-sm">{[...new Set(coverageIssues.map(issue => issue.month))].map(month => <li key={month}><span className="font-medium">{date(month)}</span><ul className="ml-4 list-disc">{[...new Set(coverageIssues.filter(issue => issue.month === month).map(issue => issue.classification))].map(classification => <li key={classification}>{classificationLabel(classification)}</li>)}</ul></li>)}</ul>
        <Link href="#coverage" className="mt-2 inline-flex min-h-10 items-center underline underline-offset-2">{t("reviewCoverageAction")}</Link>
      </AnimatedDisclosure></div> : null}
      {pendingTrips.length ? <Link href="#trip-sources" className="inline-flex min-h-10 items-center text-sm text-[var(--ui-warning-text)] underline underline-offset-2">{t("pendingTrips", { count: pendingTrips.length })}</Link> : null}
      {laborIssues.length + missingLaborPeriods.length ? <Link href="#labor" className="inline-flex min-h-10 items-center text-sm text-[var(--ui-warning-text)] underline underline-offset-2">{t("laborNeedsReview", { count: laborIssues.length + missingLaborPeriods.length })}</Link> : null}
    </section>

    <Panel className={`${panel} space-y-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="text-lg font-semibold">{t("monthlyTotals")}</h2><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{date(data.filters.from)} – {date(data.filters.to)} · {currency}</p></div></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead><tr className="border-b border-[var(--ui-border)] text-left text-xs text-[var(--ui-text-secondary)]"><th className="py-2 pr-3 font-medium">{t("month")}</th>{classifications.map(key => <th key={key} className="px-2 py-2 text-right font-medium">{classificationLabel(key)}</th>)}<th className="px-2 py-2 text-right font-medium">{t("knownResult")}</th><th className="py-2 pl-2 text-right font-medium">{t("missingCount")}</th></tr></thead>
          <tbody>{months.map(row => <tr key={row.month} className="border-b border-[var(--ui-border-subtle)]"><th className="py-3 pr-3 text-left font-medium">{new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${row.month}T00:00:00Z`))}{row.partial ? <span className="mt-1 block text-[10px] font-normal text-[var(--ui-warning-text)]">{t("reportPartialShort")}</span> : null}</th>{classifications.map(key => <td key={key} className="px-2 py-3 text-right tabular-nums">{row.unavailable ? "—" : money(row.totals.totals[key].known)}</td>)}<td className="px-2 py-3 text-right font-semibold tabular-nums">{row.unavailable ? "—" : money(row.totals.knownResult)}</td><td className="py-3 pl-2 text-right tabular-nums">{row.unavailable ? "—" : row.totals.missingFx || "—"}</td></tr>)}</tbody>
          <tfoot><tr className="border-t border-[var(--ui-border)] font-semibold"><th className="py-3 pr-3 text-left">{t("periodTotal")}</th>{classifications.map(key => <td key={key} className="px-2 py-3 text-right tabular-nums">{periodUnavailable ? "—" : money(summary.totals[key].known)}</td>)}<td className="px-2 py-3 text-right tabular-nums">{periodUnavailable ? "—" : money(summary.knownResult)}</td><td className="py-3 pl-2 text-right tabular-nums">{periodUnavailable ? "—" : summary.missingFx || "—"}</td></tr></tfoot>
        </table>
      </div>
      <p className="text-xs text-[var(--ui-text-muted)]">{t("knownResultHelp")}</p>
    </Panel>

    <Panel className={`${panel} space-y-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">{t("sourcesTitle")}</h2><p className="text-xs text-[var(--ui-text-secondary)]">{date(data.filters.from)} – {date(data.filters.to)}{selectedProject ? ` · ${selectedProject.name}` : ""}</p></div>
      {!recognitionStart ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("activationRequired")}</p> : !eligibleSources.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("noSources")}</p> : <AnimatedDisclosure title={t("newRecognition")} className="w-full">
        <FinanceActionForm action={saveFinanceManagement} label={t("confirmRecognition")} onSaved={onSaved} className="space-y-4" disabled={!source || (sourceNeedsProject && !projectForSource)}>
          <input type="hidden" name="intent" value="recognition"/>
          <input type="hidden" name="sourceKind" value={source?.kind ?? ""}/><input type="hidden" name="sourceId" value={source?.sourceId ?? ""}/><input type="hidden" name="classification" value={source?.classification ?? "revenue"}/>
          <input type="hidden" name="projectId" value={source?.projectId ?? projectForSource}/>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FormField label={t("source")} className="sm:col-span-2 xl:col-span-2"><Select value={selectedSourceId} onValueChange={updateSource}>{eligibleSources.map(item => <SelectItem key={`${item.kind}-${item.sourceId}`} value={item.sourceId}>{item.label} · {t(`sourceKind.${item.kind}`)}</SelectItem>)}</Select></FormField>
            <FormField label={t("netAmount", { currency: source?.currency ?? "" })} className={field}><Input name="amount" inputMode="decimal" value={sourceAmount} onChange={event => setSourceAmount(event.target.value)} required autoComplete="off"/><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("recognitionBasisHelp")}</span></FormField>
            <div className="flex items-end text-xs text-[var(--ui-text-secondary)]">{source ? t("sourceValue", { gross: source.gross, remaining: source.remaining, currency: source.currency }) : null}</div>
            {sourceNeedsProject ? <FormField label={t("assignProject")} className="sm:col-span-2"><Select value={projectForSource} onValueChange={setProjectForSource} required><SelectItem value="">{t("selectProject")}</SelectItem>{data.projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</Select></FormField> : null}
            <FormField label={t("economicDate")} className={field}><DatePicker name="date" value={recognizedOn} onValueChange={setRecognizedOn} min={periodStart < recognitionStart ? recognitionStart : periodStart} max={periodEnd > data.today ? data.today : periodEnd} locale={locale} required/></FormField>
            <FormField label={t("periodStart")} className={field}><DatePicker name="periodStart" value={periodStart} onValueChange={setPeriodStart} min={recognitionStart ?? startMonth} max={data.today} locale={locale} required/></FormField>
            <FormField label={t("periodEnd")} className={field}><DatePicker name="periodEnd" value={periodEnd} onValueChange={setPeriodEnd} min={periodStart < recognitionStart ? recognitionStart : periodStart} max={data.today} locale={locale} required/></FormField>
            <FormField label={t("descriptionLabel")} className="sm:col-span-2 xl:col-span-2"><Input name="description" value={sourceDescription} onChange={event => setSourceDescription(event.target.value)} maxLength={2000} required/></FormField>
          {source && source.currency !== data.settings?.base_currency ? <div className="sm:col-span-2 xl:col-span-2"><FinanceFxFields currency={source.currency} base={data.settings?.base_currency ?? "UAH"}/><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("fxSourceHelp")}</p></div> : <input type="hidden" name="fxMode" value="nbu"/>}
            <FormField label={t("reason")} className="sm:col-span-2 xl:col-span-4"><Textarea name="reason" rows={2} maxLength={2000} required/></FormField>
          </div>
          {source ? <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3 text-sm text-[var(--ui-text-secondary)]"><p>{t("confirmation", { amount: sourceAmount || "0", currency: source.currency, date: date(recognizedOn), from: date(periodStart), to: date(periodEnd) })}</p>{(source.projectId || projectForSource) ? <p className="mt-1">{t("projectConfirmed", { project: data.projects.find(project => project.id === (source.projectId ?? projectForSource))?.name ?? "" })}</p> : null}<p className="mt-1">{t("confirmationReason")}</p></div> : null}
        </FinanceActionForm>
      </AnimatedDisclosure>}
    </Panel>

    {recognitionStart && recognitionStart <= data.today ? <div id="labor"><ManagementLaborSection data={data.labor} projects={data.projects} currencies={data.currencies} baseCurrency={data.settings?.base_currency ?? "UAH"} from={periodEffectiveFrom} to={data.filters.to} today={data.today}/></div> : null}

    {recognitionStart && recognitionStart <= data.today && pendingTrips.length ? <div id="trip-sources"><ManagementTripSection sources={pendingTrips} currencies={data.currencies} projects={data.projects} onSaved={onSaved}/></div> : null}

    <Panel id="coverage" className={`${panel} space-y-3`}>
      <div><h2 className="text-lg font-semibold">{t("coverageTitle")}</h2><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("coverageHelp")}</p></div>
      {recognitionStart && recognitionStart <= data.today ? <AnimatedDisclosure title={t("reviewCoverageAction")} className="w-full"><CoverageForm data={data} onSaved={onSaved} month={coverageMonth} setMonth={setCoverageMonth} minMonth={recognitionStart.slice(0, 7)} projectId={projectId}/></AnimatedDisclosure> : <p className="text-sm text-[var(--ui-text-secondary)]">{recognitionStart ? t("futureActivationCoverage", { date: date(recognitionStart) }) : t("activationRequired")}</p>}
    </Panel>

    <Panel id="fx-history" className={`${panel} space-y-3`}>
      <div><h2 className="text-lg font-semibold">{t("historyTitle")}</h2>{historyClassification ? <Button type="button" variant="ghost" onClick={() => setHistoryClassification(null)}>{t("allSources")}</Button> : null}<p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("historyHelp")}</p></div>
      {!historyRows.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("noHistory")}</p> : <ul className="divide-y divide-[var(--ui-border)]">{historyRows.map(entry => <li key={entry.id} className="py-3">
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="font-medium">{entry.description}</span>{projectId && entry.classification === "labor" ? <span className="text-xs text-[var(--ui-text-secondary)]">{t("attributedAmount", { amount: money(data.projectRows.find(row => row.project_id === projectId && row.source_entry_id === entry.id)?.display_amount ?? null) })}</span> : null}<span className="text-xs text-[var(--ui-text-muted)]">{t(`entryKind.${entry.kind}`)} · {classificationLabel(entry.classification)}</span></div><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t("economicDate")} {date(entry.recognized_on)} · {t("economicPeriod", { from: date(entry.period_start), to: date(entry.period_end) })}{entry.project_id ? ` · ${data.projects.find(project => project.id === entry.project_id)?.name ?? ""}` : ""}</p></div>
          <div className="text-right"><p className={`whitespace-nowrap font-semibold tabular-nums ${entry.kind === "reversal" ? "text-[var(--ui-danger-text)]" : ""}`}>{entry.display_amount === null ? <span className="text-[var(--ui-warning-text)]">{t("missingFx")} · {nativeMoney(entry.amount, entry.currency)}</span> : money(entry.display_amount)}</p>{entry.display_amount !== null ? <p className="text-xs text-[var(--ui-text-muted)]">{nativeMoney(entry.amount, entry.currency)}</p> : null}</div>
        </div>
        <AnimatedDisclosure title={t("historyDetails")} open={editingEntry === entry.id} onOpenChange={open => setEditingEntry(open ? entry.id : null)} className="mt-2">
          <div className="space-y-2 pt-2">
            <p className="text-xs text-[var(--ui-text-secondary)]">{t("reason")}: {entry.reason || "—"}</p>
            <p className="text-xs text-[var(--ui-text-secondary)]">{t("valuationPreview", { date: date(entry.fx_effective_date ?? entry.recognized_on), native: nativeMoney(entry.amount, entry.currency), result: entry.reporting_amount === null ? t("missingFx") : reportingMoney(entry.reporting_amount, entry.reporting_currency), currency: entry.reporting_currency })}</p>
            {entry.fx_rate ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("fxDetail", { rate: entry.fx_rate, currency: entry.reporting_currency, date: date(entry.fx_effective_date ?? entry.recognized_on), source: entry.fx_source ?? "" })}</p> : null}
            {entry.kind !== "reversal" && !reversedIds.has(entry.id) && entry.reporting_amount === null && entry.currency !== entry.reporting_currency
              ? <ValuationForm entry={entry} entryId={entry.kind === "adjustment" ? entry.related_entry_id ?? entry.id : entry.id} base={entry.reporting_currency} onSaved={onSaved}/> : null}
            {entry.related_entry_id ? <p className="text-xs text-[var(--ui-text-muted)]">{t("relatedEntry", { id: rowsById.get(entry.related_entry_id)?.description ?? entry.related_entry_id })}</p> : null}
            <Link href={recognitionSourceHref(entry)} className="inline-flex min-h-10 items-center gap-1 rounded px-1 text-xs underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("viewSource")}<ArrowUpRight aria-hidden="true" className="size-3.5"/></Link>
            {entry.kind === "recognition" && entry.source_kind !== "trip" && !reversedIds.has(entry.id) ? <div className="space-y-2 border-t border-[var(--ui-border-subtle)] pt-2">
              <CorrectionForm entry={entry} onSaved={() => { setEditingEntry(null); onSaved(); }} projects={data.projects.map(project => ({ id: project.id, name: project.name }))}/>
              <AdjustmentForm entry={entry} today={data.today} onSaved={onSaved}/>
              <CancelForm entry={entry} onSaved={onSaved}/>
            </div> : null}
          </div>
        </AnimatedDisclosure>
      </li>)}</ul>}
    </Panel>
  </div>;
}

function CoverageForm({ data, onSaved, month, setMonth, minMonth, projectId }: { data: FinanceManagementData; onSaved: () => void; month: string; setMonth: (month: string) => void; minMonth: string; projectId: string | null }) {
  const t = useTranslations("Finance.management"), locale = useLocale();
  const monthValue = `${month}-01`;
  const existing = data.coverage.find(item => item.project_id === projectId && item.month === monthValue);
  const [through, setThrough] = useState(data.filters.to.slice(0, 7) === month ? data.filters.to : monthValue.slice(0, 7) === data.today.slice(0, 7) ? data.today : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10));
  const changeMonth = (value: string) => {
    setMonth(value);
    if (!value) return;
    const nextMonth = `${value}-01`;
    const monthEnd = new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0)).toISOString().slice(0, 10);
    setThrough(data.filters.to.slice(0, 7) === value ? data.filters.to : value === data.today.slice(0, 7) ? data.today : monthEnd);
    if (nextMonth > data.today) setThrough(data.today);
  };
  return <FinanceActionForm action={saveFinanceManagement} label={t("saveCoverage")} onSaved={onSaved}>
    {existing?.changed_since_review ? <p role="status" className="text-xs text-[var(--ui-warning-text)]">{t("coverageChanged")}</p> : null}
    <input type="hidden" name="intent" value="coverage"/><input type="hidden" name="projectId" value={projectId ?? ""}/><input type="hidden" name="month" value={monthValue}/><input type="hidden" name="revision" value={existing?.revision ?? 0}/>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <FormField label={t("coverageMonth")}><Input type="month" min={minMonth} max={data.today.slice(0, 7)} value={month} onChange={event => changeMonth(event.target.value)} required/></FormField>
      <FormField label={t("reviewedThrough")}><DatePicker name="through" value={through} onValueChange={setThrough} min={monthValue} max={data.today} locale={locale} required/></FormField>
      {coverageFields.map(({ key, name, column }) => <FormField key={name} label={t(`coverage.${key}`)}><Select key={`${name}-${monthValue}`} name={name} defaultValue={existing?.[column] ? "true" : "false"}><SelectItem value="false">{t("notReviewed")}</SelectItem><SelectItem value="true">{t("reviewed")}</SelectItem></Select></FormField>)}
      <FormField label={t("reason")} className="sm:col-span-2 xl:col-span-3"><Textarea name="reason" rows={2} maxLength={2000} required/></FormField>
    </div>
  </FinanceActionForm>;
}

function AdjustmentForm({ entry, today, onSaved }: { entry: RecognitionEntry; today: string; onSaved: () => void }) {
  const t = useTranslations("Finance.management"), locale = useLocale();
  const [date, setDate] = useState(entry.recognized_on);
  return <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3">
    <p className="mb-3 text-xs text-[var(--ui-text-secondary)]">{t("adjustmentHelp")}</p>
    <FinanceActionForm action={saveFinanceManagement} label={t("saveAdjustment")} onSaved={onSaved} className="space-y-3">
      <input type="hidden" name="intent" value="adjustment"/><input type="hidden" name="operation" value="adjustment"/><input type="hidden" name="entryId" value={entry.id}/>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("adjustmentAmount", { currency: entry.currency })}><Input name="amount" inputMode="decimal" required/></FormField>
        <FormField label={t("economicDate")}><DatePicker name="date" value={date} onValueChange={setDate} min={entry.recognized_on} max={today} locale={locale} required/></FormField>
        <FormField label={t("reason")} className="sm:col-span-2"><Textarea name="reason" rows={2} maxLength={2000} required/></FormField>
      </div>
    </FinanceActionForm>
  </div>;
}

function CancelForm({ entry, onSaved }: { entry: RecognitionEntry; onSaved: () => void }) {
  const t = useTranslations("Finance.management");
  return <FinanceActionForm action={saveFinanceManagement} label={t("confirmCancel")} onSaved={onSaved} className="space-y-3" showMessage>
    <input type="hidden" name="intent" value="cancel"/><input type="hidden" name="entryId" value={entry.id}/><input type="hidden" name="operation" value="cancel"/>
    <FormField label={t("reason")}><Textarea name="reason" rows={2} maxLength={2000} required/></FormField>
  </FinanceActionForm>;
}

function ValuationForm({ entry, entryId = entry.id, base, onSaved }: { entry: RecognitionEntry; entryId?: string; base: string; onSaved: () => void }) {
  const t = useTranslations("Finance.management");
  return <FinanceActionForm action={saveFinanceManagement} label={t("repairFx")} onSaved={onSaved} className="mt-3 space-y-3">
    <input type="hidden" name="intent" value="value"/><input type="hidden" name="entryId" value={entryId}/>
    <FinanceFxFields currency={entry.currency} base={base} initialMode={entry.fx_source === "manual" ? "manual" : "nbu"} initialRate={entry.fx_rate ?? ""}/>
  </FinanceActionForm>;
}

function CorrectionForm({ entry, projects, onSaved }: { entry: RecognitionEntry; projects: { id: string; name: string }[]; onSaved: () => void }) {
  const t = useTranslations("Finance.management"), locale = useLocale();
  const [date, setDate] = useState(entry.recognized_on), [from, setFrom] = useState(entry.period_start), [to, setTo] = useState(entry.period_end);
  return <div className="mt-3 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3">
    <FinanceActionForm action={saveFinanceManagement} label={t("saveCorrection")} onSaved={onSaved} className="space-y-3">
      <input type="hidden" name="intent" value="correction"/><input type="hidden" name="entryId" value={entry.id}/><input type="hidden" name="sourceKind" value={entry.source_kind}/><input type="hidden" name="sourceId" value={entry.movement_id ?? entry.expected_item_id ?? entry.terms_id ?? entry.id}/><input type="hidden" name="classification" value={entry.classification}/>
      <input type="hidden" name="projectId" value={entry.project_id ?? ""}/>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FormField label={t("netAmount", { currency: entry.currency })}><Input name="amount" defaultValue={entry.amount.replace(/^-/, "")} inputMode="decimal" required/></FormField>
        <FormField label={t("economicDate")}><DatePicker name="date" value={date} onValueChange={setDate} min={from} max={to} locale={locale} required/></FormField>
        <FormField label={t("periodStart")}><DatePicker name="periodStart" value={from} onValueChange={setFrom} locale={locale} required/></FormField>
        <FormField label={t("periodEnd")}><DatePicker name="periodEnd" value={to} onValueChange={setTo} min={from} locale={locale} required/></FormField>
        <FormField label={t("descriptionLabel")} className="sm:col-span-2"><Input name="description" defaultValue={entry.description} maxLength={2000} required/></FormField>
        {entry.currency !== entry.reporting_currency ? <div className="sm:col-span-2"><FinanceFxFields currency={entry.currency} base={entry.reporting_currency} initialMode={entry.fx_source === "manual" ? "manual" : "nbu"} initialRate={entry.fx_rate ?? ""}/></div> : <input type="hidden" name="fxMode" value="nbu"/>}
        <FormField label={t("reason")} className="sm:col-span-2 xl:col-span-4"><Textarea name="reason" rows={2} maxLength={2000} required/></FormField>
      </div>
      {entry.project_id && !projects.some(project => project.id === entry.project_id) ? <p className="text-xs text-[var(--ui-warning-text)]">{t("projectUnavailable")}</p> : null}
    </FinanceActionForm>
  </div>;
}
