"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectItem } from "@/components/ui/select";
import { isTaskMilestoneStatus, TASK_MILESTONE_STATUSES, type TaskDeadlineInput } from "@/lib/task-deadlines";
import { getTaskStatusBadgeStyle } from "@/lib/semantic-styles";
import type { ProjectTask } from "@/types/tasks";

export function TaskDeadlineEditor({ deadlines, disabled, error, locale, onChange, statusLabel }: {
  deadlines: TaskDeadlineInput[];
  disabled: boolean;
  error?: string;
  locale: string;
  onChange: (deadlines: TaskDeadlineInput[]) => void;
  statusLabel: (status: ProjectTask["status"]) => string;
}) {
  const t = useTranslations("Tasks");
  const availableStatuses = TASK_MILESTONE_STATUSES.filter((status) => !deadlines.some((deadline) => deadline.target_status === status));

  function updateDeadline(index: number, update: Partial<TaskDeadlineInput>) {
    onChange(deadlines.map((deadline, deadlineIndex) => deadlineIndex === index ? { ...deadline, ...update } : deadline));
  }

  return <section aria-labelledby="task-deadlines" className="border-t border-[var(--ui-border-subtle)] pt-4">
    <h3 id="task-deadlines" className="text-sm font-semibold text-[var(--ui-text)]">{t("deadlines")}</h3>
    <div className="mt-2 space-y-2">
      {deadlines.map((deadline, index) => <div key={deadline.target_status} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-2">
        <Select value={deadline.target_status} disabled={disabled} onValueChange={(target_status) => {
          if (isTaskMilestoneStatus(target_status) && !deadlines.some((item, itemIndex) => itemIndex !== index && item.target_status === target_status)) updateDeadline(index, { target_status });
        }}>
          <SelectItem value={deadline.target_status} className={getTaskStatusBadgeStyle(deadline.target_status).className}>{statusLabel(deadline.target_status)}</SelectItem>
          {availableStatuses.map((status) => <SelectItem key={status} value={status} className={getTaskStatusBadgeStyle(status).className}>{statusLabel(status)}</SelectItem>)}
        </Select>
        <DatePicker value={deadline.due_date} disabled={disabled} locale={locale} onValueChange={(due_date) => updateDeadline(index, { due_date })} />
        <Button type="button" size="sm" variant="ghost" disabled={disabled} className="size-11 p-0 text-[var(--ui-danger-text)]" aria-label={t("removeDeadline", { status: statusLabel(deadline.target_status) })} onClick={() => onChange(deadlines.filter((_, deadlineIndex) => deadlineIndex !== index))}><Trash2 className="size-4" aria-hidden="true" /></Button>
      </div>)}
    </div>
    {error ? <p role="alert" className="mt-2 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    {availableStatuses.length ? <Button type="button" size="sm" variant="outline" disabled={disabled} className="mt-2 min-h-11" onClick={() => onChange([...deadlines, { target_status: availableStatuses[0]!, due_date: "" }])}><Plus className="size-4" aria-hidden="true" />{t("addDeadline")}</Button> : null}
  </section>;
}
