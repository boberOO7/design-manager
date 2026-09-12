import { describe, expect, it } from "vitest";
import { filterCreatableSuggestions } from "./creatable-combobox";

describe("creatable combobox suggestions", () => {
  it("filters case-insensitively while leaving arbitrary input untouched", () => {
    expect(filterCreatableSuggestions(["14700K", "14700KF", "13900K"], "147")).toEqual(["14700K", "14700KF"]);
    expect(filterCreatableSuggestions(["Known"], "Unknown custom model")).toEqual([]);
  });
});
