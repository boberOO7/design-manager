export type ProjectHealth = "completed" | "overdue" | "needs_attention" | "deadline_soon" | "on_track";
export type ProjectProgressMethod = "equal" | "area" | "weighted";

export function isProjectProgressMethod(value: string): value is ProjectProgressMethod {
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
  production_completion: number;
  progress_weight: number;
  checklist_items: readonly ChecklistItemForProgress[];
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
  progressPercent: number | null;
  rawProgressPercent: number | null;
  method: ProjectProgressMethod;
  assignedAreaM2: number;
  designScopeAreaM2: number | null;
  unweightedTaskCount: number;
};

export type PersonalProgress = Pick<ProjectProgress, "eligibleTaskCount" | "completedTaskCount" | "progressPercent">;

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

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function roundProgressPercent(value: number): number {
  return Math.round(clampPercent(value));
}

export function calculateTaskProgress(task: Pick<ProjectTaskForProgress, "status" | "production_completion" | "checklist_items">): TaskProgress {
  const checklistCount = task.checklist_items.length;
  const completedChecklistCount = task.checklist_items.filter((item) => item.is_completed).length;
  const totalChecklistWeight = task.checklist_items.reduce((total, item) => total + Number(item.weight), 0);
  const completedChecklistWeight = task.checklist_items.reduce((total, item) => total + (item.is_completed ? Number(item.weight) : 0), 0);
  const checklistProduction = totalChecklistWeight > 0 ? (completedChecklistWeight / totalChecklistWeight) * 100 : 0;
  const productionPercent = checklistCount > 0 ? checklistProduction : clampPercent(Number(task.production_completion));
  const overallPercent = task.status === "in_progress"
    ? productionPercent * 0.8
    : task.status === "review"
      ? 80
      : task.status === "completed"
        ? 100
        : 0;

  return {
    productionPercent,
    overallPercent,
    presentedProductionPercent: roundProgressPercent(productionPercent),
    presentedOverallPercent: roundProgressPercent(overallPercent),
    source: checklistCount > 0 ? "checklist" : task.status === "in_progress" ? "manual" : "status",
    completedChecklistCount,
    checklistCount,
  };
}

export function calculateProjectProgress<T extends ProjectTaskForProgress>(
  tasks: readonly T[],
  today = getTodayDateOnly(),
  options: { method?: ProjectProgressMethod; designScopeAreaM2?: number | null } = {},
): ProjectProgress {
  const seenIds = new Set<string>();
  const uniqueTasks = tasks.filter((task) => {
    if (seenIds.has(task.id)) return false;
    seenIds.add(task.id);
    return true;
  });
  const eligible = uniqueTasks.filter(isProgressEligibleTask);
  const open = eligible.filter(isOpenProjectTask);
  const completedTaskCount = eligible.filter((task) => task.status === "completed").length;
  const dueDates = open.flatMap((task) => task.due_date ? [task.due_date] : []);
  const method = options.method ?? "equal";
  const designScopeAreaM2 = options.designScopeAreaM2 ?? null;
  const taskProgress = eligible.map((task) => ({ task, progress: calculateTaskProgress(task).overallPercent }));
  const assignedAreaM2 = eligible.reduce((total, task) => total + Number(task.completed_area_m2 ?? 0), 0);
  const unweightedTaskCount = eligible.filter((task) => task.completed_area_m2 === null).length;
  let rawProgressPercent: number | null = null;
  if (eligible.length > 0) {
    if (method === "area") {
      rawProgressPercent = designScopeAreaM2 !== null && designScopeAreaM2 > 0
        ? taskProgress.reduce((total, item) => total + Number(item.task.completed_area_m2 ?? 0) * item.progress, 0) / designScopeAreaM2
        : 0;
    } else if (method === "weighted") {
      const totalWeight = taskProgress.reduce((total, item) => total + Number(item.task.progress_weight), 0);
      rawProgressPercent = totalWeight > 0
        ? taskProgress.reduce((total, item) => total + Number(item.task.progress_weight) * item.progress, 0) / totalWeight
        : 0;
    } else {
      rawProgressPercent = taskProgress.reduce((total, item) => total + item.progress, 0) / eligible.length;
    }
  }

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
    progressPercent: rawProgressPercent === null ? null : roundProgressPercent(rawProgressPercent),
    rawProgressPercent,
    method,
    assignedAreaM2,
    designScopeAreaM2,
    unweightedTaskCount,
  };
}

export function calculatePersonalProgress<T extends ProjectTaskForProgress>(tasks: readonly T[], userId: string, today = getTodayDateOnly()): PersonalProgress {
  const progress = calculateProjectProgress(tasks.filter((task) => task.assignee_id === userId), today);
  return { eligibleTaskCount: progress.eligibleTaskCount, completedTaskCount: progress.completedTaskCount, progressPercent: progress.progressPercent };
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
