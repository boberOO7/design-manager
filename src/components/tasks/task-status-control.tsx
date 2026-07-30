"use client";

import { useActionState } from "react";
import { updateTaskStatus } from "@/app/(app)/projects/[projectId]/task-actions";
import { Button } from "@/components/ui/button";
import { BOARD_COLUMNS, getTaskStatusLabel } from "@/lib/tasks";
import type { TaskStatusActionState } from "@/lib/validation/task";

export function TaskStatusControl({ taskId, status }: { taskId: string; status: string }) {
  const [state, formAction, isPending] = useActionState<TaskStatusActionState, FormData>(updateTaskStatus, {});
  const isExtraStatus = status === "cancelled";

  return (
    <form action={formAction} className="mt-3 border-t border-stone-100 pt-3">
      <input type="hidden" name="task_id" value={taskId} />
      <label className="sr-only" htmlFor={`task-status-${taskId}`}>Task status</label>
      <div className="flex gap-2">
        <select id={`task-status-${taskId}`} name="status" defaultValue={status} disabled={isPending} className="h-8 min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 text-xs text-stone-700 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200">
          {isExtraStatus ? <option value={status}>{getTaskStatusLabel(status)}</option> : null}
          {BOARD_COLUMNS.map((column) => <option key={column.id} value={column.status}>{column.label}</option>)}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>{isPending ? "Saving…" : "Move"}</Button>
      </div>
      {state.formError ? <p role="alert" className="mt-2 text-xs text-red-700">{state.formError}</p> : null}
    </form>
  );
}
