import { redirect } from "next/navigation";
import { z } from "zod";
import { getFinanceData } from "@/data/queries/finance";
import { getFinanceForecast } from "@/data/queries/finance-forecast";
import { forecastFxSchema, forecastOptionsSchema } from "@/lib/finance-forecast";
import { instantToDateOnly } from "@/lib/calendar";
import { FinanceCashPlanningWorkspace } from "@/components/finance/cash-planning-workspace";

export default async function FinanceCashPlanningPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const today = instantToDateOnly(new Date().toISOString());
  const year = z.coerce.number().int().min(1900).max(9998).catch(Number(today.slice(0, 4))).parse(params.year);
  const options = forecastOptionsSchema.safeParse(params);
  const manual = Object.entries(params).filter(([key, value]) => /^fx_[A-Z]{3}$/.test(key) && typeof value === "string" && value.trim()).map(([key, rate]) => ({ currency: key.slice(3), rate, source: "manual", effectiveDate: today }));
  const fx = forecastFxSchema.safeParse(manual);
  const [foundation, data] = await Promise.all([
    getFinanceData(), getFinanceForecast(options.success ? options.data : {}, year, fx.success ? fx.data : [], z.uuid().optional().catch(undefined).parse(params.snapshot)),
  ]);
  if (!foundation || !data) redirect("/dashboard");
  return <FinanceCashPlanningWorkspace {...foundation} {...data} year={year} invalidFx={!fx.success} />;
}
