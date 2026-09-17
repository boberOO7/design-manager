import { describe,expect,it } from "vitest";
import { allocationInputSchema,categoryInputSchema,expectedInputSchema,financeCategoryLabel,financeMovementCategoryLabel,type FinanceCategory } from "./finance-planning";
const id="64000000-0000-4000-8000-000000000100";
const item={ requestId:id,direction:"incoming",amount:"100,25",currency:"UAH",categoryId:id,commitment:"agreed",certainty:"fixed",established:"true",dueDate:"2026-09-01",expectedDate:"2026-10-01" };
describe("Finance planning inputs",()=>{
  it("preserves exact expected amounts and distinct contractual/forecast dates",()=>{
    expect(expectedInputSchema.parse(item)).toMatchObject({ amount:"100.25",dueDate:"2026-09-01",expectedDate:"2026-10-01" });
    expect(expectedInputSchema.safeParse({ ...item,dueDate:"" }).success).toBe(true);
  });
  it("requires agreed fixed value for an established receivable or obligation",()=>{
    expect(expectedInputSchema.safeParse({ ...item,commitment:"tentative" }).success).toBe(false);
    expect(expectedInputSchema.safeParse({ ...item,certainty:"estimated" }).success).toBe(false);
    expect(expectedInputSchema.safeParse({ ...item,commitment:"cancelled",established:"false" }).success).toBe(true);
  });
  it("rejects invalid settlement amounts and tenant identifiers",()=>{
    const allocation={ requestId:id,itemId:id,movementId:id,amount:"12.34" };
    expect(allocationInputSchema.parse(allocation).amount).toBe("12.34");
    for(const amount of ["0","-1","NaN","Infinity","1e2","1.23456","10000000000"]) expect(allocationInputSchema.safeParse({ ...allocation,amount }).success).toBe(false);
    expect(allocationInputSchema.safeParse({ ...allocation,movementId:"spoofed" }).success).toBe(false);
  });
  it("cannot classify incoming categories as owner distributions",()=>{
    expect(categoryInputSchema.safeParse({ requestId:id,name:"Owner",direction:"incoming",nature:"owner_distribution" }).success).toBe(false);
  });
  it("localizes system identity while preserving custom and legacy labels",()=>{
    const system:FinanceCategory={ id,studio_id:id,name:"Rent",direction:"outgoing",nature:"operating",default_key:"rent",custom_name:false,archived_at:null,created_at:"" };
    expect(financeCategoryLabel(system,system.name,(key)=>({ rent:"Оренда" })[key]??key)).toBe("Оренда");
    expect(financeCategoryLabel({ ...system,name:"Оренда офісу",custom_name:true },system.name,()=>"Rent")).toBe("Оренда офісу");
    expect(financeMovementCategoryLabel(id,"Rent",[{ ...system,name:"Оренда офісу",custom_name:true }],()=>"Оренда")).toBe("Rent");
    expect(financeMovementCategoryLabel(null,"Legacy bespoke label",[system],()=>"Оренда")).toBe("Legacy bespoke label");
  });
});
