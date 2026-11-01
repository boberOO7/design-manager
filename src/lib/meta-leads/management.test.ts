import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks=vi.hoisted(()=>{
  const query={eq:vi.fn(),select:vi.fn(),maybeSingle:vi.fn(),in:vi.fn(),update:vi.fn()};
  for (const fn of [query.eq,query.select,query.update])fn.mockReturnValue(query);
  const userQuery={...query,update:vi.fn(),select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn()};
  for (const fn of [userQuery.eq,userQuery.select,userQuery.update])fn.mockReturnValue(userQuery);
  return {member:vi.fn(),admin:vi.fn(),query,userQuery,rpc:vi.fn(),userRpc:vi.fn(),preview:vi.fn(),availability:vi.fn(),forms:vi.fn(),lead:vi.fn(),enqueue:vi.fn()};
});
vi.mock("@/data/queries/active-studio-admin",()=>({getActiveStudioAdmin:mocks.member}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>{mocks.admin();return {from:()=>mocks.query,rpc:mocks.rpc};}}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:()=>mocks.userQuery,rpc:mocks.userRpc})}));
vi.mock("./queue",()=>({enqueueMetaLeads:mocks.enqueue}));
vi.mock("./graph",async original=>({...await original<typeof import("./graph")>(),fetchMetaPreviewPage:mocks.preview,fetchMetaAvailabilityPage:mocks.availability,fetchMetaFormsPage:mocks.forms,fetchMetaLead:mocks.lead}));
import { enqueueMetaImport, getMetaAvailability, getMetaForms, getMetaPreview, previewMetaLead, requireMetaAdmin, setMetaFormSync, setMetaLeadExclusion } from "./management";
import type { MetaJobState, MetaLead } from "./contracts";
const studio="51000000-0000-4000-8000-000000000001";
const lead:MetaLead={id:"11",form_id:"10",created_time:"2026-10-18T11:00:00Z",field_data:[{name:"full_name",values:["Fixture person"]},{name:"email",values:["fixture@example.test"]}]};
const job:MetaJobState={leadgen_id:"11",form_id:"10",status:"completed",crm_lead_id:"crm-id",last_error:null,updated_at:"2026-11-01T12:00:00Z"};
beforeEach(()=>{
  vi.clearAllMocks();
  vi.stubEnv("META_PAGE_ID","123");vi.stubEnv("META_CRM_STUDIO_ID",studio);
  vi.stubEnv("META_GRAPH_API_VERSION","v26.0");vi.stubEnv("META_PAGE_ACCESS_TOKEN","fixture");vi.stubEnv("META_APP_SECRET","fixture");
  mocks.member.mockResolvedValue({studio_id:studio});
  mocks.query.maybeSingle.mockResolvedValue({data:{form_id:"10",sync_enabled:true},error:null});
  mocks.userQuery.maybeSingle.mockResolvedValue({data:{form_id:"10"},error:null});
  mocks.query.in.mockResolvedValue({data:[],error:null});
  mocks.userRpc.mockResolvedValue({data:true,error:null});
});
afterEach(()=>vi.unstubAllEnvs());
it("rejects missing admin membership and foreign studios before privileged reads or Graph requests",async()=>{
  mocks.member.mockResolvedValue(null);await expect(requireMetaAdmin()).rejects.toMatchObject({status:403});
  mocks.member.mockResolvedValue({studio_id:"51000000-0000-4000-8000-000000000002"});
  await expect(requireMetaAdmin()).rejects.toMatchObject({status:403});
  expect(mocks.admin).not.toHaveBeenCalled();expect(mocks.preview).not.toHaveBeenCalled();
});
it("saves only the sync column through the authenticated RLS client with the configured tenant",async()=>{
  await setMetaFormSync(await requireMetaAdmin(),"10",false);
  expect(mocks.userQuery.update).toHaveBeenCalledWith({sync_enabled:false});
  expect(mocks.userQuery.eq).toHaveBeenCalledWith("page_id","123");expect(mocks.userQuery.eq).toHaveBeenCalledWith("studio_id",studio);
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
it("preview is read-only and keeps incomplete, excluded and deleted leads ineligible",async()=>{
  mocks.preview.mockResolvedValue({data:[lead],next:"cursor"});
  const response=await getMetaPreview(await requireMetaAdmin(),"10");
  expect(response).toMatchObject({next:"cursor",leads:[{id:"11",status:"not_imported",eligible:true}]});
  expect(mocks.query.update).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.enqueue).not.toHaveBeenCalled();
  expect(previewMetaLead({...lead,field_data:[]},undefined,true)).toMatchObject({status:"incomplete",eligible:false,reason:"missing_client_name"});
  expect(previewMetaLead(lead,{...job,crm_lead_id:null},true)).toMatchObject({status:"skipped",eligible:false,reason:"crm_lead_deleted"});
  expect(previewMetaLead(lead,{...job,status:"skipped"},true)).toMatchObject({status:"skipped",eligible:false,reason:"admin_skipped"});
  expect(previewMetaLead(lead,undefined,false)).toMatchObject({eligible:false,reason:"form_disabled"});
});
it("refuses unknown/disabled forms and mismatched provider form identities",async()=>{
  const ctx=await requireMetaAdmin();
  mocks.query.maybeSingle.mockResolvedValueOnce({data:null,error:null});
  await expect(getMetaPreview(ctx,"999")).rejects.toMatchObject({status:404});expect(mocks.preview).not.toHaveBeenCalled();
  mocks.query.maybeSingle.mockResolvedValueOnce({data:{sync_enabled:false},error:null});
  await expect(enqueueMetaImport(ctx,"10",["11"])).rejects.toMatchObject({status:409});expect(mocks.enqueue).not.toHaveBeenCalled();
  mocks.preview.mockResolvedValue({data:[{...lead,form_id:"99"}],next:null});
  await expect(getMetaPreview(ctx,"10")).rejects.toThrow("form_mismatch");
});
it("imports only selected IDs through the common queue and preserves existing/deleted/excluded tombstones",async()=>{
  mocks.query.in.mockResolvedValue({data:[job,{...job,leadgen_id:"12",crm_lead_id:null},{...job,leadgen_id:"13",status:"skipped"}],error:null});
  const result=await enqueueMetaImport(await requireMetaAdmin(),"10",["11","12","13","14","14"]);
  expect(result).toEqual({kind:"plan",importable:["14"],existing:1,skipped:2});
  expect(mocks.enqueue).toHaveBeenCalledExactlyOnceWith([{leadgen_id:"14",form_id:"10"}],true,true);
});
it("explicit exclusion verifies the lead form and stores only IDs/state through the guarded RPC",async()=>{
  mocks.lead.mockResolvedValue(lead);const ctx=await requireMetaAdmin();
  await setMetaLeadExclusion(ctx,"10","11",true);
  expect(mocks.userRpc).toHaveBeenCalledExactlyOnceWith("set_meta_lead_exclusion",{p_page_id:"123",p_studio_id:studio,p_form_id:"10",p_leadgen_id:"11",p_excluded:true});
  mocks.lead.mockResolvedValue({...lead,form_id:"99"});await expect(setMetaLeadExclusion(ctx,"10","11",true)).rejects.toThrow("form_mismatch");
  await setMetaLeadExclusion(ctx,"10","11",false);expect(mocks.lead).toHaveBeenCalledTimes(2);
});
it("counts currently available history and finds the latest timestamp without depending on provider ordering",async()=>{
  mocks.availability.mockResolvedValue({data:[{id:"1",created_time:"2026-10-19T01:00:00+0000"},{id:"2",created_time:"2026-10-18T01:00:00Z"}],next:"next"});
  expect(await getMetaAvailability(await requireMetaAdmin(),"10")).toEqual({kind:"availability",count:2,latest:"2026-10-19T01:00:00.000Z",next:"next"});
});
it("keeps a sanitized Graph failure distinct from delivery/publication diagnostics",async()=>{
  const {MetaLeadError}=await import("./graph");mocks.forms.mockRejectedValue(new MetaLeadError("graph_http_400_code_190"));
  mocks.rpc.mockResolvedValue({data:{enabledForms:0,pending:0,failed:0,lastSuccess:null,forms:[]},error:null});
  expect(await getMetaForms(await requireMetaAdmin())).toMatchObject({diagnostics:{manualAvailable:false,graphError:"graph_http_400_code_190",lastSuccess:null}});
});
