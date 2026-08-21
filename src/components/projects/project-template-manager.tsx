"use client";

import { DragDropProvider, DragOverlay, PointerSensor, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from "@dnd-kit/react";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { getActiveProjectTemplates, PROJECT_TEMPLATE_STAGES, type ProjectTemplate, type ProjectTemplateStage, type ProjectTemplateTask } from "@/lib/project-templates";
import { isProjectTypeKey, PROJECT_TYPE_KEYS, type ProjectTypeKey } from "@/lib/validation/project";
import { cn } from "@/lib/utils";

type DraftTask = ProjectTemplateTask & { draftId: string };
type Draft = { id: string | null; isActive: boolean; isDefault: boolean; name: string; projectType: ProjectTypeKey; tasks: DraftTask[] };
type Mode = "preview" | "edit" | "create";
type TemplateCategory = "all" | ProjectTypeKey;
type PendingTask = { stage: ProjectTemplateStage; title: string };

const templateTaskPointerSensor = PointerSensor.configure({});
const templateTaskSensors = [templateTaskPointerSensor];

function draftFrom(template: ProjectTemplate | null): Draft {
  return template ? { id: template.id, name: template.name, projectType: template.projectType, isActive: template.isActive, isDefault: template.isDefault, tasks: template.tasks.map((task) => ({ ...task, draftId: task.id })) } : { id: null, name: "", projectType: "private", isActive: true, isDefault: true, tasks: [] };
}

function newTask(stage: ProjectTemplateStage, position: number): DraftTask {
  const id = crypto.randomUUID();
  return { id, draftId: id, stage, title: "", priority: "normal", position };
}

export function ProjectTemplateManager({ initialTemplates, studioId }: { initialTemplates: ProjectTemplate[]; studioId: string }) {
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
  function updateTask(draftId: string, patch: Partial<DraftTask>) { setDraft((current) => current ? { ...current, tasks: current.tasks.map((task) => task.draftId === draftId ? { ...task, ...patch } : task) } : current); }
  function beginTaskDraft(stage: ProjectTemplateStage) { if (pendingTask) return; pendingTaskCommittedRef.current = false; setPendingTask({ stage, title: "" }); }
  function updatePendingTask(title: string) { setPendingTask((current) => current ? { ...current, title } : current); }
  function commitPendingTask() { if (pendingTaskCommittedRef.current || !pendingTask) return; pendingTaskCommittedRef.current = true; const title = pendingTask.title.trim(); if (title) setDraft((current) => { if (!current) return current; const lastPosition = Math.max(-1, ...current.tasks.filter((task) => task.stage === pendingTask.stage).map((task) => task.position)); return { ...current, tasks: [...current.tasks, { ...newTask(pendingTask.stage, lastPosition + 1), title }] }; }); setPendingTask(null); }
  function moveTask(sourceId: string, targetStage: ProjectTemplateStage, targetIndex: number) { setDraft((current) => { if (!current) return current; const source = current.tasks.find((task) => task.draftId === sourceId); if (!source) return current; const sourceIndex = source.stage === targetStage ? current.tasks.filter((task) => task.stage === targetStage).sort((left, right) => left.position - right.position).findIndex((task) => task.draftId === sourceId) : -1; const stageTasks = new Map(PROJECT_TEMPLATE_STAGES.map((stage) => [stage, current.tasks.filter((task) => task.stage === stage && task.draftId !== sourceId).sort((left, right) => left.position - right.position)])); const destination = stageTasks.get(targetStage); if (!destination) return current; const insertionIndex = sourceIndex >= 0 && targetIndex > sourceIndex ? targetIndex - 1 : targetIndex; destination.splice(Math.min(insertionIndex, destination.length), 0, { ...source, stage: targetStage }); return { ...current, tasks: PROJECT_TEMPLATE_STAGES.flatMap((stage) => stageTasks.get(stage) ?? []).map((task, position) => ({ ...task, position })) }; }); }

  async function save() {
    if (!draft || saving) return;
    setSaving(true); setError("");
    const { data, error: saveError } = await createClient().rpc("save_project_template", { p_template_id: draft.id, p_studio_id: studioId, p_name: draft.name.trim(), p_project_type: draft.projectType, p_is_active: draft.isActive, p_is_default: draft.isDefault, p_tasks: draft.tasks.map(({ stage, title }) => ({ stage, title, priority: "normal" })) });
    if (saveError || !data) { setError(saveError?.message ?? "Не вдалося зберегти шаблон."); setSaving(false); return; }
    const next: ProjectTemplate = { id: data, name: draft.name.trim(), projectType: draft.projectType, isActive: draft.isActive, isDefault: draft.isDefault, tasks: draft.tasks.map((task, position) => ({ id: task.id, stage: task.stage, title: task.title, priority: "normal", position })) };
    setTemplates((current) => draft.id ? current.map((template) => template.id === data ? next : template) : [...current, next].sort((left, right) => left.name.localeCompare(right.name)));
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
    <aside className="self-start rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3"><div className="flex items-center justify-between gap-2 px-1 pb-3"><h2 className="text-sm font-semibold text-[var(--ui-text)]">Шаблони</h2><Button type="button" size="sm" className="size-9 p-0" onClick={beginCreate} aria-label="Створити шаблон"><Plus className="size-4" /></Button></div><div className="flex flex-wrap gap-1.5 border-b border-[var(--ui-border)] px-1 pb-3" aria-label="Фільтр за типом проєкту">{([{ key: "all", label: "Усі", count: activeTemplates.length } as const, ...PROJECT_TYPE_KEYS.map((projectType) => ({ key: projectType, label: projectTypes(projectType), count: categoryCounts.get(projectType) ?? 0 }))]).map((item) => <button key={item.key} type="button" onClick={() => selectCategory(item.key)} aria-pressed={category === item.key} className={`inline-flex min-h-8 items-center overflow-hidden rounded-full border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${category === item.key ? "border-[var(--ui-text)] bg-[var(--ui-text)] text-[var(--ui-surface)]" : "border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)]"}`}><span className="px-2">{item.label}</span><span className={`ui-numeric border-l px-2 ${category === item.key ? "border-white/25" : "border-[var(--ui-border)] text-[var(--ui-text-muted)]"}`}>{item.count}</span></button>)}</div>{error ? <p role="alert" className="mb-2 mt-3 rounded-[var(--ui-radius-control)] bg-[var(--ui-danger-surface)] px-2 py-2 text-xs text-[var(--ui-danger-text)]">{error}</p> : null}{visibleTemplates.length ? <ul className="mt-2 space-y-1">{visibleTemplates.map((template) => <li key={template.id}><button type="button" onClick={() => select(template.id)} aria-current={selectedId === template.id ? "true" : undefined} className={`w-full rounded-[var(--ui-radius-control)] px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${selectedId === template.id && mode !== "create" ? "bg-[var(--ui-surface-muted)] text-[var(--ui-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-subtle)]"}`}><span className="flex min-w-0 items-start justify-between gap-2"><span className="min-w-0 truncate text-sm font-semibold text-[var(--ui-text)]">{template.name}</span>{template.isDefault ? <span className="shrink-0 rounded-full bg-[var(--ui-success-surface)] px-2 py-0.5 text-xs font-medium text-[var(--ui-success-text)]">За замовчуванням</span> : null}</span><span className="mt-1 block text-sm text-[var(--ui-text-secondary)]">{projectTypes(template.projectType)}</span><span className="mt-1 block ui-numeric text-xs text-[var(--ui-text-muted)]">{template.tasks.length} задач</span></button></li>)}</ul> : <p className="px-2 py-5 text-sm text-[var(--ui-text-muted)]">У цій категорії ще немає активних шаблонів.</p>}</aside>
    {mode === "preview" ? <TemplatePreview template={selected} onDelete={remove} onEdit={beginEdit} projectTypeLabel={projectTypes} /> : draft ? <TemplateEditor draft={draft} onAddTask={beginTaskDraft} onCancel={() => { setDraft(null); setPendingTask(null); setMode("preview"); setError(""); }} onCommitPendingTask={commitPendingTask} onMoveTask={moveTask} onPendingTaskChange={updatePendingTask} onRemoveTask={(taskId) => setDraft({ ...draft, tasks: draft.tasks.filter((task) => task.draftId !== taskId) })} onUpdate={(patch) => setDraft({ ...draft, ...patch })} onUpdateTask={updateTask} onSave={() => void save()} pendingTask={pendingTask} projectTypeLabel={projectTypes} saving={saving} /> : null}
  </div>;
}

function TemplatePreview({ onDelete, onEdit, projectTypeLabel, template }: { onDelete: (template: ProjectTemplate) => void; onEdit: () => void; projectTypeLabel: (key: ProjectTypeKey) => string; template: ProjectTemplate | null }) {
  if (!template) return <section className="rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface-subtle)] p-6 text-sm text-[var(--ui-text-muted)]">Оберіть шаблон зі списку або створіть новий.</section>;
  return <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ui-border)] pb-4"><div><h1 className="text-xl font-semibold tracking-tight text-[var(--ui-text)]">{template.name}</h1><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--ui-text-muted)]"><span>{projectTypeLabel(template.projectType)}</span><span className="ui-numeric">{template.tasks.length} задач</span>{template.isDefault ? <span className="text-[var(--ui-success-text)]">За замовчуванням</span> : null}</div></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={onEdit}><Pencil className="mr-1 size-4" />Редагувати</Button><Button type="button" size="sm" variant="ghost" className="size-10 p-0 text-[var(--ui-danger-text)]" onClick={() => onDelete(template)} aria-label={`Видалити ${template.name}`}><Trash2 className="size-4" /></Button></div></header><TemplateStageGrid tasks={template.tasks} /></section>;
}

function TemplateEditor({ draft, onAddTask, onCancel, onCommitPendingTask, onMoveTask, onPendingTaskChange, onRemoveTask, onSave, onUpdate, onUpdateTask, pendingTask, projectTypeLabel, saving }: { draft: Draft; onAddTask: (stage: ProjectTemplateStage) => void; onCancel: () => void; onCommitPendingTask: () => void; onMoveTask: (sourceId: string, targetStage: ProjectTemplateStage, targetIndex: number) => void; onPendingTaskChange: (title: string) => void; onRemoveTask: (taskId: string) => void; onSave: () => void; onUpdate: (patch: Partial<Draft>) => void; onUpdateTask: (taskId: string, patch: Partial<DraftTask>) => void; pendingTask: PendingTask | null; projectTypeLabel: (key: ProjectTypeKey) => string; saving: boolean }) {
  return <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ui-border)] pb-4"><div><h1 className="text-xl font-semibold tracking-tight text-[var(--ui-text)]">{draft.id ? "Редагувати шаблон" : "Новий шаблон"}</h1><p className="mt-1 text-sm text-[var(--ui-text-muted)]">Перетягуйте задачі між етапами та змінюйте їх порядок у межах етапу.</p></div><div className="flex gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Скасувати</Button><Button type="button" disabled={saving} onClick={onSave}>{saving ? "Збереження…" : "Зберегти"}</Button></div></header><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">Назва<Input value={draft.name} maxLength={120} disabled={saving} onChange={(event) => onUpdate({ name: event.target.value })} /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">Тип проєкту<Select value={draft.projectType} disabled={saving} onValueChange={(value) => { if (isProjectTypeKey(value)) onUpdate({ projectType: value }); }}>{PROJECT_TYPE_KEYS.map((type) => <SelectItem key={type} value={type}>{projectTypeLabel(type)}</SelectItem>)}</Select></label></div><label className="mt-4 flex min-h-11 items-center gap-2 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" checked={draft.isActive} disabled={saving} onChange={(event) => onUpdate({ isActive: event.target.checked })} />Активний шаблон за замовчуванням</label><TemplateStageGrid editable onAddTask={onAddTask} onCommitPendingTask={onCommitPendingTask} onMoveTask={onMoveTask} onPendingTaskChange={onPendingTaskChange} onRemoveTask={onRemoveTask} onUpdateTask={onUpdateTask} pendingTask={pendingTask} tasks={draft.tasks} /></section>;
}

function TemplateStageGrid({ editable = false, onAddTask, onCommitPendingTask, onMoveTask, onPendingTaskChange, onRemoveTask, onUpdateTask, pendingTask, tasks }: { editable?: boolean; onAddTask?: (stage: ProjectTemplateStage) => void; onCommitPendingTask?: () => void; onMoveTask?: (sourceId: string, targetStage: ProjectTemplateStage, targetIndex: number) => void; onPendingTaskChange?: (title: string) => void; onRemoveTask?: (taskId: string) => void; onUpdateTask?: (taskId: string, patch: Partial<DraftTask>) => void; pendingTask?: PendingTask | null; tasks: Array<ProjectTemplateTask | DraftTask> }) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const activeTask = tasks.find((task) => ("draftId" in task ? task.draftId : task.id) === activeTaskId) ?? null;
  function handleDragStart(event: DragStartEvent) { setActiveTaskId(String(event.operation.source?.id ?? "")); }
  function handleDragEnd(event: DragEndEvent) { const sourceId = String(event.operation.source?.id ?? ""); const target = String(event.operation.target?.id ?? ""); setActiveTaskId(null); const match = /^template-task-drop:(stage_[1-4]):(\d+)$/.exec(target); if (!event.canceled && sourceId && match) onMoveTask?.(sourceId, match[1] as ProjectTemplateStage, Number(match[2])); }
  return <DragDropProvider sensors={templateTaskSensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}><div className="mt-6 grid gap-4 xl:grid-cols-4">{PROJECT_TEMPLATE_STAGES.map((stage, index) => <TemplateStageColumn key={stage} editable={editable} hasPendingTask={Boolean(pendingTask)} index={index} onAddTask={onAddTask} onCommitPendingTask={onCommitPendingTask} onPendingTaskChange={onPendingTaskChange} onRemoveTask={onRemoveTask} onUpdateTask={onUpdateTask} pendingTask={pendingTask?.stage === stage ? pendingTask : null} stage={stage} tasks={tasks.filter((task) => task.stage === stage).sort((left, right) => left.position - right.position)} />)}</div><DragOverlay>{activeTask ? <TemplateTaskOverlay task={activeTask} /> : null}</DragOverlay></DragDropProvider>;
}

function TemplateStageColumn({ editable, hasPendingTask, index, onAddTask, onCommitPendingTask, onPendingTaskChange, onRemoveTask, onUpdateTask, pendingTask, stage, tasks }: { editable: boolean; hasPendingTask: boolean; index: number; onAddTask?: (stage: ProjectTemplateStage) => void; onCommitPendingTask?: () => void; onPendingTaskChange?: (title: string) => void; onRemoveTask?: (taskId: string) => void; onUpdateTask?: (taskId: string, patch: Partial<DraftTask>) => void; pendingTask: PendingTask | null; stage: ProjectTemplateStage; tasks: Array<ProjectTemplateTask | DraftTask> }) {
  return <section className="min-h-44 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-3"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-[var(--ui-text)]">Етап {index + 1}</h2><div className="flex items-center gap-1"><span className="ui-numeric text-xs text-[var(--ui-text-muted)]">{tasks.length}</span>{editable ? <Button type="button" size="sm" variant="ghost" disabled={hasPendingTask} className="size-9 p-0" onClick={() => onAddTask?.(stage)} aria-label={`Додати задачу до етапу ${index + 1}`}><Plus className="size-4" /></Button> : null}</div></div><div className="mt-3 space-y-2">{pendingTask ? <PendingTemplateTask title={pendingTask.title} onChange={onPendingTaskChange} onCommit={onCommitPendingTask} /> : null}<TemplateDropSlot index={0} stage={stage} />{tasks.map((task, order) => <div key={"draftId" in task ? task.draftId : task.id}><TemplateTaskCard editable={editable} onRemoveTask={onRemoveTask} onUpdateTask={onUpdateTask} order={order + 1} task={task} /><TemplateDropSlot index={order + 1} stage={stage} /></div>)}</div></section>;
}

function TemplateDropSlot({ index, stage }: { index: number; stage: ProjectTemplateStage }) {
  const { isDropTarget, ref } = useDroppable({ id: `template-task-drop:${stage}:${index}`, type: "template-task-drop", accept: "template-task" });
  return <div ref={ref} aria-hidden="true" className={cn("h-1 rounded-[var(--ui-radius-control)] transition-[height,background-color,border-color] duration-150", isDropTarget && "h-11 border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)]")} />;
}

function PendingTemplateTask({ onChange, onCommit, title }: { onChange?: (title: string) => void; onCommit?: () => void; title: string }) {
  return <article className="rounded-[var(--ui-radius-control)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-2.5 py-2"><div className="flex min-w-0 items-center gap-2"><span className="w-4 shrink-0" aria-hidden="true" /><Input autoFocus aria-label="Назва нової задачі" value={title} maxLength={200} placeholder="Нова задача" onChange={(event) => onChange?.(event.target.value)} onBlur={onCommit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onCommit?.(); } }} /></div></article>;
}

function TemplateTaskCard({ editable, onRemoveTask, onUpdateTask, order, task }: { editable: boolean; onRemoveTask?: (taskId: string) => void; onUpdateTask?: (taskId: string, patch: Partial<DraftTask>) => void; order: number; task: ProjectTemplateTask | DraftTask }) {
  const taskId = "draftId" in task ? task.draftId : task.id;
  const { isDragging, ref: dragRef } = useDraggable({ id: taskId, type: "template-task", disabled: !editable, data: { taskId } });
  return <article className={cn("rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2.5 py-2 transition-opacity", isDragging && "opacity-35")}><div className="flex min-w-0 items-center gap-2"><span className="ui-numeric w-4 shrink-0 text-right text-xs font-medium text-[var(--ui-text-muted)]">{order}</span>{editable ? <button ref={dragRef} type="button" aria-label={`Перетягнути ${task.title || "задачу"}`} className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] active:cursor-grabbing"><GripVertical className="size-4" aria-hidden="true" /></button> : null}{editable && "draftId" in task ? <Input aria-label="Назва задачі" value={task.title} maxLength={200} onChange={(event) => onUpdateTask?.(taskId, { title: event.target.value })} /> : <p className="min-w-0 flex-1 break-words text-sm font-medium text-[var(--ui-text)]">{task.title}</p>}{editable ? <Button type="button" size="sm" variant="ghost" className="size-9 shrink-0 p-0 text-[var(--ui-danger-text)]" onClick={() => onRemoveTask?.(taskId)} aria-label={`Видалити ${task.title || "задачу"}`}><Trash2 className="size-4" /></Button> : null}</div></article>;
}

function TemplateTaskOverlay({ task }: { task: ProjectTemplateTask | DraftTask }) {
  return <article className="flex w-[min(18rem,calc(100vw-2rem))] items-center gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-2.5 py-2 shadow-[var(--ui-shadow-panel)]"><GripVertical className="size-4 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true" /><p className="min-w-0 truncate text-sm font-medium text-[var(--ui-text)]">{task.title || "Нова задача"}</p></article>;
}
