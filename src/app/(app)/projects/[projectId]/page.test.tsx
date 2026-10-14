import { beforeEach, expect, it, vi } from "vitest";
import { Children, isValidElement, type ComponentProps, type ReactNode } from "react";
import type { ProjectStageConfiguration } from "@/data/queries/project-stage-columns";
import { TASK_STAGES } from "@/lib/task-stages";
import { DEFAULT_PROJECT_STAGE_PROGRESS_METHODS } from "@/lib/project-progress";
import { DEFAULT_STAGE_COLUMN_STATUSES } from "@/lib/tasks";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ project: vi.fn(), admin: vi.fn(), profile: vi.fn(), city: vi.fn(), tasks: vi.fn(), progress: vi.fn(), configuration: vi.fn(), calendar: vi.fn(), assignees: vi.fn(), members: vi.fn(), assignables: vi.fn(), checklists: vi.fn(), templates: vi.fn(), activity: vi.fn(), finance: vi.fn() }));
vi.mock("@/data/queries/project-by-id", () => ({ getProjectById: mocks.project }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/data/queries", () => ({ getCurrentUserProfile: mocks.profile }));
vi.mock("@/lib/city-provider", () => ({ getLocalizedCityName: mocks.city }));
vi.mock("@/data/queries/tasks", () => ({ getProjectTasks: mocks.tasks }));
vi.mock("@/data/queries/project-progress", () => ({ getProjectTasksForProgress: mocks.progress }));
vi.mock("@/data/queries/project-stage-columns", () => ({ getProjectStageConfiguration: mocks.configuration }));
vi.mock("@/data/queries/project-calendar-time", () => ({ getProjectCalendarTime: mocks.calendar }));
vi.mock("@/data/queries/project-members", () => ({ getAssignableProjectMembers: mocks.assignees, getProjectMembers: mocks.members, getAssignableStudioMembers: mocks.assignables }));
vi.mock("@/data/queries/checklist-templates", () => ({ getStudioChecklistTemplates: mocks.checklists }));
vi.mock("@/data/queries/project-templates", () => ({ getStudioProjectTemplates: mocks.templates }));
vi.mock("@/data/queries/project-activity", () => ({ getProjectActivity: mocks.activity }));
vi.mock("@/components/finance/project-finance-section", () => ({ ProjectFinanceSection: mocks.finance }));
vi.mock("./actions", () => ({ archiveProject: vi.fn(), restoreProject: vi.fn(), updateProject: vi.fn(), updateProjectActualStartDate: vi.fn(), updateProjectCompletionDate: vi.fn() }));
vi.mock("@/components/projects/project-workspace", () => ({ ProjectWorkspace: () => null }));
vi.mock("@/components/projects/project-team-section", () => ({ ProjectTeamSection: async () => <section>Team</section> }));
vi.mock("@/components/projects/project-activity-section", () => ({ ProjectActivitySection: async () => <section>Activity</section> }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => "en" }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import Page from "./page";
import { ProjectWorkspace, type ProjectWorkspaceBoard, type ProjectWorkspaceContext } from "@/components/projects/project-workspace";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function inspectWorkspace(props: ComponentProps<typeof ProjectWorkspace>) {
  if (!isValidElement<{ pending: Promise<ComponentProps<typeof ProjectWorkspaceContext>["data"]> }>(props.context) || !isValidElement<{ pending: Promise<ComponentProps<typeof ProjectWorkspaceBoard>["data"]>; workspaceProps: Omit<ComponentProps<typeof ProjectWorkspaceBoard>, "data"> }>(props.board)) throw new Error("Workspace streams missing");
  return { ...props.board.props.workspaceProps, navigation: props.navigation, context: props.context.props.pending, board: props.board.props.pending };
}
function workspace(node: ReactNode): ReturnType<typeof inspectWorkspace> {
  if (isValidElement<ComponentProps<typeof ProjectWorkspace>>(node) && node.type === ProjectWorkspace) return inspectWorkspace(node.props);
  if (isValidElement<{ children?: ReactNode }>(node)) {
    for (const child of Children.toArray(node.props.children)) {
      try { return workspace(child); } catch { /* Search sibling nodes. */ }
    }
  }
  throw new Error("Workspace missing");
}
function pendingSection(node: ReactNode, name: string): Promise<unknown> {
  if (isValidElement<{ name?: string; pending?: unknown }>(node) && node.props.name === name && node.props.pending instanceof Promise) return node.props.pending;
  if (isValidElement<{ children?: ReactNode }>(node)) {
    for (const child of Children.toArray(node.props.children)) {
      try { return pendingSection(child, name); } catch { /* Search sibling nodes. */ }
    }
  }
  throw new Error(`Section ${name} missing`);
}
const configuration: ProjectStageConfiguration = {
  columns: { stage_1: [...DEFAULT_STAGE_COLUMN_STATUSES], stage_2: [...DEFAULT_STAGE_COLUMN_STATUSES], stage_3: [...DEFAULT_STAGE_COLUMN_STATUSES], stage_4: [...DEFAULT_STAGE_COLUMN_STATUSES] },
  progressMethods: DEFAULT_PROJECT_STAGE_PROGRESS_METHODS,
  schedulePause: { stage_1: null, stage_2: null, stage_3: null, stage_4: null },
  stages: TASK_STAGES.map((stage, index) => ({ stage, displayName: null, isEnabled: true, displayOrder: index + 1 })),
  includeInProductivity: true, showProgress: true,
};
const route = (query = {}) => Page({ params: Promise.resolve({ projectId: "project" }), searchParams: Promise.resolve(query) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.project.mockResolvedValue({ id: "project", studio_id: "studio", name: "Project", city: "Kyiv", country_code: "UA", status: "active", archived_at: null });
  mocks.admin.mockResolvedValue({ studio_id: "studio" });
  mocks.profile.mockResolvedValue({ id: "admin" });
  mocks.city.mockResolvedValue("Kyiv");
  mocks.tasks.mockResolvedValue([]);
  mocks.progress.mockResolvedValue([]);
  mocks.configuration.mockResolvedValue(configuration);
  mocks.calendar.mockResolvedValue({ count: 0, minutes: 0 });
  for (const mock of [mocks.assignees, mocks.members, mocks.assignables, mocks.checklists, mocks.templates, mocks.activity]) mock.mockResolvedValue([]);
  mocks.finance.mockResolvedValue(<section>Finance</section>);
});

it("returns the board shell while tasks, city and calendar are delayed; shares each read once", async () => {
  const tasks = deferred<[]>(), city = deferred<string>(), calendar = deferred<{ count: number; minutes: number }>();
  mocks.tasks.mockReturnValue(tasks.promise);
  mocks.city.mockReturnValue(city.promise);
  mocks.calendar.mockReturnValue(calendar.promise);
  const props = workspace(await route({ task: "task-id", lifecycle: "all" }));
  expect(props.initialTaskId).toBe("task-id");
  expect(props.navigation).toBeTruthy();
  expect(mocks.tasks).toHaveBeenCalledExactlyOnceWith("project");
  expect(mocks.progress).not.toHaveBeenCalled();
  expect(mocks.configuration).toHaveBeenCalledOnce();
  expect(mocks.calendar).toHaveBeenCalledOnce();
  expect(mocks.assignees).toHaveBeenCalledOnce();
  expect(mocks.checklists).toHaveBeenCalledOnce();
  expect(mocks.templates).toHaveBeenCalledOnce();
  tasks.resolve([]);
  expect(await props.board).toMatchObject({ tasks: [], configuration });
  city.resolve("Kyiv");
  expect(await props.context).toMatchObject({ project: { city: "Kyiv" } });
  // Calendar is still pending after both data sections become usable.
  calendar.resolve({ count: 0, minutes: 0 });
});

it("lets the context become ready while manager tools are delayed", async () => {
  const templates = deferred<[]>();
  mocks.templates.mockReturnValue(templates.promise);
  const props = workspace(await route());
  expect(await props.context).toMatchObject({ tasks: [], configuration });
  templates.resolve([]);
  expect(await props.board).toMatchObject({ projectTemplates: [] });
});

it("streams a selected section independently of progress and calendar; preserves member ordering", async () => {
  const progress = deferred<[]>(), members = deferred<Array<{ user_id: string }>>();
  mocks.progress.mockReturnValue(progress.promise);
  mocks.calendar.mockReturnValue(new Promise(() => {}));
  mocks.members.mockReturnValue(members.promise);
  const page = await route({ view: "team" });
  expect(mocks.assignables).not.toHaveBeenCalled();
  members.resolve([{ user_id: "existing-member" }]);
  expect(await pendingSection(page, "project-team")).toBeTruthy();
  expect(mocks.assignables).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "project" }), ["existing-member"]);
  expect(mocks.progress).toHaveBeenCalledOnce();
  expect(mocks.tasks).not.toHaveBeenCalled();
  progress.resolve([]);
  expect(await pendingSection(page, "project-context")).toBeTruthy();
});

it("keeps archived and employee flags and avoids manager-only sources", async () => {
  mocks.admin.mockResolvedValue(null);
  mocks.project.mockResolvedValue({ id: "project", studio_id: "studio", city: null, status: "archived", archived_at: "2026-10-01" });
  const props = workspace(await route());
  expect(props).toMatchObject({ canCreate: false, canManage: false, canManageTasks: false, isArchived: true, isProjectReadOnly: true });
  for (const mock of [mocks.assignees, mocks.checklists, mocks.templates]) expect(mock).not.toHaveBeenCalled();
  expect(await props.board).toMatchObject({ members: [], templates: [], projectTemplates: [] });
});

it("rejects inaccessible projects and unauthorized finance before starting detail reads", async () => {
  mocks.project.mockResolvedValueOnce(null);
  await expect(route()).rejects.toThrow("NOT_FOUND");
  mocks.admin.mockResolvedValue({ studio_id: "other-studio" });
  await expect(route({ view: "finance" })).rejects.toThrow("NOT_FOUND");
  for (const mock of [mocks.tasks, mocks.progress, mocks.configuration, mocks.calendar, mocks.finance]) expect(mock).not.toHaveBeenCalled();
});

it.each(["details", "activity", "finance"])("starts %s without waiting for context reads", async view => {
  mocks.progress.mockReturnValue(new Promise(() => {}));
  mocks.calendar.mockReturnValue(new Promise(() => {}));
  const page = await route({ view });
  expect(await pendingSection(page, `project-${view}`)).toBeTruthy();
  expect(mocks.progress).toHaveBeenCalledOnce();
  expect(mocks.tasks).not.toHaveBeenCalled();
});
