import { z } from "zod";
import type { Database } from "@/types/database.types";

export type FinanceCategory = Database["public"]["Tables"]["finance_categories"]["Row"];
export type FinanceExpected = Database["public"]["Views"]["finance_expected_balances"]["Row"];
export const planningAmount = z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,4})?$/).transform((value) => value.replace(",", ".")).refine((value) => Number(value)>0);
const optionalId = z.union([z.uuid(),z.literal("")]).default("");
const optionalDate = z.union([z.iso.date(),z.literal("")]).default("");
export const categoryInputSchema = z.object({
  requestId:z.uuid(),id:optionalId,name:z.string().trim().min(1).max(120),
  direction:z.enum(["incoming","outgoing"]),nature:z.enum(["operating","financing","owner_distribution"]),
  archived:z.enum(["true","false"]).default("false"),
}).refine((value) => value.nature!=="owner_distribution" || value.direction==="outgoing");
export const expectedInputSchema = z.object({
  requestId:z.uuid(),id:optionalId,version:z.coerce.number().int().min(0).default(0),
  direction:z.enum(["incoming","outgoing"]),amount:planningAmount,currency:z.string().regex(/^[A-Z]{3}$/),categoryId:z.uuid(),
  description:z.string().trim().max(2000).default(""),dueDate:optionalDate,expectedDate:optionalDate,
  commitment:z.enum(["tentative","agreed","cancelled"]),certainty:z.enum(["fixed","estimated"]),
  established:z.enum(["true","false"]).default("false"),
}).refine((value) => value.established!=="true" || (value.commitment==="agreed" && value.certainty==="fixed"));
export const allocationInputSchema = z.object({ requestId:z.uuid(),itemId:z.uuid(),movementId:z.uuid(),amount:planningAmount });
export const releaseInputSchema = z.object({ requestId:z.uuid(),allocationId:z.uuid(),reason:z.string().trim().min(1).max(2000) });

export function categoriesForDirection(categories:FinanceCategory[],direction:string,owner=false,currentId?:string|null) {
  return categories.filter((category) => category.direction===direction && (category.nature==="owner_distribution")===owner && (!category.archived_at || category.id===currentId));
}

export function financeCategoryLabel(category:FinanceCategory|undefined,fallback:string|null,translateDefault:(key:string)=>string) {
  return category?.default_key&&!category.custom_name ? translateDefault(category.default_key) : category?.name??fallback??"";
}

export function financeMovementCategoryLabel(categoryId:string|null,snapshot:string|null,categories:FinanceCategory[],translateDefault:(key:string)=>string) {
  const category=categories.find((item)=>item.id===categoryId);
  return category?.default_key&&!category.custom_name ? translateDefault(category.default_key) : snapshot??"";
}
