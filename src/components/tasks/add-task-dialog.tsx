"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createProjectTask } from "@/app/(app)/projects/[projectId]/task-actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import type { TaskActionState } from "@/lib/validation/task";
import { TASK_PRIORITY_VALUES } from "@/types/tasks";
import { cloneChecklistTemplateStages, getChecklistTemplateWeight, isChecklistTemplateDraftCustomized, type ChecklistTemplateStage, type StudioChecklistTemplate } from "@/lib/studio-checklist-templates";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";

export function AddTaskDialog({
  members,
  projectId,
  templates,
}: {
  members: AssignableProjectMember[];
  projectId: string;
  templates: StudioChecklistTemplate[];
}) {
  const t = useTranslations("Tasks");
  const locale = useLocale();
  const priority = useTranslations("Priority");
  const checklist = useTranslations("Checklists");
  const templatesT = useTranslations("Templates");
  const validation = useTranslations("Validation");
  const roles = useTranslations("Roles");
  const roleLabel = (value: string) => { const roleKey = getCanonicalRoleTranslationKey(value); return roleKey ? roles(roleKey) : value; };
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
      <Button size="sm" onClick={() => { setTemplateId(""); setChecklistItems([]); setIsCustomizerOpen(false); dialogRef.current?.showModal(); }}>{t("addTask")}</Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="add-task-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(92vw,34rem)] overflow-y-auto rounded-[var(--ui-radius-drawer)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-0 text-[var(--ui-text)] shadow-2xl backdrop:bg-[var(--ui-overlay)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--ui-border-subtle)] px-5 py-4">
          <div>
            <h2 id="add-task-title" className="font-semibold">{t("addTask")}</h2>
            <p className="mt-0.5 text-sm text-[var(--ui-text-muted)]">{t("addTaskDescription")}</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => dialogRef.current?.close()} aria-label={t("closeAddTask")}>{t("cancel")}</Button>
        </div>
        <form ref={formRef} action={formAction} autoComplete="off" onSubmit={(event) => { if (hasSubmittedRef.current) event.preventDefault(); else hasSubmittedRef.current = true; }} className="space-y-4 p-5">
          <FormField label={t("title")} error={state.fieldErrors?.title ? validation("correctFields") : undefined}>
            <Input name="title" required maxLength={200} disabled={isPending} autoComplete="off" />
          </FormField>
          <FormField label={t("description")} optional error={state.fieldErrors?.description ? validation("correctFields") : undefined}>
            <Textarea name="description" rows={3} maxLength={5000} disabled={isPending} autoComplete="off" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("assignee")} optional error={state.fieldErrors?.assignee_id ? validation("correctFields") : undefined}>
              <Select name="assignee_id" defaultValue="" placeholder={t("selectProjectMember")} disabled={isPending}>
                <SelectItem value="">{t("unassigned")}</SelectItem>
                {members.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name}{member.job_title ? ` — ${roleLabel(member.job_title)}` : ""}</SelectItem>)}
              </Select>
            </FormField>
            <FormField label={t("priority")}>
              <Select name="priority" defaultValue="normal" disabled={isPending}>
                {TASK_PRIORITY_VALUES.map((value) => <SelectItem key={value} value={value}>{priority(value)}</SelectItem>)}
              </Select>
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("dueDate")} optional error={state.fieldErrors?.due_date ? validation("correctFields") : undefined}>
              <DatePicker name="due_date" disabled={isPending} locale={locale} invalid={Boolean(state.fieldErrors?.due_date)} />
            </FormField>
            <FormField label={t("taskArea")} optional error={state.fieldErrors?.completed_area_m2 ? validation("correctFields") : undefined}>
              <Input type="number" name="completed_area_m2" min="0.01" step="0.01" inputMode="decimal" placeholder="m²" disabled={isPending} autoComplete="off" aria-describedby="completed-area-help" />
              <p id="completed-area-help" className="text-xs font-normal leading-5 text-[var(--ui-text-muted)]">{t("taskAreaHelp")}</p>
            </FormField>
          </div>
          <section aria-labelledby="checklist-template-heading" className="border-t border-[var(--ui-border-subtle)] pt-4">
            <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 id="checklist-template-heading" className="text-sm font-medium text-[var(--ui-text)]">{templatesT("checklistTemplate")}</h3><p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{templatesT("optionalStages")}</p></div></div>
            <label className="mt-3 grid gap-1 text-sm font-medium text-[var(--ui-text-secondary)]"><span className="sr-only">{templatesT("checklistTemplate")}</span><Select value={templateId} disabled={isPending} onValueChange={(nextTemplateId) => { if (templateId && nextTemplateId !== templateId && isCustomized && !window.confirm(templatesT("changingConfirm"))) return; const nextTemplate = templates.find((template) => template.id === nextTemplateId); setTemplateId(nextTemplateId); setChecklistItems(cloneChecklistTemplateStages(nextTemplate)); setIsCustomizerOpen(false); }}><SelectItem value="">{templatesT("noChecklistTemplate")}</SelectItem>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</Select></label>
            <input type="hidden" name="checklist_items" value={JSON.stringify(checklistItems.map(({ title, weight }) => ({ title, weight })))} />
            {selectedTemplate ? <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-3 py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 text-sm font-medium text-[var(--ui-text)]">{selectedTemplate.name} <span className="font-normal text-[var(--ui-text-muted)]">· {templatesT("stages", { count: checklistItems.length })} · {templatesT("totalWeight", { weight: totalWeight })}</span>{isCustomized ? <span className="ml-2 text-xs font-medium text-[var(--ui-warning-text)]">{templatesT("customized")}</span> : null}</p><Button type="button" size="sm" variant="outline" disabled={isPending} aria-expanded={isCustomizerOpen} onClick={() => setIsCustomizerOpen((open) => !open)}>{isCustomizerOpen ? templatesT("collapse") : templatesT("customize")}</Button></div>{isCustomizerOpen ? <ul className="mt-3 divide-y divide-[var(--ui-border)] border-y border-[var(--ui-border)]">{checklistItems.map((item, index) => <li key={item.id} className="flex min-w-0 flex-wrap items-center gap-2 py-2"><label className="min-w-0 flex-1"><span className="sr-only">{templatesT("itemTitle")}</span><Input value={item.title} maxLength={200} disabled={isPending} onChange={(event) => setChecklistItems((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, title: event.target.value } : candidate))} /></label><label className="flex w-20 items-center gap-1 text-xs text-[var(--ui-text-muted)]"><span className="sr-only">{templatesT("itemWeight")}</span><Input type="number" min="1" max="1000" step="1" inputMode="numeric" value={item.weight} disabled={isPending} onChange={(event) => setChecklistItems((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, weight: Number(event.target.value) } : candidate))} /><span aria-hidden="true">{checklist("weightAbbreviation")}</span></label><Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setChecklistItems((current) => current.filter((_, candidateIndex) => candidateIndex !== index))} className="size-11 shrink-0 p-0 text-[var(--ui-danger-text)]" aria-label={templatesT("remove", { title: item.title })}><Trash2 className="size-4" aria-hidden="true" /></Button></li>)}</ul> : null}</div> : null}
            {state.fieldErrors?.checklist_items ? <p role="alert" className="mt-2 text-sm text-[var(--ui-danger-text)]">{validation("invalidChecklistItem")}</p> : null}
          </section>
          {state.formError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{validation("correctFields")}</p> : null}
          <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-[var(--ui-border-subtle)] bg-[var(--ui-surface)] px-5 pt-4 pb-1">
            <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()} disabled={isPending}>{t("cancel")}</Button>
            <Button type="submit" disabled={isPending}>{isPending ? t("creating") : t("createTask")}</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
