import type { NotificationItem } from "@/data/queries/notifications";

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
