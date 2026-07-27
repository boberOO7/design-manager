"use client";

import { useActionState, useEffect, useRef } from "react";
import { createProjectTask } from "@/app/(app)/projects/[projectId]/task-actions";
import { Button } from "@/components/ui/button";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { getTaskPriorityLabel } from "@/lib/tasks";
import type { TaskActionState } from "@/lib/validation/task";
import { TASK_PRIORITY_VALUES } from "@/types/tasks";

const fieldClassName = "h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-stone-900 focus:ring-2 focus:ring-stone-200";

export function AddTaskDialog({
  members,
  projectId,
}: {
  members: AssignableProjectMember[];
  projectId: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const action = createProjectTask.bind(null, projectId);
  const [state, formAction, isPending] = useActionState<TaskActionState, FormData>(action, {});

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      dialogRef.current?.close();
    }
  }, [state.success]);

  return (
    <>
      <Button size="sm" onClick={() => dialogRef.current?.showModal()}>Add task</Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="add-task-title"
        className="m-auto w-[min(92vw,34rem)] rounded-2xl border border-stone-200 bg-white p-0 text-stone-900 shadow-xl backdrop:bg-stone-900/40"
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <h2 id="add-task-title" className="font-semibold">Add task</h2>
            <p className="mt-0.5 text-sm text-stone-500">Assign focused work to a project member.</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => dialogRef.current?.close()} aria-label="Close add task dialog">Close</Button>
        </div>
        <form ref={formRef} action={formAction} className="space-y-4 p-5">
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            Title
            <input name="title" required maxLength={200} disabled={isPending} className={fieldClassName} aria-describedby={state.fieldErrors?.title ? "task-title-error" : undefined} />
            {state.fieldErrors?.title ? <span id="task-title-error" className="text-red-700">{state.fieldErrors.title}</span> : null}
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            Description <span className="font-normal text-stone-400">(optional)</span>
            <textarea name="description" rows={3} maxLength={5000} disabled={isPending} className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-stone-900 focus:ring-2 focus:ring-stone-200" />
            {state.fieldErrors?.description ? <span className="text-red-700">{state.fieldErrors.description}</span> : null}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-stone-700">
              Assignee
              <select name="assignee_id" required defaultValue="" disabled={isPending || members.length === 0} className={fieldClassName}>
                <option value="" disabled>Select a project member</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}{member.job_title ? ` — ${member.job_title}` : ""}</option>)}
              </select>
              {state.fieldErrors?.assignee_id ? <span className="text-red-700">{state.fieldErrors.assignee_id}</span> : null}
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-stone-700">
              Priority
              <select name="priority" defaultValue="normal" disabled={isPending} className={fieldClassName}>
                {TASK_PRIORITY_VALUES.map((priority) => <option key={priority} value={priority}>{getTaskPriorityLabel(priority)}</option>)}
              </select>
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700 sm:w-1/2">
            Due date <span className="font-normal text-stone-400">(optional)</span>
            <input type="date" name="due_date" disabled={isPending} className={fieldClassName} />
            {state.fieldErrors?.due_date ? <span className="text-red-700">{state.fieldErrors.due_date}</span> : null}
          </label>
          {members.length === 0 ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Assign at least one active team member before creating a task.</p> : null}
          {state.formError ? <p role="alert" className="text-sm text-red-700">{state.formError}</p> : null}
          <div className="flex justify-end gap-3 border-t border-stone-100 pt-4">
            <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending || members.length === 0}>{isPending ? "Creating…" : "Create task"}</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
