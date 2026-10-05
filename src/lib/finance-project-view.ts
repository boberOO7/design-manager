import { financeAmountText, financeAmountUnits, formatFinanceAmount, type FinanceCurrency } from "./finance";
import { convertFinanceDisplayAmount } from "./finance-display-report";
import type { Database } from "@/types/database.types";
import type { FinanceProjectData } from "@/data/queries/finance";

export function nextProjectPayment<T extends Pick<Database["public"]["Views"]["finance_project_expected_balances"]["Row"], "order_id" | "expected_payment_date" | "due_date">>(items: readonly T[], confirmedOrderIds: readonly string[]): T | null {
  const confirmed = new Set(confirmedOrderIds);
  const outstanding = items.filter(item => item.order_id && confirmed.has(item.order_id));
  const dated = outstanding.filter(item => item.expected_payment_date || item.due_date);
  // Input already follows the saved order/schedule order, including date ties.
  return dated.sort((a, b) => (a.expected_payment_date ?? a.due_date ?? "").localeCompare(b.expected_payment_date ?? b.due_date ?? ""))[0] ?? outstanding[0] ?? null;
}

export function projectOrderPaymentProgress(total: Pick<FinanceProjectData["orderTotals"][number], "contract_gross_amount" | "contract_amount" | "collected_amount" | "closed_amount"> | undefined, digits: number) {
  const gross = total?.contract_gross_amount ?? total?.contract_amount;
  if (gross == null) return { state: "unpaid", percent: 0 } as const;
  const value = financeAmountUnits(gross, digits), paid = financeAmountUnits(total?.collected_amount ?? "0", digits), closed = financeAmountUnits(total?.closed_amount ?? "0", digits);
  if (value <= BigInt(0)) return { state: "unpaid", percent: 0 } as const;
  const state = paid >= value ? "paid" : paid + closed >= value ? "closed" : paid + closed > BigInt(0) ? "partial" : "unpaid";
  // Clamp only the visual bar; financial balances and overpayments remain untouched.
  return { state, percent: Math.min(100, Math.max(0, Number((paid + closed) * BigInt(10000) / value) / 100)) } as const;
}

export type ProjectFinanceDisplay = { currency: FinanceCurrency; rates: Record<string, string | null> };

// Current presentation valuation only; contractual and settlement values stay native.
export function formatProjectFinanceMoney(amount: string | number | null | undefined, native: FinanceCurrency | undefined, display: ProjectFinanceDisplay | undefined, locale: string): string {
  if (amount == null || !native) return "—";
  if (!display || native.code === display.currency.code) return formatFinanceAmount(amount, native, locale);
  const rate = display.rates[native.code];
  return rate ? `≈ ${formatFinanceAmount(convertFinanceDisplayAmount(String(amount), rate, display.currency.minor_units), display.currency, locale)}` : `— ${display.currency.code}`;
}

export function projectContractSummary(rows: readonly { currency: string; gross: string; paid: string; closed: string }[], rates: Record<string, string | null>, digits: number) {
  if (!rows.length || rows.some(row => !rates[row.currency])) return null;
  let gross = BigInt(0), paid = BigInt(0), closed = BigInt(0);
  for (const row of rows) {
    const rate = rates[row.currency];
    if (!rate) return null;
    gross += financeAmountUnits(convertFinanceDisplayAmount(row.gross, rate, digits), digits);
    paid += financeAmountUnits(convertFinanceDisplayAmount(row.paid, rate, digits), digits);
    closed += financeAmountUnits(convertFinanceDisplayAmount(row.closed, rate, digits), digits);
  }
  return { gross: financeAmountText(gross, digits), paid: financeAmountText(paid, digits), remaining: financeAmountText(gross - paid - closed, digits) };
}

export type ProjectFinanceTab = "payments" | "expenses" | "result";
export type ProjectProfitPeriod = "all" | "month" | "year" | "custom";

export function projectFinanceTab(tab: unknown, stream: unknown): ProjectFinanceTab {
  return tab === "payments" || tab === "expenses" || tab === "result" ? tab : stream === "expenses" ? "expenses" : "payments";
}

export function projectProfitPeriod(period: unknown, from: unknown, to: unknown): ProjectProfitPeriod {
  return period === "all" || period === "month" || period === "year" || period === "custom" ? period : from || to ? "custom" : "all";
}

// Presentation of the agreement balance, never project-attributed cash or revenue.
export function projectAgreementRemaining(gross: string | null, matched: string | null, digits: number, closed = "0") {
  return gross === null || matched === null ? null : financeAmountText(financeAmountUnits(gross, digits) - financeAmountUnits(matched, digits) - financeAmountUnits(closed, digits), digits);
}
