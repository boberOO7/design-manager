import "server-only";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { createClient } from "@/lib/supabase/server";
import { countOpenLifecycleTasks, getLifecycleCompletedAt, hasProgressedEligibleTasks, isProjectLifecycleStatus, validateLifecycleTransition, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { getTodayDateOnly } from "@/lib/project-progress";

export type ProjectLifecycleMutationResult =
  | { success: true; status: ProjectLifecycleStatus }
  | { success: false; formError: string; openTaskCount?: number };

export async function updateProjectLifecycleStatus(projectId: string, requestedStatus: string): Promise<ProjectLifecycleMutationResult> {
  if (!isProjectLifecycleStatus(requestedStatus) || requestedStatus === "archived") return { success: false, formError: "Choose a valid project lifecycle action." };
  const membership = await getActiveStudioAdmin();
  if (!membership) return { success: false, formError: "Only active studio administrators can manage project lifecycle." };
  const project = await getProjectById(projectId);
  if (!project || project.studio_id !== membership.studio_id || project.status === "archived" || project.archived_at) return { success: false, formError: "The project was not found or is not available." };
  if (!isProjectLifecycleStatus(project.status)) return { success: false, formError: "The project has an unsupported lifecycle status." };

  const supabase = await createClient();
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("stage, status")
    .eq("project_id", project.id)
    .overrideTypes<Array<{ stage: string; status: string }>, { merge: false }>();
  if (tasksError || !tasks) return { success: false, formError: "The project lifecycle could not be verified. Please try again." };
  const openTaskCount = countOpenLifecycleTasks(tasks);
  const transition = validateLifecycleTransition({ from: project.status, to: requestedStatus, openTaskCount, hasProgressedEligibleTasks: hasProgressedEligibleTasks(tasks) });
  if (!transition.valid) {
    if (transition.reason === "open_tasks") return { success: false, openTaskCount, formError: `This project still has ${openTaskCount} open ${openTaskCount === 1 ? "task" : "tasks"}. Complete or cancel the remaining tasks before closing the project.` };
    if (transition.reason === "progressed_tasks") return { success: false, formError: "Return to planned is available only while every eligible task is still to do." };
    return { success: false, formError: "That lifecycle action is not available for this project." };
  }
  const { data, error } = await supabase
    .from("projects")
    .update({ status: requestedStatus, completed_at: getLifecycleCompletedAt({ from: project.status, to: requestedStatus, completedAt: project.completed_at, today: getTodayDateOnly() }) })
    .eq("id", project.id)
    .eq("studio_id", membership.studio_id)
    .select("status")
    .maybeSingle();
  if (error || !data || !isProjectLifecycleStatus(data.status)) return { success: false, formError: "The project lifecycle could not be updated. Please try again." };
  revalidatePath("/leaderboard");
  return { success: true, status: data.status };
}
