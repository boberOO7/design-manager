import { financeAmountText, financeAmountUnits } from "./finance";
import { convertFinanceDisplayAmount } from "./finance-display-report";

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
