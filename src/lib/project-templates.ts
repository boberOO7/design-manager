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
  tasks: ProjectTemplateTask[];
};

export function getTemplateStageTasks(template: Pick<ProjectTemplate, "tasks"> | null | undefined, stage: ProjectTemplateStage) {
  return template?.tasks.filter((task) => task.stage === stage).sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)) ?? [];
}
