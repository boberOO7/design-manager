import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getFinanceData } from "@/data/queries/finance";
import { getFinanceOverview } from "@/data/queries/finance-overview";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { FinanceOverviewWorkspace } from "@/components/finance/finance-overview";
import { parseFinanceReportParams } from "@/lib/finance-overview";
import { getKyivDateOnly } from "@/lib/validation/project";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Finance.overview");
  return { title: t("title") };
}
export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const foundation = await getFinanceData();
  if (!foundation) redirect("/dashboard");
  const today = getKyivDateOnly();
  if (!foundation.settings?.finalized_at) return <FinanceWorkspace {...foundation} today={today} />;
  const context = parseFinanceReportParams(await searchParams, today);
  const data = await getFinanceOverview(context);
  if (!data) redirect("/dashboard");
  return <FinanceOverviewWorkspace key={`${data.period}-${data.forecast.horizon}-${data.forecast.scenario}`} data={data} categories={foundation.categories} currencies={foundation.currencies} invalidFx={context.invalidFx} />;
}
