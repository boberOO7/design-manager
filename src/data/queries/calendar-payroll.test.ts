import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { getCalendarData } from "./calendar";
const mocks=vi.hoisted(()=>({ createClient:vi.fn(),role:"admin" }));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.createClient}));
vi.mock("./active-studio-membership",()=>({getActiveStudioMembership:async()=>({system_role:mocks.role,studio_id:"studio",authenticatedUserId:"admin"})}));

describe("Finance payroll Calendar boundary",()=>{
  for(const role of ["admin","employee"]){
    it(`${role} receives only its authorized projection`,async()=>{
      mocks.role=role;
      const queries:URL[]=[];
      const client=createClient<Database>("http://127.0.0.1:54321","test-key",{auth:{persistSession:false},global:{fetch:async(input)=>{
        const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);queries.push(url);
        return new Response(JSON.stringify(url.pathname.endsWith("/finance_payroll_calendar")?[{studio_id:"studio",expected_item_id:"payroll",employee_id:"admin",employee_name:"Own payroll",payment_date:"2026-09-30"}]:[]),{headers:{"Content-Type":"application/json"}});
      }}});
      vi.spyOn(client.auth,"getUser").mockResolvedValue({data:{user:{id:"admin",aud:"authenticated",app_metadata:{},user_metadata:{},created_at:"2026-01-01T00:00:00Z"}},error:null});
      mocks.createClient.mockResolvedValue(client);
      const data=await getCalendarData({start:"2026-09-01",end:"2026-09-30"});
      expect(data?.items.filter((i)=>i.source==="salary_payment")).toHaveLength(role==="admin"?1:0);
      const finance=queries.filter((q)=>q.pathname.includes("finance_"));
      expect(finance).toHaveLength(role==="admin"?1:0);
      if(finance[0]) expect(finance[0].searchParams.get("studio_id")).toBe("eq.studio");
      expect(JSON.stringify(data)).not.toMatch(/employee_payout|employer_cost|amount|settled_amount/);
    });
  }
});
