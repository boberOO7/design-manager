import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getFinanceData } from "@/data/queries/finance";
import { getFinanceDisplayOverview, getFinanceOverview } from "@/data/queries/finance-overview";
import { getFinanceOverviewCashAnalysis, getFinanceOverviewPayments } from "@/data/queries/finance-overview-dashboard";
import { getFinanceOverviewProjectEconomics } from "@/data/queries/finance-overview-economics";
import { OverviewProjectEconomics } from "@/components/finance/overview-project-economics";
import { getFinanceDisplayCurrency } from "@/data/queries/finance-display-currency";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { FinanceOverviewCash } from "@/components/finance/finance-overview";
import { DisplayCurrencySelect } from "@/components/finance/display-currency-select";
import { PageHeader } from "@/components/shared/page-header";
import { parseFinanceReportParams } from "@/lib/finance-overview";
import type { OverviewPayment } from "@/lib/finance-overview-dashboard";
import { getKyivDateOnly } from "@/lib/validation/project";
import { InstaLoadReady } from "@/components/shared/instaload-motion";
import { FinanceCurrencyLoading, FinanceEconomicsLoading, FinanceOverviewLoading, FinanceSectionLoading } from "@/components/finance/finance-overview-loading";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Finance.overview"); return { title: t("title") };
}
async function Unavailable() {
  const t = await getTranslations("Finance.overview.dashboard");
  return <section role="status" className="space-y-2 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] p-5 text-sm text-[var(--ui-text-secondary)]"><p>{t("loadFailed")}</p><div className="flex flex-wrap gap-5"><Link href="/finance" className="inline-flex min-h-11 items-center underline underline-offset-4">{t("retry")}</Link><Link href="/finance/movements" className="inline-flex min-h-11 items-center underline underline-offset-4">{t("openMovements")}</Link></div></section>;
}
async function Cash({ context, foundation }: {
  context: ReturnType<typeof parseFinanceReportParams>; foundation: NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
}) {
  try {
    const [source, displayCurrency] = await Promise.all([getFinanceOverview(context), getFinanceDisplayCurrency()]);
    if (!source) return <Unavailable/>;
    const currency = foundation.currencies.find(unit => unit.code === displayCurrency);
    const base = foundation.currencies.find(unit => unit.code === source.forecast.currency);
    if (!currency || !base) return <Unavailable/>;
    const [data, payments, cashAnalysis] = await Promise.all([
      getFinanceDisplayOverview(source, displayCurrency),
      getFinanceOverviewPayments(source, currency, base.minor_units).catch((error): OverviewPayment[] | null => {
        console.error("Finance Overview payments unavailable", error);
        return null;
      }),
      getFinanceOverviewCashAnalysis(source, currency).catch(error => {
        console.error("Finance Overview monthly cash unavailable", error);
        return null;
      }),
    ]);
    if (!data) return <Unavailable/>;
    return <InstaLoadReady key={displayCurrency} name="finance-cash" className="instaload-panel [--instaload-reveal-duration:200ms]"><div data-instaload-arrival="finance-cash"><FinanceOverviewCash source={source} data={data} payments={payments} monthlyCash={cashAnalysis?.months ?? null} comparison={cashAnalysis?.comparison ?? null} currencies={foundation.currencies}/></div></InstaLoadReady>;
  } catch (error) { console.error("Finance Overview unavailable", error); return <Unavailable/>; }
}
async function ProjectEconomics() {
  const t = await getTranslations("Finance.overview.economics");
  try {
    const data = await getFinanceOverviewProjectEconomics();
    if (!data) throw new Error("Project economics unavailable");
    return <InstaLoadReady key={data.currency.code} name="finance-economics" className="instaload-panel"><div data-instaload-arrival="finance-economics"><OverviewProjectEconomics data={data}/></div></InstaLoadReady>;
  } catch (error) {
    console.error("Finance project economics unavailable", error);
    return <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5"><h2 className="text-lg font-semibold">{t("title")}</h2><p role="status" className="mt-2 text-sm text-[var(--ui-text-secondary)]">{t("failed")}</p></section>;
  }
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
  const params = await searchParams;
  // Keep the existing report context for balances and expected-payment diagnostics.
  const context = parseFinanceReportParams({ ...params, period: params.period ?? "month", horizon: "6" }, today);
  const t = await getTranslations("Finance.overview");
  return <div className="w-full min-w-0 space-y-5" data-finance-shell="ready">
    <PageHeader title={t("title")} className="flex-wrap" action={<Suspense fallback={<FinanceCurrencyLoading/>}><CurrencyControl/></Suspense>}/>
    <Suspense key={`cash-${context.period}-${context.options.scenario}`} fallback={<FinanceSectionLoading/>}><Cash context={context} foundation={foundation}/></Suspense>
    <Suspense fallback={<FinanceEconomicsLoading/>}><ProjectEconomics/></Suspense>
  </div>;
}
export default function FinancePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<FinanceOverviewLoading/>}><FinanceContent {...props}/></Suspense>;
}
