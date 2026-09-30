import { notFound } from "next/navigation";
import { getFinanceData, getFinancePlanning, getFinanceProject, getFinanceProjectRecordedRates } from "@/data/queries/finance";
import { getKyivDateOnly } from "@/lib/validation/project";
import { projectStreams } from "@/lib/finance-projects";
import { ProjectTripsSection } from "./project-trips-section";
import { ProjectFinanceWorkspace } from "./project-finance-workspace";
import { getFinanceDisplayCurrency } from "@/data/queries/finance-display-currency";
import { getFinanceDisplayRate } from "@/data/queries/finance-overview";
import { convertFinanceDisplayAmount } from "@/lib/finance-display-report";

export async function ProjectFinanceSection({ projectId, query }: { projectId: string; query: Partial<Record<"stream" | "page" | "credits" | "filter", string | string[]>> }) {
  const pageNumber = (value: string | string[] | undefined) => typeof value === "string" && /^\d+$/.test(value) ? Math.max(1, Math.min(100_000, Number(value))) : 1;
  const page = pageNumber(query.page), creditPage = pageNumber(query.credits);
  const stream = projectStreams.find((v) => v === query.stream) ?? "design";
  const filter = "all";
  const [foundation, project, planning, displayCurrency] = await Promise.all([getFinanceData(), getFinanceProject(projectId), getFinancePlanning(page, creditPage, filter, projectId, stream), getFinanceDisplayCurrency()]);
  if (!foundation || !project || !planning) notFound();
  const currency = foundation.currencies.find(v => v.code === foundation.settings?.base_currency);
  const displayUnit = foundation.currencies.find(v => v.code === displayCurrency);
  const baseUnit = foundation.currencies.find(v => v.code === foundation.settings?.base_currency);
  const convertible = project.totals.filter(total => total.stream === stream && total.currency !== null && total.currency !== displayCurrency);
  const recordedRates = displayUnit && convertible.length ? await getFinanceProjectRecordedRates(projectId, stream) : new Map<string, { rate: string; date: string; base: string }>();
  const conversions: Record<string, { gross: string | null; net: string | null }> = {};
  if (displayUnit) await Promise.all(convertible.map(async total => {
    if (!total.currency) return;
    try {
      const recorded = recordedRates.get(total.currency);
      const useRecorded = recorded && baseUnit && recorded.base === baseUnit.code;
      const rate = useRecorded
        ? recorded.base === displayCurrency ? "1" : await getFinanceDisplayRate(recorded.base, displayCurrency, recorded.date)
        : await getFinanceDisplayRate(total.currency, displayCurrency, getKyivDateOnly());
      const convert = (amount: string | null) => {
        if (amount === null) return null;
        const valued = useRecorded ? convertFinanceDisplayAmount(amount, recorded.rate, baseUnit.minor_units) : amount;
        return convertFinanceDisplayAmount(valued, rate, displayUnit.minor_units);
      };
      conversions[total.currency] = {
        gross: convert(total.contract_gross_amount ?? total.contract_amount),
        net: convert(total.contract_net_amount ?? total.contract_amount),
      };
    } catch { conversions[total.currency] = { gross: null, net: null }; }
  }));
  return <><ProjectFinanceWorkspace {...foundation} {...planning} displayCurrency={displayCurrency} conversions={conversions} project={project} stream={stream} today={getKyivDateOnly()} page={page} creditPage={creditPage} filter={filter}/>{stream === "expenses" && currency ? <ProjectTripsSection projectId={projectId} currency={currency}/> : null}</>;
}
