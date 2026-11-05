import type { NotificationItem } from "@/data/queries/notifications";
import type { Database } from "@/types/database.types";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
export const notificationPageSize = 30;
export type NotificationCursor = Pick<NotificationItem, "id" | "created_at">;
export type NotificationUnreadChange = { at: string; delta: number } | { at: string; reset: true };

export function unreadNotificationCount(items: NotificationItem[]) { return items.filter((item) => item.read_at === null).length; }
export function markNotificationRead(items: NotificationItem[], id: string, readAt: string) { return items.map((item) => item.id === id ? { ...item, read_at: item.read_at ?? readAt } : item); }
export function markAllNotificationsRead(items: NotificationItem[], readAt: string) { return items.map((item) => item.read_at === null && notificationTimeOrder(item.created_at) <= notificationTimeOrder(readAt) ? { ...item, read_at: readAt } : item); }
export function restoreNotificationReadState(items: NotificationItem[], before: NotificationItem[]) {
  const readAtById = new Map(before.map((item) => [item.id, item.read_at]));
  return items.map((item) => readAtById.has(item.id) ? { ...item, read_at: readAtById.get(item.id) ?? null } : item);
}
export function mergeNotifications(current: NotificationItem[], incoming: NotificationItem[], limit = notificationPageSize) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const prior = byId.get(item.id);
    byId.set(item.id, prior?.read_at ? { ...item, read_at: prior.read_at } : item);
  }
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, limit);
}

export function oldestNotificationCursor(items: NotificationItem[]): NotificationCursor | null {
  const oldest = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
  return oldest ? { id: oldest.id, created_at: oldest.created_at } : null;
}

export function notificationCursorFilter(cursor: NotificationCursor) {
  return `created_at.lt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.lt.${cursor.id})`;
}

function notificationTimeOrder(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return Number.NaN;
  const fraction = /\.(\d+)(?=Z|[+-]\d{2}:?\d{2}$)/.exec(value)?.[1] ?? "";
  const microsecondsBelowMillisecond = Number((fraction + "000000").slice(0, 6)) % 1000;
  return milliseconds * 1000 + microsecondsBelowMillisecond;
}

export function reconcileNotificationUnreadCount(serverCount: number, snapshotAt: string, changes: NotificationUnreadChange[]) {
  const snapshotTime = notificationTimeOrder(snapshotAt);
  const pending = changes.filter((change) => Number.isFinite(snapshotTime) && notificationTimeOrder(change.at) > snapshotTime)
    .sort((a, b) => notificationTimeOrder(a.at) - notificationTimeOrder(b.at));
  const unreadCount = pending.reduce((count, change) => "reset" in change ? 0 : Math.max(0, count + change.delta), serverCount);
  return { unreadCount, pending };
}

export function notificationFromRealtimeRow(row: Partial<NotificationRow>, recipientId: string): NotificationItem | null {
  if (row.recipient_id !== recipientId || typeof row.id !== "string" || typeof row.notification_type !== "string" || typeof row.title !== "string" || typeof row.body !== "string" || typeof row.href !== "string" || typeof row.created_at !== "string" || (row.read_at !== null && typeof row.read_at !== "string")) return null;
  return { id: row.id, notification_type: row.notification_type, title: row.title, body: row.body, href: row.href, metadata: row.metadata ?? {}, read_at: row.read_at, created_at: row.created_at, actorName: null };
}

export function getRealtimeNotificationDelivery(item: NotificationItem, sessionStartedAt: string, knownIds: ReadonlySet<string>, preferences: { popupsEnabled: boolean; soundEnabled: boolean }) {
  const createdAt = notificationTimeOrder(item.created_at);
  const sessionStart = notificationTimeOrder(sessionStartedAt);
  if (knownIds.has(item.id) || !Number.isFinite(createdAt) || !Number.isFinite(sessionStart) || createdAt < sessionStart) return null;
  return { showToast: preferences.popupsEnabled, playSound: preferences.soundEnabled };
}

export function getRealtimeNotificationCatchup(rows: Partial<NotificationRow>[], recipientId: string, sessionStartedAt: string, knownIds: ReadonlySet<string>, processingIds: ReadonlySet<string>, preferences: { popupsEnabled: boolean; soundEnabled: boolean }) {
  const alreadyHandled = new Set([...knownIds, ...processingIds]);
  return rows.flatMap(row => {
    const item = notificationFromRealtimeRow(row, recipientId);
    if (!item || item.read_at) return [];
    const delivery = getRealtimeNotificationDelivery(item, sessionStartedAt, alreadyHandled, preferences);
    return delivery ? [{ item, delivery }] : [];
  });
}

export function addRealtimeToast(current: NotificationItem[], incoming: NotificationItem) {
  return [...current.filter((item) => item.id !== incoming.id), incoming].slice(-3);
}

export function dismissRealtimeToast(current: NotificationItem[], id: string) {
  return current.filter((item) => item.id !== id);
}
