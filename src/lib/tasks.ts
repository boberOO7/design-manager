import type { MyTask, ProjectTask, TaskPriority, TaskStatus } from "../types/tasks";

export type BoardColumnId = "todo" | "in-progress" | "done";
export type MyTaskGroupId = "overdue" | "today" | "upcoming" | "completed";
export type WritableTaskStatus = TaskStatus & ("todo" | "in_progress" | "completed");
export const WRITABLE_TASK_STATUS_VALUES = ["todo", "in_progress", "completed"] as const;

export function isWritableTaskStatus(status: string): status is (typeof WRITABLE_TASK_STATUS_VALUES)[number] {
  return status === "todo" || status === "in_progress" || status === "completed";
}

export const BOARD_COLUMNS: ReadonlyArray<{
  id: BoardColumnId;
  label: string;
  status: WritableTaskStatus;
}> = [
  { id: "todo", label: "To do", status: "todo" },
  { id: "in-progress", label: "In progress", status: "in_progress" },
  { id: "done", label: "Done", status: "completed" },
];

const BOARD_COLUMN_BY_STATUS: Record<TaskStatus, BoardColumnId> = {
  todo: "todo",
  in_progress: "in-progress",
  review: "in-progress",
  completed: "done",
  cancelled: "done",
};

const WRITABLE_STATUS_BY_COLUMN: Record<BoardColumnId, WritableTaskStatus> = {
  todo: "todo",
  "in-progress": "in_progress",
  done: "completed",
};

export function isTaskStatus(value: string): value is TaskStatus {
  return value === "todo"
    || value === "in_progress"
    || value === "review"
    || value === "completed"
    || value === "cancelled";
}

export function getTaskStatusLabel(status: string): string {
  switch (status) {
    case "todo": return "To do";
    case "in_progress": return "In progress";
    case "review": return "Review";
    case "completed": return "Done";
    case "cancelled": return "Cancelled";
    default: return "Unknown";
  }
}

export function getTaskPriorityLabel(priority: TaskPriority | string): string {
  switch (priority) {
    case "low": return "Low";
    case "normal": return "Normal";
    case "high": return "High";
    case "urgent": return "Urgent";
    default: return "Unknown";
  }
}

export function isTaskFinished(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

export function isTaskOverdue(
  task: Pick<ProjectTask, "due_date" | "status">,
  today = [new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, "0"), String(new Date().getDate()).padStart(2, "0")].join("-"),
): boolean {
  return Boolean(task.due_date && task.due_date < today && !isTaskFinished(task.status));
}

export function getBoardColumn(status: string): BoardColumnId {
  return isTaskStatus(status) ? BOARD_COLUMN_BY_STATUS[status] : "todo";
}

export function getWritableStatusForBoardColumn(
  columnId: BoardColumnId,
): WritableTaskStatus {
  return WRITABLE_STATUS_BY_COLUMN[columnId];
}

export function getTaskStatusForDrop(
  currentStatus: string,
  targetColumnId: BoardColumnId,
): WritableTaskStatus | null {
  if (getBoardColumn(currentStatus) === targetColumnId) return null;
  return getWritableStatusForBoardColumn(targetColumnId);
}

export function isBoardColumnId(value: string): value is BoardColumnId {
  return value === "todo" || value === "in-progress" || value === "done";
}

export function canMoveTask({
  assigneeId,
  currentUserId,
  isAdmin,
  isProjectReadOnly,
}: {
  assigneeId: string | null;
  currentUserId: string;
  isAdmin: boolean;
  isProjectReadOnly: boolean;
}): boolean {
  if (isProjectReadOnly) return false;
  return isAdmin || (assigneeId !== null && assigneeId === currentUserId);
}

export function canEditTaskDetails({
  isAdmin,
  isProjectReadOnly,
}: {
  isAdmin: boolean;
  isProjectReadOnly: boolean;
}): boolean {
  return isAdmin && !isProjectReadOnly;
}

export function groupTasksByBoardColumn(tasks: ProjectTask[]): Record<BoardColumnId, ProjectTask[]> {
  const groups: Record<BoardColumnId, ProjectTask[]> = {
    todo: [],
    "in-progress": [],
    done: [],
  };

  for (const task of tasks) groups[getBoardColumn(task.status)].push(task);
  return groups;
}

export function setProjectTaskStatus(
  tasks: ProjectTask[],
  taskId: string,
  status: ProjectTask["status"],
): ProjectTask[] {
  return tasks.map((task) => task.id === taskId ? { ...task, status } : task);
}

export function mergeProjectTask<T extends ProjectTask>(tasks: T[], updatedTask: ProjectTask): T[] {
  const taskIds = new Set<string>();
  return tasks.flatMap((task) => {
    if (task.id === updatedTask.id) {
      if (taskIds.has(task.id)) return [];
      taskIds.add(task.id);
      return [{ ...task, ...updatedTask }];
    }
    if (taskIds.has(task.id)) return [];
    taskIds.add(task.id);
    return [task];
  });
}

export function shouldOpenTaskDrawer(dragWasActivated: boolean): boolean {
  return !dragWasActivated;
}

export function reconcileProjectTasks(
  serverTasks: ProjectTask[],
  currentTasks: ProjectTask[],
  pendingTaskIds: ReadonlySet<string>,
  confirmedStatuses: ReadonlyMap<string, WritableTaskStatus>,
): ProjectTask[] {
  const currentById = new Map(currentTasks.map((task) => [task.id, task]));
  const seenTaskIds = new Set<string>();
  const reconciledTasks: ProjectTask[] = [];

  for (const serverTask of serverTasks) {
    if (seenTaskIds.has(serverTask.id)) continue;
    seenTaskIds.add(serverTask.id);
    const currentTask = currentById.get(serverTask.id);
    const confirmedStatus = confirmedStatuses.get(serverTask.id);

    if (pendingTaskIds.has(serverTask.id) && currentTask) {
      reconciledTasks.push(currentTask);
    } else if (confirmedStatus && serverTask.status !== confirmedStatus) {
      reconciledTasks.push({ ...serverTask, status: confirmedStatus });
    } else {
      reconciledTasks.push(serverTask);
    }
  }

  for (const currentTask of currentTasks) {
    if (!seenTaskIds.has(currentTask.id) && pendingTaskIds.has(currentTask.id)) {
      reconciledTasks.push(currentTask);
    }
  }

  return reconciledTasks;
}

export function groupMyTasks(
  tasks: MyTask[],
  today = new Date().toISOString().slice(0, 10),
): Record<MyTaskGroupId, MyTask[]> {
  const groups: Record<MyTaskGroupId, MyTask[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    completed: [],
  };

  for (const task of tasks) {
    if (isTaskFinished(task.status)) groups.completed.push(task);
    else if (task.due_date && task.due_date < today) groups.overdue.push(task);
    else if (task.due_date === today) groups.today.push(task);
    else groups.upcoming.push(task);
  }

  return groups;
}
