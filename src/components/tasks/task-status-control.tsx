"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateTaskStatus } from "@/app/(app)/projects/[projectId]/task-actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { taskStatusSelectItem } from "@/components/tasks/task-select-presentation";
import { BOARD_COLUMNS } from "@/lib/tasks";
import type { TaskStatusActionState } from "@/lib/validation/task";

export function TaskStatusControl({ taskId, status }: { taskId: string; status: string }) {
  const t = useTranslations("Tasks");
  const statusLabel = useTranslations("Status");
  const [state, formAction, isPending] = useActionState<TaskStatusActionState, FormData>(updateTaskStatus, {});
  const isExtraStatus = status === "cancelled";

  return (
    <form action={formAction} autoComplete="off" className="mt-3 border-t border-[var(--ui-border-subtle)] pt-3">
      <input type="hidden" name="task_id" value={taskId} />
      <label className="sr-only" htmlFor={`task-status-${taskId}`}>{t("taskStatus")}</label>
      <div className="flex gap-2">
        <Select id={`task-status-${taskId}`} name="status" defaultValue={status} disabled={isPending} size="compact" className="min-w-0 flex-1 text-[var(--ui-text-secondary)]">
          {isExtraStatus ? taskStatusSelectItem(status, statusLabel(status)) : null}
          {BOARD_COLUMNS.map((column) => taskStatusSelectItem(column.status, statusLabel(column.status === "in_progress" ? "inProgress" : column.status)))}
        </Select>
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>{isPending ? t("moving") : t("move")}</Button>
      </div>
      {state.formError ? <p role="alert" className="mt-2 text-xs text-[var(--ui-danger-text)]">{state.formError}</p> : null}
    </form>
  );
}
