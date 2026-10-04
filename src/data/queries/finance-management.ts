import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { getFinanceData } from "./finance";
import { getFinanceDisplayCurrency } from "./finance-display-currency";
import { createClient } from "@/lib/supabase/server";
import { resolveFinanceFxDates } from "@/lib/finance-fx";
import { recognitionEntrySchema, recognitionSourceSchema, reportCoverageSchema, managementAmountRows, managementDisplayEntries, parseManagementFilters } from "@/lib/finance-management";
import { laborDataSchema } from "@/lib/finance-labor";
import { tripRecognitionSourceSchema } from "@/lib/finance-trip-reporting";
import { projectReportingSchema, projectAmountRows, projectCashDisplayEvents, buildProjectProfitability } from "@/lib/finance-profitability";

const reportSchema = z.object({ asOf: z.iso.date(), recognitionStart: z.iso.date().nullable(), entries: z.array(recognitionEntrySchema),
  coverage: z.array(reportCoverageSchema), projects: z.array(z.object({ id: z.uuid(), name: z.string(), startsOn: z.iso.date().nullable() })),
  sources: z.array(recognitionSourceSchema), labor: laborDataSchema, tripSources: z.array(tripRecognitionSourceSchema), projectReporting: projectReportingSchema });
export async function getFinanceManagement(params: Record<string, string | string[] | undefined>) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const [foundation, displayCurrency, response] = await Promise.all([getFinanceData(), getFinanceDisplayCurrency(), client.rpc("get_finance_management_reporting", { p_studio_id: admin.studio_id })]);
  if (!foundation) return null;
  if (response.error) throw new Error("Unable to load management report.", { cause: response.error });
  const report = reportSchema.parse(response.data), today = report.asOf;
  const filters = parseManagementFilters(params, today);
  const currency = foundation.currencies.find(c => c.code === displayCurrency);
  const baseCurrency = foundation.currencies.find(c => c.code === foundation.settings?.base_currency);
  if (!currency || !baseCurrency) throw new Error("Unsupported reporting currency.");
  const dates = [...new Set([...report.entries.map(e => e.fx_effective_date ?? e.recognized_on),
    ...report.projectReporting.events.map(e => e.fx_effective_date ?? e.financial_date), ...report.projectReporting.estimates.map(e => e.fx_effective_date ?? e.as_of)])];
  let rates = new Map<string, string>();
  if (baseCurrency.code !== displayCurrency && dates.length) {
    try { rates = await resolveFinanceFxDates(baseCurrency.code, displayCurrency, dates); }
    catch { /* Historical display FX stays unresolved, never silently zero. */ }
  }
  const referenceRates = new Map<string, string>();
  await Promise.all([...new Set(report.projectReporting.contracts.map(c => c.currency))].map(async code => {
    try { const rate = (await resolveFinanceFxDates(code, displayCurrency, [today])).get(today); if (rate) referenceRates.set(code, rate); }
    catch { /* Current contract reference conversion is explicitly dated. */ }
  }));
  const reversed = new Set(report.entries.filter(e => e.kind === "reversal").map(e => e.related_entry_id));
  const entries = managementDisplayEntries(report.entries.filter(e => e.kind !== "reversal" && !reversed.has(e.id)), displayCurrency, currency.minor_units, rates);
  const projectRows = projectAmountRows(entries, report.labor, currency.minor_units);
  const cash = projectCashDisplayEvents(report.projectReporting.events, displayCurrency, currency.minor_units, rates);
  const projectProfitability = buildProjectProfitability({ projects: report.projects, entries, projectRows, cash, labor: report.labor,
    coverage: report.coverage, reporting: report.projectReporting, from: filters.from, to: filters.to, start: report.recognitionStart,
    today, pendingTrips:report.tripSources, currency: displayCurrency, digits: currency.minor_units, baseDigits: baseCurrency.minor_units, rates, referenceRates });
  const version = createHash("sha256").update(JSON.stringify({ report, filters, displayCurrency,
    rates: [...rates].sort(([left], [right]) => left.localeCompare(right)),
    referenceRates: [...referenceRates].sort(([left], [right]) => left.localeCompare(right)) })).digest("hex");
  return { ...foundation, settings: foundation.settings ? { ...foundation.settings, recognition_start_month: report.recognitionStart } : null,
    today, filters, currency, displayCurrency, version, entries, amountRows: managementAmountRows(entries), projectRows, cash,
    history: managementDisplayEntries(report.entries, displayCurrency, currency.minor_units, rates), coverage: report.coverage,
    labor: report.labor, tripSources: report.tripSources, sources: report.sources, projects: report.projects, projectReporting: report.projectReporting, projectProfitability };
}
export type FinanceManagementData = NonNullable<Awaited<ReturnType<typeof getFinanceManagement>>>;
