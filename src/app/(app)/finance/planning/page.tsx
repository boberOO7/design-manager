import { redirect } from "next/navigation";
import { z } from "zod";
import { getFinanceData } from "@/data/queries/finance";
import { getFinanceForecast } from "@/data/queries/finance-forecast";
import { getFinanceDisplayOverview } from "@/data/queries/finance-overview";
import { getFinanceDisplayCurrency } from "@/data/queries/finance-display-currency";
import { parseFinanceReportParams } from "@/lib/finance-overview";
import { instantToDateOnly } from "@/lib/calendar";
import { FinanceCashPlanningWorkspace } from "@/components/finance/cash-planning-workspace";

export default async function FinanceCashPlanningPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const today = instantToDateOnly(new Date().toISOString());
  const year = z.coerce.number().int().min(1900).max(9998).catch(Number(today.slice(0, 4))).parse(params.year);
  const { options, fx, invalidFx } = parseFinanceReportParams(params, today);
  const [foundation, data, displayCurrency] = await Promise.all([
    getFinanceData(), getFinanceForecast(options, year, fx, z.uuid().optional().catch(undefined).parse(params.snapshot)), getFinanceDisplayCurrency(),
  ]);
  if (!foundation || !data) redirect("/dashboard");
  const displayOverview = params.mode !== "budget" && params.mode !== "history" && data.overview ? await getFinanceDisplayOverview(data.overview, displayCurrency) : null;
  return <FinanceCashPlanningWorkspace {...foundation} {...data} displayOverview={displayOverview} displayCurrency={displayCurrency} year={year} invalidFx={invalidFx} />;
}
