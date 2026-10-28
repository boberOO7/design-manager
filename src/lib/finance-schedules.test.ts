import { describe, expect, it } from "vitest";
import { employeeBonusSchema, financeScheduleValidationError,  payrollCompensationSummary, payrollPayoutDate, shiftFinanceMonth, payrollCostSchema, scheduleInputSchema } from "./finance-schedules";
import { movementInputSchema } from "./finance-movements";
const id = "66000000-0000-4000-8000-000000000001";
const payroll = { requestId:id,revision:0,kind:"payroll",employeeId:id,name:"Salary",amount:"1000",currency:"UAH",categoryId:id,intervalMonths:1,payoutDay:31,paymentMonthOffset:1,effectiveFrom:"2026-01-01",commitment:"agreed",certainty:"fixed",basis:"net",employeePayout:"1000",employerCostStatus:"unknown",reason:"Agreement" };

describe("Finance schedule input", () => {
  it("accepts a separate piecework rate without a fixed salary or employee payout", () => {
    const piecework = { ...payroll, payMethod: "per_m2", ratePerM2: "100,005", amount: "", employeePayout: "" };
    expect(scheduleInputSchema.parse(piecework)).toMatchObject({ payMethod: "per_m2", ratePerM2: "100.005", amount: "", employeePayout: "" });
    for (const patch of [{ amount: "1000" }, { employeePayout: "1000" }, { ratePerM2: "" }, { ratePerM2: "0" }, { kind: "recurring" }]) {
      expect(scheduleInputSchema.safeParse({ ...piecework, ...patch }).success).toBe(false);
    }
    expect(scheduleInputSchema.parse(payroll).payMethod).toBe("fixed");
    expect(scheduleInputSchema.safeParse({ ...payroll, ratePerM2: "100" }).success).toBe(false);
  });
  it("summarizes net and gross compensation exactly and distinguishes omitted from explicitly unknown costs", () => {
    expect(payrollCompensationSummary("1000", "net", "100", "50")).toEqual({ employeeReceives: "1000", studioCost: "1150" });
    expect(payrollCompensationSummary("1000", "gross", "100", "50")).toEqual({ employeeReceives: "900", studioCost: "1050" });
    expect(payrollCompensationSummary("1000", "gross", "1000", "50").employeeReceives).toBeNull();
    expect(payrollCompensationSummary("1000", "net", null, "0")).toEqual({ employeeReceives: "1000", studioCost: null });
    expect(payrollCompensationSummary("1000", "net", "0", "0")).toEqual({ employeeReceives: "1000", studioCost: "1000" });
  });
  it("saves blank or omitted extras as fixed zero for net and gross payroll", () => {
    for (const basis of ["net", "gross"] as const) {
      for (const extras of [{}, { employeeDeductions: "", employerCost: "" }]) {
        const terms = scheduleInputSchema.parse({ ...payroll, basis, employerCostStatus: undefined, ...extras });
        expect(terms).toMatchObject({ employeeDeductions: "0", employerCost: "0", employerCostStatus: "fixed" });
        expect(payrollCompensationSummary(terms.amount, basis, terms.employeeDeductions, terms.employerCost)).toEqual({ employeeReceives: "1000", studioCost: "1000" });
      }
      expect(payrollCompensationSummary("1000", basis, "", "")).toEqual({ employeeReceives: "1000", studioCost: "1000" });
      expect(payrollCompensationSummary("1000", basis, "0", null).studioCost).toBeNull();
    }
    expect(scheduleInputSchema.safeParse({ ...payroll, employeeDeductionsUnknown: "true", employeeDeductions: "0" }).success).toBe(false);
  });
  it("retains an intentional employer estimate but clearing its amount establishes zero", () => {
    expect(scheduleInputSchema.parse({ ...payroll, employerCost: "50", employerCostStatus: "estimated" })).toMatchObject({ employerCost: "50", employerCostStatus: "estimated" });
    expect(scheduleInputSchema.parse({ ...payroll, employerCost: "", employerCostStatus: "estimated" })).toMatchObject({ employerCost: "0", employerCostStatus: "fixed" });
  });
  it("maps a selected payout month to its service month and actual payout day", () => {
    expect(shiftFinanceMonth("2026-09", -1)).toBe("2026-08");
    expect(payrollPayoutDate("2026-08-01", 1, 23)).toBe("2026-09-23");
    expect(payrollPayoutDate("2026-01-01", 1, 31)).toBe("2026-02-28");
  });
  it("preserves unknown employer costs and supports explicit zero", () => {
    expect(scheduleInputSchema.parse(payroll).employerCost).toBe("");
    expect(scheduleInputSchema.parse({ ...payroll,employerCostStatus:"fixed",employerCost:"0" }).employerCost).toBe("0");
    expect(scheduleInputSchema.parse({ ...payroll,employerCostStatus:"fixed" }).employerCost).toBe("0");
    expect(scheduleInputSchema.safeParse({ ...payroll,employerCost:"1" }).success).toBe(false);
  });
  it("defaults omitted net deductions to zero and retains intentional unknown", () => {
    expect(scheduleInputSchema.parse(payroll).employeeDeductions).toBe("0");
    expect(scheduleInputSchema.parse({ ...payroll, employeeDeductionsUnknown: "true" }).employeeDeductions).toBe("");
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
  it("defaults gross deductions to zero while requiring a known positive payout", () => {
    expect(scheduleInputSchema.safeParse({ ...payroll,basis:"gross" }).success).toBe(true);
    expect(scheduleInputSchema.safeParse({ ...payroll,basis:"gross",employeeDeductionsUnknown:"true" }).success).toBe(false);
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
      [{ employerCost: "-1" }, "employerCostRequired"],
    ] as const) {
      const result = scheduleInputSchema.safeParse({ ...payroll, ...patch });
      expect(result.success ? "valid" : financeScheduleValidationError(result.error.issues)).toBe(error);
    }
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
