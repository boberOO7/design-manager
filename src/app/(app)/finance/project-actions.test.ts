import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
import { saveFinanceProject } from "./project-actions";
const id = "65000000-0000-4000-8000-000000000001";
function form(patch: Record<string, string> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ intent: "terms", requestId: id, projectId: id, revision: "0", stream: "design", mode: "design", amount: "100", currency: "UAH", reason: "Signed terms", studioId: "untrusted", ...patch })) result.set(key, value);
  return result;
}
describe("Project Finance action", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ studio_id: "verified" }); mocks.client.mockResolvedValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ error: null }); });
  it("denies employees before database access", async () => { mocks.admin.mockResolvedValue(null); expect((await saveFinanceProject({ status: "idle" }, form())).status).toBe("error"); expect(mocks.client).not.toHaveBeenCalled(); });
  it("uses the verified studio and guarded agreement RPC", async () => {
    expect((await saveFinanceProject({ status: "idle" }, form())).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_finance_project_terms", expect.objectContaining({ p_studio_id: "verified", p_project_id: id, p_input: expect.objectContaining({ amount: "100" }) }));
    expect(mocks.revalidate).toHaveBeenCalledWith("/projects/[projectId]", "page");
  });
  it("generates planning only, without invoking ledger RPCs", async () => {
    expect((await saveFinanceProject({ status: "idle" }, form({ intent: "months", from: "2026-09-01", through: "2026-11-01" }))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("generate_finance_supervision_months", expect.objectContaining({ p_from: "2026-09-01", p_through: "2026-11-01" }));
  });
  it("returns an amendment conflict instead of claiming success", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "finance_project_over_scheduled" } });
    expect(await saveFinanceProject({ status: "idle" }, form())).toEqual({ status: "error", message: "project.errors.overScheduled" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("cancels through the verified tenant with explicit retained-settlement confirmation", async () => {
    const input={intent:"cancelExpectation",itemId:id,version:"1",settledAmount:"40000",retainSettlement:"true",reason:"Terminated"};
    expect((await saveFinanceProject({status:"idle"},form(input))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("cancel_finance_project_expectation",expect.objectContaining({p_studio_id:"verified",p_input:{itemId:id,version:1,settledAmount:"40000",retainSettlement:true,reason:"Terminated"}}));
    mocks.rpc.mockClear();
    expect((await saveFinanceProject({status:"idle"},form({...input,retainSettlement:"false"}))).status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
