import "server-only";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { forecastFxSchema, forecastOptionsSchema, forecastReportSchema, forecastSnapshotSchema, snapshotComparisonSchema, type ForecastFx, type ForecastReport } from "@/lib/finance-forecast";

export async function getFinanceForecast(options: { horizon?: string; scenario?: string }, year: number, manualFx: ForecastFx = [], snapshotId?: string) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const parsed = forecastOptionsSchema.parse(options);
  const client = await createClient();
  const [settings, budget, history, snapshots, saved] = await Promise.all([
    client.from("finance_settings").select("*").eq("studio_id", admin.studio_id).maybeSingle(),
    client.from("finance_current_budget").select("*").eq("studio_id", admin.studio_id).eq("year", year).order("category_id"),
    client.from("finance_budget_revisions").select("*").eq("studio_id", admin.studio_id).eq("year", year).order("created_at", { ascending: false }).limit(100),
    client.from("finance_forecast_snapshots").select("id,name,created_at").eq("studio_id", admin.studio_id).order("created_at", { ascending: false }).limit(50),
    snapshotId ? client.from("finance_forecast_snapshots").select("*").eq("studio_id", admin.studio_id).eq("id", snapshotId).maybeSingle() : null,
  ]);
  const error = settings.error ?? budget.error ?? history.error ?? snapshots.error ?? saved?.error;
  if (error) throw new Error("Unable to load cash planning.", { cause: error });
  if (!settings.data?.finalized_at) return { report: null, budget: budget.data ?? [], history: history.data ?? [], snapshots: snapshots.data ?? [], saved: null };
  // First calculate without FX: its complete issue list discovers currencies without a Data API row cap.
  const raw = await client.rpc("calculate_finance_forecast", { p_studio_id: admin.studio_id, p_horizon: parsed.horizon, p_scenario: parsed.scenario, p_fx: [] });
  if (raw.error) throw new Error("Unable to calculate forecast.", { cause: raw.error });
  const initial = forecastReportSchema.parse(raw.data);
  const fx = await resolveForecastAssumptions(initial, manualFx);
  const calculated = fx.length ? await client.rpc("calculate_finance_forecast", { p_studio_id: admin.studio_id, p_horizon: parsed.horizon, p_scenario: parsed.scenario, p_fx: fx }) : raw;
  if (calculated.error) throw new Error("Unable to value forecast.", { cause: calculated.error });
  const compared = saved?.data ? await client.rpc("compare_finance_forecast_snapshot", { p_studio_id: admin.studio_id, p_snapshot_id: saved.data.id }) : null;
  if (compared?.error) throw new Error("Unable to compare forecast snapshot.", { cause: compared.error });
  return {
    report: forecastReportSchema.parse(calculated.data), budget: budget.data ?? [], history: history.data ?? [], snapshots: snapshots.data ?? [],
    saved: saved?.data ? { ...saved.data, forecast: forecastSnapshotSchema.parse(saved.data.forecast), comparison: snapshotComparisonSchema.parse(compared?.data) } : null,
  };
}
export type FinanceForecastData = NonNullable<Awaited<ReturnType<typeof getFinanceForecast>>>;

export async function resolveForecastAssumptions(initial: ForecastReport, manualFx: ForecastFx = [], extraCurrencies: string[] = []) {
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
