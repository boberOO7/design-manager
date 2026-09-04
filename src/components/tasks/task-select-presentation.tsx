import { Flame } from "lucide-react";
import { SelectItem } from "@/components/ui/select";
import type { TaskStatus } from "@/types/tasks";

const priorityTone = {
  low: "text-[var(--ui-neutral-text)]",
  normal: "text-[var(--ui-info-text)]",
  high: "text-[var(--ui-warning-text)]",
  urgent: "text-[var(--ui-urgent-text)]",
} as const;
type PriorityValue = keyof typeof priorityTone;

const statusTone = {
  todo: "text-[var(--ui-neutral-text)]",
  in_progress: "text-[var(--ui-info-text)]",
  internal_review: "text-[var(--ui-info-text)]",
  review: "text-[var(--ui-violet-text)]",
  completed: "text-[var(--ui-success-text)]",
  cancelled: "text-[var(--ui-text-muted)]",
} as const;

function TaskSelectLabel({ children, className, urgent = false }: { children: string; className: string; urgent?: boolean }) {
  return <span className={`inline-flex min-w-0 items-center gap-1.5 font-medium ${className}`}><span className="truncate">{children}</span>{urgent ? <Flame aria-hidden="true" className="size-3.5 shrink-0" /> : null}</span>;
}

export function taskPrioritySelectItem(priority: PriorityValue, label: string) {
  return <SelectItem key={priority} textValue={label} value={priority}><TaskSelectLabel className={priorityTone[priority]} urgent={priority === "urgent"}>{label}</TaskSelectLabel></SelectItem>;
}

function getStatusTone(status: TaskStatus | string) {
  switch (status) {
    case "todo": return statusTone.todo;
    case "in_progress": return statusTone.in_progress;
    case "internal_review": return statusTone.internal_review;
    case "review": return statusTone.review;
    case "completed": return statusTone.completed;
    default: return statusTone.cancelled;
  }
}

export function taskStatusSelectItem(status: TaskStatus | string, label: string) {
  return <SelectItem key={status} textValue={label} value={status}><TaskSelectLabel className={getStatusTone(status)}>{label}</TaskSelectLabel></SelectItem>;
}
