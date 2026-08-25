import { describe, expect, it } from "vitest";
import { validateProjectStageConfiguration } from "./project-stage-configuration";

const stages = [
  { stage: "stage_1", displayName: "Internal work", isEnabled: true, displayOrder: 1 },
  { stage: "stage_2", displayName: "Stage 2", isEnabled: true, displayOrder: 2 },
  { stage: "stage_3", displayName: "Stage 3", isEnabled: true, displayOrder: 3 },
  { stage: "stage_4", displayName: "Stage 4", isEnabled: true, displayOrder: 4 },
];

describe("project stage configuration", () => {
  it("keeps stable stage IDs while accepting renamed and reordered display settings", () => {
    const result = validateProjectStageConfiguration([{ ...stages[1], displayOrder: 1 }, { ...stages[0], displayOrder: 2 }, { ...stages[2], isEnabled: false, displayOrder: 3 }, { ...stages[3], isEnabled: false, displayOrder: 4 }]);
    expect(result).toEqual([{ ...stages[1], displayOrder: 1 }, { ...stages[0], displayOrder: 2 }, { ...stages[2], isEnabled: false, displayOrder: 3 }, { ...stages[3], isEnabled: false, displayOrder: 4 }]);
  });

  it("requires one enabled stage and four distinct stable stages/orders", () => {
    expect(validateProjectStageConfiguration(stages.map((stage) => ({ ...stage, isEnabled: false })))).toBeNull();
    expect(validateProjectStageConfiguration([{ ...stages[0] }, { ...stages[1], displayOrder: 1 }, stages[2], stages[3]])).toBeNull();
    expect(validateProjectStageConfiguration(stages.slice(0, 3))).toBeNull();
  });
});
