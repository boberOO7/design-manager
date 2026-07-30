"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { BOARD_COLUMNS, canEditTaskDetails, getTaskPriorityLabel, getTaskStatusLabel, isTaskStatus } from "@/lib/tasks";
import { formatDate } from "@/lib/utils";
import type { TaskEditField } from "@/lib/validation/task";
import { TASK_PRIORITY_VALUES } from "@/types/tasks";
import { getPriorityBadgeStyle, getTaskStatusBadgeStyle } from "@/lib/semantic-styles";
import type { ProjectTask } from "@/types/tasks";
import { isProjectLifecycleStatus, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";

type TaskEditResponse =
  | { success: true; task: ProjectTask; projectStatus: string }
  | { success?: false; formError?: string; fieldErrors?: Partial<Record<TaskEditField, string>> };

function isTaskEditResponse(value: unknown): value is TaskEditResponse {
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
    status: task.status === "review"
      ? "in_progress"
      : task.status === "cancelled"
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
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<TaskEditField, string>>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [values, setValues] = useState(() => makeFormValues(task));

  const canEdit = canEditTaskDetails({ isAdmin: canManageTasks, isProjectReadOnly });
  const canUpdateStatus = !isProjectReadOnly
    && (canManageTasks || task.assignee_id === currentUserId);
  const isDirty = JSON.stringify(values) !== JSON.stringify(makeFormValues(task));

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

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
    const updatedTask = { ...task, status };
    onTaskUpdated(updatedTask);
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
        const formError = typeof result === "object" && result !== null && "formError" in result && typeof result.formError === "string"
          ? result.formError
          : "The task status could not be updated. Please try again.";
        setFormError(formError);
        return;
      }
      setSuccessMessage("Task status saved.");
      if (isProjectLifecycleStatus(result.projectStatus)) onProjectStatusUpdated?.(result.projectStatus);
    } catch {
      onTaskUpdated(task);
      setFormError("The task status could not be updated. Please try again.");
    } finally {
      setIsSaving(false);
    }
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
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">Completed area <span className="font-normal text-stone-500">(optional m²)</span>
                  <input type="number" min="0.01" step="0.01" inputMode="decimal" value={values.completed_area_m2} disabled={isSaving} onChange={(event) => setValues({ ...values, completed_area_m2: event.target.value })} className="h-10 rounded-xl border border-stone-200 px-3 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200" />
                  <span className="text-xs font-normal leading-5 text-stone-500">Captured when this task enters Done; later edits do not rewrite past credit.</span>
                  {fieldErrors.completed_area_m2 ? <span className="text-red-700">{fieldErrors.completed_area_m2}</span> : null}
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
                  {task.completed_area_m2 ? <div><dt className="text-stone-500">Completed area</dt><dd className="mt-1 font-medium tabular-nums text-stone-900">{task.completed_area_m2} m²</dd></div> : null}
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
