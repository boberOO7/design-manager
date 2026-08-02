import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectContextBand } from "@/components/projects/project-context-band";
import { ProjectActivitySection } from "@/components/projects/project-activity-section";
import { ProjectLifecycleProvider } from "@/components/projects/project-lifecycle-context";
import { ProjectTeamSection } from "@/components/projects/project-team-section";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { getProjectActivity } from "@/data/queries/project-activity";
import { getAssignableProjectMembers, getAssignableStudioMembers, getProjectMembers } from "@/data/queries/project-members";
import { getProjectTasks } from "@/data/queries/tasks";
import { getStudioChecklistTemplates } from "@/data/queries/checklist-templates";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";
import { archiveProject, restoreProject } from "./actions";

export const metadata: Metadata = { title: "Project Workspace | StudioFlow" };

type ProjectView = "board" | "details" | "team" | "activity";

function getProjectView(value: string | string[] | undefined): ProjectView {
  return value === "details" || value === "team" || value === "activity" ? value : "board";
}

export default async function ProjectDetailsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ view?: string | string[]; task?: string | string[] }> }) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const view = getProjectView(query.view);
  const initialTaskId = typeof query.task === "string" ? query.task : undefined;
  const [project, adminMembership, profile] = await Promise.all([getProjectById(projectId), getActiveStudioAdmin(), getCurrentUserProfile()]);
  if (!project || !profile) notFound();

  const isArchived = project.status === "archived" || project.archived_at !== null;
  const canManage = adminMembership?.studio_id === project.studio_id;
  const [tasks, taskAssignees, projectMembers, activity, templates] = await Promise.all([
    getProjectTasks(project.id),
    view === "board" && canManage ? getAssignableProjectMembers(project.id, project.studio_id) : Promise.resolve([]),
    view === "team" ? getProjectMembers(project.id) : Promise.resolve([]),
    view === "activity" ? getProjectActivity(project.id) : Promise.resolve([]),
    view === "board" && canManage ? getStudioChecklistTemplates() : Promise.resolve([]),
  ]);
  const assignableStudioMembers = view === "team" && canManage ? await getAssignableStudioMembers(project, projectMembers.map((member) => member.user_id)) : [];
  const archiveAction = archiveProject.bind(null, project.id);
  const restoreAction = restoreProject.bind(null, project.id);
  const navItems: Array<{ id: ProjectView; label: string }> = [{ id: "board", label: "Board" }, { id: "details", label: "Details" }, { id: "team", label: "Team" }, { id: "activity", label: "Activity" }];
  const navigation = <nav aria-label="Project workspace" className="flex gap-1 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-panel)]">{navItems.map((item) => <Link key={item.id} href={item.id === "board" ? `/projects/${project.id}` : `/projects/${project.id}?view=${item.id}`} aria-current={view === item.id ? "page" : undefined} className={`inline-flex min-h-11 items-center justify-center rounded-[calc(var(--ui-radius-control)-2px)] px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${view === item.id ? "bg-[var(--ui-action-primary)] text-white" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)]"}`}>{item.label}</Link>)}</nav>;

  return <ProjectLifecycleProvider initialStatus={project.status}><div className="space-y-3">{view === "board" ? <ProjectWorkspace archiveAction={archiveAction} canCreate={canManage && !isArchived} canManage={canManage} canManageTasks={canManage} currentUserId={profile.id} initialTaskId={initialTaskId} isArchived={isArchived} isProjectReadOnly={isArchived} members={taskAssignees} navigation={navigation} project={project} restoreAction={restoreAction} tasks={tasks} templates={templates} /> : <><ProjectContextBand archiveAction={archiveAction} canManage={canManage} isArchived={isArchived} project={project} restoreAction={restoreAction} tasks={tasks} />{navigation}{view === "details" ? <ProjectDetails project={project} /> : view === "team" ? <ProjectTeamSection assignableMembers={assignableStudioMembers} canManage={canManage} members={projectMembers} projectId={project.id} /> : <ProjectActivitySection activity={activity} projectId={project.id} />}</>}</div></ProjectLifecycleProvider>;
}

function ProjectDetails({ project }: { project: NonNullable<Awaited<ReturnType<typeof getProjectById>>> }) {
  return <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 shadow-[var(--ui-shadow-panel)]"><h2 className="text-lg font-semibold text-[var(--ui-text)]">Project details</h2><dl className="mt-4 grid gap-5 text-sm md:grid-cols-2"><div><dt className="text-[var(--ui-text-muted)]">Start date</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{formatDate(project.start_date)}</dd></div>{project.completed_at ? <div><dt className="text-[var(--ui-text-muted)]">Completion date</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{formatDate(project.completed_at)}</dd></div> : null}{project.archived_at ? <div><dt className="text-[var(--ui-text-muted)]">Archive date</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{formatDate(project.archived_at)}</dd></div> : null}{project.description ? <div className="md:col-span-2"><dt className="text-[var(--ui-text-muted)]">Description</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--ui-text-secondary)]">{project.description}</dd></div> : null}</dl></section>;
}
