import type { ExpenseAutomation } from "./finance-expenses";
import type { Database } from "@/types/database.types";

type Category = Pick<Database["public"]["Tables"]["finance_categories"]["Row"], "nature" | "default_key">;
type Term = Pick<Database["public"]["Tables"]["finance_schedule_terms"]["Row"], "schedule_id" | "interval_months" | "certainty" | "commitment">;

function monthDistance(from: string, to: string) {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
}

export function nextRecurringServicePeriod(original: string, interval: number, earliest: string) {
  const months = Math.max(0, Math.ceil(monthDistance(original, earliest) / interval)) * interval;
  return new Date(Date.UTC(Number(original.slice(0, 4)), Number(original.slice(5, 7)) - 1 + months, 1)).toISOString().slice(0, 10);
}

export function recurringServiceNeedsCoverage(history: readonly Pick<Database["public"]["Views"]["finance_schedule_history"]["Row"], "effective_from" | "interval_months">[], interval: number) {
  const original = history.map(term => term.effective_from).filter((date): date is string => Boolean(date)).sort()[0];
  return history.some(term => term.interval_months !== interval || Boolean(original && term.effective_from && monthDistance(original, term.effective_from) % interval !== 0));
}

export function recurringExpenseStatus(term: Term, category: Category | undefined, automation: ExpenseAutomation, changedCadence = false, periodStart?: string) {
  const policy = automation.policies.find(policy => policy.schedule_id === term.schedule_id);
  const periods = automation.periods.filter(period => period.scheduleId === term.schedule_id);
  if ((category && category.nature !== "operating") || (periods.length > 0 && periods.every(period => period.cashOnly)) || automation.excludedScheduleIds?.includes(term.schedule_id) || policy?.policy === "manual") return "excluded";
  if (!category) return "classification";
  // A salary-coded recurring supplier is not proof of payroll ownership. Keep
  // the accounting exclusion, but direct the admin to review its source category.
  if (["salary", "employee_bonus"].includes(category.default_key ?? "")) return "payrollCategory";
  if (term.commitment !== "agreed" || term.certainty !== "fixed") return "fixedAmount";
  if (policy && (policy.service_months !== term.interval_months || Boolean(periodStart && monthDistance(policy.first_period, periodStart) % policy.service_months !== 0))) return "coverage";
  if (automation.configurationIssues?.some(issue => issue.scheduleId === term.schedule_id)) return "conflict";
  if (automation.candidates.some(candidate => periods.some(period => period.sourceId === candidate.sourceId) && candidate.issue)) return "conflict";
  if (!policy) return !changedCadence ? "automatic" : "coverage";
  return "automatic";
}
