import { z } from "zod";
import { financeRateSchema } from "./finance-movements";
import type { Database } from "@/types/database.types";

export type FinanceCurrency = Database["public"]["Tables"]["finance_currencies"]["Row"];
export type FinanceSettings = Database["public"]["Tables"]["finance_settings"]["Row"];
export type FinanceAccount = NonNullable<Awaited<ReturnType<typeof import("@/data/queries/finance").getFinanceData>>>["accounts"][number];
export type FinanceActionState = { status: "idle" | "success" | "error"; message?: string; id?: string };

export function financeSettingsSchema(currencies: FinanceCurrency[]) {
  return z.object({
    baseCurrency: z.string().refine((code) => currencies.some((currency) => currency.code === code)),
    cutoverDate: z.iso.date().refine((date) => date >= "1900-01-01" && date <= "9999-12-31"),
  });
}

export function financeAccountSchema(currencies: FinanceCurrency[]) {
  return z.object({
    requestId: z.uuid(),
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

// Intl accepts decimal strings without first rounding them to binary floating point.
function isDecimal(value: string): value is `${number}` {
  return /^-?\d+(?:\.\d+)?$/.test(value);
}
export function formatFinanceDecimal(amount: string | number, locale: string, options: Intl.NumberFormatOptions): string {
  const decimal = String(amount);
  if (!isDecimal(decimal)) throw new Error("Invalid Finance decimal");
  return new Intl.NumberFormat(locale, options).format(decimal);
}

// Coordinates are approximate; use the exact table if minor units exceed safe integers.
export function canChartFinanceAmount(amount: string, digits: number): boolean {
  return Math.abs(Number(amount)) <= Number.MAX_SAFE_INTEGER / 10 ** digits;
}

export function formatFinanceAmount(amount: string | number, currency: FinanceCurrency, locale: string): string {
  return formatFinanceDecimal(amount, locale, {
    style: "currency", currency: currency.code, currencyDisplay: "code",
    minimumFractionDigits: currency.minor_units, maximumFractionDigits: currency.minor_units,
  });
}

export const openingValuationSchema = z.object({
  accountId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/), reportingCurrency: z.string().regex(/^[A-Z]{3}$/),
  openingAmount: z.string().regex(/^-?\d{1,10}(?:\.\d{1,4})?$/), date: z.iso.date(),
  fxMode: z.enum(["nbu", "manual"]), manualRate: z.string().default(""),
}).superRefine((input, context) => {
  if (input.fxMode === "manual" && !financeRateSchema.safeParse(input.manualRate).success) context.addIssue({ code: "custom", path: ["manualRate"], message: "rate" });
  if (input.fxMode === "nbu" && input.reportingCurrency !== "UAH") context.addIssue({ code: "custom", path: ["fxMode"], message: "nbu" });
});
