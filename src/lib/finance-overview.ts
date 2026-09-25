import { z } from "zod";
import { forecastFxSchema, forecastOptionsSchema, forecastReportSchema } from "./finance-forecast";
import { projectMoneyText } from "./finance-project-plan";

const money = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const point = z.object({ date: z.iso.date(), amount: money });
export const overviewPeriodSchema = z.enum(["month", "3", "year"]).catch("3");
export const financeOverviewSchema = z.object({
  forecast: forecastReportSchema, period: overviewPeriodSchema, actualFrom: z.iso.date(), upcomingThrough: z.iso.date(),
  historyIncomplete: z.boolean(), history: z.array(point.extend({ amount: money.nullable() })), projection: z.array(point), lowPoint: point,
  flows: z.array(z.object({ month: z.iso.date(), nature: z.enum(["operating", "financing", "owner_distribution"]), direction: z.enum(["incoming", "outgoing"]), amount: money })),
  netFlow: money, accounts: z.array(z.object({ id: z.uuid(), name: z.string(), currency: z.string(), native: money, amount: money.nullable() })),
  receivables: z.array(z.object({ id: z.uuid(), description: z.string(), currency: z.string(), native: money, amount: money.nullable(), dueDate: z.iso.date().nullable(), expectedDate: z.iso.date().nullable() })),
  receivableTotal: money, receivablesIncomplete: z.boolean(), outgoingTotal: money, outgoingIncomplete: z.boolean(),
  categories: z.array(z.object({ id: z.uuid().nullable(), name: z.string().nullable(), direction: z.enum(["incoming", "outgoing"]), nature: z.enum(["operating", "financing", "owner_distribution"]), budget: money.nullable(), actual: money, forecast: money, incomplete: z.boolean(), variance: money.nullable() })),
  requiredCurrencies: z.array(z.string()),
});
export type FinanceOverview = z.infer<typeof financeOverviewSchema>;

export function financeDashboardMonthSummary(data: {
  forecast: Pick<FinanceOverview["forecast"], "asOf" | "currency"> & { items: Array<Pick<FinanceOverview["forecast"]["items"][number], "direction" | "nature" | "date" | "reportingAmount">> };
  flows: FinanceOverview["flows"];
}) {
  const month = data.forecast.asOf.slice(0, 7);
  const amounts = [...data.forecast.items.map((item) => item.reportingAmount), ...data.flows.map((flow) => flow.amount)];
  const digits = Math.max(4, ...amounts.map((value) => value?.split(".")[1]?.length ?? 0));
  const scale = BigInt(10) ** BigInt(digits);
  const units = (value: string) => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
    const amount = BigInt(whole) * scale + BigInt(fraction.padEnd(digits, "0") || "0");
    return negative ? -amount : amount;
  };
  const inflows = data.forecast.items.filter((item) => item.direction === "incoming" && item.nature === "operating" && item.date?.slice(0, 7) === month);
  const expectedInflow = inflows.some((item) => item.reportingAmount === null) ? null
    : projectMoneyText(inflows.reduce((sum, item) => sum + units(item.reportingAmount ?? "0"), BigInt(0)), digits);
  const profit = data.flows.filter((flow) => flow.month.slice(0, 7) === month && flow.nature === "operating")
    .reduce((sum, flow) => sum + (flow.direction === "incoming" ? units(flow.amount) : -units(flow.amount)), BigInt(0));
  return { currency: data.forecast.currency, expectedInflow, profitAndLoss: projectMoneyText(profit, digits) };
}

// Crop canonical daily closing points for display; carry the last balance to the
// window edge without recalculating any cash or changing expected-item timing.
export function financeCashChartPoints(data: Pick<FinanceOverview, "history" | "projection"> & { forecast: Pick<FinanceOverview["forecast"], "asOf" | "cashBase" | "through"> }, through = data.forecast.through) {
  const projection = data.projection.filter(point => point.date <= through);
  const last = projection.at(-1);
  return [
    ...data.history.map(point => ({ ...point, kind: "actual" as const })),
    { date: data.forecast.asOf, amount: data.forecast.cashBase, kind: "forecast" as const },
    ...projection.map(point => ({ ...point, kind: "forecast" as const })),
    ...(last && last.date < through ? [{ date: through, amount: last.amount, kind: "forecast" as const }] : []),
  ];
}

export function parseFinanceReportParams(params: Record<string, string | string[] | undefined>, today: string) {
  const options = forecastOptionsSchema.safeParse(params);
  const manual = Object.entries(params).filter(([key, value]) => /^fx_[A-Z]{3}$/.test(key) && typeof value === "string" && value.trim()).map(([key, rate]) => ({ currency: key.slice(3), rate, source: "manual", effectiveDate: today }));
  const fx = forecastFxSchema.safeParse(manual);
  return { options: options.success ? options.data : forecastOptionsSchema.parse({}), fx: fx.success ? fx.data : [], invalidFx: !fx.success, period: overviewPeriodSchema.parse(params.period) };
}
