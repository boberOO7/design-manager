import { describe, expect, it } from "vitest";
import { cloneChecklistTemplateStages, getChecklistTemplateWeight, isChecklistTemplateDraftCustomized, moveChecklistTemplateStage } from "./studio-checklist-templates";

const template = { id: "template-1", name: "Interior design workflow", archivedAt: null, stages: [{ id: "one", title: "Planning", weight: 2 }, { id: "two", title: "Drawings", weight: 4 }] };

describe("studio checklist templates", () => {
  it("keeps ordered stage copies independent from the template", () => {
    const draft = cloneChecklistTemplateStages(template);
    draft[0].title = "Edited planning";
    expect(template.stages[0].title).toBe("Planning");
    expect(getChecklistTemplateWeight(template)).toBe(6);
  });

  it("detects task-specific stage edits without changing the template", () => {
    expect(isChecklistTemplateDraftCustomized(template, cloneChecklistTemplateStages(template))).toBe(false);
    expect(isChecklistTemplateDraftCustomized(template, [{ id: "one", title: "Planning", weight: 3 }, { id: "two", title: "Drawings", weight: 4 }])).toBe(true);
  });

  it("moves a stage while preserving the draft stages and their values", () => {
    const reordered = moveChecklistTemplateStage(template.stages, "two", "one");
    expect(reordered.map((stage) => stage.id)).toEqual(["two", "one"]);
    expect(reordered[0]).toMatchObject({ title: "Drawings", weight: 4 });
  });
});
