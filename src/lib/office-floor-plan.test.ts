import { describe, expect, it } from "vitest";
import { clampFloorPlanCoordinate, floorPlanPlacementKey } from "@/lib/office-floor-plan";

describe("office floor-plan coordinates", () => {
  it("keeps coordinates normalized and entity keys stable", () => {
    expect(clampFloorPlanCoordinate(-0.5)).toBe(0);
    expect(clampFloorPlanCoordinate(0.42)).toBe(0.42);
    expect(clampFloorPlanCoordinate(1.5)).toBe(1);
    expect(floorPlanPlacementKey({ entityType: "workstation", entityId: "desk-1" })).toBe("workstation:desk-1");
  });
});
