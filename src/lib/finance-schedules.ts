import { z } from "zod";
import { planningAmount } from "./finance-planning";

const optionalAmount = z.union([z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,4})?$/).transform((v) => v.replace(",", ".")), z.literal("")]).default("");
const monthStart = z.iso.date().refine((v) => v.endsWith("-01"));
export const scheduleInputSchema = z.object({
  requestId: z.uuid(), id: z.union([z.uuid(), z.literal("")]).default(""), revision: z.coerce.number().int().min(0),
  groupId: z.union([z.uuid(), z.literal("")]).optional(),
  kind: z.enum(["payroll", "recurring"]), employeeId: z.union([z.uuid(), z.literal("")]).default(""),
  name: z.string().trim().min(1).max(120), amount: planningAmount, currency: z.string().regex(/^[A-Z]{3}$/), categoryId: z.uuid(),
  intervalMonths: z.coerce.number().pipe(z.union([z.literal(1), z.literal(3), z.literal(12)])),
  payoutDay: z.coerce.number().int().min(1).max(31), paymentMonthOffset: z.coerce.number().int().min(0).max(1).default(0),
  effectiveFrom: monthStart, effectiveThrough: z.union([z.iso.date(), z.literal("")]).default(""),
  commitment: z.enum(["agreed", "tentative"]), certainty: z.enum(["fixed", "estimated"]),
  basis: z.enum(["", "net", "gross"]).default(""), employeePayout: z.union([planningAmount, z.literal("")]).default(""), employeeDeductions: optionalAmount,
  employerCost: optionalAmount, employerCostStatus: z.enum(["unknown", "fixed", "estimated"]), reason: z.string().trim().min(1).max(2000),
}).refine((v) => !v.effectiveThrough || (v.effectiveThrough >= v.effectiveFrom &&
  new Date(Date.parse(`${v.effectiveThrough}T00:00:00Z`) + 86400000).getUTCDate() === 1), { path: ["effectiveThrough"] })
  .refine((v) => (v.employerCostStatus === "unknown") === (v.employerCost === ""), { path: ["employerCost"] })
  .refine((v) => v.kind !== "payroll" || Boolean(v.employeeId), { path: ["employeeId"] })
  .refine((v) => v.kind !== "payroll" || Boolean(v.basis && v.employeePayout) && (v.basis !== "gross" || v.employeeDeductions !== ""), { path: ["compensation"] })
  .refine((v) => v.kind !== "payroll" || v.intervalMonths === 1 && v.commitment === "agreed" && v.certainty === "fixed", { path: ["configuration"] })
  .refine((v) => v.kind !== "recurring" || !v.employeeId && !v.basis && !v.employeePayout && !v.employeeDeductions && !v.employerCost, { path: ["configuration"] });
// Exact monetary agreement arithmetic and minor-unit precision are enforced in PostgreSQL.
export const generateObligationsSchema = z.object({ requestId: z.uuid(), scheduleId: z.uuid(), from: monthStart, through: monthStart })
  .refine((v) => v.through >= v.from && (Number(v.through.slice(0, 4)) - Number(v.from.slice(0, 4))) * 12 + Number(v.through.slice(5, 7)) - Number(v.from.slice(5, 7)) < 12);
export const stopScheduleSchema = z.object({ requestId: z.uuid(), scheduleId: z.uuid(), from: monthStart });
export const payrollCostSchema = z.object({
  requestId: z.uuid(), obligationId: z.uuid(), component: z.enum(["deductions", "employer_cost"]),
  revision: z.coerce.number().int().min(0), status: z.enum(["unknown", "fixed", "estimated"]),
  amount: optionalAmount, reason: z.string().trim().min(1).max(2000),
}).refine((v) => (v.status === "unknown") === (v.amount === ""), { path: ["amount"] });
export const employeeBonusSchema = z.object({
  requestId: z.uuid(), employeeId: z.uuid(), amount: planningAmount, currency: z.string().regex(/^[A-Z]{3}$/),
  periodStart: z.iso.date(), periodEnd: z.iso.date(), dueDate: z.iso.date(), description: z.string().trim().min(1).max(2000),
}).refine((v) => v.periodEnd >= v.periodStart);

export function financeScheduleError(message: string) {
  if (message === "finance_group_invalid") return "group";
  if (message === "finance_payroll_cost_locked") return "costLocked";
  if (message === "finance_payroll_cost_category_required") return "costCategory";
  if (message === "finance_schedule_effective_date") return "effectiveDate";
  if (message === "finance_schedule_range") return "range";
  if (message === "finance_employee_invalid" || message.includes("finance_active_payroll_employee")) return "employee";
  if (message === "finance_obligation_locked") return "locked";
  if (message === "finance_version_conflict") return "version";
  if (message === "finance_request_conflict") return "conflict";
  if (message.includes("check constraint") || message === "finance_compensation_invalid" || message === "finance_amount_invalid") return "amount";
  return "save";
}

export function financeScheduleValidationError(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>) {
  const fields = new Set(issues.flatMap((issue) => issue.path.map(String)));
  if (fields.has("effectiveFrom")) return "effectiveFromInput";
  if (fields.has("effectiveThrough")) return "effectiveThroughInput";
  if (fields.has("employeeId")) return "employeeRequired";
  if (["amount", "basis", "employeePayout", "employeeDeductions", "compensation"].some((field) => fields.has(field))) return "compensationRequired";
  if (fields.has("employerCost") || fields.has("employerCostStatus")) return "employerCostRequired";
  return "invalid";
}
