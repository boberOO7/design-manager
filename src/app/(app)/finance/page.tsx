import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getFinanceData } from "@/data/queries/finance";
import { getFinanceDisplayOverview, getFinanceOverview } from "@/data/queries/finance-overview";
import { getFinanceManagement } from "@/data/queries/finance-management";
import { getFinanceDisplayCurrency } from "@/data/queries/finance-display-currency";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { FinanceOverviewCash } from "@/components/finance/finance-overview";
import { FinanceAnalyticsSection } from "@/components/finance/finance-analytics";
import { DisplayCurrencySelect } from "@/components/finance/display-currency-select";
import { PageHeader } from "@/components/shared/page-header";
import { parseFinanceReportParams } from "@/lib/finance-overview";
import { buildFinanceAnalytics, financeAnalyticsPeriod } from "@/lib/finance-analytics";
import { getKyivDateOnly } from "@/lib/validation/project";
import { InstaLoadReady } from "@/components/shared/instaload-motion";
import { FinanceCurrencyLoading, FinanceOverviewLoading, FinanceSectionLoading } from "@/components/finance/finance-overview-loading";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Finance.overview"); return { title: t("title") };
}
async function Unavailable({ cash = false }: { cash?: boolean }) {
  const t = await getTranslations("Finance.overview.analytics");
  return <section role="status" className="py-6 text-sm text-[var(--ui-text-secondary)]"><p>{t(cash ? "cashFailed" : "analyticsFailed")}</p><Link href={cash ? "/finance/planning" : "/finance/reports"} className="inline-flex min-h-11 items-center underline underline-offset-4">{t(cash ? "forecast" : "report")}</Link></section>;
}
async function Analytics({ period, today }: { period: ReturnType<typeof parseFinanceReportParams>["period"]; today: string }) {
  const scope = financeAnalyticsPeriod(period, today);
  try {
    const data = await getFinanceManagement(scope);
    if (!data) return <Unavailable/>;
    return <InstaLoadReady key={data.currency.code} name="finance-analytics" className="instaload-panel [--instaload-reveal-duration:200ms]"><div data-instaload-arrival="finance-analytics"><FinanceAnalyticsSection data={buildFinanceAnalytics(data, scope.from, scope.to)} currency={data.currency}/></div></InstaLoadReady>;
  } catch (error) { console.error("Finance analytics unavailable", error); return <Unavailable/>; }
}
async function Cash({ context, foundation }: { context: ReturnType<typeof parseFinanceReportParams>; foundation: NonNullable<Awaited<ReturnType<typeof getFinanceData>>> }) {
  try {
    const [source, currency] = await Promise.all([getFinanceOverview(context), getFinanceDisplayCurrency()]);
    if (!source) return <Unavailable cash/>;
    const data = await getFinanceDisplayOverview(source, currency);
    if (!data) return <Unavailable cash/>;
    return <InstaLoadReady key={currency} name="finance-cash" className="instaload-panel [--instaload-reveal-duration:200ms]"><div data-instaload-arrival="finance-cash"><FinanceOverviewCash source={source} data={data} currencies={foundation.currencies} invalidFx={context.invalidFx}/></div></InstaLoadReady>;
  } catch (error) { console.error("Finance cash outlook unavailable", error); return <Unavailable cash/>; }
}
async function CurrencyControl() {
  const currency = await getFinanceDisplayCurrency();
  return <DisplayCurrencySelect key={currency} value={currency}/>;
}
async function FinanceContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const foundation = await getFinanceData();
  if (!foundation) redirect("/dashboard");
  const today = getKyivDateOnly();
  if (!foundation.settings?.finalized_at) return <FinanceWorkspace {...foundation} today={today}/>;
  const params = await searchParams, context = parseFinanceReportParams(params, today);
  const t = await getTranslations("Finance.overview");
  const scope = financeAnalyticsPeriod(context.period, today);
  const analyticsAvailable = Boolean(foundation.settings.recognition_start_month && foundation.settings.recognition_start_month <= scope.to);
  const periodHref = (period: string) => {
    const next = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (typeof value === "string") next.set(key, value); });
    next.set("period", period); return `/finance?${next}`;
  };
  return <div className="w-full min-w-0 space-y-8" data-finance-shell="ready">
    <PageHeader title={t("title")} className="flex-wrap" action={<div className="flex flex-wrap items-center gap-3"><nav aria-label={t("actualPeriod")} className="flex flex-wrap gap-1">{(["month", "3", "year"] as const).map(period => <Link key={period} href={periodHref(period)} aria-current={context.period === period ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-[var(--ui-radius-control)] px-3 text-sm transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none ${context.period === period ? "bg-[var(--ui-surface-muted)] font-medium" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-subtle)]"}`}>{t(`periods.${period}`)}</Link>)}</nav><Suspense fallback={<FinanceCurrencyLoading/>}><CurrencyControl/></Suspense></div>}/>
    <Suspense key={`analytics-${context.period}`} fallback={<FinanceSectionLoading analyticsAvailable={analyticsAvailable}/>}><Analytics period={context.period} today={today}/></Suspense>
    <Suspense key={`cash-${context.period}-${context.options.horizon}-${context.options.scenario}`} fallback={<FinanceSectionLoading cash/>}><Cash context={context} foundation={foundation}/></Suspense>
  </div>;
}

export default function FinancePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<FinanceOverviewLoading/>}><FinanceContent {...props}/></Suspense>;
}
