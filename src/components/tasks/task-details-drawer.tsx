"use client";

import { Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { isValidChecklistWeightInput } from "@/lib/checklist-interaction";
import { getChecklistAutosaveStore, type ChecklistChange } from "@/lib/checklist-autosave";
import { BOARD_COLUMNS, canEditTaskDetails, canEditTaskWork, getOptimisticTaskForStatus, getTaskPriorityLabel, getTaskStatusLabel, isTaskStatus } from "@/lib/tasks";
import { calculateTaskProgress } from "@/lib/project-progress";
import { formatDate } from "@/lib/utils";
import { checklistItemCreateSchema, type TaskEditField } from "@/lib/validation/task";
import { TASK_PRIORITY_VALUES } from "@/types/tasks";
import { getPriorityBadgeStyle, getTaskStatusBadgeStyle } from "@/lib/semantic-styles";
import type { ProjectTask, TaskChecklistItem } from "@/types/tasks";
import { isProjectLifecycleStatus, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";

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
        setSuccessMessage("Task changes saved.");
      } else {
        const errorResult = isTaskEditResponse(result) && !result.success ? result : null;
        setFormError(errorResult?.formError ?? "The task could not be updated. Please try again.");
        setFieldErrors(errorResult?.fieldErrors ?? {});
      }
    } catch {
      setFormError("The task could not be updated. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveEmployeeStatus(status: string) {
    if (!isTaskStatus(status)) {
      setFormError("The task status could not be updated. Please try again.");
      return;
    }
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
          : "The task status could not be updated. Please try again.";
        setFormError(formError);
        return;
      }
      if (isTaskWorkResponse(result) && result.success) {
        onTaskUpdated(result.task);
        checklistStore.seed(result.task);
      }
      setSuccessMessage("Task status saved.");
      if (isProjectLifecycleStatus(result.projectStatus)) onProjectStatusUpdated?.(result.projectStatus);
    } catch {
      onTaskUpdated(task);
      checklistStore.seed(task);
      setFormError("The task status could not be updated. Please try again.");
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
        throw new Error(isTaskWorkResponse(result) && !result.success ? result.formError ?? "The task could not be updated." : "The task could not be updated.");
      }
      onTaskUpdated(result.task);
      setManualProgress(result.task.production_completion.toString());
      setSuccessMessage(success);
      return true;
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The task could not be updated.");
      return false;
    } finally { setIsSaving(false); }
  }

  async function saveManualProgress() {
    await mutateTaskWork(`/api/tasks/${encodeURIComponent(task.id)}/progress`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ production_completion: manualProgress }) }, "Production progress saved.");
  }

  async function addChecklistItem() {
    const revision = checklistFormRevisionRef.current;
    if (revision === lastSubmittedChecklistRevisionRef.current) return;
    const parsed = checklistItemCreateSchema.safeParse({ title: newChecklistTitle, weight: newChecklistWeight });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Enter a valid checklist item.");
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
    <Drawer isOpen onClose={requestClose} initialFocusRef={panelRef} title="Task details" className="w-full max-w-[34rem]">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex h-dvh flex-col bg-white text-stone-900 outline-none"
      >
        <header className="sticky top-0 z-10 border-b border-stone-100 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">Task details</p>
              <h2 id="task-details-title" className="mt-1 text-xl font-semibold leading-6 text-stone-950">{task.title}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getTaskStatusBadgeStyle(task.status).className}`}>{getTaskStatusLabel(task.status)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getPriorityBadgeStyle(task.priority).className}`}>{getTaskPriorityLabel(task.priority)}</span>
              </div>
            </div>
            <Button type="button" size="sm" variant="ghost" disabled={isSaving} onClick={requestClose} aria-label="Close task details" className="size-9 shrink-0 p-0">
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {successMessage ? <p role="status" className="mb-5 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{successMessage}</p> : null}
          {formError ? <p role="alert" className="mb-5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p> : null}
          {isEditing ? (
            <div className="space-y-5">
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">Title
                <input value={values.title} maxLength={200} disabled={isSaving} onChange={(event) => setValues({ ...values, title: event.target.value })} className="h-10 rounded-xl border border-stone-200 px-3 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200" />
                {fieldErrors.title ? <span className="text-red-700">{fieldErrors.title}</span> : null}
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">Description
                <textarea value={values.description} rows={6} maxLength={5000} disabled={isSaving} onChange={(event) => setValues({ ...values, description: event.target.value })} className="rounded-xl border border-stone-200 px-3 py-2 leading-6 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200" />
                {fieldErrors.description ? <span className="text-red-700">{fieldErrors.description}</span> : null}
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">Assignee
                <select value={values.assignee_id} disabled={isSaving} onChange={(event) => setValues({ ...values, assignee_id: event.target.value })} className="h-10 rounded-xl border border-stone-200 px-3 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200">
                  {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}{member.job_title ? ` — ${member.job_title}` : ""}</option>)}
                </select>
                {fieldErrors.assignee_id ? <span className="text-red-700">{fieldErrors.assignee_id}</span> : null}
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">Priority
                  <select value={values.priority} disabled={isSaving} onChange={(event) => setValues({ ...values, priority: event.target.value })} className="h-10 rounded-xl border border-stone-200 px-3 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200">
                    {TASK_PRIORITY_VALUES.map((priority) => <option key={priority} value={priority}>{getTaskPriorityLabel(priority)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">Due date
                  <input type="date" value={values.due_date} disabled={isSaving} onChange={(event) => setValues({ ...values, due_date: event.target.value })} className="h-10 rounded-xl border border-stone-200 px-3 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200" />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">Task area <span className="font-normal text-stone-500">(optional m²)</span>
                  <input type="number" min="0.01" step="0.01" inputMode="decimal" value={values.completed_area_m2} disabled={isSaving} onChange={(event) => setValues({ ...values, completed_area_m2: event.target.value })} className="h-10 rounded-xl border border-stone-200 px-3 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200" />
                  <span className="text-xs font-normal leading-5 text-stone-500">Used by Area progress and captured for productivity credit when this task enters Done.</span>
                  {fieldErrors.completed_area_m2 ? <span className="text-red-700">{fieldErrors.completed_area_m2}</span> : null}
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">Progress weight
                  <input type="number" min="0.01" max="1000" step="0.01" inputMode="decimal" value={values.progress_weight} disabled={isSaving} onChange={(event) => setValues({ ...values, progress_weight: event.target.value })} className="h-10 rounded-xl border border-stone-200 px-3 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200" />
                  <span className="text-xs font-normal leading-5 text-stone-500">Used only when the project progress method is Weighted.</span>
                  {fieldErrors.progress_weight ? <span className="text-red-700">{fieldErrors.progress_weight}</span> : null}
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">Status
                <select value={values.status} disabled={isSaving} onChange={(event) => setValues({ ...values, status: event.target.value })} className="h-10 rounded-xl border border-stone-200 px-3 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200">
                  {BOARD_COLUMNS.map((column) => <option key={column.id} value={column.status}>{column.label}</option>)}
                </select>
              </label>
            </div>
          ) : (
            <div className="space-y-6">
              <section aria-labelledby="task-progress-heading">
                <div className="flex items-end justify-between gap-3"><div><h3 id="task-progress-heading" className="text-sm font-semibold text-stone-900">Progress</h3><p className="mt-1 text-xs text-stone-500">Production is the first 80%; client approval is the final 20%.</p></div><span className="ui-numeric text-lg font-semibold text-stone-900">{taskProgress.presentedOverallPercent}%</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label={`${task.title} overall progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={taskProgress.presentedOverallPercent}><div className="h-full rounded-full bg-[var(--ui-action-primary)]" style={{ width: `${taskProgress.overallPercent}%` }} /></div>
                <p className="mt-2 text-xs text-stone-600">{taskProgress.source === "checklist" ? `${taskProgress.completedChecklistCount} of ${taskProgress.checklistCount} checklist items complete · ${taskProgress.presentedProductionPercent}% production` : task.status === "review" ? "Production complete · awaiting client approval" : task.status === "completed" ? "Production complete · client approved" : task.status === "in_progress" ? `${taskProgress.presentedProductionPercent}% manual production completion` : "Production has not started"}</p>
                {task.status === "in_progress" && displayedChecklistItems.length === 0 && canEditWork ? <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3"><label className="text-xs font-medium text-stone-700" htmlFor={`manual-progress-${task.id}`}>Manual production completion</label><div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center"><input id={`manual-progress-${task.id}`} type="range" min="0" max="100" step="1" value={manualProgress} disabled={isSaving} onChange={(event) => setManualProgress(event.target.value)} className="min-h-11 flex-1 accent-stone-900" /><div className="flex items-center gap-2"><input aria-label="Manual production completion percentage" type="number" min="0" max="100" step="1" value={manualProgress} disabled={isSaving} onChange={(event) => setManualProgress(event.target.value)} className="h-11 w-20 rounded-lg border border-stone-300 bg-white px-2 text-right ui-numeric outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" /><span className="text-sm text-stone-500">%</span><Button type="button" size="sm" disabled={isSaving || Number(manualProgress) === task.production_completion} onClick={() => void saveManualProgress()}>Save</Button></div></div></div> : null}
              </section>
              <section className="border-t border-stone-100 pt-5" aria-labelledby="task-checklist-heading">
                <div className="flex items-end justify-between gap-3"><div><h3 id="task-checklist-heading" className="text-sm font-semibold text-stone-900">Checklist</h3><p className="mt-1 text-xs leading-5 text-stone-500">Optional weighted work stages, not subtasks.</p></div>{displayedChecklistItems.length ? <span className="ui-numeric text-xs font-medium text-stone-600">{taskProgress.presentedProductionPercent}% production</span> : null}</div>
                {checklistSnapshot.error ? <p role="alert" className="mt-3 text-sm text-red-800">{checklistSnapshot.error}</p> : null}
                {displayedChecklistItems.length ? <ul className="mt-3 divide-y divide-stone-100 border-y border-stone-100">{displayedChecklistItems.map((item) => <ChecklistItemRow key={`${item.id}:${item.updated_at}`} item={item} canEdit={canEditWork} pending={checklistSnapshot.pendingItemIds.has(item.id)} onDelete={deleteChecklistItem} onUpdate={updateChecklistItem} />)}</ul> : <p className="mt-3 rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500">No checklist items. In-progress production uses the manual percentage.</p>}
                {canEditWork ? <form onSubmit={(event) => { event.preventDefault(); void addChecklistItem(); }} className="mt-3 grid gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-end"><label className="grid min-w-0 gap-1 text-xs font-medium text-stone-700">New item<input ref={checklistTitleRef} value={newChecklistTitle} maxLength={200} onChange={(event) => { checklistFormRevisionRef.current += 1; setNewChecklistTitle(event.target.value); }} className="h-11 min-w-0 rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" /></label><label className="grid gap-1 text-xs font-medium text-stone-700">Weight<input type="number" min="1" max="1000" step="1" inputMode="numeric" value={newChecklistWeight} onChange={(event) => { checklistFormRevisionRef.current += 1; setNewChecklistWeight(event.target.value); }} className="h-11 min-w-0 rounded-lg border border-stone-300 bg-white px-3 ui-numeric outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" /></label><Button type="submit" size="sm" className="min-h-11 w-full sm:w-auto" disabled={!newChecklistTitle.trim() || !isValidChecklistWeightInput(newChecklistWeight)}><Plus className="size-4" aria-hidden="true" /> Add</Button></form> : null}
              </section>
              <section>
                <h3 className="text-sm font-semibold text-stone-900">Description</h3>
                <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-7 text-stone-700">{task.description || "No description added"}</p>
              </section>
              <section className="border-t border-stone-100 pt-5">
                <h3 className="text-sm font-semibold text-stone-900">Task information</h3>
                <dl className="mt-4 grid gap-x-6 gap-y-5 text-sm sm:grid-cols-2">
                  <div><dt className="text-stone-500">Assignee</dt><dd className="mt-1 font-medium text-stone-900">{task.assignee?.full_name ?? "Unassigned"}</dd></div>
                  <div><dt className="text-stone-500">Status</dt><dd className="mt-1 font-medium text-stone-900">{getTaskStatusLabel(task.status)}</dd></div>
                  <div><dt className="text-stone-500">Priority</dt><dd className="mt-1 font-medium text-stone-900">{getTaskPriorityLabel(task.priority)}</dd></div>
                  <div><dt className="text-stone-500">Due date</dt><dd className="mt-1 font-medium text-stone-900">{task.due_date ? formatDate(task.due_date) : "No due date"}</dd></div>
                  <div><dt className="text-stone-500">Created by</dt><dd className="mt-1 font-medium text-stone-900">{task.creator?.full_name ?? "Unknown"}</dd></div>
                  <div><dt className="text-stone-500">Created</dt><dd className="mt-1 font-medium text-stone-900">{formatDate(task.created_at)}</dd></div>
                  {task.completed_at ? <div><dt className="text-stone-500">Completed</dt><dd className="mt-1 font-medium text-stone-900">{formatDate(task.completed_at)}</dd></div> : null}
                  {task.completed_area_m2 ? <div><dt className="text-stone-500">Task area</dt><dd className="mt-1 font-medium tabular-nums text-stone-900">{task.completed_area_m2} m²</dd></div> : null}
                  <div><dt className="text-stone-500">Progress weight</dt><dd className="mt-1 font-medium tabular-nums text-stone-900">{task.progress_weight}</dd></div>
                  {project ? <div><dt className="text-stone-500">Project</dt><dd className="mt-1 font-medium"><Link href={`/projects/${project.id}`} className="text-stone-900 hover:underline">{project.name}</Link></dd></div> : null}
                </dl>
              </section>
              {!canManageTasks && canUpdateStatus ? <section className="border-t border-stone-100 pt-5">
                <label className="grid gap-1.5 text-sm font-semibold text-stone-900">Update status
                  <select defaultValue={task.status} disabled={isSaving} onChange={(event) => void saveEmployeeStatus(event.target.value)} className="h-10 rounded-xl border border-stone-200 px-3 text-sm font-normal outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200">
                    <option value={task.status}>{getTaskStatusLabel(task.status)}</option>
                    {BOARD_COLUMNS.filter((column) => column.status !== task.status).map((column) => <option key={column.id} value={column.status}>{column.label}</option>)}
                  </select>
                </label>
              </section> : null}
            </div>
          )}
        </main>
        {canEdit ? <footer className="sticky bottom-0 flex flex-col gap-3 border-t border-stone-200 bg-white p-5 shadow-[0_-8px_20px_rgba(28,25,23,0.05)]">
          {showDiscardPrompt ? <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Unsaved changes. Save them before closing or discard them.
            <div className="mt-2 flex justify-end gap-2"><Button type="button" size="sm" variant="outline" disabled={isSaving} onClick={discardChangesAndClose}>Discard changes</Button><Button type="button" size="sm" disabled={isSaving} onClick={() => void saveTaskDetails()}>Save changes</Button></div>
          </div> : null}
          <div className="flex justify-end gap-3">
            {isEditing ? <><Button type="button" variant="outline" disabled={isSaving} onClick={() => { setValues(makeFormValues(task)); setIsEditing(false); setFieldErrors({}); setFormError(null); setShowDiscardPrompt(false); }}>Cancel</Button><Button type="button" disabled={isSaving} onClick={() => void saveTaskDetails()}>{isSaving ? "Saving…" : "Save changes"}</Button></> : <Button type="button" onClick={() => setIsEditing(true)}>Edit task</Button>}
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
  const [title, setTitle] = useState(item.title);
  const [weight, setWeight] = useState(item.weight.toString());
  return <li className="py-2.5">
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 sm:flex-nowrap">
      <label className="flex size-11 shrink-0 items-center justify-center text-stone-700 focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--ui-focus)] focus-within:ring-offset-2">
        <input type="checkbox" checked={item.is_completed} disabled={!canEdit} onChange={(event) => onUpdate(item.id, { is_completed: event.target.checked }, true)} aria-label={`Mark ${item.title} ${item.is_completed ? "incomplete" : "complete"}`} className="size-5 accent-stone-900" />
      </label>
      {canEdit ? <><label className="min-w-0 flex-1"><span className="sr-only">Checklist title</span><input value={title} maxLength={200} onChange={(event) => { const value = event.target.value; setTitle(value); if (value.trim()) onUpdate(item.id, { title: value }); }} onBlur={() => { if (!title.trim()) setTitle(item.title); }} className="h-11 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-sm text-stone-900 outline-none hover:border-stone-200 focus:border-stone-300 focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" /></label><label className="flex w-20 shrink-0 items-center gap-1 text-xs text-stone-500"><span className="sr-only">Weight</span><input type="number" min="1" max="1000" step="1" inputMode="numeric" value={weight} onChange={(event) => { const value = event.target.value; setWeight(value); if (isValidChecklistWeightInput(value)) onUpdate(item.id, { weight: Number(value) }); }} onBlur={() => { if (!isValidChecklistWeightInput(weight)) setWeight(item.weight.toString()); }} className="h-11 w-full rounded-lg border border-transparent bg-transparent px-2 text-right text-sm ui-numeric outline-none hover:border-stone-200 focus:border-stone-300 focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" /><span aria-hidden="true">wt</span></label><Button type="button" size="sm" variant="ghost" className="size-11 shrink-0 p-0 text-red-700" aria-label={`Delete checklist item ${item.title}`} onClick={() => { if (window.confirm(`Delete “${item.title}”?`)) void onDelete(item.id); }}><Trash2 className="size-4" aria-hidden="true" /></Button></> : <div className="min-w-0 flex-1"><p className={item.is_completed ? "break-words text-sm text-stone-500 line-through" : "break-words text-sm font-medium text-stone-800"}>{item.title}</p><p className="text-xs text-stone-500">Weight {item.weight}</p></div>}
      {pending ? <span className="sr-only" role="status">Saving checklist item</span> : null}
    </div>
  </li>;
}
