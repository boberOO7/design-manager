import { beforeEach, describe, expect, it, vi } from "vitest";
import { movementInputSchema } from "@/lib/finance-movements";
const mocks = vi.hoisted(() => ({ admin:vi.fn(), client:vi.fn(), foundation:vi.fn(), rpc:vi.fn(), prior:vi.fn(), fx:vi.fn(), revalidate:vi.fn() }));
vi.mock("@/data/queries/active-studio-admin",()=>({ getActiveStudioAdmin:mocks.admin }));
vi.mock("@/data/queries/finance",()=>({ getFinanceData:mocks.foundation }));
vi.mock("@/lib/supabase/server",()=>({ createClient:mocks.client }));
vi.mock("@/lib/finance-fx",()=>({ resolveFinanceFx:mocks.fx }));
vi.mock("next/cache",()=>({ revalidatePath:mocks.revalidate }));
vi.mock("next-intl/server",()=>({ getTranslations:async ()=>(key:string)=>key }));
import { saveFinanceMovement } from "./actions";
const id="63000000-0000-4000-8000-000000000020";
const input={ requestId:id, kind:"incoming", accountId:id, date:"2026-09-02", amount:"100", category:"Design", studioId:"spoofed" };
function form(patch: Record<string,string>={}) { const value=new FormData(); for(const [key,item] of Object.entries({ ...input,...patch })) value.set(key,item); return value; }
describe("movement action boundary",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue({ studio_id:"verified" });
    mocks.prior.mockResolvedValue({ data:null,error:null });
    const query={ select:()=>query,eq:()=>query,maybeSingle:mocks.prior };
    mocks.client.mockResolvedValue({ from:()=>query,rpc:mocks.rpc });
    mocks.rpc.mockResolvedValue({ data:id,error:null });
    mocks.foundation.mockResolvedValue({ settings:{ finalized_at:"2026-09-01",cutover_date:"2026-09-01",base_currency:"UAH" },accounts:[{ id,currency:"USD",archived_at:null }],currencies:[{ code:"USD",minor_units:2 }] });
    mocks.fx.mockResolvedValue({ rate:"42",source:"manual",effectiveDate:"2026-09-02" });
  });
  it("denies unauthorized callers before reading or writing",async()=>{
    mocks.admin.mockResolvedValue(null);
    expect((await saveFinanceMovement({ status:"idle" },form())).status).toBe("error");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("derives the studio and forwards exact strings with an FX snapshot",async()=>{
    expect((await saveFinanceMovement({ status:"idle" },form())).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_movement",expect.objectContaining({ p_studio_id:"verified",p_request_id:id,p_input:expect.objectContaining({ amount:"100",fx:{ rate:"42",source:"manual",effectiveDate:"2026-09-02" } }) }));
  });
  it("never writes when FX lookup fails",async()=>{
    mocks.fx.mockRejectedValue(new Error("outage"));
    expect(await saveFinanceMovement({ status:"idle" },form())).toEqual({ status:"error",message:"errors.fx" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("resolves a lost-response retry without re-fetching FX or reposting",async()=>{
    mocks.prior.mockResolvedValue({ data:{ request_payload:{ submission:movementInputSchema.parse(input) } },error:null });
    expect((await saveFinanceMovement({ status:"idle" },form())).status).toBe("success");
    expect(mocks.fx).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await saveFinanceMovement({ status:"idle" },form({ amount:"101" }))).message).toBe("errors.conflict");
  });
  it("requires explicit reversal confirmation and never fetches a new rate",async()=>{
    const patch={ intent:"reverse",movementId:id,reason:"Duplicate" };
    expect((await saveFinanceMovement({ status:"idle" },form(patch))).status).toBe("error");
    expect((await saveFinanceMovement({ status:"idle" },form({ ...patch,confirmed:"on" }))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("reverse_finance_movement",expect.objectContaining({ p_studio_id:"verified",p_movement_id:id }));
    expect(mocks.fx).not.toHaveBeenCalled();
  });
});
