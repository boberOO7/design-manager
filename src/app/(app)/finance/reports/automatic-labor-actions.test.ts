import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn(), prior: vi.fn(), snapshot: vi.fn(), fx: vi.fn(), schedule: vi.fn(), expenses: vi.fn() }));
vi.mock("@/lib/finance-automatic-expenses", () => ({ scheduleAutomaticExpenses: mocks.expenses }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFx: mocks.fx }));
vi.mock("@/lib/finance-automatic-labor", () => ({ scheduleAutomaticLabor: mocks.schedule }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
import { previewAutomaticLabor, saveAutomaticLabor } from "./automatic-labor-actions";

const id = "61000000-0000-4000-8000-000000000001", employee = "61000000-0000-4000-8000-000000000002";
const digest = "a".repeat(32);
const source = { obligationId: id, employeeId: employee, label: "Payroll", kind: "payroll", periodStart: "2026-10-01", periodEnd: "2026-10-31",
  currency: "USD", knownCost: "1300", recognizedCost: "0", remainingCost: "1300", deductionsStatus: "fixed", employerStatus: "fixed", basis: "net",
  version: digest, snapshot: {}, sourceReady: true, canConfirm: false };
const period = { obligationId: id, employeeId: employee, label: "Payroll", periodStart: "2026-10-01", periodEnd: "2026-10-31", digest, source,
  expectedMinutes: 1000, completedDays: 1, requiredDays: 1, missingDates: [], projectIds: [], issues: ["fx_required"], manual: false,
  status: "provisional", asOf: "2026-10-19", reportingCurrency: "UAH", shares: {}, pools: [], proposedRemainder: null };
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
function recalculate(rate = "40") { return form({ intent: "recalculate", requestId: employee, obligationId: id, digest, fxMode: "manual", manualRate: rate }); }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ studio_id: id }); mocks.prior.mockResolvedValue({ data: null, error: null });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc, from: (table: string) => {
    const query = { select: () => query, eq: () => query, maybeSingle: table === "finance_planning_requests" ? mocks.prior : mocks.snapshot,
      single: async () => ({ data: { base_currency: "UAH" }, error: null }) };
    return query;
  } });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "get_finance_labor_reporting"
    ? { missingPeriods: [], sources: [], pools: [], allocations: [], automaticPeriods: [period] } : id, error: null }));
  mocks.fx.mockResolvedValue({ rate: "40", source: "manual", effectiveDate: "2026-10-19" });
});
it("uses the open period's as-of FX date without recognizing future payroll", async () => {
  expect((await saveAutomaticLabor({ status: "idle" }, recalculate())).status).toBe("success");
  expect(mocks.fx).toHaveBeenCalledWith("USD", "UAH", "2026-10-19", "manual", "40");
  expect(mocks.rpc).toHaveBeenCalledWith("process_finance_automatic_labor", expect.objectContaining({ p_approve: false,
    p_digest: digest, p_fx: { rate: "40", source: "manual", effectiveDate: "2026-10-19" } }));
  expect(mocks.schedule).toHaveBeenCalledWith(id);
});
it("leaves an invalid or unresolved manual valuation unavailable", async () => {
  expect((await saveAutomaticLabor({ status: "idle" }, recalculate("0"))).message).toBe("errors.FX");
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.fx.mockRejectedValue(new Error("missing rate"));
  expect((await saveAutomaticLabor({ status: "idle" }, recalculate())).message).toBe("errors.FX");
  expect(mocks.rpc).not.toHaveBeenCalledWith("process_finance_automatic_labor", expect.anything());
});
it("rejects a retry that changes the already-saved manual quote", async () => {
  mocks.prior.mockResolvedValue({ data: { result_id: id, payload: { operation: "automatic_labor", obligation: id, digest, approve: false } }, error: null });
  mocks.snapshot.mockResolvedValue({ data: { snapshot: { proposalFx: { source: "manual", rate: "40" } } }, error: null });
  expect((await saveAutomaticLabor({ status: "idle" }, recalculate("41"))).message).toBe("errors.conflict");
  expect((await saveAutomaticLabor({ status: "idle" }, recalculate("40.00"))).status).toBe("success");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("passes an explicitly reviewed source classification to the guarded configuration RPC", async () => {
  const result = await saveAutomaticLabor({ status: "idle" }, form({ intent: "configure", requestId: employee, effectiveFrom: "2026-10-19",
    payrollSourceDigest: digest, payrollCashTermIds: JSON.stringify([id]), previewDigest: digest }));
  expect(result.status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledWith("configure_finance_labor_automation", expect.objectContaining({ p_input: expect.objectContaining({
    payrollSourceDigest: digest, payrollCashTermIds: [id] }) }));
});

it("reuses authoritative settings without asking for a schedule or an internal project", async () => {
  const result = await saveAutomaticLabor({ status: "idle" }, form({ intent: "configure", requestId: employee,
    effectiveFrom: "2026-10-22", previewDigest: digest }));
  expect(result.status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledWith("configure_finance_labor_automation", {
    p_studio_id: id, p_request_id: employee, p_input: { effectiveFrom: "2026-10-22", previewDigest: digest },
  });
});

it("previews a missing historical schedule date without making up a confirmation", async () => {
  const preview = { digest, startsOn: "2026-10-22", capacityFrom: "2026-10-01", recognitionStart: null,
    existingAutomationStart: null, periods: [], historicalCapacityRequired: true,
    costPreview: { asOf: "2026-10-22", reportingCurrency: "UAH", periods: [] } };
  mocks.rpc.mockResolvedValue({ data: preview, error: null });
  expect(await previewAutomaticLabor(form({ effectiveFrom: "2026-10-22", capacityFrom: "2026-10-01" })))
    .toEqual({ status: "success", preview });
  expect(mocks.rpc).toHaveBeenCalledWith("preview_finance_labor_activation", {
    p_studio_id: id, p_input: { effectiveFrom: "2026-10-22", capacityFrom: "2026-10-01" },
  });
});

const invalidScheduleInputs: Record<string, string>[] = [{ dailyMinutes: "0" }, { weekdays: "[8]" }, { weekdays: "broken" }, { capacityFrom: "unknown" }];
it.each(invalidScheduleInputs)(
  "rejects an invalid explicit schedule exception: %j", async values => {
    expect((await saveAutomaticLabor({ status: "idle" }, form({ intent: "configure", requestId: employee,
      effectiveFrom: "2026-10-22", ...values }))).message).toBe("errors.invalid");
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
