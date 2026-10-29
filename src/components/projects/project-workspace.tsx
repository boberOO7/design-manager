"use client";

import { Suspense, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ProjectContextBand, type ProjectContextProject } from "@/components/projects/project-context-band";
import { ProjectTaskBoard } from "@/components/tasks/project-task-board";
import { ProjectStageConfigurationDialog } from "@/components/tasks/project-stage-configuration-dialog";
import { ProjectBoardBlueprint, ProjectSectionBlueprint } from "./project-detail-blueprint";
import { InstaLoadReady } from "@/components/shared/instaload-motion";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { areProjectTaskSnapshotsEqual } from "@/lib/tasks";
import type { ProjectTask } from "@/types/tasks";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";
import type { ProjectFormAction } from "@/components/projects/project-form";
import type { ConfiguredProjectStage, ProjectStageConfiguration } from "@/data/queries/project-stage-columns";
import { calculateProjectSummary, type ProjectProgressSummary, type ProjectStageProgressMethods, type ProjectTaskForProgress } from "@/lib/project-progress";
import type { ProjectTemplate } from "@/lib/project-templates";
import { useProjectWorkspaceRouter as useRouter } from "@/components/projects/project-workspace-navigation";
import { useTranslations } from "next-intl";
import { ProjectWorkDirections } from "./project-work-directions";
import { getStageLabel } from "@/lib/task-stages";
import { directionName, type DirectionPreset } from "@/lib/work-directions";
import type { ProjectWorkspaceView } from "@/lib/project-workspace-navigation";
import styles from "./work-directions.module.css";
import { ProjectNavigationPendingContext } from "./project-navigation-progress";
import { useProjectWorkspaceNavigation } from "./project-workspace-navigation";
import { WorkDirectionDetails } from "./work-direction-details";
import { ProjectWorkspaceMotion } from "./project-workspace-motion";

export type ProjectWorkspaceCore = { tasks: ProjectTaskForProgress[]; configuration: ProjectStageConfiguration };
export type ProjectWorkspaceBoardData = ProjectWorkspaceCore & { tasks: ProjectTask[]; members: AssignableProjectMember[]; projectTemplates: ProjectTemplate[]; templates: StudioChecklistTemplate[]; presets?: DirectionPreset[] };
type WorkspaceProps = {
  archiveAction: (formData: FormData) => Promise<void>;
  backHref?: string;
  calendarTimeSummary: ReactNode;
  projectNavigation?: ReactNode;
  canCreate: boolean;
  canManage: boolean;
  canManageTasks: boolean;
  currentUserId: string;
  initialTaskId?: string;
  selectedDirectionId?: string | null;
  view?: ProjectWorkspaceView;
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
  const [liveTasks, setLiveTasks] = useState<ProjectTask[] | null>(null);
  const [programmaticNavigation, setNavigating] = useState(false);
  const [pendingLinks, setPendingLinks] = useState<ReadonlySet<string>>(() => new Set());
  const setLinkPending = useCallback((id: string, pending: boolean) => setPendingLinks(current => {
    if (current.has(id) === pending) return current;
    const next = new Set(current); if (pending) next.add(id); else next.delete(id); return next;
  }), []);
  const navigating = programmaticNavigation || pendingLinks.size > 0;
  return { summary, setSummary, progressMethods, setProgressMethods, stages, setStages, includeInProductivity, setIncludeInProductivity, showProgress, setShowProgress, liveTasks, setLiveTasks, navigating, setNavigating, setLinkPending };
}
type WorkspaceState = ReturnType<typeof useWorkspaceState>;

const WorkspaceContext = createContext<WorkspaceState | null>(null);

function useWorkspace() {
  const state = useContext(WorkspaceContext);
  if (!state) throw new Error("Project workspace state is required.");
  return state;
}

export function ProjectWorkspace(props: { context: ReactNode; board: ReactNode; overview?: ReactNode; contextFallback: ReactNode }) {
  // Both streams share the existing optimistic summary/stage state, without remounting the board.
  const state = useWorkspaceState();
  const navigation = useProjectWorkspaceNavigation();
  const contentFallback = navigation?.view === "board" ? <ProjectBoardBlueprint /> : <ProjectSectionBlueprint view={navigation?.view === "overview" ? "details" : navigation?.view ?? "details"}/>;
  const { setNavigating } = state;
  useEffect(() => { setNavigating(false); }, [navigation?.view, navigation?.directionId, setNavigating]);
  return <ProjectNavigationPendingContext.Provider value={state.setLinkPending}><WorkspaceContext.Provider value={state}>
    <Suspense fallback={props.contextFallback}>{props.context}</Suspense>
    <div inert={state.navigating} aria-busy={state.navigating} className={styles.content}>
      <ProjectWorkspaceMotion motionKey={`${navigation?.view}:${navigation?.directionId}`}>
      {navigation ? <>
        {"board" in navigation.surfaces ? <div hidden={navigation.activeSurface !== "board"}><Suspense fallback={<ProjectBoardBlueprint />}>{navigation.surfaces.board}</Suspense></div> : null}
        <div key={navigation.activeSurface === "board" ? "other" : navigation.activeSurface} hidden={navigation.activeSurface === "board" && "board" in navigation.surfaces}>
          <Suspense fallback={contentFallback}>{!(navigation.activeSurface in navigation.surfaces) ? contentFallback : navigation.activeSurface !== "board" ? navigation.surfaces[navigation.activeSurface] : null}</Suspense>
        </div>
      </> : <Suspense fallback={<ProjectBoardBlueprint />}>{props.board}</Suspense>}
      </ProjectWorkspaceMotion>
    </div>
  </WorkspaceContext.Provider></ProjectNavigationPendingContext.Provider>;
}

export function ProjectWorkspaceContext({ data, ...props }: WorkspaceProps & { data: ProjectWorkspaceCore & { project: ProjectContextProject; projectTemplates?: ProjectTemplate[]; presets?: DirectionPreset[] } }) {
  const state = useWorkspace();
  const { configuration, project, tasks } = data;
  const navigation = useProjectWorkspaceNavigation();
  // Server revalidation is authoritative; optimistic board values must not mask it.
  const { setSummary, setLiveTasks, setStages, setProgressMethods } = state;
  useEffect(() => {
    setSummary(null); setLiveTasks(null); setStages(null); setProgressMethods(null);
  }, [configuration, tasks, setSummary, setLiveTasks, setStages, setProgressMethods]);
  const [stageConfigurationOpen, setStageConfigurationOpen] = useState(false);
  const stageLabels = useTranslations("TaskStages");
  const router = useRouter();
  const stages = state.stages ?? configuration.stages;
  const includeInProductivity = state.includeInProductivity ?? configuration.includeInProductivity;
  const showProgress = state.showProgress ?? configuration.showProgress;
  const { status } = useProjectLifecycle();
  const projectStatusEditable = status !== "completed";
  return <InstaLoadReady name="project-context" className="instaload-panel">
    <div><ProjectContextBand projectNavigation={props.projectNavigation} calendarTimeSummary={props.calendarTimeSummary} archiveAction={props.archiveAction} backHref={props.backHref} canManage={props.canManage} currentUserId={props.currentUserId} isArchived={props.isArchived} onConfigureStages={() => setStageConfigurationOpen(true)} project={project} restoreAction={props.restoreAction} summary={state.summary ?? calculateProjectSummary(tasks, undefined, state.progressMethods ?? configuration.progressMethods, stages)} directionsContent={<ProjectWorkDirections projectId={props.projectId} configuration={{ ...configuration, stages, showProgress, progressMethods: state.progressMethods ?? configuration.progressMethods }} tasks={state.liveTasks ?? tasks} onNavigatingChange={state.setNavigating} selected={navigation ? navigation.directionId : props.selectedDirectionId ?? null} view={navigation?.view ?? props.view} backHref={props.backHref} canManage={props.canManage && !props.isArchived && projectStatusEditable} canViewFinance={props.canManage} templates={data.projectTemplates ?? []} presets={data.presets}/> } updateAction={props.updateAction} /></div>
    {stageConfigurationOpen ? <ProjectStageConfigurationDialog initialDirectionId={navigation?.directionId ?? props.selectedDirectionId ?? undefined} directions={configuration.directions} includeInProductivity={includeInProductivity} showProgress={showProgress} onClose={() => setStageConfigurationOpen(false)} onSaved={() => { state.setSummary(null); state.setStages(null); state.setIncludeInProductivity(null); state.setShowProgress(null); setStageConfigurationOpen(false); router.refresh(); }} projectId={props.projectId} stageLabels={stageLabels} stages={stages} /> : null}
  </InstaLoadReady>;
}

export function ProjectWorkspaceBoard({ data, ...props }: WorkspaceProps & { data: ProjectWorkspaceBoardData }) {
  const state = useWorkspace();
  const { configuration, tasks, members, projectTemplates, templates } = data;
  const { status, setStatus } = useProjectLifecycle();
  const { setProgressMethods } = state;
  const directionLabels = useTranslations("ProjectWorkspace.directions"), stageLabels = useTranslations("TaskStages");
  const directions = configuration.directions ?? [];
  const navigation = useProjectWorkspaceNavigation();
  const previousTasks = useRef(tasks);
  const invalidateRelated = navigation?.invalidateRelated;
  const onTasksChange = useCallback((nextTasks: ProjectTask[]) => {
    state.setLiveTasks(nextTasks);
    if (!areProjectTaskSnapshotsEqual(previousTasks.current, nextTasks)) invalidateRelated?.();
    previousTasks.current = nextTasks;
  }, [state.setLiveTasks, invalidateRelated]);
  const [lastDirectionId, setLastDirectionId] = useState(props.selectedDirectionId ?? directions[0]?.id);
  const rememberedDirection = directions.some(item => item.id === lastDirectionId) ? lastDirectionId : directions[0]?.id;
  const selectedDirection = navigation?.directionId ?? rememberedDirection;
  useEffect(() => {
    if (navigation?.directionId) setLastDirectionId(navigation.directionId);
  }, [navigation?.directionId]);
  const configuredStages = state.stages ?? configuration.stages;
  const directionNames = new Map(directions.map(direction => [direction.id, directionName(direction, directionLabels)]));
  const taskStageOptions = directions.length > 1 ? configuredStages.map(stage => ({ ...stage, displayName: `${directionNames.get(stage.directionId ?? "") ?? directionLabels("defaultName")} · ${getStageLabel(stage.stage, stageLabels, stage.displayName)}` })) : configuredStages;
  const direction = directions.find(item => item.id === selectedDirection);
  const visibleStages = directions.length ? configuredStages.filter(stage => stage.directionId === selectedDirection).map(stage => stage.stage) : undefined;
  useEffect(() => { setProgressMethods(configuration.progressMethods); }, [configuration.progressMethods, setProgressMethods]);
  return <InstaLoadReady name="project-board" className="instaload-panel"><div hidden={navigation?.view === "details"}>
    <div className="space-y-3">
      <div>
        <ProjectTaskBoard key={`${props.projectId}:${configuration.version}`} onTasksChange={onTasksChange} taskStageOptions={taskStageOptions} visibleStages={visibleStages} canCreate={props.canCreate} canManageTasks={props.canManageTasks} currentUserId={props.currentUserId} initialTaskId={navigation ? navigation.taskId : props.initialTaskId} isProjectReadOnly={props.isProjectReadOnly} members={members} projectId={props.projectId} projectStatus={direction?.status === "completed" ? "completed" : status} projectTemplates={projectTemplates} stageColumns={configuration.columns} stageProgressMethods={state.progressMethods ?? configuration.progressMethods} onStageProgressMethodChange={(stage, method) => { navigation?.invalidateRelated(); setProgressMethods(current => ({ ...(current ?? configuration.progressMethods), [stage]: method })); }} schedulePause={configuration.schedulePause} showProgress={state.showProgress ?? configuration.showProgress} stages={configuredStages} tasks={tasks} templates={templates} onProjectStatusChange={setStatus} onSummaryChange={state.setSummary} />
      </div>
    </div>
  </div>{navigation?.view === "details" ? <ProjectWorkspaceDetails {...props} data={data}/> : null}</InstaLoadReady>;
}

export function ProjectWorkspaceDetails({ data, ...props }: WorkspaceProps & { data: ProjectWorkspaceCore & { projectTemplates: ProjectTemplate[]; presets?: DirectionPreset[] } }) {
  const navigation = useProjectWorkspaceNavigation();
  const { status } = useProjectLifecycle();
  const direction = data.configuration.directions?.find(item => item.id === (navigation?.directionId ?? props.selectedDirectionId));
  return direction ? <WorkDirectionDetails key={direction.id} direction={direction} version={data.configuration.version} templates={data.projectTemplates} presets={data.presets ?? []} canManage={props.canManage && !props.isArchived && status !== "completed"}/> : null;
}
