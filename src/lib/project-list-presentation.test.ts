import { describe, expect, it } from "vitest";
import { filterAndSortProjects, getPresentedProjects, getProjectHref, getProjectListEmptyState, getProjectListFilters, getProjectProgressLabel, type ProjectListFilters } from "./project-list-presentation";
import type { ProjectTaskForProgress } from "./project-progress";

const today = "2026-07-29";
type TestTask = Partial<ProjectTaskForProgress> & Pick<ProjectTaskForProgress, "id" | "status" | "priority" | "due_date" | "assignee_id">;
function progressTask(input: TestTask): ProjectTaskForProgress {
  return { completed_area_m2: null, production_completion: 0, progress_weight: 1, checklist_items: [], ...input };
}
function project(overrides: Partial<{ id: string; name: string; priority: string; status: string; due_date: string | null; progress_method: string; total_area_m2: number; tasks: TestTask[] }> = {}) {
  const value = { id: "project-1", name: "Alpha", priority: "normal", status: "active", due_date: null, progress_method: "equal", total_area_m2: 100, tasks: [] as TestTask[], ...overrides };
  return { ...value, tasks: value.tasks.map(progressTask) };
}
const operational: ProjectListFilters = { lifecycle: "all", health: "all", priority: "all", sort: "operational" };

describe("project list presentation", () => {
  it("orders operational risk first with a stable fallback", () => {
    const items = getPresentedProjects([
      project({ id: "track", name: "Zeta" }),
      project({ id: "soon", name: "Beta", due_date: "2026-08-02" }),
      project({ id: "late", name: "Gamma", due_date: "2026-07-20" }),
      project({ id: "risk", name: "Alpha", tasks: [{ id: "task", status: "todo", priority: "urgent", due_date: null, assignee_id: null }] }),
      project({ id: "same-a", name: "Same" }),
      project({ id: "same-b", name: "Same" }),
    ], today);
    expect(filterAndSortProjects(items, operational).map((item) => item.id)).toEqual(["late", "risk", "soon", "same-a", "same-b", "track"]);
  });

  it("filters lifecycle, health, and priority without changing the access-scoped source", () => {
    const items = getPresentedProjects([
      project({ id: "active", priority: "urgent", tasks: [{ id: "task", status: "todo", priority: "urgent", due_date: null, assignee_id: null }] }),
      project({ id: "paused", status: "paused", priority: "low" }),
    ], today);
    expect(filterAndSortProjects(items, { ...operational, lifecycle: "paused" }).map((item) => item.id)).toEqual(["paused"]);
    expect(filterAndSortProjects(items, { ...operational, health: "needs_attention" }).map((item) => item.id)).toEqual(["active"]);
    expect(filterAndSortProjects(items, { ...operational, priority: "low" }).map((item) => item.id)).toEqual(["paused"]);
  });

  it("uses truthful no-task and progress labels, and keeps project deep links", () => {
    const [emptyProject, activeProject] = getPresentedProjects([project(), project({ id: "progress", tasks: [{ id: "done", status: "completed", priority: "normal", due_date: null, assignee_id: null }, { id: "open", status: "todo", priority: "normal", due_date: null, assignee_id: null }] })], today);
    expect(getProjectProgressLabel(emptyProject.progress)).toBe("No tasks yet");
    expect(getProjectProgressLabel(activeProject.progress)).toBe("50% · 1 completed · 1 open");
    expect(getProjectHref("progress")).toBe("/projects/progress");
    expect(new Set(getPresentedProjects([project({ id: "one" }), project({ id: "two" })], today).map((item) => item.id)).size).toBe(2);
  });

  it("uses valid URL-backed filter defaults", () => {
    expect(getProjectListFilters({ lifecycle: "active", health: "overdue", priority: "urgent", sort: "deadline" })).toEqual({ lifecycle: "active", health: "overdue", priority: "urgent", sort: "deadline" });
    expect(getProjectListFilters({ lifecycle: "unknown", sort: ["name", "health"] })).toEqual({ ...operational, sort: "name" });
  });

  it("selects a resettable compact empty state when filters return no projects", () => {
    expect(getProjectListEmptyState({ ...operational, health: "overdue" })).toEqual({ title: "No projects match these filters.", canReset: true });
    expect(getProjectListEmptyState({ ...operational, lifecycle: "active" })).toEqual({ title: "No active projects.", canReset: true });
  });
});
