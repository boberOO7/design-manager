export type ChecklistTemplateStage = {
  id: string;
  title: string;
  weight: number;
};

export type StudioChecklistTemplate = {
  id: string;
  name: string;
  archivedAt: string | null;
  stages: ChecklistTemplateStage[];
};

export function getChecklistTemplateWeight(template: Pick<StudioChecklistTemplate, "stages">): number {
  return template.stages.reduce((total, stage) => total + stage.weight, 0);
}

export function cloneChecklistTemplateStages(template: Pick<StudioChecklistTemplate, "stages"> | undefined): ChecklistTemplateStage[] {
  return template?.stages.map((stage) => ({ ...stage })) ?? [];
}

export function isChecklistTemplateDraftCustomized(template: Pick<StudioChecklistTemplate, "stages"> | undefined, draft: ChecklistTemplateStage[]): boolean {
  const source = template?.stages ?? [];
  return source.length !== draft.length || source.some((stage, index) => stage.title !== draft[index]?.title || stage.weight !== draft[index]?.weight);
}
