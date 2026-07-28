import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectLifecycleProvider } from "@/components/projects/project-lifecycle-context";
import { ProjectWorkspaceHeader } from "@/components/projects/project-workspace-header";
import { ProjectTeamSection } from "@/components/projects/project-team-section";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
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
    <ProjectLifecycleProvider initialStatus={project.status}>
    <div className="space-y-5">
      <ProjectWorkspaceHeader canManage={canManage} isArchived={isArchived} project={project} archiveAction={archiveProject.bind(null, project.id)} restoreAction={restoreProject.bind(null, project.id)} />

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
        <ProjectWorkspace
          canCreate={canManage && !isArchived}
          canManageTasks={canManage}
          currentUserId={profile.id}
          isProjectReadOnly={isArchived}
          members={taskAssignees}
          project={project}
          isEmployee={!canManage}
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
    </ProjectLifecycleProvider>
  );
}
