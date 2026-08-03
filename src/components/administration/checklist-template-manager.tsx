"use client";

import { DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from "@dnd-kit/react";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState(templates);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selected = useMemo(() => items.find((template) => template.id === draft?.id) ?? null, [draft?.id, items]);
  const isDirty = draft !== null && (draft.name !== (selected?.name ?? "") || getChecklistTemplateWeight({ stages: draft.stages }) !== getChecklistTemplateWeight({ stages: selected?.stages ?? [] }) || draft.stages.some((stage, index) => stage.title !== selected?.stages[index]?.title || stage.weight !== selected?.stages[index]?.weight) || draft.stages.length !== (selected?.stages.length ?? 0));

  function open(template: StudioChecklistTemplate | null) { setError(""); setDraft(toDraft(template)); setIsOpen(true); }
  function close() { if (isDirty && !window.confirm(t("discardConfirm"))) return; setIsOpen(false); setDraft(null); }
  async function save() {
    if (!draft || isSaving) return;
    setIsSaving(true); setError("");
    const { data, error: saveError } = await createClient().rpc("save_checklist_template", { p_template_id: draft.id, p_studio_id: studioId, p_name: draft.name.trim(), p_stages: draft.stages.map(({ title, weight }) => ({ title, weight })) });
    if (saveError || !data) { setError(t("saveFailed")); setIsSaving(false); return; }
    const next: StudioChecklistTemplate = { id: data, name: draft.name.trim(), archivedAt: selected?.archivedAt ?? null, stages: draft.stages.map((stage) => ({ ...stage, title: stage.title.trim() })) };
    setItems((current) => draft.id ? current.map((template) => template.id === data ? next : template) : [...current, next].sort((left, right) => left.name.localeCompare(right.name)));
    setDraft(toDraft(next)); setIsSaving(false);
  }
  return <>
    <section aria-labelledby="checklist-templates-heading" className="border-t border-[var(--ui-border)] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="checklist-templates-heading" className="text-sm font-semibold text-[var(--ui-text)]">{t("checklistTemplates")}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("managerDescription")}</p></div><Button ref={triggerRef} size="sm" variant="outline" onClick={() => open(items[0] ?? null)}>{t("manage")}</Button></div>
      {items.length ? <ul className="mt-2 divide-y divide-[var(--ui-border)]">{items.map((template) => <li key={template.id} className="py-2 text-sm text-[var(--ui-text-secondary)]"><span className="font-medium text-[var(--ui-text)]">{template.name}</span><span className="text-[var(--ui-text-muted)]"> · {t("templateSummary", { count: template.stages.length, weight: getChecklistTemplateWeight(template), archived: String(Boolean(template.archivedAt)) })}</span></li>)}</ul> : <p className="mt-2 text-sm text-[var(--ui-text-muted)]">{t("noTemplates")}</p>}
    </section>
    <Drawer isOpen={isOpen} onClose={close} initialFocusRef={closeRef} returnFocusRef={triggerRef} title={t("checklistTemplates")} description={t("managerDescription")} className="w-full max-w-[34rem]">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--ui-border)] px-4 py-3 sm:px-5"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--ui-text-muted)]">{t("studioTemplates")}</p><h2 className="mt-0.5 text-lg font-semibold text-[var(--ui-text)]">{t("checklistTemplates")}</h2></div><Button ref={closeRef} type="button" size="sm" variant="ghost" className="size-11 shrink-0 p-0" onClick={close} aria-label={t("closeTemplates")}><X className="size-4" /></Button></header>
      <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">{error ? <p role="alert" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><label className="sr-only" htmlFor="template-selector">{t("selectTemplate")}</label><Select id="template-selector" value={draft?.id ?? ""} onValueChange={(templateId) => { const template = items.find((item) => item.id === templateId) ?? null; if (!isDirty || window.confirm(t("discardConfirm"))) open(template); }}><SelectItem value="" disabled>{t("chooseTemplate")}</SelectItem>{items.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}{template.archivedAt ? ` (${t("archived")})` : ""}</SelectItem>)}</Select><Button type="button" variant="outline" className="h-11 shrink-0 px-4" onClick={() => open(null)}><Plus className="mr-1 size-4" />{t("newTemplate")}</Button></div>{draft ? <TemplateEditor draft={draft} setDraft={setDraft} isSaving={isSaving} /> : null}</main>
      <footer className="flex justify-end border-t border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 sm:px-5"><Button type="button" onClick={() => void save()} disabled={!draft || isSaving}>{isSaving ? t("saving") : t("saveTemplate")}</Button></footer>
    </Drawer>
  </>;
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
