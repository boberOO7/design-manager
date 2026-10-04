import { describe, expect, it } from "vitest";
import { actualFinanceSettlementRate, fullFinanceSettlementAmount, indicativeFinanceConversion, previewFinanceAllocationSplit, proposeFinanceAllocations } from "./finance-fx-preview";

describe("indicative Finance conversion", () => {
  it("previews one USD schedule in EUR and UAH without changing its USD amount", () => {
    const usd = "774.20";
    expect(indicativeFinanceConversion(usd,"0.8888888889",2,2)).toBe("688.18");
    expect(indicativeFinanceConversion(usd,"40",2,2)).toBe("30968.00");
    expect(usd).toBe("774.20");
  });
  it("fills enough account cash to clear the obligation after currency rounding", () => {
    const received = fullFinanceSettlementAmount("774.20","1.125",2,2);
    expect(received).toBe("688.18");
    expect(indicativeFinanceConversion(received ?? "","1.125",2,2)).toBe("774.20");
  });
  it("shows partial settlement in obligation currency", () => {
    expect(indicativeFinanceConversion("650","1.1367230769",2,2)).toBe("738.87");
    expect(indicativeFinanceConversion("1.001","1.125",2,2)).toBeNull();
  });
});

describe("one real transfer allocation preview", () => {
  it("proposes selected then forward balances and conserves native cash", () => {
    const proposal = proposeFinanceAllocations("1160.00", ["830.00", "2000.00", "2000.00"], 2);
    expect(proposal).toEqual(["830.00", "330.00", "0.00"]);
    expect(previewFinanceAllocationSplit("1000", "1.16", proposal, 2, 2)).toEqual({
      converted: "1160.00", advance: "0.00", allocations: [
        { amount: "830.00", paymentAmount: "715.52" }, { amount: "330.00", paymentAmount: "284.48" }, { amount: "0.00", paymentAmount: "0.00" },
      ],
    });
  });
  it("allows edited allocations and leaves unused cash in native currency", () => {
    expect(previewFinanceAllocationSplit("1000", "1.16", ["830", "100", "0"], 2, 2).advance).toBe("198.27");
    expect(previewFinanceAllocationSplit("1000", "1.16", ["0", "0"], 2, 2).advance).toBe("1000.00");
  });
  it("rejects a split with positive obligation but zero native principal", () => {
    expect(() => previewFinanceAllocationSplit("0.01", "100", ["0.01", "0.99"], 2, 2)).toThrow("unrepresentable");
    expect(() => previewFinanceAllocationSplit("100", "1.16", ["117"], 2, 2)).toThrow("overallocated");
  });
  it("derives the actual rate from a contractual equivalent without float arithmetic", () => {
    expect(actualFinanceSettlementRate("1000", "1160", 2, 2)).toBe("1.1600000000");
    expect(actualFinanceSettlementRate("0", "1", 2, 2)).toBeNull();
    expect(actualFinanceSettlementRate("1.001", "1", 2, 2)).toBeNull();
  });
});
