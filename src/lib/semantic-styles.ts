import type { TimeOffStatus } from "@/types/calendar";
import type { TaskPriority, TaskStatus } from "@/types/tasks";
import type { ProjectHealth } from "@/lib/project-progress";
import type { ProjectLifecycleStatus } from "@/lib/project-lifecycle";

export type SemanticBadgeStyle = {
  className: string;
  label: string;
  variant: "neutral" | "info" | "warning" | "danger" | "success" | "violet" | "muted";
};

const styles = {
  neutral: { className: "border border-stone-200 bg-stone-100 text-stone-700", variant: "neutral" },
  info: { className: "border border-blue-200 bg-blue-50 text-blue-800", variant: "info" },
  warning: { className: "border border-amber-200 bg-amber-50 text-amber-800", variant: "warning" },
  danger: { className: "border border-red-200 bg-red-50 text-red-800", variant: "danger" },
  success: { className: "border border-emerald-200 bg-emerald-50 text-emerald-800", variant: "success" },
  violet: { className: "border border-violet-200 bg-violet-50 text-violet-800", variant: "violet" },
  muted: { className: "border border-stone-200 bg-stone-50 text-stone-500", variant: "muted" },
} as const;

function badge(label: string, style: keyof typeof styles): SemanticBadgeStyle {
  return { label, ...styles[style] };
}

export function getPriorityBadgeStyle(priority: TaskPriority | string): SemanticBadgeStyle {
  switch (priority) {
    case "low": return badge("Low", "info");
    case "normal": return badge("Normal", "neutral");
    case "high": return badge("High", "warning");
    case "urgent": return badge("Urgent", "danger");
    default: return badge("Unknown", "neutral");
  }
}

export function getTaskStatusBadgeStyle(status: TaskStatus | string): SemanticBadgeStyle {
  switch (status) {
    case "todo": return badge("To do", "neutral");
    case "in_progress": return badge("In progress", "info");
    case "review": return badge("Review", "violet");
    case "completed": return badge("Done", "success");
    case "cancelled": return badge("Cancelled", "muted");
    default: return badge("Unknown", "neutral");
  }
}

export function getProjectLifecycleBadgeStyle(status: ProjectLifecycleStatus | string): SemanticBadgeStyle {
  switch (status) {
    case "planned": return badge("Planned", "neutral");
    case "active": return badge("Active", "success");
    case "paused": return badge("Paused", "warning");
    case "completed": return badge("Completed", "violet");
    case "archived": return badge("Archived", "muted");
    default: return badge("Unknown", "neutral");
  }
}

export function getProjectHealthBadgeStyle(health: ProjectHealth | string): SemanticBadgeStyle {
  switch (health) {
    case "on_track": return badge("On track", "success");
    case "needs_attention": return badge("Needs attention", "warning");
    case "deadline_soon": return badge("Deadline soon", "warning");
    case "overdue": return badge("Overdue", "danger");
    case "completed": return badge("Completed", "info");
    default: return badge("No data", "neutral");
  }
}

export function getTimeOffStatusBadgeStyle(status: TimeOffStatus | string): SemanticBadgeStyle {
  switch (status) {
    case "pending": return badge("Pending", "warning");
    case "approved": return badge("Approved", "success");
    case "rejected": return badge("Rejected", "danger");
    case "cancelled": return badge("Cancelled", "muted");
    default: return badge("Unknown", "neutral");
  }
}
