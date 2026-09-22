import { describe, expect, it } from "vitest";
import { tripDays, tripEntrySchema, tripInputSchema, tripPerDiem, sumTripMoney, tripPlanSummary } from "./finance-trips";
const id = "79000000-0000-4000-8000-000000000001";
const expense = { requestId: id, tripId: id, kind: "expense", expenseType: "travel", amount: "100.12", currency: "UAH", date: "2026-09-12", employeeId: id };
describe("business trips", () => {
  it("validates dates, optional project and multiple travelers", () => {
    const input = { requestId: id, title: "Warsaw", destination: "Warsaw", startsOn: "2026-09-12", endsOn: "2026-09-15", status: "planned", travelers: [id,"79000000-0000-4000-8000-000000000002"] };
    expect(tripInputSchema.parse(input).projectId).toBe("");
    expect(tripInputSchema.safeParse({ ...input, endsOn: "2026-09-11" }).success).toBe(false);
  });
  it("keeps personal expense entry separate from cash posting", () => {
    expect(tripEntrySchema.safeParse(expense).success).toBe(true);
    expect(tripEntrySchema.safeParse({ ...expense, accountId: id }).success).toBe(false);
    expect(tripEntrySchema.safeParse({ ...expense, employeeId: "", accountId: id }).success).toBe(true);
    expect(tripEntrySchema.safeParse({ ...expense, employeeId: "", movementId: id }).success).toBe(true);
    expect(tripEntrySchema.safeParse({ ...expense, employeeId: "", movementId: id, accountId: id }).success).toBe(false);
    expect(tripEntrySchema.safeParse({ ...expense, kind: "advance", accountId: id }).success).toBe(true);
  });
  it("calculates inclusive days and exact daily allowances without statutory rates", () => {
    expect(tripDays("2026-10-12", "2026-10-15")).toBe(4);
    expect(tripDays("2026-10-25", "2026-10-26")).toBe(2);
    expect(tripDays("2026-02-30", "2026-03-01")).toBe(0);
    expect(tripPerDiem("800", 4, 2)).toBe("3200.00");
    expect(tripPerDiem("0.1234", 3, 4)).toBe("0.3702");
    expect(() => tripPerDiem("1", 0, 2)).toThrow();
    expect(() => tripPerDiem("1.001", 4, 2)).toThrow();
  });
  it("retains exact large reporting summaries and negative corrections", () => {
    expect(sumTripMoney(["9999999999999999.01", "0.02", "-0.01"], 2)).toBe("9999999999999999.02");
    expect(sumTripMoney(["-100", "20"], 2)).toBe("-80.00");
  });
});

it("calculates covered per diem for all travelers and a selected subset", () => {
  expect(tripPerDiem("50",3,2,2)).toBe("300.00");
  expect(tripPerDiem("50",3,2,1)).toBe("150.00");
  expect(()=>tripPerDiem("50",3,2,0)).toThrow();
});
it("distinguishes absent plans, incomplete FX, current estimates and actual variance",()=>{
  const plan={id:"plan",kind:"plan",reverses_id:null,amount:"1200",currency:"PLN"};
  expect(tripPlanSummary([],{},2,"33038")).toMatchObject({has_plan:false,planned_amount:null,variance:null});
  expect(tripPlanSummary([plan],{plan:null},2,"33038")).toMatchObject({has_plan:true,plan_incomplete:true,variance:null});
  expect(tripPlanSummary([plan],{plan:"35000"},2,"33038")).toMatchObject({planned_amount:"35000.00",variance:"-1962.00"});
  expect(tripPlanSummary([plan],{plan:"36000"},2,"33038").variance).toBe("-2962.00");
  expect(tripPlanSummary([plan,{...plan,id:"correction",reverses_id:"plan",amount:"-1200"}],{},2,"0").has_plan).toBe(false);
});
