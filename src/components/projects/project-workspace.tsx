"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ProjectContextBand, type ProjectContextProject } from "@/components/projects/project-context-band";
import { ProjectTaskBoard } from "@/components/tasks/project-task-board";
import { ProjectStageConfigurationDialog } from "@/components/tasks/project-stage-configuration-dialog";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import type { ProjectTask } from "@/types/tasks";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";
import type { ProjectFormAction } from "@/components/projects/project-form";
import type { ConfiguredProjectStage, ProjectStageColumns, StageSchedulePause } from "@/data/queries/project-stage-columns";
import { calculateProjectSummary, type ProjectStageProgressMethods } from "@/lib/project-progress";
import type { ProjectTemplate } from "@/lib/project-templates";
import { useTranslations } from "next-intl";

export function ProjectWorkspace({
  archiveAction, backHref, calendarTimeSummary, canCreate, canManage, canManageTasks, currentUserId, initialTaskId, isArchived, isProjectReadOnly, members, navigation, project, projectTemplates, restoreAction, stageColumns, stageProgressMethods, schedulePause, stages, includeInProductivity, showProgress, tasks, templates, updateAction,
}: {
  archiveAction: (formData: FormData) => Promise<void>;
  backHref?: string;
  calendarTimeSummary: string;
  canCreate: boolean;
  canManage: boolean;
  canManageTasks: boolean;
  currentUserId: string;
  initialTaskId?: string;
  isArchived: boolean;
  isProjectReadOnly: boolean;
  members: AssignableProjectMember[];
  navigation: ReactNode;
  project: ProjectContextProject;
  projectTemplates: ProjectTemplate[];
  restoreAction: (formData: FormData) => Promise<void>;
  stageColumns: ProjectStageColumns;
  stageProgressMethods: ProjectStageProgressMethods;
  schedulePause: Record<import("@/lib/task-stages").TaskStage, StageSchedulePause>;
  stages: ConfiguredProjectStage[];
  includeInProductivity: boolean;
  showProgress: boolean;
  tasks: ProjectTask[];
  templates: StudioChecklistTemplate[];
  updateAction: ProjectFormAction;
}) {
  const [summary, setSummary] = useState(() => calculateProjectSummary(tasks, undefined, stageProgressMethods));
  const [localStageProgressMethods, setLocalStageProgressMethods] = useState(stageProgressMethods);
  useEffect(() => { setLocalStageProgressMethods(stageProgressMethods); }, [stageProgressMethods]);
  const [localStages, setLocalStages] = useState(stages);
  const [localIncludeInProductivity, setLocalIncludeInProductivity] = useState(includeInProductivity);
  const [localShowProgress, setLocalShowProgress] = useState(showProgress);
  const [stageConfigurationOpen, setStageConfigurationOpen] = useState(false);
  const stageLabels = useTranslations("TaskStages");
  const { status, setStatus } = useProjectLifecycle();
  return <>
    <ProjectContextBand archiveAction={archiveAction} backHref={backHref} calendarTimeSummary={calendarTimeSummary} canManage={canManage} currentUserId={currentUserId} isArchived={isArchived} onConfigureStages={() => setStageConfigurationOpen(true)} project={project} restoreAction={restoreAction} summary={summary} showProgress={localShowProgress} stages={localStages} updateAction={updateAction} />
    {navigation}
    <ProjectTaskBoard canCreate={canCreate} canManageTasks={canManageTasks} currentUserId={currentUserId} initialTaskId={initialTaskId} isProjectReadOnly={isProjectReadOnly} members={members} projectId={project.id} projectStatus={status} projectTemplates={projectTemplates} stageColumns={stageColumns} stageProgressMethods={localStageProgressMethods} onStageProgressMethodChange={(stage, method) => setLocalStageProgressMethods((current) => ({ ...current, [stage]: method }))} schedulePause={schedulePause} showProgress={localShowProgress} stages={localStages} tasks={tasks} templates={templates} onProjectStatusChange={setStatus} onSummaryChange={setSummary} />
    {stageConfigurationOpen ? <ProjectStageConfigurationDialog includeInProductivity={localIncludeInProductivity} showProgress={localShowProgress} onClose={() => setStageConfigurationOpen(false)} onSaved={(nextStages, nextIncludeInProductivity, nextShowProgress) => { setLocalStages(nextStages); setLocalIncludeInProductivity(nextIncludeInProductivity); setLocalShowProgress(nextShowProgress); setStageConfigurationOpen(false); }} projectId={project.id} stageLabels={stageLabels} stages={localStages} /> : null}
  </>;
}
