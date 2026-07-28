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
import { GripVertical, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AddTaskDialog } from "@/components/tasks/add-task-dialog";
import { TaskDetailsDrawer } from "@/components/tasks/task-details-drawer";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import {
  BOARD_COLUMNS,
  canMoveTask,
  getTaskPriorityLabel,
  getTaskStatusForDrop,
  getTaskStatusLabel,
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
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/utils";
import type { ProjectTask } from "@/types/tasks";
import { getAutomaticProjectStatus, isProjectLifecycleStatus, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";

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

function getColumnDropId(columnId: BoardColumnId): string {
  return `${COLUMN_DROP_ID_PREFIX}${columnId}`;
}

function getColumnIdFromDropTarget(id: string | number | undefined): BoardColumnId | null {
  if (id === undefined) return null;
  const value = String(id);
  if (!value.startsWith(COLUMN_DROP_ID_PREFIX)) return null;
  const columnId = value.slice(COLUMN_DROP_ID_PREFIX.length);
  return isBoardColumnId(columnId) ? columnId : null;
}

function priorityClassName(priority: string): string {
  if (priority === "urgent") return "bg-red-100 text-red-800";
  if (priority === "high") return "bg-amber-100 text-amber-800";
  return "bg-stone-100 text-stone-700";
}

function isSuccessfulTaskStatusResponse(value: unknown): value is { success: true; projectStatus: string } {
  return typeof value === "object"
    && value !== null
    && "success" in value
    && value.success === true
    && "projectStatus" in value
    && typeof value.projectStatus === "string";
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
  const overdue = isTaskOverdue(task);

  return (
    <div className={cn("rounded-xl border border-stone-200 bg-white p-4", isOverlay ? "scale-[1.02] shadow-2xl" : "shadow-sm")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-1.5">
          {showGrip ? <GripVertical className="mt-0.5 size-4 shrink-0 text-stone-300" aria-hidden="true" /> : null}
          <h4 className="min-w-0 font-medium leading-5 text-stone-900">{task.title}</h4>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityClassName(task.priority)}`}>{getTaskPriorityLabel(task.priority)}</span>
      </div>
      <p className="mt-2 truncate text-sm text-stone-500">{task.assignee?.full_name ?? "Unassigned"}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        {task.due_date ? <span>Due {formatDateShort(task.due_date)}</span> : <span>No due date</span>}
        {overdue ? <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">Overdue</span> : null}
        {(task.status === "review" || task.status === "cancelled") ? <span className="rounded-full bg-stone-100 px-2 py-0.5">{getTaskStatusLabel(task.status)}</span> : null}
        {isPending ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> Saving
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
  const { isDragging, ref } = useDraggable({
    id: task.id,
    disabled: isPending,
    data: { taskId: task.id },
    type: "project-task",
  });

  return (
    <article
      ref={ref}
      role="button"
      tabIndex={isPending ? -1 : 0}
      aria-label={`Move task ${task.title}. Valid destinations are To do, In progress and Done. Press Space or Enter, then use the arrow keys to choose a column.`}
      aria-disabled={isPending}
      aria-busy={isPending}
      onClick={() => {
        if (shouldOpenTaskDrawer(shouldSuppressOpen())) {
          onOpen(task.id);
        }
      }}
      className={cn(
        "select-none rounded-xl outline-none transition-[opacity,transform,box-shadow] focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2",
        isPending ? "cursor-wait" : "cursor-grab active:cursor-grabbing",
        isDragging && "cursor-grabbing opacity-30",
      )}
      style={{ touchAction: "pan-x pan-y" }}
    >
      <TaskCardContent task={task} isPending={isPending} showGrip />
    </article>
  );
}

function ReadOnlyTaskCard({ task, onOpen }: { task: ProjectTask; onOpen: (taskId: string) => void }) {
  return (
    <article role="button" tabIndex={0} onClick={() => onOpen(task.id)} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") onOpen(task.id);
    }} className="cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2">
      <TaskCardContent task={task} />
    </article>
  );
}

function BoardColumn({
  activeTask,
  canManageTasks,
  columnId,
  currentUserId,
  isProjectReadOnly,
  label,
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
  onOpenTask: (taskId: string) => void;
  pendingTaskIds: Set<string>;
  shouldSuppressOpen: () => boolean;
  tasks: ProjectTask[];
}) {
  const acceptsActiveTask = activeTask !== null
    && getTaskStatusForDrop(activeTask.status, columnId) !== null;
  const { isDropTarget, ref } = useDroppable({
    id: getColumnDropId(columnId),
    disabled: activeTask !== null && !acceptsActiveTask,
    data: { columnId },
    type: "task-column",
    accept: "project-task",
  });
  const isHighlighted = acceptsActiveTask && isDropTarget;

  return (
    <section
      ref={ref}
      aria-labelledby={`column-${columnId}`}
      className={cn(
        "flex min-h-[28rem] min-w-72 flex-col rounded-2xl border bg-stone-100/70 p-3 transition-[border-color,background-color,box-shadow] lg:min-w-0",
        isHighlighted
          ? "border-stone-500 bg-stone-200/80 ring-2 ring-stone-400/40 shadow-md"
          : "border-stone-200",
      )}
    >
      <div className="flex items-center justify-between px-1 pb-3">
        <h3 id={`column-${columnId}`} className="text-sm font-semibold text-stone-800">{label}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600">{tasks.length}</span>
      </div>
      <div className="mb-2 h-9" aria-hidden={!isHighlighted}>
        {isHighlighted ? <p className="rounded-lg border border-stone-300 bg-white/80 px-3 py-2 text-center text-xs font-medium text-stone-700">Release to move to {label}</p> : null}
      </div>
      <div className="flex flex-1 flex-col gap-3">
        {tasks.length === 0 ? (
          <div className="flex min-h-36 flex-1 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white/60 p-5 text-center text-sm text-stone-500">No tasks</div>
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
  onTasksChange?: (tasks: ProjectTask[]) => void;
  onProjectStatusChange?: (status: ProjectLifecycleStatus) => void;
}) {
  const [localTasks, setLocalTasks] = useState(tasks);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [boardError, setBoardError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => tasks.some((task) => task.id === initialTaskId) ? initialTaskId ?? null : null);
  const localTasksRef = useRef(localTasks);
  const pendingTaskIdsRef = useRef(new Set<string>());
  const previousStatusesRef = useRef(new Map<string, ProjectTask["status"]>());
  const confirmedStatusesRef = useRef(new Map<string, WritableTaskStatus>());
  const suppressCardOpenRef = useRef(false);

  useEffect(() => {
    localTasksRef.current = localTasks;
    onTasksChange?.(localTasks);
  }, [localTasks, onTasksChange]);

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

  const groups = groupTasksByBoardColumn(localTasks);
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
        throw new Error("The task status could not be updated.");
      }

      confirmedStatusesRef.current.set(taskId, targetStatus);
      if (isProjectLifecycleStatus(result.projectStatus)) onProjectStatusChange?.(result.projectStatus);
      previousStatusesRef.current.delete(taskId);
      setTaskPending(taskId, false);
      setAnnouncement(`Task ${taskTitle} moved to ${targetLabel}.`);
    } catch {
      const rollbackStatus = previousStatusesRef.current.get(taskId) ?? previousStatus;
      previousStatusesRef.current.delete(taskId);
      confirmedStatusesRef.current.delete(taskId);
      const rolledBackTasks = setProjectTaskStatus(
        localTasksRef.current,
        taskId,
        rollbackStatus,
      );
      localTasksRef.current = rolledBackTasks;
      setLocalTasks(rolledBackTasks);
      onProjectStatusChange?.(previousProjectStatus);
      setTaskPending(taskId, false);
      setBoardError(`Could not move task ${taskTitle}. The previous status was restored.`);
      setAnnouncement(`Could not move task ${taskTitle}. The previous status was restored.`);
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
    setAnnouncement(`Moving task ${task.title}.`);
  }

  function handleDragEnd(event: DragEndEvent) {
    const taskId = event.operation.source?.id;
    const targetColumnId = getColumnIdFromDropTarget(event.operation.target?.id);
    setActiveTaskId(null);
    window.setTimeout(() => { suppressCardOpenRef.current = false; }, 0);
    if (event.canceled || taskId === undefined || !targetColumnId) return;

    const task = localTasksRef.current.find((item) => item.id === String(taskId));
    if (!task || pendingTaskIdsRef.current.has(task.id)) return;
    const targetStatus = getTaskStatusForDrop(task.status, targetColumnId);
    if (!targetStatus) return;
    const targetLabel = BOARD_COLUMNS.find((column) => column.id === targetColumnId)?.label;
    if (!targetLabel) return;

    previousStatusesRef.current.set(task.id, task.status);
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
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 id="project-board-heading" className="font-semibold text-stone-900">Project board</h2>
          <p className="text-sm text-stone-500">Drag permitted tasks between columns to update their status.</p>
        </div>
        {canCreate ? <AddTaskDialog members={members} projectId={projectId} /> : null}
      </div>
      {boardError ? <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{boardError}</div> : null}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      <DragDropProvider sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid auto-cols-[minmax(18rem,1fr)] grid-flow-col gap-4 overflow-x-auto pb-3 lg:grid-flow-row lg:grid-cols-3 lg:auto-cols-auto lg:overflow-visible">
          {BOARD_COLUMNS.map((column) => (
            <BoardColumn
              key={column.id}
              activeTask={activeTask}
              canManageTasks={canManageTasks}
              columnId={column.id}
              currentUserId={currentUserId}
              isProjectReadOnly={isProjectReadOnly}
              label={column.label}
              onOpenTask={setSelectedTaskId}
              pendingTaskIds={pendingTaskIds}
              shouldSuppressOpen={() => suppressCardOpenRef.current}
              tasks={groups[column.id]}
            />
          ))}
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
      /> : null}
    </section>
  );
}
