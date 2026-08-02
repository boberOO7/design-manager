export type ChecklistTemplateItem = { id: string; title: string; weight: number };

export const INTERIOR_DESIGN_CHECKLIST_TEMPLATE = {
  id: "interior-design-workflow",
  label: "Interior design workflow",
  items: [
    { id: "planning", title: "Planning and space planning", weight: 2 },
    { id: "concept", title: "Design concept development", weight: 3 },
    { id: "materials", title: "Materials and finishes selection", weight: 2 },
    { id: "furniture", title: "Furniture and equipment selection", weight: 2 },
    { id: "visualization", title: "3D visualization", weight: 4 },
    { id: "drawings", title: "Working drawings", weight: 4 },
    { id: "specification", title: "Specification preparation", weight: 2 },
    { id: "review", title: "Final review and presentation preparation", weight: 1 },
  ],
} as const;

export const ARCHITECTURAL_CHECKLIST_TEMPLATE = {
  id: "architectural-workflow",
  label: "Architectural workflow",
  items: [
    { id: "survey", title: "Site survey and source data review", weight: 2 },
    { id: "zoning", title: "Functional zoning and planning", weight: 3 },
    { id: "concept", title: "Architectural concept development", weight: 3 },
    { id: "drawings", title: "Plans, elevations and sections", weight: 4 },
    { id: "coordination", title: "Structural and MEP coordination", weight: 3 },
    { id: "documentation", title: "Working documentation", weight: 5 },
    { id: "review", title: "Final drawing package review", weight: 2 },
  ],
} as const;

export const BUILT_IN_CHECKLIST_TEMPLATES = [INTERIOR_DESIGN_CHECKLIST_TEMPLATE, ARCHITECTURAL_CHECKLIST_TEMPLATE] as const;

export function createChecklistTemplateDraft(templateId: string): ChecklistTemplateItem[] {
  const template = BUILT_IN_CHECKLIST_TEMPLATES.find((candidate) => candidate.id === templateId);
  return template ? template.items.map((item) => ({ ...item })) : [];
}

export function isChecklistTemplateDraftCustomized(templateId: string, draft: ChecklistTemplateItem[]) {
  const original = createChecklistTemplateDraft(templateId);
  return original.length !== draft.length || original.some((item, index) => item.title !== draft[index]?.title || item.weight !== draft[index]?.weight);
}
