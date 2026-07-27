import type { TaskStatusActionState } from "@/lib/validation/task";
import type { ProjectTask } from "@/types/tasks";

export type TaskStatusMutationResult =
  | { success: true; projectId: string }
  | { success: false; formError: string };

export function toTaskStatusActionState(
  result: TaskStatusMutationResult,
): TaskStatusActionState {
  return result.success ? { success: true } : { formError: result.formError };
}

export type TaskEditMutationResult =
  | { success: true; task: ProjectTask }
  | { success: false; formError: string; fieldErrors?: Record<string, string> };
