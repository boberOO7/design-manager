import { describe, expect, it } from "vitest";
import { employeeBonusSchema, financeScheduleValidationError, generateObligationsSchema, payrollCostSchema, scheduleInputSchema } from "./finance-schedules";
import { movementInputSchema } from "./finance-movements";
const id = "66000000-0000-4000-8000-000000000001";
const payroll = { requestId:id,revision:0,kind:"payroll",employeeId:id,name:"Salary",amount:"1000",currency:"UAH",categoryId:id,intervalMonths:1,payoutDay:31,paymentMonthOffset:1,effectiveFrom:"2026-01-01",commitment:"agreed",certainty:"fixed",basis:"net",employeePayout:"1000",employerCostStatus:"unknown",reason:"Agreement" };

describe("Finance schedule input", () => {
  it("preserves unknown employer costs and supports explicit zero", () => {
    expect(scheduleInputSchema.parse(payroll).employerCost).toBe("");
    expect(scheduleInputSchema.parse({ ...payroll,employerCostStatus:"fixed",employerCost:"0" }).employerCost).toBe("0");
    expect(scheduleInputSchema.safeParse({ ...payroll,employerCostStatus:"fixed" }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ ...payroll,employerCost:"1" }).success).toBe(false);
  });
  it("preserves unknown net remittances and accepts known amount or explicit zero", () => {
    expect(scheduleInputSchema.parse(payroll).employeeDeductions).toBe("");
    for (const amount of ["0", "125,50"]) {
      expect(scheduleInputSchema.parse({ ...payroll, employeeDeductions: amount }).employeeDeductions).toBe(amount.replace(",", "."));
    }
    expect(scheduleInputSchema.safeParse({ ...payroll, employeeDeductions: "-1" }).success).toBe(false);
  });
  it("requires explicit, reasoned historical cost facts without inferring zero", () => {
    const input = { requestId: id, obligationId: id, component: "deductions", revision: 0, status: "unknown", amount: "", reason: "Payroll statement" };
    expect(payrollCostSchema.parse(input).amount).toBe("");
    for (const status of ["fixed", "estimated"]) {
      for (const amount of ["0", "125.50"]) expect(payrollCostSchema.safeParse({ ...input, status, amount }).success).toBe(true);
      expect(payrollCostSchema.safeParse({ ...input, status }).success).toBe(false);
    }
    for (const patch of [{ reason: " " }, { amount: "0" }, { component: "payout" }, { revision: -1 }]) {
      expect(payrollCostSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
  });
  it("requires explicit gross deductions and positive payout without inventing taxes", () => {
    expect(scheduleInputSchema.safeParse({ ...payroll,basis:"gross" }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ ...payroll,basis:"gross",employeeDeductions:"0" }).success).toBe(true);
    expect(scheduleInputSchema.safeParse({ ...payroll,employeePayout:"0" }).success).toBe(false);
  });
  it("validates full month history, paydays and cadence", () => {
    for (const patch of [{effectiveFrom:"2026-02-02"},{effectiveThrough:"2026-02-27"},{payoutDay:32},{intervalMonths:3},{effectiveThrough:"2025-12-31"}]) {
      expect(scheduleInputSchema.safeParse({ ...payroll,...patch }).success).toBe(false);
    }
    expect(scheduleInputSchema.safeParse({ ...payroll,effectiveThrough:"2026-02-28" }).success).toBe(true);
  });
  it("identifies actionable compensation validation fields", () => {
    for (const [patch, error] of [
      [{ effectiveFrom: "2026-02-02" }, "effectiveFromInput"],
      [{ effectiveThrough: "2026-02-27" }, "effectiveThroughInput"],
      [{ employeeId: "" }, "employeeRequired"],
      [{ amount: "" }, "compensationRequired"],
      [{ employerCostStatus: "fixed" }, "employerCostRequired"],
    ] as const) {
      const result = scheduleInputSchema.safeParse({ ...payroll, ...patch });
      expect(result.success ? "valid" : financeScheduleValidationError(result.error.issues)).toBe(error);
    }
  });
  it("bounds generation to 12 service months and rejects invalid dates", () => {
    const input={ requestId:id,scheduleId:id,from:"2026-01-01",through:"2026-12-01" };
    expect(generateObligationsSchema.safeParse(input).success).toBe(true);
    for(const through of ["2027-01-01","2025-12-01","2026-02-30","2026-02-02"]) expect(generateObligationsSchema.safeParse({...input,through}).success).toBe(false);
  });
  it("keeps employee bonuses separate with explicit service dates", () => {
    const input={requestId:id,employeeId:id,amount:"100,25",currency:"UAH",periodStart:"2026-01-01",periodEnd:"2026-01-31",dueDate:"2026-02-10",description:"Award"};
    expect(employeeBonusSchema.parse(input).amount).toBe("100.25");
    expect(employeeBonusSchema.safeParse({...input,periodEnd:"2025-12-31"}).success).toBe(false);
  });
  it("allows contextual owner-withdrawal settlement without treating it as operating", () => {
    expect(movementInputSchema.safeParse({requestId:id,kind:"owner_withdrawal",date:"2026-09-01",accountId:id,categoryId:id,amount:"100",expectedItemId:id,allocationAmount:"50"}).success).toBe(true);
  });
});
