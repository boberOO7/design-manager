import type { Database, Json } from "@/types/database.types";

type PlacementRow = Database["public"]["Tables"]["office_floor_plan_placements"]["Row"];

export type FloorPlanFloor = 1 | 2;
export type FloorPlanEntityType = "workstation" | "equipment";
export type FloorPlanObjectKind = "workstation" | "printer" | "air_conditioner" | "coffee_machine" | "other";
export type FloorPlanRotation = 0 | 90 | 180 | 270;
export type FloorPlanSize = { width: number; height: number };
export type FloorPlanDisplayMetadata = Record<string, Json> & {
  rotation?: FloorPlanRotation;
  width?: number;
  height?: number;
};
export type FloorPlanPlacement = {
  id: string;
  entityType: FloorPlanEntityType;
  entityId: string;
  floor: FloorPlanFloor;
  x: number;
  y: number;
  displayMetadata: FloorPlanDisplayMetadata;
};

export type FloorPlanSnapRect = FloorPlanSize & {
  key: string;
  rotation: FloorPlanRotation;
  x: number;
  y: number;
};

export type FloorPlanSnapGuide = {
  axis: "x" | "y";
  kind: "object" | "wall";
  value: number;
};

export const FLOOR_PLAN_DEFAULT_SIZES: Record<FloorPlanObjectKind, FloorPlanSize> = {
  workstation: { width: 34, height: 15 },
  printer: { width: 22, height: 14 },
  air_conditioner: { width: 30, height: 11 },
  coffee_machine: { width: 18, height: 14 },
  other: { width: 18, height: 14 },
};

export const FLOOR_PLAN_GRID_STEP = 8;

export function floorPlanPlacementKey(placement: Pick<FloorPlanPlacement, "entityId" | "entityType">) {
  return `${placement.entityType}:${placement.entityId}`;
}

export function clampFloorPlanCoordinate(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function readFloorPlanDisplayMetadata(value: PlacementRow["display_metadata"]): FloorPlanDisplayMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const metadata: Record<string, Json> = {};
  for (const [key, entry] of Object.entries(value)) if (entry !== undefined) metadata[key] = entry;
  if (![0, 90, 180, 270].includes(Number(metadata.rotation))) delete metadata.rotation;
  if (typeof metadata.width !== "number" || metadata.width < 6 || metadata.width > 120) delete metadata.width;
  if (typeof metadata.height !== "number" || metadata.height < 6 || metadata.height > 120) delete metadata.height;
  if ((metadata.width === undefined) !== (metadata.height === undefined)) {
    delete metadata.width;
    delete metadata.height;
  }
  return metadata;
}

export function getFloorPlanRotation(metadata: FloorPlanDisplayMetadata): FloorPlanRotation {
  return metadata.rotation === 90 || metadata.rotation === 180 || metadata.rotation === 270 ? metadata.rotation : 0;
}

export function getFloorPlanSize(metadata: FloorPlanDisplayMetadata, kind: FloorPlanObjectKind): FloorPlanSize {
  return typeof metadata.width === "number" && typeof metadata.height === "number"
    ? { width: metadata.width, height: metadata.height }
    : FLOOR_PLAN_DEFAULT_SIZES[kind];
}

export function getRotatedFloorPlanSize(size: FloorPlanSize, rotation: FloorPlanRotation): FloorPlanSize {
  return rotation === 90 || rotation === 270 ? { width: size.height, height: size.width } : size;
}

export function nextFloorPlanRotation(rotation: FloorPlanRotation): FloorPlanRotation {
  if (rotation === 0) return 90;
  if (rotation === 90) return 180;
  if (rotation === 180) return 270;
  return 0;
}

function nearestAnchorOffset(moving: readonly number[], targets: readonly number[], threshold: number) {
  let best: { distance: number; offset: number; value: number } | null = null;
  for (const source of moving) for (const target of targets) {
    const offset = target - source;
    const distance = Math.abs(offset);
    if (distance <= threshold && (!best || distance < best.distance)) best = { distance, offset, value: target };
  }
  return best;
}

function nearestObjectOffset(moving: readonly [number, number, number], targets: readonly [number, number, number], threshold: number) {
  const pairs = [[0, 0], [1, 1], [2, 2], [0, 2], [2, 0]] as const;
  let best: { distance: number; offset: number; value: number } | null = null;
  for (const [sourceIndex, targetIndex] of pairs) {
    const offset = targets[targetIndex] - moving[sourceIndex];
    const distance = Math.abs(offset);
    if (distance <= threshold && (!best || distance < best.distance)) best = { distance, offset, value: targets[targetIndex] };
  }
  return best;
}

export function snapFloorPlanRect({
  bypass = false,
  gridStep = FLOOR_PLAN_GRID_STEP,
  moving,
  peers,
  plan,
  threshold = 4,
  walls,
}: {
  bypass?: boolean;
  gridStep?: number;
  moving: FloorPlanSnapRect;
  peers: FloorPlanSnapRect[];
  plan: FloorPlanSize;
  threshold?: number;
  walls: { x: readonly number[]; y: readonly number[] };
}) {
  const movingSize = getRotatedFloorPlanSize(moving, moving.rotation);
  const halfWidth = movingSize.width / 2;
  const halfHeight = movingSize.height / 2;
  let x = Math.min(plan.width - halfWidth, Math.max(halfWidth, moving.x));
  let y = Math.min(plan.height - halfHeight, Math.max(halfHeight, moving.y));
  if (bypass) return { x, y, guides: [] as FloorPlanSnapGuide[] };

  const peerAnchors: Array<{ x: [number, number, number]; y: [number, number, number] }> = [];
  for (const peer of peers) {
    if (peer.key === moving.key) continue;
    const size = getRotatedFloorPlanSize(peer, peer.rotation);
    peerAnchors.push({ x: [peer.x - size.width / 2, peer.x, peer.x + size.width / 2], y: [peer.y - size.height / 2, peer.y, peer.y + size.height / 2] });
  }

  const movingX: [number, number, number] = [x - halfWidth, x, x + halfWidth];
  const movingY: [number, number, number] = [y - halfHeight, y, y + halfHeight];
  let objectX: ReturnType<typeof nearestObjectOffset> = null;
  let objectY: ReturnType<typeof nearestObjectOffset> = null;
  for (const peer of peerAnchors) {
    const candidateX = nearestObjectOffset(movingX, peer.x, threshold);
    const candidateY = nearestObjectOffset(movingY, peer.y, threshold);
    if (candidateX && (!objectX || candidateX.distance < objectX.distance)) objectX = candidateX;
    if (candidateY && (!objectY || candidateY.distance < objectY.distance)) objectY = candidateY;
  }
  const wallX = nearestAnchorOffset([movingX[0], movingX[2]], walls.x, threshold);
  const wallY = nearestAnchorOffset([movingY[0], movingY[2]], walls.y, threshold);
  const snappedX = objectX && (!wallX || objectX.distance <= wallX.distance) ? { ...objectX, kind: "object" as const } : wallX ? { ...wallX, kind: "wall" as const } : null;
  const snappedY = objectY && (!wallY || objectY.distance <= wallY.distance) ? { ...objectY, kind: "object" as const } : wallY ? { ...wallY, kind: "wall" as const } : null;

  x += snappedX?.offset ?? Math.round(x / gridStep) * gridStep - x;
  y += snappedY?.offset ?? Math.round(y / gridStep) * gridStep - y;
  x = Math.min(plan.width - halfWidth, Math.max(halfWidth, x));
  y = Math.min(plan.height - halfHeight, Math.max(halfHeight, y));
  const guides: FloorPlanSnapGuide[] = [];
  if (snappedX) guides.push({ axis: "x", kind: snappedX.kind, value: snappedX.value });
  if (snappedY) guides.push({ axis: "y", kind: snappedY.kind, value: snappedY.value });
  return { x, y, guides };
}
