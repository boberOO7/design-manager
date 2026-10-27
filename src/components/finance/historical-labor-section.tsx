"use client";
import { useLocale, useTranslations } from "next-intl";
import { historicalLaborSummary, type HistoricalLaborDisplay } from "@/lib/finance-historical-labor";
import { formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { formatDateOnly } from "@/lib/utils";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { Panel } from "@/components/ui/panel";

export function HistoricalLaborSection({ periods, from, to, currency, projectId, recognizedProject }: {
  periods: HistoricalLaborDisplay[]; from: string; to: string; currency: FinanceCurrency; projectId?: string; recognizedProject?: string | null;
}) {
  const t = useTranslations("Finance.historicalLabor"), locale = useLocale();
  const summary = historicalLaborSummary(periods, from, to, currency.minor_units, projectId);
  const selected = periods.filter(period => period.periodEnd >= from && period.periodEnd <= to && (!projectId || period.projectIds.includes(projectId)));
  const money = (value: string | null) => value === null ? "—" : `${formatFinanceAmount(value, currency, locale, "decimal")} ${currency.code}`;
  const issue = (code: string) => t.has(`issue.${code}`) ? t(`issue.${code}`) : t("missingInput");
  return <Panel data-testid="historical-labor" className="space-y-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5">
    <div><h3 className="font-semibold">{t("title")}</h3><p className="mt-1 text-xs leading-5 text-[var(--ui-text-secondary)]">{t("help")}</p></div>
    {!summary.periods ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("noData")}</p> : <>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {!projectId ? <div><dt className="text-xs text-[var(--ui-text-muted)]">{t("knownStudio")}</dt><dd className="mt-1 font-semibold tabular-nums">{money(summary.knownStudio)}</dd></div> : null}
        <div><dt className="text-xs text-[var(--ui-text-muted)]">{t("recognized")}</dt><dd className="mt-1 font-semibold tabular-nums">{money(projectId ? recognizedProject ?? null : summary.recognized)}</dd></div>
        <div><dt className="text-xs text-[var(--ui-text-muted)]">{t(projectId ? "calculatedProject" : "calculated")}</dt><dd data-testid="historical-calculated-cost" className="mt-1 font-semibold tabular-nums">{money(summary.known)}</dd></div>
        {!projectId ? <div><dt className="text-xs text-[var(--ui-text-muted)]">{t("unattributed")}</dt><dd className="mt-1 font-semibold tabular-nums">{money(summary.unattributed)}</dd></div> : null}
      </dl>
      <p className="text-xs text-[var(--ui-text-secondary)]">{t("coverage", { periods: summary.periods, completed: summary.completedDays, required: summary.requiredDays })}</p>
      {summary.incomplete ? <p role="status" className="text-xs text-[var(--ui-warning-text)]">{t("partial")} {summary.issues.map(issue).join(" · ")}</p> : null}
      <AnimatedDisclosure title={t("sources")}><ul className="space-y-3 py-2 text-xs">{selected.map(period => <li key={period.sourceKey} className="space-y-1">
        <p className="font-medium">{period.label} · {formatDateOnly(period.periodStart, locale)} – {formatDateOnly(period.periodEnd, locale)}</p>
        <p className="text-[var(--ui-text-secondary)]">{t("sourceSalary")}: {period.knownNative === null ? "—" : `${period.knownNative} ${period.currency ?? ""}`}</p>
        {period.issues.length ? <p className="text-[var(--ui-warning-text)]">{period.issues.map(issue).join(" · ")}</p> : null}
      </li>)}</ul></AnimatedDisclosure>
    </>}
  </Panel>;
}
