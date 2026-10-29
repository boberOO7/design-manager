import { describe, expect, it } from "vitest";
import { directionName, directionPresetInputSchema, equivalentArea, getStageProductivityRole, workDirectionInputSchema } from "./work-directions";
import { getTaskCreationProgressField } from "./productivity";

describe("work direction scope", () => {
  it("keeps studio guides optional and never clamps a precise coefficient to them", () => {
    const preset = { kind: "facade", coefficient: 12.5, recommendedMin: 0.25, recommendedMax: 0.6, templateId: null, version: 1 };
    expect(directionPresetInputSchema.safeParse(preset).success).toBe(true);
    expect(directionPresetInputSchema.safeParse({ ...preset, recommendedMin: 1 }).success).toBe(false);
    expect(directionPresetInputSchema.safeParse({ ...preset, recommendedMin: null }).success).toBe(false);
    expect(directionPresetInputSchema.safeParse({ ...preset, recommendedMin: null, recommendedMax: null }).success).toBe(true);
  });
  it("preserves unknown legacy titles and localizes known default types", () => {
    const labels = (key: string) => key;
    expect(directionName({ name: null, kind: null }, labels)).toBe("defaultName");
    expect(directionName({ name: null, kind: "interior" }, labels)).toBe("kinds.interior");
    expect(directionName({ name: "West facade", kind: "facade" }, labels)).toBe("West facade");
  });
  it("uses the entered coefficient independently of the direction name", () => {
    expect(equivalentArea(300, 0.3)).toBe(90);
    expect(equivalentArea(300, 12.5)).toBe(3750);
    expect(workDirectionInputSchema.safeParse({ intent: "save", name: "Landscape", areaM2: 300, coefficient: 12.5 }).success).toBe(true);
  });
  it.each([0, -1, NaN, Infinity])("rejects unusable area or coefficient %s", value => {
    expect(equivalentArea(value, 1)).toBeNull();
    expect(equivalentArea(100, value)).toBeNull();
    expect(workDirectionInputSchema.safeParse({ intent: "save", name: "Facade", areaM2: 100, coefficient: value }).success).toBe(false);
  });
  it("rejects reversed dates and malformed mutation identities", () => {
    expect(workDirectionInputSchema.safeParse({ intent: "save", name: "Facade", areaM2: 100, coefficient: 1, startDate: "2026-11-10", dueDate: "2026-11-09" }).success).toBe(false);
    expect(workDirectionInputSchema.safeParse({ intent: "remove" }).success).toBe(false);
  });
  it("keeps interior accounting roles and supports visualization in custom stages", () => {
    expect(getStageProductivityRole("stage_1")).toBe("initial");
    expect(getStageProductivityRole("stage_2")).toBe("visualization");
    expect(getStageProductivityRole("stage_3")).toBe("final");
    const custom = "custom_12345678-1234-4234-8234-123456789abc";
    expect(getTaskCreationProgressField(custom, "visualization")).toBe("area");
    expect(getTaskCreationProgressField(custom, "initial")).toBe("weight");
    expect(getTaskCreationProgressField(custom)).toBeNull();
  });
});
