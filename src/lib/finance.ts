import { z } from "zod";
import type { Database } from "@/types/database.types";

export type FinanceCurrency = Database["public"]["Tables"]["finance_currencies"]["Row"];
export type FinanceSettings = Database["public"]["Tables"]["finance_settings"]["Row"];
export type FinanceAccount = Database["public"]["Tables"]["finance_accounts"]["Row"];
export type FinanceActionState = { status: "idle" | "success" | "error"; message?: string };

export function financeSettingsSchema(currencies: FinanceCurrency[]) {
  return z.object({
    baseCurrency: z.string().refine((code) => currencies.some((currency) => currency.code === code)),
    cutoverDate: z.iso.date().refine((date) => date >= "1900-01-01" && date <= "9999-12-31"),
  });
}

export function financeAccountSchema(currencies: FinanceCurrency[]) {
  return z.object({
    accountId: z.union([z.uuid(), z.literal("")]),
    name: z.string().trim().min(1).max(120),
    currency: z.string(),
    // Validate text before conversion: reject exponent notation, blanks, and rounding.
    openingBalance: z.string().trim().regex(/^-?\d{1,10}(?:[.,]\d{1,4})?$/),
  }).superRefine((value, context) => {
    const currency = currencies.find((entry) => entry.code === value.currency);
    if (!currency) {
      context.addIssue({ code: "custom", path: ["currency"], message: "currency" });
      return;
    }
    const fraction = value.openingBalance.split(/[.,]/)[1] ?? "";
    if (fraction.length > currency.minor_units) {
      context.addIssue({ code: "custom", path: ["openingBalance"], message: "precision" });
    }
  }).transform((value) => ({ ...value, openingBalance: Number(value.openingBalance.replace(",", ".")) }));
}

export function formatFinanceAmount(amount: number, currency: FinanceCurrency, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency", currency: currency.code, currencyDisplay: "code",
    minimumFractionDigits: currency.minor_units, maximumFractionDigits: currency.minor_units,
  }).format(amount);
}
