import { financeAmountText, financeAmountUnits } from "./finance";
import { buildProjectProfitability, proportionalAmount } from "./finance-profitability";
import { managementCoverageIssues, type ManagementAmountRow, type ReportCoverage } from "./finance-management";
import type { projectProvisionalLabor } from "./finance-labor";
import { overviewCostSubtotal } from "./finance-overview-costs";
import type { ProvisionalAmount } from "./finance-month-reporting";
import type { historicalLaborSummary } from "./finance-historical-labor";

type ProjectProfitability = ReturnType<typeof buildProjectProfitability>[number];
export type OverviewProjectMetadata = { id: string; status: string; area: string | null };
export type OverviewCostContext = {
  rows: ManagementAmountRow[];
  recorded: Array<{ projectId: string; amount: string | null }>;
  provisional: Array<{ projectId: string; lifetime: ReturnType<typeof projectProvisionalLabor> }>;
  pendingExpenses?: ProvisionalAmount[];
  historical?: Array<{ projectId: string; lifetime: ReturnType<typeof historicalLaborSummary> }>;
  recognitionStart: string | null; laborConfigured: boolean; today: string; coverage: ReportCoverage[];
};
export type EconomicsReason = "recognitionInactive" | "history" | "coverage" | "labor" | "laborSetup" | "fx" | "trips" | "estimate" | "remaining" | "contract" | "unfinished" | "recorded" | "provisional" | "review" | "expenses" | "historicalLabor";

/** Contract contribution, using canonical project costs; this is not recognized P&L. */
export function buildOverviewProjectEconomics(projects: ProjectProfitability[], metadata: OverviewProjectMetadata[], internalProjectId: string | null, digits: number, context?: OverviewCostContext) {
  const details = new Map(metadata.map(project => [project.id, project]));
  const clients = projects.filter(project => project.projectId !== internalProjectId && details.has(project.projectId) && details.get(project.projectId)?.status !== "cancelled");
  const completed = clients.filter(project => details.get(project.projectId)?.status === "completed");
  const priced = clients.flatMap(project => {
    const contract = project.agreed.net;
    if (contract === null || financeAmountUnits(contract, digits) <= BigInt(0)) return [];
    const area = details.get(project.projectId)?.area ?? null;
    const positiveArea = area !== null && financeAmountUnits(area, 4) > BigInt(0) ? area : null;
    // The existing final-margin gate checks FX, cost review/digest, coverage, trips and labor.
    // Completed projects with remaining costs are still provisional and cannot enter margin rankings.
    const finished = details.get(project.projectId)?.status === "completed";
    const recorded = overviewCostSubtotal((context?.recorded ?? []).filter(row => row.projectId === project.projectId).map(row => row.amount), digits);
    const provisional = context?.laborConfigured ? context.provisional.find(row => row.projectId === project.projectId)?.lifetime : undefined;
    const historical = context?.historical?.find(row => row.projectId === project.projectId)?.lifetime;
    const historicalCosts = historical?.hasUnrecognized ? historical.known : null;
    const provisionalCosts = provisional && provisional.periods > 0
      && (provisional.unknown === 0 || financeAmountUnits(provisional.known, digits) !== BigInt(0)) ? provisional.known : null;
    const pendingExpenses = (context?.pendingExpenses ?? []).filter(row => row.project_id === project.projectId
      && row.classification === "direct_cost" && row.recognized_on <= (context?.today ?? ""));
    const pendingExpenseCosts = overviewCostSubtotal(pendingExpenses.map(row => row.display_amount), digits);
    const costComplete = finished && project.finalMargin !== null && project.agreed.complete
      && recorded.count === 0 && pendingExpenses.length === 0 && (!provisional || provisional.periods === 0) && !historical?.hasUnrecognized
      && project.estimateDisplay.remaining_direct !== null && project.estimateDisplay.remaining_labor !== null
      && financeAmountUnits(project.estimateDisplay.remaining_direct, digits) === BigInt(0)
      && financeAmountUnits(project.estimateDisplay.remaining_labor, digits) === BigInt(0);
    const recognizedRows = context?.rows.filter(row => row.project_id === project.projectId && (row.classification === "direct_cost" || row.classification === "labor")
      && row.recognized_on <= context.today);
    const recognized = recognizedRows ? overviewCostSubtotal(recognizedRows.map(row => row.display_amount), digits) : null;
    const lifetimeCosts = financeAmountText(financeAmountUnits(project.lifetime.directCost, digits) + financeAmountUnits(project.lifetime.labor, digits), digits);
    const costs = costComplete ? lifetimeCosts : recognized ? recognized.amount : financeAmountUnits(lifetimeCosts, digits) !== BigInt(0) ? lifetimeCosts : null;
    // These sources are disjoint: trip history is excluded by source ownership,
    // labor is provisional only without recognized pools, and service candidates are ledger deltas.
    const knownCosts = overviewCostSubtotal([costs, recorded.amount, provisionalCosts, pendingExpenseCosts.amount, historicalCosts], digits).amount;
    const contribution = !costComplete ? null : financeAmountText(financeAmountUnits(contract, digits) - financeAmountUnits(lifetimeCosts, digits), digits);
    const margin = contribution === null ? null : proportionalAmount("100.00", financeAmountUnits(contribution, digits), financeAmountUnits(contract, digits), 2);
    const reasons: EconomicsReason[] = [];
    if (margin === null) {
      if (project.historyIncomplete) reasons.push("history");
      if (project.coverageGaps || (context?.recognitionStart && managementCoverageIssues(context.coverage, context.recognitionStart, context.today, project.projectId).length)) reasons.push("coverage");
      if (project.laborIncomplete || provisional?.unknown) reasons.push("labor");
      if (context && !context.laborConfigured) reasons.push("laborSetup");
      if (project.lifetime.missingFx || recorded.unknown || pendingExpenseCosts.unknown) reasons.push("fx");
      if (project.pendingTripCount) reasons.push("trips");
      if (!project.estimate || project.estimateStale || project.estimateDisplay.remaining_direct === null || project.estimateDisplay.remaining_labor === null) reasons.push("estimate");
      else if (financeAmountUnits(project.estimateDisplay.remaining_direct, digits) !== BigInt(0) || financeAmountUnits(project.estimateDisplay.remaining_labor, digits) !== BigInt(0)) reasons.push("remaining");
      if (!project.agreed.complete) reasons.push("contract");
      if (!finished) reasons.push("unfinished");
      if (recorded.count) reasons.push("recorded");
      if (provisional?.periods) reasons.push("provisional");
      if (pendingExpenses.length) reasons.push("expenses");
      if (historical?.hasUnrecognized) reasons.push("historicalLabor");
      if (!reasons.length) reasons.push("review");
    }
    return [{ id: project.projectId, name: project.name, contract, costs, knownCosts,
      pendingExpenseCosts: pendingExpenseCosts.amount, missingPendingExpenseFx: pendingExpenseCosts.unknown, pendingExpenseIncomplete: pendingExpenses.some(row => row.incomplete || row.display_amount === null), recordedCosts: recorded.amount, recordedCount: recorded.count,
      provisionalCosts, historicalCosts, historicalIncomplete: historical?.incomplete ?? false,
      historicalIssues: historical?.issues ?? [], costsIncomplete: !costComplete, missingRecognizedFx: recognized?.unknown ?? 0, missingRecordedFx: recorded.unknown,
      provisionalIncomplete: (provisional?.unknown ?? 0) > 0, reasons, contribution, margin, area: positiveArea, completed: finished }];
  });
  const sum = (values: string[]) => financeAmountText(values.reduce((total, value) => total + financeAmountUnits(value, digits), BigInt(0)), digits);
  const byPrice = [...priced].sort((a, b) => {
    const difference = financeAmountUnits(b.contract, digits) - financeAmountUnits(a.contract, digits);
    return difference === BigInt(0) ? a.id.localeCompare(b.id) : difference > BigInt(0) ? 1 : -1;
  });
  const costed = priced.filter((project): project is typeof project & { costs: string; contribution: string; margin: string } => project.costs !== null && project.contribution !== null && project.margin !== null);
  const byMargin = [...costed].sort((a, b) => {
    const difference = financeAmountUnits(b.contribution, digits) * financeAmountUnits(a.contract, digits)
      - financeAmountUnits(a.contribution, digits) * financeAmountUnits(b.contract, digits);
    return difference === BigInt(0) ? a.id.localeCompare(b.id) : difference > BigInt(0) ? 1 : -1;
  });
  const withArea = priced.filter((project): project is typeof project & { area: string } => project.area !== null);
  const costedWithArea = costed.filter((project): project is typeof project & { area: string } => project.area !== null);
  const perArea = (values: Array<{ amount: string; area: string }>) => values.length ? proportionalAmount(sum(values.map(row => row.amount)), BigInt(10000),
    values.reduce((total, row) => total + financeAmountUnits(row.area, 4), BigInt(0)), digits) : null;
  return {
    averageContract: priced.length ? proportionalAmount(sum(priced.map(project => project.contract)), BigInt(1), BigInt(priced.length), digits) : null,
    averageMargin: costed.length ? proportionalAmount("100.00", financeAmountUnits(sum(costed.map(project => project.contribution)), digits), financeAmountUnits(sum(costed.map(project => project.contract)), digits), 2) : null,
    contractPerArea: perArea(withArea.map(project => ({ amount: project.contract, area: project.area }))),
    contributionPerArea: perArea(costedWithArea.map(project => ({ amount: project.contribution, area: project.area }))),
    counts: { completed: completed.length, priced: priced.length, costed: costed.length, withArea: withArea.length, costedWithArea: costedWithArea.length },
    coverage: { recognized: priced.filter(project => project.costs !== null).length, recorded: priced.filter(project => project.recordedCount > 0).length,
      provisional: priced.filter(project => project.provisionalCosts !== null).length,
      reasons: [...new Set(priced.flatMap(project => project.reasons))] },
    highlights: { mostExpensive: byPrice.at(0) ?? null, leastExpensive: byPrice.at(-1) ?? null, highestMargin: byMargin.at(0) ?? null, lowestMargin: byMargin.at(-1) ?? null },
    projects: byPrice,
  };
}
export type OverviewProjectEconomics = ReturnType<typeof buildOverviewProjectEconomics>;
