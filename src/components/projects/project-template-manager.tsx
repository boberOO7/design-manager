"use client";

import { DragDropProvider, DragOverlay, PointerSensor, useDragDropManager, useDroppable, type DragEndEvent, type DragMoveEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/react";
import { Scroller } from "@dnd-kit/dom";
import { useSortable } from "@dnd-kit/react/sortable";
import { ChevronDown, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { getActiveProjectTemplates, getTemplateStageTasks, mergeSavedProjectTemplate, PROJECT_TEMPLATE_STAGES, type ProjectTemplate, type ProjectTemplateStage, type ProjectTemplateTask } from "@/lib/project-templates";
import { getProjectTemplateTaskDestination, isProjectTemplateTaskDestinationChange, moveProjectTemplateTask, type ProjectTemplateTaskDestination } from "@/lib/project-template-task-order";
import { isProjectTypeKey, PROJECT_TYPE_KEYS, type ProjectTypeKey } from "@/lib/validation/project";
import { cn } from "@/lib/utils";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";

type Draft = { id: string | null; isActive: boolean; isDefault: boolean; name: string; projectType: ProjectTypeKey; tasks: ProjectTemplateTask[] };
type Mode = "preview" | "edit" | "create";
type TemplateCategory = "all" | ProjectTypeKey;
type PendingTask = { stage: ProjectTemplateStage; title: string };

const templateTaskPointerSensor = PointerSensor.configure({});
const templateTaskSensors = [templateTaskPointerSensor];
const templateTaskStageEdgeZoneSize = 96;

function draftFrom(template: ProjectTemplate | null): Draft {
  return template ? { id: template.id, name: template.name, projectType: template.projectType, isActive: template.isActive, isDefault: template.isDefault, tasks: template.tasks.map((task) => ({ ...task })) } : { id: null, name: "", projectType: "private", isActive: true, isDefault: false, tasks: [] };
}

function newTask(stage: ProjectTemplateStage, position: number): ProjectTemplateTask {
  const id = crypto.randomUUID();
  return { id, stage, title: "", priority: "normal", position, checklistTemplateId: null };
}

export function ProjectTemplateManager({ initialTemplates, studioId, checklistTemplates }: { initialTemplates: ProjectTemplate[]; studioId: string; checklistTemplates: StudioChecklistTemplate[] }) {
  const projectTypes = useTranslations("ProjectTypes");
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(initialTemplates[0]?.id ?? null);
  const [category, setCategory] = useState<TemplateCategory>("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mode, setMode] = useState<Mode>("preview");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);
  const pendingTaskCommittedRef = useRef(false);
  const activeTemplates = useMemo(() => getActiveProjectTemplates(templates), [templates]);
  const categoryCounts = useMemo(() => new Map(PROJECT_TYPE_KEYS.map((projectType) => [projectType, activeTemplates.filter((template) => template.projectType === projectType).length])), [activeTemplates]);
  const visibleTemplates = useMemo(() => category === "all" ? activeTemplates : activeTemplates.filter((template) => template.projectType === category), [activeTemplates, category]);
  const selected = useMemo(() => activeTemplates.find((template) => template.id === selectedId) ?? null, [activeTemplates, selectedId]);

  function select(templateId: string) { setSelectedId(templateId); setDraft(null); setPendingTask(null); setError(""); setMode("preview"); }
  function selectCategory(nextCategory: TemplateCategory) { const nextTemplates = nextCategory === "all" ? activeTemplates : activeTemplates.filter((template) => template.projectType === nextCategory); setCategory(nextCategory); setSelectedId(nextTemplates[0]?.id ?? null); setDraft(null); setError(""); setMode("preview"); }
  function beginEdit() { if (selected) { setDraft(draftFrom(selected)); setPendingTask(null); setError(""); setMode("edit"); } }
  function beginCreate() { setSelectedId(null); setDraft(draftFrom(null)); setPendingTask(null); setError(""); setMode("create"); }
  function updateTask(taskId: string, patch: Partial<ProjectTemplateTask>) { setDraft((current) => current ? { ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task) } : current); }
  function beginTaskDraft(stage: ProjectTemplateStage) { if (pendingTask) return; pendingTaskCommittedRef.current = false; setPendingTask({ stage, title: "" }); }
  function updatePendingTask(title: string) { setPendingTask((current) => current ? { ...current, title } : current); }
  function commitPendingTask() { if (pendingTaskCommittedRef.current || !pendingTask) return; pendingTaskCommittedRef.current = true; const title = pendingTask.title.trim(); if (title) setDraft((current) => { if (!current) return current; const lastPosition = Math.max(-1, ...current.tasks.filter((task) => task.stage === pendingTask.stage).map((task) => task.position)); return { ...current, tasks: [...current.tasks, { ...newTask(pendingTask.stage, lastPosition + 1), title }] }; }); setPendingTask(null); }
  function moveTask(sourceId: string, destination: ProjectTemplateTaskDestination) { setDraft((current) => current ? { ...current, tasks: moveProjectTemplateTask(current.tasks, sourceId, destination) } : current); }

  async function save() {
    if (!draft || saving) return;
    setSaving(true); setError("");
    const { data, error: saveError } = await createClient().rpc("save_project_template", { p_studio_id: studioId, p_name: draft.name.trim(), p_project_type: draft.projectType, p_is_active: draft.isActive, p_is_default: draft.isDefault, p_tasks: draft.tasks.map(({ stage, title, checklistTemplateId }) => ({ stage, title, priority: "normal", checklist_template_id: checklistTemplateId })), ...(draft.id === null ? {} : { p_template_id: draft.id }) });
    if (saveError || !data) { setError(saveError?.message ?? "Не вдалося зберегти шаблон."); setSaving(false); return; }
    const next: ProjectTemplate = { id: data, name: draft.name.trim(), projectType: draft.projectType, isActive: draft.isActive, isDefault: draft.isDefault, tasks: draft.tasks.map((task, position) => ({ id: task.id, stage: task.stage, title: task.title, priority: "normal", position, checklistTemplateId: task.checklistTemplateId })) };
    setTemplates((current) => mergeSavedProjectTemplate(current, next));
    setSelectedId(data); setDraft(null); setPendingTask(null); setMode("preview"); setSaving(false);
  }

  async function remove(template: ProjectTemplate) {
    if (!window.confirm(`Видалити шаблон “${template.name}”?`)) return;
    const { error: deleteError } = await createClient().rpc("delete_project_template", { p_template_id: template.id });
    if (deleteError) { setError(deleteError.message); return; }
    const next = templates.filter((item) => item.id !== template.id);
    setTemplates(next); setSelectedId(next[0]?.id ?? null); setDraft(null); setMode("preview");
  }

  return <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
    <aside className="self-start rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3"><div className="flex items-center justify-between gap-2 px-1 pb-3"><h2 className="text-sm font-semibold text-[var(--ui-text)]">Шаблони</h2><Button type="button" size="sm" className="size-9 p-0" onClick={beginCreate} aria-label="Створити шаблон"><Plus className="size-4" /></Button></div><div className="border-b border-[var(--ui-border)] px-1 pb-3"><label htmlFor="project-template-type-filter" className="mb-1 block text-xs font-medium text-[var(--ui-text-muted)]">Тип проєкту</label><Select id="project-template-type-filter" value={category} onValueChange={(value) => { if (value === "all" || isProjectTypeKey(value)) selectCategory(value); }}><SelectItem value="all">Усі ({activeTemplates.length})</SelectItem>{PROJECT_TYPE_KEYS.map((projectType) => <SelectItem key={projectType} value={projectType}>{projectTypes(projectType)} ({categoryCounts.get(projectType) ?? 0})</SelectItem>)}</Select></div>{error ? <p role="alert" className="mb-2 mt-3 rounded-[var(--ui-radius-control)] bg-[var(--ui-danger-surface)] px-2 py-2 text-xs text-[var(--ui-danger-text)]">{error}</p> : null}{visibleTemplates.length ? <ul className="mt-2 space-y-1">{visibleTemplates.map((template) => <li key={template.id}><button type="button" onClick={() => select(template.id)} aria-current={selectedId === template.id ? "true" : undefined} className={`w-full rounded-[var(--ui-radius-control)] px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${selectedId === template.id && mode !== "create" ? "bg-[var(--ui-surface-muted)] text-[var(--ui-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-subtle)]"}`}><span className="flex min-w-0 items-start justify-between gap-2"><span className="min-w-0 truncate text-sm font-semibold text-[var(--ui-text)]">{template.name}</span>{template.isDefault ? <span className="shrink-0 rounded-full bg-[var(--ui-success-surface)] px-2 py-0.5 text-xs font-medium text-[var(--ui-success-text)]">За замовчуванням</span> : null}</span><span className="mt-1 block text-sm text-[var(--ui-text-secondary)]">{projectTypes(template.projectType)}</span><span className="mt-1 block ui-numeric text-xs text-[var(--ui-text-muted)]">{template.tasks.length} задач</span></button></li>)}</ul> : <p className="px-2 py-5 text-sm text-[var(--ui-text-muted)]">У цій категорії ще немає активних шаблонів.</p>}</aside>
    {mode === "preview" ? <TemplatePreview checklistTemplates={checklistTemplates} template={selected} onDelete={remove} onEdit={beginEdit} projectTypeLabel={projectTypes} /> : draft ? <TemplateEditor checklistTemplates={checklistTemplates} draft={draft} onAddTask={beginTaskDraft} onCancel={() => { setDraft(null); setPendingTask(null); setMode("preview"); setError(""); }} onCommitPendingTask={commitPendingTask} onMoveTask={moveTask} onPendingTaskChange={updatePendingTask} onRemoveTask={(taskId) => setDraft({ ...draft, tasks: draft.tasks.filter((task) => task.id !== taskId) })} onUpdate={(patch) => setDraft({ ...draft, ...patch })} onUpdateTask={updateTask} onSave={() => void save()} pendingTask={pendingTask} projectTypeLabel={projectTypes} saving={saving} /> : null}
  </div>;
}

function TemplateHeader({ children }: { children: React.ReactNode }) {
  return <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--ui-border)]">{children}</header>;
}

function TemplatePreview({ checklistTemplates, onDelete, onEdit, projectTypeLabel, template }: { checklistTemplates: StudioChecklistTemplate[]; onDelete: (template: ProjectTemplate) => void; onEdit: () => void; projectTypeLabel: (key: ProjectTypeKey) => string; template: ProjectTemplate | null }) {
  if (!template) return <section className="rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface-subtle)] p-6 text-sm text-[var(--ui-text-muted)]">Оберіть шаблон зі списку або створіть новий.</section>;
  return <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5"><TemplateHeader><div className="min-w-0"><h1 className="truncate text-xl font-semibold tracking-tight text-[var(--ui-text)]">{template.name}</h1><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--ui-text-muted)]"><span>{projectTypeLabel(template.projectType)}</span><span className="ui-numeric">{template.tasks.length} задач</span>{template.isDefault ? <span className="text-[var(--ui-success-text)]">За замовчуванням</span> : null}</div></div><div className="flex shrink-0 gap-1"><Button type="button" size="sm" variant="ghost" className="size-10 p-0 text-[var(--ui-text-secondary)]" onClick={onEdit} aria-label={`Редагувати ${template.name}`} title="Редагувати"><Pencil className="size-4" aria-hidden="true" /></Button><Button type="button" size="sm" variant="ghost" className="size-10 p-0 text-[var(--ui-text-secondary)] hover:text-[var(--ui-danger-text)]" onClick={() => onDelete(template)} aria-label={`Видалити ${template.name}`} title="Видалити"><Trash2 className="size-4" aria-hidden="true" /></Button></div></TemplateHeader><TemplateStageGrid checklistTemplates={checklistTemplates} tasks={template.tasks} /></section>;
}

function TemplateEditor({ checklistTemplates, draft, onAddTask, onCancel, onCommitPendingTask, onMoveTask, onPendingTaskChange, onRemoveTask, onSave, onUpdate, onUpdateTask, pendingTask, projectTypeLabel, saving }: { checklistTemplates: StudioChecklistTemplate[]; draft: Draft; onAddTask: (stage: ProjectTemplateStage) => void; onCancel: () => void; onCommitPendingTask: () => void; onMoveTask: (sourceId: string, destination: ProjectTemplateTaskDestination) => void; onPendingTaskChange: (title: string) => void; onRemoveTask: (taskId: string) => void; onSave: () => void; onUpdate: (patch: Partial<Draft>) => void; onUpdateTask: (taskId: string, patch: Partial<ProjectTemplateTask>) => void; pendingTask: PendingTask | null; projectTypeLabel: (key: ProjectTypeKey) => string; saving: boolean }) {
  const projectTemplates = useTranslations("ProjectTemplates");
  return <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5"><TemplateHeader><div className="flex min-w-0 flex-1 items-center gap-x-4"><label className="grid w-full min-w-[15rem] max-w-[34rem] flex-[1_1_24rem] text-sm font-medium text-[var(--ui-text-secondary)]"><span className="sr-only">Назва</span><Input aria-label="Назва" value={draft.name} maxLength={120} disabled={saving} onChange={(event) => onUpdate({ name: event.target.value })} /></label><label className="grid w-full min-w-[13rem] max-w-[20rem] flex-[1_1_16rem] text-sm font-medium text-[var(--ui-text-secondary)]"><span className="sr-only">Тип проєкту</span><Select aria-label="Тип проєкту" value={draft.projectType} disabled={saving} onValueChange={(value) => { if (isProjectTypeKey(value)) onUpdate({ projectType: value }); }}>{PROJECT_TYPE_KEYS.map((type) => <SelectItem key={type} value={type}>{projectTypeLabel(type)}</SelectItem>)}</Select></label><button type="button" role="switch" aria-checked={draft.isDefault} aria-label={projectTemplates("defaultTemplate")} disabled={saving} onClick={() => onUpdate({ isDefault: !draft.isDefault })} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-2 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-60"><span>{projectTemplates("defaultTemplate")}</span><span aria-hidden="true" className={`relative h-6 w-11 rounded-full transition-colors duration-200 motion-reduce:transition-none ${draft.isDefault ? "bg-[var(--ui-action-primary)]" : "bg-[var(--ui-surface-strong)]"}`}><span className={`absolute left-1 top-1 size-4 rounded-full bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] transition-transform duration-200 ease-out motion-reduce:transition-none ${draft.isDefault ? "translate-x-5" : ""}`} /></span></button></div><div className="ml-auto flex shrink-0 gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Скасувати</Button><Button type="button" disabled={saving} onClick={onSave}>{saving ? "Збереження…" : "Зберегти"}</Button></div></TemplateHeader><TemplateStageGrid checklistTemplates={checklistTemplates} editable onAddTask={onAddTask} onCommitPendingTask={onCommitPendingTask} onMoveTask={onMoveTask} onPendingTaskChange={onPendingTaskChange} onRemoveTask={onRemoveTask} onUpdateTask={onUpdateTask} pendingTask={pendingTask} tasks={draft.tasks} /></section>;
}

function TemplateStageGrid({ checklistTemplates, editable = false, onAddTask, onCommitPendingTask, onMoveTask, onPendingTaskChange, onRemoveTask, onUpdateTask, pendingTask, tasks }: { checklistTemplates: StudioChecklistTemplate[]; editable?: boolean; onAddTask?: (stage: ProjectTemplateStage) => void; onCommitPendingTask?: () => void; onMoveTask?: (sourceId: string, destination: ProjectTemplateTaskDestination) => void; onPendingTaskChange?: (title: string) => void; onRemoveTask?: (taskId: string) => void; onUpdateTask?: (taskId: string, patch: Partial<ProjectTemplateTask>) => void; pendingTask?: PendingTask | null; tasks: ProjectTemplateTask[] }) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [dropDestination, setDropDestination] = useState<ProjectTemplateTaskDestination | null>(null);
  const stageGridRef = useRef<HTMLDivElement>(null);
  const documentHeightBeforeDragRef = useRef<number | null>(null);
  const tasksByStage = useMemo(() => new Map(PROJECT_TEMPLATE_STAGES.map((stage) => [stage, getTemplateStageTasks({ tasks }, stage)])), [tasks]);
  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? null;

  function getDestination(event: DragMoveEvent | DragOverEvent | DragEndEvent) {
    const sourceId = String(event.operation.source?.id ?? "");
    const target = event.operation.target;
    if (!sourceId || !target) return null;

    const targetId = String(target.id);
    const bounds = target.shape?.boundingRectangle;
    const { x, y } = event.operation.position.current;
    if (!bounds || x < bounds.left || x > bounds.left + bounds.width || y < bounds.top || y > bounds.top + bounds.height) return null;

    const task = tasks.find((item) => item.id === targetId);
    if (task) {
      const insertAfter = y >= bounds.top + bounds.height / 2;
      const destination = getProjectTemplateTaskDestination(tasks, sourceId, task.stage, task.id, insertAfter);
      return destination && isProjectTemplateTaskDestinationChange(tasks, sourceId, destination) ? destination : null;
    }

    const stageMatch = /^template-task-stage:(stage_[1-4])$/.exec(targetId);
    if (!stageMatch) return null;

    const stage = stageMatch[1] as ProjectTemplateStage;
    const stageTasks = tasksByStage.get(stage) ?? [];
    const edgeZoneSize = Math.min(templateTaskStageEdgeZoneSize, bounds.height / 2);
    const isTopZone = event.operation.position.current.y <= bounds.top + edgeZoneSize;
    const destination = isTopZone && stageTasks.length
      ? getProjectTemplateTaskDestination(tasks, sourceId, stage, stageTasks[0].id, false)
      : getProjectTemplateTaskDestination(tasks, sourceId, stage, null, true);
    return destination && isProjectTemplateTaskDestinationChange(tasks, sourceId, destination) ? destination : null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(String(event.operation.source?.id ?? ""));
    setDropDestination(null);
  }
  function handleDragOver(event: DragOverEvent) {
    const nextDestination = getDestination(event);
    setDropDestination((current) => current?.stage === nextDestination?.stage && current?.index === nextDestination?.index ? current : nextDestination);
  }
  function handleDragMove(event: DragMoveEvent) {
    const nextDestination = getDestination(event);
    setDropDestination((current) => current?.stage === nextDestination?.stage && current?.index === nextDestination?.index ? current : nextDestination);
  }
  function handleDragEnd(event: DragEndEvent) {
    const sourceId = String(event.operation.source?.id ?? "");
    const destination = getDestination(event);
    setActiveTaskId(null);
    setDropDestination(null);
    documentHeightBeforeDragRef.current = null;
    if (!event.canceled && sourceId && destination) onMoveTask?.(sourceId, destination);
  }

  return <DragDropProvider sensors={templateTaskSensors} onBeforeDragStart={() => { documentHeightBeforeDragRef.current = document.scrollingElement?.scrollHeight ?? null; }} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragOver={handleDragOver} onDragEnd={handleDragEnd}><TemplateAutoScrollBoundary stageGridRef={stageGridRef} documentHeightBeforeDragRef={documentHeightBeforeDragRef} /><div ref={stageGridRef} className="mt-6 grid gap-4 xl:grid-cols-4">{PROJECT_TEMPLATE_STAGES.map((stage, index) => <TemplateStageColumn checklistTemplates={checklistTemplates} key={stage} activeTaskId={activeTaskId} dropDestination={dropDestination} editable={editable} hasPendingTask={Boolean(pendingTask)} index={index} onAddTask={onAddTask} onCommitPendingTask={onCommitPendingTask} onPendingTaskChange={onPendingTaskChange} onRemoveTask={onRemoveTask} onUpdateTask={onUpdateTask} pendingTask={pendingTask?.stage === stage ? pendingTask : null} stage={stage} tasks={tasksByStage.get(stage) ?? []} />)}</div><div className="pointer-events-none fixed inset-0 z-50 overflow-clip [contain:paint]"><DragOverlay>{activeTask ? <TemplateTaskOverlay task={activeTask} /> : null}</DragOverlay></div></DragDropProvider>;
}

function TemplateAutoScrollBoundary({ stageGridRef, documentHeightBeforeDragRef }: { stageGridRef: RefObject<HTMLDivElement | null>; documentHeightBeforeDragRef: RefObject<number | null> }) {
  const manager = useDragDropManager();

  useEffect(() => {
    const scroller = manager?.registry.plugins.get(Scroller);
    if (!scroller) return;
    const getScrollableElements = scroller.getScrollableElements;
    // dnd-kit can continue from the page scroller to the document when the pointer leaves the viewport.
    scroller.getScrollableElements = () => {
      const ancestors = getScrollableElements();
      if (!ancestors) return null;

      const page = stageGridRef.current?.closest("#main-content");
      if (page && /(auto|scroll)/.test(getComputedStyle(page).overflowY)) {
        return ancestors.has(page) ? new Set([page]) : null;
      }

      const documentRoot = document.scrollingElement;
      return documentRoot && documentHeightBeforeDragRef.current !== null && documentRoot.scrollHeight <= documentHeightBeforeDragRef.current && ancestors.has(documentRoot)
        ? new Set([documentRoot])
        : null;
    };
    return () => { scroller.getScrollableElements = getScrollableElements; };
  }, [manager, stageGridRef, documentHeightBeforeDragRef]);

  return null;
}

function TemplateStageColumn({ checklistTemplates, activeTaskId, dropDestination, editable, hasPendingTask, index, onAddTask, onCommitPendingTask, onPendingTaskChange, onRemoveTask, onUpdateTask, pendingTask, stage, tasks }: { checklistTemplates: StudioChecklistTemplate[]; activeTaskId: string | null; dropDestination: ProjectTemplateTaskDestination | null; editable: boolean; hasPendingTask: boolean; index: number; onAddTask?: (stage: ProjectTemplateStage) => void; onCommitPendingTask?: () => void; onPendingTaskChange?: (title: string) => void; onRemoveTask?: (taskId: string) => void; onUpdateTask?: (taskId: string, patch: Partial<ProjectTemplateTask>) => void; pendingTask: PendingTask | null; stage: ProjectTemplateStage; tasks: ProjectTemplateTask[] }) {
  const sourceIndex = activeTaskId ? tasks.findIndex((task) => task.id === activeTaskId) : -1;
  const previewIndex = dropDestination?.stage === stage ? Math.min(dropDestination.index + (sourceIndex >= 0 && sourceIndex < dropDestination.index ? 1 : 0), tasks.length) : null;
  const acceptsDrop = editable;
  const { ref } = useDroppable({ id: `template-task-stage:${stage}`, type: "template-task-stage", accept: "template-task", collisionPriority: -1, disabled: !acceptsDrop });
  return <section ref={ref} className="flex min-h-44 flex-col rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-3"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-[var(--ui-text)]">Етап {index + 1}</h2><div className="flex items-center gap-1"><span className="ui-numeric text-xs text-[var(--ui-text-muted)]">{tasks.length}</span>{editable ? <Button type="button" size="sm" variant="ghost" disabled={hasPendingTask} className="size-9 p-0" onClick={() => onAddTask?.(stage)} aria-label={`Додати задачу до етапу ${index + 1}`}><Plus className="size-4" /></Button> : null}</div></div><div className="mt-3 min-h-16 flex-1"><div className={editable ? "" : "space-y-1.5"}>{pendingTask ? <PendingTemplateTask title={pendingTask.title} onChange={onPendingTaskChange} onCommit={onCommitPendingTask} /> : null}{tasks.length === 0 ? <p className="flex min-h-16 items-center justify-center rounded-[var(--ui-radius-control)] border border-dashed border-[var(--ui-border)] text-xs text-[var(--ui-text-muted)]">Перетягніть задачу сюди</p> : null}{tasks.map((task, order) => <TemplateTaskCard key={task.id} checklistTemplates={checklistTemplates} dropDisabled={!acceptsDrop} editable={editable} onRemoveTask={onRemoveTask} onUpdateTask={onUpdateTask} order={order + 1} previewBefore={previewIndex === order} previewAfter={previewIndex === tasks.length && order === tasks.length - 1} stage={stage} task={task} />)}</div></div></section>;
}

function TemplateDropPreview({ after = false }: { after?: boolean }) { return <div aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 z-10 border-t-2 border-[var(--ui-border-strong)]", after ? "bottom-0" : "top-0")} />; }

function PendingTemplateTask({ onChange, onCommit, title }: { onChange?: (title: string) => void; onCommit?: () => void; title: string }) {
  return <article className="rounded-[var(--ui-radius-control)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-2.5 py-2"><div className="flex min-w-0 items-center gap-2"><span className="w-4 shrink-0" aria-hidden="true" /><Input autoFocus aria-label="Назва нової задачі" value={title} maxLength={200} placeholder="Нова задача" onChange={(event) => onChange?.(event.target.value)} onBlur={onCommit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onCommit?.(); } }} /></div></article>;
}

function TemplateTaskCard({ checklistTemplates, dropDisabled, editable, onRemoveTask, onUpdateTask, order, previewBefore, previewAfter, stage, task }: { checklistTemplates: StudioChecklistTemplate[]; dropDisabled: boolean; editable: boolean; onRemoveTask?: (taskId: string) => void; onUpdateTask?: (taskId: string, patch: Partial<ProjectTemplateTask>) => void; order: number; previewBefore: boolean; previewAfter: boolean; stage: ProjectTemplateStage; task: ProjectTemplateTask }) {
  const { handleRef, isDragging, ref } = useSortable({ id: task.id, index: order - 1, group: stage, type: "template-task", accept: "template-task", disabled: { draggable: !editable, droppable: !editable || dropDisabled }, data: { stage, taskId: task.id }, plugins: [] });
  return <div ref={ref} className={cn("relative", editable && "py-[3px]")}>{previewBefore ? <TemplateDropPreview /> : null}<article className={cn("transition-opacity", editable ? "rounded-md border-b border-[var(--ui-border-subtle)] bg-transparent px-1 py-1.5" : "rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2.5 py-2", isDragging && "opacity-35")}><div className="flex min-w-0 items-center gap-2"><span className="ui-numeric w-4 shrink-0 text-right text-xs font-medium text-[var(--ui-text-muted)]">{order}</span>{editable ? <button ref={handleRef} type="button" aria-label={`Перетягнути ${task.title || "задачу"}`} className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] active:cursor-grabbing"><GripVertical className="size-4" aria-hidden="true" /></button> : null}{editable ? <Input aria-label="Назва задачі" value={task.title} maxLength={200} onChange={(event) => onUpdateTask?.(task.id, { title: event.target.value })} /> : <p className="min-w-0 flex-1 break-words text-sm font-medium text-[var(--ui-text)]">{task.title}</p>}{editable ? <Button type="button" size="sm" variant="ghost" className="size-9 shrink-0 p-0 text-[var(--ui-danger-text)]" onClick={() => onRemoveTask?.(task.id)} aria-label={`Видалити ${task.title || "задачу"}`}><Trash2 className="size-4" /></Button> : null}</div>{editable ? <TemplateTaskChecklistControl checklistTemplates={checklistTemplates} task={task} onUpdateTask={onUpdateTask} /> : task.checklistTemplateId ? <p className="mt-1 pl-6 text-xs text-[var(--ui-text-muted)]">{checklistTemplates.find((template) => template.id === task.checklistTemplateId)?.name ?? "Шаблон чекліста"}</p> : null}</article>{previewAfter ? <TemplateDropPreview after /> : null}</div>;
}

function TemplateTaskChecklistControl({ checklistTemplates, onUpdateTask, task }: { checklistTemplates: StudioChecklistTemplate[]; onUpdateTask?: (taskId: string, patch: Partial<ProjectTemplateTask>) => void; task: ProjectTemplateTask }) {
  const [isOpen, setIsOpen] = useState(false);
  const controlId = `template-task-checklist-${task.id}`;
  const summary = task.checklistTemplateId ? checklistTemplates.find((template) => template.id === task.checklistTemplateId)?.name ?? "Шаблон чекліста" : "Додати чекліст";

  return <div className="mt-0.5 pl-6 text-xs text-[var(--ui-text-muted)]"><button type="button" aria-expanded={isOpen} aria-controls={controlId} onClick={() => setIsOpen((open) => !open)} className="flex min-h-8 items-center gap-1 rounded px-1 text-left transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span className="truncate">{summary}</span><ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none", isOpen && "rotate-180")} /></button><div id={controlId} aria-hidden={!isOpen} inert={!isOpen} className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}><div className="min-h-0 overflow-hidden"><label className="block pt-2 text-sm text-[var(--ui-text-secondary)]"><span className="sr-only">Шаблон чекліста</span><Select aria-label="Шаблон чекліста" value={task.checklistTemplateId ?? ""} onValueChange={(value) => onUpdateTask?.(task.id, { checklistTemplateId: value || null })}><SelectItem value="">Без чекліста</SelectItem>{checklistTemplates.filter((template) => !template.archivedAt || template.id === task.checklistTemplateId).map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</Select></label></div></div></div>;
}

function TemplateTaskOverlay({ task }: { task: ProjectTemplateTask }) {
  return <article className="flex w-[min(18rem,calc(100vw-2rem))] items-center gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-2.5 py-2 shadow-[var(--ui-shadow-panel)]"><GripVertical className="size-4 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true" /><p className="min-w-0 truncate text-sm font-medium text-[var(--ui-text)]">{task.title || "Нова задача"}</p></article>;
}
