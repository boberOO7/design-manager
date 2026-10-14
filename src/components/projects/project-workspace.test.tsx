import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { use, type ComponentProps } from "react";
import { DEFAULT_PROJECT_STAGE_PROGRESS_METHODS } from "@/lib/project-progress";
import { DEFAULT_STAGE_COLUMN_STATUSES } from "@/lib/tasks";
import { TASK_STAGES } from "@/lib/task-stages";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/projects/project-context-band", () => ({ ProjectContextBand: () => <h1>Project identity</h1> }));
vi.mock("@/components/tasks/project-task-board", () => ({ ProjectTaskBoard: () => <button>Open task</button> }));
vi.mock("@/components/tasks/project-stage-configuration-dialog", () => ({ ProjectStageConfigurationDialog: () => null }));
vi.mock("@/components/projects/project-lifecycle-context", () => ({ useProjectLifecycle: () => ({ status: "active", setStatus: vi.fn() }) }));
import { ProjectContextBlueprint } from "./project-detail-blueprint";
import { ProjectWorkspace, ProjectWorkspaceContext, ProjectWorkspaceBoard, type ProjectWorkspaceCore, type ProjectWorkspaceBoardData } from "./project-workspace";

const core: ProjectWorkspaceCore = { tasks: [], configuration: {
  columns: { stage_1: [...DEFAULT_STAGE_COLUMN_STATUSES], stage_2: [...DEFAULT_STAGE_COLUMN_STATUSES], stage_3: [...DEFAULT_STAGE_COLUMN_STATUSES], stage_4: [...DEFAULT_STAGE_COLUMN_STATUSES] },
  progressMethods: DEFAULT_PROJECT_STAGE_PROGRESS_METHODS,
  schedulePause: { stage_1: null, stage_2: null, stage_3: null, stage_4: null },
  stages: TASK_STAGES.map((stage, index) => ({ stage, displayName: null, isEnabled: true, displayOrder: index + 1 })),
  includeInProductivity: true, showProgress: true,
} };
const project = { id: "project", name: "Project", project_code: null, project_type: null, project_type_custom: null, city: null, city_geonames_id: null, site_address: null, country_code: "UA", client_name: null, description: null, due_date: null, priority: "normal", start_date: null, total_area_m2: 100 };
const workspaceProps: Omit<ComponentProps<typeof ProjectWorkspaceContext>, "data"> = { projectId: "project", canCreate: true, canManage: true, canManageTasks: true, currentUserId: "admin", isArchived: false, isProjectReadOnly: false, archiveAction: async () => {}, restoreAction: async () => {}, updateAction: async () => ({}), calendarTimeSummary: <span>0</span> };
const props: ComponentProps<typeof ProjectWorkspace> = { contextFallback: <ProjectContextBlueprint />, navigation: <nav><a href="/projects/project?view=details">Details</a></nav>, context: <ProjectWorkspaceContext {...workspaceProps} data={{ ...core, project }} />, board: <ProjectWorkspaceBoard {...workspaceProps} data={{ ...core, members: [], templates: [], projectTemplates: [] }} /> };
function PendingContext({ pending }: { pending: Promise<ProjectWorkspaceCore & { project: typeof project }> }) {
  return <ProjectWorkspaceContext {...workspaceProps} data={use(pending)} />;
}
function PendingBoard({ pending }: { pending: Promise<ProjectWorkspaceBoardData> }) {
  return <ProjectWorkspaceBoard {...workspaceProps} data={use(pending)} />;
}

async function rendered(workspaceProps: ComponentProps<typeof ProjectWorkspace>) {
  const output = new PassThrough();
  let html = "";
  const errors: unknown[] = [];
  output.on("data", chunk => { html += chunk.toString(); });
  let ready!: () => void;
  const shell = new Promise<void>(resolve => { ready = resolve; });
  const stream = renderToPipeableStream(<main><ProjectWorkspace {...workspaceProps} /></main>, { onShellReady() { stream.pipe(output); ready(); }, onError(error) { errors.push(error); } });
  await shell;
  return { html: () => html, errors, close: () => { stream.abort(); output.destroy(); } };
}
async function waitFor(check: () => boolean) {
  for (let tries = 0; tries < 100; tries++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Stream did not arrive");
}

it("renders the real shell immediately and streams context while the board remains delayed", async () => {
  let releaseContext!: (data: ProjectWorkspaceCore & { project: typeof project }) => void;
  let releaseBoard!: (data: ProjectWorkspaceBoardData) => void;
  const context = new Promise<ProjectWorkspaceCore & { project: typeof project }>(resolve => { releaseContext = resolve; });
  const board = new Promise<ProjectWorkspaceBoardData>(resolve => { releaseBoard = resolve; });
  const result = await rendered({ ...props, context: <PendingContext pending={context} />, board: <PendingBoard pending={board} /> });
  try {
    await waitFor(() => result.html().includes("data-project-loading"));
    expect(result.html()).toContain('data-project-loading="context"');
    expect(result.html()).toContain('data-project-loading="board"');
    expect(result.html()).toContain('<nav><a href="/projects/project?view=details">Details</a></nav>');
    expect(result.html()).not.toContain('data-instaload-ready="project-board"');
    releaseContext({ ...core, project });
    await waitFor(() => result.html().includes('data-instaload-ready="project-context"'));
    expect(result.html()).not.toContain('data-instaload-ready="project-board"');
    releaseBoard({ ...core, members: [], templates: [], projectTemplates: [] });
    await waitFor(() => result.html().includes('data-instaload-ready="project-board"'));
    expect(result.html()).toContain("Open task");
    expect(result.errors).toEqual([]);
  } finally { result.close(); }
});

it("streams already-ready content once without an extra reveal scope", async () => {
  const result = await rendered(props);
  try {
    await waitFor(() => result.html().includes('data-instaload-ready="project-board"'));
    expect(result.html()).not.toContain("data-project-loading");
    expect(result.html().match(/data-instaload-ready="project-context"/g)).toHaveLength(1);
    expect(result.html().match(/data-instaload-ready="project-board"/g)).toHaveLength(1);
    expect(result.errors).toEqual([]);
  } finally { result.close(); }
});
