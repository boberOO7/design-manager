import { describe, expect, it } from "vitest";
import { getActiveProjectTemplates, getActiveProjectTemplatesForType, getDefaultProjectTemplate, mergeSavedProjectTemplate, type ProjectTemplate } from "@/lib/project-templates";

const templates: ProjectTemplate[] = [
  { id: "dental", name: "Стоматологія", projectType: "medical", isActive: true, isDefault: true, tasks: [] },
  { id: "clinic", name: "Клініка", projectType: "medical", isActive: true, isDefault: false, tasks: [] },
  { id: "private", name: "Приватний", projectType: "private", isActive: true, isDefault: true, tasks: [] },
  { id: "inactive", name: "Архівний", projectType: "medical", isActive: false, isDefault: false, tasks: [] },
];

describe("project template selection", () => {
  it("keeps every active template for the selected project type and resolves its default", () => {
    expect(getActiveProjectTemplatesForType(templates, "medical").map((template) => template.id)).toEqual(["dental", "clinic"]);
    expect(getDefaultProjectTemplate(templates, "medical")?.id).toBe("dental");
  });

  it("excludes inactive templates from the active management dataset", () => {
    expect(getActiveProjectTemplates(templates).map((template) => template.id)).toEqual(["dental", "clinic", "private"]);
  });

  it("persists a new non-default template without changing its enabled state", () => {
    const saved: ProjectTemplate = { id: "dental-large", name: "Стоматологія (великий)", projectType: "medical", isActive: true, isDefault: false, tasks: [{ id: "task-1", stage: "stage_1", title: "Планування", priority: "normal", position: 0 }] };

    const result = mergeSavedProjectTemplate(templates, saved);

    expect(result.find((template) => template.id === saved.id)).toEqual(saved);
    expect(getActiveProjectTemplatesForType(result, "medical").map((template) => template.id)).toContain("dental-large");
    expect(getDefaultProjectTemplate(result, "medical")?.id).toBe("dental");
  });

  it("removes default status without removing the template or its tasks", () => {
    const existing = templates[0];
    const saved: ProjectTemplate = { ...existing, isDefault: false };

    const result = mergeSavedProjectTemplate(templates, saved);

    expect(result.find((template) => template.id === existing.id)).toEqual(saved);
    expect(result.find((template) => template.id === existing.id)?.tasks).toEqual(existing.tasks);
    expect(getDefaultProjectTemplate(result, "medical")).toBeNull();
  });

  it("clears only the previous default for the same project type", () => {
    const result = mergeSavedProjectTemplate(templates, { ...templates[1], isDefault: true });

    expect(result.find((template) => template.id === "dental")?.isDefault).toBe(false);
    expect(result.find((template) => template.id === "clinic")?.isDefault).toBe(true);
    expect(result.find((template) => template.id === "private")?.isDefault).toBe(true);
  });
});
