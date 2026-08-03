"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ProjectContextBand, type ProjectContextProject } from "@/components/projects/project-context-band";
import { ProjectTaskBoard } from "@/components/tasks/project-task-board";
import { ProjectProgressSettings } from "@/components/projects/project-progress-settings";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { getProjectTaskSnapshotUpdate } from "@/lib/tasks";
import { getProjectAttributionMode } from "@/lib/productivity";
import type { ProjectTask } from "@/types/tasks";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";

export function ProjectWorkspace({
  archiveAction, canCreate, canManage, canManageTasks, currentUserId, initialTaskId, isArchived, isProjectReadOnly, members, navigation, project, restoreAction, tasks, templates,
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
}) {
  const t = useTranslations("Workspace");
  const [contextTasks, setContextTasks] = useState(tasks);
  const { status, setStatus } = useProjectLifecycle();
  const attributionMode = getProjectAttributionMode(contextTasks);
  const handleBoardTasksChange = useCallback((nextTasks: ProjectTask[]) => {
    setContextTasks((currentTasks) => getProjectTaskSnapshotUpdate(currentTasks, nextTasks));
  }, []);
  return <>
    <ProjectContextBand archiveAction={archiveAction} canManage={canManage} isArchived={isArchived} project={project} restoreAction={restoreAction} tasks={contextTasks} />
    <aside className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] px-4 py-3 text-sm text-[var(--ui-text-secondary)]"><p className="font-medium text-[var(--ui-text)]">{attributionMode === "task_level" ? t("taskAttribution") : t("projectAttribution")}</p><p className="mt-1">{attributionMode === "task_level" ? t("taskAttributionDescription") : t("projectAttributionDescription")}</p></aside>
    <ProjectProgressSettings canManage={canManage} isReadOnly={isProjectReadOnly || status === "completed"} project={project} tasks={contextTasks} />
    {navigation}
    <ProjectTaskBoard attributionMode={attributionMode} canCreate={canCreate && status !== "completed"} canManageTasks={canManageTasks} currentUserId={currentUserId} initialTaskId={initialTaskId} isProjectReadOnly={isProjectReadOnly || status === "completed"} members={members} projectId={project.id} projectStatus={status} tasks={tasks} templates={templates} onProjectStatusChange={setStatus} onTasksChange={handleBoardTasksChange} />
  </>;
}
