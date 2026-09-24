"use client";

import { DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from "@dnd-kit/react";
import { GripVertical, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import { createClient } from "@/lib/supabase/client";
import { cloneChecklistTemplateStages, getChecklistTemplateWeight, moveChecklistTemplateStage, type ChecklistTemplateStage, type StudioChecklistTemplate } from "@/lib/studio-checklist-templates";
import { cn } from "@/lib/utils";

type Draft = { id: string | null; name: string; stages: ChecklistTemplateStage[] };

const stagePointerSensor = PointerSensor.configure({});
const stageKeyboardSensor = KeyboardSensor.configure({ offset: 72 });
const stageSensors = [stagePointerSensor, stageKeyboardSensor];

function createStage(): ChecklistTemplateStage { return { id: crypto.randomUUID(), title: "", weight: 1 }; }
function toDraft(template: StudioChecklistTemplate | null): Draft { return template ? { id: template.id, name: template.name, stages: cloneChecklistTemplateStages(template) } : { id: null, name: "", stages: [createStage()] }; }

export function ChecklistTemplateManager({ studioId, templates }: { studioId: string; templates: StudioChecklistTemplate[] }) {
  const t = useTranslations("Templates");
  const [items, setItems] = useState(templates);
  const [selectedId, setSelectedId] = useState<string | null>(templates[0]?.id ?? null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selected = useMemo(() => items.find((template) => template.id === selectedId) ?? null, [selectedId, items]);
  const isDirty = draft !== null && (draft.name !== (selected?.name ?? "") || getChecklistTemplateWeight({ stages: draft.stages }) !== getChecklistTemplateWeight({ stages: selected?.stages ?? [] }) || draft.stages.some((stage, index) => stage.title !== selected?.stages[index]?.title || stage.weight !== selected?.stages[index]?.weight) || draft.stages.length !== (selected?.stages.length ?? 0));

  function discardChanges() { return !isDirty || window.confirm(t("discardConfirm")); }
  function select(templateId: string) { if (!discardChanges()) return; setSelectedId(templateId); setDraft(null); setError(""); }
  function create() { if (!discardChanges()) return; setSelectedId(null); setDraft(toDraft(null)); setError(""); }
  function edit() { if (selected) { setDraft(toDraft(selected)); setError(""); } }
  function cancel() { if (!discardChanges()) return; setDraft(null); setError(""); }

  async function save() {
    if (!draft || isSaving) return;
    setIsSaving(true); setError("");
    const { data, error: saveError } = await createClient().rpc("save_checklist_template", { p_studio_id: studioId, p_name: draft.name.trim(), p_stages: draft.stages.map(({ title, weight }) => ({ title, weight })), ...(draft.id === null ? {} : { p_template_id: draft.id }) });
    if (saveError || !data) { setError(t("saveFailed")); setIsSaving(false); return; }
    const next: StudioChecklistTemplate = { id: data, name: draft.name.trim(), archivedAt: selected?.archivedAt ?? null, stages: draft.stages.map((stage) => ({ ...stage, title: stage.title.trim() })) };
    setItems((current) => draft.id ? current.map((template) => template.id === data ? next : template) : [...current, next].sort((left, right) => left.name.localeCompare(right.name)));
    setSelectedId(data); setDraft(null); setIsSaving(false);
  }

  async function setArchived(template: StudioChecklistTemplate, archived: boolean) {
    if (archived && !window.confirm(t("archiveConfirm", { name: template.name }))) return;
    setError("");
    const { data, error: archiveError } = await createClient().rpc("set_checklist_template_archived", { p_template_id: template.id, p_archived: archived });
    if (archiveError) { setError(t("archiveFailed")); return; }
    setItems((current) => current.map((item) => item.id === template.id ? { ...item, archivedAt: data } : item));
  }

  return <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
    <aside className="self-start rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
      <div className="flex items-center justify-between gap-2 px-1 pb-3"><h2 className="text-sm font-semibold text-[var(--ui-text)]">{t("checklistTemplates")}</h2><Button type="button" size="sm" className="size-9 p-0" onClick={create} aria-label={t("newTemplate")}><Plus className="size-4" /></Button></div>
      {items.length ? <ul className="space-y-1 border-t border-[var(--ui-border)] pt-2">{items.map((template) => <li key={template.id}><button type="button" onClick={() => select(template.id)} aria-current={selectedId === template.id && !draft ? "true" : undefined} className={cn("w-full rounded-[var(--ui-radius-control)] px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", selectedId === template.id && !draft ? "bg-[var(--ui-surface-muted)]" : "hover:bg-[var(--ui-surface-subtle)]")}><span className="flex min-w-0 items-start justify-between gap-2"><span className="min-w-0 truncate text-sm font-semibold text-[var(--ui-text)]">{template.name}</span>{template.archivedAt ? <span className="shrink-0 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--ui-text-secondary)]">{t("archived")}</span> : null}</span><span className="mt-1 block ui-numeric text-xs text-[var(--ui-text-muted)]">{t("stages", { count: template.stages.length })}</span></button></li>)}</ul> : <p className="border-t border-[var(--ui-border)] px-2 py-5 text-sm text-[var(--ui-text-muted)]">{t("noTemplates")}</p>}
    </aside>
    {draft ? <section className="min-w-0 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ui-border)] pb-4"><h1 className="text-xl font-semibold tracking-tight text-[var(--ui-text)]">{draft.id ? t("editTemplate") : t("newTemplate")}</h1><div className="flex gap-2"><Button type="button" variant="outline" disabled={isSaving} onClick={cancel}>{t("cancel")}</Button><Button type="button" disabled={isSaving} onClick={() => void save()}>{isSaving ? t("saving") : t("saveTemplate")}</Button></div></header>{error ? <p role="alert" className="mt-4 rounded-[var(--ui-radius-control)] bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}<div className="mt-5 max-w-[34rem]"><TemplateEditor draft={draft} setDraft={setDraft} isSaving={isSaving} /></div></section> : selected ? <section className="min-w-0 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ui-border)] pb-4"><div><h1 className="text-xl font-semibold tracking-tight text-[var(--ui-text)]">{selected.name}</h1><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--ui-text-muted)]"><span className="ui-numeric">{t("stages", { count: selected.stages.length })}</span><span className="ui-numeric">{t("totalWeight", { weight: getChecklistTemplateWeight(selected) })}</span>{selected.archivedAt ? <span>{t("archived")}</span> : null}</div></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={edit}><Pencil className="mr-1 size-4" />{t("editTemplate")}</Button><Button type="button" size="sm" variant="ghost" className="size-10 p-0" onClick={() => void setArchived(selected, !selected.archivedAt)} aria-label={selected.archivedAt ? t("restoreTemplate", { name: selected.name }) : t("archiveTemplate", { name: selected.name })}>{selected.archivedAt ? <RotateCcw className="size-4" /> : <Trash2 className="size-4 text-[var(--ui-danger-text)]" />}</Button></div></header>{error ? <p role="alert" className="mt-4 rounded-[var(--ui-radius-control)] bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}<ol className="mt-4 divide-y divide-[var(--ui-border-subtle)]">{selected.stages.map((stage, index) => <li key={stage.id} className="flex items-center gap-3 py-3 text-sm"><span className="ui-numeric w-6 shrink-0 text-right text-[var(--ui-text-muted)]">{index + 1}</span><span className="min-w-0 flex-1 break-words font-medium text-[var(--ui-text)]">{stage.title}</span><span className="ui-numeric shrink-0 text-[var(--ui-text-muted)]">{stage.weight}</span></li>)}</ol></section> : <section className="rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface-subtle)] p-6 text-sm text-[var(--ui-text-muted)]">{t("chooseTemplate")}</section>}
  </div>;
}

function TemplateEditor({ draft, isSaving, setDraft }: { draft: Draft; isSaving: boolean; setDraft: (draft: Draft) => void }) {
  const t = useTranslations("Templates");
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  function updateStage(index: number, update: Partial<ChecklistTemplateStage>) { setDraft({ ...draft, stages: draft.stages.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...update } : stage) }); }
  function handleDragStart(event: DragStartEvent) { setActiveStageId(String(event.operation.source?.id ?? "")); }
  function handleDragEnd(event: DragEndEvent) { const sourceId = String(event.operation.source?.id ?? ""); const targetId = String(event.operation.target?.id ?? "").replace("template-stage-drop:", ""); setActiveStageId(null); if (!event.canceled && sourceId && targetId) setDraft({ ...draft, stages: moveChecklistTemplateStage(draft.stages, sourceId, targetId) }); }
  const activeStage = draft.stages.find((stage) => stage.id === activeStageId) ?? null;
  const addStage = () => setDraft({ ...draft, stages: [...draft.stages, createStage()] });
  return <div className="space-y-3"><label className="grid min-w-0 gap-1.5 text-sm font-medium text-[var(--ui-text)]">{t("templateName")}<Input value={draft.name} maxLength={120} disabled={isSaving} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><div><div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-[var(--ui-text)]">{t("stagesHeading")}</h3><p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{t("reorderHelp")}</p></div><Button type="button" size="sm" variant="ghost" disabled={isSaving} onClick={addStage}><Plus className="mr-1 size-4" />{t("addStage")}</Button></div><DragDropProvider sensors={stageSensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}><ul className="mt-2 divide-y divide-[var(--ui-border)] border-y border-[var(--ui-border)]">{draft.stages.map((stage, index) => <SortableStageRow key={stage.id} index={index} isSaving={isSaving} onAddStage={addStage} onRemove={() => setDraft({ ...draft, stages: draft.stages.filter((_, stageIndex) => stageIndex !== index) })} onUpdate={updateStage} stage={stage} />)}</ul><DragOverlay>{activeStage ? <StageRowOverlay stage={activeStage} /> : null}</DragOverlay></DragDropProvider></div></div>;
}

function StageRowOverlay({ stage }: { stage: ChecklistTemplateStage }) {
  const t = useTranslations("Templates");
  return <div className="grid w-[min(30rem,calc(100vw-2rem))] grid-cols-[2.75rem_minmax(0,1fr)_4.5rem_2.75rem] items-center gap-1 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] py-1.5 shadow-[var(--ui-shadow-panel)]"><div className="flex size-11 items-center justify-center text-[var(--ui-text-muted)]"><GripVertical className="size-4" aria-hidden="true" /></div><p className="truncate px-3 text-sm text-[var(--ui-text)]">{stage.title || t("untitledStage")}</p><span className="flex h-11 items-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)]">{stage.weight}</span><div className="flex size-11 items-center justify-center text-[var(--ui-danger-text)]"><Trash2 className="size-4" aria-hidden="true" /></div></div>;
}

function SortableStageRow({ index, isSaving, onAddStage, onRemove, onUpdate, stage }: { index: number; isSaving: boolean; onAddStage: () => void; onRemove: () => void; onUpdate: (index: number, update: Partial<ChecklistTemplateStage>) => void; stage: ChecklistTemplateStage }) {
  const t = useTranslations("Templates");
  const { isDragging, ref: dragRef } = useDraggable({ id: stage.id, type: "template-stage", disabled: isSaving, data: { stageId: stage.id } });
  const { isDropTarget, ref: dropRef } = useDroppable({ id: `template-stage-drop:${stage.id}`, type: "template-stage-drop", accept: "template-stage" });
  return <li ref={dropRef} className={cn("grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_4.5rem_2.75rem] items-center gap-1 py-1.5 transition-[background-color,opacity] duration-150", isDropTarget && "rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)]", isDragging && "opacity-40")}><button ref={dragRef} type="button" disabled={isSaving} aria-label={t("reorderStage", { title: stage.title || t("untitledStage") })} className={cn("flex size-11 cursor-grab items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] outline-none hover:bg-[var(--ui-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] active:cursor-grabbing", isDragging && "cursor-grabbing")}><GripVertical className="size-4" aria-hidden="true" /></button><Input value={stage.title} maxLength={200} disabled={isSaving} className="min-w-0" placeholder={t("stageTitle")} onChange={(event) => onUpdate(index, { title: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onAddStage(); } }} /><Input type="number" min="1" max="1000" step="1" inputMode="numeric" value={stage.weight} disabled={isSaving} className="w-full" aria-label={t("stageWeight", { title: stage.title || t("untitledStage") })} onChange={(event) => onUpdate(index, { weight: Number(event.target.value) })} /><Button type="button" size="sm" variant="ghost" disabled={isSaving} className="size-11 p-0 text-[var(--ui-danger-text)]" aria-label={t("removeStage", { title: stage.title || t("untitledStage") })} onClick={onRemove}><Trash2 className="size-4" /></Button></li>;
}
