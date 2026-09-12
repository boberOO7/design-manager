import { describe, expect, it } from "vitest";
import { CPU_MODEL_SUGGESTIONS, equipmentManufacturerSuggestions, equipmentModelSuggestions } from "./equipment-reference-catalog";

describe("equipment reference catalog", () => {
  it("suggests models from repo-owned reference data without inventory records", () => {
    expect(CPU_MODEL_SUGGESTIONS.Intel["Core i7"]).toContain("14700KF");
    expect(CPU_MODEL_SUGGESTIONS.AMD["Ryzen 7"]).toContain("7800X3D");
    expect(equipmentManufacturerSuggestions("monitor")).toContain("LG");
    expect(equipmentModelSuggestions("monitor", "lg")).toContain("27UP850");
    expect(equipmentModelSuggestions("monitor", "Unknown maker")).toEqual([]);
  });
});
