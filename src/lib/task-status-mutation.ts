import type { TaskStatusActionState } from "@/lib/validation/task";
import type { ProjectTask } from "@/types/tasks";

export type TaskStatusMutationResult =
  | { success: true; projectId: string; projectStatus: string }
  | { success: false; formError: string };

export function toTaskStatusActionState(
  result: TaskStatusMutationResult,
): TaskStatusActionState {
  return result.success ? { success: true, projectStatus: result.projectStatus } : { formError: result.formError };
}

export type TaskEditMutationResult =
  | { success: true; task: ProjectTask; projectStatus: string }
  | { success: false; formError: string; fieldErrors?: Record<string, string> };
