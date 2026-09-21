import { z } from "zod";
import { planningAmount } from "./finance-planning";

const date = z.union([z.iso.date(), z.literal("")]);
export const projectPlanSchema = z.object({
  requestId: z.uuid(), projectId: z.uuid(), revision: z.coerce.number().int().min(0),
  pricingMethod: z.enum(["fixed", "area"]), amount: planningAmount,
  currency: z.string().regex(/^[A-Z]{3}$/), area: z.union([planningAmount,z.literal("")]).default(""), rate: z.union([planningAmount,z.literal("")]).default(""),
  reason: z.string().trim().min(1).max(2000), allowUnscheduled: z.boolean(),
  known: z.array(z.object({ id: z.uuid(), version: z.number().int().positive(), protected: z.boolean() })),
  items: z.array(z.object({ id: z.union([z.uuid(), z.literal("")]), name: z.string().trim().min(1).max(2000), amount: planningAmount, dueDate: date, expectedDate: date })),
}).refine(v => v.pricingMethod !== "area" || (planningAmount.safeParse(v.area).success && planningAmount.safeParse(v.rate).success));
export type ProjectPlanInput = z.infer<typeof projectPlanSchema>;
export const projectPaymentTemplates = [[100], [50, 50], [30, 50, 20], [25, 25, 25, 25]] as const;

// Integer minor units keep previews deterministic; PostgreSQL validates again on save.
export function projectMoneyUnits(value: string, digits: number): bigint {
  const decimal = value.trim().replace(",", ".");
  if (!/^\d{1,10}(?:\.\d+)?$/.test(decimal)) throw new Error("amount");
  const [whole, fraction = ""] = decimal.split(".");
  if (fraction.slice(digits).replaceAll("0", "")) throw new Error("precision");
  return BigInt(whole) * BigInt(10) ** BigInt(digits) + BigInt(fraction.slice(0, digits).padEnd(digits, "0") || "0");
}
export function projectMoneyText(units: bigint, digits: number): string {
  const sign = units < BigInt(0) ? "-" : "", absolute = units < BigInt(0) ? -units : units, scale = BigInt(10) ** BigInt(digits);
  return `${sign}${absolute / scale}${digits ? `.${String(absolute % scale).padStart(digits, "0")}` : ""}`;
}
export function projectAreaValue(area: string, rate: string, digits: number): string {
  const product = projectMoneyUnits(area, 4) * projectMoneyUnits(rate, 4), divisor = BigInt(10) ** BigInt(8 - digits);
  return projectMoneyText((product + divisor / BigInt(2)) / divisor, digits);
}
export function projectPaymentAmounts(total: string, percentages: string[], digits: number, requireReconciled = true): string[] {
  const units = projectMoneyUnits(total, digits), weights = percentages.map(v => projectMoneyUnits(v, 4));
  const balanced = weights.reduce((a,b) => a+b, BigInt(0)) === BigInt(1000000);
  if (!weights.length || weights.some(v => v <= BigInt(0)) || (requireReconciled && !balanced)) throw new Error("percentages");
  let assigned = BigInt(0);
  return weights.map((weight,index) => {
    const amount = balanced && index === weights.length - 1 ? units - assigned : units * weight / BigInt(1000000);
    assigned += amount;
    return projectMoneyText(amount, digits);
  });
}
// Informational UAH preview only: never submitted as a contractual value.
export function projectReferenceValue(amount: string, rate: string, digits: number): string {
  const rateDigits = rate.split(".")[1]?.length ?? 0;
  const product = projectMoneyUnits(amount, digits) * projectMoneyUnits(rate, rateDigits);
  const divisor = BigInt(10) ** BigInt(digits + rateDigits);
  return projectMoneyText((product * BigInt(100) + divisor / BigInt(2)) / divisor, 2);
}
