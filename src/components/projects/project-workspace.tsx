"use client";

import { useState } from "react";
import { ProjectTaskBoard } from "@/components/tasks/project-task-board";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { calculatePersonalProgress, calculateProjectProgress, getProjectHealth, getProjectHealthLabel } from "@/lib/project-progress";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { formatDateOnly } from "@/lib/utils";
import type { ProjectTask } from "@/types/tasks";

function healthClassName(health: string): string {
  if (health === "overdue") return "bg-red-100 text-red-800";
  if (health === "needs_attention" || health === "deadline_soon") return "bg-amber-100 text-amber-800";
  if (health === "completed") return "bg-emerald-100 text-emerald-800";
  return "bg-stone-100 text-stone-700";
}

export function ProjectWorkspace({
  canCreate, canManageTasks, currentUserId, isEmployee, isProjectReadOnly, members, project, tasks,
}: {
  canCreate: boolean;
  canManageTasks: boolean;
  currentUserId: string;
  isEmployee: boolean;
  isProjectReadOnly: boolean;
  members: AssignableProjectMember[];
  project: { id: string; status: string; due_date: string | null };
  tasks: ProjectTask[];
}) {
  const [currentTasks, setCurrentTasks] = useState(tasks);
  const { status, setStatus } = useProjectLifecycle();
  const progress = calculateProjectProgress(currentTasks);
  const health = getProjectHealth({ projectStatus: status, projectDueDate: project.due_date, progress });
  const personal = calculatePersonalProgress(currentTasks, currentUserId);

  return <>
    <section aria-labelledby="project-overview-heading" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="project-overview-heading" className="font-semibold text-stone-900">Project overview</h2><p className="mt-1 text-sm text-stone-500">Task-derived progress and operational health.</p></div>
        {!isProjectReadOnly ? <span className={`rounded-full px-3 py-1 text-xs font-semibold ${healthClassName(health.health)}`}>{getProjectHealthLabel(health.health)}</span> : <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">Archived</span>}
      </div>
      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <div><p className="text-stone-500">Progress</p>{progress.progressPercent === null ? <p className="mt-1 font-medium text-stone-700">No tasks yet</p> : <><p className="mt-1 font-semibold text-stone-900">{progress.progressPercent}%</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label={`Project progress: ${progress.progressPercent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progressPercent}><div className="h-full rounded-full bg-stone-900" style={{ width: `${progress.progressPercent}%` }} /></div></>}</div>
        <div><p className="text-stone-500">Tasks</p><p className="mt-1 font-medium text-stone-900">{progress.openTaskCount} open · {progress.completedTaskCount} completed</p></div>
        <div><p className="text-stone-500">Overdue</p><p className="mt-1 font-medium text-stone-900">{progress.overdueTaskCount}</p></div>
        <div><p className="text-stone-500">Deadline</p><p className="mt-1 font-medium text-stone-900">{project.due_date ? formatDateOnly(project.due_date) : "No deadline"}</p></div>
        <div><p className="text-stone-500">Next task due</p><p className="mt-1 font-medium text-stone-900">{progress.nearestOpenTaskDueDate ? formatDateOnly(progress.nearestOpenTaskDueDate) : "No open due date"}</p></div>
      </div>
      {health.reason && !isProjectReadOnly ? <p className="mt-4 text-sm font-medium text-stone-700">{health.reason}</p> : null}
      {isEmployee ? <div className="mt-4 border-t border-stone-100 pt-4 text-sm"><p className="font-medium text-stone-900">Your tasks</p><p className="mt-1 text-stone-600">{personal.eligibleTaskCount === 0 ? "No tasks assigned to you" : `${personal.completedTaskCount} of ${personal.eligibleTaskCount} completed · ${personal.progressPercent}%`}</p></div> : null}
    </section>
    <ProjectTaskBoard canCreate={canCreate && status !== "completed"} canManageTasks={canManageTasks} currentUserId={currentUserId} isProjectReadOnly={isProjectReadOnly || status === "completed"} members={members} projectId={project.id} projectStatus={status} tasks={tasks} onProjectStatusChange={setStatus} onTasksChange={setCurrentTasks} />
  </>;
}
