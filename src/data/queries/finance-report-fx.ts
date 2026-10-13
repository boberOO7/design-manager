import "server-only";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { forecastFxSchema, type ForecastFx, type ForecastReport } from "@/lib/finance-forecast";

export async function resolveForecastAssumptions(initial: Pick<ForecastReport, "asOf" | "currency" | "items" | "issues">, manualFx: ForecastFx = [], extraCurrencies: string[] = []) {
  const today = initial.asOf;
  const fx = forecastFxSchema.parse(manualFx).filter(row => row.currency !== initial.currency);
  const needed = [...new Set([...extraCurrencies, ...initial.items.filter(item => item.reportingAmount === null).map(item => item.currency), ...initial.issues.filter(issue => issue.reason === "missing_fx").map(issue => issue.currency)])];
  const rates = await Promise.all(needed.filter(currency => !fx.some(row => row.currency === currency)).map(async currency => {
    if (initial.currency !== "UAH") return null;
    try {
      const rate = await resolveFinanceFx(currency, initial.currency, today, "nbu", "");
      return { currency, rate: rate.rate, source: "nbu" as const, effectiveDate: rate.effectiveDate };
    } catch { return null; } // Unavailable rates remain explicit report issues; never fall back to zero/old FX.
  }));
  fx.push(...rates.filter(rate => rate !== null));
  return fx;
}
