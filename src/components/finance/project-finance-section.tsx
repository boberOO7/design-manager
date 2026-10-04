import { getFinanceManagement } from "@/data/queries/finance-management";
import { ProjectResultWorkspace } from "./project-result-workspace";
import { getFinanceProjectCash } from "@/data/queries/finance-project-cash";
import { projectFinanceTab, projectProfitPeriod } from "@/lib/finance-project-view";
import { z } from "zod";
import { notFound } from "next/navigation";
import { getFinanceData, getFinancePlanning, getFinanceProject } from "@/data/queries/finance";
import { getKyivDateOnly } from "@/lib/validation/project";
import { projectStreams } from "@/lib/finance-projects";
import { ProjectTripsSection } from "./project-trips-section";
import { ProjectFinanceWorkspace } from "./project-finance-workspace";
import { getFinanceDisplayCurrency } from "@/data/queries/finance-display-currency";
import { getFinanceDisplayRate } from "@/data/queries/finance-overview";
import { projectContractSummary } from "@/lib/finance-project-view";

export async function ProjectFinanceSection({ projectId, query }: { projectId: string; query: Partial<Record<"stream" | "page" | "credits" | "filter" | "profitFrom" | "profitTo" | "financeTab" | "profitPeriod" | "item", string | string[]>> }) {
  const pageNumber = (value: string | string[] | undefined) => typeof value === "string" && /^\d+$/.test(value) ? Math.max(1, Math.min(100_000, Number(value))) : 1;
  const page = pageNumber(query.page), creditPage = pageNumber(query.credits);
  const tab = projectFinanceTab(query.financeTab ?? (query.profitFrom || query.profitTo ? "result" : undefined), query.stream);
  const period = projectProfitPeriod(query.profitPeriod, query.profitFrom, query.profitTo);
  const stream = tab === "expenses" ? "expenses" : projectStreams.find(v => v !== "expenses" && v === query.stream) ?? "design";
  const itemId = z.uuid().safeParse(query.item).data;
  const today = getKyivDateOnly();
  const filter = "all";
  const [foundation, project, planning, displayCurrency] = await Promise.all([getFinanceData(), getFinanceProject(projectId), tab === "result" ? null : getFinancePlanning(page, creditPage, filter, projectId, stream, "all", today, itemId), getFinanceDisplayCurrency()]);
  if (!foundation || !project || (tab !== "result" && !planning)) notFound();
  const currency = foundation.currencies.find(v => v.code === foundation.settings?.base_currency);
  const displayUnit = foundation.currencies.find(v => v.code === displayCurrency);
  const contractual = project.totals.filter(total => total.stream === "design");
  const displayRates: Record<string, string | null> = {};
  await Promise.all([...new Set(contractual.flatMap(total => total.currency ? [total.currency] : []))].map(async code => {
    try { displayRates[code] = code === displayCurrency ? "1" : await getFinanceDisplayRate(code, displayCurrency, today); }
    catch { displayRates[code] = null; }
  }));
  const summaryRows = contractual.flatMap(total => total.currency && total.contract_amount !== null ? [{
    currency: total.currency, gross: total.contract_gross_amount ?? total.contract_amount,
    paid: total.collected_amount, closed: total.closed_amount,
  }] : []);
  const summary = displayUnit && summaryRows.length === contractual.length ? projectContractSummary(summaryRows, displayRates, displayUnit.minor_units) : null;
  const start = foundation.settings?.recognition_start_month ?? today;
  const from = period === "all" ? start : period === "month" ? `${today.slice(0, 7)}-01` : period === "year" ? `${today.slice(0, 4)}-01-01` : query.profitFrom;
  const [management, cash] = await Promise.all([
    tab === "result" ? getFinanceManagement({ report: "projects", project: projectId, from, to: period === "custom" ? query.profitTo : today }) : null,
    tab === "payments" ? getFinanceProjectCash(projectId) : null,
  ]);
  return <ProjectFinanceWorkspace {...foundation} planning={planning} displayCurrency={displayCurrency} summary={summary} project={project} stream={stream} tab={tab} today={today} page={page} creditPage={creditPage} filter={filter} itemId={itemId}
    cashData={cash}>
    {management ? <ProjectResultWorkspace key={management.version} data={management} projectId={projectId} period={period}/> : null}
    {tab === "expenses" && currency ? <ProjectTripsSection projectId={projectId} currency={currency}/> : null}
  </ProjectFinanceWorkspace>;
}
