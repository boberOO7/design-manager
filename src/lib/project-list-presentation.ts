import { calculateProjectProgress, DEFAULT_PROJECT_STAGE_PROGRESS_METHODS, getProjectHealth, type ProjectHealth, type ProjectProgress, type ProjectStageProgressMethods, type ProjectTaskForProgress } from "@/lib/project-progress";

export const PROJECT_LIST_LIFECYCLE_FILTERS = ["all", "planned", "active", "paused", "completed"] as const;
export const PROJECT_LIST_HEALTH_FILTERS = ["all", "overdue", "needs_attention", "deadline_soon", "on_track", "completed"] as const;
export const PROJECT_LIST_PRIORITY_FILTERS = ["all", "urgent", "high", "normal", "low"] as const;
export const PROJECT_LIST_SORTS = ["operational", "deadline", "name", "health", "progress"] as const;

export type ProjectListFilters = {
  lifecycle: (typeof PROJECT_LIST_LIFECYCLE_FILTERS)[number];
  health: (typeof PROJECT_LIST_HEALTH_FILTERS)[number];
  priority: (typeof PROJECT_LIST_PRIORITY_FILTERS)[number];
  sort: (typeof PROJECT_LIST_SORTS)[number];
};

export const PROJECT_LIST_LIFECYCLE_LABEL_KEYS = {
  all: "allLifecycles", planned: "lifecyclePlanned", active: "lifecycleActive", paused: "lifecyclePaused", completed: "lifecycleCompleted",
} as const satisfies Record<ProjectListFilters["lifecycle"], "allLifecycles" | "lifecyclePlanned" | "lifecycleActive" | "lifecyclePaused" | "lifecycleCompleted">;

export const PROJECT_LIST_HEALTH_LABEL_KEYS = {
  all: "allHealth", overdue: "healthOverdue", needs_attention: "healthNeedsAttention", deadline_soon: "healthDeadlineSoon", on_track: "healthOnTrack", completed: "healthCompleted",
} as const satisfies Record<ProjectListFilters["health"], "allHealth" | "healthOverdue" | "healthNeedsAttention" | "healthDeadlineSoon" | "healthOnTrack" | "healthCompleted">;

export const PROJECT_LIST_PRIORITY_LABEL_KEYS = {
  all: "allPriorities", urgent: "urgent", high: "high", normal: "normal", low: "low",
} as const satisfies Record<ProjectListFilters["priority"], "allPriorities" | "urgent" | "high" | "normal" | "low">;

export const PROJECT_LIST_SORT_LABEL_KEYS = {
  operational: "operationalPriority", deadline: "deadline", name: "name", health: "health", progress: "progress",
} as const satisfies Record<ProjectListFilters["sort"], "operationalPriority" | "deadline" | "name" | "health" | "progress">;

export type PresentedProject<T extends { tasks: readonly ProjectTaskForProgress[]; status: string; due_date: string | null; stageProgressMethods?: ProjectStageProgressMethods }> = T & {
  health: ProjectHealth;
  healthReason: string | null;
  progress: ProjectProgress;
};

const defaultFilters: ProjectListFilters = { lifecycle: "all", health: "all", priority: "all", sort: "name" };
const healthOrder: Record<ProjectHealth, number> = { overdue: 0, needs_attention: 1, deadline_soon: 2, on_track: 3, completed: 4 };

function isOneOf<T extends readonly string[]>(value: string | string[] | undefined, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

export function getProjectListFilters(searchParams: Record<string, string | string[] | undefined>): ProjectListFilters {
  return {
    lifecycle: isOneOf(searchParams.lifecycle, PROJECT_LIST_LIFECYCLE_FILTERS) ? searchParams.lifecycle : defaultFilters.lifecycle,
    health: isOneOf(searchParams.health, PROJECT_LIST_HEALTH_FILTERS) ? searchParams.health : defaultFilters.health,
    priority: isOneOf(searchParams.priority, PROJECT_LIST_PRIORITY_FILTERS) ? searchParams.priority : defaultFilters.priority,
    sort: isOneOf(searchParams.sort, PROJECT_LIST_SORTS) ? searchParams.sort : defaultFilters.sort,
  };
}

export function getPresentedProjects<T extends { tasks: readonly ProjectTaskForProgress[]; status: string; due_date: string | null; stageProgressMethods?: ProjectStageProgressMethods }>(projects: readonly T[], today?: string): PresentedProject<T>[] {
  return projects.map((project) => {
    const progress = calculateProjectProgress(project.tasks, today, project.stageProgressMethods ?? DEFAULT_PROJECT_STAGE_PROGRESS_METHODS);
    const health = getProjectHealth({ projectStatus: project.status, projectDueDate: project.due_date, progress, today });
    return { ...project, progress, health: health.health, healthReason: health.reason };
  });
}

function compareNullableDate(left: string | null, right: string | null): number {
  return (left ?? "9999-12-31").localeCompare(right ?? "9999-12-31");
}

export function filterAndSortProjects<T extends { name: string; priority: string; status: string; due_date: string | null; tasks: readonly ProjectTaskForProgress[]; stageProgressMethods?: ProjectStageProgressMethods }>(projects: readonly PresentedProject<T>[], filters: ProjectListFilters): PresentedProject<T>[] {
  const filtered = projects.filter((project) =>
    (filters.lifecycle === "all" || project.status === filters.lifecycle)
    && (filters.health === "all" || project.health === filters.health)
    && (filters.priority === "all" || project.priority === filters.priority));

  return filtered.map((project, index) => ({ project, index })).sort((left, right) => {
    const first = left.project;
    const second = right.project;
    if (filters.sort === "deadline") return compareNullableDate(first.due_date, second.due_date) || left.index - right.index;
    if (filters.sort === "name") return first.name.localeCompare(second.name) || left.index - right.index;
    if (filters.sort === "health") return healthOrder[first.health] - healthOrder[second.health] || first.name.localeCompare(second.name) || left.index - right.index;
    if (filters.sort === "progress") return (second.progress.progressPercent ?? -1) - (first.progress.progressPercent ?? -1) || first.name.localeCompare(second.name) || left.index - right.index;
    return healthOrder[first.health] - healthOrder[second.health]
      || compareNullableDate(first.due_date, second.due_date)
      || first.name.localeCompare(second.name)
      || left.index - right.index;
  }).map(({ project }) => project);
}

export function hasActiveProjectListFilters(filters: ProjectListFilters): boolean {
  return filters.lifecycle !== "all" || filters.health !== "all" || filters.priority !== "all" || filters.sort !== "name";
}

export function getProjectListEmptyState(filters: ProjectListFilters): { canReset: boolean; titleKey: "emptyFilteredActive" | "emptyFiltered" } {
  return {
    canReset: hasActiveProjectListFilters(filters),
    titleKey: filters.lifecycle === "active" ? "emptyFilteredActive" : "emptyFiltered",
  };
}

export function getProjectProgressLabel(progress: ProjectProgress): string {
  return progress.eligibleTaskCount === 0 ? "No tasks yet" : `${progress.progressPercent}% · ${progress.completedTaskCount} completed · ${progress.openTaskCount} open`;
}

export function getProjectHref(projectId: string): string {
  return `/projects/${projectId}`;
}
