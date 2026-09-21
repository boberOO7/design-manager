import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn(), fx: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/finance-fx",()=>({resolveFinanceFx:mocks.fx}));
import { getProjectReferenceRate, saveFinanceProject } from "./project-actions";
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
  it("saves a validated plan with verified tenancy and rejects malformed input",async()=>{
    const payload={projectId:id,revision:0,pricingMethod:"area",area:"123,5",rate:"20",amount:"2470",currency:"USD",reason:"Signed",allowUnscheduled:false,known:[],items:[{id:"",name:"Advance",amount:"2470",dueDate:"",expectedDate:""}]};
    expect((await saveFinanceProject({status:"idle"},form({intent:"plan",plan:JSON.stringify(payload)}))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("save_finance_project_plan",expect.objectContaining({p_studio_id:"verified",p_input:expect.objectContaining({area:"123.5",amount:"2470"})}));
    mocks.rpc.mockClear();
    expect((await saveFinanceProject({status:"idle"},form({intent:"plan",plan:"{"}))).status).toBe("error");expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("loads current NBU context without saving contracts or cash",async()=>{
    mocks.client.mockResolvedValue({from:()=>({select:()=>({eq:()=>({single:async()=>({data:{base_currency:"UAH"},error:null})})})}),rpc:mocks.rpc});
    mocks.fx.mockResolvedValueOnce({rate:"44.25",source:"nbu",effectiveDate:"2026-09-21"}).mockResolvedValueOnce({rate:"45",source:"nbu",effectiveDate:"2026-09-21"});
    expect((await getProjectReferenceRate("USD"))?.rate).toBe("44.25");expect((await getProjectReferenceRate("USD"))?.rate).toBe("45");
    expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.revalidate).not.toHaveBeenCalled();
    mocks.fx.mockRejectedValueOnce(new Error("finance_fx_unavailable"));expect(await getProjectReferenceRate("USD")).toBeNull();
    mocks.admin.mockResolvedValue(null);expect(await getProjectReferenceRate("USD")).toBeNull();
  });

});
