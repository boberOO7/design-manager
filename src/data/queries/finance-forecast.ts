import "server-only";
import { getFinanceOverview } from "./finance-overview";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { forecastOptionsSchema, forecastSnapshotSchema, snapshotComparisonSchema, type ForecastFx } from "@/lib/finance-forecast";

export async function getFinanceForecast(options: { horizon?: string; scenario?: string }, year: number, manualFx: ForecastFx = [], snapshotId?: string) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const parsed = forecastOptionsSchema.parse(options);
  const client = await createClient();
  const [settings, budget, history, snapshots, saved] = await Promise.all([
    client.from("finance_settings").select("*").eq("studio_id", admin.studio_id).maybeSingle(),
    client.from("finance_current_budget").select("*").eq("studio_id", admin.studio_id).eq("year", year).order("category_id"),
    client.from("finance_budget_revisions").select("*").eq("studio_id", admin.studio_id).eq("year", year).order("created_at", { ascending: false }).limit(100),
    client.from("finance_forecast_snapshots").select("id,name,created_at").eq("studio_id", admin.studio_id).order("capture_order", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(50),
    snapshotId ? client.from("finance_forecast_snapshots").select("*").eq("studio_id", admin.studio_id).eq("id", snapshotId).maybeSingle() : null,
  ]);
  const error = settings.error ?? budget.error ?? history.error ?? snapshots.error ?? saved?.error;
  if (error) throw new Error("Unable to load cash planning.", { cause: error });
  if (!settings.data?.finalized_at) return { report: null, overview: null, budget: budget.data ?? [], history: history.data ?? [], snapshots: snapshots.data ?? [], saved: null };
  const overview = await getFinanceOverview({ options: parsed, period: "3", fx: manualFx, invalidFx: false });
  if (!overview) return null;
  const compared = saved?.data && saved.data.capture_order !== null ? await client.rpc("compare_finance_forecast_snapshot", { p_studio_id: admin.studio_id, p_snapshot_id: saved.data.id }) : null;
  if (compared?.error) throw new Error("Unable to compare forecast snapshot.", { cause: compared.error });
  return {
    report: overview.forecast, overview, budget: budget.data ?? [], history: history.data ?? [], snapshots: snapshots.data ?? [],
    saved: saved?.data ? { ...saved.data, forecast: forecastSnapshotSchema.parse(saved.data.forecast), comparison: compared ? snapshotComparisonSchema.parse(compared.data) : null } : null,
  };
}
export type FinanceForecastData = NonNullable<Awaited<ReturnType<typeof getFinanceForecast>>>;

export { resolveForecastAssumptions } from "./finance-report-fx";
