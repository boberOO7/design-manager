"use client";

import { Maximize2, Minus, Move, Plus, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { useTranslations } from "next-intl";
import { saveFloorPlanLayout } from "@/app/(app)/office/equipment/actions";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { EquipmentItem, WorkstationItem } from "@/data/queries/equipment";
import { equipmentDisplayName, getMaintenanceUrgency, isOtherEquipment } from "@/lib/equipment";
import { clampFloorPlanCoordinate, floorPlanPlacementKey, type FloorPlanEntityType, type FloorPlanFloor, type FloorPlanPlacement } from "@/lib/office-floor-plan";
import { cn } from "@/lib/utils";

const floorPlans = {
  1: { src: "/floor-1.svg", width: 337.572, height: 562.115 },
  2: { src: "/floor-2.svg", width: 334.737, height: 597.448 },
} as const;

type FloorPlanEntity = {
  id: string;
  key: string;
  type: FloorPlanEntityType;
  label: string;
  marker: string;
  attention: "service" | "maintenance" | null;
};
type ViewBox = { x: number; y: number; width: number; height: number };
type PanState = { pointerId: number; clientX: number; clientY: number; viewBox: ViewBox };
type DragState = { key: string; clientX: number; clientY: number };

export default function FloorPlanView({ equipment, placements, today, workstations, onOpenEquipment, onOpenWorkstation }: { equipment: EquipmentItem[]; placements: FloorPlanPlacement[]; today: string; workstations: WorkstationItem[]; onOpenEquipment: (id: string) => void; onOpenWorkstation: (id: string) => void }) {
  const t = useTranslations("Equipment");
  const router = useRouter();
  const [floor, setFloor] = useState<FloorPlanFloor>(1);
  const [editMode, setEditMode] = useState(false);
  const [placingKey, setPlacingKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<PanState | null>(null);
  const dragKeyRef = useRef<DragState | null>(null);
  const draggedRef = useRef(false);
  const plan = floorPlans[floor];
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, width: plan.width, height: plan.height });

  const entities = useMemo(() => {
    const result = new Map<string, FloorPlanEntity>();
    for (const item of workstations) {
      if (item.workstationType !== "office") continue;
      const entity: FloorPlanEntity = { id: item.id, key: `workstation:${item.id}`, type: "workstation", label: `${t("workstation.numberLabel", { number: item.number })}${item.name ? ` · ${item.name}` : ""}`, marker: `#${item.number}`, attention: null };
      result.set(entity.key, entity);
    }
    for (const item of equipment) {
      if (!isOtherEquipment(item.equipmentType)) continue;
      const urgency = getMaintenanceUrgency(item.recurringMaintenanceEnabled, item.nextMaintenanceDueDate, today);
      const entity: FloorPlanEntity = { id: item.id, key: `equipment:${item.id}`, type: "equipment", label: equipmentDisplayName(item), marker: item.assetTag.split("-")[0].slice(0, 3), attention: item.lifecycleState === "in_service" ? "service" : urgency ? "maintenance" : null };
      result.set(entity.key, entity);
    }
    return result;
  }, [equipment, t, today, workstations]);

  const eligiblePlacements = useMemo(() => placements.filter((placement) => entities.has(floorPlanPlacementKey(placement))), [entities, placements]);
  const [draft, setDraft] = useState<FloorPlanPlacement[]>(eligiblePlacements);
  const layout = editMode ? draft : eligiblePlacements;
  const placedKeys = new Set(layout.map(floorPlanPlacementKey));
  const visiblePlacements = layout.filter((placement) => placement.floor === floor && entities.has(floorPlanPlacementKey(placement)));
  const unplaced = [...entities.values()].filter((entity) => !placedKeys.has(entity.key));
  const selectedEntity = selectedKey ? entities.get(selectedKey) ?? null : null;
  const selectedPlacement = selectedKey ? draft.find((placement) => floorPlanPlacementKey(placement) === selectedKey) ?? null : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(eligiblePlacements);

  function changeFloor(value: FloorPlanFloor) {
    const nextPlan = floorPlans[value];
    setFloor(value);
    setViewBox({ x: 0, y: 0, width: nextPlan.width, height: nextPlan.height });
  }

  function pointFromEvent(event: { clientX: number; clientY: number }) {
    const matrix = svgRef.current?.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  }

  function updatePlacement(key: string, patch: Partial<Pick<FloorPlanPlacement, "floor" | "x" | "y">>) {
    setDraft((current) => current.map((placement) => floorPlanPlacementKey(placement) === key ? { ...placement, ...patch } : placement));
  }

  function zoom(factor: number, anchor = { x: viewBox.x + viewBox.width / 2, y: viewBox.y + viewBox.height / 2 }) {
    const width = Math.min(plan.width, Math.max(plan.width * 0.3, viewBox.width * factor));
    const height = width * plan.height / plan.width;
    const ratio = width / viewBox.width;
    setViewBox({
      x: Math.min(plan.width - width, Math.max(0, anchor.x - (anchor.x - viewBox.x) * ratio)),
      y: Math.min(plan.height - height, Math.max(0, anchor.y - (anchor.y - viewBox.y) * ratio)),
      width,
      height,
    });
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const point = pointFromEvent(event);
    zoom(event.deltaY > 0 ? 1.12 : 0.88, point ?? undefined);
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
      if (!point) return;
      draggedRef.current = true;
      updatePlacement(drag.key, { x: clampFloorPlanCoordinate(point.x / plan.width), y: clampFloorPlanCoordinate(point.y / plan.height) });
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId || viewBox.width === plan.width) return;
    const svg = svgRef.current;
    if (!svg) return;
    const x = pan.viewBox.x - (event.clientX - pan.clientX) * pan.viewBox.width / svg.clientWidth;
    const y = pan.viewBox.y - (event.clientY - pan.clientY) * pan.viewBox.height / svg.clientHeight;
    setViewBox({ ...pan.viewBox, x: Math.min(plan.width - pan.viewBox.width, Math.max(0, x)), y: Math.min(plan.height - pan.viewBox.height, Math.max(0, y)) });
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    panRef.current = null;
    dragKeyRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function placeEntity(key: string, x: number, y: number) {
    const entity = entities.get(key);
    if (!entity) return;
    setDraft((current) => [...current, { id: `draft-${entity.key}`, entityType: entity.type, entityId: entity.id, floor, x: clampFloorPlanCoordinate(x), y: clampFloorPlanCoordinate(y), displayMetadata: {} }]);
    setSelectedKey(entity.key);
    setPlacingKey(null);
  }

  function placeSelected(event: PointerEvent<SVGSVGElement>) {
    if (!placingKey || event.target !== event.currentTarget) return;
    const point = pointFromEvent(event);
    if (!point || point.x < 0 || point.y < 0 || point.x > plan.width || point.y > plan.height) return;
    placeEntity(placingKey, point.x / plan.width, point.y / plan.height);
  }

  function open(entity: FloorPlanEntity) {
    if (editMode || draggedRef.current) { draggedRef.current = false; return; }
    if (entity.type === "workstation") onOpenWorkstation(entity.id);
    else onOpenEquipment(entity.id);
  }

  function handleMarkerKeyDown(event: KeyboardEvent<SVGGElement>, placement: FloorPlanPlacement, entity: FloorPlanEntity) {
    if (!editMode && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open(entity); return; }
    if (!editMode || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
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
      <div className="flex items-center gap-2">
        <div role="group" aria-label={t("floorPlan.zoomLabel")} className="flex rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
          <button type="button" onClick={() => zoom(1.25)} aria-label={t("floorPlan.zoomOut")} className="flex size-11 items-center justify-center rounded-l-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Minus className="size-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => setViewBox({ x: 0, y: 0, width: plan.width, height: plan.height })} aria-label={t("floorPlan.resetZoom")} className="flex size-11 items-center justify-center border-x border-[var(--ui-border)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Maximize2 className="size-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => zoom(0.8)} aria-label={t("floorPlan.zoomIn")} className="flex size-11 items-center justify-center rounded-r-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Plus className="size-4" aria-hidden="true" /></button>
        </div>
        {editMode ? <Button variant="outline" onClick={leaveEditMode} disabled={pending}><X className="mr-2 size-4" aria-hidden="true" />{t("cancel")}</Button> : <Button variant="outline" onClick={() => { setDraft(eligiblePlacements); setEditMode(true); }}><Move className="mr-2 size-4" aria-hidden="true" />{t("floorPlan.edit")}</Button>}
      </div>
    </div>

    <div className={cn("grid gap-3", editMode && "lg:grid-cols-[minmax(0,1fr)_18rem]")}>
      <div className="relative order-2 h-[min(68dvh,48rem)] min-h-96 overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] lg:order-1">
        <svg ref={svgRef} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label={t("floorPlan.canvasLabel", { floor })} onClick={placeSelected} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onWheel={handleWheel} className={cn("size-full select-none touch-none", placingKey ? "cursor-crosshair" : viewBox.width < plan.width ? "cursor-grab active:cursor-grabbing" : "cursor-default")}>
          <image href={plan.src} width={plan.width} height={plan.height} pointerEvents="none" />
          <g aria-label={t("floorPlan.itemsLabel")}>
            {visiblePlacements.map((placement) => {
              const entity = entities.get(floorPlanPlacementKey(placement));
              if (!entity) return null;
              const x = placement.x * plan.width;
              const y = placement.y * plan.height;
              const selected = selectedKey === entity.key;
              const tone = entity.attention === "service" ? { fill: "var(--ui-warning-surface)", stroke: "var(--ui-warning-text)" } : entity.attention === "maintenance" ? { fill: "var(--ui-danger-surface)", stroke: "var(--ui-danger-text)" } : entity.type === "workstation" ? { fill: "var(--ui-info-surface)", stroke: "var(--ui-info-text)" } : { fill: "var(--ui-surface)", stroke: "var(--ui-border-strong)" };
              const attentionLabel = entity.attention === "service" ? t("maintenance.currentlyInService") : entity.attention === "maintenance" ? t("maintenance.needsAttention") : null;
              return <g key={entity.key} role="button" tabIndex={0} aria-label={[entity.label, attentionLabel].filter(Boolean).join(" · ")} aria-pressed={editMode ? selected : undefined} onClick={(event) => { event.stopPropagation(); if (editMode) setSelectedKey(entity.key); else open(entity); }} onKeyDown={(event) => handleMarkerKeyDown(event, placement, entity)} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedKey(entity.key); draggedRef.current = false; if (editMode) { dragKeyRef.current = { key: entity.key, clientX: event.clientX, clientY: event.clientY }; svgRef.current?.setPointerCapture(event.pointerId); } }} className="group outline-none">
                <title>{entity.label}</title>
                <circle cx={x} cy={y} r="18" fill="transparent" />
                {selected ? <circle cx={x} cy={y} r="14" fill="none" stroke="var(--ui-focus)" strokeWidth="2" strokeDasharray="2 2" /> : null}
                {entity.type === "workstation" ? <rect x={x - 17} y={y - 7.5} width="34" height="15" rx="4" fill={tone.fill} stroke={tone.stroke} strokeWidth="1.2" /> : <circle cx={x} cy={y} r="9" fill={tone.fill} stroke={tone.stroke} strokeWidth="1.4" />}
                <text x={x} y={y + 2.3} textAnchor="middle" fontSize={entity.type === "workstation" ? "6.5" : "5.5"} fontWeight="700" fill="var(--ui-text)" pointerEvents="none">{entity.marker}</text>
                {entity.attention ? <><circle cx={x + 8} cy={y - 8} r="4.5" fill={tone.stroke} /><text x={x + 8} y={y - 6.2} textAnchor="middle" fontSize="5" fontWeight="800" fill="var(--ui-surface)" pointerEvents="none">!</text></> : null}
                <circle cx={x} cy={y} r="16" fill="none" stroke="transparent" strokeWidth="2" className="group-focus-visible:stroke-[var(--ui-focus)]" />
              </g>;
            })}
          </g>
        </svg>
        {!visiblePlacements.length && !placingKey ? <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center"><span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)]/95 px-3 py-1.5 text-xs font-medium text-[var(--ui-text-muted)] shadow-sm">{t("floorPlan.emptyFloor")}</span></div> : null}
      </div>

      {editMode ? <aside className="order-1 flex min-h-0 flex-col rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] lg:order-2">
        <div className="border-b border-[var(--ui-border)] p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{t("floorPlan.edit")}</h3><span className="rounded-full bg-[var(--ui-info-surface)] px-2 py-1 text-xs font-semibold text-[var(--ui-info-text)]">{t("floorPlan.editing")}</span></div></div>
        <div className="grid max-h-80 gap-4 overflow-y-auto p-4 lg:max-h-none lg:flex-1">
          {selectedEntity && selectedPlacement ? <section className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] p-3"><h4 className="truncate text-sm font-semibold">{selectedEntity.label}</h4><div className="mt-3 grid grid-cols-2 gap-2">{([1, 2] as const).map((value) => <Button key={value} size="sm" variant={selectedPlacement.floor === value ? "default" : "outline"} onClick={() => { updatePlacement(selectedEntity.key, { floor: value }); changeFloor(value); }}>{t(`floorPlan.floors.${value}`)}</Button>)}</div><Button className="mt-2 w-full" size="sm" variant="ghost" onClick={() => { setDraft((current) => current.filter((placement) => floorPlanPlacementKey(placement) !== selectedEntity.key)); setSelectedKey(null); }}>{t("floorPlan.remove")}</Button></section> : placingKey ? <section className="rounded-[var(--ui-radius-control)] bg-[var(--ui-info-surface)] p-3 text-sm font-medium text-[var(--ui-info-text)]"><p>{t("floorPlan.placeHint")}</p><Button className="mt-3 w-full" size="sm" variant="outline" onClick={() => placeEntity(placingKey, 0.5, 0.5)}>{t("floorPlan.placeCenter")}</Button></section> : null}
          <EntityList title={t("floorPlan.onFloor")} entities={visiblePlacements.map((placement) => entities.get(floorPlanPlacementKey(placement))).filter((entity): entity is FloorPlanEntity => Boolean(entity))} selectedKey={selectedKey} onSelect={(key) => { setSelectedKey(key); setPlacingKey(null); }} />
          <EntityList title={t("floorPlan.unplaced")} entities={unplaced} selectedKey={placingKey} empty={t("floorPlan.noneUnplaced")} onSelect={(key) => { setSelectedKey(key); setPlacingKey(key); }} />
        </div>
        <div className="border-t border-[var(--ui-border)] p-4"><Button className="w-full" onClick={save} disabled={pending || !dirty}><Save className="mr-2 size-4" aria-hidden="true" />{pending ? t("actions.saving") : t("floorPlan.save")}</Button>{error ? <p role="alert" className="mt-2 text-sm text-[var(--ui-danger-text)]">{t("errors.layout")}</p> : null}</div>
      </aside> : null}
    </div>
  </div>;
}

function EntityList({ empty, entities, onSelect, selectedKey, title }: { empty?: string; entities: FloorPlanEntity[]; onSelect: (key: string) => void; selectedKey: string | null; title: string }) {
  return <section><h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{title}</h4>{entities.length ? <div className="grid gap-1">{entities.map((entity) => <button key={entity.key} type="button" onClick={() => onSelect(entity.key)} aria-pressed={selectedKey === entity.key} className={cn("min-h-11 truncate rounded-[var(--ui-radius-control)] px-3 text-left text-sm font-medium hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", selectedKey === entity.key && "bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]")}>{entity.label}</button>)}</div> : empty ? <p className="text-sm text-[var(--ui-text-muted)]">{empty}</p> : null}</section>;
}
