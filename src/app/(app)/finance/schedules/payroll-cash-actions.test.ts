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
const context = { obligationId: id, employeeId: id, employeeName: "Employee", currency: "USD", remaining: "1000", date, rate: null, paymentCurrency: "UAH", advanceAvailable: "200", advanceUsed: "200", totalPayment: null, cashDue: null, digest: "a".repeat(32) };
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ studio_id: "verified" });
  mocks.prior.mockResolvedValue({ data: null, error: null }); mocks.terms.mockResolvedValue({ data: { currency: "USD" }, error: null });
  const query = (result: typeof mocks.prior) => ({ select: () => query(result), eq: () => query(result), lte: () => query(result), order: () => query(result), limit: () => query(result), maybeSingle: result });
  mocks.client.mockResolvedValue({ from: (table: string) => query(table === "finance_planning_requests" ? mocks.prior : mocks.terms), rpc: mocks.rpc });
  mocks.rpc.mockImplementation(async (name: string, args: {p_fx?: {creditOnly?: boolean}}) => ({ data: name === "get_finance_payroll_payment" ? { ...context, ...(args.p_fx?.creditOnly ? {cashDue:"0"} : {}) } : id, error: null }));
  mocks.foundation.mockResolvedValue({ settings: { finalized_at: date, base_currency: "UAH" }, accounts: [{id, currency: "UAH", archived_at: null}], currencies: [{code:"UAH",minor_units:2},{code:"USD",minor_units:2}] });
  mocks.fx.mockImplementation(async (from: string, _to: string, day: string, mode: string, manual: string) => ({ rate: from === "UAH" ? "1" : manual || "50", source: from === "UAH" ? "identity" : mode, effectiveDate: day }));
});
it("uses the verified tenant and advance payment date to fix USD credit", async () => {
  expect((await recordFinancePayrollAdvance({ status: "idle" }, form({ ...input, studioId: "spoofed" }))).status).toBe("success");
  expect(mocks.fx).toHaveBeenCalledWith("USD", "UAH", date, "manual", "40");
  expect(mocks.rpc).toHaveBeenCalledWith("record_finance_payroll_advance", expect.objectContaining({ p_studio_id: "verified", p_request_id: id, p_input: expect.objectContaining({ amount: "8000", payrollFx: { rate: "40", source: "manual", effectiveDate: date, paymentCurrency: "UAH" } }) }));
});
it("does not post an advance without the USD settlement quote", async () => {
  mocks.fx.mockRejectedValue(new Error("FX unavailable"));
  expect(await recordFinancePayrollAdvance({ status: "idle" }, form(input))).toEqual({ status: "error", message: "movements.errors.fx" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([undefined, "   "])("records an advance without a purpose (%s) using an automatic description", async (note) => {
  const data = form(input);
  if (note === undefined) data.delete("note"); else data.set("note", note);
  expect((await recordFinancePayrollAdvance({ status: "idle" }, data)).status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledWith("record_finance_payroll_advance", expect.objectContaining({ p_input: expect.objectContaining({
    note: "payrollCash.advanceDescription", submission: expect.objectContaining({ note: "" }),
  }) }));
});
it("recovers an advance retry without a purpose before recalculating FX", async () => {
  const data = form(input); data.delete("note");
  const original = payrollCashInputSchema.parse(Object.fromEntries(data));
  mocks.prior.mockResolvedValue({ data: { payload: { operation: "payroll_advance", input: { note: "Аванс зарплати", submission: original } } }, error: null });
  mocks.fx.mockRejectedValue(new Error("outage"));
  expect((await recordFinancePayrollAdvance({ status: "idle" }, data)).status).toBe("success");
  expect(mocks.fx).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("applies an advance with zero new cash without any current FX lookup", async () => {
  expect((await recordFinancePayrollPayment({ status: "idle" }, form(payment))).status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledWith("record_finance_payroll_payment", expect.objectContaining({ p_item_id: id, p_input: expect.objectContaining({ amount: "0", digest: payment.digest, fx: null, payrollFx: { paymentCurrency: "UAH", creditOnly: true } }) }));
  expect(mocks.fx).not.toHaveBeenCalled();
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

it("passes the reviewed earning digest into the atomic payment RPC", async () => {
  const earningDigest = "b".repeat(32);
  expect((await recordFinancePayrollPayment({ status: "idle" }, form({ ...payment, earningDigest }))).status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledWith("record_finance_payroll_payment", expect.objectContaining({ p_input: expect.objectContaining({
    earningDigest, earningReason: "payrollEarning.defaultReason", submission: expect.objectContaining({ earningDigest }),
  }) }));
  expect(mocks.rpc).not.toHaveBeenCalledWith("confirm_finance_payroll_earning", expect.anything());
});
it("recovers an atomic payment retry without repeating FX or confirmation", async () => {
  const input = { ...payment, earningDigest: "b".repeat(32) };
  mocks.prior.mockResolvedValue({ data: { payload: { operation: "payroll_payment", input: { submission: payrollPaymentInputSchema.parse(input) } } }, error: null });
  mocks.fx.mockRejectedValue(new Error("outage"));
  expect((await recordFinancePayrollPayment({ status: "idle" }, form(input))).status).toBe("success");
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.fx).not.toHaveBeenCalled();
  expect((await recordFinancePayrollPayment({ status: "idle" }, form({ ...input, earningDigest: "c".repeat(32) }))).status).toBe("error");
});

it.each(["payment", "advance"])("records a USD %s in account currency with separate reporting FX", async kind => {
  mocks.foundation.mockResolvedValue({ settings: { finalized_at: date, base_currency: "UAH" }, accounts: [{id, currency: "USD", archived_at: null}], currencies: [{code:"USD",minor_units:2}] });
  mocks.fx.mockImplementation(async (from: string, to: string, day: string) => from === to ? {rate:"1",source:"identity",effectiveDate:day} : null);
  const action = kind === "payment" ? recordFinancePayrollPayment : recordFinancePayrollAdvance;
  const values = kind === "payment" ? {...payment,amount:"100"} : {...input,amount:"100"};
  expect((await action({status:"idle"},form({...values,paymentCurrency:"USD"}))).status).toBe("success");
  expect(mocks.fx).toHaveBeenCalledWith("USD","USD",date,"manual",kind === "payment" ? "50" : "40");
  expect(mocks.rpc).toHaveBeenCalledWith(`record_finance_payroll_${kind}`,expect.objectContaining({p_input:expect.objectContaining({amount:"100",fx:null,payrollFx:{rate:"1",source:"identity",effectiveDate:date,paymentCurrency:"USD"}})}));
});
it("rejects a payment currency that differs from the actual account", async () => {
  expect((await recordFinancePayrollPayment({status:"idle"},form({...payment,amount:"100",paymentCurrency:"USD"}))).status).toBe("error");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("loads a same-currency preview without fetching exchange rates", async () => {
  mocks.rpc.mockResolvedValue({data:{...context,paymentCurrency:"USD",rate:"1",totalPayment:"1000",cashDue:"800"},error:null});
  expect(await loadFinancePayrollPayment(id,date,"nbu","","USD")).toMatchObject({paymentCurrency:"USD",cashDue:"800"});
  expect(mocks.fx).not.toHaveBeenCalled();
});

it("previews fully covered advances without settlement FX", async () => {
  mocks.rpc.mockResolvedValue({data:{...context,cashDue:"0",advanceAvailable:"1000",advanceUsed:"1000"},error:null});
  mocks.fx.mockRejectedValue(new Error("NBU unavailable"));
  expect(await loadFinancePayrollPayment(id,date)).toMatchObject({cashDue:"0",rate:null});
  expect(mocks.fx).not.toHaveBeenCalled();
});
it("previews and applies partial advances without NBU or reporting valuation", async () => {
  mocks.fx.mockRejectedValue(new Error("NBU unavailable"));
  expect(await loadFinancePayrollPayment(id,date,"nbu","","UAH",true)).toMatchObject({cashDue:"0",advanceUsed:"200"});
  expect((await recordFinancePayrollPayment({status:"idle"},form(payment))).status).toBe("success");
  expect(mocks.fx).not.toHaveBeenCalled();
});
