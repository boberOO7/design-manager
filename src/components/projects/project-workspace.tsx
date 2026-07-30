"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ProjectContextBand, type ProjectContextProject } from "@/components/projects/project-context-band";
import { ProjectTaskBoard } from "@/components/tasks/project-task-board";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { getProjectTaskSnapshotUpdate } from "@/lib/tasks";
import { getProjectAttributionMode } from "@/lib/productivity";
import type { ProjectTask } from "@/types/tasks";

export function ProjectWorkspace({
  archiveAction, canCreate, canManage, canManageTasks, currentUserId, initialTaskId, isArchived, isProjectReadOnly, members, navigation, project, restoreAction, tasks,
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
}) {
  const [contextTasks, setContextTasks] = useState(tasks);
  const { status, setStatus } = useProjectLifecycle();
  const attributionMode = getProjectAttributionMode(contextTasks);
  const handleBoardTasksChange = useCallback((nextTasks: ProjectTask[]) => {
    setContextTasks((currentTasks) => getProjectTaskSnapshotUpdate(currentTasks, nextTasks));
  }, []);
  return <>
    <ProjectContextBand archiveAction={archiveAction} canManage={canManage} isArchived={isArchived} project={project} restoreAction={restoreAction} tasks={contextTasks} />
    <aside className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] px-4 py-3 text-sm text-[var(--ui-text-secondary)]"><p className="font-medium text-[var(--ui-text)]">{attributionMode === "task_level" ? "Task-level productivity attribution" : "Project-completion productivity fallback"}</p><p className="mt-1">{attributionMode === "task_level" ? "At least one task has completed area. Only area-bearing completed tasks receive m² credit; unallocated work does not use project fallback." : "No task has completed area. When the project is completed, each active project contributor receives the full project area."}</p></aside>
    {navigation}
    <ProjectTaskBoard attributionMode={attributionMode} canCreate={canCreate && status !== "completed"} canManageTasks={canManageTasks} currentUserId={currentUserId} initialTaskId={initialTaskId} isProjectReadOnly={isProjectReadOnly || status === "completed"} members={members} projectId={project.id} projectStatus={status} tasks={tasks} onProjectStatusChange={setStatus} onTasksChange={handleBoardTasksChange} />
  </>;
}
