import { z } from "zod";
import { planningAmount } from "./finance-planning";

const date = z.union([z.iso.date(), z.literal("")]);
export const projectDiscountFields = {
  discountType: z.enum(["none", "percentage", "fixed"]).default("none"),
  discountValue: z.string().regex(/^\d{1,10}(?:[.,]\d{1,4})?$/).transform(value => value.replace(",", ".")).default("0"),
};
export type ProjectDiscountType = z.infer<typeof projectDiscountFields.discountType>;
export const projectPlanSchema = z.object({
  requestId: z.uuid(), projectId: z.uuid(), revision: z.coerce.number().int().min(0),
  pricingMethod: z.enum(["fixed", "area"]), amount: planningAmount,
  ...projectDiscountFields,
  vatRate: z.string().regex(/^\d{1,10}(?:[.,]\d{1,4})?$/).transform((rate) => rate.replace(",", ".")).nullable().refine((rate) => rate === null || Number(rate) >= 0),
  priceBasis: z.enum(["net", "gross"]).nullable(),
  revenueTaxRate: z.string().regex(/^\d{1,10}(?:[.,]\d{1,4})?$/).transform((rate) => rate.replace(",", ".")).nullable().default(null),
  currency: z.string().regex(/^[A-Z]{3}$/), area: z.union([planningAmount,z.literal("")]).default(""), rate: z.union([planningAmount,z.literal("")]).default(""),
  reason: z.string().trim().min(1).max(2000), allowUnscheduled: z.boolean(),
  known: z.array(z.object({ id: z.uuid(), version: z.number().int().positive(), protected: z.boolean() })),
  protectedNotes: z.array(z.object({ id: z.uuid(), clientNote: z.string().trim().max(300) })).default([]),
  items: z.array(z.object({ id: z.union([z.uuid(), z.literal("")]), name: z.string().trim().min(1).max(2000), clientNote: z.string().trim().max(300).default(""), percentage: z.union([z.string().regex(/^\d{1,3}(?:\.\d{1,4})?$/), z.literal("")]).default(""), amount: planningAmount, dueDate: date, expectedDate: date })),
}).refine(v => (v.vatRate === null) === (v.priceBasis === null)).refine(v => v.pricingMethod !== "area" || (planningAmount.safeParse(v.area).success && planningAmount.safeParse(v.rate).success));
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
export function projectDiscountAmounts(list: string, type: ProjectDiscountType, value: string, digits: number) {
  const listUnits = projectMoneyUnits(list, digits);
  const entered = projectMoneyUnits(value, type === "percentage" ? 4 : digits);
  const discount = type === "none" ? BigInt(0) : type === "fixed" ? entered : (listUnits * entered + BigInt(500000)) / BigInt(1000000);
  if (listUnits <= BigInt(0) || discount >= listUnits || (type === "percentage" && entered >= BigInt(1000000)) || (type === "none" && entered !== BigInt(0))) throw new Error("discount");
  const percentage = type === "percentage" ? projectMoneyText(entered, 4) : projectMoneyText((discount * BigInt(1000000) + listUnits / BigInt(2)) / listUnits, 4);
  return { discount: projectMoneyText(discount, digits), agreed: projectMoneyText(listUnits - discount, digits), percentage };
}
// Scale custom rows directly in Gross minor units; a zero discount round-trips exactly.
export function projectRescalePayments(amounts: string[], oldPool: string, newPool: string, digits: number): string[] {
  const before = projectMoneyUnits(oldPool, digits), after = projectMoneyUnits(newPool, digits);
  const values = amounts.map(value => projectMoneyUnits(value, digits));
  if (before <= BigInt(0) || values.some(value => value <= BigInt(0)) || values.reduce((sum,value) => sum+value, BigInt(0)) > before) throw new Error("amount");
  let cumulative = BigInt(0), assigned = BigInt(0);
  return values.map(value => {
    cumulative += value;
    const rounded = (cumulative * after + before / BigInt(2)) / before;
    const amount = rounded - assigned; assigned = rounded;
    return projectMoneyText(amount, digits);
  });
}
export function projectVatAmounts(amount: string, vatRate: string | null, priceBasis: "net" | "gross" | null, digits: number) {
  const entered = projectMoneyUnits(amount, digits);
  if (vatRate === null || priceBasis === null) return { net: projectMoneyText(entered, digits), vat: projectMoneyText(BigInt(0), digits), gross: projectMoneyText(entered, digits) };
  const decimalRate = vatRate.trim().replace(",", ".");
  const rateDigits = decimalRate.split(".")[1]?.length ?? 0;
  const rate = projectMoneyUnits(decimalRate, rateDigits), rateScale = BigInt(10) ** BigInt(rateDigits), divisor = BigInt(100) * rateScale;
  const round = (numerator: bigint, denominator: bigint) => (numerator + denominator / BigInt(2)) / denominator;
  if (priceBasis === "net") {
    const vat = round(entered * rate, divisor);
    return { net: projectMoneyText(entered, digits), vat: projectMoneyText(vat, digits), gross: projectMoneyText(entered + vat, digits) };
  }
  const net = round(entered * divisor, divisor + rate);
  return { net: projectMoneyText(net, digits), vat: projectMoneyText(entered - net, digits), gross: projectMoneyText(entered, digits) };
}
export function projectRevenueTaxAmounts(net: string, revenueTaxRate: string | null, digits: number) {
  const tax = projectVatAmounts(net, revenueTaxRate, "net", digits).vat;
  return { tax, afterTax: projectMoneyText(projectMoneyUnits(net, digits) - projectMoneyUnits(tax, digits), digits) };
}
// Allocate rounded tax across a schedule so its parts close to the agreement total.
export function projectScheduleVatAmounts(amounts: string[], vatRate: string | null, priceBasis: "net" | "gross" | null, digits: number, grossTarget?: string) {
  const values = amounts.map((amount) => projectMoneyUnits(amount, digits));
  const total = values.reduce((sum, amount) => sum + amount, BigInt(0));
  if (vatRate === null || priceBasis === null) return values.map((amount) => ({ net: projectMoneyText(amount, digits), vat: projectMoneyText(BigInt(0), digits), gross: projectMoneyText(amount, digits) }));
  if (total === BigInt(0)) throw new Error("amount");
  const totalParts = projectVatAmounts(projectMoneyText(total, digits), vatRate, priceBasis, digits);
  const distributed = priceBasis === "net"
    ? grossTarget === undefined ? projectMoneyUnits(totalParts.vat, digits) : projectMoneyUnits(grossTarget, digits) - total
    : projectMoneyUnits(totalParts.net, digits);
  if (distributed < BigInt(0)) throw new Error("amount");
  let cumulative = BigInt(0), assigned = BigInt(0);
  return values.map((value) => {
    cumulative += value;
    const portion = (cumulative * distributed + total / BigInt(2)) / total - assigned;
    assigned += portion;
    const net = priceBasis === "net" ? value : portion;
    const vat = priceBasis === "net" ? portion : value - portion;
    return { net: projectMoneyText(net, digits), vat: projectMoneyText(vat, digits), gross: projectMoneyText(net + vat, digits) };
  });
}
export function projectGrossToBasis(gross: string, vatRate: string | null, priceBasis: "net" | "gross" | null, digits: number) {
  return vatRate !== null && priceBasis === "net" ? projectVatAmounts(gross, vatRate, "gross", digits).net : gross;
}
export function projectBasisToGross(amount: string, vatRate: string | null, priceBasis: "net" | "gross" | null, digits: number) {
  return projectVatAmounts(amount, vatRate, priceBasis, digits).gross;
}
export function projectAreaValue(area: string, rate: string, digits: number): string {
  const product = projectMoneyUnits(area, 4) * projectMoneyUnits(rate, 4), divisor = BigInt(10) ** BigInt(8 - digits);
  return projectMoneyText((product + divisor / BigInt(2)) / divisor, digits);
}
export function projectPaymentAmounts(total: string, percentages: string[], digits: number, requireReconciled = true): string[] {
  const units = projectMoneyUnits(total, digits), weights = percentages.map(v => projectMoneyUnits(v, 4));
  const balanced = weights.reduce((a,b) => a+b, BigInt(0)) === BigInt(1000000);
  if (!weights.length || (requireReconciled && (weights.some(v => v <= BigInt(0)) || !balanced))) throw new Error("percentages");
  let assigned = BigInt(0);
  return weights.map((weight,index) => {
    const amount = balanced && index === weights.length - 1 ? units - assigned : units * weight / BigInt(1000000);
    assigned += amount;
    return projectMoneyText(amount, digits);
  });
}
// Percentage schedules divide client cash; the save RPC still accepts agreement-basis amounts.
export function projectClientPaymentSchedule(grossPool: string, percentages: string[], vatRate: string | null, priceBasis: "net" | "gross" | null, digits: number, reserve = "0") {
  const grossPoolUnits = projectMoneyUnits(grossPool, digits);
  const reserved = projectMoneyUnits(reserve, digits);
  const grossAmounts = projectPaymentAmounts(projectMoneyText(grossPoolUnits - reserved, digits), percentages, digits, false);
  const basisAmounts = grossAmounts.map((amount) => projectGrossToBasis(amount, vatRate, priceBasis, digits));
  const balanced = percentages.reduce((sum, percentage) => sum + projectMoneyUnits(percentage, 4), BigInt(0)) === BigInt(1000000);
  const basisPool = projectMoneyUnits(projectGrossToBasis(grossPool, vatRate, priceBasis, digits), digits);
  if (balanced && reserved === BigInt(0) && basisAmounts.length) {
    const last = basisAmounts.length - 1;
    const assigned = basisAmounts.reduce((sum, amount) => sum + projectMoneyUnits(amount, digits), BigInt(0));
    basisAmounts[last] = projectMoneyText(projectMoneyUnits(basisAmounts[last], digits) + basisPool - assigned, digits);
  }
  const scheduledBasis = basisAmounts.reduce((sum, amount) => sum + projectMoneyUnits(amount, digits), BigInt(0));
  const schedule = projectScheduleVatAmounts(basisAmounts, vatRate, priceBasis, digits,
    vatRate !== null && priceBasis === "net" && scheduledBasis === basisPool ? grossPool : undefined);
  return { basisAmounts, grossAmounts: schedule.map((item) => item.gross) };
}
// Informational reporting preview only: never submitted as a contractual or cash value.
export function projectReferenceValue(amount: string, rate: string, digits: number, reportingDigits = 2): string {
  const rateDigits = rate.split(".")[1]?.length ?? 0;
  const product = projectMoneyUnits(amount, digits) * projectMoneyUnits(rate, rateDigits);
  const divisor = BigInt(10) ** BigInt(digits + rateDigits);
  return projectMoneyText((product * BigInt(10) ** BigInt(reportingDigits) + divisor / BigInt(2)) / divisor, reportingDigits);
}

export function projectPaymentDefaultKey(percentages: readonly number[], index: number) {
  const template = percentages.join("/");
  if (template === "100") return "projectPayment";
  if (template === "50/50") return index === 0 ? "advance" : "finalPayment";
  if (template === "30/50/20") return (["planningStage", "visualizationStage", "documentationStage"] as const)[index];
  return "paymentNumber";
}
