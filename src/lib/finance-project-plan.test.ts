import { describe, expect, it } from "vitest";
import { projectAreaValue, projectMoneyText, projectMoneyUnits, projectPaymentAmounts, projectPaymentTemplates, projectPlanSchema, projectReferenceValue } from "./finance-project-plan";

describe("Project value and schedule previews", () => {
  it("keeps fixed values exact and calculates area × rate at currency precision", () => {
    expect(projectMoneyText(projectMoneyUnits("2460.01",2),2)).toBe("2460.01");
    expect(projectAreaValue("123","20",2)).toBe("2460.00");
    expect(projectAreaValue("1.005","1",2)).toBe("1.01");
    expect(projectAreaValue("123.4567","12.3456",4)).toBe("1524.1470");
    expect(()=>projectMoneyUnits("10.001",2)).toThrow("precision");
    expect(()=>projectMoneyUnits("-1",2)).toThrow();
    expect(()=>projectMoneyUnits("1e2",2)).toThrow();
  });
  it("reconciles every standard template and arbitrary custom counts", () => {
    for(const percentages of [...projectPaymentTemplates,[10,15,20,25,30]]) {
      const amounts=projectPaymentAmounts("100.01",percentages.map(String),2);
      expect(amounts.reduce((sum,v)=>sum+projectMoneyUnits(v,2),BigInt(0))).toBe(BigInt(10001));
      expect(amounts).toHaveLength(percentages.length);
    }
    expect(projectPaymentAmounts("100.01",["30","50","20"],2)).toEqual(["30.00","50.00","20.01"]);
    expect(projectPaymentAmounts("101",["25","25","25","25"],0)).toEqual(["25","25","25","26"]);
    expect(projectPaymentAmounts("1.0001",["50","50"],4)).toEqual(["0.5000","0.5001"]);
    expect(projectPaymentAmounts("1",["33.33","33.33","33.34"],2)).toEqual(["0.33","0.33","0.34"]);
    expect(()=>projectPaymentAmounts("100",["30","50"],2)).toThrow("percentages");
    expect(projectPaymentAmounts("100",["30","50"],2,false)).toEqual(["30.00","50.00"]);
    expect(projectPaymentAmounts("100",["100","0"],2,false)).toEqual(["100.00","0.00"]);
  });
  it("redistributes the full editable value, excluding full contractual protected value", () => {
    const remaining=projectMoneyText(projectMoneyUnits("1000",2)-projectMoneyUnits("800",2),2);
    expect(projectPaymentAmounts(remaining,["50","50"],2)).toEqual(["100.00","100.00"]);
  });
  it("reference FX can change without changing the contract", () => {
    const contract=projectAreaValue("123","20",2);
    expect(projectReferenceValue(contract,"44.25",2)).toBe("108855.00");
    expect(projectReferenceValue(contract,"45",2)).toBe("110700.00");
    expect(contract).toBe("2460.00");
  });
  it("validates schedule input and amendment reasons at the action boundary", () => {
    const id="65000000-0000-4000-8000-000000000001";
    const base={requestId:id,projectId:id,revision:0,pricingMethod:"fixed",amount:"100",currency:"UAH",reason:"Signed",allowUnscheduled:false,known:[],items:[{id:"",name:"Advance",amount:"100",dueDate:"",expectedDate:""}]};
    expect(projectPlanSchema.safeParse(base).success).toBe(true);
    expect(projectPlanSchema.safeParse({...base,reason:""}).success).toBe(false);
    expect(projectPlanSchema.safeParse({...base,pricingMethod:"area",area:"",rate:"20"}).success).toBe(false);
    expect(projectPlanSchema.safeParse({...base,items:[{...base.items[0],amount:"0"}]}).success).toBe(false);
  });
});
