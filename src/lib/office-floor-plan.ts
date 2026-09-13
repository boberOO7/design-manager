import type { Database } from "@/types/database.types";

type PlacementRow = Database["public"]["Tables"]["office_floor_plan_placements"]["Row"];

export type FloorPlanFloor = 1 | 2;
export type FloorPlanEntityType = "workstation" | "equipment";
export type FloorPlanPlacement = {
  id: string;
  entityType: FloorPlanEntityType;
  entityId: string;
  floor: FloorPlanFloor;
  x: number;
  y: number;
  displayMetadata: PlacementRow["display_metadata"];
};

export function floorPlanPlacementKey(placement: Pick<FloorPlanPlacement, "entityId" | "entityType">) {
  return `${placement.entityType}:${placement.entityId}`;
}

export function clampFloorPlanCoordinate(value: number) {
  return Math.min(1, Math.max(0, value));
}
