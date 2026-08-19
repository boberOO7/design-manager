"use server";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { authorizeTaskMutation, updateTaskStatusMutation } from "@/data/mutations/task-status";
import { getProjectById } from "@/data/queries/project-by-id";
import { getAssignableProjectMembers } from "@/data/queries/project-members";
import { getProjectTasks } from "@/data/queries/tasks";
import { getProjectStageColumns } from "@/data/queries/project-stage-columns";
import { toTaskStatusActionState } from "@/lib/task-status-mutation";
import { createClient } from "@/lib/supabase/server";
import {
  getTaskCreationInput,
  getTaskStatusInput,
  taskCreationSchema,
  type TaskActionState,
  type TaskCreationField,
  type TaskStatusActionState,
} from "@/lib/validation/task";

function revalidateTaskCreationRoutes(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/my-tasks");
}

function revalidateMyTasks() {
  revalidatePath("/my-tasks");
}

function revalidateTaskDeletionRoutes(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
  revalidatePath("/leaderboard");
}

export async function createProjectTask(
  projectId: string,
  _previousState: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const adminMembership = await getActiveStudioAdmin();
  if (!adminMembership) {
    return { formError: "Only active studio administrators can create tasks." };
  }

  const parsed = taskCreationSchema.safeParse(getTaskCreationInput(formData));
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    const fieldErrors: Partial<Record<TaskCreationField, string>> = {
      title: flattened.title?.[0],
      description: flattened.description?.[0],
      assignee_id: flattened.assignee_id?.[0],
      priority: flattened.priority?.[0],
      stage: flattened.stage?.[0],
      status: flattened.status?.[0],
      due_date: flattened.due_date?.[0],
      completed_area_m2: flattened.completed_area_m2?.[0],
      checklist_items: flattened.checklist_items?.[0],
    };
    return { formError: "Please correct the highlighted fields.", fieldErrors };
  }

  const project = await getProjectById(projectId);
  if (
    !project
    || project.studio_id !== adminMembership.studio_id
    || project.status === "archived"
    || project.archived_at
  ) {
    return { formError: "The project was not found or is not available for new tasks." };
  }
  const stageColumns = await getProjectStageColumns(project.id);
  if (!stageColumns[parsed.data.stage].includes(parsed.data.status)) return { fieldErrors: { status: "Choose a status enabled for this stage." } };

  const projectMembers = parsed.data.assignee_id === null
    ? []
    : await getAssignableProjectMembers(project.id, project.studio_id);
  if (parsed.data.assignee_id !== null && !projectMembers.some((member) => member.id === parsed.data.assignee_id)) {
    return { fieldErrors: { assignee_id: "Choose an active member of this project." } };
  }
  if (project.progress_method === "area" && parsed.data.completed_area_m2 !== undefined) {
    const existingTasks = await getProjectTasks(project.id);
    const assignedArea = existingTasks.filter((task) => task.status !== "cancelled").reduce((total, task) => total + Number(task.completed_area_m2 ?? 0), 0);
    if (assignedArea + parsed.data.completed_area_m2 > project.total_area_m2) {
      return { formError: "Please correct the highlighted fields.", fieldErrors: { completed_area_m2: `Task areas cannot exceed the ${project.total_area_m2} m² design scope.` } };
    }
  }

  const task = {
    project_id: project.id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    priority: parsed.data.priority,
    stage: parsed.data.stage,
    status: parsed.data.status,
    assignee_id: parsed.data.assignee_id,
    due_date: parsed.data.due_date ?? null,
    completed_area_m2: parsed.data.completed_area_m2 ?? null,
  };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_task_with_checklist", {
    p_task: task,
    p_checklist_items: parsed.data.checklist_items,
  });

  if (error || !data) {
    console.error("Unable to create project task", error);
    return { formError: "The task could not be created. Please try again." };
  }

  revalidateTaskCreationRoutes(project.id);
  return { success: true };
}

export async function updateTaskStatus(
  _previousState: TaskStatusActionState,
  formData: FormData,
): Promise<TaskStatusActionState> {
  const result = await updateTaskStatusMutation(getTaskStatusInput(formData));
  if (result.success) revalidateMyTasks();
  return toTaskStatusActionState(result);
}

export type TaskDeleteActionState = {
  formError?: string;
  success?: true;
};

export async function deleteProjectTask(taskId: string): Promise<TaskDeleteActionState> {
  const authorization = await authorizeTaskMutation(taskId);
  if (!authorization.success) return { formError: authorization.formError };
  if (!authorization.isStudioAdmin) {
    return { formError: "Only active studio administrators can delete tasks." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", authorization.task.id)
    .eq("project_id", authorization.task.project_id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("Unable to delete project task", error);
    return { formError: "The task could not be deleted. Please try again." };
  }

  revalidateTaskDeletionRoutes(authorization.task.project_id);
  return { success: true };
}
