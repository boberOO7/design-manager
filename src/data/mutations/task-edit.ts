import "server-only";

import { revalidatePath } from "next/cache";
import { authorizeTaskMutation } from "@/data/mutations/task-status";
import { getAssignableProjectMembers } from "@/data/queries/project-members";
import { getProjectTaskById, getProjectTasks } from "@/data/queries/tasks";
import { getProjectStageColumns } from "@/data/queries/project-stage-columns";
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
  const stageColumns = await getProjectStageColumns(authorization.task.project_id);
  if (!stageColumns[parsed.data.stage].includes(parsed.data.status)) return { success: false, formError: "Choose a status enabled for the destination stage.", fieldErrors: { status: "Choose a status enabled for the destination stage." } };
  if ((parsed.data.status === "review" || parsed.data.status === "completed")
    && authorization.task.task_checklist_items.some((item) => !item.is_completed)) {
    return { success: false, formError: "Complete every checklist item before moving this task to Client review or Done." };
  }

  const members = parsed.data.assignee_id === null
    ? []
    : await getAssignableProjectMembers(
      authorization.task.project_id,
      authorization.task.project.studio_id,
    );
  if (parsed.data.assignee_id !== null && !members.some((member) => member.id === parsed.data.assignee_id)) {
    return {
      success: false,
      formError: "Please correct the highlighted fields.",
      fieldErrors: { assignee_id: "Choose an active member of this project." },
    };
  }
  if (authorization.task.project.progress_method === "area") {
    const projectTasks = await getProjectTasks(authorization.task.project_id);
    const otherArea = projectTasks.filter((task) => task.id !== authorization.task.id && task.status !== "cancelled").reduce((total, task) => total + Number(task.completed_area_m2 ?? 0), 0);
    const nextArea = otherArea + Number(parsed.data.completed_area_m2 ?? 0);
    if (nextArea > authorization.task.project.total_area_m2) {
      return { success: false, formError: "Please correct the highlighted fields.", fieldErrors: { completed_area_m2: `Task areas cannot exceed the ${authorization.task.project.total_area_m2} m² design scope.` } };
    }
  }

  const update: Pick<TaskUpdate, "title" | "description" | "assignee_id" | "priority" | "due_date" | "completed_area_m2" | "progress_weight" | "stage" | "status"> = {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    assignee_id: parsed.data.assignee_id,
    priority: parsed.data.priority,
    due_date: parsed.data.due_date ?? null,
    completed_area_m2: parsed.data.completed_area_m2 ?? null,
    progress_weight: parsed.data.progress_weight,
    stage: parsed.data.stage,
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
  revalidatePath("/projects");
  revalidatePath("/dashboard");

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
