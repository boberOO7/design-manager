import { financeAmountText, financeAmountUnits } from "./finance";
import { buildProjectProfitability, proportionalAmount } from "./finance-profitability";

type ProjectProfitability = ReturnType<typeof buildProjectProfitability>[number];
export type OverviewProjectMetadata = { id: string; status: string; area: string | null };

/** Contract contribution, using canonical project costs; this is not recognized P&L. */
export function buildOverviewProjectEconomics(projects: ProjectProfitability[], metadata: OverviewProjectMetadata[], internalProjectId: string | null, digits: number) {
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
    const costComplete = finished && project.finalMargin !== null && project.agreed.complete
      && project.estimateDisplay.remaining_direct !== null && project.estimateDisplay.remaining_labor !== null
      && financeAmountUnits(project.estimateDisplay.remaining_direct, digits) === BigInt(0)
      && financeAmountUnits(project.estimateDisplay.remaining_labor, digits) === BigInt(0);
    const costs = costComplete ? financeAmountText(financeAmountUnits(project.lifetime.directCost, digits) + financeAmountUnits(project.lifetime.labor, digits), digits) : null;
    const contribution = costs === null ? null : financeAmountText(financeAmountUnits(contract, digits) - financeAmountUnits(costs, digits), digits);
    const margin = contribution === null ? null : proportionalAmount("100.00", financeAmountUnits(contribution, digits), financeAmountUnits(contract, digits), 2);
    return [{ id: project.projectId, name: project.name, contract, costs, contribution, margin, area: positiveArea, completed: finished }];
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
    highlights: { mostExpensive: byPrice[0] ?? null, leastExpensive: byPrice.at(-1) ?? null, highestMargin: byMargin[0] ?? null, lowestMargin: byMargin.at(-1) ?? null },
    projects: byPrice,
  };
}
export type OverviewProjectEconomics = ReturnType<typeof buildOverviewProjectEconomics>;
