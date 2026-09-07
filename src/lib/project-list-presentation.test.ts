import { describe, expect, it } from "vitest";
import { filterAndSortProjects, getPresentedProjects, getProjectHref, getProjectListEmptyState, getProjectListFilters, getProjectProgressLabel, PROJECT_LIST_DEFAULT_FILTERS, type ProjectListFilters } from "./project-list-presentation";
import type { ProjectTaskForProgress } from "./project-progress";

const today = "2026-07-29";
type TestTask = Partial<ProjectTaskForProgress> & Pick<ProjectTaskForProgress, "id" | "status" | "priority" | "due_date" | "assignee_id">;
function progressTask(input: TestTask): ProjectTaskForProgress {
  return { completed_area_m2: null, manual_progress_override: false, production_completion: 0, progress_weight: 1, checklist_items: [], ...input };
}
function project(overrides: Partial<{ id: string; name: string; priority: string; status: string; due_date: string | null; total_area_m2: number; tasks: TestTask[] }> = {}) {
  const value = { id: "project-1", name: "Alpha", priority: "normal", status: "active", due_date: null, total_area_m2: 100, tasks: [] as TestTask[], ...overrides };
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

  it("sorts filtered projects globally by name while keeping paused projects last for operational sorts", () => {
    const items = getPresentedProjects([
      project({ id: "active-z", name: "Zeta", due_date: "2026-08-10" }),
      project({ id: "paused-a", name: "Alpha", status: "paused", due_date: "2026-07-01" }),
      project({ id: "active-a", name: "Alpha", due_date: "2026-08-01" }),
      project({ id: "paused-z", name: "Zeta", status: "paused", due_date: "2026-07-02" }),
    ], today);

    expect(filterAndSortProjects(items, { ...operational, sort: "name" }).map((item) => item.id)).toEqual(["paused-a", "active-a", "active-z", "paused-z"]);
    expect(filterAndSortProjects(items, { ...operational, sort: "deadline" }).map((item) => item.id)).toEqual(["active-a", "active-z", "paused-a", "paused-z"]);
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

  it("defaults to active projects and alphabetizes after combining filters", () => {
    const items = getPresentedProjects([
      project({ id: "active-z", name: "Zeta", priority: "urgent", tasks: [{ id: "z-task", status: "todo", priority: "urgent", due_date: null, assignee_id: null }] }),
      project({ id: "planned", name: "Beta", status: "planned", priority: "urgent" }),
      project({ id: "active-a", name: "Alpha", priority: "urgent", tasks: [{ id: "a-task", status: "todo", priority: "urgent", due_date: null, assignee_id: null }] }),
      project({ id: "paused", name: "Delta", status: "paused", priority: "low" }),
    ], today);

    expect(filterAndSortProjects(items, getProjectListFilters({})).map((item) => item.id)).toEqual(["active-a", "active-z"]);
    expect(filterAndSortProjects(items, getProjectListFilters({ lifecycle: "all" })).map((item) => item.id)).toEqual(["active-a", "planned", "paused", "active-z"]);
    expect(filterAndSortProjects(items, getProjectListFilters({ health: "needs_attention", priority: "urgent" })).map((item) => item.id)).toEqual(["active-a", "active-z"]);
  });

  it("uses truthful no-task and stage-weighted progress labels, and keeps project deep links", () => {
    const [emptyProject, activeProject] = getPresentedProjects([project(), project({ id: "progress", tasks: [{ id: "done", status: "completed", priority: "normal", due_date: null, assignee_id: null, stage: "stage_1" }, { id: "open", status: "todo", priority: "normal", due_date: null, assignee_id: null, stage: "stage_1" }] })], today);
    expect(getProjectProgressLabel(emptyProject.progress)).toBe("No tasks yet");
    expect(getProjectProgressLabel(activeProject.progress)).toBe("10% · 1 completed · 1 open");
    expect(getProjectHref("progress")).toBe("/projects/progress");
    expect(new Set(getPresentedProjects([project({ id: "one" }), project({ id: "two" })], today).map((item) => item.id)).size).toBe(2);
  });

  it("uses valid URL-backed filter defaults", () => {
    expect(getProjectListFilters({})).toEqual(PROJECT_LIST_DEFAULT_FILTERS);
    expect(getProjectListFilters({ lifecycle: "active", health: "overdue", priority: "urgent", sort: "deadline" })).toEqual({ lifecycle: "active", health: "overdue", priority: "urgent", sort: "deadline" });
    expect(getProjectListFilters({ lifecycle: "all" })).toEqual({ ...PROJECT_LIST_DEFAULT_FILTERS, lifecycle: "all" });
    expect(getProjectListFilters({ lifecycle: "unknown", sort: ["name", "health"] })).toEqual(PROJECT_LIST_DEFAULT_FILTERS);
  });

  it("selects a resettable localized empty state when filters return no projects", () => {
    expect(getProjectListEmptyState({ ...operational, health: "overdue" })).toEqual({ titleKey: "emptyFiltered", canReset: true });
    expect(getProjectListEmptyState(PROJECT_LIST_DEFAULT_FILTERS)).toEqual({ titleKey: "emptyFilteredActive", canReset: false });
  });
});
