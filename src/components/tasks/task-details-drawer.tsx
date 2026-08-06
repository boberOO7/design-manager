"use client";

import { Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Select, SelectItem } from "@/components/ui/select";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { isValidChecklistWeightInput } from "@/lib/checklist-interaction";
import { getChecklistAutosaveStore, type ChecklistChange } from "@/lib/checklist-autosave";
import { BOARD_COLUMNS, canEditTaskDetails, canEditTaskWork, getOptimisticTaskForStatus, isTaskStatus } from "@/lib/tasks";
import { calculateTaskProgress } from "@/lib/project-progress";
import { formatDate, formatNumber } from "@/lib/utils";
import { checklistItemCreateSchema, type TaskEditField } from "@/lib/validation/task";
import { TASK_PRIORITY_VALUES } from "@/types/tasks";
import { getPriorityBadgeStyle, getTaskStatusBadgeStyle } from "@/lib/semantic-styles";
import type { ProjectTask, TaskChecklistItem } from "@/types/tasks";
import { isProjectLifecycleStatus, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";

type TaskEditResponse =
  | { success: true; task: ProjectTask; projectStatus: string }
  | { success?: false; formError?: string; fieldErrors?: Partial<Record<TaskEditField, string>> };

function isTaskEditResponse(value: unknown): value is TaskEditResponse {
  return typeof value === "object" && value !== null && "success" in value;
}

type TaskWorkResponse = { success: true; task: ProjectTask; checklistItemId?: string } | { success?: false; formError?: string };
function isTaskWorkResponse(value: unknown): value is TaskWorkResponse {
  return typeof value === "object" && value !== null && "success" in value;
}

function makeFormValues(task: ProjectTask) {
  return {
    title: task.title,
    description: task.description ?? "",
    assignee_id: task.assignee_id,
    priority: task.priority,
    due_date: task.due_date ?? "",
    completed_area_m2: task.completed_area_m2?.toString() ?? "",
    progress_weight: task.progress_weight.toString(),
    status: task.status === "cancelled"
        ? "completed"
        : task.status,
  };
}

export function TaskDetailsDrawer({
  canManageTasks,
  currentUserId,
  isProjectReadOnly,
  members,
  onClose,
  onTaskUpdated,
  onProjectStatusUpdated,
  project,
  task,
}: {
  canManageTasks: boolean;
  currentUserId: string;
  isProjectReadOnly: boolean;
  members: AssignableProjectMember[];
  onClose: () => void;
  onTaskUpdated: (task: ProjectTask) => void;
  onProjectStatusUpdated?: (status: ProjectLifecycleStatus) => void;
  project?: { id: string; name: string };
  task: ProjectTask;
}) {
  const t = useTranslations("Tasks");
  const checklistT = useTranslations("Checklists");
  const statusT = useTranslations("Status");
  const priorityT = useTranslations("Priority");
  const validation = useTranslations("Validation");
  const roles = useTranslations("Roles");
  const roleLabel = (value: string) => { const roleKey = getCanonicalRoleTranslationKey(value); return roleKey ? roles(roleKey) : value; };
  const locale = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  const checklistTitleRef = useRef<HTMLInputElement>(null);
  const checklistStoreRef = useRef<ReturnType<typeof getChecklistAutosaveStore> | null>(null);
  if (!checklistStoreRef.current) checklistStoreRef.current = getChecklistAutosaveStore(task.id);
  const checklistStore = checklistStoreRef.current;
  checklistStore.seed(task);
  const taskRef = useRef(task);
  const checklistFormRevisionRef = useRef(0);
  const lastSubmittedChecklistRevisionRef = useRef(-1);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<TaskEditField, string>>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newChecklistWeight, setNewChecklistWeight] = useState("1");
  const [, setChecklistRevision] = useState(0);
  const [manualProgress, setManualProgress] = useState(task.production_completion.toString());
  const [values, setValues] = useState(() => makeFormValues(task));
  const statusLabel = (status: ProjectTask["status"]) => statusT(status === "in_progress" ? "inProgress" : status);

  const canEdit = canEditTaskDetails({ isAdmin: canManageTasks, isProjectReadOnly });
  const canUpdateStatus = !isProjectReadOnly
    && (canManageTasks || task.assignee_id === currentUserId);
  const canEditWork = canEditTaskWork({ assigneeId: task.assignee_id, currentUserId, isAdmin: canManageTasks, isProjectReadOnly, status: task.status });
  taskRef.current = task;
  const checklistSnapshot = checklistStore.getSnapshot();
  const displayedChecklistItems = task.status === "review" ? task.checklist_items : checklistSnapshot.items;
  const taskProgress = calculateTaskProgress({ ...task, checklist_items: displayedChecklistItems });
  const isDirty = JSON.stringify(values) !== JSON.stringify(makeFormValues(task));

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    return checklistStore.subscribe(() => {
      setChecklistRevision((revision) => revision + 1);
      onTaskUpdated({ ...taskRef.current, checklist_items: checklistStore.getSnapshot().items });
    });
  }, [checklistStore, onTaskUpdated]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function requestClose() {
    if (isSaving) return;
    if (isEditing && isDirty) {
      setShowDiscardPrompt(true);
      return;
    }
    onClose();
  }

  function discardChangesAndClose() {
    if (isSaving) return;
    onClose();
  }

  async function saveTaskDetails() {
    if (values.status === "review" && task.status !== "review" && !window.confirm(t("confirmClientReview"))) return;
    setIsSaving(true);
    setFormError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      let result: unknown = null;
      try {
        result = await response.json();
      } catch {
        // The safe fallback below covers malformed API responses.
      }
      if (response.ok && isTaskEditResponse(result) && result.success) {
        onTaskUpdated(result.task);
        checklistStore.seed(result.task);
        if (isProjectLifecycleStatus(result.projectStatus)) onProjectStatusUpdated?.(result.projectStatus);
        setValues(makeFormValues(result.task));
        setIsEditing(false);
        setSuccessMessage(t("taskChangesSaved"));
      } else {
        const errorResult = isTaskEditResponse(result) && !result.success ? result : null;
        setFormError(errorResult?.formError ?? t("updateFailed"));
        setFieldErrors(errorResult?.fieldErrors ?? {});
      }
    } catch {
      setFormError(t("updateFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveEmployeeStatus(status: string) {
    if (!isTaskStatus(status)) {
      setFormError(t("updateFailed"));
      return;
    }
    if (status === "review" && task.status !== "review" && !window.confirm(t("confirmClientReview"))) return;
    setIsSaving(true);
    setFormError(null);
    setSuccessMessage(null);
    const updatedTask = getOptimisticTaskForStatus(task, status);
    onTaskUpdated(updatedTask);
    if (status === "review") {
      checklistStore.seed(updatedTask);
    }
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      let result: unknown = null;
      try {
        result = await response.json();
      } catch {
        // The safe fallback below covers malformed API responses.
      }
      if (!response.ok || typeof result !== "object" || result === null || !("success" in result) || result.success !== true || !("projectStatus" in result) || typeof result.projectStatus !== "string") {
        onTaskUpdated(task);
        checklistStore.seed(task);
        const formError = typeof result === "object" && result !== null && "formError" in result && typeof result.formError === "string"
          ? result.formError
          : t("updateFailed");
        setFormError(formError);
        return;
      }
      if (isTaskWorkResponse(result) && result.success) {
        onTaskUpdated(result.task);
        checklistStore.seed(result.task);
      }
      setSuccessMessage(t("statusSaved"));
      if (isProjectLifecycleStatus(result.projectStatus)) onProjectStatusUpdated?.(result.projectStatus);
    } catch {
      onTaskUpdated(task);
      checklistStore.seed(task);
      setFormError(t("updateFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  async function mutateTaskWork(url: string, init: RequestInit, success: string) {
    setIsSaving(true); setFormError(null); setSuccessMessage(null);
    try {
      const response = await fetch(url, init);
      let result: unknown = null;
      try { result = await response.json(); } catch { /* Safe fallback below. */ }
      if (!response.ok || !isTaskWorkResponse(result) || !result.success) {
        throw new Error(isTaskWorkResponse(result) && !result.success ? result.formError ?? t("updateFailed") : t("updateFailed"));
      }
      onTaskUpdated(result.task);
      setManualProgress(result.task.production_completion.toString());
      setSuccessMessage(success);
      return true;
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : t("updateFailed"));
      return false;
    } finally { setIsSaving(false); }
  }

  async function saveManualProgress() {
    await mutateTaskWork(`/api/tasks/${encodeURIComponent(task.id)}/progress`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ production_completion: manualProgress }) }, t("progressSaved"));
  }

  async function addChecklistItem() {
    const revision = checklistFormRevisionRef.current;
    if (revision === lastSubmittedChecklistRevisionRef.current) return;
    const parsed = checklistItemCreateSchema.safeParse({ title: newChecklistTitle, weight: newChecklistWeight });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? checklistT("addFailed"));
      return;
    }

    lastSubmittedChecklistRevisionRef.current = revision;
    setSuccessMessage(null);
    setNewChecklistTitle("");
    setNewChecklistWeight("1");
    checklistFormRevisionRef.current += 1;
    window.requestAnimationFrame(() => checklistTitleRef.current?.focus());

    await checklistStore.create(taskRef.current, parsed.data.title, parsed.data.weight);
  }

  function updateChecklistItem(itemId: string, change: ChecklistChange, immediate = false) {
    const update = {
      ...change,
      title: change.title?.trim(),
    };
    checklistStore.update(taskRef.current, itemId, update, immediate);
  }

  async function deleteChecklistItem(itemId: string) {
    setSuccessMessage(null);
    await checklistStore.remove(taskRef.current, itemId);
  }

  return (
    <Drawer isOpen onClose={requestClose} initialFocusRef={panelRef} title={t("taskDetails")} className="w-full max-w-[34rem]">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex h-dvh flex-col bg-[var(--ui-surface)] text-[var(--ui-text)] outline-none"
      >
        <header className="sticky top-0 z-10 border-b border-[var(--ui-border-subtle)] bg-[var(--ui-surface)] px-5 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">{t("taskDetails")}</p>
              <h2 id="task-details-title" className="mt-1 text-xl font-semibold leading-6 text-[var(--ui-text)]">{task.title}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getTaskStatusBadgeStyle(task.status).className}`}>{statusLabel(task.status)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getPriorityBadgeStyle(task.priority).className}`}>{priorityT(task.priority)}</span>
              </div>
            </div>
            <Button type="button" size="sm" variant="ghost" disabled={isSaving} onClick={requestClose} aria-label={t("closeTaskDetails")} className="size-9 shrink-0 p-0">
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {successMessage ? <p role="status" className="mb-5 rounded-xl bg-[var(--ui-success-surface)] px-3 py-2 text-sm text-[var(--ui-success-text)]">{successMessage}</p> : null}
          {formError ? <p role="alert" className="mb-5 rounded-xl bg-[var(--ui-danger-surface)] px-3 py-2 text-sm text-[var(--ui-danger-text)]">{t("updateFailed")}</p> : null}
          {isEditing ? (
            <div className="space-y-5">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("title")}
                <input autoComplete="off" value={values.title} maxLength={200} disabled={isSaving} onChange={(event) => setValues({ ...values, title: event.target.value })} className="h-10 rounded-xl border border-[var(--ui-border)] px-3 outline-none focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)]" />
                {fieldErrors.title ? <span className="text-[var(--ui-danger-text)]">{validation("correctFields")}</span> : null}
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("description")}
                <textarea autoComplete="off" value={values.description} rows={6} maxLength={5000} disabled={isSaving} onChange={(event) => setValues({ ...values, description: event.target.value })} className="rounded-xl border border-[var(--ui-border)] px-3 py-2 leading-6 outline-none focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)]" />
                {fieldErrors.description ? <span className="text-[var(--ui-danger-text)]">{validation("correctFields")}</span> : null}
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("assignee")}
                <Select value={values.assignee_id} disabled={isSaving} onValueChange={(assigneeId) => setValues({ ...values, assignee_id: assigneeId })}>
                  {members.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name}{member.job_title ? ` — ${roleLabel(member.job_title)}` : ""}</SelectItem>)}
                </Select>
                {fieldErrors.assignee_id ? <span className="text-[var(--ui-danger-text)]">{validation("correctFields")}</span> : null}
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("priority")}
                  <Select value={values.priority} disabled={isSaving} onValueChange={(nextPriority) => setValues({ ...values, priority: nextPriority })}>
                    {TASK_PRIORITY_VALUES.map((priority) => <SelectItem key={priority} value={priority}>{priorityT(priority)}</SelectItem>)}
                  </Select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("dueDate")}
                  <input autoComplete="off" type="date" value={values.due_date} disabled={isSaving} onChange={(event) => setValues({ ...values, due_date: event.target.value })} className="h-10 rounded-xl border border-[var(--ui-border)] px-3 outline-none focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)]" />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("taskArea")} <span className="font-normal text-[var(--ui-text-muted)]">({t("optionalArea")})</span>
                  <input autoComplete="off" type="number" min="0.01" step="0.01" inputMode="decimal" value={values.completed_area_m2} disabled={isSaving} onChange={(event) => setValues({ ...values, completed_area_m2: event.target.value })} className="h-10 rounded-xl border border-[var(--ui-border)] px-3 outline-none focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)]" />
                  <span className="text-xs font-normal leading-5 text-[var(--ui-text-muted)]">{t("taskAreaEditHelp")}</span>
                  {fieldErrors.completed_area_m2 ? <span className="text-[var(--ui-danger-text)]">{validation("correctFields")}</span> : null}
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("progressWeight")}
                  <input autoComplete="off" type="number" min="0.01" max="1000" step="0.01" inputMode="decimal" value={values.progress_weight} disabled={isSaving} onChange={(event) => setValues({ ...values, progress_weight: event.target.value })} className="h-10 rounded-xl border border-[var(--ui-border)] px-3 outline-none focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)]" />
                  <span className="text-xs font-normal leading-5 text-[var(--ui-text-muted)]">{t("progressWeightHelp")}</span>
                  {fieldErrors.progress_weight ? <span className="text-[var(--ui-danger-text)]">{validation("correctFields")}</span> : null}
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("status")}
                <Select value={values.status} disabled={isSaving} onValueChange={(status) => setValues({ ...values, status })}>
                  {BOARD_COLUMNS.map((column) => <SelectItem key={column.id} value={column.status}>{statusLabel(column.status)}</SelectItem>)}
                </Select>
              </label>
            </div>
          ) : (
            <div className="space-y-6">
              <section aria-labelledby="task-progress-heading">
                <div className="flex items-end justify-between gap-3"><div><h3 id="task-progress-heading" className="text-sm font-semibold text-[var(--ui-text)]">{t("progress")}</h3><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("progressExplanation")}</p></div><span className="ui-numeric text-lg font-semibold text-[var(--ui-text)]">{formatNumber(taskProgress.presentedOverallPercent, locale)}%</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--ui-progress-track)]" role="progressbar" aria-label={t("overallProgressAria", { name: task.title })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={taskProgress.presentedOverallPercent}><div className="h-full rounded-full bg-[var(--ui-action-primary)]" style={{ width: `${taskProgress.overallPercent}%` }} /></div>
                <p className="mt-2 text-xs text-[var(--ui-text-secondary)]">{taskProgress.source === "checklist" ? t("checklistSummary", { completed: taskProgress.completedChecklistCount, total: taskProgress.checklistCount, percent: formatNumber(taskProgress.presentedProductionPercent, locale) }) : task.status === "review" ? t("productionAwaitingApproval") : task.status === "completed" ? t("productionApproved") : task.status === "in_progress" ? t("manualProductionSummary", { percent: formatNumber(taskProgress.presentedProductionPercent, locale) }) : t("productionNotStarted")}</p>
                {task.status === "in_progress" && displayedChecklistItems.length === 0 && canEditWork ? <div className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-3"><label className="text-xs font-medium text-[var(--ui-text-secondary)]" htmlFor={`manual-progress-${task.id}`}>{t("manualProductionCompletion")}</label><div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center"><input id={`manual-progress-${task.id}`} type="range" min="0" max="100" step="1" value={manualProgress} disabled={isSaving} onChange={(event) => setManualProgress(event.target.value)} className="min-h-11 flex-1 accent-[var(--ui-action-primary)]" /><div className="flex items-center gap-2"><input aria-label={t("manualProductionPercentage")} type="number" min="0" max="100" step="1" value={manualProgress} disabled={isSaving} onChange={(event) => setManualProgress(event.target.value)} className="h-11 w-20 rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-2 text-right ui-numeric outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" /><span className="text-sm text-[var(--ui-text-muted)]">%</span><Button type="button" size="sm" disabled={isSaving || Number(manualProgress) === task.production_completion} onClick={() => void saveManualProgress()}>{t("save")}</Button></div></div></div> : null}
              </section>
              <section className="border-t border-[var(--ui-border-subtle)] pt-5" aria-labelledby="task-checklist-heading">
                <div className="flex items-end justify-between gap-3"><div><h3 id="task-checklist-heading" className="text-sm font-semibold text-[var(--ui-text)]">{checklistT("checklist")}</h3><p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{checklistT("description")}</p></div>{displayedChecklistItems.length ? <span className="ui-numeric text-xs font-medium text-[var(--ui-text-secondary)]">{t("checklistProduction", { percent: formatNumber(taskProgress.presentedProductionPercent, locale) })}</span> : null}</div>
                {checklistSnapshot.error ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{checklistT("autosaveFailed")}</p> : null}
                {displayedChecklistItems.length ? <ul className="mt-3 divide-y divide-[var(--ui-border-subtle)] border-y border-[var(--ui-border-subtle)]">{displayedChecklistItems.map((item) => <ChecklistItemRow key={`${item.id}:${item.updated_at}`} item={item} canEdit={canEditWork} pending={checklistSnapshot.pendingItemIds.has(item.id)} onDelete={deleteChecklistItem} onUpdate={updateChecklistItem} />)}</ul> : <p className="mt-3 rounded-xl border border-dashed border-[var(--ui-border-strong)] p-4 text-sm text-[var(--ui-text-muted)]">{checklistT("empty")}</p>}
                {canEditWork ? <form onSubmit={(event) => { event.preventDefault(); void addChecklistItem(); }} className="mt-3 grid gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-end"><label className="grid min-w-0 gap-1 text-xs font-medium text-[var(--ui-text-secondary)]">{checklistT("newItem")}<input ref={checklistTitleRef} value={newChecklistTitle} maxLength={200} onChange={(event) => { checklistFormRevisionRef.current += 1; setNewChecklistTitle(event.target.value); }} className="h-11 min-w-0 rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" /></label><label className="grid gap-1 text-xs font-medium text-[var(--ui-text-secondary)]">{checklistT("weight")}<input type="number" min="1" max="1000" step="1" inputMode="numeric" value={newChecklistWeight} onChange={(event) => { checklistFormRevisionRef.current += 1; setNewChecklistWeight(event.target.value); }} className="h-11 min-w-0 rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 ui-numeric outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" /></label><Button type="submit" size="sm" className="min-h-11 w-full sm:w-auto" disabled={!newChecklistTitle.trim() || !isValidChecklistWeightInput(newChecklistWeight)}><Plus className="size-4" aria-hidden="true" /> {checklistT("add")}</Button></form> : null}
              </section>
              <section>
                <h3 className="text-sm font-semibold text-[var(--ui-text)]">{t("description")}</h3>
                <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-7 text-[var(--ui-text-secondary)]">{task.description || t("noDescription")}</p>
              </section>
              <section className="border-t border-[var(--ui-border-subtle)] pt-5">
                <h3 className="text-sm font-semibold text-[var(--ui-text)]">{t("taskInformation")}</h3>
                <dl className="mt-4 grid gap-x-6 gap-y-5 text-sm sm:grid-cols-2">
                  <div><dt className="text-[var(--ui-text-muted)]">{t("assignee")}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{task.assignee?.full_name ?? t("unassigned")}</dd></div>
                  <div><dt className="text-[var(--ui-text-muted)]">{t("status")}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{statusLabel(task.status)}</dd></div>
                  <div><dt className="text-[var(--ui-text-muted)]">{t("priority")}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{priorityT(task.priority)}</dd></div>
                  <div><dt className="text-[var(--ui-text-muted)]">{t("dueDate")}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{task.due_date ? formatDate(task.due_date, locale) : t("noDueDate")}</dd></div>
                  <div><dt className="text-[var(--ui-text-muted)]">{t("createdBy")}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{task.creator?.full_name ?? t("unknown")}</dd></div>
                  <div><dt className="text-[var(--ui-text-muted)]">{t("created")}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{formatDate(task.created_at, locale)}</dd></div>
                  {task.completed_at ? <div><dt className="text-[var(--ui-text-muted)]">{t("completedOn")}</dt><dd className="mt-1 font-medium text-[var(--ui-text)]">{formatDate(task.completed_at, locale)}</dd></div> : null}
                  {task.completed_area_m2 ? <div><dt className="text-[var(--ui-text-muted)]">{t("taskArea")}</dt><dd className="mt-1 font-medium tabular-nums text-[var(--ui-text)]">{formatNumber(task.completed_area_m2, locale)} m²</dd></div> : null}
                  <div><dt className="text-[var(--ui-text-muted)]">{t("progressWeight")}</dt><dd className="mt-1 font-medium tabular-nums text-[var(--ui-text)]">{formatNumber(task.progress_weight, locale)}</dd></div>
                  {project ? <div><dt className="text-[var(--ui-text-muted)]">{t("project")}</dt><dd className="mt-1 font-medium"><Link href={`/projects/${project.id}`} className="text-[var(--ui-text)] hover:underline">{project.name}</Link></dd></div> : null}
                </dl>
              </section>
              {!canManageTasks && canUpdateStatus ? <section className="border-t border-[var(--ui-border-subtle)] pt-5">
                <label className="grid gap-1.5 text-sm font-semibold text-[var(--ui-text)]">{t("updateStatus")}
                  <Select value={task.status} disabled={isSaving} onValueChange={(status) => void saveEmployeeStatus(status)} className="font-normal">
                    <SelectItem value={task.status}>{statusLabel(task.status)}</SelectItem>
                    {BOARD_COLUMNS.filter((column) => column.status !== task.status).map((column) => <SelectItem key={column.id} value={column.status}>{statusLabel(column.status)}</SelectItem>)}
                  </Select>
                </label>
              </section> : null}
            </div>
          )}
        </main>
        {canEdit ? <footer className="sticky bottom-0 flex flex-col gap-3 border-t border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 shadow-[var(--ui-shadow-sticky)]">
          {showDiscardPrompt ? <div className="rounded-xl bg-[var(--ui-warning-surface)] px-3 py-2 text-sm text-[var(--ui-warning-text)]">{t("unsavedChanges")}
            <div className="mt-2 flex justify-end gap-2"><Button type="button" size="sm" variant="outline" disabled={isSaving} onClick={discardChangesAndClose}>{t("discardChanges")}</Button><Button type="button" size="sm" disabled={isSaving} onClick={() => void saveTaskDetails()}>{t("saveChanges")}</Button></div>
          </div> : null}
          <div className="flex justify-end gap-3">
            {isEditing ? <><Button type="button" variant="outline" disabled={isSaving} onClick={() => { setValues(makeFormValues(task)); setIsEditing(false); setFieldErrors({}); setFormError(null); setShowDiscardPrompt(false); }}>{t("cancel")}</Button><Button type="button" disabled={isSaving} onClick={() => void saveTaskDetails()}>{isSaving ? t("saving") : t("saveChanges")}</Button></> : <Button type="button" onClick={() => setIsEditing(true)}>{t("editTask")}</Button>}
          </div>
        </footer> : null}
      </div>
    </Drawer>
  );
}

function ChecklistItemRow({ canEdit, item, onDelete, onUpdate, pending }: {
  canEdit: boolean;
  item: TaskChecklistItem;
  onDelete: (itemId: string) => Promise<void>;
  onUpdate: (itemId: string, change: ChecklistChange, immediate?: boolean) => void;
  pending: boolean;
}) {
  const t = useTranslations("Checklists");
  const [title, setTitle] = useState(item.title);
  const [weight, setWeight] = useState(item.weight.toString());
  return <li className="py-2.5">
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 sm:flex-nowrap">
      <label className="flex size-11 shrink-0 items-center justify-center text-[var(--ui-text-secondary)] focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--ui-focus)] focus-within:ring-offset-2">
        <input type="checkbox" checked={item.is_completed} disabled={!canEdit} onChange={(event) => onUpdate(item.id, { is_completed: event.target.checked }, true)} aria-label={item.is_completed ? t("markIncomplete", { title: item.title }) : t("markComplete", { title: item.title })} className="size-5 accent-[var(--ui-action-primary)]" />
      </label>
      {canEdit ? <><label className="min-w-0 flex-1"><span className="sr-only">{t("itemTitle")}</span><input value={title} maxLength={200} onChange={(event) => { const value = event.target.value; setTitle(value); if (value.trim()) onUpdate(item.id, { title: value }); }} onBlur={() => { if (!title.trim()) setTitle(item.title); }} className="h-11 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-sm text-[var(--ui-text)] outline-none hover:border-[var(--ui-border)] focus:border-[var(--ui-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" /></label><label className="flex w-20 shrink-0 items-center gap-1 text-xs text-[var(--ui-text-muted)]"><span className="sr-only">{t("weight")}</span><input type="number" min="1" max="1000" step="1" inputMode="numeric" value={weight} onChange={(event) => { const value = event.target.value; setWeight(value); if (isValidChecklistWeightInput(value)) onUpdate(item.id, { weight: Number(value) }); }} onBlur={() => { if (!isValidChecklistWeightInput(weight)) setWeight(item.weight.toString()); }} className="h-11 w-full rounded-lg border border-transparent bg-transparent px-2 text-right text-sm ui-numeric outline-none hover:border-[var(--ui-border)] focus:border-[var(--ui-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" /><span aria-hidden="true">{t("weightAbbreviation")}</span></label><Button type="button" size="sm" variant="ghost" className="size-11 shrink-0 p-0 text-[var(--ui-danger-text)]" aria-label={t("delete", { title: item.title })} onClick={() => { if (window.confirm(t("confirmDelete", { title: item.title }))) void onDelete(item.id); }}><Trash2 className="size-4" aria-hidden="true" /></Button></> : <div className="min-w-0 flex-1"><p className={item.is_completed ? "break-words text-sm text-[var(--ui-text-muted)] line-through" : "break-words text-sm font-medium text-[var(--ui-text)]"}>{item.title}</p><p className="text-xs text-[var(--ui-text-muted)]">{t("itemWeight", { weight: item.weight })}</p></div>}
      {pending ? <span className="sr-only" role="status">{t("savingItem")}</span> : null}
    </div>
  </li>;
}
