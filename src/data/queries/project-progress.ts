import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import type { ProjectTaskForProgress } from "@/lib/project-progress";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ProjectListRow = Pick<ProjectRow, "id" | "name" | "project_code" | "client_name" | "description" | "status" | "due_date" | "archived_at">;

export type AccessibleProjectWithTasks = ProjectListRow & { tasks: ProjectTaskForProgress[] };

/** Two RLS-scoped queries: accessible active projects, then their task rows. */
export async function getAccessibleProjectsWithTasks(): Promise<{ projects: AccessibleProjectWithTasks[]; error: null } | { projects: null; error: "query_failed" }> {
  const supabase = await createClient();
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, project_code, client_name, description, status, due_date, archived_at")
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
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, project_id, status, priority, due_date, assignee_id")
    .in("project_id", ids)
    .overrideTypes<Array<ProjectTaskForProgress & { project_id: string }>, { merge: false }>();
  if (tasksError || !tasks) {
    console.error("Unable to load project tasks", tasksError);
    return { projects: null, error: "query_failed" };
  }
  const tasksByProject = new Map<string, ProjectTaskForProgress[]>();
  for (const task of tasks) tasksByProject.set(task.project_id, [...(tasksByProject.get(task.project_id) ?? []), task]);
  return { projects: projects.map((project) => ({ ...project, tasks: tasksByProject.get(project.id) ?? [] })), error: null };
}
