import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({ admin:vi.fn(),client:vi.fn(),rpc:vi.fn(),revalidate:vi.fn() }));
vi.mock("@/data/queries/active-studio-admin",()=>({ getActiveStudioAdmin:mocks.admin }));
vi.mock("@/lib/supabase/server",()=>({ createClient:mocks.client }));
vi.mock("next/cache",()=>({ revalidatePath:mocks.revalidate }));
vi.mock("next-intl/server",()=>({ getTranslations:async()=>(key:string)=>key }));
import { saveFinancePlanning } from "./actions";
const id="64000000-0000-4000-8000-000000000100";
function form(patch:Record<string,string>={}) { const data=new FormData();for(const [key,value] of Object.entries({ intent:"allocate",requestId:id,itemId:id,movementId:id,amount:"12,34",studioId:"untrusted",...patch }))data.set(key,value);return data; }
describe("Finance planning actions",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.admin.mockResolvedValue({ studio_id:"verified" });mocks.client.mockResolvedValue({ rpc:mocks.rpc });mocks.rpc.mockResolvedValue({ data:id,error:null });});
  it("checks verified admin before creating a client",async()=>{mocks.admin.mockResolvedValue(null);expect((await saveFinancePlanning({ status:"idle" },form())).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();});
  it("matches existing money using verified studio and no cash-posting RPC",async()=>{
    expect((await saveFinancePlanning({ status:"idle" },form())).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("allocate_finance_payment",{ p_studio_id:"verified",p_request_id:id,p_item_id:id,p_movement_id:id,p_amount:12.34 });
  });
  it("returns over-allocation conflicts without claiming success",async()=>{mocks.rpc.mockResolvedValue({ error:{ message:"finance_overallocation" } });expect(await saveFinancePlanning({ status:"idle" },form())).toEqual({ status:"error",message:"errors.overallocated" });expect(mocks.revalidate).not.toHaveBeenCalled();});
  it("creates an expectation without posting actual cash",async()=>{
    expect((await saveFinancePlanning({ status:"idle" },form({ intent:"expected",direction:"incoming",categoryId:id,currency:"UAH",commitment:"agreed",certainty:"fixed",established:"true" }))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_finance_expected_item",expect.objectContaining({ p_studio_id:"verified",p_input:expect.objectContaining({ amount:"12.34",established:true }) }));
  });
  it("adds project context using the guarded wrapper without posting cash",async()=>{
    expect((await saveFinancePlanning({ status:"idle" },form({ intent:"expected",projectId:id,stream:"contractor_bonus",contractorId:id,direction:"incoming",categoryId:id,currency:"UAH",commitment:"tentative",certainty:"fixed",established:"false" }))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_finance_project_item",expect.objectContaining({ p_studio_id:"verified",p_project_id:id,p_input:expect.objectContaining({ stream:"contractor_bonus",contractorId:id,item:expect.objectContaining({ established:false }) }) }));
  });
});
