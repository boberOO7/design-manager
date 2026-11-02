import { instantToDateOnly } from "@/lib/calendar";
import type { ProjectTask, TaskCorrection } from "@/types/tasks";

export function getActiveCorrection(task: Pick<ProjectTask, "corrections">): TaskCorrection | null {
  return task.corrections?.find(correction => correction.status !== "closed") ?? null;
}

/** Operational status for UI; completion and productivity remain on the original task. */
export function getTaskDisplayStatus(task: Pick<ProjectTask, "status" | "corrections">): ProjectTask["status"] {
  return task.status === "completed" ? getActiveCorrection(task)?.status ?? task.status : task.status;
}

/** A view of the cycle for existing review controls; never persisted as task status. */
export function correctionReviewTask(task: ProjectTask, correction: TaskCorrection): ProjectTask {
  const rounds = task.review_rounds?.filter(round => round.correction_id === correction.id) ?? [];
  const latest = [...rounds].sort((a,b) => b.round_number - a.round_number)[0];
  const reviewers = latest?.reviewers?.map(step => ({ task_id: task.id, reviewer_id: step.reviewer_id, position: step.position, reviewer: step.reviewer }))
    ?? task.reviewers?.filter(step => correction.reviewer_ids.includes(step.reviewer_id));
  return { ...task, status: correction.status === "closed" ? "completed" : correction.status,
    assignee_id: correction.assignee_id, requires_review: true, reviewers, reviewer_id: correction.reviewer_ids[0],
    review_rounds: rounds.map(round => ({ ...round, correction_id: null })), corrections: [] };
}

export function wasCorrectionAssignedOnDate(events: Array<Pick<TaskCorrection["events"][number], "id" | "created_at" | "changes">>, userId: string, date: string): boolean {
  const ordered = [...events].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return ordered.some((event,index) => {
    const changes = event.changes;
    const to = changes && typeof changes === "object" && !Array.isArray(changes) ? changes.to : null;
    return to && typeof to === "object" && !Array.isArray(to) && to.assignee_id === userId
      && instantToDateOnly(event.created_at) <= date
      && (!ordered[index + 1] || instantToDateOnly(ordered[index + 1].created_at) >= date);
  });
}
