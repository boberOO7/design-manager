import { describe, expect, it } from "vitest";
import { ARCHITECTURAL_CHECKLIST_TEMPLATE, createChecklistTemplateDraft, INTERIOR_DESIGN_CHECKLIST_TEMPLATE, isChecklistTemplateDraftCustomized } from "./task-checklist-templates";

describe("built-in task checklist template", () => {
  it("returns the interior-design workflow in deterministic order with whole-number weights", () => {
    expect(createChecklistTemplateDraft(INTERIOR_DESIGN_CHECKLIST_TEMPLATE.id)).toEqual([
      { id: "planning", title: "Planning and space planning", weight: 2 },
      { id: "concept", title: "Design concept development", weight: 3 },
      { id: "materials", title: "Materials and finishes selection", weight: 2 },
      { id: "furniture", title: "Furniture and equipment selection", weight: 2 },
      { id: "visualization", title: "3D visualization", weight: 4 },
      { id: "drawings", title: "Working drawings", weight: 4 },
      { id: "specification", title: "Specification preparation", weight: 2 },
      { id: "review", title: "Final review and presentation preparation", weight: 1 },
    ]);
  });

  it("includes the architectural workflow without duplicating the Board client-review stage", () => {
    expect(createChecklistTemplateDraft(ARCHITECTURAL_CHECKLIST_TEMPLATE.id)).toEqual([
      { id: "survey", title: "Site survey and source data review", weight: 2 },
      { id: "zoning", title: "Functional zoning and planning", weight: 3 },
      { id: "concept", title: "Architectural concept development", weight: 3 },
      { id: "drawings", title: "Plans, elevations and sections", weight: 4 },
      { id: "coordination", title: "Structural and MEP coordination", weight: 3 },
      { id: "documentation", title: "Working documentation", weight: 5 },
      { id: "review", title: "Final drawing package review", weight: 2 },
    ]);
  });

  it("returns an isolated editable draft and leaves unknown templates empty", () => {
    const draft = createChecklistTemplateDraft(INTERIOR_DESIGN_CHECKLIST_TEMPLATE.id);
    draft.pop();
    draft[0].weight = 5;
    expect(createChecklistTemplateDraft(INTERIOR_DESIGN_CHECKLIST_TEMPLATE.id)).toHaveLength(8);
    expect(createChecklistTemplateDraft("unknown")).toEqual([]);
  });

  it("detects changed or removed draft items for reset confirmation", () => {
    const draft = createChecklistTemplateDraft(INTERIOR_DESIGN_CHECKLIST_TEMPLATE.id);
    expect(isChecklistTemplateDraftCustomized(INTERIOR_DESIGN_CHECKLIST_TEMPLATE.id, draft)).toBe(false);
    expect(isChecklistTemplateDraftCustomized(INTERIOR_DESIGN_CHECKLIST_TEMPLATE.id, [...draft.slice(1)])).toBe(true);
  });
});
