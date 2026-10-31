import { Suspense } from "react";
import { ProjectFinanceBodyBlueprint } from "./project-finance-loading";
import { projectWorkspaceSurfaceKey } from "@/lib/project-workspace-navigation";
import { getFinanceManagement } from "@/data/queries/finance-management";
import { ProjectResultWorkspace } from "./project-result-workspace";
import { getFinanceProjectCash } from "@/data/queries/finance-project-cash";
import { resolveProjectFinanceView, projectProfitPeriod, projectContractSummary, scopeProjectFinance } from "@/lib/finance-project-view";
import { z } from "zod";
import { notFound } from "next/navigation";
import { getFinanceData, getFinancePlanning, getFinanceProject } from "@/data/queries/finance";
import { getKyivDateOnly } from "@/lib/validation/project";
import { ProjectTripsSection } from "./project-trips-section";
import { ProjectFinanceWorkspace } from "./project-finance-workspace";
import { getFinanceDisplayCurrency } from "@/data/queries/finance-display-currency";
import { getFinanceDisplayRate } from "@/data/queries/finance-overview";
import { parseProjectOrderDraft } from "@/lib/finance-project-orders";

export async function ProjectFinanceSection({ projectId, query, directionId, projectHref }: { projectId: string; directionId?: string | null; projectHref?: string; query: Partial<Record<"stream" | "page" | "credits" | "filter" | "profitFrom" | "profitTo" | "financeTab" | "profitPeriod" | "item", string | string[]>> }) {
  const pageNumber = (value: string | string[] | undefined) => typeof value === "string" && /^\d+$/.test(value) ? Math.max(1, Math.min(100_000, Number(value))) : 1;
  const page = pageNumber(query.page), creditPage = pageNumber(query.credits);
  const { tab, stream } = resolveProjectFinanceView(query, directionId);
  const period = projectProfitPeriod(query.profitPeriod, query.profitFrom, query.profitTo);
  const itemId = z.uuid().safeParse(query.item).data;
  const today = getKyivDateOnly(), filter = "all";
  const from = period === "all" ? undefined : period === "month" ? `${today.slice(0, 7)}-01` : period === "year" ? `${today.slice(0, 4)}-01-01` : query.profitFrom;
  const needsPlanning = tab !== "result" && (!directionId || tab === "payments");
  // Whole-project planning has no dependency on the project/header payload.
  const planningRead = needsPlanning && !directionId ? getFinancePlanning(page, creditPage, filter, projectId, stream, "all", today, itemId) : null;
  const management = !directionId && tab === "result" ? getFinanceManagement({ scope: period === "all" ? "lifetime" : undefined, report: "projects", project: projectId, from, to: period === "custom" ? query.profitTo : today }) : null;
  const cash = !directionId && tab === "payments" ? getFinanceProjectCash(projectId) : undefined;
  for (const pending of [planningRead, management, cash]) void pending?.catch(() => {});
  const [foundation, project, displayCurrency] = await Promise.all([getFinanceData(), getFinanceProject(projectId, directionId ?? undefined), getFinanceDisplayCurrency()]);
  if (!foundation || !project || (directionId && !project.directions.some(direction => direction.id === directionId))) notFound();
  const scoped = directionId ? scopeProjectFinance(project, directionId, foundation.currencies) : project;
  const planning = planningRead ?? (needsPlanning ? getFinancePlanning(page, creditPage, filter, projectId, stream, "all", today, itemId, undefined, undefined, scoped.orders.map(order => order.id)) : null);
  void planning?.catch(() => {});
  const currency = foundation.currencies.find(v => v.code === foundation.settings?.base_currency);
  const displayUnit = foundation.currencies.find(v => v.code === displayCurrency);
  const rateRequests = new Map<string, Promise<string | null>>();
  const ratesFor = (codes: Iterable<string>) => Promise.all([...new Set(codes)].map(async code => {
    let pending = rateRequests.get(code);
    if (!pending) {
      pending = code === displayCurrency ? Promise.resolve("1") : getFinanceDisplayRate(code, displayCurrency, today).catch(() => null);
      rateRequests.set(code, pending);
    }
    return [code, await pending] as const;
  })).then(entries => Object.fromEntries(entries));
  const nativeCurrencies = new Set([
    ...project.totals.map(total => total.currency), ...project.terms.map(term => term.currency),
    ...project.orders.map(order => parseProjectOrderDraft(order.draft_plan, projectId, order.id)?.currency),
    ...foundation.accounts.map(account => account.currency), project.nextPayment?.currency, foundation.settings?.base_currency,
  ].filter((code): code is string => Boolean(code)));
  const headerRates = ratesFor(nativeCurrencies);
  const planningContent = planning?.then(async data => {
    if (!data) notFound();
    const rates = await ratesFor([...nativeCurrencies, ...data.items.flatMap(item => item.currency ? [item.currency] : [])]);
    return { data, display: displayUnit ? { currency: displayUnit, rates } : undefined };
  }) ?? null;
  void planningContent?.catch(() => {});
  const displayRates = await headerRates;
  const contractual = scoped.totals.filter(total => total.stream === "design");
  const summaryRows = contractual.flatMap(total => total.currency && total.contract_amount !== null ? [{ currency: total.currency, gross: total.contract_gross_amount ?? total.contract_amount, paid: total.collected_amount, closed: total.closed_amount }] : []);
  const summary = displayUnit && summaryRows.length === contractual.length ? projectContractSummary(summaryRows, displayRates, displayUnit.minor_units) : null;
  const display = displayUnit ? { currency: displayUnit, rates: displayRates } : undefined;
  return <ProjectFinanceWorkspace {...foundation} planning={planningContent} surfaceKey={projectWorkspaceSurfaceKey({ view: "finance", directionId: directionId ?? null }, query)} displayCurrency={displayCurrency} display={display} summary={summary} project={scoped} allProject={project} directionId={directionId ?? undefined} projectHref={projectHref} stream={stream} tab={tab} today={today} page={page} creditPage={creditPage} filter={filter} itemId={itemId} cashPending={cash}>
    {management ? <Suspense fallback={<ProjectFinanceBodyBlueprint tab="result"/>}><ProjectResultStream pending={management} projectId={projectId} period={period}/></Suspense> : null}
    {!directionId && tab === "expenses" && currency ? <Suspense fallback={<div data-project-loading="finance" className="instaload-blueprint h-20 w-full rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)]"/>}><ProjectTripsSection projectId={projectId} currency={currency} display={display}/></Suspense> : null}
  </ProjectFinanceWorkspace>;
}

async function ProjectResultStream({ pending, projectId, period }: { pending: ReturnType<typeof getFinanceManagement>; projectId: string; period: ReturnType<typeof projectProfitPeriod> }) {
  const data = await pending;
  return data ? <ProjectResultWorkspace key={data.version} data={data} projectId={projectId} period={period}/> : null;
}
