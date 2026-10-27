import { expect, it } from "vitest";
import { recurringExpenseStatus, recurringServiceNeedsCoverage, nextRecurringServicePeriod } from "./finance-recurring-expenses";
import type { ExpenseAutomation } from "./finance-expenses";
const id = "61000000-0000-4000-8000-000000000001";
const automation: ExpenseAutomation = { policies: [], periods: [], candidates: [], projects: [], missingFx: [] };
const term = { schedule_id: id, interval_months: 1, certainty: "fixed", commitment: "agreed" };
const category = { nature: "operating", default_key: "rent" };
const policy: ExpenseAutomation["policies"][number] = { id, schedule_id: id, revision: 1, first_period: "2026-09-01", service_start: "2026-09-01", service_months: 1, effective_from: "2026-10-19", policy: "service_days", project_id: null };
it("defaults eligible monthly schedules without requiring service confirmation", () => {
  expect(recurringExpenseStatus(term, category, automation)).toBe("automatic");
  expect(recurringExpenseStatus(term, category, automation, true)).toBe("coverage");
  expect(recurringExpenseStatus(term, category, { ...automation, policies: [policy] })).toBe("automatic");
});
it("derives stable annual and quarterly coverage but requires clarification for changed cadence", () => {
  for (const interval_months of [3, 12]) {
    expect(recurringExpenseStatus({ ...term, interval_months }, category, automation)).toBe("automatic");
    expect(recurringExpenseStatus({ ...term, interval_months }, category, automation, true)).toBe("coverage");
    expect(recurringExpenseStatus({ ...term, interval_months }, category, { ...automation, policies: [policy] })).toBe("coverage");
  }
  expect(recurringExpenseStatus(term, category, { ...automation, policies: [{ ...policy, service_months: 12 }] })).toBe("coverage");
  expect(recurringExpenseStatus({ ...term, interval_months: 12 }, category, { ...automation, policies: [{ ...policy, service_months: 12 }] })).toBe("automatic");
});
it("excludes owner distributions and explicitly reviewed payroll cash sources", () => {
  expect(recurringExpenseStatus(term, { nature: "owner_distribution", default_key: "owner_distribution" }, automation)).toBe("excluded");
  expect(recurringExpenseStatus(term, category, { ...automation, excludedScheduleIds: [id] })).toBe("excluded");
  expect(recurringExpenseStatus(term, category, { ...automation, periods: [{ scheduleId: id, periodStart: "2026-10-01", periodEnd: "2026-10-31", sourceId: id, serviceMonths: 1, cashOnly: true }] })).toBe("excluded");
});
it("requests source classification for salary-coded suppliers without claiming payroll ownership", () => {
  for (const default_key of ["salary", "employee_bonus"]) {
    const category = { nature: "operating", default_key };
    expect(recurringExpenseStatus(term, category, automation)).toBe("payrollCategory");
    expect(recurringExpenseStatus(term, category, { ...automation, policies: [policy] })).toBe("payrollCategory");
    expect(recurringExpenseStatus(term, category, { ...automation, periods: [{ scheduleId: id, periodStart: "2026-10-01", periodEnd: "2026-10-31", sourceId: id, serviceMonths: 1, cashOnly: true }] })).toBe("excluded");
  }
});
it("uses semantic category keys rather than translated or ambiguous display labels", () => {
  const renamedService = { ...category, name: "Salary" };
  const renamedPayroll = { nature: "operating", default_key: "salary", name: "Accounting" };
  expect(recurringExpenseStatus(term, renamedService, automation)).toBe("automatic");
  expect(recurringExpenseStatus(term, renamedPayroll, automation)).toBe("payrollCategory");
});
it("preserves manual policies and surfaces a specific missing source fact", () => {
  expect(recurringExpenseStatus(term, category, { ...automation, policies: [{ ...policy, policy: "manual" }] })).toBe("excluded");
  expect(recurringExpenseStatus(term, { nature: "operating", default_key: "salary" }, { ...automation, policies: [{ ...policy, policy: "manual" }] })).toBe("excluded");
  expect(recurringExpenseStatus(term, undefined, automation)).toBe("classification");
  expect(recurringExpenseStatus({ ...term, certainty: "estimated" }, category, automation)).toBe("fixedAmount");
});

it("keeps annual renewal revisions aligned with the original service cycle", () => {
  expect(nextRecurringServicePeriod("2025-09-01", 12, "2026-10-01")).toBe("2027-09-01");
  expect(nextRecurringServicePeriod("2025-09-01", 12, "2026-09-01")).toBe("2026-09-01");
  expect(nextRecurringServicePeriod("2026-09-01", 1, "2026-11-01")).toBe("2026-11-01");
  expect(recurringServiceNeedsCoverage([{ effective_from: "2025-09-01", interval_months: 12 }, { effective_from: "2026-11-01", interval_months: 12 }], 12)).toBe(true);
  expect(recurringServiceNeedsCoverage([{ effective_from: "2025-09-01", interval_months: 12 }, { effective_from: "2026-09-01", interval_months: 12 }], 12)).toBe(false);
  expect(recurringExpenseStatus({ ...term, interval_months: 12 }, category, { ...automation, policies: [{ ...policy, service_months: 12 }] }, false, "2026-11-01")).toBe("coverage");
  expect(recurringExpenseStatus({ ...term, interval_months: 12 }, category, { ...automation, policies: [{ ...policy, service_months: 12 }] }, false, "2027-09-01")).toBe("automatic");
});

it("treats external contractor services by category and ownership, without assuming employee payroll", () => {
  expect(recurringExpenseStatus(term, { nature: "operating", default_key: null }, automation)).toBe("automatic");
  expect(recurringExpenseStatus(term, { nature: "operating", default_key: null }, { ...automation, excludedScheduleIds: [id] })).toBe("excluded");
});
