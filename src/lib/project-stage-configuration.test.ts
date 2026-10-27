import { describe, expect, it } from "vitest";
import { moveProjectStage, validateProjectStageConfiguration } from "./project-stage-configuration";
import { DEFAULT_PROJECT_STAGES } from "./task-stages";

const stages = DEFAULT_PROJECT_STAGES.map((stage, index) => ({ ...stage, displayName: `Stage ${index + 1}`, isEnabled: true, displayOrder: index + 1 }));
const custom = { stage: "custom_12345678-1234-1234-1234-123456789abc", displayName: "Extra work", isEnabled: true, displayOrder: 5, kind: "work", progressWeight: 1 };

describe("project stage configuration", () => {
  it("moves stages in either direction and renumbers positions without changing their settings", () => {
    const input = stages.map((stage, index) => ({ ...stage, isEnabled: index !== 1 }));
    const before = structuredClone(input);
    const moved = moveProjectStage(input, "stage_1", "stage_3");
    expect(moved.map((stage) => stage.stage)).toEqual(["stage_2", "stage_3", "stage_1", "stage_4"]);
    expect(moved).toEqual([input[1], input[2], input[0], input[3]].map((stage, index) => ({ ...stage, displayOrder: index + 1 })));
    expect(moveProjectStage(moved, "stage_1", "stage_2")).toEqual(input);
    expect(input).toEqual(before);
    expect(validateProjectStageConfiguration(moved)).toEqual(moved);
  });
  it("keeps the draft when a drop is on the same stage or outside the list", () => {
    expect(moveProjectStage(stages, "stage_1", "stage_1")).toBe(stages);
    expect(moveProjectStage(stages, "stage_1", "")).toBe(stages);
    expect(moveProjectStage(stages, "missing", "stage_1")).toBe(stages);
  });
  it("accepts renamed and reordered stages without changing identity", () => {
    const input = [{ ...stages[1], displayOrder: 1 }, { ...stages[0], displayName: " New name ", displayOrder: 2 }, ...stages.slice(2)];
    expect(validateProjectStageConfiguration(input)?.[1]).toEqual({ ...input[1], displayName: "New name" });
  });
  it("allows additional stages and deletion of legacy stages", () => {
    expect(validateProjectStageConfiguration([...stages, custom])).toHaveLength(5);
    expect(validateProjectStageConfiguration(stages.slice(0, 3))).toHaveLength(3);
    expect(validateProjectStageConfiguration([{ ...custom, displayOrder: 1, kind: "additional" }])).toHaveLength(1);
  });
  it("requires one visible stage, unique IDs and contiguous positions", () => {
    expect(validateProjectStageConfiguration([])).toBeNull();
    expect(validateProjectStageConfiguration(stages.map((stage) => ({ ...stage, isEnabled: false })))).toBeNull();
    expect(validateProjectStageConfiguration([stages[0], { ...stages[1], displayOrder: 1 }])).toBeNull();
    expect(validateProjectStageConfiguration([stages[0], { ...stages[0], displayOrder: 2 }])).toBeNull();
    expect(validateProjectStageConfiguration([stages[1]])).toBeNull();
  });
  it.each([{ stage: "custom_invalid" }, { displayName: " " }, { displayName: "a".repeat(81) }, { progressWeight: 0 }, { progressWeight: 1.5 }, { progressWeight: Number.NaN }, { kind: "unknown" }])("rejects invalid values %o", (change) => {
    expect(validateProjectStageConfiguration([{ ...custom, displayOrder: 1, ...change }])).toBeNull();
  });
});
