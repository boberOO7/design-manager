export type ProjectHealth = "completed" | "overdue" | "needs_attention" | "deadline_soon" | "on_track";

export type ProjectTaskForProgress = {
  id: string;
  status: string;
  priority: string;
  due_date: string | null;
  assignee_id: string | null;
};

export type ProjectProgress = {
  eligibleTaskCount: number;
  completedTaskCount: number;
  openTaskCount: number;
  todoTaskCount: number;
  inProgressTaskCount: number;
  overdueTaskCount: number;
  urgentOpenTaskCount: number;
  highPriorityOpenTaskCount: number;
  nearestOpenTaskDueDate: string | null;
  progressPercent: number | null;
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

export function calculateProjectProgress<T extends ProjectTaskForProgress>(tasks: readonly T[], today = getTodayDateOnly()): ProjectProgress {
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

  return {
    eligibleTaskCount: eligible.length,
    completedTaskCount,
    openTaskCount: open.length,
    todoTaskCount: open.filter((task) => task.status === "todo").length,
    inProgressTaskCount: open.filter((task) => task.status === "in_progress" || task.status === "review").length,
    overdueTaskCount: open.filter((task) => task.due_date !== null && task.due_date < today).length,
    urgentOpenTaskCount: open.filter((task) => task.priority === "urgent").length,
    highPriorityOpenTaskCount: open.filter((task) => task.priority === "high").length,
    nearestOpenTaskDueDate: dueDates.sort((left, right) => left.localeCompare(right))[0] ?? null,
    progressPercent: eligible.length === 0 ? null : Math.round((completedTaskCount / eligible.length) * 100),
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
