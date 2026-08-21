import { describe, expect, it } from "vitest";
import { getActiveProjectTemplates, getActiveProjectTemplatesForType, getDefaultProjectTemplate, type ProjectTemplate } from "@/lib/project-templates";

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
});
