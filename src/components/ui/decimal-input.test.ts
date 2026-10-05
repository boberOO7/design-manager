import { describe, expect, it } from "vitest";
import { filterDecimalInput } from "./decimal-input";

describe("decimal input filtering", () => {
  it.each([
    ["", ""],
    ["123", "123"],
    ["41.5", "41.5"],
    ["41,5", "41,5"],
    ["12abc34", "1234"],
    ["-1e+2", "12"],
    ["1 234,56 USD", "1234,56"],
    ["12.3,4.5", "12.345"],
    ["12,3.4,5", "12,345"],
  ])("filters %j to %j", (input, expected) => {
    expect(filterDecimalInput(input)).toBe(expected);
  });
});
