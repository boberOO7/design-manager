import type { FinanceOverview } from "./finance-overview";
import { financeAmountText, financeAmountUnits } from "./finance";

type DatedAmount = { financial_date: string; amount: string | null };
type Actual = DatedAmount & { category_id: string | null; direction: "incoming" | "outgoing"; nature: "operating" | "financing" | "owner_distribution" };

// Rates follow the same units-per-one convention as resolveFinanceFx.
export function convertFinanceDisplayAmount(value: string, rate: string, digits = 2): string {
  const [whole, fraction = ""] = rate.split(".");
  const rateUnits = BigInt(whole + fraction);
  const scale = BigInt(10) ** BigInt(fraction.length);
  const source = financeAmountUnits(value, 4) * rateUnits;
  const divisor = BigInt(10) ** BigInt(4 - digits) * scale;
  const rounded = (source < BigInt(0) ? -BigInt(1) : BigInt(1)) * ((source < BigInt(0) ? -source : source) + divisor / BigInt(2)) / divisor;
  return financeAmountText(rounded, digits);
}

function sum(values: string[], digits: number): string {
  return financeAmountText(values.reduce((total, value) => total + financeAmountUnits(value, digits), BigInt(0)), digits);
}

function completeSum(values: (string | null)[], digits: number): string | null {
  return values.some(value => value === null) ? null : sum(values.filter((value): value is string => value !== null), digits);
}

export function projectFinanceDisplayReport(data: FinanceOverview, currency: string, digits: number, currentRate: string, historicalRates: ReadonlyMap<string, string>, cashEffects: DatedAmount[], actuals: Actual[], openingAmounts: string[]): FinanceOverview {
  if (currency === data.forecast.currency) return data;
  const current = (value: string) => convertFinanceDisplayAmount(value, currentRate, digits);
  const historical = (row: DatedAmount) => {
    if (row.amount === null) return null;
    const rate = historicalRates.get(row.financial_date);
    if (!rate) throw new Error(`Missing historical FX for ${row.financial_date}`);
    return convertFinanceDisplayAmount(row.amount, rate, digits);
  };
  const convertedActuals = actuals.map(row => ({ ...row, converted: historical(row) }));
  const openingRate = historicalRates.get(data.forecast.cutover);
  if (openingAmounts.length && !openingRate) throw new Error("Missing historical opening FX");
  const opening = sum(openingAmounts.map(amount => convertFinanceDisplayAmount(amount, openingRate ?? "1", digits)), digits);
  const history = data.history.map(point => ({ ...point, amount: point.amount === null ? null : completeSum([opening, ...cashEffects.filter(row => row.financial_date >= data.forecast.cutover && row.financial_date <= point.date).map(historical)], digits) }));
  const flows = data.flows.map(flow => ({ ...flow, amount: completeSum(convertedActuals.filter(row => row.financial_date.slice(0, 7) === flow.month.slice(0, 7) && row.nature === flow.nature && row.direction === flow.direction).map(row => row.converted), digits) }));
  const cashBase = current(data.forecast.cashBase);
  const items = data.forecast.items.map(item => ({ ...item, reportingAmount: item.reportingAmount === null ? null : current(item.reportingAmount) }));
  const comparisons = data.forecast.comparisons.map(row => {
    const actual = completeSum(convertedActuals.filter(item => item.financial_date.slice(0, 7) === row.month.slice(0, 7) && item.category_id === row.category_id && item.nature === row.nature && item.direction === row.direction).map(item => item.converted), digits);
    const remaining = current(row.remaining);
    return { ...row, actual, remaining, full_period: completeSum([actual, remaining], digits), budget: row.budget === null ? null : current(row.budget) };
  });
  const forecast = { ...data.forecast, currency, cashBase, items, comparisons,
    months: data.forecast.months.map(month => ({ ...month, remaining: current(month.remaining), closing: current(month.closing) })) };
  const projection = data.projection.map(point => ({ ...point, amount: current(point.amount) }));
  const categories = data.categories.map(category => {
    const rows = comparisons.filter(row => row.category_id === category.id && row.nature === category.nature && row.direction === category.direction);
    const actual = completeSum(rows.map(row => row.actual), digits);
    const forecastAmount = completeSum(rows.map(row => row.full_period), digits);
    const budget = category.budget === null ? null : sum(rows.flatMap(row => row.budget === null ? [] : [row.budget]), digits);
    return { ...category, actual, forecast: forecastAmount, budget, variance: budget === null ? null : completeSum([forecastAmount, budget.startsWith("-") ? budget.slice(1) : `-${budget}`], digits) };
  });
  return { ...data, forecast, history, projection, flows, categories,
    lowPoint: { ...data.lowPoint, amount: current(data.lowPoint.amount) },
    netFlow: completeSum(flows.map(flow => flow.amount === null ? null : flow.direction === "incoming" ? flow.amount : flow.amount.startsWith("-") ? flow.amount.slice(1) : `-${flow.amount}`), digits),
    accounts: data.accounts.map(account => ({ ...account, amount: account.amount === null ? null : current(account.amount) })),
    receivables: data.receivables.map(item => ({ ...item, amount: item.amount === null ? null : current(item.amount) })),
    receivableTotal: current(data.receivableTotal), outgoingTotal: current(data.outgoingTotal) };
}
