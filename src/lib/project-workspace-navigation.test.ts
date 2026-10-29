import { describe, expect, it } from "vitest";
import { projectWorkspaceHref, projectWorkspaceSurfaceKey, resolveProjectWorkspace } from "./project-workspace-navigation";

const fixture = { directions: [{ id: "interior" }, { id: "facade" }], stages: [{ stage: "drawings", directionId: "facade" }], tasks: [{ id: "task", stage: "drawings" }] };
describe("project workspace context", () => {
  it("opens a multi-direction overview and goes straight to the only direction", () => {
    expect(resolveProjectWorkspace(fixture)).toEqual({ view: "overview", directionId: null });
    expect(resolveProjectWorkspace({ ...fixture, directions: [{ id: "interior" }] })).toEqual({ view: "board", directionId: "interior" });
    expect(resolveProjectWorkspace({ ...fixture, view: "board", directions: [{ id: "interior" }] })).toEqual({ view: "board", directionId: "interior" });
  });
  it("keeps details and finance in the explicitly selected direction", () => {
    for (const view of ["details", "finance"]) expect(resolveProjectWorkspace({ ...fixture, view, workDirection: "facade" })).toEqual({ view, directionId: "facade" });
    expect(resolveProjectWorkspace({ ...fixture, view: "finance" })).toEqual({ view: "finance", directionId: null });
  });
  it("resolves task ownership ahead of an outdated direction selection", () => {
    expect(resolveProjectWorkspace({ ...fixture, taskId: "task", workDirection: "interior" })).toEqual({ view: "board", directionId: "facade" });
  });
  it("keeps shared project sections and malformed scopes out of direction context", () => {
    for (const view of ["overview", "team", "activity", "feedback"]) expect(resolveProjectWorkspace({ ...fixture, view, workDirection: "facade" })).toEqual({ view, directionId: null });
    expect(resolveProjectWorkspace({ ...fixture, workDirection: "foreign-direction" })).toEqual({ view: "overview", directionId: null });
  });
  it("builds canonical links, clears stale task/finance filters and preserves portfolio filters", () => {
    const href = projectWorkspaceHref("house", "details", "facade", "/projects?priority=high&sort=name");
    expect(href).toBe("/projects/house?priority=high&sort=name&view=details&workDirection=facade");
    expect(projectWorkspaceHref("house", "activity", "facade")).toBe("/projects/house?view=activity&workDirection=all");
  });
});

it("keeps finance scopes and data filters separate while reusing board task links", () => {
  const finance = { view: "finance" as const, directionId: "interior" };
  const base = projectWorkspaceSurfaceKey(finance, {});
  expect(projectWorkspaceSurfaceKey({ ...finance, directionId: "facade" }, {})).not.toBe(base);
  expect(projectWorkspaceSurfaceKey({ ...finance, directionId: null }, {})).not.toBe(base);
  for (const key of ["financeTab", "stream", "page", "credits", "filter", "profitPeriod", "profitFrom", "profitTo", "item"]) {
    expect(projectWorkspaceSurfaceKey(finance, { [key]: "different" })).not.toBe(base);
  }
  expect(projectWorkspaceSurfaceKey({ view: "board", directionId: "interior" }, { task: "task", priority: "high" })).toBe("board");
  expect(projectWorkspaceSurfaceKey({ view: "feedback", directionId: null }, { feedbackPage: "2" })).toBe("feedback:2");
});
