import { isProjectProgressStage } from "./project-progress";
import { TASK_STAGES, type TaskStage } from "./task-stages";

export const PROJECT_LIFECYCLE_STATUSES = ["planned", "active", "paused", "completed", "archived"] as const;
export type ProjectLifecycleStatus = (typeof PROJECT_LIFECYCLE_STATUSES)[number];
export const OPERATIONAL_PROJECT_STATUSES = ["planned", "active"] as const;
export type ProjectLifecycleAction = "start" | "pause" | "resume" | "complete" | "reopen" | "return_to_planned";

const targetByAction: Record<ProjectLifecycleAction, ProjectLifecycleStatus> = {
  start: "active", pause: "paused", resume: "active", complete: "completed", reopen: "active", return_to_planned: "planned",
};

export function isProjectLifecycleStatus(value: string): value is ProjectLifecycleStatus {
  return value === "planned" || value === "active" || value === "paused" || value === "completed" || value === "archived";
}

/** Projects in these states participate in day-to-day work and deadline signals. */
export function isOperationalProjectStatus(status: string): status is (typeof OPERATIONAL_PROJECT_STATUSES)[number] {
  return status === "planned" || status === "active";
}

export function getLifecycleTarget(action: ProjectLifecycleAction): ProjectLifecycleStatus {
  return targetByAction[action];
}

export function getAutomaticProjectStatus(projectStatus: ProjectLifecycleStatus, taskStatus: string, taskStage = "stage_1"): ProjectLifecycleStatus {
  return projectStatus === "planned"
    && isProjectProgressStage(taskStage)
    && (taskStatus === "in_progress" || taskStatus === "internal_review" || taskStatus === "review" || taskStatus === "completed")
    ? "active"
    : projectStatus;
}

export function canWorkOnTaskInProject(input: { projectStatus: string; archivedAt?: string | null; stage: string }): boolean {
  if (input.archivedAt || input.projectStatus === "archived") return false;
  return input.projectStatus !== "completed" || !isProjectProgressStage(input.stage);
}

export function getTaskCreationStagesForProject(input: { projectStatus: string; archivedAt?: string | null }): TaskStage[] {
  return TASK_STAGES.filter((stage) => canWorkOnTaskInProject({ ...input, stage }));
}

export function getRestoredProjectStatus(hasCompletedAt: boolean): "completed" | "paused" {
  return hasCompletedAt ? "completed" : "paused";
}

export function isValidArchiveState(status: ProjectLifecycleStatus, archivedAt: string | null): boolean {
  return (status === "archived") === (archivedAt !== null);
}

export function getLifecycleCompletedAt({ from, to, completedAt, today }: {
  from: ProjectLifecycleStatus;
  to: ProjectLifecycleStatus;
  completedAt: string | null;
  today: string;
}): string | null {
  if (to === "completed" && from !== "completed") return today;
  if (from === "completed" && to === "active") return null;
  return completedAt;
}

export function canUpdateProjectMetadata(status: ProjectLifecycleStatus): boolean {
  return status !== "completed" && status !== "archived";
}

export function validateLifecycleTransition({ from, to, openTaskCount, hasProgressedEligibleTasks }: {
  from: ProjectLifecycleStatus;
  to: ProjectLifecycleStatus;
  openTaskCount: number;
  hasProgressedEligibleTasks: boolean;
}): { valid: true } | { valid: false; reason: "invalid_transition" | "open_tasks" | "progressed_tasks" } {
  if (from === "archived" || to === "archived") return { valid: false, reason: "invalid_transition" };
  if (from === "planned" && to === "active") return { valid: true };
  if (from === "active" && to === "paused") return { valid: true };
  if (from === "paused" && (to === "active" || (to === "planned" && !hasProgressedEligibleTasks))) return { valid: true };
  if ((from === "active" || from === "paused") && to === "completed") return openTaskCount === 0 ? { valid: true } : { valid: false, reason: "open_tasks" };
  if (from === "completed" && to === "active") return { valid: true };
  return { valid: false, reason: from === "paused" && to === "planned" ? "progressed_tasks" : "invalid_transition" };
}

export function countOpenLifecycleTasks(tasks: readonly { stage: string; status: string }[]): number {
  return tasks.filter((task) => isProjectProgressStage(task.stage) && task.status !== "completed" && task.status !== "cancelled").length;
}

export function hasProgressedEligibleTasks(tasks: readonly { stage: string; status: string }[]): boolean {
  return tasks.some((task) => isProjectProgressStage(task.stage) && task.status !== "cancelled" && task.status !== "todo");
}
