import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectStatusAction } from "@/components/projects/project-status-action";
import { ProjectTeamSection } from "@/components/projects/project-team-section";
import { ProjectTaskBoard } from "@/components/tasks/project-task-board";
import { Button } from "@/components/ui/button";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import {
  getAssignableProjectMembers,
  getAssignableStudioMembers,
  getProjectMembers,
} from "@/data/queries/project-members";
import { getProjectTasks } from "@/data/queries/tasks";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";
import { archiveProject, restoreProject } from "./actions";

export const metadata: Metadata = {
  title: "Project Workspace | StudioFlow",
};

type ProjectView = "board" | "details" | "team";

function getProjectView(value: string | string[] | undefined): ProjectView {
  return value === "details" || value === "team" ? value : "board";
}

function labelValue(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default async function ProjectDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const view = getProjectView(query.view);
  const [project, adminMembership, profile] = await Promise.all([
    getProjectById(projectId),
    getActiveStudioAdmin(),
    getCurrentUserProfile(),
  ]);

  if (!project || !profile) notFound();

  const isArchived = project.status === "archived" || project.archived_at !== null;
  const canManage = adminMembership?.studio_id === project.studio_id;
  const [tasks, taskAssignees] = view === "board"
    ? await Promise.all([
        getProjectTasks(project.id),
        canManage ? getAssignableProjectMembers(project.id, project.studio_id) : Promise.resolve([]),
      ])
    : [[], []];
  const projectMembers = view === "team" ? await getProjectMembers(project.id) : [];
  const assignableStudioMembers = view === "team" && canManage
    ? await getAssignableStudioMembers(
        project,
        projectMembers.map((member) => member.user_id),
      )
    : [];

  const navItems: Array<{ id: ProjectView; label: string }> = [
    { id: "board", label: "Board" },
    { id: "details", label: "Details" },
    { id: "team", label: "Team" },
  ];

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link href="/projects" className="text-sm font-medium text-stone-500 transition hover:text-stone-900">← Projects</Link>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="truncate text-2xl font-bold tracking-tight text-stone-900">{project.name}</h1>
              {project.project_code ? <span className="text-sm font-medium text-stone-400">{project.project_code}</span> : null}
            </div>
            {project.client_name ? <p className="mt-1 text-sm text-stone-500">{project.client_name}</p> : null}
          </div>
          {canManage ? (
            <div className="flex shrink-0 items-center gap-2">
              {!isArchived ? <Button asChild size="sm" variant="outline"><Link href={`/projects/${project.id}/edit`}>Edit</Link></Button> : null}
              {isArchived ? (
                <ProjectStatusAction action={restoreProject.bind(null, project.id)} label="Restore" pendingLabel="Restoring…" />
              ) : (
                <ProjectStatusAction action={archiveProject.bind(null, project.id)} confirmMessage={`Archive ${project.name}? You can restore it later.`} label="Archive" pendingLabel="Archiving…" />
              )}
            </div>
          ) : null}
        </div>
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-stone-100 pt-4 text-sm">
          <div className="flex gap-1.5"><dt className="text-stone-400">Status</dt><dd className="font-medium text-stone-700">{labelValue(project.status)}</dd></div>
          <div className="flex gap-1.5"><dt className="text-stone-400">Priority</dt><dd className="font-medium text-stone-700">{labelValue(project.priority)}</dd></div>
          <div className="flex gap-1.5"><dt className="text-stone-400">Area</dt><dd className="font-medium text-stone-700">{project.total_area_m2} m²</dd></div>
          <div className="flex gap-1.5"><dt className="text-stone-400">Start</dt><dd className="font-medium text-stone-700">{formatDate(project.start_date)}</dd></div>
          <div className="flex gap-1.5"><dt className="text-stone-400">Due</dt><dd className="font-medium text-stone-700">{formatDate(project.due_date)}</dd></div>
        </dl>
      </header>

      <nav aria-label="Project workspace" className="flex gap-1 rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
        {navItems.map((item) => (
          <Link
            key={item.id}
            href={item.id === "board" ? `/projects/${project.id}` : `/projects/${project.id}?view=${item.id}`}
            aria-current={view === item.id ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${view === item.id ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {view === "board" ? (
        <ProjectTaskBoard
          canCreate={canManage && !isArchived}
          canManageTasks={canManage}
          currentUserId={profile.id}
          isProjectReadOnly={isArchived}
          members={taskAssignees}
          projectId={project.id}
          tasks={tasks}
        />
      ) : null}

      {view === "details" ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900">Project details</h2>
          <dl className="mt-4 grid gap-5 text-sm md:grid-cols-2">
            {project.project_code ? <div><dt className="text-stone-500">Project code</dt><dd className="mt-1 font-medium text-stone-900">{project.project_code}</dd></div> : null}
            {project.client_name ? <div><dt className="text-stone-500">Client</dt><dd className="mt-1 font-medium text-stone-900">{project.client_name}</dd></div> : null}
            <div><dt className="text-stone-500">Start date</dt><dd className="mt-1 font-medium text-stone-900">{formatDate(project.start_date)}</dd></div>
            {project.due_date ? <div><dt className="text-stone-500">Due date</dt><dd className="mt-1 font-medium text-stone-900">{formatDate(project.due_date)}</dd></div> : null}
            {project.completed_at ? <div><dt className="text-stone-500">Completion date</dt><dd className="mt-1 font-medium text-stone-900">{formatDate(project.completed_at)}</dd></div> : null}
            {project.archived_at ? <div><dt className="text-stone-500">Archive date</dt><dd className="mt-1 font-medium text-stone-900">{formatDate(project.archived_at)}</dd></div> : null}
            {project.description ? <div className="md:col-span-2"><dt className="text-stone-500">Description</dt><dd className="mt-1 whitespace-pre-wrap text-stone-700">{project.description}</dd></div> : null}
          </dl>
        </section>
      ) : null}

      {view === "team" ? (
        <ProjectTeamSection assignableMembers={assignableStudioMembers} canManage={canManage} members={projectMembers} projectId={project.id} />
      ) : null}
    </div>
  );
}
