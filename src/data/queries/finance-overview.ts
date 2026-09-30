import "server-only";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { resolveForecastAssumptions } from "./finance-forecast";
import { financeOverviewSchema, type parseFinanceReportParams } from "@/lib/finance-overview";
import { cache } from "react";
import { z } from "zod";
import { resolveFinanceFx, resolveFinanceFxDates } from "@/lib/finance-fx";
import { projectFinanceDisplayReport } from "@/lib/finance-display-report";
import type { FinanceDisplayCurrency } from "@/lib/finance-display-currency";

export async function getFinanceOverview(context: ReturnType<typeof parseFinanceReportParams>) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const args = { p_studio_id: admin.studio_id, p_horizon: context.options.horizon, p_scenario: context.options.scenario, p_period: context.period };
  const raw = await client.rpc("get_finance_overview", { ...args, p_fx: [] });
  if (raw.error) throw new Error("Unable to load Finance Overview.", { cause: raw.error });
  const initial = financeOverviewSchema.parse(raw.data);
  const fx = await resolveForecastAssumptions(initial.forecast, context.fx, initial.requiredCurrencies);
  if (!fx.length) return initial;
  const valued = await client.rpc("get_finance_overview", { ...args, p_fx: fx });
  if (valued.error) throw new Error("Unable to value Finance Overview.", { cause: valued.error });
  return financeOverviewSchema.parse(valued.data);
}

export const getFinanceDisplayRate = cache(async (from: string, to: string, date: string) =>
  (await resolveFinanceFx(from, to, date, "nbu", "")).rate);

export async function getFinanceDisplayOverview(data: NonNullable<Awaited<ReturnType<typeof getFinanceOverview>>>, currency: FinanceDisplayCurrency) {
  if (data.forecast.currency === currency) return data;
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const [unit, openings] = await Promise.all([
    client.from("finance_currencies").select("minor_units").eq("code", currency).single(),
    client.from("finance_accounts").select("currency,opening_balance::text,opening_reporting_amount::text").eq("studio_id", admin.studio_id),
  ]);
  if (unit.error || openings.error || !unit.data) throw new Error("Unable to load display currency context.", { cause: unit.error ?? openings.error });
  const actuals: Array<{ financial_date: string; amount: string; category_id: string | null; direction: "incoming" | "outgoing"; nature: "operating" | "financing" | "owner_distribution" }> = [];
  const cashEffects: Array<{ financial_date: string; amount: string }> = [];
  for (let offset = 0; ; offset += 1000) {
    const [actualPage, cashPage] = await Promise.all([
      client.from("finance_planning_actuals").select("financial_date,amount::text,category_id,direction,nature").eq("studio_id", admin.studio_id).gte("financial_date", data.forecast.cutover).lte("financial_date", data.forecast.asOf).order("financial_date").range(offset, offset + 999),
      client.from("finance_cash_effects").select("financial_date,reporting_amount::text").eq("studio_id", admin.studio_id).gte("financial_date", data.forecast.cutover).lte("financial_date", data.forecast.asOf).order("financial_date").range(offset, offset + 999),
    ]);
    if (actualPage.error || cashPage.error || !actualPage.data || !cashPage.data) throw new Error("Unable to load historical Finance valuations.", { cause: actualPage.error ?? cashPage.error });
    actuals.push(...z.array(z.object({ financial_date: z.iso.date(), amount: z.string(), category_id: z.string().nullable(), direction: z.enum(["incoming", "outgoing"]), nature: z.enum(["operating", "financing", "owner_distribution"]) })).parse(actualPage.data));
    cashEffects.push(...z.array(z.object({ financial_date: z.iso.date(), reporting_amount: z.string() })).parse(cashPage.data).map(row => ({ financial_date: row.financial_date, amount: row.reporting_amount })));
    if (actualPage.data.length < 1000 && cashPage.data.length < 1000) break;
  }
  const openingAmounts = (openings.data ?? []).flatMap(account => {
    const value = account.currency === data.forecast.currency ? account.opening_balance : account.opening_reporting_amount;
    return value === null || value === "0" ? [] : [value];
  });
  const dates = new Set([...cashEffects.map(row => row.financial_date), ...actuals.map(row => row.financial_date), ...(openingAmounts.length ? [data.forecast.cutover] : [])]);
  const [currentRate, datedRates] = await Promise.all([
    getFinanceDisplayRate(data.forecast.currency, currency, data.forecast.asOf),
    resolveFinanceFxDates(data.forecast.currency, currency, [...dates]),
  ]);
  return projectFinanceDisplayReport(data, currency, unit.data.minor_units, currentRate, datedRates, cashEffects, actuals, openingAmounts);
}
