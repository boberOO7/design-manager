import type { MyTask, ProjectTask, TaskPriority, TaskStatus } from "../types/tasks";

export type BoardColumnId = "todo" | "in-progress" | "internal-review" | "client-review" | "done";
export type MyTaskGroupId = "overdue" | "today" | "upcoming" | "completed";
export type WritableTaskStatus = TaskStatus & ("todo" | "in_progress" | "internal_review" | "review" | "completed");
export const WRITABLE_TASK_STATUS_VALUES = ["todo", "in_progress", "internal_review", "review", "completed"] as const;

export function isWritableTaskStatus(status: string): status is (typeof WRITABLE_TASK_STATUS_VALUES)[number] {
  return status === "todo"
    || status === "in_progress"
    || status === "internal_review"
    || status === "review"
    || status === "completed";
}

export const BOARD_COLUMNS: ReadonlyArray<{
  id: BoardColumnId;
  label: string;
  status: WritableTaskStatus;
}> = [
  { id: "todo", label: "To do", status: "todo" },
  { id: "in-progress", label: "In progress", status: "in_progress" },
  { id: "internal-review", label: "Internal review", status: "internal_review" },
  { id: "client-review", label: "Client review", status: "review" },
  { id: "done", label: "Done", status: "completed" },
];

const BOARD_COLUMN_BY_STATUS: Record<TaskStatus, BoardColumnId> = {
  todo: "todo",
  in_progress: "in-progress",
  internal_review: "internal-review",
  review: "client-review",
  completed: "done",
  cancelled: "done",
};

const WRITABLE_STATUS_BY_COLUMN: Record<BoardColumnId, WritableTaskStatus> = {
  todo: "todo",
  "in-progress": "in_progress",
  "internal-review": "internal_review",
  "client-review": "review",
  done: "completed",
};

export function isTaskStatus(value: string): value is TaskStatus {
  return value === "todo"
    || value === "in_progress"
    || value === "internal_review"
    || value === "review"
    || value === "completed"
    || value === "cancelled";
}

export function getTaskStatusLabel(status: string): string {
  switch (status) {
    case "todo": return "To do";
    case "in_progress": return "In progress";
    case "internal_review": return "Internal review";
    case "review": return "Client review";
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
  return value === "todo" || value === "in-progress" || value === "internal-review" || value === "client-review" || value === "done";
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

export function canEditTaskWork({
  assigneeId,
  currentUserId,
  isAdmin,
  isProjectReadOnly,
  status,
}: {
  assigneeId: string | null;
  currentUserId: string;
  isAdmin: boolean;
  isProjectReadOnly: boolean;
  status: string;
}): boolean {
  return (status === "todo" || status === "in_progress") && canMoveTask({ assigneeId, currentUserId, isAdmin, isProjectReadOnly });
}

export function groupTasksByBoardColumn(tasks: ProjectTask[]): Record<BoardColumnId, ProjectTask[]> {
  const groups: Record<BoardColumnId, ProjectTask[]> = {
    todo: [],
    "in-progress": [],
    "internal-review": [],
    "client-review": [],
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
  const task = tasks.find((item) => item.id === taskId);
  if (!task || task.status === status) return tasks;
  return tasks.map((item) => item.id === taskId ? getOptimisticTaskForStatus(task, status) : item);
}

export function getOptimisticTaskForStatus(
  task: ProjectTask,
  status: ProjectTask["status"],
): ProjectTask {
  if (task.status === status) return task;
  if (status === "review") {
    return {
      ...task,
      status,
      production_completion: 100,
      checklist_items: task.checklist_items.map((item) => ({ ...item, is_completed: true })),
    };
  }
  return { ...task, status };
}

export function mergeProjectTask<T extends ProjectTask>(tasks: T[], updatedTask: ProjectTask): T[] {
  const taskIds = new Set<string>();
  const merged = tasks.flatMap((task) => {
    if (task.id === updatedTask.id) {
      if (taskIds.has(task.id)) return [];
      taskIds.add(task.id);
      return [{ ...task, ...updatedTask }];
    }
    if (taskIds.has(task.id)) return [];
    taskIds.add(task.id);
    return [task];
  });
  return areProjectTaskSnapshotsEqual(tasks, merged) ? tasks : merged;
}

function areTaskPeopleEqual(
  left: ProjectTask["assignee"],
  right: ProjectTask["assignee"],
): boolean {
  return left?.id === right?.id
    && left?.full_name === right?.full_name
    && left?.job_title === right?.job_title;
}

function areProjectTasksEqual(left: ProjectTask, right: ProjectTask): boolean {
  return left.id === right.id
    && left.project_id === right.project_id
    && left.title === right.title
    && left.description === right.description
    && left.status === right.status
    && left.stage === right.stage
    && left.priority === right.priority
    && left.assignee_id === right.assignee_id
    && left.due_date === right.due_date
    && left.completed_at === right.completed_at
    && left.created_at === right.created_at
    && left.created_by === right.created_by
    && left.completed_area_m2 === right.completed_area_m2
    && left.production_completion === right.production_completion
    && left.progress_weight === right.progress_weight
    && left.checklist_items.length === right.checklist_items.length
    && left.checklist_items.every((item, index) => {
      const other = right.checklist_items[index];
      return other !== undefined
        && item.id === other.id
        && item.title === other.title
        && item.is_completed === other.is_completed
        && item.weight === other.weight
        && item.position === other.position;
    })
    && areTaskPeopleEqual(left.assignee, right.assignee)
    && areTaskPeopleEqual(left.creator, right.creator);
}

export function areProjectTaskSnapshotsEqual(left: readonly ProjectTask[], right: readonly ProjectTask[]): boolean {
  return left === right || (left.length === right.length && left.every((task, index) => {
    const other = right[index];
    return other !== undefined && areProjectTasksEqual(task, other);
  }));
}

export function getProjectTaskSnapshotUpdate(currentTasks: ProjectTask[], nextTasks: ProjectTask[]): ProjectTask[] {
  return areProjectTaskSnapshotsEqual(currentTasks, nextTasks) ? currentTasks : nextTasks;
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

  return getProjectTaskSnapshotUpdate(currentTasks, reconciledTasks);
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
