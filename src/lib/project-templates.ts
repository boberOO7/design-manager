import type { ProjectTypeKey } from "@/lib/validation/project";

export const PROJECT_TEMPLATE_STAGES = ["stage_1", "stage_2", "stage_3", "stage_4"] as const;
export type ProjectTemplateStage = (typeof PROJECT_TEMPLATE_STAGES)[number];

export function isProjectTemplateStage(value: string): value is ProjectTemplateStage {
  return value === "stage_1" || value === "stage_2" || value === "stage_3" || value === "stage_4";
}

export type ProjectTemplateDependencyMode = "after_previous" | "independent" | "custom";

export function isProjectTemplateDependencyMode(value: string): value is ProjectTemplateDependencyMode {
  return value === "after_previous" || value === "independent" || value === "custom";
}

export type ProjectTemplateTask = {
  id: string;
  stage: ProjectTemplateStage;
  title: string;
  priority: "low" | "normal" | "high" | "urgent";
  position: number;
  checklistTemplateId: string | null;
  expectedWorkdays: number | null;
  dependencyMode: ProjectTemplateDependencyMode;
  dependsOnIds: string[];
};

export type ProjectTemplate = {
  id: string;
  name: string;
  projectType: ProjectTypeKey;
  isActive: boolean;
  isDefault: boolean;
  tasks: ProjectTemplateTask[];
};

export function getActiveProjectTemplates(templates: readonly ProjectTemplate[]) {
  return templates.filter((template) => template.isActive);
}

export function getActiveProjectTemplatesForType(templates: readonly ProjectTemplate[], projectType: string) {
  return getActiveProjectTemplates(templates).filter((template) => template.projectType === projectType);
}

export function getDefaultProjectTemplate(templates: readonly ProjectTemplate[], projectType: string) {
  return getActiveProjectTemplatesForType(templates, projectType).find((template) => template.isDefault) ?? null;
}

/**
 * Mirrors the save RPC's default invariant in the optimistic template list.
 * A template's enabled state is intentionally not derived from its default flag.
 */
export function mergeSavedProjectTemplate(templates: readonly ProjectTemplate[], saved: ProjectTemplate) {
  const withoutPreviousDefault = saved.isDefault
    ? templates.map((template) => template.id !== saved.id && template.projectType === saved.projectType && template.isDefault
      ? { ...template, isDefault: false }
      : template)
    : [...templates];
  const existingIndex = withoutPreviousDefault.findIndex((template) => template.id === saved.id);

  if (existingIndex === -1) return [...withoutPreviousDefault, saved].sort((left, right) => left.name.localeCompare(right.name));

  return withoutPreviousDefault.map((template) => template.id === saved.id ? saved : template);
}

export function getTemplateStageTasks(template: Pick<ProjectTemplate, "tasks"> | null | undefined, stage: ProjectTemplateStage) {
  return template?.tasks.filter((task) => task.stage === stage).sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)) ?? [];
}

/** Resolve the ordered relationship when rendering or saving a template. */
export function getTemplateTaskDirectDependencies(tasks: readonly ProjectTemplateTask[], taskId: string): string[] {
  const task = tasks.find((item) => item.id === taskId);
  if (!task || task.expectedWorkdays === null) return [];
  if (task.dependencyMode === "independent") return [];
  if (task.dependencyMode === "custom") return [...task.dependsOnIds];
  const stageTasks = getTemplateStageTasks({ tasks: [...tasks] }, task.stage);
  const index = stageTasks.findIndex((item) => item.id === taskId);
  return index > 0 ? [stageTasks[index - 1].id] : [];
}

function dependsTransitivelyOn(tasks: readonly ProjectTemplateTask[], descendantId: string, ancestorId: string): boolean {
  const seen = new Set<string>();
  const pending = getTemplateTaskDirectDependencies(tasks, descendantId);
  while (pending.length) {
    const id = pending.pop();
    if (!id || seen.has(id)) continue;
    if (id === ancestorId) return true;
    seen.add(id);
    pending.push(...getTemplateTaskDirectDependencies(tasks, id));
  }
  return false;
}

/** Keep only direct predecessors that are not already implied by another. */
export function reduceTemplateDirectDependencies(tasks: readonly ProjectTemplateTask[], ids: readonly string[]): string[] {
  const unique = [...new Set(ids)];
  return unique.filter((id) => !unique.some((other) => other !== id && dependsTransitivelyOn(tasks, other, id)));
}

export type TemplateDependencyIssue = { taskId: string; reason: "first_task" | "missing_duration" | "empty_custom" | "invalid_edge" | "redundant_edge" };

export function getTemplateDependencyIssue(tasks: readonly ProjectTemplateTask[]): TemplateDependencyIssue | null {
  for (const stage of PROJECT_TEMPLATE_STAGES) {
    const stageTasks = getTemplateStageTasks({ tasks: [...tasks] }, stage);
    for (const [index, task] of stageTasks.entries()) {
      if (task.expectedWorkdays === null) {
        if (task.dependsOnIds.length) return { taskId: task.id, reason: "invalid_edge" };
        continue;
      }
      if (task.dependencyMode === "after_previous") {
        if (!index) return { taskId: task.id, reason: "first_task" };
        if (stageTasks[index - 1].expectedWorkdays === null) return { taskId: task.id, reason: "missing_duration" };
      }
      const direct = getTemplateTaskDirectDependencies(tasks, task.id);
      if (task.dependencyMode === "custom" && !direct.length) return { taskId: task.id, reason: "empty_custom" };
      if (task.dependencyMode === "independent" && task.dependsOnIds.length) return { taskId: task.id, reason: "invalid_edge" };
      if (direct.some((id) => !stageTasks.slice(0, index).some((candidate) => candidate.id === id && candidate.expectedWorkdays !== null))) return { taskId: task.id, reason: "invalid_edge" };
      if (reduceTemplateDirectDependencies(tasks, direct).length !== direct.length) return { taskId: task.id, reason: "redundant_edge" };
    }
  }
  return null;
}
