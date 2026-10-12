import type { TaskReviewQueueItem } from "@/data/queries/task-reviews";

export function eligibleReviewSelection(selectedIds: string[], rounds: TaskReviewQueueItem[], userId: string) {
  return rounds.filter(round => selectedIds.includes(round.id) && round.reviewer_id === userId);
}

export function toggleReviewSelection(selectedIds: string[], round: TaskReviewQueueItem, rounds: TaskReviewQueueItem[], userId: string) {
  if (round.reviewer_id !== userId) return selectedIds;
  const sameGroup = eligibleReviewSelection(selectedIds, rounds, userId).filter(selected =>
    selected.task.project.id === round.task.project.id && selected.task.stage === round.task.stage).map(selected => selected.id);
  return sameGroup.includes(round.id) ? sameGroup.filter(id => id !== round.id) : [...sameGroup, round.id];
}
