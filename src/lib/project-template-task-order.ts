import { getTemplateStageTasks, PROJECT_TEMPLATE_STAGES, type ProjectTemplateStage, type ProjectTemplateTask } from "@/lib/project-templates";

export type ProjectTemplateTaskDestination = {
  stage: ProjectTemplateStage;
  index: number;
};

function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(index, length));
}

/**
 * Resolves an insertion point against the list after the dragged task is removed.
 * This makes the destination safe to use for both the live preview and the final
 * immutable reorder, including same-stage moves below the source item.
 */
export function getProjectTemplateTaskDestination(
  tasks: readonly ProjectTemplateTask[],
  sourceId: string,
  targetStage: ProjectTemplateStage,
  targetId: string | null,
  insertAfter: boolean,
): ProjectTemplateTaskDestination | null {
  const source = tasks.find((task) => task.id === sourceId);
  if (!source) return null;
  if (targetStage !== source.stage) return null;

  const targetTasks = getTemplateStageTasks({ tasks: [...tasks] }, targetStage);
  const sourceIndex = source.stage === targetStage ? targetTasks.findIndex((task) => task.id === sourceId) : -1;
  const targetIndex = targetId === null ? targetTasks.length : targetTasks.findIndex((task) => task.id === targetId);
  if (targetId !== null && targetIndex < 0) return null;

  const indexBeforeSourceRemoval = targetIndex + (targetId !== null && insertAfter ? 1 : 0);
  const indexAfterSourceRemoval = sourceIndex >= 0 && indexBeforeSourceRemoval > sourceIndex
    ? indexBeforeSourceRemoval - 1
    : indexBeforeSourceRemoval;

  return {
    stage: targetStage,
    index: clampIndex(indexAfterSourceRemoval, targetTasks.length - (sourceIndex >= 0 ? 1 : 0)),
  };
}

/** True only when applying the destination would change a task's stage or order. */
export function isProjectTemplateTaskDestinationChange(
  tasks: readonly ProjectTemplateTask[],
  sourceId: string,
  destination: ProjectTemplateTaskDestination,
) {
  const source = tasks.find((task) => task.id === sourceId);
  if (!source) return false;
  if (source.stage !== destination.stage) return true;

  const sourceIndex = getTemplateStageTasks({ tasks: [...tasks] }, source.stage).findIndex((task) => task.id === sourceId);
  return sourceIndex !== destination.index;
}

/** Keeps each stage's rendered order and position data in lockstep without mutation. */
export function moveProjectTemplateTask(
  tasks: readonly ProjectTemplateTask[],
  sourceId: string,
  destination: ProjectTemplateTaskDestination,
) {
  const source = tasks.find((task) => task.id === sourceId);
  if (!source) return [...tasks];
  if (destination.stage !== source.stage) return [...tasks];

  const tasksByStage = new Map(PROJECT_TEMPLATE_STAGES.map((stage) => [
    stage,
    getTemplateStageTasks({ tasks: [...tasks] }, stage).filter((task) => task.id !== sourceId),
  ]));
  const targetTasks = tasksByStage.get(destination.stage);
  if (!targetTasks) return [...tasks];

  const insertionIndex = clampIndex(destination.index, targetTasks.length);
  tasksByStage.set(destination.stage, [
    ...targetTasks.slice(0, insertionIndex),
    { ...source, stage: destination.stage },
    ...targetTasks.slice(insertionIndex),
  ]);

  return PROJECT_TEMPLATE_STAGES.flatMap((stage) =>
    (tasksByStage.get(stage) ?? []).map((task, position) => ({ ...task, position })),
  );
}
