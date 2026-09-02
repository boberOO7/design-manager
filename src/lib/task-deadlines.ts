import { BOARD_COLUMNS, type WritableTaskStatus } from "@/lib/task-workflow";

export const TASK_MILESTONE_STATUSES = BOARD_COLUMNS
  .map((column) => column.status)
  .filter((status): status is Exclude<WritableTaskStatus, "todo"> => status !== "todo");

export type TaskDeadline = {
  id: string;
  target_status: (typeof TASK_MILESTONE_STATUSES)[number];
  due_date: string;
  created_at?: string;
  updated_at?: string;
};

/** The task-details RPC accepts only these persisted deadline values. */
export type TaskDeadlineInput = Pick<TaskDeadline, "target_status" | "due_date">;

export function toTaskDeadlineInputs<T extends TaskDeadlineInput>(
  deadlines: readonly T[],
): TaskDeadlineInput[] {
  return deadlines.map(({ target_status, due_date }) => ({ target_status, due_date }));
}

type TaskDeadlineRow = { id: string; target_status: string; due_date: string; created_at?: string; updated_at?: string };

const statusOrder = new Map(BOARD_COLUMNS.map((column, index) => [column.status, index]));

export function isTaskMilestoneStatus(value: string): value is TaskDeadline["target_status"] {
  return TASK_MILESTONE_STATUSES.some((status) => status === value);
}

export function getActiveTaskDeadline(task: { status: string; deadlines?: readonly TaskDeadlineRow[] }): TaskDeadline | null {
  if (task.status === "completed" || task.status === "cancelled") return null;
  const currentOrder = statusOrder.get(task.status as WritableTaskStatus) ?? -1;
  return (task.deadlines ?? [])
    .filter((deadline): deadline is TaskDeadline => isTaskMilestoneStatus(deadline.target_status))
    .filter((deadline) => (statusOrder.get(deadline.target_status) ?? -1) > currentOrder)
    .sort((left, right) => (statusOrder.get(left.target_status) ?? 0) - (statusOrder.get(right.target_status) ?? 0))[0] ?? null;
}

export function isTaskDeadlineOverdue(task: { status: string; deadlines?: readonly TaskDeadlineRow[] }, today: string): boolean {
  const deadline = getActiveTaskDeadline(task);
  return deadline !== null && deadline.due_date < today;
}
