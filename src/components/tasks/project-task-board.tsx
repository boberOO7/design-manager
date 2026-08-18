"use client";

import {
  DragDropProvider,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/react";
import { ChevronDown, GripVertical, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AddTaskDialog } from "@/components/tasks/add-task-dialog";
import { TaskDetailsDrawer } from "@/components/tasks/task-details-drawer";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import {
  BOARD_COLUMNS,
  canMoveTask,
  getTaskStatusForDrop,
  groupTasksByBoardColumn,
  isBoardColumnId,
  isTaskOverdue,
  mergeProjectTask,
  reconcileProjectTasks,
  setProjectTaskStatus,
  shouldOpenTaskDrawer,
  type BoardColumnId,
  type WritableTaskStatus,
} from "@/lib/tasks";
import { cn, formatDateShort, formatNumber } from "@/lib/utils";
import { getPriorityBadgeStyle, getTaskStatusBadgeStyle, getTaskStatusColumnStyle, getTaskStatusCountBadgeClassName } from "@/lib/semantic-styles";
import type { ProjectTask } from "@/types/tasks";
import { getBoardTaskProgressSummary } from "@/lib/task-card-presentation";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";
import { getAutomaticProjectStatus, isProjectLifecycleStatus, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { isTaskStage, TASK_STAGES, type TaskStage } from "@/lib/task-stages";

const COLUMN_DROP_ID_PREFIX = "task-column:";
const interactiveSelector = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[role]",
  "[data-no-drag]",
].join(",");

const pointerSensor = PointerSensor.configure({
  activationConstraints(event, source) {
    const constraints = PointerSensor.defaults.activationConstraints;
    return typeof constraints === "function" ? constraints(event, source) : constraints;
  },
  preventActivation(event, source) {
    if (!(event.target instanceof Element)) return false;
    const interactiveElement = event.target.closest(interactiveSelector);
    return interactiveElement !== null && interactiveElement !== source.element;
  },
});

const keyboardSensor = KeyboardSensor.configure({ offset: 320 });
const sensors = [pointerSensor, keyboardSensor];

function getColumnDropId(stage: TaskStage, columnId: BoardColumnId): string {
  return `${COLUMN_DROP_ID_PREFIX}${stage}:${columnId}`;
}

function getDropTarget(id: string | number | undefined): { stage: TaskStage; columnId: BoardColumnId } | null {
  if (id === undefined) return null;
  const value = String(id);
  if (!value.startsWith(COLUMN_DROP_ID_PREFIX)) return null;
  const [stage, columnId] = value.slice(COLUMN_DROP_ID_PREFIX.length).split(":");
  return isTaskStage(stage) && isBoardColumnId(columnId)
    ? { stage, columnId }
    : null;
}

function isSuccessfulTaskStatusResponse(value: unknown): value is { success: true; projectStatus: string; task: ProjectTask } {
  return typeof value === "object"
    && value !== null
    && "success" in value
    && value.success === true
    && "projectStatus" in value
    && typeof value.projectStatus === "string"
    && "task" in value
    && typeof value.task === "object"
    && value.task !== null;
}

function TaskCardContent({
  isOverlay = false,
  isPending = false,
  showGrip = false,
  task,
}: {
  isOverlay?: boolean;
  isPending?: boolean;
  showGrip?: boolean;
  task: ProjectTask;
}) {
  const t = useTranslations("Tasks");
  const card = useTranslations("BoardTaskCard");
  const priority = useTranslations("Priority");
  const status = useTranslations("Status");
  const locale = useLocale();
  const overdue = isTaskOverdue(task);
  const progress = getBoardTaskProgressSummary(task);

  return (
    <div className={cn("rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3", isOverlay && "scale-[1.02] shadow-xl")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          {showGrip ? <GripVertical className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-subtle)]" aria-hidden="true" /> : null}
          <h4 className="line-clamp-2 min-w-0 text-sm font-medium leading-5 text-[var(--ui-text)] [overflow-wrap:anywhere]" title={task.title}>{task.title}</h4>
        </div>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-4 ${getPriorityBadgeStyle(task.priority).className}`}>{priority(task.priority)}</span>
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 text-xs leading-4">
        <div className="flex min-w-0 items-center gap-1.5 text-[var(--ui-text-muted)]">
          <UserAvatar imageUrl={task.assignee?.avatar_url} name={task.assignee?.full_name} size="boardCard" decorative />
          <span className="truncate">{task.assignee?.full_name ?? t("unassigned")}</span>
        </div>
        {progress ? <span className="ui-numeric whitespace-nowrap font-medium text-[var(--ui-text-secondary)]">{progress.kind === "checklist"
          ? card("checklistProgress", { completed: progress.completed, total: progress.total, percent: formatNumber(progress.percent, locale) })
          : card("manualProgress", { percent: formatNumber(progress.percent, locale) })}</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--ui-border-subtle)] pt-2 text-xs leading-4 text-[var(--ui-text-muted)]">
        {task.due_date ? <span>{t("due", { date: formatDateShort(task.due_date, locale) })}</span> : <span>{t("noDueDate")}</span>}
        {overdue ? <span className="rounded-full bg-[var(--ui-danger-surface)] px-1.5 py-0.5 font-medium leading-4 text-[var(--ui-danger-text)]">{t("overdue")}</span> : null}
        {task.status === "cancelled" ? <span className={`rounded-full px-1.5 py-0.5 font-medium leading-4 ${getTaskStatusBadgeStyle(task.status).className}`}>{status("cancelled")}</span> : null}
        {isPending ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ui-info-surface)] px-1.5 py-0.5 font-medium leading-4 text-[var(--ui-info-text)]">
            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> {t("saving")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DraggableTaskCard({
  isPending,
  onOpen,
  shouldSuppressOpen,
  task,
}: {
  isPending: boolean;
  onOpen: (taskId: string) => void;
  shouldSuppressOpen: () => boolean;
  task: ProjectTask;
}) {
  const t = useTranslations("Tasks");
  const { isDragging, ref } = useDraggable({
    id: task.id,
    disabled: isPending,
    data: { taskId: task.id },
    type: "project-task",
  });

  return (
    <button
      type="button"
      ref={ref}
      role="button"
      tabIndex={isPending ? -1 : 0}
      aria-label={t("openTaskDrag", { name: task.title })}
      aria-disabled={isPending}
      aria-busy={isPending}
      onClick={() => {
        if (shouldOpenTaskDrawer(shouldSuppressOpen())) {
          onOpen(task.id);
        }
      }}
      className={cn(
        "w-full select-none rounded-xl text-left outline-none transition-[opacity,transform,box-shadow] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2",
        isPending ? "cursor-wait" : "cursor-grab active:cursor-grabbing",
        isDragging && "cursor-grabbing opacity-30",
      )}
      style={{ touchAction: "pan-x pan-y" }}
    >
      <TaskCardContent task={task} isPending={isPending} showGrip />
    </button>
  );
}

function ReadOnlyTaskCard({ task, onOpen }: { task: ProjectTask; onOpen: (taskId: string) => void }) {
  const t = useTranslations("Tasks");
  return (
    <button type="button" onClick={() => onOpen(task.id)} className="w-full cursor-pointer rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2" aria-label={t("openTask", { name: task.title })}>
      <TaskCardContent task={task} />
    </button>
  );
}

function StatusColumnHeader({ columnId, label, status, taskCount }: {
  columnId: BoardColumnId;
  label: string;
  status: WritableTaskStatus;
  taskCount: number;
}) {
  const columnStyle = getTaskStatusColumnStyle(status);

  return (
    <div className={cn("mb-2 flex items-center justify-between gap-2 rounded-lg border px-2 py-2", columnStyle.headerClassName)}>
      <h3 id={`column-${columnId}`} className="text-sm font-semibold">{label}</h3>
      <span className={cn("ui-numeric rounded-full px-1.5 py-0.5 text-xs font-medium leading-4", getTaskStatusCountBadgeClassName(status, taskCount))}>{taskCount}</span>
    </div>
  );
}

function BoardColumn({
  activeTask,
  canManageTasks,
  columnId,
  currentUserId,
  isProjectReadOnly,
  label,
  status,
  stage,
  onOpenTask,
  pendingTaskIds,
  shouldSuppressOpen,
  tasks,
}: {
  activeTask: ProjectTask | null;
  canManageTasks: boolean;
  columnId: BoardColumnId;
  currentUserId: string;
  isProjectReadOnly: boolean;
  label: string;
  status: WritableTaskStatus;
  stage: TaskStage;
  onOpenTask: (taskId: string) => void;
  pendingTaskIds: Set<string>;
  shouldSuppressOpen: () => boolean;
  tasks: ProjectTask[];
}) {
  const t = useTranslations("Tasks");
  const acceptsActiveTask = activeTask !== null
    && activeTask.stage === stage
    && getTaskStatusForDrop(activeTask.status, columnId) !== null;
  const { isDropTarget, ref } = useDroppable({
    id: getColumnDropId(stage, columnId),
    disabled: activeTask !== null && !acceptsActiveTask,
    data: { columnId, stage },
    type: "task-column",
    accept: "project-task",
  });
  const isHighlighted = acceptsActiveTask && isDropTarget;
  return (
    <section
      ref={ref}
      aria-labelledby={`column-${columnId}`}
      className={cn(
        "flex min-h-72 min-w-0 flex-col rounded-xl border p-3 transition-[border-color,background-color,box-shadow]",
        isHighlighted
          ? "border-[var(--ui-focus)] bg-[var(--ui-surface-strong)] ring-2 ring-[var(--ui-focus)] shadow-md"
          : "border-[var(--ui-border)] bg-[var(--ui-surface-muted)]",
      )}
    >
      <StatusColumnHeader columnId={columnId} label={label} status={status} taskCount={tasks.length} />
      {isHighlighted ? <p className="mb-2 rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-2 py-1.5 text-center text-xs font-medium leading-4 text-[var(--ui-text-secondary)]">{t("releaseToMove", { status: label })}</p> : null}
      <div className="flex flex-1 flex-col gap-2">
        {tasks.length === 0 ? (
          <div className="flex min-h-28 flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-4 text-center text-sm text-[var(--ui-text-muted)]">{t("noTasks")}</div>
        ) : tasks.map((task) => {
          const canDrag = canMoveTask({
            assigneeId: task.assignee_id,
            currentUserId,
            isAdmin: canManageTasks,
            isProjectReadOnly,
          });
          return canDrag
            ? <DraggableTaskCard key={task.id} task={task} isPending={pendingTaskIds.has(task.id)} onOpen={onOpenTask} shouldSuppressOpen={shouldSuppressOpen} />
            : <ReadOnlyTaskCard key={task.id} task={task} onOpen={onOpenTask} />;
        })}
      </div>
    </section>
  );
}

export function ProjectTaskBoard({
  canCreate,
  canManageTasks,
  currentUserId,
  initialTaskId,
  isProjectReadOnly,
  members,
  projectId,
  projectStatus,
  tasks,
  templates,
  onTasksChange,
  onProjectStatusChange,
}: {
  canCreate: boolean;
  canManageTasks: boolean;
  currentUserId: string;
  initialTaskId?: string;
  isProjectReadOnly: boolean;
  members: AssignableProjectMember[];
  projectId: string;
  projectStatus: ProjectLifecycleStatus;
  tasks: ProjectTask[];
  templates: StudioChecklistTemplate[];
  onTasksChange?: (tasks: ProjectTask[]) => void;
  onProjectStatusChange?: (status: ProjectLifecycleStatus) => void;
}) {
  const t = useTranslations("Tasks");
  const statusLabels = useTranslations("Status");
  const stageLabels = useTranslations("TaskStages");
  const [localTasks, setLocalTasks] = useState(tasks);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [boardError, setBoardError] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<Record<TaskStage, boolean>>({ stage_1: true, stage_2: false, stage_3: false, stage_4: false });
  const [stageLayoutReady, setStageLayoutReady] = useState(false);
  const [requestedCreationStage, setRequestedCreationStage] = useState<TaskStage | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => tasks.some((task) => task.id === initialTaskId) ? initialTaskId ?? null : null);
  const localTasksRef = useRef(localTasks);
  const pendingTaskIdsRef = useRef(new Set<string>());
  const previousStatusesRef = useRef(new Map<string, ProjectTask["status"]>());
  const previousTasksRef = useRef(new Map<string, ProjectTask>());
  const confirmedStatusesRef = useRef(new Map<string, WritableTaskStatus>());
  const suppressCardOpenRef = useRef(false);
  const onTasksChangeRef = useRef(onTasksChange);
  const stageLayoutKey = `project-task-board:stages:${projectId}:${currentUserId}`;

  useLayoutEffect(() => {
    try {
      const stored = window.localStorage.getItem(stageLayoutKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (typeof parsed === "object" && parsed !== null) {
          window.queueMicrotask(() => {
            setExpandedStages((defaults) => TASK_STAGES.reduce<Record<TaskStage, boolean>>((next, stage) => ({
              ...next,
              [stage]: typeof (parsed as Record<string, unknown>)[stage] === "boolean"
                ? (parsed as Record<string, boolean>)[stage]
                : defaults[stage],
            }), {} as Record<TaskStage, boolean>));
          });
        }
      }
    } catch {
      // A malformed preference is safely replaced by the default layout.
    }
    window.queueMicrotask(() => setStageLayoutReady(true));
  }, [stageLayoutKey]);

  useEffect(() => {
    if (!stageLayoutReady) return;
    window.localStorage.setItem(stageLayoutKey, JSON.stringify(expandedStages));
  }, [expandedStages, stageLayoutKey, stageLayoutReady]);

  useEffect(() => {
    onTasksChangeRef.current = onTasksChange;
  }, [onTasksChange]);

  useEffect(() => {
    localTasksRef.current = localTasks;
    onTasksChangeRef.current?.(localTasks);
  }, [localTasks]);

  useEffect(() => {
    setLocalTasks((currentTasks) => {
      for (const serverTask of tasks) {
        const confirmedStatus = confirmedStatusesRef.current.get(serverTask.id);
        if (confirmedStatus === serverTask.status) confirmedStatusesRef.current.delete(serverTask.id);
      }

      return reconcileProjectTasks(
        tasks,
        currentTasks,
        pendingTaskIdsRef.current,
        confirmedStatusesRef.current,
      );
    });
  }, [tasks]);

  const groupsByStage = TASK_STAGES.reduce<Record<TaskStage, ReturnType<typeof groupTasksByBoardColumn>>>((groups, stage) => ({
    ...groups,
    [stage]: groupTasksByBoardColumn(localTasks.filter((task) => task.stage === stage)),
  }), {} as Record<TaskStage, ReturnType<typeof groupTasksByBoardColumn>>);
  const activeTask = activeTaskId
    ? localTasks.find((task) => task.id === activeTaskId) ?? null
    : null;
  const selectedTask = selectedTaskId
    ? localTasks.find((task) => task.id === selectedTaskId) ?? null
    : null;

  function setTaskPending(taskId: string, pending: boolean) {
    const nextPendingTaskIds = new Set(pendingTaskIdsRef.current);
    if (pending) nextPendingTaskIds.add(taskId);
    else nextPendingTaskIds.delete(taskId);
    pendingTaskIdsRef.current = nextPendingTaskIds;
    setPendingTaskIds(nextPendingTaskIds);
  }

  async function persistTaskMove(
    taskId: string,
    taskTitle: string,
    targetStatus: WritableTaskStatus,
    targetLabel: string,
    previousStatus: ProjectTask["status"],
    previousProjectStatus: ProjectLifecycleStatus,
  ) {
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      let result: unknown = null;
      try {
        result = await response.json();
      } catch {
        // A non-JSON response is handled as a safe failed update below.
      }
      if (!response.ok || !isSuccessfulTaskStatusResponse(result)) {
        throw new Error(t("statusUpdateFailed"));
      }

      confirmedStatusesRef.current.set(taskId, targetStatus);
      const mergedTasks = mergeProjectTask(localTasksRef.current, result.task);
      localTasksRef.current = mergedTasks;
      setLocalTasks(mergedTasks);
      if (isProjectLifecycleStatus(result.projectStatus)) onProjectStatusChange?.(result.projectStatus);
      previousStatusesRef.current.delete(taskId);
      previousTasksRef.current.delete(taskId);
      setTaskPending(taskId, false);
      setAnnouncement(t("taskMoved", { name: taskTitle, status: targetLabel }));
    } catch (error) {
      const rollbackTask = previousTasksRef.current.get(taskId);
      const rollbackStatus = previousStatusesRef.current.get(taskId) ?? previousStatus;
      previousStatusesRef.current.delete(taskId);
      previousTasksRef.current.delete(taskId);
      confirmedStatusesRef.current.delete(taskId);
      const rolledBackTasks = rollbackTask
        ? mergeProjectTask(localTasksRef.current, rollbackTask)
        : setProjectTaskStatus(localTasksRef.current, taskId, rollbackStatus);
      localTasksRef.current = rolledBackTasks;
      setLocalTasks(rolledBackTasks);
      onProjectStatusChange?.(previousProjectStatus);
      setTaskPending(taskId, false);
      const message = error instanceof Error ? error.message : t("statusUpdateFailed");
      const restoredMessage = t("statusRestored", { message });
      setBoardError(restoredMessage);
      setAnnouncement(restoredMessage);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const taskId = event.operation.source?.id;
    if (taskId === undefined) return;
    const task = localTasksRef.current.find((item) => item.id === String(taskId));
    if (!task) return;
    suppressCardOpenRef.current = true;
    setActiveTaskId(task.id);
    setBoardError(null);
    setAnnouncement(t("movingTask", { name: task.title }));
  }

  function handleDragEnd(event: DragEndEvent) {
    const taskId = event.operation.source?.id;
    const target = getDropTarget(event.operation.target?.id);
    setActiveTaskId(null);
    window.setTimeout(() => { suppressCardOpenRef.current = false; }, 0);
    if (event.canceled || taskId === undefined || !target) return;

    const task = localTasksRef.current.find((item) => item.id === String(taskId));
    if (!task || pendingTaskIdsRef.current.has(task.id)) return;
    if (task.stage !== target.stage) return;
    const targetStatus = getTaskStatusForDrop(task.status, target.columnId);
    if (!targetStatus) return;
    const targetLabel = statusLabels(targetStatus === "in_progress" ? "inProgress" : targetStatus);
    if (!targetLabel) return;

    previousStatusesRef.current.set(task.id, task.status);
    previousTasksRef.current.set(task.id, task);
    setTaskPending(task.id, true);
    setBoardError(null);
    const optimisticTasks = setProjectTaskStatus(
      localTasksRef.current,
      task.id,
      targetStatus,
    );
    localTasksRef.current = optimisticTasks;
    setLocalTasks(optimisticTasks);
    onProjectStatusChange?.(getAutomaticProjectStatus(projectStatus, targetStatus));

    void persistTaskMove(
      task.id,
      task.title,
      targetStatus,
      targetLabel,
      task.status,
      projectStatus,
    );
  }

  function updateLocalTask(updatedTask: ProjectTask) {
    const mergedTasks = mergeProjectTask(localTasksRef.current, updatedTask);
    localTasksRef.current = mergedTasks;
    setLocalTasks(mergedTasks);
  }

  return (
    <section aria-labelledby="project-board-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="project-board-heading" className="font-semibold text-[var(--ui-text)]">{t("board")}</h2>
          <p className="text-sm text-[var(--ui-text-muted)]">{t("boardInstructions")}</p>
        </div>
        {canCreate ? <AddTaskDialog members={members} onRequestedStageHandled={() => setRequestedCreationStage(null)} projectId={projectId} requestedStage={requestedCreationStage} templates={templates} /> : null}
      </div>
      {boardError ? <div role="alert" className="mb-4 rounded-xl border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] px-4 py-3 text-sm text-[var(--ui-danger-text)]">{boardError}</div> : null}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      <DragDropProvider sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="space-y-3">
          {TASK_STAGES.map((stage) => {
            const isExpanded = expandedStages[stage];
            const taskCount = groupsByStage[stage].todo.length
              + groupsByStage[stage]["in-progress"].length
              + groupsByStage[stage]["client-review"].length
              + groupsByStage[stage].done.length;
            return (
              <section key={stage} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)]">
                <div className="flex min-h-12 items-center gap-2 rounded-xl px-4">
                  <button
                    type="button"
                    aria-controls={`project-stage-${stage}`}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedStages((current) => ({ ...current, [stage]: !current[stage] }))}
                    className="min-w-0 flex-1 py-3 text-left font-semibold text-[var(--ui-text)] outline-none transition-colors hover:text-[var(--ui-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-inset"
                  >
                    {stageLabels(stage)}
                  </button>
                  <span className="ui-numeric rounded-full bg-[var(--ui-surface)] px-2 py-0.5 text-xs font-medium text-[var(--ui-text-secondary)]">{taskCount}</span>
                  {canCreate ? <button type="button" onClick={() => setRequestedCreationStage(stage)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" aria-label={t("addTask")}>
                    <Plus className="size-4" aria-hidden="true" />
                  </button> : null}
                  <button
                    type="button"
                    aria-controls={`project-stage-${stage}`}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedStages((current) => ({ ...current, [stage]: !current[stage] }))}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
                    aria-label={stageLabels(stage)}
                  >
                    <ChevronDown className={cn("size-4 transition-transform duration-200", isExpanded && "rotate-180")} aria-hidden="true" />
                  </button>
                </div>
                <div id={`project-stage-${stage}`} className={cn("grid transition-[grid-template-rows] duration-200 ease-out", isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <div className="min-h-0 overflow-hidden">
                    <div className="grid grid-cols-1 gap-4 border-t border-[var(--ui-border-subtle)] p-3 md:grid-cols-2 xl:grid-cols-4">
                      {BOARD_COLUMNS.map((column) => (
                        <BoardColumn
                          key={column.id}
                          activeTask={activeTask}
                          canManageTasks={canManageTasks}
                          columnId={column.id}
                          currentUserId={currentUserId}
                          isProjectReadOnly={isProjectReadOnly}
                          label={statusLabels(column.status === "in_progress" ? "inProgress" : column.status)}
                          onOpenTask={setSelectedTaskId}
                          pendingTaskIds={pendingTaskIds}
                          shouldSuppressOpen={() => suppressCardOpenRef.current}
                          stage={stage}
                          status={column.status}
                          tasks={groupsByStage[stage][column.id]}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {() => activeTask ? <TaskCardContent task={activeTask} isOverlay showGrip /> : null}
        </DragOverlay>
      </DragDropProvider>
      {selectedTask ? <TaskDetailsDrawer
        key={selectedTask.id}
        canManageTasks={canManageTasks}
        currentUserId={currentUserId}
        isProjectReadOnly={isProjectReadOnly}
        members={members}
        onClose={() => setSelectedTaskId(null)}
        onProjectStatusUpdated={onProjectStatusChange}
        onTaskUpdated={updateLocalTask}
        task={selectedTask}
        templates={templates}
      /> : null}
    </section>
  );
}
