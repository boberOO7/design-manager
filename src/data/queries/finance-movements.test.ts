import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin:vi.fn(), client:vi.fn(), calls:[] as {table:string;method:string;args:unknown[]}[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin:mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient:mocks.client }));
import { getFinanceMovements } from "./finance";

describe("effective movement pagination", () => {
  beforeEach(() => {
    mocks.calls.length=0;
    mocks.admin.mockResolvedValue({studio_id:"verified"});
    const from=(table:string) => {
      let selection="";
      const result=()=>table==="finance_current_movements" ? {data:[{id:"corrected"},{id:"refund"}],count:52,error:null}
        : table==="finance_movement_corrections" ? {data:[{original_movement_id:"original",replacement_movement_id:"corrected"}],error:null}
        : table==="finance_allocations" ? {data:[],error:null}
        : selection==="related_movement_id" ? {data:[],error:null}
        : {data:[{id:"corrected",kind:"incoming",entries:[]},{id:"refund",kind:"refund",entries:[]}],count:155,error:null};
      const query={
        select:(...args:unknown[])=>{selection=String(args[0]);mocks.calls.push({table,method:"select",args});return query;},
        eq:(...args:unknown[])=>{mocks.calls.push({table,method:"eq",args});return query;},
        order:(...args:unknown[])=>{mocks.calls.push({table,method:"order",args});return query;},
        range:(...args:unknown[])=>{mocks.calls.push({table,method:"range",args});return query;},
        in:(...args:unknown[])=>{mocks.calls.push({table,method:"in",args});return query;},
        or:(...args:unknown[])=>{mocks.calls.push({table,method:"or",args});return query;},
        then:(resolve:(value:ReturnType<typeof result>)=>unknown)=>Promise.resolve(result()).then(resolve),
      };
      return query;
    };
    mocks.client.mockResolvedValue({from});
  });
  it("pages current IDs and counts only effective movements while retaining refunds", async () => {
    const ledger=await getFinanceMovements(2);
    expect(ledger?.total).toBe(52);
    expect(ledger?.movements).toMatchObject([{id:"corrected",supersedesId:"original"},{id:"refund",supersedesId:null}]);
    expect(mocks.calls).toContainEqual({table:"finance_current_movements",method:"range",args:[50,99]});
    expect(mocks.calls).toContainEqual({table:"finance_movements",method:"in",args:["id",["corrected","refund"]]});
    expect(mocks.calls.some(call=>call.table==="finance_movements"&&call.method==="range")).toBe(false);
  });
  it("allows explicit history to page the complete ledger", async () => {
    expect((await getFinanceMovements(2,true))?.total).toBe(155);
    expect(mocks.calls).toContainEqual({table:"finance_movements",method:"range",args:[50,99]});
    expect(mocks.calls.some(call=>call.table==="finance_current_movements")).toBe(false);
  });
});
