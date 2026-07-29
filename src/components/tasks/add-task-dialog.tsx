"use client";

import { useActionState, useEffect, useRef } from "react";
import { createProjectTask } from "@/app/(app)/projects/[projectId]/task-actions";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea, inputClassName } from "@/components/ui/form-field";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { getTaskPriorityLabel } from "@/lib/tasks";
import type { TaskActionState } from "@/lib/validation/task";
import { TASK_PRIORITY_VALUES } from "@/types/tasks";

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
        className="m-auto w-[min(92vw,34rem)] rounded-[var(--ui-radius-drawer)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-0 text-[var(--ui-text)] shadow-2xl backdrop:bg-stone-900/45"
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <h2 id="add-task-title" className="font-semibold">Add task</h2>
            <p className="mt-0.5 text-sm text-stone-500">Assign focused work to a project member.</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => dialogRef.current?.close()} aria-label="Close add task dialog">Close</Button>
        </div>
        <form ref={formRef} action={formAction} className="space-y-4 p-5">
          <FormField label="Title" error={state.fieldErrors?.title}>
            <Input name="title" required maxLength={200} disabled={isPending} />
          </FormField>
          <FormField label="Description" optional error={state.fieldErrors?.description}>
            <Textarea name="description" rows={3} maxLength={5000} disabled={isPending} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Assignee" error={state.fieldErrors?.assignee_id}>
              <select name="assignee_id" required defaultValue="" disabled={isPending || members.length === 0} className={inputClassName}>
                <option value="" disabled>Select a project member</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}{member.job_title ? ` — ${member.job_title}` : ""}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select name="priority" defaultValue="normal" disabled={isPending} className={inputClassName}>
                {TASK_PRIORITY_VALUES.map((priority) => <option key={priority} value={priority}>{getTaskPriorityLabel(priority)}</option>)}
              </select>
            </FormField>
          </div>
          <FormField className="sm:w-1/2" label="Due date" optional error={state.fieldErrors?.due_date}>
            <Input type="date" name="due_date" disabled={isPending} />
          </FormField>
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
