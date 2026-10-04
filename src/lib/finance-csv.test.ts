import { describe, expect, it } from "vitest";
import { financeCsv } from "./finance-csv";

describe("financeCsv", () => {
  it("writes RFC 4180 fields and CRLF rows with a UTF-8 BOM", () => {
    expect(financeCsv([
      ["label", "comma", "quote", "line"],
      ["plain", "a,b", 'say "hi"', "first\nsecond"],
    ])).toBe('\uFEFFlabel,comma,quote,line\r\nplain,"a,b","say ""hi""","first\nsecond"');
  });

  it("keeps Ukrainian text, nulls, and signed decimal money values intact", () => {
    expect(financeCsv([["Зарплата", null, "-1234.50", "-0.25"]])).toBe("\uFEFFЗарплата,,-1234.50,-0.25");
  });

  it("prefixes formula-like labels while preserving numeric negatives", () => {
    expect(financeCsv([["=1+1", "+cmd", "@SUM(A1:A2)", "-2+3", "-12.50", " \t=1+1"]]))
      .toBe("\uFEFF'=1+1,'+cmd,'@SUM(A1:A2),'-2+3,-12.50,' \t=1+1");
  });
});
