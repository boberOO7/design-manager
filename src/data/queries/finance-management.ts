import "server-only";
// Initialize base Finance schemas before the derived reporting dependency cycle.
import { getFinanceData } from "./finance";
import { financialCalculationSchema, calculatedLaborAmounts, sourceCalculationAmounts } from "@/lib/finance-calculations";
import { financeMonthSchema } from "@/lib/finance-month-reporting";
import { convertFinanceDisplayAmount } from "@/lib/finance-display-report";
import { expenseAutomationSchema } from "@/lib/finance-expenses";
import { earningsReportSchema } from "@/lib/finance-earnings";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { getFinanceDisplayCurrency } from "./finance-display-currency";
import { createClient } from "@/lib/supabase/server";
import { resolveFinanceFxDates } from "@/lib/finance-fx";
import { recognitionEntrySchema, recognitionSourceSchema, reportCoverageSchema, managementAmountRows, managementDisplayEntries, parseManagementFilters } from "@/lib/finance-management";
import { hasProvisionalLabor, laborDataSchema, projectProvisionalLabor } from "@/lib/finance-labor";
import { tripRecognitionSourceSchema } from "@/lib/finance-trip-reporting";
import { projectReportingSchema, projectAmountRows, projectCashDisplayEvents, buildProjectProfitability } from "@/lib/finance-profitability";
import { historicalLaborDisplay, historicalLaborReportSchema, historicalLaborSummary } from "@/lib/finance-historical-labor";
import { financeAmountUnits } from "@/lib/finance";

const reportSchema = z.object({ months: z.array(financeMonthSchema), calculations: z.array(financialCalculationSchema).default([]), expenseAutomation: expenseAutomationSchema.default({ projects: [], policies: [], periods: [], candidates: [], missingFx: [] }), earnings: earningsReportSchema.default({recognitionStart:null,milestones:[],orders:[]}), asOf: z.iso.date(), recognitionStart: z.iso.date().nullable(), entries: z.array(recognitionEntrySchema),
  coverage: z.array(reportCoverageSchema), projects: z.array(z.object({ id: z.uuid(), name: z.string(), startsOn: z.iso.date().nullable() })),
  sources: z.array(recognitionSourceSchema), labor: laborDataSchema, tripSources: z.array(tripRecognitionSourceSchema), projectReporting: projectReportingSchema, historicalLabor: historicalLaborReportSchema });
export async function getFinanceManagement(params: Record<string, string | string[] | undefined>) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const [foundation, displayCurrency, response] = await Promise.all([getFinanceData(), getFinanceDisplayCurrency(), client.rpc("get_finance_management_reporting", { p_studio_id: admin.studio_id })]);
  if (!foundation) return null;
  if (response.error) throw new Error("Unable to load management report.", { cause: response.error });
  let report = reportSchema.parse(response.data);
  const historicalFx: Record<string, { rate: string; source: "nbu"; effectiveDate: string }> = {};
  await Promise.all([...new Map(report.historicalLabor.periods.filter(period => period.currency && period.reportingCurrency && period.currency !== period.reportingCurrency
    && !period.fx && period.remainingNative !== null && financeAmountUnits(period.remainingNative, 4) > BigInt(0)).map(period => [`${period.currency}:${period.periodEnd}`, period])).entries()].map(async ([key, period]) => {
    if (!period.currency || !period.reportingCurrency) return;
    try {
      const rate = (await resolveFinanceFxDates(period.currency, period.reportingCurrency, [period.periodEnd])).get(period.periodEnd);
      if (rate) historicalFx[key] = { rate, source: "nbu", effectiveDate: period.periodEnd };
    } catch { /* Historical native cost remains known; unavailable dated FX stays explicit. */ }
  }));
  // Rebuild the complete snapshot only when a newly resolved labor valuation changes it.
  if (Object.keys(historicalFx).length) {
    const valued = await client.rpc("get_finance_management_reporting", { p_studio_id: admin.studio_id, p_historical_fx: historicalFx });
    if (valued.error) throw new Error("Unable to load management report.", { cause: valued.error });
    report = reportSchema.parse(valued.data);
  }
  const today = report.asOf;
  const filters = parseManagementFilters(params, today);
  if (filters.lifetime) {
    const selectedProject = report.projects.find(project => project.id === filters.projectId);
    const dates = [...report.entries.filter(entry => !filters.projectId || entry.project_id === filters.projectId).map(entry => entry.recognized_on),
      ...report.calculations.filter(row => !filters.projectId || row.projectId === filters.projectId).map(row => row.date),
      ...report.historicalLabor.periods.filter(period => !filters.projectId || period.projectIds.includes(filters.projectId)).map(period => period.periodStart)];
    filters.from = selectedProject?.startsOn ?? dates.sort()[0] ?? filters.from;
  }
  const currency = foundation.currencies.find(c => c.code === displayCurrency);
  const baseCurrency = foundation.currencies.find(c => c.code === foundation.settings?.base_currency);
  if (!currency || !baseCurrency) throw new Error("Unsupported reporting currency.");
  const dates = [...new Set([...report.expenseAutomation.candidates.map(candidate => candidate.to), ...report.entries.map(e => e.fx_effective_date ?? e.recognized_on), ...report.calculations.map(row => row.date),
    ...(report.labor.automaticPeriods ?? []).filter(hasProvisionalLabor).flatMap(period => period.asOf ? [period.provisionalFx?.effectiveDate ?? period.asOf] : []),
    ...report.historicalLabor.periods.map(period => period.fx?.effectiveDate ?? period.periodEnd),
    ...report.projectReporting.events.map(e => e.fx_effective_date ?? e.financial_date), ...report.projectReporting.estimates.map(e => e.fx_effective_date ?? e.as_of)])];
  let rates = new Map<string, string>();
  if (baseCurrency.code !== displayCurrency && dates.length) {
    try { rates = await resolveFinanceFxDates(baseCurrency.code, displayCurrency, dates); }
    catch { /* Historical display FX stays unresolved, never silently zero. */ }
  }
  const calculationValues = new Map<string, string | null>();
  await Promise.all(report.calculations.map(async row => {
    if (row.amount === null || row.valuationProvided && row.reportingAmount === null) { calculationValues.set(row.id, null); return; }
    let amount: string | null = null;
    try {
      const rate = row.currency === baseCurrency.code ? "1" : row.currency ? (await resolveFinanceFxDates(row.currency, baseCurrency.code, [row.date])).get(row.date) : null;
      const base = row.reportingAmount ?? (row.amount !== null && rate ? convertFinanceDisplayAmount(row.amount, rate, baseCurrency.minor_units) : null);
      const displayRate = baseCurrency.code === displayCurrency ? "1" : rates.get(row.date);
      if (base !== null && displayRate) amount = convertFinanceDisplayAmount(base, displayRate, currency.minor_units);
    } catch { /* Economic-date FX remains explicitly unavailable; no current quote substitutes for it. */ }
    calculationValues.set(row.id, amount);
  }));
  const referenceRates = new Map<string, string>();
  await Promise.all([...new Set(report.projectReporting.contracts.map(c => c.currency))].map(async code => {
    try { const rate = (await resolveFinanceFxDates(code, displayCurrency, [today])).get(today); if (rate) referenceRates.set(code, rate); }
    catch { /* Current contract reference conversion is explicitly dated. */ }
  }));
  const reversed = new Set(report.entries.filter(e => e.kind === "reversal").map(e => e.related_entry_id));
  const entries = managementDisplayEntries(report.entries.filter(e => e.kind !== "reversal" && !reversed.has(e.id)), displayCurrency, currency.minor_units, rates);
  const projectRows = projectAmountRows(entries, report.labor, currency.minor_units);
  const cash = projectCashDisplayEvents(report.projectReporting.events, displayCurrency, currency.minor_units, rates);
  const historicalLabor = historicalLaborDisplay(report.historicalLabor.periods, displayCurrency, currency.minor_units, rates);
  const historicalProjectLabor = report.projects.map(project => ({ projectId: project.id,
    period: historicalLaborSummary(historicalLabor, filters.from, filters.to, currency.minor_units, project.id),
    lifetime: historicalLaborSummary(historicalLabor, historicalLabor.at(0)?.periodStart ?? today, today, currency.minor_units, project.id) }));
  const provisional = [...calculatedLaborAmounts(historicalLabor), ...sourceCalculationAmounts(report.calculations, calculationValues)];
  const projectProfitability = buildProjectProfitability({ projects: report.projects, entries, projectRows, cash, labor: report.labor,
    coverage: report.coverage, reporting: report.projectReporting, from: filters.from, to: filters.to, start: report.recognitionStart,
    today, calculated: provisional, earnings: report.earnings, pendingTrips:report.tripSources, historicalLabor: historicalProjectLabor, currency: displayCurrency, digits: currency.minor_units, baseDigits: baseCurrency.minor_units, rates, referenceRates });
  // Project labor previews now come from the same activation-independent source calculations.
  const provisionalLabor = report.projects.map(project => ({ projectId: project.id,
    period: projectProvisionalLabor({ ...report.labor, automaticPeriods: [] }, project.id, filters.from, filters.to, displayCurrency, currency.minor_units, rates),
    lifetime: projectProvisionalLabor({ ...report.labor, automaticPeriods: [] }, project.id, project.startsOn ?? "1900-01-01", today, displayCurrency, currency.minor_units, rates),
  }));
  const version = createHash("sha256").update(JSON.stringify({ report, provisional, filters, displayCurrency,
    rates: [...rates].sort(([left], [right]) => left.localeCompare(right)),
    referenceRates: [...referenceRates].sort(([left], [right]) => left.localeCompare(right)) })).digest("hex");
  return { ...foundation, settings: foundation.settings ? { ...foundation.settings, recognition_start_month: report.recognitionStart } : null,
    today, filters, currency, displayCurrency, version, months: report.months.map(month => ({ ...month, status: [...entries, ...provisional].some(entry => entry.recognized_on >= month.month && entry.recognized_on <= month.through && entry.display_amount === null) ? "needs_review" as const : month.status })), provisional, expenseAutomation: report.expenseAutomation, earnings: report.earnings, entries, amountRows: managementAmountRows(entries), projectRows, cash,
    history: managementDisplayEntries(report.entries, displayCurrency, currency.minor_units, rates), coverage: report.coverage,
    labor: report.labor, tripSources: report.tripSources, sources: report.sources, projects: report.projects, projectReporting: report.projectReporting, projectProfitability, provisionalLabor, historicalLabor, historicalProjectLabor };
}
export type FinanceManagementData = NonNullable<Awaited<ReturnType<typeof getFinanceManagement>>>;
