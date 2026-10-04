import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectSettlementInputSchema } from "@/lib/finance-project-settlement";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), foundation: vi.fn(), rpc: vi.fn(), prior: vi.fn(), expected: vi.fn(), fx: vi.fn() }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/data/queries/finance", () => ({ getFinanceData: mocks.foundation }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFx: mocks.fx, defaultFinanceReportingSource: "nbu" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
import { saveProjectSettlement, saveRemainderAdjustment } from "./actions";
const id = "63000000-0000-4000-8000-000000000020", second = "63000000-0000-4000-8000-000000000021";
const raw = {
  requestId: id, projectId: id, expectedItemId: id, kind: "incoming", accountId: id, date: "2026-09-02", amount: "1000", categoryId: id,
  allocations: JSON.stringify([{ itemId: id, amount: "830.00" }, { itemId: second, amount: "330.00" }]),
  snapshot: JSON.stringify({ planRevisionId: null, items: [{ itemId: id, version: 1, remaining: "830.00" }, { itemId: second, version: 1, remaining: "2000.00" }] }),
  settlementFx: JSON.stringify({ rate: "1.16", source: "manual", effectiveDate: "2026-09-02" }),
};
function form(patch: Record<string, string> = {}) { const form = new FormData(); for (const [key, value] of Object.entries({ ...raw, ...patch })) form.set(key, value); return form; }

describe("Project settlement action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue({ studio_id: "verified" });
    mocks.prior.mockResolvedValue({ data: null, error: null });
    mocks.expected.mockResolvedValue({ data: { currency: "USD", category_id: id }, error: null });
    const query = (result: typeof mocks.prior) => ({ select: () => query(result), eq: () => query(result), maybeSingle: result });
    mocks.client.mockResolvedValue({ from: (table: string) => query(table === "finance_project_expected_balances" ? mocks.expected : mocks.prior), rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: id, error: null });
    mocks.foundation.mockResolvedValue({ settings: { finalized_at: "2026-09-01", base_currency: "UAH" }, accounts: [{ id, currency: "EUR", archived_at: null }], currencies: [{ code: "USD", minor_units: 2 }, { code: "EUR", minor_units: 2 }] });
    mocks.fx.mockResolvedValue({ rate: "42", source: "nbu", effectiveDate: "2026-09-02" });
  });
  it("denies callers before data reads", async () => {
    mocks.admin.mockResolvedValue(null);
    expect((await saveProjectSettlement({ status: "idle" }, form())).status).toBe("error");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("posts one atomic movement and confirmed allocations with frozen settlement FX", async () => {
    expect((await saveProjectSettlement({ status: "idle" }, form())).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("record_finance_project_payment", expect.objectContaining({
      p_studio_id: "verified", p_project_id: id, p_allocations: [{ itemId: id, amount: "830.00" }, { itemId: second, amount: "330.00" }],
      p_input: expect.objectContaining({ amount: "1000", allocationIntent: true, settlementFx: { rate: "1.16", source: "manual", effectiveDate: "2026-09-02" } }),
    }));
    expect(mocks.rpc.mock.calls[0][1].p_input).not.toHaveProperty("projectReceiptSplits");
    expect(mocks.fx).toHaveBeenCalledExactlyOnceWith("EUR", "UAH", "2026-09-02", "nbu", "");
  });
  it("allows all cash to remain an advance and optional reporting FX failure", async () => {
    mocks.fx.mockRejectedValue(new Error("outage"));
    expect((await saveProjectSettlement({ status: "idle" }, form({ allocations: "[]" }))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_project_payment", expect.objectContaining({ p_allocations: [], p_input: expect.objectContaining({ fx: null }) }));
  });
  it("requires a refreshed preview if NBU changed, without posting cash", async () => {
    expect(await saveProjectSettlement({ status: "idle" }, form({ settlementFx: JSON.stringify({ rate: "1.16", source: "nbu", effectiveDate: "2026-09-02" }) }))).toEqual({ status: "error", id: "stalePreview", message: "errors.stale" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("handles ambiguous retries before FX or changed balances", async () => {
    mocks.prior.mockResolvedValue({ data: { request_payload: { submission: projectSettlementInputSchema.parse(raw) } }, error: null });
    expect((await saveProjectSettlement({ status: "idle" }, form())).status).toBe("success");
    expect(mocks.fx).not.toHaveBeenCalled(); expect(mocks.foundation).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await saveProjectSettlement({ status: "idle" }, form({ amount: "1001" }))).message).toBe("errors.conflict");
  });
  it("rejects overallocated and unrepresentable native splits before posting", async () => {
    expect((await saveProjectSettlement({ status: "idle" }, form({ allocations: JSON.stringify([{ itemId: id, amount: "831" }]) }))).message).toBe("errors.overallocated");
    expect((await saveProjectSettlement({ status: "idle" }, form({ amount: "0.01", settlementFx: JSON.stringify({ rate: "100", source: "manual", effectiveDate: "2026-09-02" }), allocations: JSON.stringify([{ itemId: id, amount: "0.01" }, { itemId: second, amount: "0.99" }]) }))).message).toBe("errors.unrepresentable");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("maps stale DB snapshots to refresh without hiding the error", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "finance_settlement_preview_stale" } });
    expect((await saveProjectSettlement({ status: "idle" }, form())).id).toBe("stalePreview");
  });
  it("requires explicit closure confirmation and an Other explanation", async () => {
    const patch = { itemId: id, remaining: "0.01", reason: "other", confirmed: "on" };
    expect((await saveRemainderAdjustment({ status: "idle" }, form(patch))).message).toBe("errors.invalid");
    expect((await saveRemainderAdjustment({ status: "idle" }, form({ ...patch, explanation: "Client agreed" }))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("close_finance_expected_remainder", expect.objectContaining({ p_remaining: 0.01, p_reason: "other", p_explanation: "Client agreed" }));
    expect(mocks.fx).not.toHaveBeenCalled();
  });
});
