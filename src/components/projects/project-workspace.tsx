"use client";

import { Suspense, createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ProjectContextBand, type ProjectContextProject } from "@/components/projects/project-context-band";
import { ProjectTaskBoard } from "@/components/tasks/project-task-board";
import { ProjectStageConfigurationDialog } from "@/components/tasks/project-stage-configuration-dialog";
import { ProjectBoardBlueprint } from "./project-detail-blueprint";
import { InstaLoadReady } from "@/components/shared/instaload-motion";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import type { ProjectTask } from "@/types/tasks";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";
import type { ProjectFormAction } from "@/components/projects/project-form";
import type { ConfiguredProjectStage, ProjectStageConfiguration } from "@/data/queries/project-stage-columns";
import { calculateProjectSummary, type ProjectProgressSummary, type ProjectStageProgressMethods } from "@/lib/project-progress";
import type { ProjectTemplate } from "@/lib/project-templates";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export type ProjectWorkspaceCore = { tasks: ProjectTask[]; configuration: ProjectStageConfiguration };
export type ProjectWorkspaceBoardData = ProjectWorkspaceCore & { members: AssignableProjectMember[]; projectTemplates: ProjectTemplate[]; templates: StudioChecklistTemplate[] };
type WorkspaceProps = {
  archiveAction: (formData: FormData) => Promise<void>;
  backHref?: string;
  calendarTimeSummary: ReactNode;
  canCreate: boolean;
  canManage: boolean;
  canManageTasks: boolean;
  currentUserId: string;
  initialTaskId?: string;
  isArchived: boolean;
  isProjectReadOnly: boolean;
  projectId: string;
  restoreAction: (formData: FormData) => Promise<void>;
  updateAction: ProjectFormAction;
};

function useWorkspaceState() {
  const [summary, setSummary] = useState<ProjectProgressSummary | null>(null);
  const [progressMethods, setProgressMethods] = useState<ProjectStageProgressMethods | null>(null);
  const [stages, setStages] = useState<ConfiguredProjectStage[] | null>(null);
  const [includeInProductivity, setIncludeInProductivity] = useState<boolean | null>(null);
  const [showProgress, setShowProgress] = useState<boolean | null>(null);
  return { summary, setSummary, progressMethods, setProgressMethods, stages, setStages, includeInProductivity, setIncludeInProductivity, showProgress, setShowProgress };
}
type WorkspaceState = ReturnType<typeof useWorkspaceState>;

const WorkspaceContext = createContext<WorkspaceState | null>(null);

function useWorkspace() {
  const state = useContext(WorkspaceContext);
  if (!state) throw new Error("Project workspace state is required.");
  return state;
}

export function ProjectWorkspace(props: { context: ReactNode; board: ReactNode; navigation: ReactNode; contextFallback: ReactNode }) {
  // Both streams share the existing optimistic summary/stage state, without remounting the board.
  const state = useWorkspaceState();
  return <WorkspaceContext.Provider value={state}>
    <Suspense fallback={props.contextFallback}>{props.context}</Suspense>
    {props.navigation}
    <Suspense fallback={<ProjectBoardBlueprint />}>{props.board}</Suspense>
  </WorkspaceContext.Provider>;
}

export function ProjectWorkspaceContext({ data, ...props }: WorkspaceProps & { data: ProjectWorkspaceCore & { project: ProjectContextProject } }) {
  const state = useWorkspace();
  const { configuration, project, tasks } = data;
  const [stageConfigurationOpen, setStageConfigurationOpen] = useState(false);
  const stageLabels = useTranslations("TaskStages");
  const router = useRouter();
  const stages = state.stages ?? configuration.stages;
  const includeInProductivity = state.includeInProductivity ?? configuration.includeInProductivity;
  const showProgress = state.showProgress ?? configuration.showProgress;
  return <InstaLoadReady name="project-context" className="instaload-panel">
    <div data-instaload-arrival="context"><ProjectContextBand archiveAction={props.archiveAction} backHref={props.backHref} calendarTimeSummary={props.calendarTimeSummary} canManage={props.canManage} currentUserId={props.currentUserId} isArchived={props.isArchived} onConfigureStages={() => setStageConfigurationOpen(true)} project={project} restoreAction={props.restoreAction} summary={state.summary ?? calculateProjectSummary(tasks, undefined, state.progressMethods ?? configuration.progressMethods, stages)} showProgress={showProgress} stages={stages} updateAction={props.updateAction} /></div>
    {stageConfigurationOpen ? <ProjectStageConfigurationDialog includeInProductivity={includeInProductivity} showProgress={showProgress} onClose={() => setStageConfigurationOpen(false)} onSaved={() => { state.setSummary(null); state.setStages(null); state.setIncludeInProductivity(null); state.setShowProgress(null); setStageConfigurationOpen(false); router.refresh(); }} projectId={props.projectId} stageLabels={stageLabels} stages={stages} /> : null}
  </InstaLoadReady>;
}

export function ProjectWorkspaceBoard({ data, ...props }: WorkspaceProps & { data: ProjectWorkspaceBoardData }) {
  const state = useWorkspace();
  const { configuration, tasks, members, projectTemplates, templates } = data;
  const { status, setStatus } = useProjectLifecycle();
  const { setProgressMethods } = state;
  useEffect(() => { setProgressMethods(configuration.progressMethods); }, [configuration.progressMethods, setProgressMethods]);
  return <InstaLoadReady name="project-board" className="instaload-panel"><div data-instaload-arrival="board">
    <ProjectTaskBoard key={`${props.projectId}:${configuration.version}`} canCreate={props.canCreate} canManageTasks={props.canManageTasks} currentUserId={props.currentUserId} initialTaskId={props.initialTaskId} isProjectReadOnly={props.isProjectReadOnly} members={members} projectId={props.projectId} projectStatus={status} projectTemplates={projectTemplates} stageColumns={configuration.columns} stageProgressMethods={state.progressMethods ?? configuration.progressMethods} onStageProgressMethodChange={(stage, method) => setProgressMethods(current => ({ ...(current ?? configuration.progressMethods), [stage]: method }))} schedulePause={configuration.schedulePause} showProgress={state.showProgress ?? configuration.showProgress} stages={state.stages ?? configuration.stages} tasks={tasks} templates={templates} onProjectStatusChange={setStatus} onSummaryChange={state.setSummary} />
  </div></InstaLoadReady>;
}
