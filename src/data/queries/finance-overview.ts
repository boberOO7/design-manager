import "server-only";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { resolveForecastAssumptions } from "./finance-forecast";
import { financeOverviewSchema, type parseFinanceReportParams } from "@/lib/finance-overview";

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
