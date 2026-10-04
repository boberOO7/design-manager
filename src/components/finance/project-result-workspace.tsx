"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { FinanceManagementData } from "@/data/queries/finance-management";
import type { ProjectProfitPeriod } from "@/lib/finance-project-view";
import { financeAmountText, financeAmountUnits, formatFinanceAmount } from "@/lib/finance";
import { formatDateOnly } from "@/lib/utils";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { EstimateForm } from "./project-profitability-section";
import { RecognitionForm } from "./recognition-form";

const panel = "min-w-0 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5";

export function ProjectResultWorkspace({ data, projectId, period }: { data: FinanceManagementData; projectId: string; period: ProjectProfitPeriod }) {
  const t = useTranslations("Finance.projectResult"), profit = useTranslations("Finance.profitability"), management = useTranslations("Finance.management");
  const locale = useLocale(), router = useRouter();
  const [recognitionOpen, setRecognitionOpen] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [recognitionPending, setRecognitionPending] = useState(false);
  const [estimatePending, setEstimatePending] = useState(false);
  const row = data.projectProfitability.find(item => item.projectId === projectId);
  const recognitionStart = data.settings?.recognition_start_month ?? null;
  const recognitionActive = Boolean(recognitionStart && recognitionStart <= data.today);
  if (!row) return null;

  const money = (amount: string | null) => amount === null ? t("unknown") : `${formatFinanceAmount(amount, data.currency, locale, "decimal")} ${data.displayCurrency}`;
  const date = (value: string) => formatDateOnly(value, locale);
  const knownCosts = financeAmountText(financeAmountUnits(row.lifetime.directCost, data.currency.minor_units) + financeAmountUnits(row.lifetime.labor, data.currency.minor_units), data.currency.minor_units);
  const selected = period === "all" ? row.lifetime : row.period;
  const selectedKnownCosts = period === "all" ? knownCosts : financeAmountText(financeAmountUnits(selected.directCost, data.currency.minor_units) + financeAmountUnits(selected.labor, data.currency.minor_units), data.currency.minor_units);
  const historyIncomplete = period === "all" ? row.historyIncomplete : Boolean(recognitionStart && data.filters.from < recognitionStart);
  const periodUnavailable = !recognitionActive || Boolean(recognitionStart && data.filters.to < recognitionStart);
  const costIncomplete = Boolean(row.coverageGaps || row.laborIncomplete || selected.missingFx || row.pendingTripCount);
  const directIncomplete = Boolean(historyIncomplete || row.coverageGaps || selected.missingFx || row.pendingTripCount);
  const laborIncomplete = Boolean(historyIncomplete || row.coverageGaps || row.laborIncomplete || selected.missingFx);
  const resultIncomplete = costIncomplete || historyIncomplete;
  const costDisplayIncomplete = costIncomplete || historyIncomplete;
  const displayKnown = (amount: string | null, incomplete: boolean) => {
    if (amount === null || (incomplete && financeAmountUnits(amount, data.currency.minor_units) === BigInt(0))) return t("unknown");
    return money(amount);
  };
  const showKnownSuffix = (amount: string | null, incomplete: boolean) => Boolean(amount !== null && incomplete && financeAmountUnits(amount, data.currency.minor_units) !== BigInt(0));
  const basePath = `/projects/${projectId}`;
  const viewHref = (next: ProjectProfitPeriod) => `${basePath}?view=finance&financeTab=result&profitPeriod=${next}`;
  const exportParams = new URLSearchParams({ report: "projects", from: data.filters.from, to: data.filters.to, version: data.version, project: projectId });
  const historyParams = new URLSearchParams({ project: projectId, from: data.filters.from, to: data.filters.to });
  const refresh = () => router.refresh();
  const estimate = row.estimate;
  const estimateValuesKnown = row.estimateDisplay.remaining_direct !== null && row.estimateDisplay.remaining_labor !== null;
  const estimateUnavailable = !recognitionActive || row.estimateStale || !estimateValuesKnown || row.finalMargin === null || costIncomplete || historyIncomplete;
  const nativeMoney = (amount: string | null, currency: string) => {
    if (amount === null) return t("unknown");
    const unit = data.currencies.find(item => item.code === currency) ?? data.currency;
    return `${formatFinanceAmount(amount, unit, locale, "decimal")} ${currency}`;
  };

  return <section aria-labelledby="project-result-title" className="min-w-0 space-y-4" id="project-result">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="project-result-title" className="text-lg font-semibold">{t("title")}</h2><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("intro")}</p></div>
      <Link href={`/finance/reports/export?${exportParams}`} className="inline-flex min-h-11 items-center rounded-[var(--ui-radius-control)] px-2 text-sm font-medium text-[var(--ui-text-secondary)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{profit("exportCsv")}</Link>
    </header>

    <nav aria-label={t("periodLabel")} className="flex flex-wrap gap-2">
      {(["all", "month", "year", "custom"] as const).map(value => <Link key={value} href={viewHref(value)} scroll={false} aria-current={period === value ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-[var(--ui-radius-control)] border px-3 text-sm transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${period === value ? "border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] font-semibold text-[var(--ui-text)]" : "border-[var(--ui-border-subtle)] text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-subtle)]"}`}>{t(`period.${value}`)}</Link>)}
    </nav>
    {period === "custom" ? <form method="get" action={basePath} className={`${panel} grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end`}>
      <input type="hidden" name="view" value="finance"/><input type="hidden" name="financeTab" value="result"/><input type="hidden" name="profitPeriod" value="custom"/>
      <FormField label={profit("from")}><DatePicker name="profitFrom" defaultValue={data.filters.from} locale={locale}/></FormField>
      <FormField label={profit("to")}><DatePicker name="profitTo" defaultValue={data.filters.to} locale={locale}/></FormField>
      <Button type="submit" variant="outline">{profit("applyFilters")}</Button>
    </form> : null}

    {!recognitionActive ? <div role="status" className={`${panel} space-y-2`}>
      <h3 className="font-semibold">{t("activationTitle")}</h3>
      <p className="text-sm text-[var(--ui-text-secondary)]">{recognitionStart ? t("activationFuture", { date: date(recognitionStart) }) : t("activationHelp")}</p>
      {!recognitionStart ? <Link href="/finance/reports" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{management("activate")}</Link> : null}
    </div> : <>
      {periodUnavailable ? <div role="status" className={`${panel} text-sm text-[var(--ui-text-secondary)]`}>{management("reportUnavailable", { date: date(recognitionStart ?? data.today) })}</div> : <>
      {period === "all" && recognitionStart ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("recognizedCoverage", { date: date(recognitionStart) })}</p> : <p className="text-xs text-[var(--ui-text-secondary)]">{date(data.filters.from)} – {date(data.filters.to)}</p>}
      {period === "all" && historyIncomplete ? <div role="status" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] p-3 text-sm text-[var(--ui-warning-text)]">
        <p>{row.startsOn ? t("historyGap", { projectStart: date(row.startsOn), coveredFrom: date(recognitionStart ?? "") }) : t("historyGapUnknownStart", { coveredFrom: date(recognitionStart ?? "") })}</p>
        <p className="mt-1 text-xs">{t("historyGapHelp")}</p>
      </div> : null}
      {period !== "all" && recognitionStart && data.filters.from < recognitionStart ? <div role="status" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] p-3 text-sm text-[var(--ui-warning-text)]">{management("reportPartial", { date: date(recognitionStart) })}</div> : null}

      <article className={`${panel} space-y-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><div><p className="text-sm text-[var(--ui-text-secondary)]">{resultIncomplete ? t("knownResultLabel") : t("resultShort")}</p><p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{displayKnown(selected.result, resultIncomplete)}</p>{showKnownSuffix(selected.result, resultIncomplete) ? <p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("knownSubtotalSuffix")}</p> : null}</div>
          <span className="text-sm text-[var(--ui-text-secondary)]">{selected.margin === null || (resultIncomplete && financeAmountUnits(selected.margin, 2) === BigInt(0)) ? t("unknown") : resultIncomplete ? t("knownMarginValue", { value: selected.margin }) : t("marginValue", { value: selected.margin })}</span></div>
        <dl className="grid gap-3 border-t border-[var(--ui-border-subtle)] pt-3 sm:grid-cols-2">
          <div><dt className="text-xs text-[var(--ui-text-muted)]">{t("recognizedRevenue")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{displayKnown(selected.revenue, historyIncomplete || selected.missingFx > 0)}</dd></div>
          <div><dt className="text-xs text-[var(--ui-text-muted)]">{costIncomplete ? t("knownCostsPartial") : t("knownCosts")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{displayKnown(selectedKnownCosts, costDisplayIncomplete)}</dd></div>
        </dl>
        {costIncomplete ? <p role="status" className="text-xs text-[var(--ui-warning-text)]">{t("costsIncomplete")}</p> : null}
        {showKnownSuffix(selected.revenue, historyIncomplete || selected.missingFx > 0) || showKnownSuffix(selectedKnownCosts, costDisplayIncomplete) ? <p className="text-xs text-[var(--ui-text-muted)]">{t("knownSubtotalSuffix")}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ui-border-subtle)] pt-3"><p className="text-xs text-[var(--ui-text-secondary)]">{t("recognitionActionHelp")}</p><Button type="button" onClick={() => setRecognitionOpen(true)}>{t("recognizeWork")}</Button></div>
      </article>

      <section className={`${panel} space-y-3`} aria-labelledby="project-result-costs">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 id="project-result-costs" className="font-semibold">{t("costBreakdown")}</h3><p className="text-xs text-[var(--ui-text-muted)]">{data.displayCurrency}</p></div>
        <dl className="divide-y divide-[var(--ui-border-subtle)] text-sm">
          <div className="flex min-h-12 items-center justify-between gap-3 py-2"><dt>{t("directCosts")}</dt><dd className="text-right font-medium tabular-nums">{displayKnown(selected.directCost, directIncomplete)}{showKnownSuffix(selected.directCost, directIncomplete) ? <span className="ml-2 block text-xs font-normal text-[var(--ui-text-muted)]">{t("knownSubtotalSuffix")}</span> : null}</dd></div>
          <div className="flex min-h-12 items-center justify-between gap-3 py-2 pl-3 text-[var(--ui-text-secondary)]"><dt>{t("tripsIncluded")}</dt><dd className="text-right tabular-nums">{displayKnown(selected.tripCost, directIncomplete)}{showKnownSuffix(selected.tripCost, directIncomplete) ? <span className="ml-2 block text-xs text-[var(--ui-text-muted)]">{t("knownSubtotalSuffix")}</span> : null}</dd></div>
          <div className="flex min-h-12 items-center justify-between gap-3 py-2"><dt>{t("attributedLabor")}</dt><dd className="text-right font-medium tabular-nums">{displayKnown(selected.labor, laborIncomplete)}{showKnownSuffix(selected.labor, laborIncomplete) ? <span className="ml-2 block text-xs font-normal text-[var(--ui-text-muted)]">{t("knownSubtotalSuffix")}</span> : null}</dd></div>
        </dl>
        <p className="text-xs text-[var(--ui-text-muted)]">{profit("basis")}</p>
      </section>

      <section className={`${panel} space-y-3`} aria-labelledby="project-result-forecast">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="project-result-forecast" className="font-semibold">{t("forecastTitle")}</h3><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("forecastHelp")}</p></div>
          <Button type="button" variant="outline" onClick={() => setEstimateOpen(true)}>{t("updateEstimate")}</Button></div>
        <dl className="grid gap-3 sm:grid-cols-2"><div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3"><dt className="text-xs text-[var(--ui-text-muted)]">{profit("remaining_direct")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(row.estimateDisplay.remaining_direct)}</dd></div><div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3"><dt className="text-xs text-[var(--ui-text-muted)]">{profit("remaining_labor")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(row.estimateDisplay.remaining_labor)}</dd></div></dl>
        <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3">
          <p className="text-xs text-[var(--ui-text-muted)]">{profit("finalMargin")}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{estimateUnavailable ? t("unknown") : row.finalMargin === null ? t("unknown") : t("marginValue", { value: row.finalMargin })}</p>
          {estimateUnavailable ? <p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{!recognitionActive ? t("forecastActivation") : row.estimateStale ? profit("estimateStale") : t("forecastIncomplete")}</p> : null}
        </div>
        {costIncomplete ? <p className="text-xs text-[var(--ui-warning-text)]">{t("forecastCostsIncomplete")}</p> : null}
        <AnimatedDisclosure title={t("estimateDetails")}>
          {estimate ? <dl className="grid gap-3 pt-3 text-sm sm:grid-cols-2">{(["direct_budget", "labor_budget"] as const).map(key => <div key={key}><dt className="text-xs text-[var(--ui-text-muted)]">{profit(key)}</dt><dd className="mt-1 tabular-nums">{money(row.estimateDisplay[key])}</dd></div>)}</dl> : <p className="pt-3 text-sm text-[var(--ui-text-secondary)]">{t("noEstimate")}</p>}
          <p className="mt-3 text-xs text-[var(--ui-text-secondary)]">{profit("unknownHelp")}</p>
          {row.estimateStale ? <p role="status" className="mt-2 text-xs text-[var(--ui-warning-text)]">{profit("estimateStale")}</p> : null}
          <AnimatedDisclosure title={t("budgetVsActual")} className="mt-3"><p className="pt-2 text-xs text-[var(--ui-text-secondary)]">{profit("budgetVarianceHelp")}</p><dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-[var(--ui-text-muted)]">{profit("directVariance")}</dt><dd className="mt-1 tabular-nums">{money(row.budgetVariance.direct)}</dd></div><div><dt className="text-xs text-[var(--ui-text-muted)]">{profit("laborVariance")}</dt><dd className="mt-1 tabular-nums">{money(row.budgetVariance.labor)}</dd></div></dl></AnimatedDisclosure>
          <AnimatedDisclosure title={profit("estimateHistory")} className="mt-3">
            {data.projectReporting.estimates.filter(item => item.project_id === projectId).length ? <ul className="divide-y divide-[var(--ui-border-subtle)] pt-2 text-xs text-[var(--ui-text-secondary)]">{data.projectReporting.estimates.filter(item => item.project_id === projectId).map(item => <li key={item.id} className="py-2"><p className="font-medium">{date(item.as_of)} · {item.reason}</p><dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">{([["direct_budget", item.direct_budget], ["labor_budget", item.labor_budget], ["remaining_direct", item.remaining_direct], ["remaining_labor", item.remaining_labor]] as const).map(([key, amount]) => <div key={key}><dt className="inline text-[var(--ui-text-muted)]">{profit(key)}: </dt><dd className="inline tabular-nums">{nativeMoney(amount, item.currency)}</dd></div>)}</dl>{item.fx_rate ? <AnimatedDisclosure title={t("estimateFxDetails")} className="mt-2"><p className="pt-2">FX {item.fx_rate} · {item.fx_source ?? "—"} · {date(item.fx_effective_date ?? item.as_of)}</p></AnimatedDisclosure> : null}</li>)}</ul> : <p className="pt-2 text-xs text-[var(--ui-text-secondary)]">{t("noEstimate")}</p>}
          </AnimatedDisclosure>
        </AnimatedDisclosure>
      </section>

      <AnimatedDisclosure title={t("accountingDetails")} className={`${panel} text-sm`}>
        <div className="space-y-2 pt-2 text-[var(--ui-text-secondary)]"><p>{profit("basis")}</p><p>{t("tripSubsetHelp")}</p>
          <Link href={`/finance/reports?${historyParams}#fx-history`} className="inline-flex min-h-11 items-center underline underline-offset-4">{t("openRecognitionHistory")}</Link>
          {row.coverageGaps ? <p role="status" className="text-[var(--ui-warning-text)]">{profit("coverageGaps", { count: row.coverageGaps })} <Link href={`/finance/reports?${historyParams}#coverage`} className="underline">{profit("reviewCoverage")}</Link></p> : null}
          {row.laborIncomplete ? <p role="status" className="text-[var(--ui-warning-text)]">{profit("laborIncomplete")} <Link href={`/finance/reports?${historyParams}#labor`} className="underline">{profit("reviewLabor")}</Link></p> : null}
          {selected.missingFx ? <p role="status" className="text-[var(--ui-warning-text)]">{profit("missingFx", { count: selected.missingFx })} <Link href={`/finance/reports?project=${projectId}#fx-history`} className="underline">{profit("reviewFx")}</Link></p> : null}
          {row.pendingTripCount ? <p role="status" className="text-[var(--ui-warning-text)]">{profit("pendingTrips", { count: row.pendingTripCount })} <Link href="/finance/reports#trip-sources" className="underline">{profit("reviewCoverage")}</Link></p> : null}
        </div>
      </AnimatedDisclosure>
      </>}
    </>}

    <Dialog isOpen={recognitionOpen} closeDisabled={recognitionPending} onRequestClose={() => { if (!recognitionPending) setRecognitionOpen(false); }} title={t("recognizeDialogTitle")} description={t("recognizeDialogHelp")} closeLabel={t("close")}>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-6"><RecognitionForm data={data} projectId={projectId} projectRevenueOnly onPending={setRecognitionPending} onSaved={() => { setRecognitionOpen(false); refresh(); }}/></div>
    </Dialog>
    <Dialog isOpen={estimateOpen} closeDisabled={estimatePending} onRequestClose={() => { if (!estimatePending) setEstimateOpen(false); }} title={t("estimateDialogTitle")} closeLabel={t("close")}>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-6"><EstimateForm data={data} projectId={projectId} onPending={setEstimatePending} onSaved={() => { setEstimateOpen(false); refresh(); }}/></div>
    </Dialog>
  </section>;
}
