import { describe, expect, it } from "vitest";
import { financeProjectError, projectCancellationSchema, projectContextSchema, projectTermsSchema, supervisionMonthsSchema, supervisionVisitTerms } from "./finance-projects";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
const id = "65000000-0000-4000-8000-000000000001";
const base = { requestId: id, projectId: id, revision: 0, stream: "design", mode: "design", amount: "100,25", currency: "UAH", reason: "Signed terms" };
describe("Project Finance inputs", () => {
  it("requires a cancellation reason and explicit retention confirmation", () => {
    const input = { requestId:id, itemId:id, version:1, settledAmount:"0", reason:"Terminated" };
    expect(projectCancellationSchema.safeParse(input).success).toBe(true);
    expect(projectCancellationSchema.safeParse({...input,reason:" "}).success).toBe(false);
    expect(projectCancellationSchema.safeParse({...input,settledAmount:"40000"}).success).toBe(false);
    expect(projectCancellationSchema.safeParse({...input,settledAmount:"40000",retainSettlement:"true"}).success).toBe(true);
  });
  it("selects historical terms by Kyiv visit date, including stopped and expired revisions", () => {
    const june={id,stream:"supervision",mode:"per_visit",amount:3000,currency:"UAH",effective_from:"2026-06-01",effective_through:null,revision:1};
    const september={...june,id:"September",amount:4000,currency:"USD",effective_from:"2026-09-01",revision:2};
    const history=[september,june];
    expect(supervisionVisitTerms(history,"2026-06-15T10:00:00Z")).toEqual(june);
    expect(supervisionVisitTerms(history,"2026-08-31T20:59:59Z")).toEqual(june);
    expect(supervisionVisitTerms(history,"2026-08-31T21:00:00Z")).toEqual(september);
    expect(supervisionVisitTerms(history,"2026-05-30T10:00:00Z")).toBeNull();
    expect(supervisionVisitTerms([{...september,mode:"stopped"},june],"2026-09-10T10:00:00Z")).toBeNull();
    expect(supervisionVisitTerms([{...september,effective_through:"2026-09-05"},june],"2026-09-10T10:00:00Z")).toBeNull();
    expect(supervisionVisitTerms([{...september,mode:"monthly"},june],"2026-09-10T10:00:00Z")?.mode).toBe("monthly");
  });
  it("uses Finance precision input and requires an explicit amendment note", () => {
    expect(projectTermsSchema.parse(base).amount).toBe("100.25");
    expect(projectTermsSchema.safeParse({ ...base, reason: "" }).success).toBe(false);
  });
  it("represents ongoing monthly supervision as a rate with no lifetime end", () => {
    expect(projectTermsSchema.safeParse({ ...base, stream: "supervision", mode: "monthly", effectiveFrom: "2026-09-01" }).success).toBe(true);
    expect(projectTermsSchema.safeParse({ ...base, stream: "supervision", mode: "monthly", effectiveFrom: "2026-09-02" }).success).toBe(false);
    expect(projectTermsSchema.safeParse({ ...base, stream: "supervision", mode: "monthly", effectiveFrom: "2026-09-01", effectiveThrough: "2026-09-29" }).success).toBe(false);
  });
  it("bounds explicit generation to twelve complete calendar months", () => {
    const v = { requestId: id, projectId: id, from: "2026-09-01", through: "2027-08-01" };
    expect(supervisionMonthsSchema.safeParse(v).success).toBe(true);
    expect(supervisionMonthsSchema.safeParse({ ...v, through: "2027-09-01" }).success).toBe(false);
    expect(supervisionMonthsSchema.safeParse({ ...v, from: "2026-09-02" }).success).toBe(false);
  });
  it("requires a concrete visit and keeps contractors in the bonus stream", () => {
    expect(projectContextSchema.safeParse({ projectId: id, stream: "supervision", source: "visit" }).success).toBe(false);
    expect(projectContextSchema.safeParse({ projectId: id, stream: "supervision", source: "visit", visitId: id }).success).toBe(true);
    expect(projectContextSchema.safeParse({ projectId: id, stream: "design", contractorId: id }).success).toBe(false);
    expect(projectContextSchema.safeParse({ projectId: id, stream: "contractor_bonus", contractorId: id }).success).toBe(true);
  });
  it("provides actionable localizations for domain conflicts", () => {
    for (const message of ["finance_project_cancellation_required", "finance_project_retention_required", "finance_project_visit_price_changed", "finance_project_over_scheduled", "finance_project_currency_locked", "finance_project_settled_terms_locked", "finance_supervision_generated_period", "finance_supervision_range_invalid", "finance_project_visit_not_billable", "finance_project_agreement_required", "duplicate key finance_project_visit_once"]) {
      const key = financeProjectError(message);
      expect(key).not.toBeNull();
      if (key) { expect(en.Finance.project.errors[key]).toBeTruthy(); expect(uk.Finance.project.errors[key]).toBeTruthy(); }
    }
    expect(uk.ProjectWorkspace.finance).toBe("Фінанси");
  });
});
