import { describe, expect, it } from "vitest";
import {
  FLOOR_PLAN_DEFAULT_SIZES,
  clampFloorPlanCoordinate,
  floorPlanPlacementKey,
  getFloorPlanRotation,
  getFloorPlanSize,
  nextFloorPlanRotation,
  readFloorPlanDisplayMetadata,
  snapFloorPlanRect,
  type FloorPlanSnapRect,
} from "@/lib/office-floor-plan";

describe("office floor-plan coordinates", () => {
  it("keeps coordinates normalized and entity keys stable", () => {
    expect(clampFloorPlanCoordinate(-0.5)).toBe(0);
    expect(clampFloorPlanCoordinate(0.42)).toBe(0.42);
    expect(clampFloorPlanCoordinate(1.5)).toBe(1);
    expect(floorPlanPlacementKey({ entityType: "workstation", entityId: "desk-1" })).toBe("workstation:desk-1");
  });

  it("keeps old layouts readable and cycles persisted quarter-turn rotation", () => {
    expect(readFloorPlanDisplayMetadata({ future: "kept", rotation: 45, width: 24 })).toEqual({ future: "kept" });
    expect(getFloorPlanSize({}, "printer")).toEqual(FLOOR_PLAN_DEFAULT_SIZES.printer);
    expect(getFloorPlanRotation({ rotation: 270 })).toBe(270);
    const rotations = [0, 90, 180, 270] satisfies Array<0 | 90 | 180 | 270>;
    expect(rotations.map(nextFloorPlanRotation)).toEqual([90, 180, 270, 0]);
  });

  it("magnetically snaps edges and centers before the logical grid", () => {
    const result = snapFloorPlanRect({
      moving: { key: "moving", x: 58, y: 76, width: 20, height: 10, rotation: 0 },
      peers: [{ key: "peer", x: 80, y: 80, width: 20, height: 10, rotation: 0 }],
      plan: { width: 200, height: 200 },
      threshold: 4,
      walls: { x: [], y: [] },
    });
    expect(result.x).toBe(60);
    expect(result.y).toBe(80);
    expect(result.guides).toEqual([{ axis: "x", kind: "object", value: 70 }, { axis: "y", kind: "object", value: 75 }]);
  });

  it("uses explicit wall guides and lets Alt-style bypass skip every snap", () => {
    const moving: FloorPlanSnapRect = { key: "moving", x: 87, y: 53, width: 20, height: 10, rotation: 0 };
    const input = {
      moving,
      peers: [],
      plan: { width: 200, height: 200 },
      threshold: 4,
      walls: { x: [100], y: [] },
    };
    expect(snapFloorPlanRect(input)).toMatchObject({ x: 90, y: 56, guides: [{ axis: "x", kind: "wall", value: 100 }] });
    expect(snapFloorPlanRect({ ...input, bypass: true })).toEqual({ x: 87, y: 53, guides: [] });
  });
});
