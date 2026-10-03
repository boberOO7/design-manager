import { beforeEach, describe, expect, it, vi } from "vitest";
import { correctionInputSchema, movementInputSchema } from "@/lib/finance-movements";
const mocks = vi.hoisted(() => ({ admin:vi.fn(), client:vi.fn(), foundation:vi.fn(), rpc:vi.fn(), prior:vi.fn(), expected:vi.fn(), fx:vi.fn(), revalidate:vi.fn() }));
vi.mock("@/data/queries/active-studio-admin",()=>({ getActiveStudioAdmin:mocks.admin }));
vi.mock("@/data/queries/finance",()=>({ getFinanceData:mocks.foundation, getFinanceMovementHistory:vi.fn() }));
vi.mock("@/lib/supabase/server",()=>({ createClient:mocks.client }));
vi.mock("@/lib/finance-fx",()=>({ resolveFinanceFx:mocks.fx }));
vi.mock("next/cache",()=>({ revalidatePath:mocks.revalidate }));
vi.mock("next-intl/server",()=>({ getTranslations:async ()=>(key:string)=>key }));
import { quoteFinanceSchedule, quoteFinanceSettlement, saveFinanceMovement } from "./actions";
import { getKyivDateOnly } from "@/lib/validation/project";
const id="63000000-0000-4000-8000-000000000020";
const input={ requestId:id, kind:"incoming", accountId:id, date:"2026-09-02", amount:"100", categoryId:id, studioId:"spoofed" };
function form(patch: Record<string,string>={}) { const value=new FormData(); for(const [key,item] of Object.entries({ ...input,...patch })) value.set(key,item); return value; }
describe("movement action boundary",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue({ studio_id:"verified" });
    mocks.prior.mockResolvedValue({ data:null,error:null });
    mocks.expected.mockResolvedValue({ data:{currency:"EUR",remaining_amount:774.2},error:null });
    const query=(result:typeof mocks.prior)=>({ select:()=>query(result),eq:()=>query(result),maybeSingle:result });
    mocks.client.mockResolvedValue({ from:(table:string)=>query(table==="finance_expected_balances"?mocks.expected:mocks.prior),rpc:mocks.rpc });
    mocks.rpc.mockResolvedValue({ data:id,error:null });
    mocks.foundation.mockResolvedValue({ settings:{ finalized_at:"2026-09-01",cutover_date:"2026-09-01",base_currency:"UAH" },accounts:[{ id,currency:"USD",archived_at:null }],currencies:[{ code:"USD",minor_units:2 }] });
    mocks.fx.mockResolvedValue({ rate:"42",source:"manual",effectiveDate:"2026-09-02" });
  });
  it("quotes historical and future schedule dates without changing Finance data",async()=>{
    mocks.fx.mockImplementation(async(_from:string,_to:string,date:string)=>({rate:"0.9",source:"nbu",effectiveDate:date}));
    const today=getKyivDateOnly();
    const quotes=await quoteFinanceSchedule([
      {currency:"USD",obligationCurrency:"EUR",date:"2026-01-01"},
      {currency:"USD",obligationCurrency:"UAH",date:"2099-01-01"},
      {currency:"USD",obligationCurrency:"UAH",date:today},
    ]);
    expect(quotes[0]).toMatchObject({effectiveDate:"2026-01-01",indicative:false});
    expect(quotes[1]).toMatchObject({effectiveDate:today,indicative:true});
    expect(quotes[2]).toMatchObject({effectiveDate:today,indicative:false});
    expect(mocks.fx).toHaveBeenCalledWith("USD","EUR","2026-01-01","nbu","");
    expect(mocks.fx).toHaveBeenCalledWith("USD","UAH",today,"nbu","");
    expect(mocks.fx).toHaveBeenCalledTimes(2);
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("quotes the selected operation date for the payment helper",async()=>{
    mocks.fx.mockImplementation(async(_from:string,_to:string,date:string)=>({rate:"1.125",source:"nbu",effectiveDate:date}));
    expect(await quoteFinanceSettlement({currency:"EUR",obligationCurrency:"USD",date:"2026-01-01"})).toMatchObject({rate:"1.125",effectiveDate:"2026-01-01"});
    expect(mocks.fx).toHaveBeenCalledWith("EUR","USD","2026-01-01","nbu","");
  });
  it("denies unauthorized callers before reading or writing",async()=>{
    mocks.admin.mockResolvedValue(null);
    expect((await saveFinanceMovement({ status:"idle" },form())).status).toBe("error");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("derives the studio and forwards exact strings with an FX snapshot",async()=>{
    expect((await saveFinanceMovement({ status:"idle" },form())).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_movement",expect.objectContaining({ p_studio_id:"verified",p_request_id:id,p_input:expect.objectContaining({ amount:"100",allocationIntent:false,fx:{ rate:"42",source:"manual",effectiveDate:"2026-09-02" } }) }));
  });
  it("accepts pre-cutover actual dates and keeps their historical FX date",async()=>{
    expect((await saveFinanceMovement({status:"idle"},form({date:"2026-08-31"}))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_movement",expect.objectContaining({p_input:expect.objectContaining({date:"2026-08-31"})}));
    expect(mocks.fx).toHaveBeenCalledWith("USD","UAH","2026-08-31","manual","");
  });
  it("records explicit advance intent without changing the movement kind",async()=>{
    expect((await saveFinanceMovement({ status:"idle" },form({ allocationIntent:"true" }))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_movement",expect.objectContaining({ p_input:expect.objectContaining({ kind:"incoming",allocationIntent:true }) }));
  });
  it("never writes when FX lookup fails",async()=>{
    mocks.fx.mockRejectedValue(new Error("outage"));
    expect(await saveFinanceMovement({ status:"idle" },form())).toEqual({ status:"error",message:"errors.fx" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the atomic posting and settlement RPC for contextual payments",async()=>{
    expect((await saveFinanceMovement({ status:"idle" },form({ expectedItemId:id,allocationAmount:"60" }))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_expected_payment",expect.objectContaining({ p_item_id:id,p_allocation_amount:60,p_input:expect.objectContaining({ amount:"100",categoryId:id }) }));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("records account cash and obligation settlement with separate FX snapshots",async()=>{
    mocks.fx.mockImplementation(async(from:string,to:string)=>({rate:to==="EUR"?"0.9":"42",source:"nbu",effectiveDate:"2026-09-02"}));
    expect((await saveFinanceMovement({ status:"idle" },form({expectedItemId:id,autoAllocate:"true",amount:"660",fxMode:"nbu"}))).status).toBe("success");
    expect(mocks.fx).toHaveBeenCalledWith("USD","EUR","2026-09-02","nbu","");
    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_expected_payment",expect.objectContaining({p_item_id:id,p_input:expect.objectContaining({amount:"660",settlementFx:{rate:"0.9",source:"nbu",effectiveDate:"2026-09-02"},fx:{rate:"42",source:"nbu",effectiveDate:"2026-09-02"}})}));
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_allocation_amount");
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
    mocks.prior.mockResolvedValue({data:{financial_date:"2026-09-01"},error:null});
    expect((await saveFinanceMovement({ status:"idle" },form({ ...patch,confirmed:"on" }))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("reverse_finance_movement",expect.objectContaining({ p_studio_id:"verified",p_movement_id:id,p_date:"2026-09-01" }));
    expect(mocks.fx).not.toHaveBeenCalled();
  });
  it("corrects through one atomic RPC with FX from the corrected historical date",async()=>{
    expect((await saveFinanceMovement({status:"idle"},form({intent:"correct",movementId:id,amount:"75",date:"2026-08-31"}))).status).toBe("success");
    expect(mocks.fx).toHaveBeenCalledWith("USD","UAH","2026-08-31","manual","");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("correct_finance_movement",expect.objectContaining({p_studio_id:"verified",p_movement_id:id,p_input:expect.objectContaining({amount:"75",date:"2026-08-31"})}));
  });
  it("recovers a correction retry before FX lookup or current account validation",async()=>{
    const patch={intent:"correct",movementId:id};
    mocks.prior.mockResolvedValue({data:{request_payload:{submission:correctionInputSchema.parse({...input,...patch})}},error:null});
    expect((await saveFinanceMovement({status:"idle"},form(patch))).status).toBe("success");
    expect(mocks.fx).not.toHaveBeenCalled();expect(mocks.foundation).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await saveFinanceMovement({status:"idle"},form({...patch,amount:"101"}))).message).toBe("errors.conflict");
    expect((await saveFinanceMovement({status:"idle"},form())).message).toBe("errors.conflict");
  });
  it("keeps refunds as ordinary separate postings and preserves reversal guards",async()=>{
    expect((await saveFinanceMovement({status:"idle"},form({kind:"refund",relatedMovementId:id}))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_movement",expect.objectContaining({p_input:expect.objectContaining({kind:"refund",relatedMovementId:id})}));
    mocks.rpc.mockResolvedValue({error:{message:"finance_reverse_refunds_first"}});
    expect((await saveFinanceMovement({status:"idle"},form({intent:"correct",movementId:id}))).message).toBe("errors.correctionRefunds");
  });
});
