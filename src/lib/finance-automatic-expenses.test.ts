import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), fx: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFx: mocks.fx }));
import { processAutomaticExpenses } from "./finance-automatic-expenses";
const id = "61000000-0000-4000-8000-000000000001";
const candidate = { action: "recognize", studioId: id, sourceId: id, policyId: id, month: "2026-10-01", from: "2026-10-15", to: "2026-10-19", amount: "12.34", currency: "USD", reportingCurrency: "UAH", projectId: null, label: "Subscription", digest: "a".repeat(32), issue: null };
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "prepare_finance_automatic_expenses" ? [candidate] : id, error: null })); mocks.fx.mockResolvedValue({ rate: "40", source: "nbu", effectiveDate: "2026-10-19" }); });
it("values accruals at their economic date and delegates exact cost recognition to the guarded RPC", async () => {
  expect(await processAutomaticExpenses(id)).toEqual({ processed: 1, failed: 0 });
  expect(mocks.fx).toHaveBeenCalledWith("USD", "UAH", "2026-10-19", "nbu", "");
  expect(mocks.rpc).toHaveBeenCalledWith("process_finance_automatic_expense", { p_studio_id: id, p_source_id: id, p_month: "2026-10-01", p_digest: candidate.digest, p_fx: { rate: "40", source: "nbu", effectiveDate: "2026-10-19" } });
});
it("keeps native costs and missing historical valuation separate during FX outages", async () => {
  mocks.fx.mockRejectedValue(new Error("missing quote"));
  expect(await processAutomaticExpenses(id)).toEqual({ processed: 1, failed: 0 });
  expect(mocks.rpc).toHaveBeenCalledWith("process_finance_automatic_expense", expect.objectContaining({ p_fx: null }));
});
it("retries only missing valuation through the immutable-FX path", async () => {
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "prepare_finance_automatic_expenses" ? [{ action: "value", studioId: id, sourceId: id, currency: "USD", reportingCurrency: "UAH", to: "2026-09-30" }] : null, error: null }));
  expect(await processAutomaticExpenses(id)).toEqual({ processed: 1, failed: 0 });
  expect(mocks.fx).toHaveBeenCalledWith("USD", "UAH", "2026-09-30", "nbu", "");
  expect(mocks.rpc).toHaveBeenCalledWith("value_finance_automatic_expense", expect.objectContaining({ p_entry_id: id }));
  expect(mocks.rpc).not.toHaveBeenCalledWith("process_finance_automatic_expense", expect.anything());
});

it("reconciles saved earning events at their original date after an FX outage", async () => {
  const earning = { action: "earning", studioId: id, sourceId: id, currency: "USD", reportingCurrency: "UAH", to: "2026-09-15" };
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "prepare_finance_automatic_expenses" ? [earning] : id, error: null }));
  mocks.fx.mockResolvedValue({ rate: "40", source: "nbu", effectiveDate: "2026-09-15" }).mockRejectedValueOnce(new Error("missing quote"));
  await processAutomaticExpenses(id);
  expect(mocks.rpc).toHaveBeenCalledWith("process_finance_pending_source", { p_studio_id: id, p_kind: "earning", p_source_id: id, p_fx: null });
  expect(await processAutomaticExpenses(id)).toEqual({ processed: 1, failed: 0 });
  expect(mocks.fx).toHaveBeenLastCalledWith("USD", "UAH", "2026-09-15", "nbu", "");
  expect(mocks.rpc).toHaveBeenLastCalledWith("process_finance_pending_source", expect.objectContaining({ p_kind: "earning", p_fx: { rate: "40", source: "nbu", effectiveDate: "2026-09-15" } }));
});

it("delegates concurrent and repeated trip reconciliation to the guarded source RPC without replacing saved FX", async () => {
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "prepare_finance_automatic_expenses" ? [{ action: "trip", studioId: id, sourceId: id, currency: null, reportingCurrency: "UAH", to: "2026-09-15" }] : id, error: null }));
  expect(await Promise.all([processAutomaticExpenses(id), processAutomaticExpenses(id)])).toEqual([{ processed: 1, failed: 0 }, { processed: 1, failed: 0 }]);
  expect(mocks.fx).not.toHaveBeenCalled();
  expect(mocks.rpc.mock.calls.filter(([name]) => name === "process_finance_pending_source")).toEqual(Array.from({ length: 2 }, () => ["process_finance_pending_source", { p_studio_id: id, p_kind: "trip", p_source_id: id, p_fx: null }]));
});

it("isolates a failed source so later confirmed facts still reconcile", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.rpc.mockImplementation(async (name: string, input?: { p_kind?: string }) => ({
    data: name === "prepare_finance_automatic_expenses" ? [
      { action: "earning", studioId: id, sourceId: id, currency: "UAH", reportingCurrency: "UAH", to: "2026-09-15" },
      { action: "trip", studioId: id, sourceId: id, currency: null, reportingCurrency: "UAH", to: "2026-09-15" },
    ] : id, error: input?.p_kind === "earning" ? { message: "database unavailable" } : null,
  }));
  expect(await processAutomaticExpenses(id)).toEqual({ processed: 1, failed: 1 });
  vi.restoreAllMocks();
});
