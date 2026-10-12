"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { TaskReviewerEditor } from "./task-reviewer-editor";
import { getActiveTaskReview, getTaskReviewerIds } from "@/lib/task-reviews";
import { taskReviewCandidatesSchema } from "@/lib/validation/task-review";
import type { ProjectTask } from "@/types/tasks";

export function BulkTaskReviewerEditor({ tasks, disabled, onApply }: { tasks: ProjectTask[]; disabled: boolean; onApply: (reviewerIds: string[]) => Promise<void> }) {
  const t = useTranslations("Tasks");
  const [reviewerIds, setReviewerIds] = useState(() => {
    const ids = tasks[0] ? getTaskReviewerIds(tasks[0]) : [];
    return tasks.every((task) => JSON.stringify(getTaskReviewerIds(task)) === JSON.stringify(ids)) ? ids : [];
  });
  const [reviewers, setReviewers] = useState<z.infer<typeof taskReviewCandidatesSchema>["reviewers"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const taskId = tasks[0]?.id;
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    void fetch(`/api/tasks/${encodeURIComponent(taskId)}/review`).then(async (response) => {
      const result = taskReviewCandidatesSchema.safeParse(await response.json());
      if (!response.ok || !result.success) throw new Error("Unable to load reviewers");
      if (!cancelled) setReviewers(result.data.reviewers);
    }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId, attempt]);
  const assigned = tasks.flatMap((task) => (task.reviewers ?? []).flatMap((assignment) => assignment.reviewer ? [assignment.reviewer] : []));
  const options = [...new Map([...assigned, ...reviewers].map((reviewer) => [reviewer.id, reviewer])).values()];
  const active = tasks.length === 1 ? getActiveTaskReview(tasks[0]) : null;
  const lockedCount = active?.reviewers?.filter(step => step.approved_at).length ?? 0;
  return <div className="@container space-y-3 p-2">
    <TaskReviewerEditor reviewers={options} selectedIds={reviewerIds} lockedCount={lockedCount} disabled={disabled || loading || error} onChange={setReviewerIds} />
    {error ? <div className="space-y-2"><p role="alert" className="text-xs text-[var(--ui-danger-text)]">{t("reviewLoadFailed")}</p><Button type="button" variant="outline" size="sm" onClick={() => setAttempt((current) => current + 1)}>{t("reviewRetry")}</Button></div> : null}
    <Button type="button" className="w-full" disabled={disabled || loading || error || !taskId || Boolean(active && reviewerIds.length <= lockedCount)} onClick={() => void onApply(reviewerIds)}>{t(disabled ? "saving" : "bulkReviewApply")}</Button>
  </div>;
}
