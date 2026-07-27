"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getProjectById } from "@/data/queries/project-by-id";
import { getAssignableProjectMembers } from "@/data/queries/project-members";
import { getTaskForStatusUpdate } from "@/data/queries/tasks";
import { createClient } from "@/lib/supabase/server";
import {
  getTaskCreationInput,
  getTaskStatusInput,
  taskCreationSchema,
  taskStatusUpdateSchema,
  type TaskActionState,
  type TaskCreationField,
  type TaskStatusActionState,
} from "@/lib/validation/task";
import type { TaskInsert, TaskUpdate } from "@/types/tasks";

function revalidateTaskRoutes(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/my-tasks");
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
      due_date: flattened.due_date?.[0],
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

  const projectMembers = await getAssignableProjectMembers(project.id, project.studio_id);
  if (!projectMembers.some((member) => member.id === parsed.data.assignee_id)) {
    return { fieldErrors: { assignee_id: "Choose an active member of this project." } };
  }

  const task: TaskInsert = {
    project_id: project.id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    priority: parsed.data.priority,
    assignee_id: parsed.data.assignee_id,
    created_by: adminMembership.authenticatedUserId,
    due_date: parsed.data.due_date ?? null,
  };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert(task)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("Unable to create project task", error);
    return { formError: "The task could not be created. Please try again." };
  }

  revalidateTaskRoutes(project.id);
  return { success: true };
}

export async function updateTaskStatus(
  _previousState: TaskStatusActionState,
  formData: FormData,
): Promise<TaskStatusActionState> {
  const parsed = taskStatusUpdateSchema.safeParse(getTaskStatusInput(formData));
  if (!parsed.success) return { formError: "Choose a valid task status." };

  const [profile, membership] = await Promise.all([
    getCurrentUserProfile(),
    getActiveStudioMembership(),
  ]);
  if (!profile || !profile.is_active || !membership || membership.authenticatedUserId !== profile.id) {
    return { formError: "An active studio membership is required." };
  }

  let task;
  try {
    task = await getTaskForStatusUpdate(parsed.data.task_id);
  } catch (error) {
    console.error("Unable to verify task status authorization", error);
    return { formError: "The task could not be verified." };
  }

  if (!task) return { formError: "The task was not found or is not available." };

  const isStudioAdmin = membership.system_role === "admin"
    && task.project.studio_id === membership.studio_id;
  const isAssignee = task.assignee_id === profile.id
    && task.project.studio_id === membership.studio_id;
  if (!isStudioAdmin && !isAssignee) {
    return { formError: "You can update only tasks assigned to you." };
  }

  const update: Pick<TaskUpdate, "status"> = { status: parsed.data.status };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", task.id)
    .select("id, project_id")
    .maybeSingle();

  if (error || !data) {
    console.error("Unable to update task status", error);
    return { formError: "The task status could not be updated. Please try again." };
  }

  revalidateTaskRoutes(data.project_id);
  return { success: true };
}
