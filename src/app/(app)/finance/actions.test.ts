import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), select: vi.fn(), fx: vi.fn(), financeData: vi.fn(), context: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFx: mocks.fx }));
vi.mock("@/data/queries/finance", () => ({ getFinanceData: mocks.financeData }));
vi.mock("@/lib/validation/project", () => ({ getKyivDateOnly: () => "2026-09-26" }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

import { saveFinanceFoundation } from "./actions";

const requestId = "62000000-0000-4000-8000-000000000020";
function form(values: Record<string, string | undefined>) { const data = new FormData(); for (const [key, value] of Object.entries({ requestId, ...values })) if (value !== undefined) data.set(key, value); return data; }

beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue({ studio_id: "verified-studio" });
    mocks.select.mockResolvedValue({ data: [{ code: "UAH", minor_units: 2 }], error: null });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.fx.mockResolvedValue({ rate: "39", source: "nbu", effectiveDate: "2026-09-01" });
    mocks.context.mockImplementation((table: string) => Promise.resolve({ data: table === "finance_settings" ? { base_currency: "UAH", cutover_date: "2026-09-01", finalized_at: "2026-09-02" } : ["finance_planning_requests", "finance_movements"].includes(table) ? null : { currency: "USD", opening_balance: 5000 }, error: null }));
    mocks.financeData.mockResolvedValue({ settings: { base_currency: "UAH", cutover_date: "2026-09-01", finalized_at: "2026-09-02" }, accounts: [{ id: "62000000-0000-4000-8000-000000000001", currency: "UAH", opening_balance: 0, archived_at: null }], currencies: [{ code: "UAH", minor_units: 2 }], balances: [{ id: "62000000-0000-4000-8000-000000000001", recorded_balance: "0", ledger_entry_count: 0 }] });
    mocks.eq.mockReturnThis();
    mocks.client.mockResolvedValue({ from: (table: string) => table === "finance_currencies" ? { select: mocks.select } : { select() { return this; }, eq: mocks.eq, maybeSingle: () => mocks.context(table), single: () => mocks.context(table) }, rpc: mocks.rpc });
  });
describe("Finance actions", () => {
  it("keeps the submitted creation identity and returns the recovered account on retry", async () => {
    const input=form({intent:"account",accountId:"",name:"Bank",currency:"UAH",openingBalance:"123"});
    mocks.rpc.mockRejectedValueOnce(new Error("Lost response")).mockResolvedValue({data:requestId,error:null});
    await expect(saveFinanceFoundation({status:"idle"},input)).rejects.toThrow("Lost response");
    expect(await saveFinanceFoundation({status:"idle"},input)).toEqual({status:"success",message:"saved",id:requestId});
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.rpc.mock.calls[1][1].p_request_id).toBe(requestId);
  });
  it("rejects missing create identity and reports actionable cutover and retry conflicts", async () => {
    expect((await saveFinanceFoundation({status:"idle"},form({intent:"account",requestId:undefined,accountId:"",name:"Bank",currency:"UAH",openingBalance:"0"}))).status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
    for(const [message,key] of [["finance_cutover_future","futureCutover"],["finance_request_conflict","accountRequestConflict"]]) {
      mocks.rpc.mockResolvedValueOnce({error:{message}});
      expect(await saveFinanceFoundation({status:"idle"},form({intent:"finalize",confirmed:"on"}))).toEqual({status:"error",message:`errors.${key}`});
    }
  });
  it("rejects unauthorized callers before opening a database client", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await saveFinanceFoundation({ status: "idle" }, form({ intent: "settings" }))).toEqual({ status: "error", message: "errors.forbidden" });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("takes tenant identity only from verified membership", async () => {
    const result = await saveFinanceFoundation({ status: "idle" }, form({ intent: "account", studioId: "spoofed", accountId: "", name: "Bank", accountType: "cash", currency: "UAH", openingBalance: "-12,34" }));
    expect(result.status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("save_finance_account", { p_studio_id: "verified-studio", p_name: "Bank", p_currency: "UAH", p_account_type: "cash", p_opening_balance: -12.34, p_request_id: requestId });
    expect(mocks.revalidate).toHaveBeenCalledWith("/finance", "layout");
  });
  it("rejects invalid precision before mutation", async () => {
    const result = await saveFinanceFoundation({ status: "idle" }, form({ intent: "account", accountId: "", name: "Bank", currency: "UAH", openingBalance: "1.001" }));
    expect(result.status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires explicit finalization confirmation and forwards archive intent", async () => {
    expect((await saveFinanceFoundation({ status: "idle" }, form({ intent: "finalize" }))).status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
    await saveFinanceFoundation({ status: "idle" }, form({ intent: "finalize", confirmed: "on" }));
    expect(mocks.rpc).toHaveBeenCalledWith("finalize_finance_setup", { p_studio_id: "verified-studio" });
    await saveFinanceFoundation({ status: "idle" }, form({ intent: "archive", accountId: "62000000-0000-4000-8000-000000000001" }));
    expect(mocks.rpc).toHaveBeenLastCalledWith("set_finance_account_archived", { p_studio_id: "verified-studio", p_account_id: "62000000-0000-4000-8000-000000000001", p_archived: true });
  });
  it("reports a concurrent finalization without revalidating a failed save", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "finance_opening_locked" } });
    const result = await saveFinanceFoundation({ status: "idle" }, form({ intent: "account", accountId: "", name: "Bank", currency: "UAH", openingBalance: "1" }));
    expect(result).toEqual({ status: "error", message: "errors.locked" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

const valuation = { intent: "opening-valuation", accountId: "62000000-0000-4000-8000-000000000001", currency: "USD", reportingCurrency: "UAH", openingAmount: "5000", date: "2026-09-01", fxMode: "nbu", confirmed: "on" };
describe("opening valuation action", () => {
  it("uses the stored cutover date and existing dated NBU resolver", async () => {
    mocks.rpc.mockClear();
    const result = await saveFinanceFoundation({ status: "idle" }, form(valuation));
    expect(result.status).toBe("success");
    expect(mocks.fx).toHaveBeenCalledWith("USD", "UAH", "2026-09-01", "nbu", "");
    expect(mocks.eq).toHaveBeenCalledWith("studio_id", "verified-studio");
    expect(mocks.rpc).toHaveBeenCalledWith("value_finance_opening", { p_studio_id: "verified-studio", p_account_id: valuation.accountId, p_input: { currency: "USD", reportingCurrency: "UAH", openingAmount: "5000", date: "2026-09-01", fx: { rate: "39", source: "nbu", effectiveDate: "2026-09-01" } } });
  });
  it("does not save on provider failure and supports an explicit manual fallback", async () => {
    mocks.rpc.mockClear(); mocks.fx.mockRejectedValueOnce(new Error("No dated rate"));
    expect(await saveFinanceFoundation({ status: "idle" }, form(valuation))).toEqual({ status: "error", message: "openingFx.unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.fx.mockResolvedValueOnce({ rate: "40.25", source: "manual", effectiveDate: "2026-09-01" });
    expect((await saveFinanceFoundation({ status: "idle" }, form({ ...valuation, fxMode: "manual", manualRate: "40.25" }))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenLastCalledWith("value_finance_opening", expect.objectContaining({ p_input: expect.objectContaining({ fx: { rate: "40.25", source: "manual", effectiveDate: "2026-09-01" } }) }));
  });
  it("rejects stale setup context, missing confirmation and invalid manual input before FX or mutation", async () => {
    mocks.rpc.mockClear(); mocks.fx.mockClear();
    for (const patch of [{ date: "2026-09-02" }, { openingAmount: "5001" }, { confirmed: "" }, { fxMode: "manual", manualRate: "0" }]) expect((await saveFinanceFoundation({ status: "idle" }, form({ ...valuation, ...patch }))).status).toBe("error");
    expect(mocks.fx).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("dated account balances", () => {
  const accountId = "62000000-0000-4000-8000-000000000001";
  it("creates a finalized account and opening in one guarded RPC", async () => {
    const result = await saveFinanceFoundation({ status: "idle" }, form({ intent: "account-dated", accountId: "", name: "New bank", accountType: "bank", currency: "UAH", openingBalance: "12.50", date: "2026-09-25" }));
    expect(result.status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("create_finance_account_with_opening", expect.objectContaining({
      p_studio_id: "verified-studio", p_request_id: requestId,
      p_input: expect.objectContaining({ name: "New bank", accountType: "bank", openingBalance: "12.50", date: "2026-09-25" }),
    }));
  });
  it("posts a late opening through the balance ledger RPC", async () => {
    const result = await saveFinanceFoundation({ status: "idle" }, form({ intent: "balance-entry", accountId, kind: "account_opening", date: "2026-09-26", amount: "20.00" }));
    expect(result.status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_account_balance", expect.objectContaining({
      p_studio_id: "verified-studio", p_input: expect.objectContaining({ kind: "account_opening", amount: "20.00", accountId }),
    }));
  });
});
