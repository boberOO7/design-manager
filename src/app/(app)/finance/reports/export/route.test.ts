import { beforeEach, expect, it, vi } from "vitest";
import { laborDataSchema } from "@/lib/finance-labor";
import { studioProvisionalLabor, summarizeProvisionalReport } from "@/lib/finance-month-reporting";
import { managementAmountRows, managementDisplayEntries, recognitionEntrySchema } from "@/lib/finance-management";

const mocks = vi.hoisted(() => ({ management: vi.fn(), admin: vi.fn() }));
vi.mock("@/data/queries/finance-management", () => ({ getFinanceManagement: mocks.management }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
import { GET } from "./route";

const id = "10000000-0000-4000-8000-000000000001", project = "10000000-0000-4000-8000-000000000002";
function report(recognized: "400" | "1000" = "400", missingFx = false) {
  const entry = recognitionEntrySchema.parse({ id, kind: "recognition", classification: "labor", source_kind: "labor",
    obligation_id: id, employee_id: id, project_id: null, category_id: id, terms_id: null, expected_item_id: null, movement_id: null,
    source_snapshot: {}, period_start: "2026-09-01", period_end: "2026-09-30", recognized_on: "2026-09-30", description: "Salary",
    currency: "UAH", amount: recognized, vat_amount: "0", gross_amount: recognized, reporting_currency: "UAH", reporting_amount: recognized,
    fx_rate: "1", fx_source: "identity", fx_effective_date: "2026-09-30", related_entry_id: null, reason: "Payroll", created_at: "2026-09-30" });
  const entries = managementDisplayEntries([entry], "UAH", 2, new Map());
  const labor = laborDataSchema.parse({ sources: [], pools: [], allocations: [], automaticPeriods: [{
    obligationId: id, employeeId: id, label: "Salary", periodStart: "2026-09-01", periodEnd: "2026-09-30", digest: "basis",
    source: { obligationId: id, employeeId: id, label: "Salary", kind: "payroll", periodStart: "2026-09-01", periodEnd: "2026-09-30",
      currency: "UAH", knownCost: "1000", recognizedCost: recognized, remainingCost: recognized === "400" ? "600" : "0",
      deductionsStatus: "fixed", employerStatus: "fixed", basis: "net", version: "a".repeat(32), snapshot: {}, sourceReady: true, canConfirm: true },
    expectedMinutes: 1000, completedDays: 2, requiredDays: 20, missingDates: ["2026-09-03"], projectIds: [project],
    issues: missingFx ? ["fx_required"] : [], manual: false, status: recognized === "400" ? "pending" : "applied",
    accruedFrom: "2026-09-01", asOf: "2026-09-30", reportingCurrency: "UAH", pools: [], shares: {},
    provisionalRemainder: missingFx ? null : "450", provisionalDailyAllocations: [{ date: "2026-09-30", projectId: project, amount: "150" }],
    provisionalDailyRemainders: [{ date: "2026-09-30", amount: "450" }],
  }] });
  return { version: "version", currency: { code: "UAH", minor_units: 2 },
    filters: { from: "2026-09-01", to: "2026-09-30", mode: "pnl" }, settings: { recognition_start_month: "2026-09-01" },
    labor, entries, amountRows: managementAmountRows(entries), projectRows: [], coverage: [], months: [], tripSources: [],
    earnings: { recognitionStart: "2026-09-01", orders: [], milestones: [] },
    provisional: studioProvisionalLabor(labor, [entry], "UAH", 2, new Map()) };
}
beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ studio_id: id }); });
it("exports the same recognized, provisional and combined labor as Management Reports across finalization", async () => {
  for (const recognized of ["400", "1000"] as const) {
    const data = report(recognized);
    mocks.management.mockResolvedValue(data);
    const summary = summarizeProvisionalReport(data.amountRows, data.provisional, data.filters.from, data.filters.to, 2);
    const response = await GET(new Request("http://localhost/finance/reports/export?version=version"));
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain(`labor,${summary.recognized.totals.labor.known},${summary.pending.totals.labor.known},1000.00,0`);
    expect(csv).toContain("2026-09-01,0.00,0.00,1000.00,0.00,-1000.00,0");
    if (recognized === "400") expect(csv).toContain(`${id},2026-09-30,labor,,450.00,true,`);
    else expect(data.provisional).toEqual([]);
  }
});
it("exports unresolved provisional FX and source warnings without manufacturing a zero-cost fact", async () => {
  const data = report("400", true);
  mocks.management.mockResolvedValue(data);
  const csv = await (await GET(new Request("http://localhost/finance/reports/export?version=version"))).text();
  expect(csv).toContain("labor,400.00,0.00,400.00,1");
  expect(csv).toContain(`${id},2026-09-30,labor,,,true,fx`);
});
