import { financeAmountText, financeAmountUnits } from "@/lib/finance";
import { getFinanceManagement } from "@/data/queries/finance-management";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { laborSourceIssues } from "@/lib/finance-labor";
import { financeCsv } from "@/lib/finance-csv";
import { managementCoverageIssues, summarizeManagementEntries } from "@/lib/finance-management";

export async function GET(request: Request) {
  if (!await getActiveStudioAdmin()) return new Response(null, { status: 403 });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const data = await getFinanceManagement(params);
  if (!data) return new Response(null, { status: 403 });
  if (params.version !== data.version) return new Response("Report changed. Refresh before exporting.", { status: 409 });
  const { filters, currency } = data;
  const rows = filters.projectId ? data.projectRows.filter(e => e.project_id === filters.projectId) : data.amountRows;
  if (filters.mode === "projects") {
    const selected = data.projectProfitability.filter(row => !filters.projectId || row.projectId === filters.projectId);
    const output: Array<Array<string | null>> = [["basis", "Recognized project result / explicit cash attribution", "from", filters.from, "to", filters.to, "currency", currency.code, "version", data.version],
      ["project_id", "project", "scope", "agreed_net_reference", "agreed_gross_reference", "contract_reference_date", "revenue", "direct_cost", "trip_subset", "labor", "known_result", "known_margin_percent", "received_gross", "missing_fx", "coverage_gaps", "history_incomplete", "labor_incomplete", "direct_budget", "labor_budget", "remaining_direct", "remaining_labor", "final_margin_percent", "estimate_stale", "direct_budget_minus_actual", "labor_budget_minus_actual"]];
    for (const row of selected) for (const scope of ["period", "lifetime"] as const) {
      const totals = row[scope];
      output.push([row.projectId, row.name, scope, row.agreed.net, row.agreed.gross, row.agreed.referenceDate, totals.revenue, totals.directCost, totals.tripCost, totals.labor, totals.result, totals.margin,
        row.received[scope], String(totals.missingFx), String(row.coverageGaps), String(row.historyIncomplete), String(row.laborIncomplete), row.estimateDisplay.direct_budget,
        row.estimateDisplay.labor_budget, row.estimateDisplay.remaining_direct, row.estimateDisplay.remaining_labor, row.finalMargin, String(row.estimateStale), row.budgetVariance.direct, row.budgetVariance.labor]);
    }
    const studio = summarizeManagementEntries(data.amountRows, filters.from, filters.to, currency.minor_units), projects = summarizeManagementEntries(data.projectRows, filters.from, filters.to, currency.minor_units);
    output.push(["reconciliation", "project_results", projects.knownResult, "studio_result", studio.knownResult, "studio_and_unallocated", financeAmountText(financeAmountUnits(studio.knownResult, currency.minor_units) - financeAmountUnits(projects.knownResult, currency.minor_units), currency.minor_units)],
      ["source_entry", "allocation_pool", "project", "date", "classification", "attributed_display_amount"]);
    output.push(...data.projectRows.filter(row => (!filters.projectId || row.project_id === filters.projectId) && row.recognized_on >= filters.from && row.recognized_on <= filters.to).map(row => [row.source_entry_id, row.allocation_id, row.project_id, row.recognized_on, row.classification, row.display_amount]));
    output.push(["cash_source", "project", "date", "native_share", "native_currency", "display_share", "fx_rate", "fx_source", "fx_date", "revision", "reason"],
      ...data.cash.filter(row => (!filters.projectId || row.project_id === filters.projectId) && row.financial_date >= filters.from && row.financial_date <= filters.to).map(row => [row.movement_id,row.project_id,row.financial_date,row.amount,row.currency,row.display_amount,row.fx_rate,row.fx_source,row.fx_effective_date,String(row.revision),row.reason]));
    return new Response(financeCsv(output), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="project-profitability-${filters.from}-${filters.to}.csv"`, "Cache-Control": "no-store" } });
  }
  const summary = summarizeManagementEntries(rows, filters.from, filters.to, currency.minor_units);
  const gaps = managementCoverageIssues(data.coverage, filters.from, filters.to, filters.projectId ?? null);
  const available = Boolean(data.settings?.recognition_start_month && filters.to >= data.settings.recognition_start_month);
  const output: Array<Array<string | null>> = [
    ["basis", "Management recognition", "from", filters.from, "to", filters.to, "currency", currency.code],
    ["version", data.version, "coverage_gaps", String(gaps.length), "missing_fx", String(summary.missingFx)],
    ["labor_cost_status", "known_confirmed_components", "labor_issues", String(laborSourceIssues(data.labor.sources, filters.from, filters.to).length + data.labor.missingPeriods.filter(period => period.periodStart <= filters.to && period.periodEnd >= filters.from).length)],
    ["pending_trip_sources", String(data.tripSources.filter(source => source.date >= filters.from && source.date <= filters.to && (!filters.projectId || source.projectId === filters.projectId)).length)],
    ["recognition_start", data.settings?.recognition_start_month ?? "", "history_status", !data.settings?.recognition_start_month || filters.from < data.settings.recognition_start_month ? "incomplete" : "since_activation"],
    ["classification", "known_amount", "missing_fx"],
    ...Object.entries(summary.totals).map(([classification, total]) => [classification, available ? total.known : null, String(total.missingFx)]),
    ["known_operating_result", available ? summary.knownResult : null],
  ];
  if (filters.compareFrom && filters.compareTo) {
    const comparison = summarizeManagementEntries(rows, filters.compareFrom, filters.compareTo, currency.minor_units);
    const available = data.settings?.recognition_start_month && filters.compareTo >= data.settings.recognition_start_month;
    output.push(["comparison_from", filters.compareFrom, "comparison_to", filters.compareTo, "history_status", !available ? "unavailable" : filters.compareFrom < (data.settings?.recognition_start_month ?? "") ? "partial" : "since_activation", "coverage_gaps", String(managementCoverageIssues(data.coverage, filters.compareFrom, filters.compareTo, filters.projectId ?? null).length)],
      ...Object.entries(comparison.totals).map(([classification, total]) => [classification, available ? total.known : null, String(total.missingFx)]), ["comparison_known_operating_result", available ? comparison.knownResult : null]);
  }
  output.push(["month", "revenue", "direct_cost", "labor", "overhead", "known_operating_result", "missing_fx"]);
  let month = `${filters.from.slice(0, 7)}-01`;
  while (month <= filters.to) {
    const next = new Date(`${month}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
    const last = new Date(next.getTime() - 86400000).toISOString().slice(0, 10);
    const total = summarizeManagementEntries(rows, month > filters.from ? month : filters.from, last < filters.to ? last : filters.to, currency.minor_units);
    output.push([month, ...[total.totals.revenue.known, total.totals.direct_cost.known, total.totals.labor.known, total.totals.overhead.known, total.knownResult].map(value => data.settings?.recognition_start_month && last >= data.settings.recognition_start_month ? value : null), String(total.missingFx)]);
    month = next.toISOString().slice(0, 10);
  }
  output.push(["source_id", "allocation_pool", "date", "period_start", "period_end", "classification", "description", "project_id", "source_native_net", "source_native_vat", "source_native_gross", "source_currency", "attributed_display_amount", "display_currency", "fx_rate", "fx_source", "fx_date", "reason"]);
  for (const row of summary.rows) {
    const e = data.entries.find(entry => entry.id === row.source_entry_id);
    if (e) output.push([e.id,row.allocation_id,e.recognized_on,e.period_start,e.period_end,e.classification,e.description,row.project_id,e.amount,e.vat_amount,e.gross_amount,e.currency,row.display_amount,currency.code,e.fx_rate,e.fx_source,e.fx_effective_date,e.reason]);
  }
  return new Response(financeCsv(output), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="management-pnl-${filters.from}-${filters.to}.csv"`, "Cache-Control": "no-store" } });
}
