"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { taskReviewCandidatesSchema as reviewersSchema } from "@/lib/validation/task-review";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField, Textarea } from "@/components/ui/form-field";
import { TaskReviewerEditor } from "./task-reviewer-editor";
import { TaskFieldLabel } from "./task-field-label";
import { TaskReviewWaiting } from "./task-review-badge";
import { getActiveTaskReview, getLatestTaskReview } from "@/lib/task-reviews";
import { cn, formatDate } from "@/lib/utils";
import type { TaskReviewAction } from "@/lib/validation/task-review";
import type { TaskStatusMutationResult } from "@/lib/task-status-mutation";
import type { ProjectTask } from "@/types/tasks";

function isReviewResponse(value: unknown): value is TaskStatusMutationResult {
  return typeof value === "object" && value !== null && "success" in value;
}

export function TaskReviewSection({ task, canManageTasks, currentUserId, isEditing, isReadOnly, disabled, reviewerIds, onReviewersChange, fieldError, onPendingChange, onUpdated, className }: {
  task: ProjectTask;
  canManageTasks: boolean;
  currentUserId: string;
  isEditing: boolean;
  isReadOnly: boolean;
  disabled: boolean;
  reviewerIds: string[];
  onReviewersChange: (reviewerIds: string[]) => void;
  fieldError?: string;
  onPendingChange: (pending: boolean) => void;
  onUpdated: (task: ProjectTask, projectStatus: string) => void;
  className?: string;
}) {
  const t = useTranslations("Tasks");
  const locale = useLocale();
  const active = getActiveTaskReview(task);
  const latest = getLatestTaskReview(task);
  const [showRework, setShowRework] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reviewers, setReviewers] = useState<z.infer<typeof reviewersSchema>["reviewers"]>([]);
  const [loadingReviewers, setLoadingReviewers] = useState(false);
  const [reviewerLoadAttempt, setReviewerLoadAttempt] = useState(0);
  const canConfigure = canManageTasks && isEditing && !isReadOnly && !active;
  const completed = (task.review_rounds ?? []).filter((round) => round.completed_at).sort((left, right) => right.round_number - left.round_number);
  const assignedReviewers = [...(task.reviewers ?? [])].sort((left, right) => left.position - right.position).flatMap((assignment) => assignment.reviewer ? [assignment.reviewer] : []);
  const reviewerOptions = [...new Map([...assignedReviewers, ...reviewers].map((reviewer) => [reviewer.id, reviewer])).values()];
  const activeSteps = [...(active?.reviewers ?? [])].sort((left, right) => left.position - right.position);

  useEffect(() => {
    if (!canConfigure) return;
    let cancelled = false;
    setLoadingReviewers(true);
    setError(null);
    void fetch(`/api/tasks/${encodeURIComponent(task.id)}/review`).then(async (response) => {
      const result = reviewersSchema.safeParse(await response.json());
      if (!response.ok || !result.success) throw new Error(t("reviewLoadFailed"));
      if (!cancelled) setReviewers(result.data.reviewers);
    }).catch(() => { if (!cancelled) setError(t("reviewLoadFailed")); })
      .finally(() => { if (!cancelled) setLoadingReviewers(false); });
    return () => { cancelled = true; };
  }, [canConfigure, task.id, t, reviewerLoadAttempt]);

  async function mutate(action: TaskReviewAction) {
    if (disabled) return;
    setError(null);
    onPendingChange(true);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/review`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !isReviewResponse(result) || !result.success) {
        throw new Error(isReviewResponse(result) && !result.success ? result.formError : t("updateFailed"));
      }
      onUpdated(result.task, result.projectStatus);
      setComment("");
      setShowRework(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("updateFailed"));
    } finally { onPendingChange(false); }
  }

  if (!task.requires_review && !latest && !canConfigure) return null;
  return <section aria-labelledby="task-review-title" className={cn("border-b border-[var(--ui-border-subtle)] pb-4", active && "rounded-[var(--ui-radius-control)] border-0 bg-[var(--ui-surface-subtle)] p-4", className)}>
    <h3 id="task-review-title" className={cn("flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]", canConfigure && "sr-only")}><ShieldCheck aria-hidden="true" className={cn("size-4", active ? "text-[var(--ui-info-text)]" : "text-[var(--ui-text-muted)]")} />{active ? t("reviewRound", { number: active.round_number }) : t("reviewSection")}</h3>
    {canConfigure ? <div className="space-y-2">
      <FormField as="div" label={<TaskFieldLabel label={t("reviewers")} icon={ShieldCheck} help={t("reviewSelectionHelp")} />} error={fieldError}>
        <TaskReviewerEditor reviewers={reviewerOptions} selectedIds={reviewerIds} disabled={disabled || loadingReviewers || !task.requires_review && !["todo", "in_progress"].includes(task.status)} onChange={onReviewersChange} />
      </FormField>
      {error === t("reviewLoadFailed") ? <Button type="button" size="sm" variant="outline" disabled={loadingReviewers} onClick={() => setReviewerLoadAttempt((attempt) => attempt + 1)}>{t("reviewRetry")}</Button> : null}
    </div> : task.requires_review ? <p className="mt-2 text-sm text-[var(--ui-text-secondary)]">{t(active ? "reviewer" : "reviewers")}: <span className="font-medium text-[var(--ui-text)]">{active ? active.reviewer?.full_name ?? t("unknown") : assignedReviewers.map((reviewer) => reviewer.full_name).join(" → ") || task.reviewer?.full_name || t("unassigned")}</span></p> : null}
    {active ? <div className="mt-2 space-y-3">
      <TaskReviewWaiting submittedAt={active.submitted_at} />
      {activeSteps.length > 1 ? <ol aria-label={t("reviewSequence")} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--ui-text-muted)]">
        {activeSteps.map((step, index) => <li key={step.reviewer_id} className={step.reviewer_id === active.reviewer_id ? "font-medium text-[var(--ui-text)]" : undefined}>{index ? <span aria-hidden="true" className="mr-2">→</span> : null}{step.approved_at ? <span aria-label={t("reviewApproved")}>✓ </span> : null}{step.reviewer?.full_name ?? t("unknown")}</li>)}
      </ol> : null}
      {!isReadOnly && (canManageTasks || active.reviewer_id === currentUserId) ? <>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={disabled} onClick={() => void mutate({ action: "approved", round_id: active.id, reviewer_id: active.reviewer_id })}>{t("reviewApprove")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} aria-expanded={showRework} aria-controls="task-review-rework" onClick={() => setShowRework((shown) => !shown)}>{t("reviewSendBack")}</Button>
        </div>
        <div id="task-review-rework" className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${showRework ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`} inert={!showRework}>
          <div className="min-h-0 overflow-hidden"><form onSubmit={(event) => { event.preventDefault(); if (comment.trim()) void mutate({ action: "rework", round_id: active.id, reviewer_id: active.reviewer_id, comment }); }} className="space-y-2">
            <FormField label={t("reviewFixComment")}><Textarea value={comment} onChange={(event) => setComment(event.target.value)} required maxLength={5000} rows={2} disabled={disabled} className="min-h-20 resize-y" /></FormField>
            <Button type="submit" size="sm" variant="outline" disabled={disabled || !comment.trim()}>{t("reviewConfirmRework")}</Button>
          </form></div>
        </div>
      </> : null}
    </div> : <>
      {latest?.completed_at ? <div className="mt-2 text-sm text-[var(--ui-text-secondary)]">
        <p>{t("reviewPrevious", { number: latest.round_number, result: t(latest.result === "approved" ? "reviewApproved" : "reviewRework") })}</p>
        {latest.rework_comment ? <p className="mt-1 whitespace-pre-wrap break-words text-[var(--ui-text)]">{latest.rework_comment}</p> : null}
      </div> : null}
      {task.requires_review && task.status === "in_progress" && !isReadOnly && (canManageTasks || task.assignee_id === currentUserId) ? <Button type="button" size="sm" className="mt-3" disabled={disabled} onClick={() => void mutate({ action: "submit" })}>{t("reviewSubmit")}</Button> : null}
    </>}
    {completed.length ? <div className="mt-3">
      <button type="button" aria-expanded={showHistory} aria-controls="task-review-history" onClick={() => setShowHistory((shown) => !shown)} className="flex min-h-9 cursor-pointer items-center gap-1 text-xs font-medium text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
        {t("reviewHistory", { count: completed.length })}<ChevronDown aria-hidden="true" className={`size-3 transition-transform duration-200 motion-reduce:transition-none ${showHistory ? "rotate-180" : ""}`} />
      </button>
      <div id="task-review-history" className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${showHistory ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`} inert={!showHistory}>
        <div className="min-h-0 overflow-hidden"><ol className="divide-y divide-[var(--ui-border-subtle)]">
          {completed.map((round) => <li key={round.id} className="space-y-1 py-2 text-xs text-[var(--ui-text-secondary)]">
            <p className="font-medium">{t("reviewRound", { number: round.round_number })} · {t(round.result === "approved" ? "reviewApproved" : "reviewRework")}</p>
            <p>{round.reviewer?.full_name ?? t("unknown")} · {formatDate(round.submitted_at, locale)} → {round.completed_at ? formatDate(round.completed_at, locale) : ""}</p>
            {(round.reviewers?.length ?? 0) > 1 ? <p>{[...(round.reviewers ?? [])].sort((left, right) => left.position - right.position).map((reviewer) => `${reviewer.approved_at ? "✓ " : ""}${reviewer.reviewer?.full_name ?? t("unknown")}`).join(" → ")}</p> : null}
            {round.rework_comment ? <p className="whitespace-pre-wrap break-words text-sm text-[var(--ui-text)]">{round.rework_comment}</p> : null}
          </li>)}
        </ol></div>
      </div>
    </div> : null}
    {error ? <p role="alert" className="mt-2 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
  </section>;
}
