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
    return {
      success: false,
      formError: "Please correct the highlighted fields.",
      fieldErrors: Object.fromEntries(
        Object.entries(fields).flatMap(([field, errors]) => errors?.[0] ? [[field, errors[0]]] : []),
      ),
    };
  }

  const authorization = await authorizeTaskMutation(taskId);
  if (!authorization.success) return authorization;
  if (!authorization.isStudioAdmin) {
    return { success: false, formError: "Only active studio administrators can edit task details." };
  }

  const members = await getAssignableProjectMembers(
    authorization.task.project_id,
    authorization.task.project.studio_id,
  );
  if (!members.some((member) => member.id === parsed.data.assignee_id)) {
    return {
      success: false,
      formError: "Please correct the highlighted fields.",
      fieldErrors: { assignee_id: "Choose an active member of this project." },
    };
  }

  const update: Pick<TaskUpdate, "title" | "description" | "assignee_id" | "priority" | "due_date" | "completed_area_m2" | "status"> = {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    assignee_id: parsed.data.assignee_id,
    priority: parsed.data.priority,
    due_date: parsed.data.due_date ?? null,
    completed_area_m2: parsed.data.completed_area_m2 ?? null,
    status: parsed.data.status,
  };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", authorization.task.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("Unable to update task details", error);
    return { success: false, formError: "The task could not be updated. Please try again." };
  }
  revalidatePath("/leaderboard");

  try {
    const task = await getProjectTaskById(data.id);
    if (!task) return { success: false, formError: "The task could not be loaded. Please refresh and try again." };
    const { data: project, error: projectError } = await supabase.from("projects").select("status").eq("id", task.project_id).maybeSingle();
    if (projectError || !project) return { success: false, formError: "The task was updated, but the project could not be refreshed. Please refresh the page." };
    return { success: true, task, projectStatus: project.status };
  } catch (error) {
    console.error("Unable to load updated task", error);
    return { success: false, formError: "The task was updated, but could not be refreshed. Please refresh the page." };
  }
}
