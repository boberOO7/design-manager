"use client";

import styles from "./task-corrections.module.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, CalendarDays, Pencil, Plus, Undo2, Check, ChevronDown } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField, Textarea } from "@/components/ui/form-field";
import { DatePicker } from "@/components/ui/date-picker";
import { TaskPersonSelect } from "./task-person-select";
import { TaskReviewerEditor } from "./task-reviewer-editor";
import { TaskReviewSection } from "./task-review-section";
import { isTaskStatusMutationResult } from "@/lib/task-status-mutation";
import { getActiveCorrection, correctionReviewTask } from "@/lib/task-corrections";
import { getTaskReviewerIds } from "@/lib/task-reviews";
import { taskReviewCandidatesSchema } from "@/lib/validation/task-review";
import type { TaskCorrectionAction } from "@/lib/validation/task-correction";
import type { ProjectTask, TaskCorrection } from "@/types/tasks";
import { formatDate, formatDateOnlyDayMonth, formatDateShort } from "@/lib/utils";

const correctionEventSchema = z.object({ from: z.object({ description: z.string(), assignee_id: z.string(), due_date: z.string().nullable(), status: z.string(), reviewer_ids: z.array(z.string()) }).nullable(), to: z.object({ description: z.string(), assignee_id: z.string(), due_date: z.string().nullable(), status: z.string(), reviewer_ids: z.array(z.string()) }) });

export function TaskCorrectionsSection({ task, currentUserId, canManageTasks, isReadOnly, canCancelCompletion, disabled, onPendingChange, onUpdated }: {
  task: ProjectTask; currentUserId: string; canManageTasks: boolean; isReadOnly: boolean; disabled: boolean;
  canCancelCompletion: boolean;
  onPendingChange: (value: boolean) => void; onUpdated: (task: ProjectTask) => void;
}) {
  const t = useTranslations("Tasks");
  const statusT = useTranslations("Status");
  const locale = useLocale();
  const router = useRouter();
  const active = getActiveCorrection(task);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState(task.assignee_id ?? currentUserId);
  const [dueDate, setDueDate] = useState("");
  const [reviewerIds, setReviewerIds] = useState<string[]>(getTaskReviewerIds(task));
  const [people, setPeople] = useState<z.infer<typeof taskReviewCandidatesSchema>["reviewers"]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = !isReadOnly && (canManageTasks || task.assignee_id === currentUserId);
  const canWork = !isReadOnly && (canManageTasks || active?.assignee_id === currentUserId);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    void fetch(`/api/tasks/${task.id}/corrections`, { signal: controller.signal }).then(async response => {
      const parsed = taskReviewCandidatesSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error(t("reviewLoadFailed"));
      setPeople(parsed.data.reviewers);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t("updateFailed")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, task.id, t]);

  async function mutate(action: TaskCorrectionAction) {
    if (disabled) return;
    onPendingChange(true); setError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}/corrections`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null || !("success" in result) || !result.success || !("task" in result)) {
        throw new Error(typeof result === "object" && result !== null && "formError" in result && typeof result.formError === "string" ? result.formError : t("updateFailed"));
      }
      if (!isTaskStatusMutationResult(result) || !result.success) throw new Error(t("updateFailed"));
      onUpdated(result.task); setOpen(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("updateFailed")); }
    finally { onPendingChange(false); }
  }
  function edit() {
    setDescription(active?.description ?? ""); setAssigneeId(active?.assignee_id ?? task.assignee_id ?? currentUserId);
    setDueDate(active?.due_date ?? ""); setReviewerIds(active?.reviewer_ids ?? getTaskReviewerIds(task)); setError(null); setOpen(true);
  }
  const knownPeople = new Map([task.assignee,task.creator,...(task.reviewers ?? []).map(step => step.reviewer),
    ...(task.corrections ?? []).flatMap(c => [c.assignee,c.creator,...c.events.map(event => event.actor)]),
    ...(task.review_rounds ?? []).flatMap(round => (round.reviewers ?? []).map(step => step.reviewer)),
  ].flatMap(person => person ? [[person.id,person.full_name] as const] : []));
  function eventChanges(event: TaskCorrection["events"][number]): string[] {
    const parsed = correctionEventSchema.safeParse(event.changes);
    if (!parsed.success) return [];
    const { from,to } = parsed.data;
    if (!from) return [t("correctionCreated")];
    const changes: string[] = [];
    if (from.status !== to.status) changes.push(to.status === "closed" ? t("correctionHistoryClosed") : statusT(to.status === "in_progress" ? "inProgress" : to.status));
    if (from.description !== to.description) changes.push(`${t("description")}: ${from.description} → ${to.description}`);
    if (from.assignee_id !== to.assignee_id) changes.push(`${t("assignee")}: ${knownPeople.get(from.assignee_id) ?? t("unknown")} → ${knownPeople.get(to.assignee_id) ?? t("unknown")}`);
    if (from.due_date !== to.due_date) changes.push(`${t("dueDate")}: ${from.due_date ? formatDateOnlyDayMonth(from.due_date,locale) : t("noDueDate")} → ${to.due_date ? formatDateOnlyDayMonth(to.due_date,locale) : t("noDueDate")}`);
    if (JSON.stringify(from.reviewer_ids) !== JSON.stringify(to.reviewer_ids)) changes.push(`${t("reviewers")}: ${to.reviewer_ids.map(id => knownPeople.get(id) ?? t("unknown")).join(" → ")}`);
    return changes;
  }
  if (task.status !== "completed" && !task.corrections?.length) return null;
  return <section aria-label={t("corrections")} className="space-y-3 border-t border-[var(--ui-border-subtle)] pt-4">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{t(active ? "correction" : "corrections")}</h3>
      {active ? <span className="text-xs text-[var(--ui-text-muted)]">{statusT(active.status === "in_progress" ? "inProgress" : active.status)}</span> : null}
    </div>
    {!active && task.status === "completed" && !isReadOnly && !open && (canCreate || canManageTasks && canCancelCompletion) ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {canCreate ? <Button size="compact" disabled={disabled} onClick={edit}><Plus className="size-4" aria-hidden="true" />{t("createCorrection")}</Button> : null}
      {canManageTasks && canCancelCompletion ? <Button size="compact" variant="outline" disabled={disabled} onClick={() => { if (window.confirm(t("cancelCompletionConfirm"))) void mutate({ action: "cancel_completion" }); }}><Undo2 className="size-4" aria-hidden="true" />{t("cancelCompletion")}</Button> : null}
    </div> : null}
    {active && !open ? <div className="space-y-3 text-sm">
      <p className="whitespace-pre-wrap break-words">{active.description}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ui-text-secondary)]">
        <span>{active.assignee?.full_name ?? t("unassigned")}</span>
        {active.due_date ? <span className="inline-flex items-center gap-1" aria-label={`${t("dueDate")}: ${formatDate(active.due_date,locale)}`}><CalendarDays className="size-3.5" aria-hidden="true" />{formatDateOnlyDayMonth(active.due_date,locale)}</span> : null}
      </div>
      {canWork && active.status === "in_progress" ? <div className="flex flex-wrap gap-2">
        <Button size="compact" disabled={disabled} onClick={() => void mutate({ action: "submit", correction_id: active.id })}><ArrowUpRight className="size-4" aria-hidden="true" />{t("correctionSubmit")}</Button>
        <Button size="compact" variant="outline" disabled={disabled} onClick={edit}><Pencil className="size-3.5" aria-hidden="true" />{t("change")}</Button>
      </div> : null}
      {canWork && active.status === "review" ? <div className="flex flex-wrap gap-2">
        <Button size="compact" disabled={disabled} onClick={() => void mutate({ action: "complete", correction_id: active.id })}><Check className="size-4" aria-hidden="true" />{t("correctionComplete")}</Button>
        <Button size="compact" variant="outline" disabled={disabled} onClick={() => void mutate({ action: "resume", correction_id: active.id })}><Undo2 className="size-4" aria-hidden="true" />{t("correctionResume")}</Button>
      </div> : null}
    </div> : null}
    <div className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`} inert={!open} aria-hidden={!open}><div className="min-h-0 overflow-hidden"><form className="space-y-3 pb-2" onSubmit={event => { event.preventDefault(); void mutate({ ...(active ? { action: "update", correction_id: active.id } : { action: "create" }), description, assignee_id: assigneeId, due_date: dueDate || null, reviewer_ids: reviewerIds }); }}>
      <FormField label={t("description")}><Textarea value={description} onChange={event => setDescription(event.target.value)} required maxLength={5000} rows={2} disabled={disabled} /></FormField>
      <FormField label={t("assignee")}><TaskPersonSelect people={people} value={assigneeId} label={t("assignee")} disabled={disabled || loading || !canManageTasks} onChange={setAssigneeId} /></FormField>
      <FormField label={t("dueDate")}><DatePicker value={dueDate} onValueChange={setDueDate} locale={locale} disabled={disabled} /></FormField>
      <FormField label={t("reviewers")}><TaskReviewerEditor reviewers={people} selectedIds={reviewerIds} disabled={disabled || loading || !canManageTasks} onChange={setReviewerIds} /></FormField>
      {!canManageTasks && !reviewerIds.length ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("correctionReviewRequired")}</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setOpen(false)}>{t("cancel")}</Button><Button type="submit" size="sm" disabled={disabled || loading || !description.trim() || !reviewerIds.length}>{t(active ? "saveChanges" : "createCorrection")}</Button></div>
    </form></div></div>
    {task.corrections?.length ? <details className={`${styles.history} border-t border-[var(--ui-border-subtle)] text-xs text-[var(--ui-text-secondary)]`}>
      <summary className="cursor-pointer py-2 font-medium">{t("correctionsHistory", { count: task.corrections.length })}</summary>
      <div className="divide-y divide-[var(--ui-border-subtle)]">
        {[...task.corrections].sort((a,b) => b.created_at.localeCompare(a.created_at)).map(correction => <details key={correction.id} className={`${styles.history} group/correction`} data-correction-history-entry>
          <summary className="flex cursor-pointer list-none items-start gap-3 rounded-[var(--ui-radius-control)] py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1 space-y-1">
              <span className="line-clamp-2 break-words font-medium text-[var(--ui-text)] group-open/correction:line-clamp-none">{correction.description}</span>
              <span className="flex flex-wrap gap-x-1 text-[var(--ui-text-muted)]">
                <span>{correction.assignee?.full_name ?? t("unassigned")}</span><span aria-hidden="true">·</span><time dateTime={correction.closed_at ?? correction.created_at}>{formatDate(correction.closed_at ?? correction.created_at,locale)}</time>
              </span>
            </span>
            <span className="shrink-0 text-[var(--ui-text-muted)]">{correction.status === "closed" ? t("correctionHistoryClosed") : statusT(correction.status === "in_progress" ? "inProgress" : correction.status)}</span>
            <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-[var(--ui-text-muted)] transition-transform duration-200 group-open/correction:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </summary>
          <div className="space-y-3 pb-3">
            <ol className="space-y-2">{[...correction.events].sort((a,b) => a.created_at.localeCompare(b.created_at)).map(event => {
              const changes = eventChanges(event);
              return changes.length ? <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="whitespace-pre-wrap break-words">{changes.join(" · ")}</span>
                <span className="text-[var(--ui-text-muted)]">{event.actor?.full_name ?? t("unknown")} · {formatDateShort(event.created_at,locale)}</span>
              </li> : null;
            })}</ol>
            {task.review_rounds?.some(round => round.correction_id === correction.id && round.completed_at) ? <ol className="space-y-2 border-t border-[var(--ui-border-subtle)] pt-2">
              {task.review_rounds.filter(round => round.correction_id === correction.id && round.completed_at).sort((a,b) => a.round_number - b.round_number).map(round => <li key={round.id} title={t("reviewRound", { number: round.round_number })}>
                <p>{t(round.result === "approved" ? "reviewApproved" : "reviewRework")} · {round.reviewers?.filter(step => step.approved_at || step.reviewer_id === round.reviewer_id).sort((a,b) => a.position - b.position).map(step => step.reviewer?.full_name ?? t("unknown")).join(" → ") || round.reviewer?.full_name || t("unknown")}</p>
                {round.rework_comment ? <p className="mt-1 whitespace-pre-wrap break-words text-[var(--ui-text-muted)]">{round.rework_comment}</p> : null}
              </li>)}
            </ol> : null}
          </div>
        </details>)}
      </div>
    </details> : null}
    {active?.status === "internal_review" ? <TaskReviewSection task={correctionReviewTask(task,active)} correctionId={active.id} canManageTasks={canManageTasks} currentUserId={currentUserId} isEditing={false} isReadOnly={isReadOnly} disabled={disabled} reviewerIds={active.reviewer_ids} onReviewersChange={() => {}} onPendingChange={onPendingChange} onUpdated={updated => { onUpdated(updated); router.refresh(); }} /> : null}
    {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
  </section>;
}
