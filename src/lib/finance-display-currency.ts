import { z } from "zod";

export const financeDisplayCurrencySchema = z.enum(["USD", "UAH", "EUR", "PLN"]);
export type FinanceDisplayCurrency = z.infer<typeof financeDisplayCurrencySchema>;

export function financeDisplayCurrency(value: unknown): FinanceDisplayCurrency {
  return financeDisplayCurrencySchema.catch("USD").parse(value);
}
