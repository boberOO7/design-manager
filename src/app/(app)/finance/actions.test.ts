import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), select: vi.fn() }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

import { saveFinanceFoundation } from "./actions";

function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }

describe("Finance actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue({ studio_id: "verified-studio" });
    mocks.select.mockResolvedValue({ data: [{ code: "UAH", minor_units: 2 }], error: null });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.client.mockResolvedValue({ from: () => ({ select: mocks.select }), rpc: mocks.rpc });
  });
  it("rejects unauthorized callers before opening a database client", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await saveFinanceFoundation({ status: "idle" }, form({ intent: "settings" }))).toEqual({ status: "error", message: "errors.forbidden" });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("takes tenant identity only from verified membership", async () => {
    const result = await saveFinanceFoundation({ status: "idle" }, form({ intent: "account", studioId: "spoofed", accountId: "", name: "Bank", currency: "UAH", openingBalance: "-12,34" }));
    expect(result.status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("save_finance_account", { p_studio_id: "verified-studio", p_name: "Bank", p_currency: "UAH", p_opening_balance: -12.34 });
    expect(mocks.revalidate).toHaveBeenCalledWith("/finance");
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
