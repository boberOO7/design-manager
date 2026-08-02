"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/form-field";
import { createClient } from "@/lib/supabase/client";
import { cloneChecklistTemplateStages, getChecklistTemplateWeight, type ChecklistTemplateStage, type StudioChecklistTemplate } from "@/lib/studio-checklist-templates";

type Draft = { id: string | null; name: string; stages: ChecklistTemplateStage[] };

function createStage(): ChecklistTemplateStage {
  return { id: crypto.randomUUID(), title: "", weight: 1 };
}

function toDraft(template: StudioChecklistTemplate | null): Draft {
  return template ? { id: template.id, name: template.name, stages: cloneChecklistTemplateStages(template) } : { id: null, name: "", stages: [createStage()] };
}

export function ChecklistTemplateManager({ studioId, templates }: { studioId: string; templates: StudioChecklistTemplate[] }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState(templates);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selected = useMemo(() => items.find((template) => template.id === draft?.id) ?? null, [draft?.id, items]);
  const isDirty = draft !== null && (draft.name !== (selected?.name ?? "") || getChecklistTemplateWeight({ stages: draft.stages }) !== getChecklistTemplateWeight({ stages: selected?.stages ?? [] }) || draft.stages.some((stage, index) => stage.title !== selected?.stages[index]?.title || stage.weight !== selected?.stages[index]?.weight) || draft.stages.length !== (selected?.stages.length ?? 0));

  function open(template: StudioChecklistTemplate | null) {
    setError(""); setDraft(toDraft(template)); setIsOpen(true);
  }
  function close() {
    if (isDirty && !window.confirm("Discard unsaved checklist template changes?")) return;
    setIsOpen(false); setDraft(null);
  }
  async function save() {
    if (!draft || isSaving) return;
    setIsSaving(true); setError("");
    const supabase = createClient();
    const { data, error: saveError } = await supabase.rpc("save_checklist_template", { p_template_id: draft.id, p_studio_id: studioId, p_name: draft.name.trim(), p_stages: draft.stages.map(({ title, weight }) => ({ title, weight })) });
    if (saveError || !data) { setError(saveError?.message ?? "The template could not be saved."); setIsSaving(false); return; }
    const next: StudioChecklistTemplate = { id: data, name: draft.name.trim(), archivedAt: selected?.archivedAt ?? null, stages: draft.stages.map((stage) => ({ ...stage, title: stage.title.trim() })) };
    setItems((current) => draft.id ? current.map((template) => template.id === data ? next : template) : [...current, next].sort((left, right) => left.name.localeCompare(right.name)));
    setDraft(toDraft(next)); setIsSaving(false);
  }
  async function toggleArchive(template: StudioChecklistTemplate) {
    setError("");
    const supabase = createClient();
    const { data, error: archiveError } = await supabase.rpc("set_checklist_template_archived", { p_template_id: template.id, p_archived: template.archivedAt === null });
    if (archiveError) { setError("The template could not be updated."); return; }
    setItems((current) => current.map((item) => item.id === template.id ? { ...item, archivedAt: data } : item));
  }

  return <>
    <section aria-labelledby="checklist-templates-heading" className="border-t border-[var(--ui-border)] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="checklist-templates-heading" className="text-sm font-semibold text-[var(--ui-text)]">Checklist templates</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">Reusable weighted stages for new tasks.</p></div><Button ref={triggerRef} size="sm" variant="outline" onClick={() => open(items[0] ?? null)}>Manage</Button></div>
      <ul className="mt-3 divide-y divide-[var(--ui-border)]">{items.map((template) => <li key={template.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><p className="min-w-0 text-[var(--ui-text-secondary)]">{template.name} <span className="text-[var(--ui-text-muted)]">· {template.stages.length} stages · weight {getChecklistTemplateWeight(template)} · {template.archivedAt ? "Archived" : "Active"}</span></p><button type="button" className="text-sm font-medium text-[var(--ui-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => open(template)}>Manage</button></li>)}</ul>
    </section>
    <Drawer isOpen={isOpen} onClose={close} initialFocusRef={closeRef} returnFocusRef={triggerRef} title="Checklist templates" description="Create and manage reusable task checklists" className="w-full max-w-[34rem]">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--ui-text-muted)]">Studio templates</p><h2 className="mt-1 text-xl font-semibold text-[var(--ui-text)]">Checklist templates</h2></div><Button ref={closeRef} type="button" size="sm" variant="ghost" className="size-11 shrink-0 p-0" onClick={close} aria-label="Close checklist templates"><X className="size-4" /></Button></header>
      <main className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">{error ? <p role="alert" className="rounded-[var(--ui-radius-control)] border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}<div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => open(null)}><Plus className="mr-1 size-4" />New template</Button>{items.map((template) => <Button key={template.id} type="button" size="sm" variant={draft?.id === template.id ? "default" : "outline"} onClick={() => { if (!isDirty || window.confirm("Discard unsaved checklist template changes?")) open(template); }}>{template.name}</Button>)}</div>{draft ? <TemplateEditor draft={draft} setDraft={setDraft} isSaving={isSaving} onArchive={() => selected && void toggleArchive(selected)} archived={Boolean(selected?.archivedAt)} /> : null}</main>
      <footer className="border-t border-[var(--ui-border)] bg-[var(--ui-surface)] px-5 py-4"><Button type="button" onClick={() => void save()} disabled={!draft || isSaving}>{isSaving ? "Saving…" : "Save template"}</Button></footer>
    </Drawer>
  </>;
}

function TemplateEditor({ archived, draft, isSaving, onArchive, setDraft }: { archived: boolean; draft: Draft; isSaving: boolean; onArchive: () => void; setDraft: (draft: Draft) => void }) {
  return <div className="space-y-4"><label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text)]">Template name<Input value={draft.name} maxLength={120} disabled={isSaving} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><div><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[var(--ui-text)]">Stages</h3><Button type="button" size="sm" variant="ghost" disabled={isSaving} onClick={() => setDraft({ ...draft, stages: [...draft.stages, createStage()] })}><Plus className="mr-1 size-4" />Add stage</Button></div><ul className="mt-2 divide-y divide-[var(--ui-border)] border-y border-[var(--ui-border)]">{draft.stages.map((stage, index) => <li key={stage.id} className="flex flex-wrap items-center gap-2 py-2"><Input value={stage.title} maxLength={200} disabled={isSaving} className="min-w-0 flex-1" placeholder="Stage title" onChange={(event) => setDraft({ ...draft, stages: draft.stages.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); setDraft({ ...draft, stages: [...draft.stages, createStage()] }); } }} /><Input type="number" min="1" max="1000" step="1" inputMode="numeric" value={stage.weight} disabled={isSaving} className="w-20" aria-label={`${stage.title || "Stage"} weight`} onChange={(event) => setDraft({ ...draft, stages: draft.stages.map((item, itemIndex) => itemIndex === index ? { ...item, weight: Number(event.target.value) } : item) })} /><Button type="button" size="sm" variant="ghost" disabled={isSaving || draft.stages.length === 1} className="size-11 p-0 text-red-700" aria-label={`Remove ${stage.title || "stage"}`} onClick={() => setDraft({ ...draft, stages: draft.stages.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="size-4" /></Button></li>)}</ul></div>{draft.id ? <Button type="button" size="sm" variant="outline" disabled={isSaving} onClick={onArchive}>{archived ? "Restore template" : "Archive template"}</Button> : null}</div>;
}
