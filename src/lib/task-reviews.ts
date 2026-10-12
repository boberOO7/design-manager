import type { ProjectTask, TaskReviewRound } from "@/types/tasks";

export function canConfigureTaskReview(task: Pick<ProjectTask, "requires_review" | "status">) {
  return task.requires_review || ["todo", "in_progress", "internal_review"].includes(task.status);
}

export function getTaskReviewerIds(task: Pick<ProjectTask, "reviewers" | "reviewer_id">): string[] {
  return task.reviewers ? [...task.reviewers].sort((left, right) => left.position - right.position).map((reviewer) => reviewer.reviewer_id) : task.reviewer_id ? [task.reviewer_id] : [];
}

export function getLatestTaskReview(task: Pick<ProjectTask, "review_rounds">): TaskReviewRound | null {
  return (task.review_rounds ?? []).reduce<TaskReviewRound | null>((latest, round) => !latest || round.round_number > latest.round_number ? round : latest, null);
}

export function getActiveTaskReview(task: Pick<ProjectTask, "status" | "review_rounds">): TaskReviewRound | null {
  const latest = getLatestTaskReview(task);
  return task.status === "internal_review" && latest && !latest.completed_at ? latest : null;
}

export function isTaskInRework(task: Pick<ProjectTask, "status" | "review_rounds">): boolean {
  return task.status === "in_progress" && getLatestTaskReview(task)?.result === "rework";
}
