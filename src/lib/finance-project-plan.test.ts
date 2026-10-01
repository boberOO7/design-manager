import { describe, expect, it } from "vitest";
import { projectAreaValue, projectDiscountAmounts, projectRescalePayments, projectBasisToGross, projectClientPaymentSchedule, projectGrossToBasis, projectMoneyText, projectMoneyUnits, projectPaymentAmounts, projectPaymentTemplates, projectPlanSchema, projectReferenceValue, projectRevenueTaxAmounts, projectScheduleVatAmounts, projectVatAmounts } from "./finance-project-plan";
import { projectTermsSchema } from "./finance-projects";

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
  it("recalculates client payment rows from gross when VAT changes", () => {
    const at8 = projectClientPaymentSchedule(projectVatAmounts("10560", "8", "net", 2).gross, ["50", "50"], "8", "net", 2);
    expect(at8.grossAmounts).toEqual(["5702.40", "5702.40"]);
    expect(at8.basisAmounts).toEqual(["5280.00", "5280.00"]);
    const at23 = projectClientPaymentSchedule(projectVatAmounts("10560", "23", "net", 2).gross, ["50", "50"], "23", "net", 2);
    expect(at23.grossAmounts).toEqual(["6494.40", "6494.40"]);
    const included = projectClientPaymentSchedule("10560.00", ["50", "50"], "23", "gross", 2);
    expect(included.grossAmounts).toEqual(["5280.00", "5280.00"]);
    const expected = [["11404.80"], ["5702.40", "5702.40"], ["3421.44", "5702.40", "2280.96"], ["2851.20", "2851.20", "2851.20", "2851.20"]];
    for (const [index, percentages] of projectPaymentTemplates.entries()) {
      const schedule = projectClientPaymentSchedule("11404.80", percentages.map(String), "8", "net", 2);
      expect(schedule.grossAmounts).toEqual(expected[index]);
    }
    expect(projectClientPaymentSchedule("11404.80", ["10", "15", "20", "25", "30"], "8", "net", 2).grossAmounts)
      .toEqual(["1140.48", "1710.72", "2280.96", "2851.20", "3421.44"]);
  });
  it("splits net and gross VAT amounts using minor-unit rounding", () => {
    expect(projectVatAmounts("4000", "23", "net", 2)).toEqual({ net: "4000.00", vat: "920.00", gross: "4920.00" });
    expect(projectVatAmounts("4000", "23", "gross", 2)).toEqual({ net: "3252.03", vat: "747.97", gross: "4000.00" });
    expect(projectVatAmounts("1.01", "8", "net", 2)).toEqual({ net: "1.01", vat: "0.08", gross: "1.09" });
    expect(projectVatAmounts("100", "20,5", "net", 2)).toEqual({ net: "100.00", vat: "20.50", gross: "120.50" });
    expect(projectVatAmounts("100", "0", "net", 2)).toEqual({ net: "100.00", vat: "0.00", gross: "100.00" });
    expect(projectGrossToBasis("100", "23", "net", 2)).toBe("81.30");
    expect(projectBasisToGross("81.30", "23", "net", 2)).toBe("100.00");
    const editableGross = projectMoneyText(projectMoneyUnits("123.00", 2) - projectMoneyUnits("55.00", 2), 2);
    const editableNet = projectGrossToBasis(editableGross, "23", "net", 2);
    expect(editableNet).toBe("55.28");
    expect(projectBasisToGross(editableNet, "23", "net", 2)).toBe("67.99");
    expect(projectVatAmounts("4000", null, null, 2)).toEqual({ net: "4000.00", vat: "0.00", gross: "4000.00" });
  });
  it("estimates proportional revenue tax from net revenue without changing client gross", () => {
    const noVat = projectVatAmounts("4000", null, null, 2);
    expect(projectRevenueTaxAmounts(noVat.net, "6", 2)).toEqual({ tax: "240.00", afterTax: "3760.00" });
    const netPrice = projectVatAmounts("4000", "23", "net", 2);
    expect(projectRevenueTaxAmounts(netPrice.net, "6", 2)).toEqual({ tax: "240.00", afterTax: "3760.00" });
    expect(netPrice.gross).toBe("4920.00");
    const grossPrice = projectVatAmounts("4000", "23", "gross", 2);
    expect(projectRevenueTaxAmounts(grossPrice.net, "6", 2)).toEqual({ tax: "195.12", afterTax: "3056.91" });
    expect(grossPrice.gross).toBe("4000.00");
  });
  it("distributes rounded VAT cents so split schedules close exactly", () => {
    expect(projectScheduleVatAmounts(["0.01", "0.02"], "23", "net", 2, "0.04")).toEqual([
      { net: "0.01", vat: "0.00", gross: "0.01" },
      { net: "0.02", vat: "0.01", gross: "0.03" },
    ]);
    expect(projectScheduleVatAmounts(["0.01", "0.03"], "23", "gross", 2)).toEqual([
      { net: "0.01", vat: "0.00", gross: "0.01" },
      { net: "0.02", vat: "0.01", gross: "0.03" },
    ]);
    expect(projectScheduleVatAmounts(["55.28"], "23", "net", 2, "68.00")[0]).toEqual({ net: "55.28", vat: "12.72", gross: "68.00" });
    const tiny = projectScheduleVatAmounts(Array(10).fill("0.01"), "50", "net", 2, "0.15");
    expect(tiny.reduce((sum, row) => sum + projectMoneyUnits(row.vat, 2), BigInt(0))).toBe(BigInt(5));
    expect(tiny.every((row) => projectMoneyUnits(row.vat, 2) >= BigInt(0))).toBe(true);
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
    const base={requestId:id,projectId:id,revision:0,pricingMethod:"fixed",amount:"100",vatRate:null,priceBasis:null,currency:"UAH",reason:"Signed",allowUnscheduled:false,known:[],items:[{id:"",name:"Advance",amount:"100",dueDate:"",expectedDate:""}]};
    expect(projectPlanSchema.safeParse(base).success).toBe(true);
    expect(projectPlanSchema.safeParse({...base,reason:""}).success).toBe(false);
    expect(projectPlanSchema.safeParse({...base,vatRate:"0",priceBasis:"net"}).success).toBe(true);
    expect(projectPlanSchema.safeParse({...base,revenueTaxRate:"6"}).success).toBe(true);
    expect(projectPlanSchema.safeParse({...base,revenueTaxRate:"6,125"}).success).toBe(true);
    expect(projectPlanSchema.safeParse({...base,revenueTaxRate:"-6"}).success).toBe(false);
    expect(projectPlanSchema.safeParse({...base,vatRate:null,priceBasis:"net"}).success).toBe(false);
    expect(projectPlanSchema.safeParse({...base,vatRate:"1234567890",priceBasis:"net"}).success).toBe(true);
    expect(projectPlanSchema.safeParse({...base,vatRate:"10000000000",priceBasis:"net"}).success).toBe(false);
    const terms={requestId:id,projectId:id,revision:0,stream:"supervision",mode:"monthly",amount:"100",currency:"UAH",vatRate:"",priceBasis:"",effectiveFrom:"2026-01-01",effectiveThrough:"",reason:"Agreement"};
    expect(projectTermsSchema.safeParse(terms).success).toBe(true);
    expect(projectTermsSchema.safeParse({...terms,vatRate:"0",priceBasis:"net"}).success).toBe(true);
    expect(projectTermsSchema.safeParse({...terms,vatRate:"23",priceBasis:""}).success).toBe(false);
    expect(projectTermsSchema.safeParse({...terms,vatRate:"",priceBasis:"net"}).success).toBe(false);
    expect(projectPlanSchema.safeParse({...base,pricingMethod:"area",area:"",rate:"20"}).success).toBe(false);
    expect(projectPlanSchema.safeParse({...base,items:[{...base.items[0],amount:"0"}]}).success).toBe(false);
  });
});


describe("Project discounts before VAT", () => {
  it("calculates percentage and fixed discounts with currency rounding", () => {
    expect(projectDiscountAmounts("10560", "percentage", "10", 2)).toEqual({ discount: "1056.00", agreed: "9504.00", percentage: "10.0000" });
    expect(projectDiscountAmounts("10560", "fixed", "1056", 2)).toEqual({ discount: "1056.00", agreed: "9504.00", percentage: "10.0000" });
    expect(projectDiscountAmounts("100.05", "percentage", "10", 2).discount).toBe("10.01");
    expect(projectDiscountAmounts("10560", "none", "0", 2).agreed).toBe("10560.00");
    expect(projectDiscountAmounts("3", "fixed", "1", 2).percentage).toBe("33.3333");
    for (const [type,value] of [["percentage","100"],["fixed","10560"],["fixed","0.001"],["none","1"]] as const) expect(() => projectDiscountAmounts("10560",type,value,2)).toThrow();
  });
  it("discounts Net before excluded VAT and Gross before included VAT", () => {
    const net = projectVatAmounts(projectDiscountAmounts("10560","percentage","10",2).agreed,"23","net",2);
    const gross = projectVatAmounts(projectDiscountAmounts("12988.80","percentage","10",2).agreed,"23","gross",2);
    expect(net).toEqual({net:"9504.00",vat:"2185.92",gross:"11689.92"});
    expect(gross).toEqual(net);
    expect(projectVatAmounts(projectDiscountAmounts("12988.80","fixed","1298.88",2).agreed,"23","gross",2)).toEqual(net);
    expect(projectRevenueTaxAmounts(net.net,"6",2)).toEqual({tax:"570.24",afterTax:"8933.76"});
  });
  it("allocates every preset and custom schedule from discounted client Gross", () => {
    for (const basis of ["net","gross"] as const) {
      const discounted = projectDiscountAmounts(basis === "net" ? "10560" : "12988.80","percentage","10",2);
      const price = projectVatAmounts(discounted.agreed,"23",basis,2);
      for (const shares of [...projectPaymentTemplates,[10,15,20,25,30]]) {
        const schedule = projectClientPaymentSchedule(price.gross,shares.map(String),"23",basis,2);
        expect(schedule.grossAmounts.reduce((sum,value)=>sum+projectMoneyUnits(value,2),BigInt(0))).toBe(projectMoneyUnits(price.gross,2));
      }
    }
    expect(projectRescalePayments(["333.33","333.33","333.33"],"999.99","999.99",2)).toEqual(["333.33","333.33","333.33"]);
    expect(projectRescalePayments(["333.33","333.33","333.33"],"999.99","999.98",2)).toEqual(["333.33","333.32","333.33"]);
    expect(projectRescalePayments(["300","500","200"],"1000","900",2)).toEqual(["270.00","450.00","180.00"]);
    expect(projectRescalePayments(["300","300"],"1000","900",2)).toEqual(["270.00","270.00"]);
    // Keep the entire protected 369 Gross, not only its settled 1 Gross.
    const remaining = projectClientPaymentSchedule("738",["75","25"],"23","net",2);
    expect(remaining.grossAmounts).toEqual(["553.50","184.50"]);
  });
});
