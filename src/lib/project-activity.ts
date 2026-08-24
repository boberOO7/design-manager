import type { Json } from "@/types/database.types";

export type ActivityChange = { from: Json; to: Json };
export type ActivityChanges = Record<string, Json | ActivityChange>;
export type ActivityChangeDetails = { field: string; from: Json; to: Json };

export function isActivityChanges(value: Json): value is ActivityChanges {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isActivityChange(value: Json | undefined): value is ActivityChange {
  return value !== undefined && isActivityChanges(value) && "from" in value && "to" in value;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function getActivityMemberId(changes: Json): string | null {
  if (!isActivityChanges(changes) || typeof changes.member_id !== "string") return null;
  return changes.member_id;
}

export function getActivityMemberIds(changes: Json): string[] {
  if (!isActivityChanges(changes)) return [];
  const ids = new Set<string>();
  const memberId = getActivityMemberId(changes);
  if (memberId) ids.add(memberId);
  const assignee = changes.assignee_id;
  if (isActivityChange(assignee)) {
    if (typeof assignee.from === "string") ids.add(assignee.from);
    if (typeof assignee.to === "string") ids.add(assignee.to);
  } else if (typeof assignee === "string") {
    ids.add(assignee);
  }
  return [...ids];
}

export function getActivityChange(changes: Json): ActivityChangeDetails | null {
  if (!isActivityChanges(changes)) return null;
  for (const [field, value] of Object.entries(changes)) {
    if (!isActivityChange(value)) continue;
    return { field, from: value.from, to: value.to };
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
