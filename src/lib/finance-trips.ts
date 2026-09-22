import { z } from "zod";
import { planningAmount } from "./finance-planning";
import { projectMoneyText, projectMoneyUnits } from "./finance-project-plan";

export const tripExpenseTypes = ["travel", "accommodation", "meals", "transport", "visa", "other"] as const;
export const tripStatuses = ["planned", "active", "completed", "cancelled"] as const;
export function deriveTripStatus(start: string, end: string, today: string, calendarState?: string|null): typeof tripStatuses[number] {
  if (calendarState && calendarState !== "active") return "cancelled";
  if (today < start) return "planned";
  if (today > end) return "completed";
  return "active";
}
const optionalId = z.union([z.uuid(), z.literal("")]).default("");
export const tripInputSchema = z.object({
  requestId: z.uuid(), id: optionalId, version: z.coerce.number().int().min(0).default(0),
  title: z.string().trim().min(1).max(160), destination: z.string().trim().min(1).max(160),
  startsOn: z.iso.date(), endsOn: z.iso.date(), projectId: optionalId,
  travelers: z.array(z.uuid()).max(100), note: z.string().trim().max(2000).default(""), status: z.enum(tripStatuses),
}).refine(v => v.endsOn >= v.startsOn);
export const tripEntrySchema = z.object({
  requestId: z.uuid(), tripId: z.uuid(), kind: z.enum(["plan", "expense", "advance"]),
  entryId: optionalId, reason: z.string().trim().max(2000).default(""), confirmed: z.coerce.boolean().default(false),
  expenseType: z.enum(tripExpenseTypes), label: z.string().trim().max(160).default(""),
  amount: planningAmount, currency: z.string().regex(/^[A-Z]{3}$/), date: z.iso.date(),
  employeeId: optionalId, accountId: optionalId, movementId: optionalId, planId: optionalId,
  expectedDate: z.union([z.iso.date(), z.literal("")]).default(""),
  note: z.string().trim().max(2000).default(""), fxMode: z.enum(["nbu", "manual"]).default("manual"), manualRate: z.string().default(""),
  coveredTravelerIds: z.array(z.uuid()).max(100).default([]),
  dailyRate: z.union([planningAmount, z.literal("")]).default(""), dayCount: z.union([z.string().regex(/^\d{1,3}$/), z.literal("")]).default(""),
}).superRefine((v, c) => {
  const cash = v.kind === "advance" || (v.kind === "expense" && !v.employeeId);
  if (v.entryId && (v.kind === "advance" || v.kind === "expense" && !v.reason)) c.addIssue({ code: "custom", message: "edit" });
  if (cash && (!v.accountId && !v.movementId || v.accountId && v.movementId)) c.addIssue({ code: "custom", message: "payment" });
  if (!cash && (v.accountId || v.movementId)) c.addIssue({ code: "custom", message: "payment" });
  if (v.kind === "advance" && !v.employeeId || v.kind === "plan" && v.employeeId) c.addIssue({ code: "custom", message: "traveler" });
  if ((v.dailyRate || v.dayCount) && (v.expenseType !== "meals" || !v.dailyRate || !v.dayCount || Number(v.dayCount) < 1 || Number(v.dayCount) > 366)) c.addIssue({ code: "custom", message: "perDiem" });
});
export const tripCorrectionSchema = z.object({ requestId: z.uuid(), tripId: z.uuid(), reversesId: z.uuid(), note: z.string().trim().min(1).max(2000) });
export function tripDays(start: string, end: string) {
  if (!z.iso.date().safeParse(start).success || !z.iso.date().safeParse(end).success || end < start) return 0;
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
}
export function tripPerDiem(rate: string, days: number, digits: number, travelers = 1) {
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error("days");
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > 100) throw new Error("travelers");
  return projectMoneyText(projectMoneyUnits(rate, digits) * BigInt(days) * BigInt(travelers), digits);
}
// Exact display aggregates; authoritative valuation and reconciliation happen in PostgreSQL.
export function sumTripMoney(values: string[], digits: number) {
  return projectMoneyText(values.reduce((total, value) => {
    if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error("amount");
    const [whole, fraction = ""] = value.replace("-", "").split(".");
    if (fraction.slice(digits).replaceAll("0", "")) throw new Error("precision");
    const units = BigInt(whole) * BigInt(10) ** BigInt(digits) + BigInt(fraction.slice(0, digits).padEnd(digits, "0") || "0");
    return total + (value.startsWith("-") ? -units : units);
  }, BigInt(0)), digits);
}

// Plan display is a current assumption, never the receipt's historical FX snapshot.
export function tripPlanSummary(entries: { id: string | null; kind: string | null; reverses_id: string | null; amount: string; currency: string | null }[], values: Record<string, string | null>, digits: number, actual: string) {
  const plans = entries.filter(e => e.kind === "plan" && !e.reverses_id && !entries.some(r => r.reverses_id === e.id));
  const incomplete = plans.some(e => !e.id || values[e.id] == null);
  const planned = plans.length && !incomplete ? sumTripMoney(plans.map(e => values[e.id ?? ""] ?? "0"), digits) : null;
  return { has_plan: plans.length > 0, plan_incomplete: incomplete, planned_amount: planned, variance: planned === null ? null : sumTripMoney([actual, `-${planned}`], digits) };
}
