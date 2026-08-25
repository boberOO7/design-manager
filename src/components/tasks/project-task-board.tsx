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
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Ellipsis, GripVertical, LoaderCircle, Plus, UserPlus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AddTaskDialog, type AddTaskDialogHandle } from "@/components/tasks/add-task-dialog";
import { TaskDetailsDrawer } from "@/components/tasks/task-details-drawer";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import type { ConfiguredProjectStage } from "@/data/queries/project-stage-columns";
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
import { getPriorityBadgeStyle, getTaskStatusBadgeStyle, getTaskStatusBulkDragStyle, getTaskStatusColumnStyle, getTaskStatusCountBadgeClassName } from "@/lib/semantic-styles";
import type { ProjectTask } from "@/types/tasks";
import { getBoardTaskProgressSummary } from "@/lib/task-card-presentation";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";
import { getAutomaticProjectStatus, isProjectLifecycleStatus, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { calculateStageProgress, type ProjectStageProgressMethods, type StageProgressMethod } from "@/lib/project-progress";
import { isTaskStage, TASK_STAGES, type TaskStage } from "@/lib/task-stages";
import type { ProjectStageColumns } from "@/data/queries/project-stage-columns";
import { StageColumnsDialog } from "@/components/tasks/stage-columns-dialog";

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

function appendTasksInOrder(tasks: ProjectTask[], taskIds: string[]): ProjectTask[] {
  const taskIdSet = new Set(taskIds);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  return [...tasks.filter((task) => !taskIdSet.has(task.id)), ...taskIds.flatMap((taskId) => {
    const task = taskById.get(taskId);
    return task ? [task] : [];
  })];
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

function isSuccessfulBulkTaskStageAssignmentResponse(value: unknown): value is { success: true; tasks: ProjectTask[] } {
  return typeof value === "object"
    && value !== null
    && "success" in value
    && value.success === true
    && "tasks" in value
    && Array.isArray(value.tasks);
}

function isSuccessfulStageProgressMethodResponse(value: unknown): value is { success: true; progressMethod: StageProgressMethod } {
  return typeof value === "object"
    && value !== null
    && "success" in value
    && value.success === true
    && "progressMethod" in value
    && (value.progressMethod === "equal" || value.progressMethod === "area" || value.progressMethod === "weighted");
}

type BulkAssignmentScope = "unassigned" | "all";

function StageAssigneePopover({
  currentUserId,
  members,
  onAssign,
  stage,
  tasks,
}: {
  currentUserId: string;
  members: AssignableProjectMember[];
  onAssign: (assignee: AssignableProjectMember, scope: BulkAssignmentScope, taskIds: string[]) => Promise<boolean>;
  stage: TaskStage;
  tasks: ProjectTask[];
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [scope, setScope] = useState<BulkAssignmentScope>("unassigned");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isUkrainian = locale === "uk";
  const assigneeLabel = isUkrainian ? "Призначити виконавця" : "Assign assignee";
  const selectedAssignee = members.find((member) => member.id === assigneeId) ?? null;
  const eligibleTasks = tasks.filter((task) => task.status !== "cancelled" && (scope === "all" || task.assignee_id === null) && task.assignee_id !== assigneeId);
  const overwrittenCount = scope === "all" ? eligibleTasks.filter((task) => task.assignee_id !== null).length : 0;
  const filteredMembers = members.filter((member) => member.id !== currentUserId && member.full_name.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
  const currentMember = members.find((member) => member.id === currentUserId) ?? null;

  async function submit() {
    if (!selectedAssignee || eligibleTasks.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    const succeeded = await onAssign(selectedAssignee, scope, eligibleTasks.map((task) => task.id));
    setIsSubmitting(false);
    if (succeeded) {
      setOpen(false);
      setQuery("");
      setAssigneeId(null);
      setScope("unassigned");
    }
  }

  return <Popover.Root open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery(""); }}><Popover.Trigger asChild><button type="button" onClick={(event) => event.stopPropagation()} className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" aria-label={assigneeLabel} title={assigneeLabel}><UserPlus className="size-4" aria-hidden="true" /></button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={6} onClick={(event) => event.stopPropagation()} className="z-50 w-80 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 shadow-[var(--ui-shadow-popover)]"><div className="space-y-3"><div><p className="text-sm font-semibold text-[var(--ui-text)]">{assigneeLabel}</p><p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{isUkrainian ? "Оберіть активного учасника проєкту." : "Choose an active project member."}</p></div>{currentMember ? <button type="button" onClick={() => setAssigneeId(currentMember.id)} className={cn("flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", assigneeId === currentMember.id ? "bg-[var(--ui-surface-strong)] text-[var(--ui-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)]")}><UserAvatar decorative imageUrl={currentMember.avatar_url} name={currentMember.full_name} size="board" />{isUkrainian ? "Призначити мене" : "Assign me"}</button> : null}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isUkrainian ? "Пошук учасника" : "Search members"} aria-label={isUkrainian ? "Пошук учасника" : "Search members"} className="h-9 w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2.5 text-sm text-[var(--ui-text)] outline-none placeholder:text-[var(--ui-text-muted)] focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)]" /><div className="max-h-40 space-y-0.5 overflow-y-auto pr-1">{filteredMembers.map((member) => <button key={member.id} type="button" onClick={() => setAssigneeId(member.id)} className={cn("flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", assigneeId === member.id ? "bg-[var(--ui-surface-strong)]" : "hover:bg-[var(--ui-surface-muted)]")}><UserAvatar decorative imageUrl={member.avatar_url} name={member.full_name} size="board" /><span className="min-w-0"><span className="block truncate text-sm font-medium text-[var(--ui-text)]">{member.full_name}</span><span className="block truncate text-xs text-[var(--ui-text-muted)]">{member.job_title}</span></span></button>)}{filteredMembers.length === 0 ? <p className="px-2 py-3 text-center text-xs text-[var(--ui-text-muted)]">{isUkrainian ? "Учасників не знайдено." : "No members found."}</p> : null}</div><fieldset className="space-y-1.5 border-t border-[var(--ui-border-subtle)] pt-3"><legend className="text-xs font-medium text-[var(--ui-text-secondary)]">{isUkrainian ? "Застосувати до" : "Apply to"}</legend>{(["unassigned", "all"] as const).map((value) => <label key={value} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm text-[var(--ui-text-secondary)]"><input checked={scope === value} onChange={() => setScope(value)} name={`stage-assignment-scope-${stage}`} type="radio" className="mt-0.5 accent-[var(--ui-action-primary)]" /><span>{value === "unassigned" ? (isUkrainian ? "Лише задачі без виконавця" : "Only unassigned tasks") : (isUkrainian ? "Усі задачі етапу" : "All stage tasks")}</span></label>)}</fieldset>{scope === "all" && overwrittenCount > 0 ? <p className="text-xs leading-5 text-[var(--ui-warning-text)]">{isUkrainian ? `Буде змінено виконавця у ${overwrittenCount} задачах.` : `The assignee will change on ${overwrittenCount} tasks.`}</p> : null}<div className="flex items-center justify-between gap-3 border-t border-[var(--ui-border-subtle)] pt-3"><p className="text-xs text-[var(--ui-text-muted)]">{eligibleTasks.length > 0 ? (isUkrainian ? `${eligibleTasks.length} задач буде призначено` : `${eligibleTasks.length} tasks will be assigned`) : (isUkrainian ? "Немає доступних задач для цього вибору." : "No eligible tasks for this selection.")}</p><button type="button" disabled={!selectedAssignee || eligibleTasks.length === 0 || isSubmitting} onClick={() => void submit()} className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-[var(--ui-action-primary)] px-3 text-sm font-semibold text-[var(--ui-action-primary-text)] transition-colors hover:bg-[var(--ui-action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? (isUkrainian ? "Призначення…" : "Assigning…") : (isUkrainian ? "Призначити" : "Assign")}</button></div></div></Popover.Content></Popover.Portal></Popover.Root>;
}

function isSuccessfulBulkTaskStatusResponse(value: unknown): value is { success: true; projectStatus: string; tasks: ProjectTask[] } {
  return typeof value === "object" && value !== null && "success" in value && value.success === true
    && "projectStatus" in value && typeof value.projectStatus === "string"
    && "tasks" in value && Array.isArray(value.tasks);
}

function TaskCardContent({
  compact = false,
  isOverlay = false,
  isPending = false,
  showGrip = false,
  task,
}: {
  compact?: boolean;
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
    <div className={cn("rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)]", compact ? "p-2" : "p-3", isOverlay && "scale-[1.02] shadow-xl")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          {showGrip ? <GripVertical className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-subtle)]" aria-hidden="true" /> : null}
          <h4 className={cn("min-w-0 text-sm font-medium leading-5 text-[var(--ui-text)] [overflow-wrap:anywhere]", !compact && "line-clamp-2")} title={compact ? undefined : task.title}>{task.title}</h4>
        </div>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-4 ${getPriorityBadgeStyle(task.priority).className}`}>{priority(task.priority)}</span>
      </div>
      <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] text-xs leading-4", compact ? "mt-1.5 items-center gap-1.5" : "mt-2 items-start gap-2")}>
        <div className="flex min-w-0 items-center gap-1.5 text-[var(--ui-text-muted)]">
          <UserAvatar imageUrl={task.assignee?.avatar_url} name={task.assignee?.full_name} size="boardCard" decorative />
          <span className="truncate">{task.assignee?.full_name ?? t("unassigned")}</span>
          {compact && progress ? <span className="ui-numeric shrink-0 whitespace-nowrap font-medium text-[var(--ui-text-secondary)]">{progress.kind === "checklist"
            ? card("checklistProgress", { completed: progress.completed, total: progress.total, percent: formatNumber(progress.percent, locale) })
            : card("manualProgress", { percent: formatNumber(progress.percent, locale) })}</span> : null}
        </div>
        {!compact && progress ? <span className="ui-numeric whitespace-nowrap font-medium text-[var(--ui-text-secondary)]">{progress.kind === "checklist"
          ? card("checklistProgress", { completed: progress.completed, total: progress.total, percent: formatNumber(progress.percent, locale) })
          : card("manualProgress", { percent: formatNumber(progress.percent, locale) })}</span> : null}
        {compact ? <div className="flex shrink-0 items-center justify-end gap-1.5 text-[var(--ui-text-muted)]">
          <span className="whitespace-nowrap">{task.due_date ? t("due", { date: formatDateShort(task.due_date, locale) }) : t("noDueDate")}</span>
          {overdue ? <span className="rounded-full bg-[var(--ui-danger-surface)] px-1.5 py-0.5 font-medium leading-4 text-[var(--ui-danger-text)]">{t("overdue")}</span> : null}
          {task.status === "cancelled" ? <span className={`rounded-full px-1.5 py-0.5 font-medium leading-4 ${getTaskStatusBadgeStyle(task.status).className}`}>{status("cancelled")}</span> : null}
          {isPending ? <LoaderCircle className="size-3 animate-spin text-[var(--ui-info-text)]" aria-label={t("saving")} /> : null}
        </div> : null}
      </div>
      {!compact ? <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--ui-border-subtle)] pt-2 text-xs leading-4 text-[var(--ui-text-muted)]">
        {task.due_date ? <span>{t("due", { date: formatDateShort(task.due_date, locale) })}</span> : <span>{t("noDueDate")}</span>}
        {overdue ? <span className="rounded-full bg-[var(--ui-danger-surface)] px-1.5 py-0.5 font-medium leading-4 text-[var(--ui-danger-text)]">{t("overdue")}</span> : null}
        {task.status === "cancelled" ? <span className={`rounded-full px-1.5 py-0.5 font-medium leading-4 ${getTaskStatusBadgeStyle(task.status).className}`}>{status("cancelled")}</span> : null}
        {isPending ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ui-info-surface)] px-1.5 py-0.5 font-medium leading-4 text-[var(--ui-info-text)]">
            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> {t("saving")}
          </span>
        ) : null}
      </div> : null}
    </div>
  );
}

function DraggableTaskCard({
  compact,
  isPending,
  onOpen,
  shouldSuppressOpen,
  task,
}: {
  compact: boolean;
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
      <TaskCardContent compact={compact} task={task} isPending={isPending} showGrip />
    </button>
  );
}

function ReadOnlyTaskCard({ compact, task, onOpen }: { compact: boolean; task: ProjectTask; onOpen: (taskId: string) => void }) {
  const t = useTranslations("Tasks");
  return (
    <button type="button" onClick={() => onOpen(task.id)} className="w-full cursor-pointer rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2" aria-label={t("openTask", { name: task.title })}>
      <TaskCardContent compact={compact} task={task} />
    </button>
  );
}

function BulkColumnDragHandle({ columnId, disabled, label, stage, status, taskIds }: { columnId: BoardColumnId; disabled: boolean; label: string; stage: TaskStage; status: WritableTaskStatus; taskIds: string[] }) {
  const locale = useLocale();
  const handleLabel = disabled
    ? (locale === "uk" ? `Масове переміщення для «${label}» недоступне` : `Bulk move for ${label} is unavailable`)
    : (locale === "uk" ? `Перемістити всі ${taskIds.length} задач зі статусу «${label}»` : `Move all ${taskIds.length} tasks from ${label}`);
  const bulkDragStyle = getTaskStatusBulkDragStyle(status);
  const { isDragging, ref } = useDraggable({ id: `bulk-column:${stage}:${columnId}`, disabled, data: { columnId, stage, taskIds }, type: "project-task-bulk" });
  return <button ref={ref} type="button" disabled={disabled} className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-[color,background-color,opacity,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] active:scale-95", disabled ? "cursor-not-allowed text-current opacity-35" : "cursor-grab opacity-60 hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing", !disabled && bulkDragStyle.handleClassName, isDragging && "cursor-grabbing opacity-100")} aria-label={handleLabel} title={disabled ? undefined : handleLabel} style={{ touchAction: "pan-x pan-y" }}><GripVertical className="size-4" aria-hidden="true" /></button>;
}

function StatusColumnHeader({ canBulkDrag, columnId, label, status, stage, taskIds, taskCount }: {
  canBulkDrag: boolean;
  columnId: BoardColumnId;
  label: string;
  status: WritableTaskStatus;
  stage: TaskStage;
  taskIds: string[];
  taskCount: number;
}) {
  const columnStyle = getTaskStatusColumnStyle(status);

  return (
    <div className={cn("mb-2 grid min-h-11 min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-1.5 rounded-lg border px-2 py-2", columnStyle.headerClassName)}>
      <BulkColumnDragHandle columnId={columnId} disabled={!canBulkDrag} label={label} stage={stage} status={status} taskIds={taskIds} />
      <h3 id={`column-${columnId}`} className="min-w-0 break-words text-sm font-semibold">{label}</h3>
      <span className={cn("ui-numeric justify-self-end rounded-full px-1.5 py-0.5 text-xs font-medium leading-4", getTaskStatusCountBadgeClassName(status, taskCount))}>{taskCount}</span>
    </div>
  );
}

function BoardColumn({
  activeBulkDrag,
  activeTask,
  canManageTasks,
  compactCards,
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
  activeBulkDrag: { columnId: BoardColumnId; stage: TaskStage; taskIds: string[] } | null;
  activeTask: ProjectTask | null;
  canManageTasks: boolean;
  compactCards: boolean;
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
  const acceptsActiveBulk = activeBulkDrag !== null && activeBulkDrag.stage === stage && activeBulkDrag.columnId !== columnId;
  const acceptsDrop = acceptsActiveTask || acceptsActiveBulk;
  const { isDropTarget, ref } = useDroppable({
    id: getColumnDropId(stage, columnId),
    disabled: (activeTask !== null || activeBulkDrag !== null) && !acceptsDrop,
    data: { columnId, stage },
    type: "task-column",
    accept: ["project-task", "project-task-bulk"],
  });
  const isHighlighted = acceptsDrop && isDropTarget;
  const canBulkDrag = tasks.length > 0 && !isProjectReadOnly && tasks.every((task) => canMoveTask({ assigneeId: task.assignee_id, currentUserId, isAdmin: canManageTasks, isProjectReadOnly }));
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
      <StatusColumnHeader canBulkDrag={canBulkDrag} columnId={columnId} label={label} status={status} stage={stage} taskIds={tasks.map((task) => task.id)} taskCount={tasks.length} />
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
            ? <DraggableTaskCard key={task.id} compact={compactCards} task={task} isPending={pendingTaskIds.has(task.id)} onOpen={onOpenTask} shouldSuppressOpen={shouldSuppressOpen} />
            : <ReadOnlyTaskCard key={task.id} compact={compactCards} task={task} onOpen={onOpenTask} />;
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
  stageColumns,
  stageProgressMethods,
  stages,
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
  stageColumns: ProjectStageColumns;
  stageProgressMethods: ProjectStageProgressMethods;
  stages: ConfiguredProjectStage[];
  tasks: ProjectTask[];
  templates: StudioChecklistTemplate[];
  onTasksChange?: (tasks: ProjectTask[]) => void;
  onProjectStatusChange?: (status: ProjectLifecycleStatus) => void;
}) {
  const t = useTranslations("Tasks");
  const statusLabels = useTranslations("Status");
  const stageLabels = useTranslations("TaskStages");
  const stageName = (stage: TaskStage) => stages.find((item) => item.stage === stage)?.displayName ?? stageLabels(stage);
  const locale = useLocale();
  const configureColumns = locale === "uk" ? "Налаштувати стовпці" : "Configure columns";
  const progressMethodLabel = locale === "uk" ? "Метод прогресу" : "Progress method";
  const progressMethodOptions: Array<{ value: StageProgressMethod; label: string }> = locale === "uk"
    ? [{ value: "equal", label: "Рівний" }, { value: "area", label: "За площею" }, { value: "weighted", label: "Зважений" }]
    : [{ value: "equal", label: "Equal" }, { value: "area", label: "Area" }, { value: "weighted", label: "Weighted" }];
  const boardActions = locale === "uk" ? "Дії дошки" : "Board actions";
  const compactTaskCards = locale === "uk" ? "Компактні картки" : "Compact task cards";
  const [localTasks, setLocalTasks] = useState(tasks);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeBulkDrag, setActiveBulkDrag] = useState<{ columnId: BoardColumnId; stage: TaskStage; taskIds: string[] } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [boardError, setBoardError] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<Record<TaskStage, boolean>>({ stage_1: true, stage_2: false, stage_3: false, stage_4: false });
  const [stageLayoutReady, setStageLayoutReady] = useState(false);
  const [localStageColumns, setLocalStageColumns] = useState(stageColumns);
  const [localStageProgressMethods, setLocalStageProgressMethods] = useState(stageProgressMethods);
  const [settingsStage, setSettingsStage] = useState<TaskStage | null>(null);
  const [savingProgressMethodStage, setSavingProgressMethodStage] = useState<TaskStage | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => tasks.some((task) => task.id === initialTaskId) ? initialTaskId ?? null : null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(() => tasks.some((task) => task.id === initialTaskId));
  const isTaskDrawerOpenRef = useRef(tasks.some((task) => task.id === initialTaskId));
  const localTasksRef = useRef(localTasks);
  const pendingTaskIdsRef = useRef(new Set<string>());
  const previousStatusesRef = useRef(new Map<string, ProjectTask["status"]>());
  const previousTasksRef = useRef(new Map<string, ProjectTask>());
  const confirmedStatusesRef = useRef(new Map<string, WritableTaskStatus>());
  const suppressCardOpenRef = useRef(false);
  const onTasksChangeRef = useRef(onTasksChange);
  const addTaskDialogRef = useRef<AddTaskDialogHandle>(null);
  const stageLayoutKey = `project-task-board:stages:${projectId}:${currentUserId}`;
  const compactCardsKey = `project-task-board:compact-cards:${currentUserId}`;
  const [compactCards, setCompactCards] = useState(false);
  const [compactCardsReady, setCompactCardsReady] = useState(false);

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

  useLayoutEffect(() => {
    try {
      const storedCompactCards = window.localStorage.getItem(compactCardsKey) === "compact";
      window.queueMicrotask(() => setCompactCards(storedCompactCards));
    } catch {
      // Local presentation preferences must not prevent the board from rendering.
    }
    window.queueMicrotask(() => setCompactCardsReady(true));
  }, [compactCardsKey]);

  useEffect(() => {
    if (!compactCardsReady) return;
    window.localStorage.setItem(compactCardsKey, compactCards ? "compact" : "default");
  }, [compactCards, compactCardsKey, compactCardsReady]);

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
  const stageProgress = calculateStageProgress(localTasks, localStageProgressMethods);
  const activeTask = activeTaskId
    ? localTasks.find((task) => task.id === activeTaskId) ?? null
    : null;
  const selectedTask = selectedTaskId
    ? localTasks.find((task) => task.id === selectedTaskId) ?? null
    : null;

  function openTaskDrawer(taskId: string) {
    isTaskDrawerOpenRef.current = true;
    setSelectedTaskId(taskId);
    setIsTaskDrawerOpen(true);
  }

  function closeTaskDrawer() {
    isTaskDrawerOpenRef.current = false;
    setIsTaskDrawerOpen(false);
  }

  function clearExitedTask() {
    if (!isTaskDrawerOpenRef.current) setSelectedTaskId(null);
  }

  function toggleStage(stage: TaskStage) {
    setExpandedStages((current) => ({ ...current, [stage]: !current[stage] }));
  }

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

  async function persistBulkTaskMove(source: { columnId: BoardColumnId; stage: TaskStage; taskIds: string[] }, targetStatus: WritableTaskStatus, targetLabel: string, previousTasks: ProjectTask[], previousProjectStatus: ProjectLifecycleStatus) {
    try {
      const sourceStatuses = [...new Set(previousTasks.filter((task) => source.taskIds.includes(task.id)).map((task) => task.status))];
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/tasks/bulk-status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: source.stage, source_statuses: sourceStatuses, target_status: targetStatus, task_ids: source.taskIds }) });
      let result: unknown = null;
      try { result = await response.json(); } catch { /* handled below */ }
      if (!response.ok || !isSuccessfulBulkTaskStatusResponse(result)) throw new Error(locale === "uk" ? "Не вдалося перемістити пакет задач." : "The task batch could not be moved.");
      const refreshedTasks = appendTasksInOrder(result.tasks, source.taskIds);
      localTasksRef.current = refreshedTasks;
      setLocalTasks(refreshedTasks);
      if (isProjectLifecycleStatus(result.projectStatus)) onProjectStatusChange?.(result.projectStatus);
      for (const taskId of source.taskIds) setTaskPending(taskId, false);
      setAnnouncement(locale === "uk" ? `${source.taskIds.length} задач переміщено до «${targetLabel}».` : `${source.taskIds.length} tasks moved to ${targetLabel}.`);
    } catch (error) {
      localTasksRef.current = previousTasks;
      setLocalTasks(previousTasks);
      onProjectStatusChange?.(previousProjectStatus);
      for (const taskId of source.taskIds) setTaskPending(taskId, false);
      const message = error instanceof Error ? error.message : (locale === "uk" ? "Не вдалося перемістити пакет задач." : "The task batch could not be moved.");
      const restoredMessage = t("statusRestored", { message });
      setBoardError(restoredMessage);
      setAnnouncement(restoredMessage);
    }
  }

  async function assignStageTasks(assignee: AssignableProjectMember, scope: BulkAssignmentScope, taskIds: string[]): Promise<boolean> {
    const previousTasks = localTasksRef.current;
    if (taskIds.length === 0 || taskIds.some((taskId) => pendingTaskIdsRef.current.has(taskId))) return false;
    for (const taskId of taskIds) setTaskPending(taskId, true);
    setBoardError(null);
    const optimisticTasks = previousTasks.map((task) => taskIds.includes(task.id)
      ? { ...task, assignee_id: assignee.id, assignee: { id: assignee.id, full_name: assignee.full_name, job_title: assignee.job_title, avatar_url: assignee.avatar_url } }
      : task);
    localTasksRef.current = optimisticTasks;
    setLocalTasks(optimisticTasks);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/tasks/bulk-assignee`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: optimisticTasks.find((task) => task.id === taskIds[0])?.stage, assignee_id: assignee.id, scope }),
      });
      let result: unknown = null;
      try { result = await response.json(); } catch { /* handled below */ }
      if (!response.ok || !isSuccessfulBulkTaskStageAssignmentResponse(result)) throw new Error(locale === "uk" ? "Не вдалося призначити виконавця для задач етапу." : "The stage tasks could not be assigned.");
      localTasksRef.current = result.tasks;
      setLocalTasks(result.tasks);
      for (const taskId of taskIds) setTaskPending(taskId, false);
      setAnnouncement(locale === "uk" ? `Виконавця призначено для ${taskIds.length} задач.` : `Assignee updated for ${taskIds.length} tasks.`);
      return true;
    } catch (error) {
      localTasksRef.current = previousTasks;
      setLocalTasks(previousTasks);
      for (const taskId of taskIds) setTaskPending(taskId, false);
      const message = error instanceof Error ? error.message : (locale === "uk" ? "Не вдалося призначити виконавця для задач етапу." : "The stage tasks could not be assigned.");
      setBoardError(message);
      setAnnouncement(message);
      return false;
    }
  }

  async function updateStageProgressMethod(stage: Exclude<TaskStage, "stage_4">, method: StageProgressMethod) {
    if (savingProgressMethodStage || localStageProgressMethods[stage] === method) return;
    setSavingProgressMethodStage(stage);
    setBoardError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/stages/${stage}/columns`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress_method: method }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !isSuccessfulStageProgressMethodResponse(result)) throw new Error(locale === "uk" ? "Не вдалося зберегти метод прогресу." : "The progress method could not be saved.");
      setLocalStageProgressMethods((current) => ({ ...current, [stage]: result.progressMethod }));
      setAnnouncement(locale === "uk" ? "Метод прогресу оновлено." : "Progress method updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : (locale === "uk" ? "Не вдалося зберегти метод прогресу." : "The progress method could not be saved.");
      setBoardError(message);
      setAnnouncement(message);
    } finally {
      setSavingProgressMethodStage(null);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const taskId = event.operation.source?.id;
    if (taskId === undefined) return;
    if (event.operation.source?.type === "project-task-bulk") {
      const data = event.operation.source?.data as { columnId?: unknown; stage?: unknown; taskIds?: unknown } | undefined;
      if (!data || !isBoardColumnId(String(data.columnId)) || !isTaskStage(String(data.stage)) || !Array.isArray(data.taskIds) || data.taskIds.some((id) => typeof id !== "string") || data.taskIds.length === 0) return;
      const columnId = String(data.columnId);
      const stage = String(data.stage);
      if (!isBoardColumnId(columnId) || !isTaskStage(stage)) return;
      setActiveBulkDrag({ columnId, stage, taskIds: data.taskIds });
      setBoardError(null);
      setAnnouncement(locale === "uk" ? `Переміщення ${data.taskIds.length} задач.` : `Moving ${data.taskIds.length} tasks.`);
      return;
    }
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
    const bulkSource = activeBulkDrag;
    setActiveTaskId(null);
    setActiveBulkDrag(null);
    window.setTimeout(() => { suppressCardOpenRef.current = false; }, 0);
    if (event.canceled || taskId === undefined || !target) return;

    if (event.operation.source?.type === "project-task-bulk") {
      if (!bulkSource || bulkSource.stage !== target.stage || bulkSource.columnId === target.columnId) return;
      const targetStatus = BOARD_COLUMNS.find((column) => column.id === target.columnId)?.status;
      if (!targetStatus) return;
      const previousTasks = localTasksRef.current;
      const batchTasks = previousTasks.filter((task) => bulkSource.taskIds.includes(task.id));
      if (batchTasks.length !== bulkSource.taskIds.length || batchTasks.some((task) => pendingTaskIdsRef.current.has(task.id))) return;
      const targetLabel = statusLabels(targetStatus === "in_progress" ? "inProgress" : targetStatus);
      for (const taskId of bulkSource.taskIds) setTaskPending(taskId, true);
      setBoardError(null);
      const optimisticTasks = appendTasksInOrder(batchTasks.reduce((nextTasks, task) => setProjectTaskStatus(nextTasks, task.id, targetStatus), previousTasks), bulkSource.taskIds);
      localTasksRef.current = optimisticTasks;
      setLocalTasks(optimisticTasks);
      onProjectStatusChange?.(getAutomaticProjectStatus(projectStatus, targetStatus));
      void persistBulkTaskMove(bulkSource, targetStatus, targetLabel, previousTasks, projectStatus);
      return;
    }

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

  function removeLocalTask(taskId: string) {
    const nextTasks = localTasksRef.current.filter((task) => task.id !== taskId);
    localTasksRef.current = nextTasks;
    setLocalTasks(nextTasks);
    setSelectedTaskId((selectedId) => selectedId === taskId ? null : selectedId);
  }

  return (
    <section aria-labelledby="project-board-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="project-board-heading" className="font-semibold text-[var(--ui-text)]">{t("board")}</h2>
          <p className="text-sm text-[var(--ui-text-muted)]">{t("boardInstructions")}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate ? <AddTaskDialog ref={addTaskDialogRef} members={members} projectId={projectId} stageColumns={localStageColumns} templates={templates} /> : null}
          <Popover.Root>
            <Popover.Trigger asChild>
              <button type="button" className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" aria-label={boardActions}>
                <Ellipsis className="size-4" aria-hidden="true" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]">
                <button type="button" role="menuitemcheckbox" aria-checked={compactCards} onClick={() => setCompactCards((current) => !current)} className="flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
                  <Check className={cn("size-4 shrink-0", compactCards ? "text-[var(--ui-text)]" : "invisible")} aria-hidden="true" />
                  {compactTaskCards}
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
      {boardError ? <div role="alert" className="mb-4 rounded-xl border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] px-4 py-3 text-sm text-[var(--ui-danger-text)]">{boardError}</div> : null}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      <DragDropProvider sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="space-y-3">
          {stages.filter((item) => item.isEnabled).map(({ stage }) => {
            const isExpanded = expandedStages[stage];
            const enabledColumns = BOARD_COLUMNS.filter((column) => localStageColumns[stage].includes(column.status));
            const taskCount = groupsByStage[stage].todo.length
              + groupsByStage[stage]["in-progress"].length
              + groupsByStage[stage]["internal-review"].length
              + groupsByStage[stage]["client-review"].length
              + groupsByStage[stage].done.length;
            const progress = stage === "stage_4" ? null : stageProgress[stage];
            return (
              <section key={stage} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)]">
                <div className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-4" onClick={() => toggleStage(stage)}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <button
                      type="button"
                      aria-controls={`project-stage-${stage}`}
                      aria-expanded={isExpanded}
                      onClick={(event) => { event.stopPropagation(); toggleStage(stage); }}
                      className="min-w-0 shrink py-3 text-left font-semibold text-[var(--ui-text)] outline-none transition-colors hover:text-[var(--ui-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-inset"
                    >
                      {stageName(stage)}
                    </button>
                    {progress ? <div className="hidden min-w-24 flex-1 items-center gap-2 sm:flex lg:max-w-36"><span className="ui-numeric text-xs font-semibold text-[var(--ui-text-secondary)]">{progress.progressPercent}%</span><div className="relative h-3 min-w-0 flex-1" role="progressbar" aria-label={`${stageLabels(stage)} ${progress.progressPercent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progressPercent}><div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--ui-border-strong)]" /><div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--ui-action-primary)]" style={{ width: `${progress.progressPercent}%` }} />{progress.progressPercent > 0 ? <span aria-hidden="true" className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--ui-surface-muted)] bg-[var(--ui-action-primary)] shadow-[var(--ui-shadow-panel)]" style={{ left: progress.progressPercent === 100 ? "calc(100% - 0.3125rem)" : `${progress.progressPercent}%` }} /> : null}</div></div> : null}
                  </div>
                  <span onClick={(event) => event.stopPropagation()} className="ui-numeric rounded-full bg-[var(--ui-surface)] px-2 py-0.5 text-xs font-medium text-[var(--ui-text-secondary)]">{taskCount}</span>
                  <div className="flex shrink-0 items-center gap-2" onClick={(event) => event.stopPropagation()}>
                  {canManageTasks && !isProjectReadOnly ? <StageAssigneePopover currentUserId={currentUserId} members={members} onAssign={assignStageTasks} stage={stage} tasks={localTasks.filter((task) => task.stage === stage)} /> : null}
                  {canCreate ? <button type="button" onClick={() => addTaskDialogRef.current?.open(stage)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" aria-label={t("addTask")} title={t("addTask")}>
                    <Plus className="size-4" aria-hidden="true" />
                  </button> : null}
                  {canManageTasks ? <Popover.Root><Popover.Trigger asChild><button type="button" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" aria-label={configureColumns} title={configureColumns}><Ellipsis className="size-4" aria-hidden="true" /></button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]"><button type="button" onClick={() => setSettingsStage(stage)} className="flex min-h-9 w-full items-center rounded-md px-3 text-left text-sm font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{configureColumns}</button>{stage !== "stage_4" ? <div className="mt-1 border-t border-[var(--ui-border-subtle)] pt-1"><p className="px-3 py-1.5 text-xs font-medium text-[var(--ui-text-muted)]">{progressMethodLabel}</p>{progressMethodOptions.map((option) => <button key={option.value} type="button" role="menuitemradio" aria-checked={localStageProgressMethods[stage] === option.value} disabled={savingProgressMethodStage === stage} onClick={() => void updateStageProgressMethod(stage, option.value)} className={cn("flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", localStageProgressMethods[stage] === option.value ? "text-[var(--ui-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)]", savingProgressMethodStage === stage && "cursor-wait opacity-60")}><Check className={cn("size-4 shrink-0", localStageProgressMethods[stage] === option.value ? "text-[var(--ui-text)]" : "invisible")} aria-hidden="true" />{option.label}</button>)}</div> : null}</Popover.Content></Popover.Portal></Popover.Root> : null}
                  <button
                    type="button"
                    aria-controls={`project-stage-${stage}`}
                    aria-expanded={isExpanded}
                    onClick={(event) => { event.stopPropagation(); toggleStage(stage); }}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
                    aria-label={stageName(stage)}
                  >
                    <ChevronDown className={cn("size-4 transition-transform duration-200", isExpanded && "rotate-180")} aria-hidden="true" />
                  </button>
                  </div>
                </div>
                <div id={`project-stage-${stage}`} className={cn("grid transition-[grid-template-rows] duration-200 ease-out", isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <div className="min-h-0 overflow-hidden">
                    <div className="overflow-x-auto border-t border-[var(--ui-border-subtle)] p-3">
                      <div className="grid min-w-0 gap-4" style={{ gridTemplateColumns: `repeat(${enabledColumns.length}, minmax(12rem, 1fr))` }}>
                      {enabledColumns.map((column) => (
                        <BoardColumn
                          activeBulkDrag={activeBulkDrag}
                          key={column.id}
                          activeTask={activeTask}
                          canManageTasks={canManageTasks}
                          compactCards={compactCards}
                          columnId={column.id}
                          currentUserId={currentUserId}
                          isProjectReadOnly={isProjectReadOnly}
                          label={statusLabels(column.status === "in_progress" ? "inProgress" : column.status)}
                          onOpenTask={openTaskDrawer}
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
                </div>
              </section>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {() => {
            if (activeTask) return <TaskCardContent compact={compactCards} task={activeTask} isOverlay showGrip />;
            if (!activeBulkDrag) return null;
            const sourceStatus = BOARD_COLUMNS.find((column) => column.id === activeBulkDrag.columnId)?.status ?? "todo";
            const sourceLabel = statusLabels(sourceStatus === "in_progress" ? "inProgress" : sourceStatus);
            const bulkDragStyle = getTaskStatusBulkDragStyle(sourceStatus);
            return <div className={cn("w-60 rounded-xl border p-3.5 shadow-[var(--ui-shadow-popover)]", bulkDragStyle.previewClassName)}><div className="flex items-start gap-2.5"><span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-current/20 bg-[color-mix(in_srgb,currentColor_8%,transparent)]"><GripVertical className="size-4" aria-hidden="true" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold leading-5">{sourceLabel}</p><p className="mt-0.5 text-xs font-medium leading-4 opacity-80">{locale === "uk" ? `Перемістити ${activeBulkDrag.taskIds.length} задач` : `Move ${activeBulkDrag.taskIds.length} tasks`}</p></div></div></div>;
          }}
        </DragOverlay>
      </DragDropProvider>
      {settingsStage ? <StageColumnsDialog columns={localStageColumns[settingsStage]} onClose={() => setSettingsStage(null)} onSaved={(columns) => { setLocalStageColumns((current) => ({ ...current, [settingsStage]: columns })); setSettingsStage(null); }} projectId={projectId} stage={settingsStage} /> : null}
      {selectedTask ? <TaskDetailsDrawer
        key={selectedTask.id}
        canManageTasks={canManageTasks}
        currentUserId={currentUserId}
        isOpen={isTaskDrawerOpen}
        isProjectReadOnly={isProjectReadOnly}
        members={members}
        onClose={closeTaskDrawer}
        onExited={clearExitedTask}
        onTaskDeleted={removeLocalTask}
        onProjectStatusUpdated={onProjectStatusChange}
        onTaskUpdated={updateLocalTask}
        stageColumns={localStageColumns}
        task={selectedTask}
        templates={templates}
      /> : null}
    </section>
  );
}
