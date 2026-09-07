import type { TaskStage } from "@/lib/task-stages";
import type { WritableTaskStatus } from "@/lib/task-workflow";

export type TaskBoardSelection = {
  stage: TaskStage | null;
  taskIds: string[];
};

export function toggleTaskBoardSelection(
  selection: TaskBoardSelection,
  task: { id: string; stage: TaskStage },
): TaskBoardSelection {
  if (selection.stage !== task.stage) return { stage: task.stage, taskIds: [task.id] };
  if (selection.taskIds.includes(task.id)) {
    const taskIds = selection.taskIds.filter((taskId) => taskId !== task.id);
    return { stage: taskIds.length ? task.stage : null, taskIds };
  }
  return { stage: task.stage, taskIds: [...selection.taskIds, task.id] };
}

export function getBulkMoveBatch(
  tasks: ReadonlyArray<{ id: string; stage: TaskStage; status: string }>,
  selection: TaskBoardSelection,
  targetStatus: WritableTaskStatus,
): { stage: TaskStage; sourceStatuses: string[]; taskIds: string[] } | null {
  if (!selection.stage || selection.taskIds.length === 0) return null;
  const selectedIds = new Set(selection.taskIds);
  const selectedTasks = tasks.filter((task) => selectedIds.has(task.id));
  if (selectedTasks.length !== selection.taskIds.length || selectedTasks.some((task) => task.stage !== selection.stage)) return null;
  const movingTasks = selectedTasks.filter((task) => task.status !== targetStatus);
  if (movingTasks.length === 0) return null;
  return {
    stage: selection.stage,
    sourceStatuses: [...new Set(movingTasks.map((task) => task.status))],
    taskIds: movingTasks.map((task) => task.id),
  };
}
