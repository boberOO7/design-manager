import { describe, expect, it } from "vitest";
import { fullFinanceSettlementAmount, indicativeFinanceConversion } from "./finance-fx-preview";

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
