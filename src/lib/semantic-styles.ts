import type { TimeOffStatus } from "@/types/calendar";
import type { TaskPriority, TaskStatus } from "@/types/tasks";
import type { ProjectHealth } from "@/lib/project-progress";
import type { ProjectLifecycleStatus } from "@/lib/project-lifecycle";

export type SemanticBadgeStyle = {
  className: string;
  label: string;
  variant: "neutral" | "info" | "warning" | "urgent" | "danger" | "success" | "violet" | "muted";
};

export type TaskStatusColumnStyle = {
  countBadgeClassName: string;
  headerClassName: string;
};

const todoBorderColorClassName = "border-[color-mix(in_srgb,var(--ui-border-strong)_70%,var(--ui-text-muted))]";

const styles = {
  neutral: { className: "border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]", variant: "neutral" },
  info: { className: "border border-[var(--ui-info-border)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]", variant: "info" },
  warning: { className: "border border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]", variant: "warning" },
  urgent: { className: "border border-[var(--ui-urgent-border)] bg-[var(--ui-urgent-surface)] text-[var(--ui-urgent-text)]", variant: "urgent" },
  danger: { className: "border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]", variant: "danger" },
  success: { className: "border border-[var(--ui-success-border)] bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]", variant: "success" },
  violet: { className: "border border-[var(--ui-violet-border)] bg-[var(--ui-violet-surface)] text-[var(--ui-violet-text)]", variant: "violet" },
  muted: { className: "border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] text-[var(--ui-text-muted)]", variant: "muted" },
} as const;

function badge(label: string, style: keyof typeof styles): SemanticBadgeStyle {
  return { label, ...styles[style] };
}

export function getPriorityBadgeStyle(priority: TaskPriority | string): SemanticBadgeStyle {
  switch (priority) {
    case "low": return badge("Low", "neutral");
    case "normal": return badge("Normal", "info");
    case "high": return badge("High", "warning");
    case "urgent": return badge("Urgent", "urgent");
    default: return badge("Unknown", "neutral");
  }
}

export function getTaskStatusBadgeStyle(status: TaskStatus | string): SemanticBadgeStyle {
  switch (status) {
    case "todo": return badge("To do", "neutral");
    case "in_progress": return badge("In progress", "info");
    case "review": return badge("Client review", "violet");
    case "completed": return badge("Done", "success");
    case "cancelled": return badge("Cancelled", "muted");
    default: return badge("Unknown", "neutral");
  }
}

export function getTaskStatusCountBadgeClassName(status: TaskStatus | string, count: number): string {
  return `${getTaskStatusColumnStyle(status).countBadgeClassName}${count === 0 ? " opacity-60" : ""}`;
}

export function getTaskStatusColumnStyle(status: TaskStatus | string): TaskStatusColumnStyle {
  switch (status) {
    case "todo":
      return {
        headerClassName: `${todoBorderColorClassName} bg-[var(--ui-surface-subtle)] text-[var(--ui-text-secondary)]`,
        countBadgeClassName: `border ${todoBorderColorClassName} bg-[var(--ui-surface)] text-[var(--ui-text-secondary)]`,
      };
    case "in_progress":
      return { headerClassName: styles.info.className, countBadgeClassName: styles.info.className };
    case "review":
      return { headerClassName: styles.violet.className, countBadgeClassName: styles.violet.className };
    case "completed":
      return { headerClassName: styles.success.className, countBadgeClassName: styles.success.className };
    case "cancelled":
      return { headerClassName: styles.muted.className, countBadgeClassName: styles.muted.className };
    default:
      return { headerClassName: styles.neutral.className, countBadgeClassName: styles.neutral.className };
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
