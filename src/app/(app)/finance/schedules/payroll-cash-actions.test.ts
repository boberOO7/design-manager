import { beforeEach, expect, it, vi } from "vitest";
import { payrollCashInputSchema, payrollPaymentInputSchema } from "@/lib/finance-payroll-earnings";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn(), prior: vi.fn(), terms: vi.fn(), foundation: vi.fn(), fx: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/data/queries/finance", () => ({ getFinanceData: mocks.foundation }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFx: mocks.fx, defaultFinanceReportingSource: "nbu" }));
vi.mock("@/lib/finance-automatic-labor", () => ({ scheduleAutomaticLabor: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
import { loadFinancePayrollPayment, recordFinancePayrollAdvance, recordFinancePayrollPayment } from "./payroll-actions";
const id = "64000000-0000-4000-8000-000000000100", date = "2026-10-20";
const input = { requestId: id, scheduleId: id, currency: "USD", accountId: id, date, amount: "8000", note: "Salary advance", mode: "manual", manualRate: "40" };
const payment = { requestId: id, itemId: id, accountId: id, date, amount: "0", digest: "a".repeat(32), note: "Apply advance", mode: "manual", manualRate: "50" };
const context = { obligationId: id, employeeId: id, employeeName: "Employee", currency: "USD", remaining: "1000", date, rate: null, advanceAvailable: "200", advanceUsed: "200", totalUah: null, cashDue: null, digest: "a".repeat(32) };
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ studio_id: "verified" });
  mocks.prior.mockResolvedValue({ data: null, error: null }); mocks.terms.mockResolvedValue({ data: { currency: "USD" }, error: null });
  const query = (result: typeof mocks.prior) => ({ select: () => query(result), eq: () => query(result), lte: () => query(result), order: () => query(result), limit: () => query(result), maybeSingle: result });
  mocks.client.mockResolvedValue({ from: (table: string) => query(table === "finance_planning_requests" ? mocks.prior : mocks.terms), rpc: mocks.rpc });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "get_finance_payroll_payment" ? context : id, error: null }));
  mocks.foundation.mockResolvedValue({ settings: { finalized_at: date, base_currency: "UAH" } });
  mocks.fx.mockImplementation(async (from: string, _to: string, day: string, mode: string, manual: string) => ({ rate: from === "UAH" ? "1" : manual || "50", source: from === "UAH" ? "identity" : mode, effectiveDate: day }));
});
it("uses the verified tenant and advance payment date to fix USD credit", async () => {
  expect((await recordFinancePayrollAdvance({ status: "idle" }, form({ ...input, studioId: "spoofed" }))).status).toBe("success");
  expect(mocks.fx).toHaveBeenCalledWith("USD", "UAH", date, "manual", "40");
  expect(mocks.rpc).toHaveBeenCalledWith("record_finance_payroll_advance", expect.objectContaining({ p_studio_id: "verified", p_request_id: id, p_input: expect.objectContaining({ amount: "8000", payrollFx: { rate: "40", source: "manual", effectiveDate: date } }) }));
});
it("does not post an advance without the USD settlement quote", async () => {
  mocks.fx.mockRejectedValue(new Error("FX unavailable"));
  expect(await recordFinancePayrollAdvance({ status: "idle" }, form(input))).toEqual({ status: "error", message: "movements.errors.fx" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("allows applying an advance with zero new cash while quoting the salary payment date", async () => {
  expect((await recordFinancePayrollPayment({ status: "idle" }, form(payment))).status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledWith("record_finance_payroll_payment", expect.objectContaining({ p_item_id: id, p_input: expect.objectContaining({ amount: "0", digest: payment.digest, payrollFx: { rate: "50", source: "manual", effectiveDate: date } }) }));
});
it("recovers an advance retry despite JSONB key ordering and unavailable FX", async () => {
  const original = payrollCashInputSchema.parse(input);
  mocks.prior.mockResolvedValue({ data: { payload: { operation: "payroll_advance", input: { submission: Object.fromEntries(Object.entries(original).reverse()) } } }, error: null });
  mocks.fx.mockRejectedValue(new Error("outage"));
  expect((await recordFinancePayrollAdvance({ status: "idle" }, form(input))).status).toBe("success");
  expect(mocks.fx).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  expect((await recordFinancePayrollAdvance({ status: "idle" }, form({ ...input, amount: "8001" }))).status).toBe("error");
});
it("recovers credit-only settlement retries before recalculating FX or preview", async () => {
  mocks.prior.mockResolvedValue({ data: { payload: { operation: "payroll_payment", input: { submission: payrollPaymentInputSchema.parse(payment) } } }, error: null });
  expect((await recordFinancePayrollPayment({ status: "idle" }, form(payment))).status).toBe("success");
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.fx).not.toHaveBeenCalled();
});
it("keeps the preview unavailable when FX cannot be resolved", async () => {
  mocks.fx.mockRejectedValue(new Error("outage"));
  expect(await loadFinancePayrollPayment(id, date)).toMatchObject({ rate: null, cashDue: null });
});
it("denies unauthorized cash and payment actions before opening a client", async () => {
  mocks.admin.mockResolvedValue(null);
  expect((await recordFinancePayrollAdvance({ status: "idle" }, form(input))).status).toBe("error");
  expect((await recordFinancePayrollPayment({ status: "idle" }, form(payment))).status).toBe("error");
  expect(mocks.client).not.toHaveBeenCalled();
});
