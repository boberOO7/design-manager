import "server-only";

import { revalidatePath } from "next/cache";
import { authorizeTaskMutation } from "@/data/mutations/task-status";
import { getAssignableProjectMembers } from "@/data/queries/project-members";
import { getProjectTaskById } from "@/data/queries/tasks";
import { createClient } from "@/lib/supabase/server";
import type { TaskEditMutationResult } from "@/lib/task-status-mutation";
import { taskEditSchema } from "@/lib/validation/task";
import type { TaskUpdate } from "@/types/tasks";

export async function updateTaskDetailsMutation(
  taskId: string,
  input: unknown,
): Promise<TaskEditMutationResult> {
  const parsed = taskEditSchema.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    const fieldErrors = Object.fromEntries(
      Object.entries(fields).flatMap(([field, errors]) => errors?.[0] ? [[field, errors[0]]] : []),
    );
    return {
      success: false,
      formError: Object.keys(fieldErrors).length
        ? "Please correct the highlighted fields."
        : "The task details could not be validated. Please refresh and try again.",
      fieldErrors,
    };
  }

  const authorization = await authorizeTaskMutation(taskId);
  if (!authorization.success) return authorization;
  if (!authorization.isStudioAdmin) {
    return { success: false, formError: "Only active studio administrators can edit task details." };
  }

  const members = (parsed.data.assignee_id === null && parsed.data.collaborator_ids.length === 0)
    ? []
    : await getAssignableProjectMembers(
      authorization.task.project_id,
      authorization.task.project.studio_id,
    );
  const requestedPeople = [parsed.data.assignee_id, ...parsed.data.collaborator_ids].filter((id): id is string => id !== null);
  if (requestedPeople.some((id) => !members.some((member) => member.id === id))) {
    return {
      success: false,
      formError: "Please correct the highlighted fields.",
      fieldErrors: { assignee_id: "Choose an active member of this project." },
    };
  }

  const update: Pick<TaskUpdate, "title" | "description" | "assignee_id" | "priority" | "completed_area_m2" | "progress_weight" | "stage"> = {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    assignee_id: parsed.data.assignee_id,
    priority: parsed.data.priority,
    completed_area_m2: parsed.data.completed_area_m2 ?? null,
    progress_weight: parsed.data.progress_weight,
    stage: parsed.data.stage,
  };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_task_details_with_collaborators", {
    p_task_id: authorization.task.id,
    p_task: update,
    p_collaborator_ids: parsed.data.collaborator_ids,
    p_deadlines: parsed.data.deadlines,
  });

  if (error) {
    console.error("Unable to update task details", error);
    return { success: false, formError: "The task could not be updated. Please try again." };
  }
  revalidatePath("/leaderboard");
  revalidatePath("/projects");
  revalidatePath("/dashboard");

  try {
    const task = await getProjectTaskById(authorization.task.id);
    if (!task) return { success: false, formError: "The task could not be loaded. Please refresh and try again." };
    const { data: project, error: projectError } = await supabase.from("projects").select("status").eq("id", task.project_id).maybeSingle();
    if (projectError || !project) return { success: false, formError: "The task was updated, but the project could not be refreshed. Please refresh the page." };
    return { success: true, task, projectStatus: project.status };
  } catch (error) {
    console.error("Unable to load updated task", error);
    return { success: false, formError: "The task was updated, but could not be refreshed. Please refresh the page." };
  }
}
