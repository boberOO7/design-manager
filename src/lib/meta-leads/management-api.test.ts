import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({auth:vi.fn(),forms:vi.fn(),preview:vi.fn(),states:vi.fn(),plan:vi.fn(),enqueue:vi.fn(),sync:vi.fn(),after:vi.fn(),process:vi.fn(),revalidate:vi.fn()}));
vi.mock("next/server",()=>({after:mocks.after}));vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("./queue",()=>({processMetaLeadQueue:mocks.process}));
vi.mock("./management",async original=>({...await original<typeof import("./management")>(),requireMetaAdmin:mocks.auth,getMetaForms:mocks.forms,getMetaPreview:mocks.preview,getMetaJobStates:mocks.states,planMetaImport:mocks.plan,enqueueMetaImport:mocks.enqueue,setMetaFormSync:mocks.sync}));
import { GET, POST } from "@/app/api/integrations/meta-leads/manage/route";
import { MetaManagementError } from "./management";
const context={studioId:"configured-studio",pageId:"123"};
const url="https://studio-flow.space/api/integrations/meta-leads/manage";
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue(context);mocks.states.mockResolvedValue([]);mocks.plan.mockResolvedValue({kind:"plan",importable:["11"],existing:0,skipped:0});});
const post=(body:unknown,origin="https://studio-flow.space")=>POST(new Request(url,{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)}));
it("authenticates every operation and rejects foreign origins without scheduling work",async()=>{
  expect((await post({action:"sync",formId:"10",enabled:true},"https://other.test")).status).toBe(403);
  expect(mocks.auth).not.toHaveBeenCalled();
  mocks.auth.mockRejectedValue(new MetaManagementError("permission",403));
  expect((await GET(new Request(url))).status).toBe(403);
  expect((await post({action:"enqueue",formId:"10",leadIds:["11"]})).status).toBe(403);
  expect(mocks.enqueue).not.toHaveBeenCalled();expect(mocks.after).not.toHaveBeenCalled();
});
it("preview/status never enqueue or process and return no-store responses",async()=>{
  mocks.preview.mockResolvedValue({kind:"preview",leads:[],next:null});
  const response=await GET(new Request(`${url}?operation=preview&formId=10`));expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(mocks.preview).toHaveBeenCalledWith(context,"10",undefined);
  expect((await GET(new Request(`${url}?operation=status&formId=10&ids=11`))).status).toBe(200);
  expect(mocks.enqueue).not.toHaveBeenCalled();expect(mocks.process).not.toHaveBeenCalled();expect(mocks.after).not.toHaveBeenCalled();
});
it("ignores injected tenant/page values and only updates the requested policy",async()=>{
  expect((await post({action:"sync",formId:"10",enabled:true,studio_id:"foreign",pageId:"999"})).status).toBe(200);
  expect(mocks.sync).toHaveBeenCalledExactlyOnceWith(context,"10",true);
  expect(mocks.after).not.toHaveBeenCalled();
});
it("bounds batches and invokes the existing worker asynchronously only for selected IDs",async()=>{
  expect((await post({action:"process",formId:"10",leadIds:Array.from({length:51},(_,i)=>String(i))})).status).toBe(400);
  expect((await post({action:"process",formId:"10",leadIds:["11"]})).status).toBe(200);
  expect(mocks.process).not.toHaveBeenCalled();expect(mocks.after).toHaveBeenCalledTimes(1);
  const callback=mocks.after.mock.calls[0][0];await callback();
  expect(mocks.process).toHaveBeenCalledExactlyOnceWith(["11"]);expect(mocks.revalidate).toHaveBeenCalledWith("/crm/leads");
});
