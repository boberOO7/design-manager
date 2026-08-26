import "server-only";

import { revalidatePath } from "next/cache";
import { authorizeTaskMutation } from "@/data/mutations/task-status";
import { getProjectTaskById } from "@/data/queries/tasks";
import { createClient } from "@/lib/supabase/server";
import { checklistItemCreateSchema, checklistItemUpdateSchema, taskProductionProgressSchema } from "@/lib/validation/task";
import type { ProjectTask, TaskChecklistItem } from "@/types/tasks";

export type TaskWorkMutationResult =
  | { success: true; task: ProjectTask; checklistItemId?: string }
  | { success: false; formError: string };

function revalidateProgressConsumers(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
}

async function loadUpdatedTask(taskId: string, projectId: string): Promise<TaskWorkMutationResult> {
  const task = await getProjectTaskById(taskId);
  if (!task) return { success: false, formError: "The task was updated, but could not be refreshed." };
  revalidateProgressConsumers(projectId);
  return { success: true, task };
}

export async function updateTaskProductionProgress(taskId: string, input: unknown): Promise<TaskWorkMutationResult> {
  const parsed = taskProductionProgressSchema.safeParse(input);
  if (!parsed.success) return { success: false, formError: "Enter a production percentage from 0 to 100." };
  const authorization = await authorizeTaskMutation(taskId);
  if (!authorization.success) return authorization;
  if (authorization.task.status !== "in_progress") {
    return { success: false, formError: "Manual production progress is editable only while the task is In progress." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks")
    .update({ production_completion: parsed.data.production_completion, manual_progress_override: true })
    .eq("id", taskId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("Unable to update task production progress", error);
    return { success: false, formError: "Production progress could not be saved. Please try again." };
  }
  return loadUpdatedTask(taskId, authorization.task.project_id);
}

async function authorizeChecklistEdit(taskId: string) {
  const authorization = await authorizeTaskMutation(taskId);
  if (!authorization.success) return authorization;
  if (authorization.task.status !== "todo" && authorization.task.status !== "in_progress") {
    return { success: false as const, formError: "Checklist editing is available only while the task is To do or In progress." };
  }
  return authorization;
}

export async function createChecklistItem(taskId: string, input: unknown): Promise<TaskWorkMutationResult> {
  const parsed = checklistItemCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, formError: parsed.error.issues[0]?.message ?? "Enter a valid checklist item." };
  const authorization = await authorizeChecklistEdit(taskId);
  if (!authorization.success) return authorization;

  const supabase = await createClient();
  const { data, error } = await supabase.from("task_checklist_items").insert({
    task_id: taskId,
    title: parsed.data.title,
    weight: parsed.data.weight,
    position: 0,
  }).select("id").maybeSingle();
  if (error || !data) {
    console.error("Unable to create checklist item", error);
    return { success: false, formError: "The checklist item could not be added. Please try again." };
  }
  const result = await loadUpdatedTask(taskId, authorization.task.project_id);
  return result.success ? { ...result, checklistItemId: data.id } : result;
}

export async function updateChecklistItem(taskId: string, itemId: string, input: unknown): Promise<TaskWorkMutationResult> {
  const parsed = checklistItemUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, formError: parsed.error.issues[0]?.message ?? "Enter a valid checklist change." };
  const authorization = await authorizeChecklistEdit(taskId);
  if (!authorization.success) return authorization;

  const update: Pick<Partial<TaskChecklistItem>, "title" | "weight" | "is_completed"> = {};
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.weight !== undefined) update.weight = parsed.data.weight;
  if (parsed.data.is_completed !== undefined) update.is_completed = parsed.data.is_completed;
  const supabase = await createClient();
  const { data, error } = await supabase.from("task_checklist_items")
    .update(update)
    .eq("id", itemId)
    .eq("task_id", taskId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("Unable to update checklist item", error);
    return { success: false, formError: "The checklist item could not be updated. Please try again." };
  }
  return loadUpdatedTask(taskId, authorization.task.project_id);
}

export async function deleteChecklistItem(taskId: string, itemId: string): Promise<TaskWorkMutationResult> {
  const authorization = await authorizeChecklistEdit(taskId);
  if (!authorization.success) return authorization;
  const supabase = await createClient();
  const { data, error } = await supabase.from("task_checklist_items")
    .delete()
    .eq("id", itemId)
    .eq("task_id", taskId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("Unable to delete checklist item", error);
    return { success: false, formError: "The checklist item could not be deleted. Please try again." };
  }
  return loadUpdatedTask(taskId, authorization.task.project_id);
}
