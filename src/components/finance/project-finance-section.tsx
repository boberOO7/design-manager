import { getFinanceManagement } from "@/data/queries/finance-management";
import { ProjectResultWorkspace } from "./project-result-workspace";
import { getFinanceProjectCash } from "@/data/queries/finance-project-cash";
import { projectFinanceTab, projectProfitPeriod, projectContractSummary, scopeProjectFinance } from "@/lib/finance-project-view";
import { z } from "zod";
import { notFound } from "next/navigation";
import { getFinanceData, getFinancePlanning, getFinanceProject } from "@/data/queries/finance";
import { getKyivDateOnly } from "@/lib/validation/project";
import { projectStreams } from "@/lib/finance-projects";
import { ProjectTripsSection } from "./project-trips-section";
import { ProjectFinanceWorkspace } from "./project-finance-workspace";
import { getFinanceDisplayCurrency } from "@/data/queries/finance-display-currency";
import { getFinanceDisplayRate } from "@/data/queries/finance-overview";
import { parseProjectOrderDraft } from "@/lib/finance-project-orders";

export async function ProjectFinanceSection({ projectId, query, directionId, projectHref }: { projectId: string; directionId?: string | null; projectHref?: string; query: Partial<Record<"stream" | "page" | "credits" | "filter" | "profitFrom" | "profitTo" | "financeTab" | "profitPeriod" | "item", string | string[]>> }) {
  const pageNumber = (value: string | string[] | undefined) => typeof value === "string" && /^\d+$/.test(value) ? Math.max(1, Math.min(100_000, Number(value))) : 1;
  const page = pageNumber(query.page), creditPage = pageNumber(query.credits);
  const tab = projectFinanceTab(query.financeTab ?? (query.profitFrom || query.profitTo ? "result" : undefined), query.stream);
  const period = projectProfitPeriod(query.profitPeriod, query.profitFrom, query.profitTo);
  const stream = directionId ? "design" : tab === "expenses" ? "expenses" : projectStreams.find(v => v !== "expenses" && v === query.stream) ?? "design";
  const itemId = z.uuid().safeParse(query.item).data;
  const today = getKyivDateOnly(), filter = "all";
  const [foundation, project, displayCurrency] = await Promise.all([getFinanceData(), getFinanceProject(projectId, directionId ?? undefined), getFinanceDisplayCurrency()]);
  if (!foundation || !project || (directionId && !project.directions.some(direction => direction.id === directionId))) notFound();
  const scoped = directionId ? scopeProjectFinance(project, directionId, foundation.currencies) : project;
  const from = period === "all" ? undefined : period === "month" ? `${today.slice(0, 7)}-01` : period === "year" ? `${today.slice(0, 4)}-01-01` : query.profitFrom;
  const [planning, management, cash] = await Promise.all([
    tab === "result" || (directionId && tab !== "payments") ? null : getFinancePlanning(page, creditPage, filter, projectId, stream, "all", today, itemId, undefined, undefined, directionId ? scoped.orders.map(order => order.id) : undefined),
    !directionId && tab === "result" ? getFinanceManagement({ scope: period === "all" ? "lifetime" : undefined, report: "projects", project: projectId, from, to: period === "custom" ? query.profitTo : today }) : null,
    !directionId && tab === "payments" ? getFinanceProjectCash(projectId) : null,
  ]);
  if (tab !== "result" && (!directionId || tab === "payments") && !planning) notFound();
  const currency = foundation.currencies.find(v => v.code === foundation.settings?.base_currency);
  const displayUnit = foundation.currencies.find(v => v.code === displayCurrency);
  const displayRates: Record<string, string | null> = {};
  const nativeCurrencies = new Set([
    ...project.totals.map(total => total.currency), ...project.terms.map(term => term.currency),
    ...project.orders.map(order => parseProjectOrderDraft(order.draft_plan, projectId, order.id)?.currency),
    ...foundation.accounts.map(account => account.currency), ...(planning?.items.map(item => item.currency) ?? []), foundation.settings?.base_currency,
  ].filter((code): code is string => Boolean(code)));
  await Promise.all([...nativeCurrencies].map(async code => {
    try { displayRates[code] = code === displayCurrency ? "1" : await getFinanceDisplayRate(code, displayCurrency, today); }
    catch { displayRates[code] = null; }
  }));
  const contractual = scoped.totals.filter(total => total.stream === "design");
  const summaryRows = contractual.flatMap(total => total.currency && total.contract_amount !== null ? [{ currency: total.currency, gross: total.contract_gross_amount ?? total.contract_amount, paid: total.collected_amount, closed: total.closed_amount }] : []);
  const summary = displayUnit && summaryRows.length === contractual.length ? projectContractSummary(summaryRows, displayRates, displayUnit.minor_units) : null;
  const display = displayUnit ? { currency: displayUnit, rates: displayRates } : undefined;
  return <ProjectFinanceWorkspace {...foundation} planning={planning} displayCurrency={displayCurrency} display={display} summary={summary} project={scoped} allProject={project} directionId={directionId ?? undefined} projectHref={projectHref} stream={stream} tab={tab} today={today} page={page} creditPage={creditPage} filter={filter} itemId={itemId} cashData={cash}>
    {management ? <ProjectResultWorkspace key={management.version} data={management} projectId={projectId} period={period}/> : null}
    {!directionId && tab === "expenses" && currency ? <ProjectTripsSection projectId={projectId} currency={currency} display={display}/> : null}
  </ProjectFinanceWorkspace>;
}
