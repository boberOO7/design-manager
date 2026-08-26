import { calculateTaskProgress, type ProjectTaskForProgress } from "@/lib/project-progress";

type BoardTaskProgressInput = Pick<ProjectTaskForProgress, "status" | "manual_progress_override" | "production_completion" | "checklist_items">;

export type BoardTaskProgressSummary =
  | { kind: "checklist"; completed: number; total: number; percent: number }
  | { kind: "manual"; percent: number };

export function getBoardTaskProgressSummary(task: BoardTaskProgressInput): BoardTaskProgressSummary | null {
  if (task.status !== "in_progress") return null;

  const progress = calculateTaskProgress(task);
  if (progress.source === "status") return null;
  return progress.source === "checklist"
    ? {
        kind: "checklist",
        completed: progress.completedChecklistCount,
        total: progress.checklistCount,
        percent: progress.presentedProductionPercent,
      }
    : { kind: "manual", percent: progress.presentedProductionPercent };
}
