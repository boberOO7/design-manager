"use client";

import { DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from "@dnd-kit/react";
import { ArrowDown, ArrowUp, GripVertical, Info, Plus, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form-field";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import styles from "./project-stage-configuration-dialog.module.css";
import { Select, SelectItem } from "@/components/ui/select";
import type { ConfiguredProjectStage } from "@/data/queries/project-stage-columns";
import { getStageLabel, type TaskStage } from "@/lib/task-stages";
import { moveProjectStage, projectStageInputSchema, stageDeletionInfoSchema, validateProjectStageConfiguration, type ProjectStageConfigurationInput, type StageDeletionInfo } from "@/lib/project-stage-configuration";

const stageSensors = [PointerSensor.configure({}), KeyboardSensor.configure({ offset: 64 })];
const dropPrefix = "project-stage-drop:";

const snapshotSchema = z.object({
  success: z.literal(true),
  configuration: z.object({ stages: z.array(projectStageInputSchema.extend({ displayName: z.string().nullable() })), version: z.number().int(), includeInProductivity: z.boolean(), showProgress: z.boolean() }),
  deletionInfo: stageDeletionInfoSchema,
});

export function ProjectStageConfigurationDialog({ includeInProductivity, onClose, onSaved, projectId, showProgress, stages, stageLabels }: { includeInProductivity: boolean; showProgress: boolean; onClose: () => void; onSaved: () => void; projectId: string; stages: ConfiguredProjectStage[]; stageLabels: (stage: string) => string }) {
  const t = useTranslations("StageConfiguration");
  const toDraft = (items: ConfiguredProjectStage[]) => items.map((item) => ({ ...item, displayName: getStageLabel(item.stage, stageLabels, item.displayName) }));
  const [draft, setDraft] = useState<ProjectStageConfigurationInput[]>(() => toDraft(stages));
  const [original, setOriginal] = useState(draft);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const focusStageId = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!focusStageId.current) return;
    const input = listRef.current?.querySelector<HTMLInputElement>(`[data-stage-id="${focusStageId.current}"]`);
    input?.focus();
    input?.select();
    focusStageId.current = null;
  }, [draft]);
  const [deletionInfo, setDeletionInfo] = useState<StageDeletionInfo>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [included, setIncluded] = useState(includeInProductivity);
  const [progressVisible, setProgressVisible] = useState(showProgress);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/projects/${projectId}/stage-configuration`, { signal: controller.signal, cache: "no-store" });
        const parsed = snapshotSchema.safeParse(await response.json());
        if (!response.ok || !parsed.success) throw new Error("Unable to load stages");
        const { configuration } = parsed.data;
        const next = configuration.stages.map((item) => ({ ...item, displayName: getStageLabel(item.stage, stageLabels, item.displayName) }));
        setDraft(next); setOriginal(next); setVersion(configuration.version); setDeletionInfo(parsed.data.deletionInfo);
        setIncluded(configuration.includeInProductivity); setProgressVisible(configuration.showProgress);
      } catch {
        if (!controller.signal.aborted) setError(t("loadFailed"));
      }
    }
    void load();
    return () => controller.abort();
  }, [projectId, stageLabels, t]);
  const disabled = saving || version === null;
  const enabledCount = draft.filter((stage) => stage.isEnabled).length;
  const totalWeight = draft.filter((stage) => stage.kind === "work").reduce((sum, stage) => sum + (Number.isFinite(stage.progressWeight) ? stage.progressWeight : 0), 0);
  const removed = original.filter((stage) => !draft.some((item) => item.stage === stage.stage));
  const deletedTaskIds = removed.flatMap((stage) => deletionInfo.find((item) => item.stage === stage.stage)?.taskIds ?? []);
  function update(stage: TaskStage, change: Partial<ProjectStageConfigurationInput>) { setDraft((current) => current.map((item) => item.stage === stage ? { ...item, ...change } : item)); }
  function move(index: number, direction: -1 | 1) {
    setDraft((current) => moveProjectStage(current, current[index]?.stage ?? "", current[index + direction]?.stage ?? ""));
  }
  function handleDragStart(event: DragStartEvent) { setActiveStageId(String(event.operation.source?.id ?? "")); }
  function handleDragEnd(event: DragEndEvent) {
    const sourceId = String(event.operation.source?.id ?? "");
    const targetId = String(event.operation.target?.id ?? "").replace(dropPrefix, "");
    setActiveStageId(null);
    if (!event.canceled && !disabled) setDraft((current) => moveProjectStage(current, sourceId, targetId));
  }
  function addStage() {
    const stage: ProjectStageConfigurationInput = { stage: `custom_${crypto.randomUUID()}`, displayName: t("newStage"), displayOrder: draft.length + 1, isEnabled: true, kind: "work", progressWeight: 1 };
    focusStageId.current = stage.stage;
    setDraft((current) => [...current, stage]);
  }
  const activeStage = draft.find((stage) => stage.stage === activeStageId);
  async function save() {
    if (disabled) return;
    const parsed = validateProjectStageConfiguration(draft);
    if (!parsed) { setError(t("invalidConfiguration")); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/stage-configuration`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stages: parsed, include_in_productivity: included, show_progress: progressVisible, expected_version: version, deleted_task_ids: deletedTaskIds }) });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || typeof result !== "object" || result === null || !("success" in result) || result.success !== true) {
        const code = typeof result === "object" && result !== null && "errorCode" in result ? result.errorCode : null;
        const key = code === "active_tasks" ? "activeTasks" : code === "minimum_stage" ? "cannotDisableLast" : code === "started_tasks" ? "startedTasks" : code === "logged_work" ? "loggedWork" : code === "version_conflict" || code === "tasks_changed" ? "conflict" : "saveFailed";
        setError(t(key)); setSaving(false); return;
      }
      onSaved();
    } catch { setError(t("saveFailed")); setSaving(false); }
  }
  return <Dialog closeDisabled={saving} closeLabel={t("cancel")} isOpen onRequestClose={(reason) => { if (!saving && !(reason === "escape" && activeStageId !== null)) onClose(); }} title={t("title")} headerActions={<InfoHelp label={t("helpFor", { field: t("title") })} content={t("description")} />} className="max-w-[54rem] [&>header]:items-center [&>header]:gap-3 [&>header]:py-3">
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5">
      <div className={cn(styles.stageGrid, styles.columnHeadings)} aria-hidden="true">
        <span className={styles.name}>{t("stageName")}</span>
        <span className={styles.kind}>{t("stageType")}</span>
        <span className={styles.weight}>{t("weight")}</span>
        <span className={styles.progress}>{t("progress")}</span>
      </div>
      <DragDropProvider sensors={stageSensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <ul ref={listRef} className="divide-y divide-[var(--ui-border)] border-y border-[var(--ui-border)]">
          {draft.map((stage, index) => {
            const info = deletionInfo.find((item) => item.stage === stage.stage);
            const reason = info?.blockReason === "started_tasks" ? t("startedTasks") : info?.blockReason === "logged_work" ? t("loggedWork") : stage.isEnabled && enabledCount === 1 ? t("cannotDisableLast") : null;
            return <ProjectStageRow key={stage.stage} stage={stage} disabled={disabled} isExisting={original.some((item) => item.stage === stage.stage)} isLastEnabled={enabledCount === 1 && stage.isEnabled} isFirst={index === 0} isLast={index === draft.length - 1} totalWeight={totalWeight} deleteReason={reason} onUpdate={(change) => update(stage.stage, change)} onMove={(direction) => move(index, direction)} onDelete={() => setDraft((current) => current.filter((item) => item.stage !== stage.stage).map((item, position) => ({ ...item, displayOrder: position + 1 })))} />;
          })}
        </ul>
        <DragOverlay>{activeStage ? <div className="flex w-[min(36rem,calc(100vw-2rem))] items-center gap-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-4 py-3 shadow-[var(--ui-shadow-panel)]"><GripVertical aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-muted)]" /><span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ui-text)]">{activeStage.displayName}</span><span className="text-xs text-[var(--ui-text-muted)]">{t(activeStage.kind === "work" ? "workStage" : "additionalStage")}</span></div> : null}</DragOverlay>
      </DragDropProvider>
      <Button type="button" variant="ghost" size="compact" className="mt-2 gap-2" disabled={disabled} onClick={addStage}><Plus aria-hidden="true" className="size-4" />{t("addStage")}</Button>
      {removed.length > 0 ? <div role="status" className="mt-4 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-3 text-sm leading-5 text-[var(--ui-danger-text)]"><p>{t("deletionSummary", { names: removed.map((stage) => stage.displayName).join(", "), count: deletedTaskIds.length })}</p></div> : null}
      <div className="mt-5 divide-y divide-[var(--ui-border-subtle)] border-y border-[var(--ui-border)]">
        <div className="flex min-h-12 items-center gap-2 py-2">
          <label className="flex min-h-9 flex-1 cursor-pointer items-center gap-3 text-sm font-medium text-[var(--ui-text)]"><input checked={included} disabled={disabled} className={styles.checkbox} type="checkbox" onChange={(event) => setIncluded(event.target.checked)} /><span>{t("includeInProductivity")}</span></label>
          <InfoHelp label={t("helpFor", { field: t("includeInProductivity") })} content={t("includeInProductivityHelp")} />
        </div>
        <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2 text-sm font-medium text-[var(--ui-text)]"><input checked={progressVisible} disabled={disabled} className={styles.checkbox} type="checkbox" onChange={(event) => setProgressVisible(event.target.checked)} /><span>{t("showProgress")}</span></label>
      </div>
      {error ? <p role="alert" className="mt-4 text-sm leading-5 text-[var(--ui-danger-text)]">{error}</p> : null}
    </div>
    <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--ui-border)] px-3 py-3 sm:px-6 sm:py-4"><Button disabled={saving} onClick={onClose} type="button" variant="outline">{t("cancel")}</Button><Button disabled={disabled || activeStageId !== null} onClick={() => void save()} type="button">{saving ? t("saving") : deletedTaskIds.length > 0 ? t("saveAndDelete", { count: deletedTaskIds.length }) : t("save")}</Button></footer>
  </Dialog>;
}

function InfoHelp({ label, content }: { label: string; content: string }) {
  return <Tooltip content={content} openOnClick><button type="button" aria-label={label} className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none"><Info aria-hidden="true" className="size-4" /></button></Tooltip>;
}

function ProjectStageRow({ stage, disabled, isExisting, isLastEnabled, isFirst, isLast, totalWeight, deleteReason, onUpdate, onMove, onDelete }: {
  stage: ProjectStageConfigurationInput;
  disabled: boolean;
  isExisting: boolean;
  isLastEnabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  totalWeight: number;
  deleteReason: string | null;
  onUpdate: (change: Partial<ProjectStageConfigurationInput>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("StageConfiguration");
  const { isDragging, ref: dragRef } = useDraggable({ id: stage.stage, type: "project-stage", disabled });
  const { isDropTarget, ref: dropRef } = useDroppable({ id: `${dropPrefix}${stage.stage}`, type: "project-stage-drop", accept: "project-stage", disabled });
  const percent = totalWeight > 0 ? Math.round(stage.progressWeight / totalWeight * 1000) / 10 || 0 : 0;
  const typeLabel = t(stage.kind === "work" ? "workStage" : "additionalStage");
  return <li ref={dropRef} className={cn(styles.stageGrid, styles.row, isDropTarget && !isDragging && styles.dropTarget, isDragging && styles.dragging)}>
    <button ref={dragRef} type="button" disabled={disabled} aria-label={t("reorderStage", { name: stage.displayName })} className={cn(styles.handle, "rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] outline-none transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed motion-reduce:transition-none")}><GripVertical aria-hidden="true" className="size-4" /></button>
    <input aria-label={t("enabledFor", { name: stage.displayName })} checked={stage.isEnabled} disabled={disabled || isLastEnabled} type="checkbox" className={cn(styles.visibility, styles.checkbox)} onChange={(event) => onUpdate({ isEnabled: event.target.checked })} />
    <label className={cn(styles.name, "min-w-0")}><span className="sr-only">{t("stageName")}</span><Input data-stage-id={stage.stage} value={stage.displayName} maxLength={80} disabled={disabled} className="min-w-0 px-2 sm:h-9 sm:px-3" onChange={(event) => onUpdate({ displayName: event.target.value })} /><span className="sr-only">{typeLabel}</span></label>
    <div className={cn(styles.kind, !isExisting && styles.editableKind)}>{isExisting ? stage.kind === "additional" ? <Tooltip content={t("additionalHelp")} openOnClick><button type="button" aria-label={t("helpFor", { field: typeLabel })} className="flex min-h-9 items-center gap-1.5 rounded text-xs text-[var(--ui-text-muted)] outline-none hover:text-[var(--ui-text)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span>{typeLabel}</span><Info aria-hidden="true" className="size-3.5" /></button></Tooltip> : <span className="text-xs text-[var(--ui-text-muted)]">{typeLabel}</span> : <Select aria-label={t("stageType")} value={stage.kind} disabled={disabled} size="compact" className="h-9 text-xs" onValueChange={(kind) => { if (kind === "work" || kind === "additional") onUpdate({ kind }); }}><SelectItem value="work">{t("workStage")}</SelectItem><SelectItem value="additional">{t("additionalStage")}</SelectItem></Select>}</div>
    <div className={styles.weight}>{stage.kind === "work" ? <Input type="number" min={1} step={1} inputMode="numeric" value={Number.isFinite(stage.progressWeight) ? stage.progressWeight : ""} disabled={disabled} className="ui-numeric w-full px-1.5 text-center sm:h-9" aria-label={t("weightFor", { name: stage.displayName })} onChange={(event) => onUpdate({ progressWeight: event.target.value === "" ? Number.NaN : Number(event.target.value) })} /> : <span aria-label={t("additionalStage")} className="text-[var(--ui-text-muted)]">—</span>}</div>
    <div className={cn(styles.progress, "ui-numeric text-xs font-medium text-[var(--ui-text-secondary)] sm:text-sm")}>{stage.kind === "work" ? <span aria-label={t("progressShare", { percent })}>{percent}%</span> : <span aria-label={t("additionalHelp")} className="text-[var(--ui-text-muted)]">—</span>}</div>
    <div className={styles.actions}>
      <div className={styles.arrowActions}><Button aria-label={t("moveUp")} className="size-8 p-0" disabled={disabled || isFirst} onClick={() => onMove(-1)} type="button" variant="ghost"><ArrowUp aria-hidden="true" className="size-3.5" /></Button><Button aria-label={t("moveDown")} className="size-8 p-0" disabled={disabled || isLast} onClick={() => onMove(1)} type="button" variant="ghost"><ArrowDown aria-hidden="true" className="size-3.5" /></Button></div>
      <Tooltip content={deleteReason ?? t("deleteStage", { name: stage.displayName })} openOnClick={Boolean(deleteReason)}>
        <Button aria-label={t("deleteStage", { name: stage.displayName })} aria-disabled={Boolean(deleteReason)} className={cn("size-9 p-0", deleteReason ? "cursor-help text-[var(--ui-text-muted)]" : "hover:text-[var(--ui-danger-text)]")} disabled={disabled} onClick={() => { if (!deleteReason) onDelete(); }} type="button" variant="ghost"><Trash2 aria-hidden="true" className="size-4" /></Button>
      </Tooltip>
    </div>
  </li>;
}
