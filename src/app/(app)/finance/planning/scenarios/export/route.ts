import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getFinanceScenarios } from "@/data/queries/finance-scenarios";
import { financeCsv } from "@/lib/finance-csv";
import { financeAmountText, financeAmountUnits } from "@/lib/finance";
export async function GET(request: Request) {
  if (!await getActiveStudioAdmin()) return new Response(null,{status:403});
  const params=Object.fromEntries(new URL(request.url).searchParams),data=await getFinanceScenarios(params);
  if (!data) return new Response(null,{status:403});
  if (params.version!==data.version) return new Response("Report changed. Refresh before exporting.",{status:409});
  const baseline=data.workspace.baseline;
  if (!baseline) return new Response("Capture a native-input base first.",{status:409});
  const resolved=baseline.currency===data.displayCurrency;
  const amount=(value:string, report:typeof baseline=baseline)=>resolved&&!report.riskIncomplete?value:null;
  const output:Array<Array<string|null>>=[["basis","Frozen cash forecast","base",data.workspace.base?.id??null,"as_of",baseline.asOf,"through",baseline.through,"currency",data.displayCurrency,"display_fx",data.displayFx,"version",data.version],
    ["scenario_id","scenario","revision","base","closing","minimum","minimum_date","first_deficit","incomplete","delta_closing"]];
  const reports=[{id:"base",name:data.workspace.base?.name??"Base",revision:0,report:baseline},...data.workspace.scenarios.filter(row=>row.report!==null).map(row=>({id:row.scenarioId,name:row.name,revision:row.revision,report:row.report}))];
  for (const row of reports) if(row.report){const report=row.report,closing=report.months.at(-1)?.closing??report.cashBase,baseClosing=baseline.months.at(-1)?.closing??baseline.cashBase;
    output.push([row.id,row.name,String(row.revision),data.workspace.base?.id??null,amount(closing,report),report.lowPoint?amount(report.lowPoint.amount,report):null,report.lowPoint?.date??null,report.firstDeficit,String(report.incomplete||!resolved),resolved&&!report.riskIncomplete&&!baseline.riskIncomplete?financeAmountText(financeAmountUnits(closing,data.currency.minor_units)-financeAmountUnits(baseClosing,data.currency.minor_units),data.currency.minor_units):null]);}
  output.push(["scenario_id","month","remaining","closing"]);
  for(const row of reports){const report=row.report;if(report)output.push(...report.months.map(month=>[row.id,month.month,amount(month.remaining,report),amount(month.closing,report)]));}
  output.push(["scenario_id","date","daily_closing"]);for(const row of reports){const report=row.report;if(report)output.push(...report.daily.map(day=>[row.id,day.date,amount(day.amount,report)]));}
  output.push(["scenario_id","assumption_id","type","explicit_assumption"]);for(const row of data.workspace.scenarios.filter(row=>row.report))output.push(...row.assumptions.map(a=>[row.scenarioId,a.id,a.type,JSON.stringify(a)]));
  output.push(["scenario_id","issue_source","issue_id","reason","native_currency","native_amount","date"]);for(const row of reports)if(row.report)output.push(...row.report.issues.map(issue=>[row.id,issue.source,issue.id,issue.reason,issue.currency,issue.amount,issue.date]));
  return new Response(financeCsv(output),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="forecast-scenarios-${baseline.asOf}-${data.horizon}.csv"`,"Cache-Control":"no-store"}});
}
