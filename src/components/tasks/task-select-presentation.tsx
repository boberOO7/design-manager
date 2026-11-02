import { ChevronDown, ChevronUp, ChevronsUp, Equal } from "lucide-react";
import type { ReactNode } from "react";
import { SelectItem } from "@/components/ui/select";
import type { TaskStatus } from "@/types/tasks";
import { isTaskPriority } from "@/lib/tasks";

const priorityPresentation = {
  low: { icon: ChevronDown, color: "#8B95A5", tone: "text-[var(--ui-neutral-text)]" },
  normal: { icon: Equal, color: "#60A5FA", tone: "text-[var(--ui-info-text)]" },
  high: { icon: ChevronUp, color: "#F5B52E", tone: "text-[var(--ui-warning-text)]" },
  urgent: { icon: ChevronsUp, color: "#F06438", tone: "text-[var(--ui-urgent-text)]" },
} as const;
type PriorityValue = keyof typeof priorityPresentation;

const statusTone = {
  todo: "text-[var(--ui-neutral-text)]",
  in_progress: "text-[var(--ui-info-text)]",
  internal_review: "text-[var(--ui-info-text)]",
  review: "text-[var(--ui-violet-text)]",
  completed: "text-[var(--ui-success-text)]",
  cancelled: "text-[var(--ui-text-muted)]",
} as const;

export function TaskPriorityIcon({ priority, className = "" }: { priority: string; className?: string }) {
  if (!isTaskPriority(priority)) return null;
  const { icon: Icon, color } = priorityPresentation[priority];
  return <Icon aria-hidden="true" className={`size-3.5 shrink-0 ${className}`} strokeWidth={3} style={{ color }} />;
}

function TaskSelectLabel({ children, className, icon }: { children: string; className: string; icon?: ReactNode }) {
  return <span className={`inline-flex min-w-0 items-center gap-1.5 font-medium ${className}`}>{icon}<span className="truncate">{children}</span></span>;
}

export function taskPriorityLabel(priority: PriorityValue, label: string) {
  return <TaskSelectLabel className={priorityPresentation[priority].tone} icon={<TaskPriorityIcon priority={priority} />}>{label}</TaskSelectLabel>;
}

export function taskPrioritySelectItem(priority: PriorityValue, label: string) {
  return <SelectItem key={priority} textValue={label} value={priority}>{taskPriorityLabel(priority, label)}</SelectItem>;
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
