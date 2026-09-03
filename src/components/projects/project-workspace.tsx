"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ProjectContextBand, type ProjectContextProject } from "@/components/projects/project-context-band";
import { ProjectTaskBoard } from "@/components/tasks/project-task-board";
import { ProjectStageConfigurationDialog } from "@/components/tasks/project-stage-configuration-dialog";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { getProjectTaskSnapshotUpdate } from "@/lib/tasks";
import type { ProjectTask } from "@/types/tasks";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";
import type { ProjectFormAction } from "@/components/projects/project-form";
import type { ConfiguredProjectStage, ProjectStageColumns } from "@/data/queries/project-stage-columns";
import type { ProjectStageProgressMethods } from "@/lib/project-progress";
import { useTranslations } from "next-intl";

export function ProjectWorkspace({
  archiveAction, canCreate, canManage, canManageTasks, currentUserId, initialTaskId, isArchived, isProjectReadOnly, members, navigation, project, restoreAction, stageColumns, stageProgressMethods, stages, includeInProductivity, tasks, templates, updateAction,
}: {
  archiveAction: (formData: FormData) => Promise<void>;
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
  restoreAction: (formData: FormData) => Promise<void>;
  stageColumns: ProjectStageColumns;
  stageProgressMethods: ProjectStageProgressMethods;
  stages: ConfiguredProjectStage[];
  includeInProductivity: boolean;
  tasks: ProjectTask[];
  templates: StudioChecklistTemplate[];
  updateAction: ProjectFormAction;
}) {
  const [contextTasks, setContextTasks] = useState(tasks);
  const [localStages, setLocalStages] = useState(stages);
  const [localIncludeInProductivity, setLocalIncludeInProductivity] = useState(includeInProductivity);
  const [stageConfigurationOpen, setStageConfigurationOpen] = useState(false);
  const stageLabels = useTranslations("TaskStages");
  const { status, setStatus } = useProjectLifecycle();
  const handleBoardTasksChange = useCallback((nextTasks: ProjectTask[]) => {
    setContextTasks((currentTasks) => getProjectTaskSnapshotUpdate(currentTasks, nextTasks));
  }, []);
  return <>
    <ProjectContextBand archiveAction={archiveAction} canManage={canManage} currentUserId={currentUserId} isArchived={isArchived} onConfigureStages={() => setStageConfigurationOpen(true)} project={project} restoreAction={restoreAction} stageProgressMethods={stageProgressMethods} stages={localStages} tasks={contextTasks} updateAction={updateAction} />
    {navigation}
    <ProjectTaskBoard canCreate={canCreate} canManageTasks={canManageTasks} currentUserId={currentUserId} initialTaskId={initialTaskId} isProjectReadOnly={isProjectReadOnly} members={members} projectId={project.id} projectStatus={status} stageColumns={stageColumns} stageProgressMethods={stageProgressMethods} stages={localStages} tasks={tasks} templates={templates} onProjectStatusChange={setStatus} onTasksChange={handleBoardTasksChange} />
    {stageConfigurationOpen ? <ProjectStageConfigurationDialog includeInProductivity={localIncludeInProductivity} onClose={() => setStageConfigurationOpen(false)} onSaved={(nextStages, nextIncludeInProductivity) => { setLocalStages(nextStages); setLocalIncludeInProductivity(nextIncludeInProductivity); setStageConfigurationOpen(false); }} projectId={project.id} stageLabels={stageLabels} stages={localStages} /> : null}
  </>;
}
