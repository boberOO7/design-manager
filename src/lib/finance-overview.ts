import { z } from "zod";
import { forecastFxSchema, forecastOptionsSchema, forecastReportSchema } from "./finance-forecast";

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

export function parseFinanceReportParams(params: Record<string, string | string[] | undefined>, today: string) {
  const options = forecastOptionsSchema.safeParse(params);
  const manual = Object.entries(params).filter(([key, value]) => /^fx_[A-Z]{3}$/.test(key) && typeof value === "string" && value.trim()).map(([key, rate]) => ({ currency: key.slice(3), rate, source: "manual", effectiveDate: today }));
  const fx = forecastFxSchema.safeParse(manual);
  return { options: options.success ? options.data : forecastOptionsSchema.parse({}), fx: fx.success ? fx.data : [], invalidFx: !fx.success, period: overviewPeriodSchema.parse(params.period) };
}
