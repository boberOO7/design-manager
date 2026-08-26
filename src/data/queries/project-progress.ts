import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import { DEFAULT_PROJECT_STAGE_PROGRESS_METHODS, isStageProgressMethod, PROJECT_PROGRESS_STAGES, type ProjectStageProgressMethods, type ProjectTaskForProgress } from "@/lib/project-progress";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ProjectListRow = Pick<ProjectRow, "id" | "name" | "project_code" | "client_name" | "description" | "status" | "priority" | "due_date" | "archived_at" | "total_area_m2">;
export type ProjectListParticipant = Pick<ProfileRow, "id" | "full_name" | "avatar_url">;
type ProjectListMembershipRow = {
  project_id: string;
  user_id: string;
  profile: ProjectListParticipant | null;
};

export type AccessibleProjectWithTasks = ProjectListRow & {
  participants: ProjectListParticipant[];
  stageProgressMethods: ProjectStageProgressMethods;
  tasks: ProjectTaskForProgress[];
};

/** Batched RLS-scoped queries for accessible projects, their tasks, and active participants. */
export async function getAccessibleProjectsWithTasks(): Promise<{ projects: AccessibleProjectWithTasks[]; error: null } | { projects: null; error: "query_failed" }> {
  const supabase = await createClient();
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, project_code, client_name, description, status, priority, due_date, archived_at, total_area_m2")
    .is("archived_at", null)
    .neq("status", "archived")
    .order("start_date", { ascending: false })
    .overrideTypes<ProjectListRow[], { merge: false }>();
  if (projectsError || !projects) {
    console.error("Unable to load accessible projects", projectsError);
    return { projects: null, error: "query_failed" };
  }
  if (projects.length === 0) return { projects: [], error: null };
  const ids = projects.map((project) => project.id);
  const [tasksResult, membershipsResult, stageConfigurationsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, project_id, stage, status, priority, due_date, assignee_id, completed_area_m2, manual_progress_override, production_completion, progress_weight, checklist_items:task_checklist_items(id, is_completed, weight)")
      .in("project_id", ids)
      .overrideTypes<Array<ProjectTaskForProgress & { project_id: string }>, { merge: false }>(),
    supabase
      .from("project_members")
      .select("project_id, user_id, profile:profiles!project_members_user_id_fkey!inner(id, full_name, avatar_url, is_active)")
      .in("project_id", ids)
      .eq("is_active", true)
      .eq("profile.is_active", true)
      .overrideTypes<ProjectListMembershipRow[], { merge: false }>(),
    supabase
      .from("project_task_stage_columns")
      .select("project_id, stage, progress_method")
      .in("project_id", ids),
  ]);
  const { data: tasks, error: tasksError } = tasksResult;
  if (tasksError || !tasks) {
    console.error("Unable to load project tasks", tasksError);
    return { projects: null, error: "query_failed" };
  }
  const { data: memberships, error: membershipsError } = membershipsResult;
  if (membershipsError || !memberships) {
    console.error("Unable to load project participants", membershipsError);
    return { projects: null, error: "query_failed" };
  }
  const { data: stageConfigurations, error: stageConfigurationsError } = stageConfigurationsResult;
  if (stageConfigurationsError || !stageConfigurations) {
    console.error("Unable to load project stage progress methods", stageConfigurationsError);
    return { projects: null, error: "query_failed" };
  }
  const tasksByProject = new Map<string, ProjectTaskForProgress[]>();
  for (const task of tasks) tasksByProject.set(task.project_id, [...(tasksByProject.get(task.project_id) ?? []), task]);
  const participantsByProject = new Map<string, ProjectListParticipant[]>();
  for (const membership of memberships) {
    const participant = membership.profile;
    if (!participant) continue;
    const participants = participantsByProject.get(membership.project_id) ?? [];
    if (!participants.some((existingParticipant) => existingParticipant.id === participant.id)) {
      participants.push(participant);
      participantsByProject.set(membership.project_id, participants);
    }
  }
  for (const participants of participantsByProject.values()) {
    participants.sort((left, right) => left.full_name.localeCompare(right.full_name));
  }
  const methodsByProject = new Map<string, ProjectStageProgressMethods>();
  for (const project of projects) methodsByProject.set(project.id, { ...DEFAULT_PROJECT_STAGE_PROGRESS_METHODS });
  for (const configuration of stageConfigurations) {
    if (!PROJECT_PROGRESS_STAGES.includes(configuration.stage as typeof PROJECT_PROGRESS_STAGES[number]) || !isStageProgressMethod(configuration.progress_method)) continue;
    const methods = methodsByProject.get(configuration.project_id);
    if (methods) methods[configuration.stage as typeof PROJECT_PROGRESS_STAGES[number]] = configuration.progress_method;
  }
  return { projects: projects.map((project) => ({ ...project, participants: participantsByProject.get(project.id) ?? [], stageProgressMethods: methodsByProject.get(project.id) ?? { ...DEFAULT_PROJECT_STAGE_PROGRESS_METHODS }, tasks: tasksByProject.get(project.id) ?? [] })), error: null };
}
