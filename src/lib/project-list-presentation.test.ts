import { describe, expect, it, vi } from "vitest";
import { filterAndSortProjects, getNextProjectListSort, getPresentedProjects, getProjectHref, getProjectListEmptyState, getProjectListFilters, getProjectListHref, getProjectProgressLabel, hasActiveProjectListFilters, PROJECT_LIST_DEFAULT_FILTERS, type ProjectListFilters } from "./project-list-presentation";
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
const operational: ProjectListFilters = { query: "", lifecycle: "all", health: "all", priority: "all", sort: "operational", direction: "asc" };

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

  it("sorts column values globally without mixing in lifecycle grouping", () => {
    const items = getPresentedProjects([
      project({ id: "active-z", name: "Zeta", due_date: "2026-08-10" }),
      project({ id: "paused-a", name: "Alpha", status: "paused", due_date: "2026-07-01" }),
      project({ id: "active-a", name: "Alpha", due_date: "2026-08-01" }),
      project({ id: "paused-z", name: "Zeta", status: "paused", due_date: "2026-07-02" }),
    ], today);

    expect(filterAndSortProjects(items, { ...operational, sort: "name" }).map((item) => item.id)).toEqual(["paused-a", "active-a", "active-z", "paused-z"]);
    expect(filterAndSortProjects(items, { ...operational, sort: "deadline" }).map((item) => item.id)).toEqual(["paused-a", "paused-z", "active-a", "active-z"]);
  });

  it("uses the same mixed-script name order regardless of the runtime locale", () => {
    const localeCompare = vi.spyOn(String.prototype, "localeCompare").mockReturnValue(-1);
    const items = getPresentedProjects([
      project({ id: "cyrillic", name: "фівфівфів", status: "completed" }),
      project({ id: "latin", name: "Test old", status: "completed" }),
    ], today);

    const order = filterAndSortProjects(items, { ...operational, lifecycle: "completed", sort: "name" }).map((item) => item.id);
    const localeCompareCalls = localeCompare.mock.calls.length;
    localeCompare.mockRestore();
    expect(order).toEqual(["latin", "cyrillic"]);
    expect(localeCompareCalls).toBe(0);
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

  it("combines project-name search with filters and preserves it through sorting and project URLs", () => {
    const items = getPresentedProjects([
      project({ id: "match", name: "306 Дентал & Studio", priority: "high" }),
      project({ id: "priority", name: "305 Дентал", priority: "low" }),
      project({ id: "paused", name: "304 Дентал", priority: "high", status: "paused" }),
      project({ id: "other", name: "303 Office", priority: "high" }),
    ]);
    const filters = getProjectListFilters({ query: " ДЕНТАЛ & ", priority: "high" });
    expect(filterAndSortProjects(items, filters).map((item) => item.id)).toEqual(["match"]);
    const sorted = getNextProjectListSort(filters, "progress");
    const href = getProjectListHref(sorted);
    expect(getProjectListFilters(Object.fromEntries(new URLSearchParams(href.split("?")[1])))).toEqual(sorted);
    expect(getProjectHref("match", sorted)).toBe(`/projects/match${href.slice("/projects".length)}`);
    expect(hasActiveProjectListFilters(getProjectListFilters({ query: "Office" }))).toBe(true);
    expect(getProjectListFilters({ query: ["Office", "Studio"] }).query).toBe("");
  });

  it("defaults to active projects in descending numeric-prefix order after combining filters", () => {
    const items = getPresentedProjects([
      project({ id: "active-z", name: "306 Zeta", priority: "urgent", tasks: [{ id: "z-task", status: "todo", priority: "urgent", due_date: null, assignee_id: null }] }),
      project({ id: "planned", name: "305 Beta", status: "planned", priority: "urgent" }),
      project({ id: "active-a", name: "10 Alpha", priority: "urgent", tasks: [{ id: "a-task", status: "todo", priority: "urgent", due_date: null, assignee_id: null }] }),
      project({ id: "paused", name: "0 Delta", status: "paused", priority: "low" }),
    ], today);

    expect(filterAndSortProjects(items, getProjectListFilters({})).map((item) => item.id)).toEqual(["active-z", "active-a"]);
    expect(filterAndSortProjects(items, getProjectListFilters({ lifecycle: "all" })).map((item) => item.id)).toEqual(["active-z", "planned", "active-a", "paused"]);
    expect(filterAndSortProjects(items, getProjectListFilters({ health: "needs_attention", priority: "urgent" })).map((item) => item.id)).toEqual(["active-z", "active-a"]);
  });

  it("uses truthful no-task and stage-weighted progress labels, and keeps project deep links", () => {
    const [emptyProject, activeProject] = getPresentedProjects([project(), project({ id: "progress", tasks: [{ id: "done", status: "completed", priority: "normal", due_date: null, assignee_id: null, stage: "stage_1" }, { id: "open", status: "todo", priority: "normal", due_date: null, assignee_id: null, stage: "stage_1" }] })], today);
    expect(getProjectProgressLabel(emptyProject.progress)).toBe("No tasks yet");
    expect(getProjectProgressLabel(activeProject.progress)).toBe("10% · 1 completed · 1 open");
    expect(getProjectHref("progress")).toBe("/projects/progress");
    expect(getProjectListHref(PROJECT_LIST_DEFAULT_FILTERS)).toBe("/projects");
    expect(getProjectHref("progress", PROJECT_LIST_DEFAULT_FILTERS)).toBe("/projects/progress");
    expect(getProjectHref("progress", { ...PROJECT_LIST_DEFAULT_FILTERS, lifecycle: "completed", sort: "deadline", direction: "asc" })).toBe("/projects/progress?lifecycle=completed&sort=deadline");
    expect(new Set(getPresentedProjects([project({ id: "one" }), project({ id: "two" })], today).map((item) => item.id)).size).toBe(2);
  });

  it("uses valid URL-backed filter defaults", () => {
    expect(getProjectListFilters({})).toEqual(PROJECT_LIST_DEFAULT_FILTERS);
    expect(getProjectListFilters({ lifecycle: "active", health: "overdue", priority: "urgent", sort: "deadline" })).toEqual({ query: "", lifecycle: "active", health: "overdue", priority: "urgent", sort: "deadline", direction: "asc" });
    expect(getProjectListFilters({ lifecycle: "all" })).toEqual({ ...PROJECT_LIST_DEFAULT_FILTERS, lifecycle: "all" });
    expect(getProjectListFilters({ lifecycle: "unknown", sort: ["name", "health"] })).toEqual(PROJECT_LIST_DEFAULT_FILTERS);
  });

  it("sorts numeric prefixes naturally in both directions, including zero and different digit lengths", () => {
    const items = getPresentedProjects(["0", "2", "305", "10", "306"].map((prefix) => project({ id: prefix, name: `${prefix} Studio` })));
    expect(filterAndSortProjects(items, PROJECT_LIST_DEFAULT_FILTERS).map((item) => item.id)).toEqual(["306", "305", "10", "2", "0"]);
    expect(filterAndSortProjects(items, { ...PROJECT_LIST_DEFAULT_FILTERS, direction: "asc" }).map((item) => item.id)).toEqual(["0", "2", "10", "305", "306"]);
  });

  it("sorts progress numerically and keeps undated projects last in both deadline directions", () => {
    const items = getPresentedProjects([
      project({ id: "undated", name: "306", due_date: null }),
      project({ id: "far", name: "305", due_date: "2027-01-01", status: "paused" }),
      project({ id: "near", name: "10", due_date: "2026-08-01" }),
    ]).map((item, index) => ({ ...item, progress: { ...item.progress, progressPercent: [9, 100, 25.5][index] } }));
    expect(filterAndSortProjects(items, { ...operational, sort: "progress", direction: "asc" }).map((item) => item.id)).toEqual(["undated", "near", "far"]);
    expect(filterAndSortProjects(items, { ...operational, sort: "progress", direction: "desc" }).map((item) => item.id)).toEqual(["far", "near", "undated"]);
    expect(filterAndSortProjects(items, { ...operational, sort: "deadline", direction: "asc" }).map((item) => item.id)).toEqual(["near", "far", "undated"]);
    expect(filterAndSortProjects(items, { ...operational, sort: "deadline", direction: "desc" }).map((item) => item.id)).toEqual(["far", "near", "undated"]);
  });

  it("sorts State by canonical health severity without project-priority or lifecycle grouping", () => {
    const items = getPresentedProjects([
      project({ id: "track", name: "305", priority: "urgent", status: "paused" }),
      project({ id: "soon", name: "10", due_date: "2026-08-01" }),
      project({ id: "late", name: "2", due_date: "2026-07-28" }),
      project({ id: "attention", name: "306", tasks: [{ id: "urgent", status: "todo", priority: "urgent", due_date: null, assignee_id: null }] }),
      project({ id: "done", name: "0", status: "completed" }),
    ], today);
    expect(filterAndSortProjects(items, { ...operational, sort: "health", direction: "asc" }).map((item) => item.id)).toEqual(["late", "attention", "soon", "track", "done"]);
    expect(filterAndSortProjects(items, { ...operational, sort: "health", direction: "desc" }).map((item) => item.id)).toEqual(["done", "track", "soon", "attention", "late"]);
  });

  it("toggles headers and round-trips sort direction through list and project URLs", () => {
    expect(getNextProjectListSort(PROJECT_LIST_DEFAULT_FILTERS, "name").direction).toBe("asc");
    expect(getNextProjectListSort(getNextProjectListSort(PROJECT_LIST_DEFAULT_FILTERS, "name"), "name")).toEqual(PROJECT_LIST_DEFAULT_FILTERS);
    for (const [sort, direction] of [["progress", "desc"], ["deadline", "asc"], ["health", "asc"]] as const) {
      const filters = getNextProjectListSort({ ...PROJECT_LIST_DEFAULT_FILTERS, priority: "high" }, sort);
      expect(filters).toMatchObject({ sort, direction, priority: "high" });
      const reversed = getNextProjectListSort(filters, sort);
      const href = getProjectListHref(reversed);
      expect(getProjectListFilters(Object.fromEntries(new URLSearchParams(href.split("?")[1])))).toEqual(reversed);
      expect(getProjectHref("305", reversed)).toBe(`/projects/305${href.slice("/projects".length)}`);
    }
  });

  it("selects a resettable localized empty state when filters return no projects", () => {
    expect(getProjectListEmptyState({ ...operational, health: "overdue" })).toEqual({ titleKey: "emptyFiltered", canReset: true });
    expect(getProjectListEmptyState(PROJECT_LIST_DEFAULT_FILTERS)).toEqual({ titleKey: "emptyFilteredActive", canReset: false });
  });
});
