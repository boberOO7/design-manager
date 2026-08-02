import { describe, expect, it } from "vitest";
import { createChecklistTemplateDraft, INTERIOR_DESIGN_CHECKLIST_TEMPLATE } from "./task-checklist-templates";

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

  it("returns an isolated editable draft and leaves unknown templates empty", () => {
    const draft = createChecklistTemplateDraft(INTERIOR_DESIGN_CHECKLIST_TEMPLATE.id);
    draft.pop();
    draft[0].weight = 5;
    expect(createChecklistTemplateDraft(INTERIOR_DESIGN_CHECKLIST_TEMPLATE.id)).toHaveLength(8);
    expect(createChecklistTemplateDraft("unknown")).toEqual([]);
  });
});
