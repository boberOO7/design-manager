"use client";

import * as Popover from "@radix-ui/react-popover";
import { Info, Maximize2, Minus, Move, Plus, RotateCw, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import { saveFloorPlanLayout } from "@/app/(app)/office/equipment/actions";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { EquipmentItem, WorkstationItem } from "@/data/queries/equipment";
import { equipmentDisplayName, getMaintenanceUrgency, isOtherEquipment } from "@/lib/equipment";
import {
  FLOOR_PLAN_DEFAULT_SIZES,
  FLOOR_PLAN_GRID_STEP,
  clampFloorPlanCoordinate,
  floorPlanPlacementKey,
  getFloorPlanRotation,
  getFloorPlanSize,
  getRotatedFloorPlanSize,
  nextFloorPlanRotation,
  snapFloorPlanRect,
  type FloorPlanDisplayMetadata,
  type FloorPlanEntityType,
  type FloorPlanFloor,
  type FloorPlanObjectKind,
  type FloorPlanPlacement,
  type FloorPlanRotation,
  type FloorPlanSize,
  type FloorPlanSnapGuide,
  type FloorPlanSnapRect,
} from "@/lib/office-floor-plan";
import { cn } from "@/lib/utils";

const floorPlans = {
  1: { src: "/floor-1.svg", width: 337.572, height: 562.115, walls: { x: [21, 93, 154, 188, 316], y: [67, 296, 354, 467, 540] } },
  2: { src: "/floor-2.svg", width: 334.737, height: 597.448, walls: { x: [22, 94, 115, 178, 207, 315], y: [85, 278, 344, 487, 568] } },
} as const;

type FloorPlanEntity = {
  id: string;
  key: string;
  type: FloorPlanEntityType;
  kind: FloorPlanObjectKind;
  label: string;
  marker: string;
  attention: "service" | "maintenance" | null;
};
type ViewBox = { x: number; y: number; width: number; height: number };
type PanState = { pointerId: number; clientX: number; clientY: number; viewBox: ViewBox };
type DragState = { key: string; clientX: number; clientY: number; offsetX: number; offsetY: number };

function fitViewBox(plan: FloorPlanSize): ViewBox {
  return { x: 0, y: 0, width: plan.width, height: plan.height };
}

function zoomViewBox(current: ViewBox, plan: FloorPlanSize, factor: number, anchor = { x: current.x + current.width / 2, y: current.y + current.height / 2 }): ViewBox {
  const width = Math.min(plan.width, Math.max(plan.width * 0.3, current.width * factor));
  const height = width * plan.height / plan.width;
  const ratio = width / current.width;
  return {
    x: Math.min(plan.width - width, Math.max(0, anchor.x - (anchor.x - current.x) * ratio)),
    y: Math.min(plan.height - height, Math.max(0, anchor.y - (anchor.y - current.y) * ratio)),
    width,
    height,
  };
}

function metadataWithAppearance(metadata: FloorPlanDisplayMetadata, rotation: FloorPlanRotation, size: FloorPlanSize): FloorPlanDisplayMetadata {
  return { ...metadata, rotation, width: size.width, height: size.height };
}

export default function FloorPlanView({ equipment, placements, today, workstations, onOpenEquipment, onOpenWorkstation }: { equipment: EquipmentItem[]; placements: FloorPlanPlacement[]; today: string; workstations: WorkstationItem[]; onOpenEquipment: (id: string) => void; onOpenWorkstation: (id: string) => void }) {
  const t = useTranslations("Equipment");
  const router = useRouter();
  const [floor, setFloor] = useState<FloorPlanFloor>(1);
  const [editMode, setEditMode] = useState(false);
  const [placingKey, setPlacingKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState<FloorPlanSnapGuide[]>([]);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<PanState | null>(null);
  const dragKeyRef = useRef<DragState | null>(null);
  const draggedRef = useRef(false);
  const plan = floorPlans[floor];
  const [viewBox, setViewBox] = useState<ViewBox>(() => fitViewBox(plan));

  const entities = useMemo(() => {
    const result = new Map<string, FloorPlanEntity>();
    for (const item of workstations) {
      if (item.workstationType !== "office") continue;
      const entity: FloorPlanEntity = { id: item.id, key: `workstation:${item.id}`, type: "workstation", kind: "workstation", label: `${t("workstation.numberLabel", { number: item.number })}${item.name ? ` · ${item.name}` : ""}`, marker: `#${item.number}`, attention: null };
      result.set(entity.key, entity);
    }
    for (const item of equipment) {
      if (!isOtherEquipment(item.equipmentType)) continue;
      const urgency = getMaintenanceUrgency(item.recurringMaintenanceEnabled, item.nextMaintenanceDueDate, today);
      const entity: FloorPlanEntity = { id: item.id, key: `equipment:${item.id}`, type: "equipment", kind: item.equipmentType, label: equipmentDisplayName(item), marker: item.assetTag.split("-")[0].slice(0, 3), attention: item.lifecycleState === "in_service" ? "service" : urgency ? "maintenance" : null };
      result.set(entity.key, entity);
    }
    return result;
  }, [equipment, t, today, workstations]);

  const eligiblePlacements = useMemo(() => placements.filter((placement) => entities.has(floorPlanPlacementKey(placement))), [entities, placements]);
  const [draft, setDraft] = useState<FloorPlanPlacement[]>(eligiblePlacements);
  const [rememberedSizes, setRememberedSizes] = useState<Record<FloorPlanObjectKind, FloorPlanSize>>(() => {
    const sizes = { ...FLOOR_PLAN_DEFAULT_SIZES };
    for (const placement of eligiblePlacements) {
      const entity = entities.get(floorPlanPlacementKey(placement));
      if (entity) sizes[entity.kind] = getFloorPlanSize(placement.displayMetadata, entity.kind);
    }
    return sizes;
  });
  const layout = editMode ? draft : eligiblePlacements;
  const placedKeys = new Set(layout.map(floorPlanPlacementKey));
  const visiblePlacements = layout.filter((placement) => placement.floor === floor && entities.has(floorPlanPlacementKey(placement)));
  const unplaced = [...entities.values()].filter((entity) => !placedKeys.has(entity.key));
  const selectedEntity = selectedKey ? entities.get(selectedKey) ?? null : null;
  const selectedPlacement = selectedKey ? draft.find((placement) => floorPlanPlacementKey(placement) === selectedKey) ?? null : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(eligiblePlacements);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const matrix = svg.getScreenCTM();
      const anchor = matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : undefined;
      setViewBox((current) => zoomViewBox(current, plan, event.deltaY > 0 ? 1.12 : 0.88, anchor));
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [plan]);

  function changeFloor(value: FloorPlanFloor) {
    const nextPlan = floorPlans[value];
    setFloor(value);
    setViewBox(fitViewBox(nextPlan));
    setSnapGuides([]);
  }

  function fitFloor() {
    setViewBox(fitViewBox(plan));
    setSnapGuides([]);
  }

  function pointFromEvent(event: { clientX: number; clientY: number }) {
    const matrix = svgRef.current?.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  }

  function updatePlacement(key: string, patch: Partial<Pick<FloorPlanPlacement, "displayMetadata" | "floor" | "x" | "y">>) {
    setDraft((current) => current.map((placement) => floorPlanPlacementKey(placement) === key ? { ...placement, ...patch } : placement));
  }

  function placementRect(placement: FloorPlanPlacement, entity: FloorPlanEntity): FloorPlanSnapRect {
    const size = getFloorPlanSize(placement.displayMetadata, entity.kind);
    return { key: entity.key, x: placement.x * plan.width, y: placement.y * plan.height, rotation: getFloorPlanRotation(placement.displayMetadata), ...size };
  }

  function snapPosition(moving: FloorPlanSnapRect, bypass: boolean) {
    const svg = svgRef.current;
    const threshold = svg ? Math.max(1.5, viewBox.width / Math.max(svg.clientWidth, 1) * 8) : 4;
    const peers = visiblePlacements.flatMap((placement) => {
      const entity = entities.get(floorPlanPlacementKey(placement));
      return entity ? [placementRect(placement, entity)] : [];
    });
    return snapFloorPlanRect({ moving, peers, plan, threshold, walls: plan.walls, bypass });
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (placingKey) return;
    panRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, viewBox };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const drag = dragKeyRef.current;
    if (drag) {
      if (!draggedRef.current && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 4) return;
      const point = pointFromEvent(event);
      const placement = draft.find((item) => floorPlanPlacementKey(item) === drag.key);
      const entity = entities.get(drag.key);
      if (!point || !placement || !entity) return;
      event.preventDefault();
      draggedRef.current = true;
      const current = placementRect(placement, entity);
      const snapped = snapPosition({ ...current, x: point.x - drag.offsetX, y: point.y - drag.offsetY }, event.altKey);
      setSnapGuides(snapped.guides);
      updatePlacement(drag.key, { x: clampFloorPlanCoordinate(snapped.x / plan.width), y: clampFloorPlanCoordinate(snapped.y / plan.height) });
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId || viewBox.width === plan.width) return;
    const svg = svgRef.current;
    if (!svg) return;
    event.preventDefault();
    const x = pan.viewBox.x - (event.clientX - pan.clientX) * pan.viewBox.width / svg.clientWidth;
    const y = pan.viewBox.y - (event.clientY - pan.clientY) * pan.viewBox.height / svg.clientHeight;
    setViewBox({ ...pan.viewBox, x: Math.min(plan.width - pan.viewBox.width, Math.max(0, x)), y: Math.min(plan.height - pan.viewBox.height, Math.max(0, y)) });
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    panRef.current = null;
    dragKeyRef.current = null;
    setSnapGuides([]);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function placeEntity(key: string, x: number, y: number, bypass = false) {
    const entity = entities.get(key);
    if (!entity) return;
    const size = rememberedSizes[entity.kind];
    const snapped = snapPosition({ key, x: x * plan.width, y: y * plan.height, rotation: 0, ...size }, bypass);
    setDraft((current) => [...current, { id: `draft-${entity.key}`, entityType: entity.type, entityId: entity.id, floor, x: clampFloorPlanCoordinate(snapped.x / plan.width), y: clampFloorPlanCoordinate(snapped.y / plan.height), displayMetadata: metadataWithAppearance({}, 0, size) }]);
    setSelectedKey(entity.key);
    setPlacingKey(null);
    setSnapGuides([]);
  }

  function placeSelected(event: MouseEvent<SVGSVGElement>) {
    if (!placingKey || event.target !== event.currentTarget) return;
    const point = pointFromEvent(event);
    if (!point || point.x < 0 || point.y < 0 || point.x > plan.width || point.y > plan.height) return;
    placeEntity(placingKey, point.x / plan.width, point.y / plan.height, event.altKey);
  }

  function open(entity: FloorPlanEntity) {
    if (editMode || draggedRef.current) { draggedRef.current = false; return; }
    if (entity.type === "workstation") onOpenWorkstation(entity.id);
    else onOpenEquipment(entity.id);
  }

  function rotatePlacement(key: string, placement: FloorPlanPlacement, entity: FloorPlanEntity) {
    const size = getFloorPlanSize(placement.displayMetadata, entity.kind);
    const rotation = nextFloorPlanRotation(getFloorPlanRotation(placement.displayMetadata));
    const snapped = snapPosition({ key, x: placement.x * plan.width, y: placement.y * plan.height, rotation, ...size }, true);
    updatePlacement(key, { x: snapped.x / plan.width, y: snapped.y / plan.height, displayMetadata: metadataWithAppearance(placement.displayMetadata, rotation, size) });
  }

  function resizePlacement(key: string, placement: FloorPlanPlacement, entity: FloorPlanEntity, factor: number) {
    const current = getFloorPlanSize(placement.displayMetadata, entity.kind);
    const size = { width: Math.min(120, Math.max(6, Math.round(current.width * factor * 10) / 10)), height: Math.min(120, Math.max(6, Math.round(current.height * factor * 10) / 10)) };
    const rotation = getFloorPlanRotation(placement.displayMetadata);
    const snapped = snapPosition({ key, x: placement.x * plan.width, y: placement.y * plan.height, rotation, ...size }, true);
    setRememberedSizes((sizes) => ({ ...sizes, [entity.kind]: size }));
    updatePlacement(key, { x: snapped.x / plan.width, y: snapped.y / plan.height, displayMetadata: metadataWithAppearance(placement.displayMetadata, rotation, size) });
  }

  function applySizeToKind(entity: FloorPlanEntity, placement: FloorPlanPlacement) {
    const size = getFloorPlanSize(placement.displayMetadata, entity.kind);
    setRememberedSizes((sizes) => ({ ...sizes, [entity.kind]: size }));
    setDraft((current) => current.map((item) => {
      const match = entities.get(floorPlanPlacementKey(item));
      if (match?.kind !== entity.kind) return item;
      const itemPlan = floorPlans[item.floor];
      const rotation = getFloorPlanRotation(item.displayMetadata);
      const snapped = snapFloorPlanRect({ moving: { key: match.key, x: item.x * itemPlan.width, y: item.y * itemPlan.height, rotation, ...size }, peers: [], plan: itemPlan, walls: itemPlan.walls, bypass: true });
      return { ...item, x: snapped.x / itemPlan.width, y: snapped.y / itemPlan.height, displayMetadata: metadataWithAppearance(item.displayMetadata, rotation, size) };
    }));
  }

  function handleMarkerKeyDown(event: KeyboardEvent<SVGGElement>, placement: FloorPlanPlacement, entity: FloorPlanEntity) {
    if (!editMode && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open(entity); return; }
    if (!editMode) return;
    if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey) { event.preventDefault(); rotatePlacement(entity.key, placement, entity); return; }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const amount = event.shiftKey ? 0.05 : 0.01;
    updatePlacement(entity.key, {
      x: clampFloorPlanCoordinate(placement.x + (event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0)),
      y: clampFloorPlanCoordinate(placement.y + (event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0)),
    });
  }

  function leaveEditMode() {
    if (dirty && !window.confirm(t("floorPlan.discardConfirm"))) return;
    setDraft(eligiblePlacements);
    setEditMode(false);
    setPlacingKey(null);
    setSelectedKey(null);
    setSnapGuides([]);
    setError(false);
  }

  function save() {
    setError(false);
    startTransition(async () => {
      const result = await saveFloorPlanLayout({ placements: draft.map(({ entityType, entityId, floor: placementFloor, x, y, displayMetadata }) => ({ entityType, entityId, floor: placementFloor, x, y, displayMetadata })) });
      if (result.error) { setError(true); return; }
      setEditMode(false);
      setSelectedKey(null);
      router.refresh();
    });
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SegmentedControl ariaLabel={t("floorPlan.floorLabel")} value={String(floor)} onValueChange={(value) => changeFloor(value === "1" ? 1 : 2)} items={([1, 2] as const).map((value) => ({ value: String(value), label: t(`floorPlan.floors.${value}`) }))} />
      <div className="flex flex-wrap items-center gap-2">
        <Legend />
        <div role="group" aria-label={t("floorPlan.zoomLabel")} className="flex rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
          <button type="button" onClick={() => setViewBox((current) => zoomViewBox(current, plan, 1.25))} aria-label={t("floorPlan.zoomOut")} className="flex size-11 items-center justify-center rounded-l-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Minus className="size-4" aria-hidden="true" /></button>
          <button type="button" onClick={fitFloor} className="flex min-h-11 items-center gap-2 border-x border-[var(--ui-border)] px-3 text-sm font-medium hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Maximize2 className="size-4" aria-hidden="true" />{t("floorPlan.fitFloor")}</button>
          <button type="button" onClick={() => setViewBox((current) => zoomViewBox(current, plan, 0.8))} aria-label={t("floorPlan.zoomIn")} className="flex size-11 items-center justify-center rounded-r-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Plus className="size-4" aria-hidden="true" /></button>
        </div>
        {editMode ? <Button variant="outline" onClick={leaveEditMode} disabled={pending}><X className="mr-2 size-4" aria-hidden="true" />{t("cancel")}</Button> : <Button variant="outline" onClick={() => { setDraft(eligiblePlacements); setEditMode(true); }}><Move className="mr-2 size-4" aria-hidden="true" />{t("floorPlan.edit")}</Button>}
      </div>
    </div>

    <div className={cn("grid gap-3", editMode && "lg:grid-cols-[minmax(0,1fr)_18rem]")}>
      <div className="relative order-2 h-[min(68dvh,48rem)] min-h-96 overscroll-contain overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] lg:order-1">
        <svg ref={svgRef} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label={t("floorPlan.canvasLabel", { floor })} onClick={placeSelected} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} className={cn("size-full select-none touch-none", placingKey ? "cursor-crosshair" : viewBox.width < plan.width ? "cursor-grab active:cursor-grabbing" : "cursor-default")}>
          <defs><pattern id={`floor-grid-${floor}`} width={FLOOR_PLAN_GRID_STEP} height={FLOOR_PLAN_GRID_STEP} patternUnits="userSpaceOnUse"><circle cx="0.8" cy="0.8" r="0.45" fill="var(--ui-text-muted)" /></pattern></defs>
          <image href={plan.src} width={plan.width} height={plan.height} pointerEvents="none" />
          {editMode ? <rect width={plan.width} height={plan.height} fill={`url(#floor-grid-${floor})`} opacity="0.22" pointerEvents="none" /> : null}
          {snapGuides.map((guide, index) => <line key={`${guide.axis}-${guide.value}-${index}`} data-snap-guide={guide.kind} x1={guide.axis === "x" ? guide.value : 0} x2={guide.axis === "x" ? guide.value : plan.width} y1={guide.axis === "y" ? guide.value : 0} y2={guide.axis === "y" ? guide.value : plan.height} stroke={guide.kind === "wall" ? "var(--ui-warning-text)" : "var(--ui-info-text)"} strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
          <g aria-label={t("floorPlan.itemsLabel")}>{visiblePlacements.map((placement) => {
            const entity = entities.get(floorPlanPlacementKey(placement));
            if (!entity) return null;
            const x = placement.x * plan.width;
            const y = placement.y * plan.height;
            const size = getFloorPlanSize(placement.displayMetadata, entity.kind);
            const rotation = getFloorPlanRotation(placement.displayMetadata);
            const rotatedSize = getRotatedFloorPlanSize(size, rotation);
            const selected = selectedKey === entity.key;
            const tone = entity.attention === "service" ? { fill: "var(--ui-warning-surface)", stroke: "var(--ui-warning-text)" } : entity.attention === "maintenance" ? { fill: "var(--ui-danger-surface)", stroke: "var(--ui-danger-text)" } : entity.type === "workstation" ? { fill: "var(--ui-info-surface)", stroke: "var(--ui-info-text)" } : { fill: "var(--ui-surface)", stroke: "var(--ui-border-strong)" };
            const attentionLabel = entity.attention === "service" ? t("maintenance.currentlyInService") : entity.attention === "maintenance" ? t("maintenance.needsAttention") : null;
            return <g key={entity.key} data-floor-plan-entity={entity.key} transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-label={[entity.label, attentionLabel].filter(Boolean).join(" · ")} aria-pressed={editMode ? selected : undefined} onClick={(event) => { event.stopPropagation(); if (editMode) setSelectedKey(entity.key); else open(entity); }} onKeyDown={(event) => handleMarkerKeyDown(event, placement, entity)} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedKey(entity.key); setPlacingKey(null); draggedRef.current = false; if (editMode) { const point = pointFromEvent(event); dragKeyRef.current = { key: entity.key, clientX: event.clientX, clientY: event.clientY, offsetX: point ? point.x - x : 0, offsetY: point ? point.y - y : 0 }; svgRef.current?.setPointerCapture(event.pointerId); } }} className="group cursor-pointer outline-none">
              <title>{entity.label}</title>
              <rect x={-Math.max(rotatedSize.width, 30) / 2} y={-Math.max(rotatedSize.height, 30) / 2} width={Math.max(rotatedSize.width, 30)} height={Math.max(rotatedSize.height, 30)} fill="transparent" />
              <g transform={`rotate(${rotation})`}>
                {selected ? <rect x={-size.width / 2 - 3} y={-size.height / 2 - 3} width={size.width + 6} height={size.height + 6} rx="4" fill="none" stroke="var(--ui-focus)" strokeWidth="2" strokeDasharray="2 2" /> : null}
                <rect x={-size.width / 2} y={-size.height / 2} width={size.width} height={size.height} rx="4" fill={tone.fill} stroke={tone.stroke} strokeWidth="1.3" />
              </g>
              <text x="0" y="2.3" textAnchor="middle" fontSize={entity.type === "workstation" ? "6.5" : "5.5"} fontWeight="700" fill="var(--ui-text)" pointerEvents="none">{entity.marker}</text>
              {entity.attention ? <><circle cx={rotatedSize.width / 2} cy={-rotatedSize.height / 2} r="4.5" fill={tone.stroke} /><text x={rotatedSize.width / 2} y={-rotatedSize.height / 2 + 1.8} textAnchor="middle" fontSize="5" fontWeight="800" fill="var(--ui-surface)" pointerEvents="none">!</text></> : null}
              <rect x={-rotatedSize.width / 2 - 2} y={-rotatedSize.height / 2 - 2} width={rotatedSize.width + 4} height={rotatedSize.height + 4} rx="4" fill="none" stroke="transparent" strokeWidth="2" className="group-focus-visible:stroke-[var(--ui-focus)]" />
            </g>;
          })}</g>
        </svg>
        {!visiblePlacements.length && !placingKey ? <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center"><span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)]/95 px-3 py-1.5 text-xs font-medium text-[var(--ui-text-muted)] shadow-sm">{t("floorPlan.emptyFloor")}</span></div> : null}
      </div>

      {editMode ? <aside className="order-1 flex max-h-[28rem] min-h-0 flex-col overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] lg:order-2 lg:h-[min(68dvh,48rem)] lg:max-h-none">
        <div className="border-b border-[var(--ui-border)] p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{t("floorPlan.edit")}</h3><span className="rounded-full bg-[var(--ui-info-surface)] px-2 py-1 text-xs font-semibold text-[var(--ui-info-text)]">{t("floorPlan.editing")}</span></div><p className="mt-2 text-xs text-[var(--ui-text-muted)]">{t("floorPlan.snapHint")}</p></div>
        <div className="grid gap-4 overflow-y-auto p-4 lg:flex-1">
          {selectedEntity && selectedPlacement ? <SelectedObjectControls entity={selectedEntity} placement={selectedPlacement} onApplySize={() => applySizeToKind(selectedEntity, selectedPlacement)} onFloorChange={(value) => { updatePlacement(selectedEntity.key, { floor: value }); changeFloor(value); }} onRemove={() => { setDraft((current) => current.filter((placement) => floorPlanPlacementKey(placement) !== selectedEntity.key)); setSelectedKey(null); }} onResize={(factor) => resizePlacement(selectedEntity.key, selectedPlacement, selectedEntity, factor)} onRotate={() => rotatePlacement(selectedEntity.key, selectedPlacement, selectedEntity)} /> : placingKey ? <section className="rounded-[var(--ui-radius-control)] bg-[var(--ui-info-surface)] p-3 text-sm font-medium text-[var(--ui-info-text)]"><p>{t("floorPlan.placeHint")}</p><Button className="mt-3 w-full" size="sm" variant="outline" onClick={() => placeEntity(placingKey, 0.5, 0.5, true)}>{t("floorPlan.placeCenter")}</Button></section> : null}
          <EntityList title={t("floorPlan.onFloor")} entities={visiblePlacements.map((placement) => entities.get(floorPlanPlacementKey(placement))).filter((entity): entity is FloorPlanEntity => Boolean(entity))} selectedKey={selectedKey} onSelect={(key) => { setSelectedKey(key); setPlacingKey(null); }} />
          <EntityList title={t("floorPlan.unplaced")} entities={unplaced} selectedKey={placingKey} empty={t("floorPlan.noneUnplaced")} onSelect={(key) => { setSelectedKey(key); setPlacingKey(key); }} />
        </div>
        <div className="border-t border-[var(--ui-border)] p-4"><Button className="w-full" onClick={save} disabled={pending || !dirty}><Save className="mr-2 size-4" aria-hidden="true" />{pending ? t("actions.saving") : t("floorPlan.save")}</Button>{error ? <p role="alert" className="mt-2 text-sm text-[var(--ui-danger-text)]">{t("errors.layout")}</p> : null}</div>
      </aside> : null}
    </div>
  </div>;
}

function SelectedObjectControls({ entity, placement, onApplySize, onFloorChange, onRemove, onResize, onRotate }: { entity: FloorPlanEntity; placement: FloorPlanPlacement; onApplySize: () => void; onFloorChange: (floor: FloorPlanFloor) => void; onRemove: () => void; onResize: (factor: number) => void; onRotate: () => void }) {
  const t = useTranslations("Equipment");
  const rotation = getFloorPlanRotation(placement.displayMetadata);
  return <section className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] p-3">
    <h4 className="truncate text-sm font-semibold">{entity.label}</h4>
    <div className="mt-3 space-y-3">
      <div><p className="mb-1.5 text-xs font-semibold text-[var(--ui-text-muted)]">{t("floorPlan.floor")}</p><div className="grid grid-cols-2 gap-2">{([1, 2] as const).map((value) => <Button key={value} size="sm" variant={placement.floor === value ? "default" : "outline"} onClick={() => onFloorChange(value)}>{t(`floorPlan.floors.${value}`)}</Button>)}</div></div>
      <div><p className="mb-1.5 text-xs font-semibold text-[var(--ui-text-muted)]">{t("floorPlan.rotation")}</p><Button className="w-full justify-between" size="sm" variant="outline" onClick={onRotate}><span className="inline-flex items-center gap-2"><RotateCw className="size-4" aria-hidden="true" />{t("floorPlan.rotate")}</span><span className="ui-numeric">{rotation}°</span></Button></div>
      <div><p className="mb-1.5 text-xs font-semibold text-[var(--ui-text-muted)]">{t("floorPlan.size")}</p><div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" onClick={() => onResize(0.85)}><Minus className="mr-1.5 size-4" aria-hidden="true" />{t("floorPlan.smaller")}</Button><Button size="sm" variant="outline" onClick={() => onResize(1.15)}><Plus className="mr-1.5 size-4" aria-hidden="true" />{t("floorPlan.larger")}</Button></div><Button className="mt-2 h-auto min-h-9 w-full whitespace-normal py-2 text-xs" size="sm" variant="ghost" onClick={onApplySize}>{t("floorPlan.applySize", { type: t(`floorPlan.objectKinds.${entity.kind}`) })}</Button></div>
      <Button className="w-full text-[var(--ui-danger-text)] hover:bg-[var(--ui-danger-surface)]" size="sm" variant="ghost" onClick={onRemove}>{t("floorPlan.remove")}</Button>
    </div>
  </section>;
}

function Legend() {
  const t = useTranslations("Equipment");
  const entries = [
    ["workstation", "#12", "pill"],
    ["printer", "PRN", "box"],
    ["airConditioner", "AIR", "box"],
    ["coffeeAndOther", "COF", "box"],
    ["attention", "!", "attention"],
  ] as const;
  return <Popover.Root><Popover.Trigger asChild><Button variant="outline" className="min-h-11 gap-2"><Info className="size-4" aria-hidden="true" />{t("floorPlan.legend")}</Button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={6} collisionPadding={12} className="z-[70] w-64 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-3 shadow-[var(--ui-shadow-popover)]"><p className="text-sm font-semibold">{t("floorPlan.legend")}</p><ul className="mt-2 space-y-1.5">{entries.map(([key, marker, shape]) => <li key={key} className="flex min-h-8 items-center gap-3 text-sm text-[var(--ui-text-secondary)]"><span className={cn("flex h-5 min-w-8 items-center justify-center border text-[9px] font-bold text-[var(--ui-text)]", shape === "pill" ? "rounded bg-[var(--ui-info-surface)] border-[var(--ui-info-text)]" : shape === "attention" ? "size-5 min-w-5 rounded-full bg-[var(--ui-danger-solid)] text-white border-transparent" : "rounded-[4px] bg-[var(--ui-surface)] border-[var(--ui-border-strong)]")}>{marker}</span>{t(`floorPlan.legendItems.${key}`)}</li>)}</ul><Popover.Arrow className="fill-[var(--ui-surface)]" /></Popover.Content></Popover.Portal></Popover.Root>;
}

function EntityList({ empty, entities, onSelect, selectedKey, title }: { empty?: string; entities: FloorPlanEntity[]; onSelect: (key: string) => void; selectedKey: string | null; title: string }) {
  return <section><h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{title}</h4>{entities.length ? <div className="grid gap-1">{entities.map((entity) => <button key={entity.key} type="button" onClick={() => onSelect(entity.key)} aria-pressed={selectedKey === entity.key} className={cn("min-h-11 cursor-pointer truncate rounded-[var(--ui-radius-control)] px-3 text-left text-sm font-medium hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", selectedKey === entity.key && "bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]")}>{entity.label}</button>)}</div> : empty ? <p className="text-sm text-[var(--ui-text-muted)]">{empty}</p> : null}</section>;
}
