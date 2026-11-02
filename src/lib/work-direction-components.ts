import { z } from "zod";

const positiveDecimal = z.string().trim().regex(/^\d+(?:[.,]\d+)?$/)
  .transform(value => value.replace(",", ".")).refine(value => Number.isFinite(Number(value)) && Number(value) > 0);
export const areaCalculationSchema = z.object({ actualArea: positiveDecimal, coefficient: positiveDecimal });
export const areaComponentSchema = areaCalculationSchema.extend({ name: z.string().trim().min(1).max(2000) });
export const areaComponentsSchema = z.array(areaComponentSchema).min(1);
export type AreaComponent = z.infer<typeof areaComponentSchema>;

// Raw direction inputs retain their precision; only the financial area rounds to four decimals.
export function componentAreaValue(actualArea: string, coefficient: string, digits = 4) {
  const values = [positiveDecimal.parse(actualArea), positiveDecimal.parse(coefficient)].map(value => {
    const [whole, fraction = ""] = value.split(".");
    return { units: BigInt(whole + fraction), digits: fraction.length };
  });
  const product = values[0].units * values[1].units;
  const precision = values[0].digits + values[1].digits;
  const divisor = BigInt(10) ** BigInt(Math.max(0, precision - digits));
  const units = precision > digits ? (product + divisor / BigInt(2)) / divisor : product * BigInt(10) ** BigInt(digits - precision);
  const scale = BigInt(10) ** BigInt(digits);
  return `${units / scale}${digits ? `.${String(units % scale).padStart(digits, "0")}` : ""}`;
}

export function directionEquivalentArea(direction: { area_m2: number; complexity_coefficient: number; area_components?: unknown; equivalent_area_m2?: number | null }) {
  if (direction.equivalent_area_m2 != null) return direction.equivalent_area_m2;
  const components = areaComponentsSchema.safeParse(direction.area_components).data ?? [];
  return direction.area_m2 * direction.complexity_coefficient
    + components.reduce((sum, item) => sum + Number(item.actualArea) * Number(item.coefficient), 0);
}
