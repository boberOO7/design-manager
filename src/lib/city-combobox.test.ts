import { describe, expect, it } from "vitest";
import { shouldOpenCitySuggestions, shouldSearchCity } from "./city-combobox";

describe("city combobox initialization", () => {
  it("does not search or open suggestions for an existing edit value", () => {
    expect(shouldSearchCity({ countryCode: "UA", query: "Kyiv", userEdited: false })).toBe(false);
    expect(shouldOpenCitySuggestions({ query: "Kyiv", status: "ready", userEdited: false })).toBe(false);
  });

  it("searches from the first character only after a user edit", () => {
    expect(shouldSearchCity({ countryCode: "UA", query: "K", userEdited: true })).toBe(true);
    expect(shouldOpenCitySuggestions({ query: "K", status: "loading", userEdited: true })).toBe(true);
  });

  it("requires both a country and a non-empty query", () => {
    expect(shouldSearchCity({ countryCode: "", query: "K", userEdited: true })).toBe(false);
    expect(shouldSearchCity({ countryCode: "UA", query: " ", userEdited: true })).toBe(false);
  });
});
