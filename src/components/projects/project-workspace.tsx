"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ProjectContextBand, type ProjectContextProject } from "@/components/projects/project-context-band";
import { ProjectTaskBoard } from "@/components/tasks/project-task-board";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { getProjectTaskSnapshotUpdate } from "@/lib/tasks";
import type { ProjectTask } from "@/types/tasks";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";
import type { ProjectFormAction } from "@/components/projects/project-form";

export function ProjectWorkspace({
  archiveAction, canCreate, canManage, canManageTasks, currentUserId, initialTaskId, isArchived, isProjectReadOnly, members, navigation, project, restoreAction, tasks, templates, updateAction,
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
  tasks: ProjectTask[];
  templates: StudioChecklistTemplate[];
  updateAction: ProjectFormAction;
}) {
  const [contextTasks, setContextTasks] = useState(tasks);
  const { status, setStatus } = useProjectLifecycle();
  const handleBoardTasksChange = useCallback((nextTasks: ProjectTask[]) => {
    setContextTasks((currentTasks) => getProjectTaskSnapshotUpdate(currentTasks, nextTasks));
  }, []);
  return <>
    <ProjectContextBand archiveAction={archiveAction} canManage={canManage} isArchived={isArchived} project={project} restoreAction={restoreAction} tasks={contextTasks} updateAction={updateAction} />
    {navigation}
    <ProjectTaskBoard canCreate={canCreate && status !== "completed"} canManageTasks={canManageTasks} currentUserId={currentUserId} initialTaskId={initialTaskId} isProjectReadOnly={isProjectReadOnly || status === "completed"} members={members} projectId={project.id} projectStatus={status} tasks={tasks} templates={templates} onProjectStatusChange={setStatus} onTasksChange={handleBoardTasksChange} />
  </>;
}
