import { financeAmountText, financeAmountUnits, formatFinanceAmount, type FinanceCurrency } from "./finance";
import { convertFinanceDisplayAmount } from "./finance-display-report";
import type { Database } from "@/types/database.types";
import type { FinanceProjectData } from "@/data/queries/finance";
import { projectStreams } from "./finance-projects";
import { projectAreaComponentsValue } from "./finance-project-plan";
import { areaComponentsSchema, directionEquivalentArea } from "./work-direction-components";

type PricingDirection = Pick<FinanceProjectData["directions"][number], "id" | "area_m2" | "complexity_coefficient"> & Partial<Pick<FinanceProjectData["directions"][number], "area_components" | "equivalent_area_m2">>;

export function nextProjectPayment<T extends Pick<Database["public"]["Views"]["finance_project_expected_balances"]["Row"], "order_id" | "expected_payment_date" | "due_date">>(items: readonly T[], confirmedOrderIds: readonly string[]): T | null {
  const confirmed = new Set(confirmedOrderIds);
  const outstanding = items.filter(item => item.order_id && confirmed.has(item.order_id));
  const dated = outstanding.filter(item => item.expected_payment_date || item.due_date);
  // Input already follows the saved order/schedule order, including date ties.
  return dated.sort((a, b) => (a.expected_payment_date ?? a.due_date ?? "").localeCompare(b.expected_payment_date ?? b.due_date ?? ""))[0] ?? outstanding[0] ?? null;
}

export function projectOrderPaymentProgress(total: Pick<FinanceProjectData["orderTotals"][number], "contract_gross_amount" | "contract_amount" | "collected_amount" | "closed_amount"> | undefined, digits: number) {
  const gross = total?.contract_gross_amount ?? total?.contract_amount;
  if (gross == null) return { state: "unpaid", percent: 0 } as const;
  const value = financeAmountUnits(gross, digits), paid = financeAmountUnits(total?.collected_amount ?? "0", digits), closed = financeAmountUnits(total?.closed_amount ?? "0", digits);
  if (value <= BigInt(0)) return { state: "unpaid", percent: 0 } as const;
  const state = paid >= value ? "paid" : paid + closed >= value ? "closed" : paid + closed > BigInt(0) ? "partial" : "unpaid";
  // Clamp only the visual bar; financial balances and overpayments remain untouched.
  return { state, percent: Math.min(100, Math.max(0, Number((paid + closed) * BigInt(10000) / value) / 100)) } as const;
}

export type ProjectFinanceDisplay = { currency: FinanceCurrency; rates: Record<string, string | null> };

// Localize the former built-in label without renaming stored financial records.
export function projectAgreementName(name: string, defaultName: string) {
  return ["Основне замовлення", "Main order"].includes(name) ? defaultName : name;
}

export function projectPricingArea(project: { directions: readonly PricingDirection[]; area: FinanceProjectData["area"] }, directionIds: readonly string[]) {
  if (directionIds.length > 1) return null;
  const direction = directionIds.length === 1
    ? project.directions.find(item => item.id === directionIds[0])
    : project.directions.length === 1 ? project.directions[0] : undefined;
  if (direction) {
    const components = projectPricingAreaComponents(project, directionIds, "");
    const area = components.length ? Number(projectAreaComponentsValue(components, "1", 4).area) : directionEquivalentArea(direction);
    // Match Finance's four-decimal area input precision.
    return area === null ? null : Number(area.toFixed(4));
  }
  return !directionIds.length && !project.directions.length ? project.area : null;
}

export function projectPricingAreaCalculation(project: Parameters<typeof projectPricingArea>[0], directionIds: readonly string[]) {
  if (directionIds.length > 1) return null;
  const direction = directionIds.length === 1 ? project.directions.find(item => item.id === directionIds[0])
    : project.directions.length === 1 ? project.directions[0] : undefined;
  if (areaComponentsSchema.safeParse(direction?.area_components).success) return null;
  return direction?.area_m2 != null && direction.area_m2 > 0 && direction.complexity_coefficient != null && direction.complexity_coefficient > 0
    ? { actualArea: String(direction.area_m2), coefficient: String(direction.complexity_coefficient) } : null;
}

export function projectPricingAreaComponents(project: Parameters<typeof projectPricingArea>[0], directionIds: readonly string[], primaryName: string) {
  if (directionIds.length > 1) return [];
  const direction = directionIds.length === 1 ? project.directions.find(item => item.id === directionIds[0])
    : project.directions.length === 1 ? project.directions[0] : undefined;
  const additional = areaComponentsSchema.safeParse(direction?.area_components).data;
  return direction && additional ? [{ name: primaryName, actualArea: String(direction.area_m2), coefficient: String(direction.complexity_coefficient) }, ...additional] : [];
}

// Shared agreements remain visible, but never enter a direction's own totals.
export function scopeProjectFinance<T extends Pick<FinanceProjectData, "orders" | "directionLinks" | "orderTotals" | "totals">>(project: T, directionId: string, currencies: readonly FinanceCurrency[]) {
  const linked = new Set(project.directionLinks.filter(link => link.direction_id === directionId).map(link => link.order_id));
  const own = new Set([...linked].filter(id => project.directionLinks.filter(link => link.order_id === id).length === 1));
  const orderTotals = project.orderTotals.filter(total => total.order_id !== null && linked.has(total.order_id));
  const totals = project.totals.filter(total => total.stream === "design" && orderTotals.some(order => order.order_id !== null && own.has(order.order_id) && order.currency === total.currency)).map(total => {
    const rows = orderTotals.filter(row => row.order_id !== null && own.has(row.order_id) && row.currency === total.currency);
    const digits = currencies.find(currency => currency.code === total.currency)?.minor_units;
    if (digits === undefined) throw new Error("Unknown agreement currency");
    const sum = (key: "contract_amount" | "contract_net_amount" | "contract_vat_amount" | "contract_gross_amount" | "scheduled_amount" | "collected_amount" | "closed_amount" | "outstanding_amount" | "planned_amount" | "unscheduled_amount" | "scheduled_net_amount" | "scheduled_vat_amount" | "collected_net_amount" | "collected_vat_amount") => financeAmountText(rows.reduce((value, row) => value + financeAmountUnits(row[key] ?? "0", digits), BigInt(0)), digits);
    return { ...total, contract_amount: sum("contract_amount"), contract_net_amount: sum("contract_net_amount"), contract_vat_amount: sum("contract_vat_amount"), contract_gross_amount: sum("contract_gross_amount"), scheduled_amount: sum("scheduled_amount"), collected_amount: sum("collected_amount"), closed_amount: sum("closed_amount"), outstanding_amount: sum("outstanding_amount"), planned_amount: sum("planned_amount"), unscheduled_amount: sum("unscheduled_amount"), scheduled_net_amount: sum("scheduled_net_amount"), scheduled_vat_amount: sum("scheduled_vat_amount"), collected_net_amount: sum("collected_net_amount"), collected_vat_amount: sum("collected_vat_amount") };
  });
  return { ...project, orders: project.orders.filter(order => linked.has(order.id)), orderTotals, totals };
}

// Current presentation valuation only; contractual and settlement values stay native.
export function formatProjectFinanceMoney(amount: string | number | null | undefined, native: FinanceCurrency | undefined, display: ProjectFinanceDisplay | undefined, locale: string): string {
  if (amount == null || !native) return "—";
  if (!display || native.code === display.currency.code) return formatFinanceAmount(amount, native, locale);
  const rate = display.rates[native.code];
  return rate ? `≈ ${formatFinanceAmount(convertFinanceDisplayAmount(String(amount), rate, display.currency.minor_units), display.currency, locale)}` : `— ${display.currency.code}`;
}

export function projectContractSummary(rows: readonly { currency: string; gross: string; paid: string; closed: string }[], rates: Record<string, string | null>, digits: number) {
  if (!rows.length || rows.some(row => !rates[row.currency])) return null;
  let gross = BigInt(0), paid = BigInt(0), closed = BigInt(0);
  for (const row of rows) {
    const rate = rates[row.currency];
    if (!rate) return null;
    gross += financeAmountUnits(convertFinanceDisplayAmount(row.gross, rate, digits), digits);
    paid += financeAmountUnits(convertFinanceDisplayAmount(row.paid, rate, digits), digits);
    closed += financeAmountUnits(convertFinanceDisplayAmount(row.closed, rate, digits), digits);
  }
  return { gross: financeAmountText(gross, digits), paid: financeAmountText(paid, digits), remaining: financeAmountText(gross - paid - closed, digits) };
}

export type ProjectFinanceTab = "payments" | "expenses" | "result";
export type ProjectProfitPeriod = "all" | "month" | "year" | "custom";

export function projectFinanceTab(tab: unknown, stream: unknown): ProjectFinanceTab {
  return tab === "payments" || tab === "expenses" || tab === "result" ? tab : stream === "expenses" ? "expenses" : "payments";
}

export function resolveProjectFinanceView(query: Partial<Record<"financeTab" | "stream" | "profitFrom" | "profitTo", string | string[]>>, directionId?: string | null) {
  const tab = projectFinanceTab(query.financeTab ?? (query.profitFrom || query.profitTo ? "result" : undefined), query.stream);
  const stream = directionId ? "design" : tab === "expenses" ? "expenses" : projectStreams.find(value => value !== "expenses" && value === query.stream) ?? "design";
  return { tab, stream };
}

export function projectProfitPeriod(period: unknown, from: unknown, to: unknown): ProjectProfitPeriod {
  return period === "all" || period === "month" || period === "year" || period === "custom" ? period : from || to ? "custom" : "all";
}

// Presentation of the agreement balance, never project-attributed cash or revenue.
export function projectAgreementRemaining(gross: string | null, matched: string | null, digits: number, closed = "0") {
  return gross === null || matched === null ? null : financeAmountText(financeAmountUnits(gross, digits) - financeAmountUnits(matched, digits) - financeAmountUnits(closed, digits), digits);
}
