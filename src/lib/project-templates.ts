import type { ProjectTypeKey } from "@/lib/validation/project";

export const PROJECT_TEMPLATE_STAGES = ["stage_1", "stage_2", "stage_3", "stage_4"] as const;
export type ProjectTemplateStage = (typeof PROJECT_TEMPLATE_STAGES)[number];

export function isProjectTemplateStage(value: string): value is ProjectTemplateStage {
  return value === "stage_1" || value === "stage_2" || value === "stage_3" || value === "stage_4";
}

export type ProjectTemplateTask = {
  id: string;
  stage: ProjectTemplateStage;
  title: string;
  priority: "low" | "normal" | "high" | "urgent";
  position: number;
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
