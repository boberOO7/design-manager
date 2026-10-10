import { describe, expect, it } from "vitest";
import { moveProjectTemplateTask } from "@/lib/project-template-task-order";
import { createProjectTemplateCopy, getActiveProjectTemplates, getActiveProjectTemplatesForType, getDefaultProjectTemplate, getTemplateDependencyIssue, getTemplateStageTasks, getTemplateTaskDirectDependencies, mergeSavedProjectTemplate, reduceTemplateDirectDependencies, type ProjectTemplate, type ProjectTemplateTask } from "@/lib/project-templates";

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
    const saved: ProjectTemplate = { id: "dental-large", name: "Стоматологія (великий)", projectType: "medical", isActive: true, isDefault: false, tasks: [{ id: "task-1", stage: "stage_1", title: "Планування", priority: "normal", checklistTemplateId: null, expectedWorkdays: null, dependencyMode: "independent", dependsOnIds: [], position: 0 }] };

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

function scheduledTask(id: string, position: number, dependencyMode: ProjectTemplateTask["dependencyMode"] = "after_previous", dependsOnIds: string[] = []): ProjectTemplateTask {
  return { id, stage: "stage_1", title: id, priority: "normal", position, checklistTemplateId: null, expectedWorkdays: 1, dependencyMode, dependsOnIds };
}

describe("project template duplication", () => {
  function populatedTemplate(): ProjectTemplate {
    return { ...templates[0], tasks: [
      { ...scheduledTask("A", 0, "independent"), checklistTemplateId: "shared-checklist", expectedWorkdays: 2 },
      scheduledTask("B", 1),
      scheduledTask("C", 2, "independent"),
      scheduledTask("D", 3, "custom", ["B", "C"]),
      { ...scheduledTask("E", 4, "independent"), stage: "stage_2", expectedWorkdays: 5 },
      { ...scheduledTask("F", 5, "independent"), stage: "stage_3", expectedWorkdays: null },
      { ...scheduledTask("G", 6, "independent"), stage: "stage_4", expectedWorkdays: null },
    ] };
  }

  it("copies all stages and task configuration with new IDs and remapped dependencies", () => {
    const original = populatedTemplate();
    const copy = createProjectTemplateCopy(original, `${original.name} (копія)`);
    const copiedIds = new Map(original.tasks.map((task, index) => [task.id, copy.tasks[index].id]));

    expect(copy).toMatchObject({ id: null, name: "Стоматологія (копія)", projectType: "medical", isActive: true, isDefault: false });
    expect(new Set(copy.tasks.map((task) => task.id)).size).toBe(original.tasks.length);
    for (const [index, task] of copy.tasks.entries()) {
      expect(original.tasks.some((source) => source.id === task.id)).toBe(false);
      expect(task).toEqual({ ...original.tasks[index], id: task.id, dependsOnIds: original.tasks[index].dependsOnIds.map((id) => copiedIds.get(id)) });
      expect(task).not.toBe(original.tasks[index]);
      expect(task.dependsOnIds).not.toBe(original.tasks[index].dependsOnIds);
    }
    expect(getTemplateStageTasks(copy, "stage_1").map((task) => task.title)).toEqual(["A", "B", "C", "D"]);
    expect(getTemplateTaskDirectDependencies(copy.tasks, copy.tasks[1].id)).toEqual([copy.tasks[0].id]);
    expect(getTemplateTaskDirectDependencies(copy.tasks, copy.tasks[3].id)).toEqual([copy.tasks[1].id, copy.tasks[2].id]);
    expect(getTemplateDependencyIssue(copy.tasks)).toBeNull();
  });

  it("keeps the original and its default status unchanged when the copy is edited, saved, and removed", () => {
    const original = populatedTemplate();
    const snapshot = structuredClone(original);
    const copy = createProjectTemplateCopy(original, `${original.name} (копія)`);
    copy.name = "Новий шаблон";
    copy.tasks[0].title = "Нова задача";
    copy.tasks[0].expectedWorkdays = 7;
    copy.tasks[3].dependsOnIds.pop();
    copy.tasks.pop();

    const saved = { ...copy, id: "saved-copy" };
    const result = mergeSavedProjectTemplate([original], saved);
    expect(result.find((template) => template.id === saved.id)).toEqual(saved);
    expect(result.find((template) => template.id === original.id)).toEqual(snapshot);
    expect(getDefaultProjectTemplate(result, "medical")).toEqual(snapshot);
    expect(result.filter((template) => template.id !== saved.id)).toEqual([snapshot]);
    expect(original).toEqual(snapshot);
  });

  it("also copies empty templates", () => {
    expect(createProjectTemplateCopy(templates[0], "Стоматологія (копія)")).toEqual({ ...templates[0], id: null, name: "Стоматологія (копія)", isDefault: false, tasks: [] });
  });
});

describe("template dependency modes", () => {
  it("defaults an ordered chain to only its immediate predecessor and follows reorder", () => {
    const tasks = [scheduledTask("A", 0, "independent"), scheduledTask("B", 1), scheduledTask("C", 2)];
    expect(getTemplateTaskDirectDependencies(tasks, "B")).toEqual(["A"]);
    expect(getTemplateTaskDirectDependencies(tasks, "C")).toEqual(["B"]);
    const reordered = moveProjectTemplateTask(tasks, "C", { stage: "stage_1", index: 1 });
    expect(reordered.map((task) => task.id)).toEqual(["A", "C", "B"]);
    expect(getTemplateTaskDirectDependencies(reordered, "C")).toEqual(["A"]);
    expect(getTemplateTaskDirectDependencies(reordered, "B")).toEqual(["C"]);
  });

  it("keeps independent work parallel and custom branches as direct merge inputs", () => {
    const tasks = [scheduledTask("A", 0, "independent"), scheduledTask("B", 1, "independent"), scheduledTask("C", 2, "custom", ["A", "B"])];
    expect(getTemplateTaskDirectDependencies(tasks, "B")).toEqual([]);
    expect(getTemplateTaskDirectDependencies(tasks, "C")).toEqual(["A", "B"]);
    expect(reduceTemplateDirectDependencies(tasks, ["A", "B"])).toEqual(["A", "B"]);
  });

  it("keeps an explicitly independent task parallel after reorder", () => {
    const tasks = [scheduledTask("A", 0, "independent"), scheduledTask("B", 1, "independent")];
    const reordered = moveProjectTemplateTask(tasks, "B", { stage: "stage_1", index: 0 });
    expect(getTemplateTaskDirectDependencies(reordered, "A")).toEqual([]);
  });

  it("does not mutate custom dependencies while reducing transitive edges", () => {
    const tasks = [scheduledTask("A", 0, "independent"), scheduledTask("B", 1, "custom", ["A"]), scheduledTask("C", 2, "custom", ["A", "B"])];
    expect(reduceTemplateDirectDependencies(tasks, ["A", "B"])).toEqual(["B"]);
    expect(getTemplateDependencyIssue(tasks)).toEqual({ taskId: "C", reason: "redundant_edge" });
    expect(tasks[1].dependsOnIds).toEqual(["A"]);
    expect(tasks[2].dependsOnIds).toEqual(["A", "B"]);
  });

  it("rejects forward and cyclic custom edges", () => {
    const forward = [scheduledTask("A", 0, "custom", ["B"]), scheduledTask("B", 1, "independent")];
    expect(getTemplateDependencyIssue(forward)).toEqual({ taskId: "A", reason: "invalid_edge" });
    const cycle = [scheduledTask("A", 0, "custom", ["B"]), scheduledTask("B", 1, "custom", ["A"])];
    expect(getTemplateDependencyIssue(cycle)).toEqual({ taskId: "A", reason: "invalid_edge" });
  });

  it("rejects a redundant direct predecessor", () => {
    const tasks = [scheduledTask("A", 0, "independent"), scheduledTask("B", 1), scheduledTask("C", 2, "custom", ["A", "B"])];
    expect(getTemplateDependencyIssue(tasks)).toEqual({ taskId: "C", reason: "redundant_edge" });
  });

  it("removes ancestors already implied by another selected predecessor", () => {
    const tasks = [scheduledTask("A", 0, "independent"), scheduledTask("B", 1), scheduledTask("C", 2, "custom", ["A", "B"])];
    expect(reduceTemplateDirectDependencies(tasks, ["A", "B", "A"])).toEqual(["B"]);
  });
});
