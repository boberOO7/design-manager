import type { TaskStatusActionState } from "@/lib/validation/task";

export type TaskStatusMutationResult =
  | { success: true; projectId: string }
  | { success: false; formError: string };

export function toTaskStatusActionState(
  result: TaskStatusMutationResult,
): TaskStatusActionState {
  return result.success ? { success: true } : { formError: result.formError };
}
