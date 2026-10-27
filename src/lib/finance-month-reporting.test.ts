import { describe, expect, it } from "vitest";
import { provisionalExpenses, studioProvisionalLabor, summarizeProvisionalReport } from "./finance-month-reporting";
import { laborDataSchema } from "./finance-labor";
import { expenseAutomationSchema } from "./finance-expenses";
import { managementAmountRows, managementDisplayEntries, recognitionEntrySchema } from "./finance-management";

const id = "10000000-0000-4000-8000-000000000001", project = "10000000-0000-4000-8000-000000000002";
const labor = () => laborDataSchema.parse({ sources: [], pools: [], allocations: [], automaticPeriods: [{
  obligationId: id, employeeId: id, label: "Salary", periodStart: "2026-10-01", periodEnd: "2026-10-31", digest: "basis", source: null,
  expectedMinutes: 1000, completedDays: 2, requiredDays: 20, missingDates: ["2026-10-03"], projectIds: [project], issues: ["missing_reports"], manual: false,
  status: "provisional", accruedFrom: "2026-10-02", asOf: "2026-10-04", reportingCurrency: "UAH", provisionalRemainder: "150",
  provisionalDailyAllocations: [{ date: "2026-10-02", projectId: project, amount: "50" }],
  provisionalDailyRemainders: [{ date: "2026-10-02", amount: "50" }, { date: "2026-10-04", amount: "100" }], shares: {}, pools: [],
}] });
const entry = (amount: string, classification: "revenue" | "labor" = "labor") => recognitionEntrySchema.parse({
  id, kind: "recognition", classification, source_kind: "payroll", terms_id: null, expected_item_id: null, movement_id: null,
  obligation_id: classification === "labor" ? id : null, project_id: null, category_id: id, source_snapshot: {}, period_start: "2026-10-01", period_end: "2026-10-31",
  recognized_on: "2026-10-04", description: "Recognized", currency: "UAH", amount, vat_amount: "0", gross_amount: amount,
  reporting_currency: "UAH", reporting_amount: amount, fx_rate: "1", fx_source: "identity", fx_effective_date: "2026-10-04", related_entry_id: null, reason: "Test", created_at: "2026-10-04",
});
const closedLabor = (recognizedCost = "0", remainingCost = "1000") => {
  const data = labor(), period = data.automaticPeriods![0];
  Object.assign(period, { status: "pending", periodStart: "2026-09-01", periodEnd: "2026-09-30", accruedFrom: "2026-09-01", asOf: "2026-09-30",
    source: { obligationId: id, employeeId: id, label: "Salary", kind: "payroll", periodStart: "2026-09-01", periodEnd: "2026-09-30",
      currency: "UAH", knownCost: "1000", recognizedCost, remainingCost, deductionsStatus: "fixed", employerStatus: "fixed", basis: "net",
      version: "a".repeat(32), snapshot: {}, sourceReady: true, canConfirm: true },
    provisionalRemainder: String(Number(remainingCost) * 0.75),
    provisionalDailyAllocations: [{ date: "2026-09-30", projectId: project, amount: String(Number(remainingCost) * 0.25) }],
    provisionalDailyRemainders: [{ date: "2026-09-30", amount: String(Number(remainingCost) * 0.75) }],
  });
  return data;
};
const recognizedRows = (history: ReturnType<typeof entry>[]) => managementAmountRows(managementDisplayEntries(history, "UAH", 2, new Map()));

describe("preliminary studio P&L", () => {
  it("adds incurred labor once, including studio remainder, and retains missing-report warnings", () => {
    const provisional = studioProvisionalLabor(labor(), [], "UAH", 2, new Map());
    const entries = managementAmountRows(managementDisplayEntries([entry("1000", "revenue")], "UAH", 2, new Map()));
    const report = summarizeProvisionalReport(entries, provisional, "2026-10-01", "2026-10-31", 2);
    expect(report.recognized.totals.labor.known).toBe("0.00");
    expect(report.pending.totals.labor.known).toBe("200.00");
    expect(report.combined.knownResult).toBe("800.00");
    expect(report.incomplete).toBe(true);
  });
  it("filters elapsed daily accrual and never includes future or pre-activation capacity", () => {
    const data = labor();
    data.automaticPeriods![0].provisionalDailyRemainders!.push({ date: "2026-10-31", amount: "800" }, { date: "2026-10-01", amount: "500" });
    const rows = studioProvisionalLabor(data, [], "UAH", 2, new Map());
    expect(summarizeProvisionalReport([], rows, "2026-10-02", "2026-10-02", 2).pending.totals.labor.known).toBe("100.00");
    expect(summarizeProvisionalReport([], rows, "2026-10-01", "2026-10-31", 2).pending.totals.labor.known).toBe("200.00");
    expect(summarizeProvisionalReport([], rows, "2026-10-01", "2026-10-31", 2, project).pending.totals.labor.known).toBe("50.00");
  });
  it("replaces provisional labor when its obligation is recognized, even with a stale preview", () => {
    expect(studioProvisionalLabor(labor(), [entry("1000")], "UAH", 2, new Map())).toEqual([]);
    const data = labor(); data.automaticPeriods![0].status = "applied";
    expect(studioProvisionalLabor(data, [], "UAH", 2, new Map())).toEqual([]);
  });
  it("keeps missing FX distinct from an explicit zero and uses snapshot display dates", () => {
    const data = labor(); const period = data.automaticPeriods![0]; period.reportingCurrency = "USD";
    period.provisionalFx = { rate: "40", source: "manual", effectiveDate: "2026-10-03" };
    const missing = studioProvisionalLabor(data, [], "EUR", 2, new Map());
    expect(summarizeProvisionalReport([], missing, "2026-10-01", "2026-10-31", 2).combined.missingFx).toBe(3);
    const valued = studioProvisionalLabor(data, [], "EUR", 2, new Map([["2026-10-03", "0.9"], ["2026-10-04", "99"]]));
    expect(summarizeProvisionalReport([], valued, "2026-10-01", "2026-10-31", 2).pending.totals.labor.known).toBe("180.00");
    period.provisionalRemainder = null;
    const unknown = studioProvisionalLabor(data, [], "EUR", 2, new Map());
    expect(unknown[0].display_amount).toBeNull();
    const incomplete = summarizeProvisionalReport([], unknown, "2026-10-01", "2026-10-31", 2);
    expect(incomplete.combined.missingFx).toBe(0);
    expect(incomplete.unknownSources).toBe(1);
    period.issues = ["fx_required"];
    expect(summarizeProvisionalReport([], studioProvisionalLabor(data, [], "EUR", 2, new Map()), "2026-10-01", "2026-10-31", 2).combined.missingFx).toBe(1);
    period.provisionalRemainder = "0"; period.provisionalDailyAllocations = []; period.provisionalDailyRemainders = [{ date: "2026-10-02", amount: "0" }];
    expect(studioProvisionalLabor(data, [], "EUR", 2, new Map())[0].display_amount).toBe("0.00");
  });
  it("keeps known closed payroll pending, separately attributed and outside recognized rows", () => {
    const data = closedLabor();
    const provisional = studioProvisionalLabor(data, [], "UAH", 2, new Map());
    const report = summarizeProvisionalReport([], provisional, "2026-09-01", "2026-09-30", 2);
    expect(report.recognized.totals.labor.known).toBe("0.00");
    expect(report.pending.totals.labor.known).toBe("1000.00");
    expect(provisional.find(row => row.project_id === null)?.display_amount).toBe("750.00");
    expect(summarizeProvisionalReport([], provisional, "2026-09-01", "2026-09-30", 2, project).pending.totals.labor.known).toBe("250.00");
    expect(report.incomplete).toBe(true);
    expect(data.automaticPeriods![0].status).toBe("pending");
    expect(summarizeProvisionalReport([], provisional, "2026-09-01", "2026-09-29", 2).pending.totals.labor.known).toBe("0.00");
  });
  it("conserves recognized plus provisional cost through partial recognition, reversal and finalization", () => {
    const data = closedLabor("400", "600");
    const partial = { ...entry("400"), recognized_on: "2026-09-30" };
    data.automaticPeriods![0].pools = [{ id, available: "400", native: "400", revision: 0, fx: null }];
    const pending = studioProvisionalLabor(data, [partial], "UAH", 2, new Map());
    const report = summarizeProvisionalReport(recognizedRows([partial]), pending, "2026-09-01", "2026-09-30", 2);
    expect(report.recognized.totals.labor.known).toBe("400.00");
    expect(report.pending.totals.labor.known).toBe("600.00");
    expect(report.combined.totals.labor.known).toBe("1000.00");
    const final = { ...entry("600"), id: project, recognized_on: "2026-09-30" };
    expect(studioProvisionalLabor(data, [partial, final], "UAH", 2, new Map())).toEqual([]);
    expect(studioProvisionalLabor(closedLabor("1000", "0"), [partial, final], "UAH", 2, new Map())).toEqual([]);
    const reversed = { ...partial, kind: "reversal" as const, id: project, amount: "-400", related_entry_id: id };
    expect(summarizeProvisionalReport([], studioProvisionalLabor(closedLabor(), [partial, reversed], "UAH", 2, new Map()), "2026-09-01", "2026-09-30", 2).pending.totals.labor.known).toBe("1000.00");
    data.automaticPeriods![0].status = "applied";
    expect(studioProvisionalLabor(data, [], "UAH", 2, new Map())).toEqual([]);
  });
  it("retains closed missing-source and missing-FX warnings without inventing costs", () => {
    const data = closedLabor(), period = data.automaticPeriods![0];
    period.provisionalRemainder = null;
    period.source = null;
    const missing = summarizeProvisionalReport([], studioProvisionalLabor(data, [], "UAH", 2, new Map()), "2026-09-01", "2026-09-30", 2);
    expect(missing).toMatchObject({ incomplete: true, unknownSources: 1, combined: { missingFx: 0 } });
    expect(missing.pending.totals.labor.known).toBe("0.00");
    period.issues = ["fx_required"];
    expect(summarizeProvisionalReport([], studioProvisionalLabor(data, [], "UAH", 2, new Map()), "2026-09-01", "2026-09-30", 2))
      .toMatchObject({ incomplete: true, unknownSources: 0, combined: { missingFx: 1 } });
  });
  it("uses dated display FX for closed deltas and keeps unresolved extra costs incomplete", () => {
    const data = closedLabor();
    data.automaticPeriods![0].provisionalFx = { rate: "1", source: "manual", effectiveDate: "2026-09-29" };
    data.automaticPeriods![0].issues = ["unknown_employer_cost"];
    const rows = studioProvisionalLabor(data, [], "EUR", 2, new Map([["2026-09-29", "0.5"]]));
    expect(summarizeProvisionalReport([], rows, "2026-09-01", "2026-09-30", 2))
      .toMatchObject({ incomplete: true, combined: { totals: { labor: { known: "500.00", missingFx: 0 } } } });
    expect(summarizeProvisionalReport([], studioProvisionalLabor(data, [], "EUR", 2, new Map()), "2026-09-01", "2026-09-30", 2).combined.missingFx).toBe(2);
  });
  it("adds only eligible net service deltas; a final candidate disappears without double counting", () => {
    const candidate = { action: "recognize", studioId: id, sourceId: id, policyId: id, month: "2026-10-01", from: "2026-10-01", to: "2026-10-04",
      amount: "20", currency: "UAH", reportingCurrency: "UAH", projectId: null, label: "Service", digest: "digest", issue: null };
    const data = expenseAutomationSchema.parse({ projects: [], policies: [], periods: [], missingFx: [], candidates: [candidate, { ...candidate, sourceId: project, issue: "source_changed" }] });
    const pending = provisionalExpenses(data, new Map([[`${id}-2026-10-01`, "20.00"]]));
    expect(pending).toHaveLength(1);
    expect(summarizeProvisionalReport([], pending, "2026-10-01", "2026-10-31", 2).combined.knownResult).toBe("-20.00");
    const protectedCandidate = { ...data.candidates[0], issue: "history_protected" };
    const protectedRows = provisionalExpenses({ ...data, candidates: [protectedCandidate] }, new Map([[`${id}-2026-10-01`, "20.00"]]));
    expect(protectedRows[0]).toMatchObject({ display_amount: "20.00", incomplete: true });
    data.candidates = [];
    expect(provisionalExpenses(data, new Map())).toEqual([]);
    expect(provisionalExpenses({ ...data, candidates: [{ ...candidate, action: "recognize" }] }, new Map())[0].display_amount).toBeNull();
  });
});
