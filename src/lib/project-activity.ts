import type { Json } from "@/types/database.types";

export type ActivityChange = { from: Json; to: Json };
export type ActivityChanges = Record<string, Json | ActivityChange>;

export function isActivityChanges(value: Json): value is ActivityChanges {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isActivityChange(value: Json | undefined): value is ActivityChange {
  return value !== undefined && isActivityChanges(value) && "from" in value && "to" in value;
}

export function getActivityMemberId(changes: Json): string | null {
  if (!isActivityChanges(changes) || typeof changes.member_id !== "string") return null;
  return changes.member_id;
}

export function getActivitySummary(actionType: string, changes: Json): string {
  if (actionType === "task_created") return "created a task";
  if (actionType === "project_archived") return "archived the project";
  if (actionType === "project_restored") return "restored the project";
  if (actionType === "project_member_added") return "added a project member";
  if (actionType === "project_member_removed") return "removed a project member";
  const values = isActivityChanges(changes) ? Object.keys(changes) : [];
  if (actionType === "project_lifecycle_changed") return "changed the project lifecycle";
  if (actionType === "task_updated" && values.includes("status")) return "changed a task status";
  if (actionType === "task_updated") return "updated a task";
  if (actionType === "project_member_updated") return "updated a project member";
  return "updated the project";
}

export function formatActivityValue(value: Json): string {
  if (value === null) return "No date";
  if (typeof value === "boolean") return value ? "Active" : "Inactive";
  if (value === "review") return "Client review";
  if (typeof value === "string") return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return String(value);
}

export function getActivityChangeText(changes: Json): string | null {
  if (!isActivityChanges(changes)) return null;
  for (const [field, value] of Object.entries(changes)) {
    if (!isActivityChange(value)) continue;
    const label = field === "assignee_id" ? "Assignee" : field === "due_date" ? "Due date" : field === "assigned_area_m2" ? "Assigned area" : field.replaceAll("_", " ");
    return `${label}: ${formatActivityValue(value.from)} → ${formatActivityValue(value.to)}`;
  }
  return null;
}

export function groupActivityByLocalDate<T extends { created_at: string }>(items: T[], locale = "en"): Array<{ date: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(new Date(item.created_at));
    groups.set(date, [...(groups.get(date) ?? []), item]);
  }
  return [...groups].map(([date, groupedItems]) => ({ date, items: groupedItems }));
}

export function formatRelativeTime(value: string, now = new Date(), locale = "en"): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return locale === "uk" ? "щойно" : "just now";
  const unit = seconds < 3600 ? "minute" : seconds < 86400 ? "hour" : "day";
  const count = Math.floor(seconds / (unit === "minute" ? 60 : unit === "hour" ? 3600 : 86400));
  if (locale === "en") return `${count}${unit === "minute" ? "m" : unit === "hour" ? "h" : "d"} ago`;
  return new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "short" }).format(-count, unit);
}
