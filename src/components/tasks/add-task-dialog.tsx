"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { createProjectTask } from "@/app/(app)/projects/[projectId]/task-actions";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea, inputClassName } from "@/components/ui/form-field";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { getTaskPriorityLabel } from "@/lib/tasks";
import type { TaskActionState } from "@/lib/validation/task";
import { TASK_PRIORITY_VALUES } from "@/types/tasks";
import type { ProjectAttributionMode } from "@/lib/productivity";
import { cloneChecklistTemplateStages, getChecklistTemplateWeight, isChecklistTemplateDraftCustomized, type ChecklistTemplateStage, type StudioChecklistTemplate } from "@/lib/studio-checklist-templates";

export function AddTaskDialog({
  members,
  projectId,
  attributionMode,
  templates,
}: {
  members: AssignableProjectMember[];
  projectId: string;
  attributionMode: ProjectAttributionMode;
  templates: StudioChecklistTemplate[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const hasSubmittedRef = useRef(false);
  const action = createProjectTask.bind(null, projectId);
  const [state, formAction, isPending] = useActionState<TaskActionState, FormData>(action, {});
  const [templateId, setTemplateId] = useState("");
  const [checklistItems, setChecklistItems] = useState<ChecklistTemplateStage[]>([]);
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const selectedTemplate = templates.find((template) => template.id === templateId);
  const isCustomized = templateId !== "" && isChecklistTemplateDraftCustomized(selectedTemplate, checklistItems);
  const totalWeight = getChecklistTemplateWeight({ stages: checklistItems });

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      dialogRef.current?.close();
    }
    if (state.success || state.formError || state.fieldErrors) hasSubmittedRef.current = false;
  }, [state]);

  return (
    <>
      <Button size="sm" onClick={() => { setTemplateId(""); setChecklistItems([]); setIsCustomizerOpen(false); dialogRef.current?.showModal(); }}>Add task</Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="add-task-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(92vw,34rem)] overflow-y-auto rounded-[var(--ui-radius-drawer)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-0 text-[var(--ui-text)] shadow-2xl backdrop:bg-[var(--ui-overlay)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--ui-border-subtle)] px-5 py-4">
          <div>
            <h2 id="add-task-title" className="font-semibold">Add task</h2>
            <p className="mt-0.5 text-sm text-[var(--ui-text-muted)]">Assign focused work to a project member.</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => dialogRef.current?.close()} aria-label="Close add task dialog">Close</Button>
        </div>
        <form ref={formRef} action={formAction} onSubmit={(event) => { if (hasSubmittedRef.current) event.preventDefault(); else hasSubmittedRef.current = true; }} className="space-y-4 p-5">
          <FormField label="Title" error={state.fieldErrors?.title}>
            <Input name="title" required maxLength={200} disabled={isPending} />
          </FormField>
          <FormField label="Description" optional error={state.fieldErrors?.description}>
            <Textarea name="description" rows={3} maxLength={5000} disabled={isPending} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Assignee" error={state.fieldErrors?.assignee_id}>
              <select name="assignee_id" required defaultValue="" disabled={isPending || members.length === 0} className={inputClassName}>
                <option value="" disabled>Select a project member</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}{member.job_title ? ` — ${member.job_title}` : ""}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select name="priority" defaultValue="normal" disabled={isPending} className={inputClassName}>
                {TASK_PRIORITY_VALUES.map((priority) => <option key={priority} value={priority}>{getTaskPriorityLabel(priority)}</option>)}
              </select>
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Due date" optional error={state.fieldErrors?.due_date}>
              <Input type="date" name="due_date" disabled={isPending} />
            </FormField>
            <FormField label="Task area" optional error={state.fieldErrors?.completed_area_m2}>
              <Input type="number" name="completed_area_m2" min="0.01" step="0.01" inputMode="decimal" placeholder="m²" disabled={isPending} aria-describedby="completed-area-help" />
              <p id="completed-area-help" className="text-xs font-normal leading-5 text-[var(--ui-text-muted)]">Used by Area progress and credited to the assignee when this task is completed.</p>
            </FormField>
          </div>
          <p className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-3 py-2 text-xs leading-5 text-[var(--ui-text-secondary)]">{attributionMode === "task_level" ? "This project uses task-level attribution. Only tasks with task area add m² credit." : "Adding task area opts this whole project into task-level attribution. The project-completion fallback will not be used."}</p>
          <section aria-labelledby="checklist-template-heading" className="border-t border-[var(--ui-border-subtle)] pt-4">
            <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 id="checklist-template-heading" className="text-sm font-medium text-[var(--ui-text)]">Checklist template</h3><p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">Optional weighted stages. You can edit this draft before creating the task.</p></div></div>
            <label className="mt-3 grid gap-1 text-sm font-medium text-[var(--ui-text-secondary)]"><span className="sr-only">Checklist template</span><select value={templateId} disabled={isPending} onChange={(event) => { const nextTemplateId = event.target.value; if (templateId && nextTemplateId !== templateId && isCustomized && !window.confirm("Changing the template will replace your checklist edits. Continue?")) return; const nextTemplate = templates.find((template) => template.id === nextTemplateId); setTemplateId(nextTemplateId); setChecklistItems(cloneChecklistTemplateStages(nextTemplate)); setIsCustomizerOpen(false); }} className={inputClassName}><option value="">No checklist template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
            <input type="hidden" name="checklist_items" value={JSON.stringify(checklistItems.map(({ title, weight }) => ({ title, weight })))} />
            {selectedTemplate ? <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-3 py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 text-sm font-medium text-[var(--ui-text)]">{selectedTemplate.name} <span className="font-normal text-[var(--ui-text-muted)]">· {checklistItems.length} stages · total weight {totalWeight}</span>{isCustomized ? <span className="ml-2 text-xs font-medium text-[var(--ui-warning-text)]">Customized</span> : null}</p><Button type="button" size="sm" variant="outline" disabled={isPending} aria-expanded={isCustomizerOpen} onClick={() => setIsCustomizerOpen((open) => !open)}>{isCustomizerOpen ? "Collapse" : "Customize"}</Button></div>{isCustomizerOpen ? <ul className="mt-3 divide-y divide-[var(--ui-border)] border-y border-[var(--ui-border)]">{checklistItems.map((item, index) => <li key={item.id} className="flex min-w-0 flex-wrap items-center gap-2 py-2"><label className="min-w-0 flex-1"><span className="sr-only">Checklist item title</span><Input value={item.title} maxLength={200} disabled={isPending} onChange={(event) => setChecklistItems((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, title: event.target.value } : candidate))} /></label><label className="flex w-20 items-center gap-1 text-xs text-[var(--ui-text-muted)]"><span className="sr-only">Checklist item weight</span><Input type="number" min="1" max="1000" step="1" inputMode="numeric" value={item.weight} disabled={isPending} onChange={(event) => setChecklistItems((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, weight: Number(event.target.value) } : candidate))} /><span aria-hidden="true">wt</span></label><Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setChecklistItems((current) => current.filter((_, candidateIndex) => candidateIndex !== index))} className="size-11 shrink-0 p-0 text-[var(--ui-danger-text)]" aria-label={`Remove ${item.title} from checklist template`}><Trash2 className="size-4" aria-hidden="true" /></Button></li>)}</ul> : null}</div> : null}
            {state.fieldErrors?.checklist_items ? <p role="alert" className="mt-2 text-sm text-[var(--ui-danger-text)]">{state.fieldErrors.checklist_items}</p> : null}
          </section>
          {members.length === 0 ? <p role="alert" className="rounded-xl bg-[var(--ui-warning-surface)] p-3 text-sm text-[var(--ui-warning-text)]">Assign at least one active team member before creating a task.</p> : null}
          {state.formError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{state.formError}</p> : null}
          <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-[var(--ui-border-subtle)] bg-[var(--ui-surface)] px-5 pt-4 pb-1">
            <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending || members.length === 0}>{isPending ? "Creating…" : "Create task"}</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
