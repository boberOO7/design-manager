export type ProjectHealth = "completed" | "overdue" | "needs_attention" | "deadline_soon" | "on_track";
export type StageProgressMethod = "equal" | "area" | "weighted";

export function isStageProgressMethod(value: string): value is StageProgressMethod {
  return value === "equal" || value === "area" || value === "weighted";
}

export type ChecklistItemForProgress = {
  id: string;
  is_completed: boolean;
  weight: number;
};

export type ProjectTaskForProgress = {
  id: string;
  status: string;
  priority: string;
  due_date: string | null;
  assignee_id: string | null;
  completed_area_m2: number | null;
  manual_progress_override: boolean;
  production_completion: number;
  progress_weight: number;
  checklist_items: readonly ChecklistItemForProgress[];
  stage?: string;
};

export const PROJECT_PROGRESS_STAGES = ["stage_1", "stage_2", "stage_3"] as const;
export type ProjectProgressStage = (typeof PROJECT_PROGRESS_STAGES)[number];
export type ProjectStageProgressMethods = Record<ProjectProgressStage, StageProgressMethod>;

export const DEFAULT_PROJECT_STAGE_PROGRESS_METHODS: ProjectStageProgressMethods = {
  stage_1: "equal",
  stage_2: "equal",
  stage_3: "equal",
};

export const PROJECT_PROGRESS_STAGE_WEIGHTS: Record<ProjectProgressStage, number> = {
  stage_1: 0.2,
  stage_2: 0.4,
  stage_3: 0.4,
};

export const TASK_PRODUCTION_PROGRESS_CEILING = 70;

export type StageProgress = {
  eligibleTaskCount: number;
  completedTaskCount: number;
  progressPercent: number;
  method?: StageProgressMethod;
};

export type TaskProgressSource = "manual" | "checklist" | "status";

export type TaskProgress = {
  productionPercent: number;
  overallPercent: number;
  presentedProductionPercent: number;
  presentedOverallPercent: number;
  source: TaskProgressSource;
  completedChecklistCount: number;
  checklistCount: number;
};

export type ProjectProgress = {
  eligibleTaskCount: number;
  completedTaskCount: number;
  openTaskCount: number;
  todoTaskCount: number;
  inProgressTaskCount: number;
  reviewTaskCount: number;
  overdueTaskCount: number;
  urgentOpenTaskCount: number;
  highPriorityOpenTaskCount: number;
  nearestOpenTaskDueDate: string | null;
  progressPercent: number;
  rawProgressPercent: number;
};

export type PersonalProgress = Pick<ProjectProgress, "eligibleTaskCount" | "completedTaskCount"> & { progressPercent: number | null };

export type ProjectHealthSummary = { health: ProjectHealth; reason: string | null };

function calendarDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function getTodayDateOnly(now = new Date()): string {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export function getCalendarDaysBetween(start: string, end: string): number {
  return Math.round((calendarDate(end).getTime() - calendarDate(start).getTime()) / 86_400_000);
}

export function isProgressEligibleTask(task: Pick<ProjectTaskForProgress, "status">): boolean {
  return task.status !== "cancelled";
}

export function isOpenProjectTask(task: Pick<ProjectTaskForProgress, "status">): boolean {
  return isProgressEligibleTask(task) && task.status !== "completed";
}

function getUniqueProjectTasks<T extends ProjectTaskForProgress>(tasks: readonly T[]): T[] {
  const seenIds = new Set<string>();
  return tasks.filter((task) => {
    if (seenIds.has(task.id)) return false;
    seenIds.add(task.id);
    return true;
  });
}

function calculateStageTaskProgress<T extends ProjectTaskForProgress>(tasks: readonly T[], method: StageProgressMethod): StageProgress {
  const eligibleTasks = getUniqueProjectTasks(tasks).filter(isProgressEligibleTask);
  const completedTaskCount = eligibleTasks.filter((task) => task.status === "completed").length;
  const taskProgress = eligibleTasks.map((task) => ({ task, progress: calculateTaskProgress(task).overallPercent }));
  const totalWeight = method === "equal"
    ? taskProgress.length
    : taskProgress.reduce((total, { task }) => total + Number(method === "weighted" ? task.progress_weight : task.completed_area_m2 ?? 0), 0);
  const progressPercent = totalWeight > 0
    ? taskProgress.reduce((total, { task, progress }) => total + progress * (method === "equal" ? 1 : Number(method === "weighted" ? task.progress_weight : task.completed_area_m2 ?? 0)), 0) / totalWeight
    : 0;
  return {
    eligibleTaskCount: eligibleTasks.length,
    completedTaskCount,
    progressPercent: roundProgressPercent(progressPercent),
    method,
  };
}

export function calculateStageProgress<T extends ProjectTaskForProgress>(
  tasks: readonly T[],
  methods: ProjectStageProgressMethods = DEFAULT_PROJECT_STAGE_PROGRESS_METHODS,
): Record<ProjectProgressStage, StageProgress> {
  return PROJECT_PROGRESS_STAGES.reduce<Record<ProjectProgressStage, StageProgress>>((progressByStage, stage) => ({
    ...progressByStage,
    [stage]: calculateStageTaskProgress(tasks.filter((task) => task.stage === stage), methods[stage]),
  }), {} as Record<ProjectProgressStage, StageProgress>);
}

export function calculateOverallProjectProgress(stageProgress: Record<ProjectProgressStage, StageProgress>): number {
  return PROJECT_PROGRESS_STAGES.reduce(
    (total, stage) => total + stageProgress[stage].progressPercent * PROJECT_PROGRESS_STAGE_WEIGHTS[stage],
    0,
  );
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

const AUTOMATIC_TASK_PROGRESS_BY_STATUS: Record<string, number> = {
  todo: 0,
  in_progress: 50,
  internal_review: 80,
  review: 90,
  completed: 100,
  cancelled: 0,
} satisfies Record<TaskStatus, number>;

/**
 * The workflow owns automatic progress. Only a return to In progress needs
 * context from the source status; every other destination is fixed.
 */
export function getAutomaticTaskProgress(previousStatus: string, targetStatus: string): number {
  if (targetStatus === "in_progress") {
    return previousStatus === "internal_review" || previousStatus === "review" || previousStatus === "completed"
      ? 70
      : 50;
  }
  return AUTOMATIC_TASK_PROGRESS_BY_STATUS[targetStatus] ?? 0;
}

export function roundProgressPercent(value: number): number {
  return Math.round(clampPercent(value));
}

export function calculateTaskProgress(task: Pick<ProjectTaskForProgress, "status" | "manual_progress_override" | "production_completion" | "checklist_items">): TaskProgress {
  const checklistCount = task.checklist_items.length;
  const completedChecklistCount = task.checklist_items.filter((item) => item.is_completed).length;
  const totalChecklistWeight = task.checklist_items.reduce((total, item) => total + Number(item.weight), 0);
  const completedChecklistWeight = task.checklist_items.reduce((total, item) => total + (item.is_completed ? Number(item.weight) : 0), 0);
  const checklistProduction = totalChecklistWeight > 0 ? (completedChecklistWeight / totalChecklistWeight) * 100 : 0;
  const productionPercent = checklistCount > 0 ? checklistProduction : clampPercent(Number(task.production_completion));
  const hasManualOverride = task.status === "in_progress" && task.manual_progress_override && checklistCount === 0;
  const hasProductionSource = task.status === "in_progress" && (checklistCount > 0 || hasManualOverride);
  const overallPercent = hasProductionSource
    ? productionPercent * TASK_PRODUCTION_PROGRESS_CEILING / 100
    : task.status === "in_progress"
      ? Number(task.production_completion) === 70 ? 70 : 50
      : getAutomaticTaskProgress(task.status, task.status);

  return {
    productionPercent,
    overallPercent,
    presentedProductionPercent: roundProgressPercent(productionPercent),
    presentedOverallPercent: roundProgressPercent(overallPercent),
    source: hasManualOverride ? "manual" : checklistCount > 0 ? "checklist" : "status",
    completedChecklistCount,
    checklistCount,
  };
}

export function calculateProjectProgress<T extends ProjectTaskForProgress>(
  tasks: readonly T[],
  today = getTodayDateOnly(),
  stageMethods: ProjectStageProgressMethods = DEFAULT_PROJECT_STAGE_PROGRESS_METHODS,
): ProjectProgress {
  const uniqueTasks = getUniqueProjectTasks(tasks);
  const eligible = uniqueTasks.filter(isProgressEligibleTask);
  const open = eligible.filter(isOpenProjectTask);
  const completedTaskCount = eligible.filter((task) => task.status === "completed").length;
  const dueDates = open.flatMap((task) => task.due_date ? [task.due_date] : []);
  const stageProgress = calculateStageProgress(uniqueTasks, stageMethods);
  const rawProgressPercent = calculateOverallProjectProgress(stageProgress);

  return {
    eligibleTaskCount: eligible.length,
    completedTaskCount,
    openTaskCount: open.length,
    todoTaskCount: open.filter((task) => task.status === "todo").length,
    inProgressTaskCount: open.filter((task) => task.status === "in_progress").length,
    reviewTaskCount: open.filter((task) => task.status === "review").length,
    overdueTaskCount: open.filter((task) => task.due_date !== null && task.due_date < today).length,
    urgentOpenTaskCount: open.filter((task) => task.priority === "urgent").length,
    highPriorityOpenTaskCount: open.filter((task) => task.priority === "high").length,
    nearestOpenTaskDueDate: dueDates.sort((left, right) => left.localeCompare(right))[0] ?? null,
    progressPercent: roundProgressPercent(rawProgressPercent),
    rawProgressPercent,
  };
}

export function calculatePersonalProgress<T extends ProjectTaskForProgress>(tasks: readonly T[], userId: string, _today = getTodayDateOnly()): PersonalProgress {
  void _today;
  const eligibleTasks = getUniqueProjectTasks(tasks.filter((task) => task.assignee_id === userId)).filter(isProgressEligibleTask);
  const completedTaskCount = eligibleTasks.filter((task) => task.status === "completed").length;
  const rawProgressPercent = eligibleTasks.length > 0
    ? eligibleTasks.reduce((total, task) => total + calculateTaskProgress(task).overallPercent, 0) / eligibleTasks.length
    : null;
  return {
    eligibleTaskCount: eligibleTasks.length,
    completedTaskCount,
    progressPercent: rawProgressPercent === null ? null : roundProgressPercent(rawProgressPercent),
  };
}

export function getProjectHealth({
  projectStatus,
  projectDueDate,
  progress,
  today = getTodayDateOnly(),
}: {
  projectStatus: string;
  projectDueDate: string | null;
  progress: ProjectProgress;
  today?: string;
}): ProjectHealthSummary {
  if (projectStatus === "completed") return { health: "completed", reason: null };
  // A pause preserves all project data but deliberately removes it from operational risk.
  if (projectStatus === "paused") return { health: "on_track", reason: null };
  if (projectDueDate !== null && projectDueDate < today) return { health: "overdue", reason: "Project deadline passed" };
  if (progress.overdueTaskCount > 0) return { health: "needs_attention", reason: `${progress.overdueTaskCount} overdue ${progress.overdueTaskCount === 1 ? "task" : "tasks"}` };
  if (progress.urgentOpenTaskCount > 0) return { health: "needs_attention", reason: `${progress.urgentOpenTaskCount} urgent ${progress.urgentOpenTaskCount === 1 ? "task" : "tasks"}` };
  if (progress.highPriorityOpenTaskCount > 0) return { health: "needs_attention", reason: `${progress.highPriorityOpenTaskCount} high-priority ${progress.highPriorityOpenTaskCount === 1 ? "task" : "tasks"}` };
  if (projectDueDate !== null) {
    const days = getCalendarDaysBetween(today, projectDueDate);
    if (days >= 0 && days <= 7) return { health: "deadline_soon", reason: days === 0 ? "Project deadline today" : `Project deadline in ${days} ${days === 1 ? "day" : "days"}` };
  }
  return { health: "on_track", reason: null };
}

export function getProjectHealthLabel(health: ProjectHealth): string {
  return { completed: "Completed", overdue: "Overdue", needs_attention: "Needs attention", deadline_soon: "Deadline soon", on_track: "On track" }[health];
}
import type { TaskStatus } from "@/types/tasks";
