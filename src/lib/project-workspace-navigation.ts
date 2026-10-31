import type { ProjectWorkDirection } from "./work-directions";
import { resolveProjectFinanceView } from "./finance-project-view";

export type ProjectWorkspaceView = "overview" | "board" | "details" | "team" | "activity" | "finance" | "feedback";
const projectViews = new Set(["overview", "team", "activity", "feedback"]);

// Only data-bearing parameters belong in the in-memory surface identity. Portfolio
// filters and task drawer URLs must not create duplicate copies of the board.
export function projectWorkspaceSurfaceKey(selection: { view: ProjectWorkspaceView; directionId: string | null }, query: Partial<Record<string, string | string[]>>) {
  if (selection.view === "feedback") return `feedback:${query.feedbackPage ?? "1"}`;
  if (selection.view !== "finance") return selection.view;
  const params = new URLSearchParams();
  const { tab, stream } = resolveProjectFinanceView(query, selection.directionId);
  for (const key of ["stream", "page", "credits", "filter", "profitFrom", "profitTo", "financeTab", "profitPeriod", "item"]) {
    // The first/default visit and explicit tab links represent the same data.
    const value = key === "financeTab" ? tab : key === "stream" ? stream : query[key];
    if (typeof value === "string") params.set(key, value);
    else value?.forEach(item => params.append(key, item));
  }
  return `finance:${selection.directionId ?? "all"}:${params}`;
}

export function resolveProjectWorkspace(input: {
  view?: string | string[]; workDirection?: string | string[]; taskId?: string;
  directions: readonly Pick<ProjectWorkDirection, "id">[];
  tasks: readonly { id: string; stage?: string }[];
  stages: readonly { stage: string; directionId?: string }[];
}): { view: ProjectWorkspaceView; directionId: string | null } {
  const task = input.taskId ? input.tasks.find(task => task.id === input.taskId) : undefined;
  const taskDirection = task && input.stages.find(stage => stage.stage === task.stage)?.directionId;
  if (taskDirection) return { view: "board", directionId: taskDirection };
  const requestedView = typeof input.view === "string" ? input.view : undefined;
  const requestedDirection = input.directions.find(direction => direction.id === input.workDirection)?.id;
  const directionId = projectViews.has(requestedView ?? "") || input.workDirection === "all" ? null
    : requestedDirection ?? ((!requestedView || requestedView === "board") && input.workDirection === undefined && input.directions.length === 1 ? input.directions[0].id : null);
  const view = requestedView === "finance" ? "finance" : requestedView === "team" ? "team"
    : requestedView === "activity" ? "activity" : requestedView === "feedback" ? "feedback"
    : directionId ? requestedView === "details" ? "details" : "board" : "overview";
  return { view, directionId };
}

export function projectWorkspaceHref(projectId: string, view: ProjectWorkspaceView, directionId: string | null, listHref = "") {
  const params = new URLSearchParams(listHref.includes("?") ? listHref.split("?")[1] : "");
  params.set("view", view);
  params.set("workDirection", projectViews.has(view) ? "all" : directionId ?? "all");
  return `/projects/${projectId}?${params}`;
}
