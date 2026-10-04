import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { getFinanceData } from "./finance";
import { getFinanceDisplayCurrency } from "./finance-display-currency";
import { resolveFinanceFxDates } from "@/lib/finance-fx";
import { convertFinanceDisplayAmount } from "@/lib/finance-display-report";
import { scenarioWorkspaceSchema, type ScenarioReport } from "@/lib/finance-scenarios";
export async function getFinanceScenarios(params: Record<string, string | string[] | undefined>) {
  const admin = await getActiveStudioAdmin();if (!admin) return null;
  const horizon = z.enum(["6","12"]).catch("6").parse(params.scenarioHorizon);
  const baseId = z.uuid().optional().catch(undefined).parse(params.scenarioBase);
  const client = await createClient();
  const [foundation, displayCurrency, response] = await Promise.all([getFinanceData(),getFinanceDisplayCurrency(),client.rpc("get_finance_scenario_workspace",{p_studio_id:admin.studio_id,p_base_id:baseId,p_horizon:horizon})]);
  if (!foundation) return null;
  if (response.error) throw new Error("Unable to load saved scenarios.",{cause:response.error});
  const workspace = scenarioWorkspaceSchema.parse(response.data);
  const currency = foundation.currencies.find(unit => unit.code === displayCurrency);
  if (!currency) throw new Error("Unsupported display currency.");
  let displayFx: string | null = null;
  if (workspace.baseline) {
    try { displayFx = (await resolveFinanceFxDates(workspace.baseline.currency,displayCurrency,[workspace.baseline.asOf])).get(workspace.baseline.asOf) ?? null; }
    catch { /* Preserve the base report; UI/export expose unresolved display FX. */ }
  }
  const convert = (report: ScenarioReport | null) => {
    if (!report || !displayFx || report.currency === displayCurrency) return report;
    const amount = (value:string) => convertFinanceDisplayAmount(value,displayFx,currency.minor_units);
    return {...report,currency:displayCurrency,cashBase:amount(report.cashBase),months:report.months.map(row=>({...row,remaining:amount(row.remaining),closing:amount(row.closing)})),
      daily:report.daily.map(row=>({...row,amount:amount(row.amount)})),lowPoint:report.lowPoint?{...report.lowPoint,amount:amount(report.lowPoint.amount)}:null,
      items:report.items.map(row=>({...row,reportingAmount:row.reportingAmount===null?null:amount(row.reportingAmount)})),
      comparisons:report.comparisons.map(row=>({...row,actual:row.actual===null?null:amount(row.actual),full_period:row.full_period===null?null:amount(row.full_period),remaining:amount(row.remaining),budget:row.budget===null?null:amount(row.budget)}))};
  };
  const version = createHash("sha256").update(JSON.stringify({raw:response.data,displayCurrency,displayFx,horizon})).digest("hex");
  return {workspace:{...workspace,baseline:convert(workspace.baseline),scenarios:workspace.scenarios.map(row=>({...row,report:convert(row.report)}))},displayCurrency,currency,version,horizon,displayFx};
}
export type FinanceScenarioData = NonNullable<Awaited<ReturnType<typeof getFinanceScenarios>>>;

import { forecastReportSchema, type ForecastFx } from "@/lib/finance-forecast";
import { resolveForecastAssumptions } from "./finance-forecast";
export async function getFinanceScenarioCapture(options:{scenario?:string},manualFx:ForecastFx) {
  const admin=await getActiveStudioAdmin();if(!admin)return null;
  const client=await createClient(),scenario=z.enum(["confirmed","planned"]).catch("confirmed").parse(options.scenario);
  const settings=await client.from("finance_settings").select("finalized_at").eq("studio_id",admin.studio_id).maybeSingle();
  if(settings.error)throw new Error("Unable to load Finance setup.",{cause:settings.error});
  if(!settings.data?.finalized_at)return {report:null,overview:null,budget:[],history:[],snapshots:[],saved:null};
  const response=await client.rpc("get_finance_forecast_capture_preview",{p_studio_id:admin.studio_id,p_scenario:scenario,p_fx:[]});
  if(response.error)throw new Error("Unable to preview scenario capture.",{cause:response.error});
  const initial=forecastReportSchema.parse(response.data),fx=await resolveForecastAssumptions(initial,manualFx);
  const valued=fx.length?await client.rpc("get_finance_forecast_capture_preview",{p_studio_id:admin.studio_id,p_scenario:scenario,p_fx:fx}):response;
  if(valued.error)throw new Error("Unable to value scenario capture.",{cause:valued.error});
  return {report:forecastReportSchema.parse(valued.data),overview:null,budget:[],history:[],snapshots:[],saved:null};
}
