import "server-only";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { getFinanceDisplayRate } from "./finance-overview";
import { resolveForecastAssumptions } from "./finance-report-fx";
import { convertFinanceDisplayAmount } from "@/lib/finance-display-report";
import { overviewCashComparison, overviewCashMonths, overviewComparisonRange, overviewMonthlyCash, overviewPaymentSchema, type OverviewPayment } from "@/lib/finance-overview-dashboard";
import { z } from "zod";
import { resolveFinanceFxDates } from "@/lib/finance-fx";
import { financeOverviewSchema, type FinanceOverview } from "@/lib/finance-overview";
import { forecastFxSchema } from "@/lib/finance-forecast";
import type { FinanceCurrency } from "@/lib/finance";

export async function getFinanceOverviewCashAnalysis(source: FinanceOverview, currency: FinanceCurrency) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const rows: Array<z.infer<typeof actualSchema>> = [];
  const previous = overviewComparisonRange(source.period, source.actualFrom, source.forecast.asOf);
  const from = [overviewCashMonths(source.forecast.asOf)[0], previous.from].sort()[0];
  for (let offset = 0; ; offset += 1000) {
    const page = await client.from("finance_planning_actuals")
      .select("financial_date,amount::text,direction,nature").eq("studio_id", admin.studio_id)
      .gte("financial_date", from).lte("financial_date", source.forecast.asOf)
      .order("financial_date").order("posting_order").range(offset, offset + 999);
    if (page.error || !page.data) throw new Error("Unable to load monthly cash movement.", { cause: page.error });
    rows.push(...z.array(actualSchema).parse(page.data));
    if (page.data.length < 1000) break;
  }
  const rates = currency.code === source.forecast.currency ? null
    : await resolveFinanceFxDates(source.forecast.currency, currency.code, [...new Set(rows.map(row => row.financial_date))]);
  // Convert each dated actual before summing, exactly as projectFinanceDisplayReport does.
  const converted = rows.map(row => {
    let amount = row.amount;
    if (rates && amount !== null) {
      const rate = rates.get(row.financial_date);
      if (!rate) throw new Error(`Missing historical FX for ${row.financial_date}`);
      amount = convertFinanceDisplayAmount(amount, rate, currency.minor_units);
    }
    return { ...row, amount, month: `${row.financial_date.slice(0, 7)}-01` };
  });
  return { months: overviewMonthlyCash(converted, source.forecast.asOf, currency.minor_units),
    comparison: overviewCashComparison(converted, source.period, source.actualFrom, source.forecast.asOf, currency.minor_units) };
}
const actualSchema = financeOverviewSchema.shape.flows.element.omit({ month: true }).extend({ financial_date: z.iso.date() });

export async function getFinanceOverviewPayments(source: FinanceOverview, currency: FinanceCurrency, baseDigits: number) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const payments: OverviewPayment[] = [];
  const displayRate = currency.code === source.forecast.currency ? "1"
    : await getFinanceDisplayRate(source.forecast.currency, currency.code, source.forecast.asOf);
  for (let offset = 0; ; offset += 100) {
    // No horizon filter: overdue and undated obligations must remain visible.
    const page = await client.from("finance_expected_balances")
      .select("id,description,direction,currency,remaining_amount::text,due_date,expected_payment_date,commitment,certainty")
      .eq("studio_id", admin.studio_id).gt("remaining_amount", 0)
      .in("commitment", source.forecast.scenario === "planned" ? ["agreed", "tentative"] : ["agreed"])
      .order("id").range(offset, offset + 99);
    if (page.error || !page.data) throw new Error("Unable to load Overview payments.", { cause: page.error });
    const ids = page.data.flatMap(item => item.id ? [item.id] : []);
    const [projects, obligations, rates] = await Promise.all([
      ids.length ? client.from("finance_project_items").select("expected_item_id,project_id,project:projects!finance_project_items_project_id_studio_id_fkey(name)")
        .eq("studio_id", admin.studio_id).in("expected_item_id", ids) : null,
      ids.length ? client.from("finance_obligation_items").select("expected_item_id,component,obligation:finance_obligations!finance_obligation_items_studio_id_obligation_id_fkey(id,kind,employee_name,period_start)")
        .eq("studio_id", admin.studio_id).in("expected_item_id", ids) : null,
      resolveForecastAssumptions(source.forecast, forecastFxSchema.parse(source.forecast.fx.filter(rate => rate.source !== "identity")), page.data.flatMap(item => item.currency ?? [])),
    ]);
    if (projects?.error || obligations?.error) throw new Error("Unable to load Overview payment sources.", { cause: projects?.error ?? obligations?.error });
    const fx = new Map(rates.map(rate => [rate.currency, rate.rate]));
    fx.set(source.forecast.currency, "1");
    const projectByItem = new Map(projects?.data?.map(link => [link.expected_item_id, link]));
    const obligationByItem = new Map(obligations?.data?.map(link => [link.expected_item_id, link]));
    for (const item of page.data) {
      const project = item.id ? projectByItem.get(item.id) : null;
      const obligation = item.id ? obligationByItem.get(item.id) : null;
      const rate = item.currency ? fx.get(item.currency) : undefined;
      const baseAmount = rate ? convertFinanceDisplayAmount(item.remaining_amount, rate, baseDigits) : null;
      payments.push(overviewPaymentSchema.parse({ id: item.id, description: item.description, direction: item.direction,
        currency: item.currency, amount: item.remaining_amount, dueDate: item.due_date, expectedDate: item.expected_payment_date,
        commitment: item.commitment, certainty: item.certainty,
        reportingAmount: baseAmount === null ? null : convertFinanceDisplayAmount(baseAmount, displayRate, currency.minor_units),
        project: project?.project ? { id: project.project_id, name: project.project.name } : null,
        obligation: obligation?.obligation ?? null, component: obligation?.component ?? null,
      }));
    }
    if (page.data.length < 100) break;
  }
  return payments;
}
