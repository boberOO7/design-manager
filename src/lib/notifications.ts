import type { NotificationItem } from "@/data/queries/notifications";
import type { Database } from "@/types/database.types";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export function unreadNotificationCount(items: NotificationItem[]) { return items.filter((item) => item.read_at === null).length; }
export function markNotificationRead(items: NotificationItem[], id: string, readAt: string) { return items.map((item) => item.id === id ? { ...item, read_at: item.read_at ?? readAt } : item); }
export function markAllNotificationsRead(items: NotificationItem[], readAt: string) { return items.map((item) => item.read_at === null ? { ...item, read_at: readAt } : item); }
export function mergeNotifications(current: NotificationItem[], incoming: NotificationItem[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const prior = byId.get(item.id);
    byId.set(item.id, prior?.read_at ? { ...item, read_at: prior.read_at } : item);
  }
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30);
}

export function notificationFromRealtimeRow(row: Partial<NotificationRow>, recipientId: string): NotificationItem | null {
  if (row.recipient_id !== recipientId || typeof row.id !== "string" || typeof row.notification_type !== "string" || typeof row.title !== "string" || typeof row.body !== "string" || typeof row.href !== "string" || typeof row.created_at !== "string" || (row.read_at !== null && typeof row.read_at !== "string")) return null;
  return { id: row.id, notification_type: row.notification_type, title: row.title, body: row.body, href: row.href, metadata: row.metadata ?? {}, read_at: row.read_at, created_at: row.created_at, actorName: null };
}

export function getRealtimeNotificationDelivery(item: NotificationItem, sessionStartedAt: string, knownIds: ReadonlySet<string>, preferences: { popupsEnabled: boolean; soundEnabled: boolean }) {
  const createdAt = Date.parse(item.created_at);
  if (knownIds.has(item.id) || Number.isNaN(createdAt) || createdAt < Date.parse(sessionStartedAt)) return null;
  return { showToast: preferences.popupsEnabled, playSound: preferences.soundEnabled };
}

export function addRealtimeToast(current: NotificationItem[], incoming: NotificationItem) {
  return [...current.filter((item) => item.id !== incoming.id), incoming].slice(-3);
}

export function dismissRealtimeToast(current: NotificationItem[], id: string) {
  return current.filter((item) => item.id !== id);
}
