import { z } from "zod";

export const MOVEMENT_PAGE_SIZE = 50;
export const movementFilterKinds = ["incoming", "outgoing", "transfer", "refund", "owner_withdrawal", "account_opening", "balance_adjustment", "reversal"] as const;
const optionalId = z.union([z.uuid(), z.literal("")]).catch("");
const date = z.union([z.iso.date(), z.literal("")]).catch("");
const filterSchema = z.object({
  q: z.string().trim().max(200).catch(""),
  category: z.union([z.uuid(), z.literal("none"), z.literal("")]).catch(""),
  currency: z.union([z.string().regex(/^[A-Z]{3}$/), z.literal("")]).catch(""),
  account: optionalId,
  kind: z.enum(["", ...movementFilterKinds]).catch(""),
  period: z.enum(["all", "month", "previous", "custom"]).catch("all"),
  from: date,
  to: date,
  history: z.boolean().catch(false),
});
export type FinanceMovementFilters = z.infer<typeof filterSchema>;
export const emptyMovementFilters: FinanceMovementFilters = filterSchema.parse({});
export function parseMovementFilters(params: Record<string, string | string[] | undefined>): FinanceMovementFilters {
  return filterSchema.parse({ ...params, history: params.history === "1" });
}
export function invalidMovementRange(filters: FinanceMovementFilters) {
  return filters.period === "custom" && (!filters.from || !filters.to || filters.from > filters.to);
}
export function movementPeriodBounds(filters: FinanceMovementFilters, today: string): [string, string] | null {
  if (filters.period === "all") return null;
  if (filters.period === "custom") return [filters.from, filters.to];
  const [year, month] = today.split("-").map(Number);
  const offset = filters.period === "previous" ? -1 : 0;
  return [new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10), new Date(Date.UTC(year, month + offset, 0)).toISOString().slice(0, 10)];
}
export function movementFiltersHref(filters: FinanceMovementFilters, page = 1) {
  const params = new URLSearchParams();
  for (const key of ["q", "category", "currency", "account", "kind"] as const) if (filters[key]) params.set(key, filters[key]);
  if (filters.period !== "all") params.set("period", filters.period);
  if (filters.period === "custom") {
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
  }
  if (filters.history) params.set("history", "1");
  if (page > 1) params.set("page", String(page));
  return `/finance/movements${params.size ? `?${params}` : ""}`;
}
export function hasMovementFilters(filters: FinanceMovementFilters) {
  return movementFiltersHref(filters) !== "/finance/movements";
}
export function matchesMovementSearch(query: string, text: string, locale: string) {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase(locale);
  const haystack = normalize(text);
  return normalize(query).split(/\s+/).filter(Boolean).every(term => haystack.includes(term));
}
