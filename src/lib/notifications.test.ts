import { describe, expect, it } from "vitest";
import { addRealtimeToast, dismissRealtimeToast, getRealtimeNotificationCatchup, getRealtimeNotificationDelivery, markAllNotificationsRead, markNotificationRead, mergeNotifications, notificationCursorFilter, notificationPageSize, oldestNotificationCursor, reconcileNotificationUnreadCount, restoreNotificationReadState, unreadNotificationCount } from "@/lib/notifications";
import type { NotificationItem } from "@/data/queries/notifications";

const unread: NotificationItem = { id: "a", notification_type: "task_assigned", title: "Assigned", body: "Body", href: "/projects/p?task=a", metadata: {}, read_at: null, created_at: "2026-07-28T12:00:00Z", actorName: null };
const read: NotificationItem = { ...unread, id: "b", read_at: "2026-07-28T11:00:00Z", created_at: "2026-07-28T11:00:00Z" };

describe("notification local state", () => {
  it("counts and marks one unread notification", () => {
    expect(unreadNotificationCount([unread, read])).toBe(1);
    expect(markNotificationRead([unread], "a", "2026-07-29T00:00:00Z")[0].read_at).not.toBeNull();
  });
  it("marks all and keeps confirmed reads through reconciliation without duplicates", () => {
    const marked = markAllNotificationsRead([unread, read], "2026-07-29T00:00:00Z");
    expect(unreadNotificationCount(marked)).toBe(0);
    const merged = mergeNotifications(marked, [{ ...unread, created_at: "2026-07-30T00:00:00Z" }, unread]);
    expect(merged).toHaveLength(2);
    expect(merged.find((item) => item.id === "a")?.read_at).not.toBeNull();
  });

  it("restores failed read-all updates and leaves inserts newer than its cutoff unread", () => {
    const cutoff = "2026-07-28T12:00:00.123Z";
    const before = [unread];
    const newer = { ...unread, id: "newer", created_at: "2026-07-28T12:00:00.124Z" };
    const live = { ...unread, id: "live", created_at: "2026-07-28T12:00:00.125Z" };
    const optimistic = markAllNotificationsRead([unread, newer], cutoff);
    expect(optimistic[0]?.read_at).toBe(cutoff);
    expect(optimistic[1]?.read_at).toBeNull();
    expect(restoreNotificationReadState([...optimistic, live], before)).toEqual([unread, newer, live]);
  });

  it("keeps the exact unread badge and reaches older pages beyond the first 30", () => {
    const recent = Array.from({ length: notificationPageSize }, (_, index) => ({
      ...unread,
      id: String(index + 100).padStart(3, "0"),
      created_at: `2026-07-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    }));
    const older = { ...unread, id: "001", created_at: "2026-06-30T12:00:00Z" };
    const merged = mergeNotifications(recent, [older], Number.POSITIVE_INFINITY);
    const cursor = oldestNotificationCursor(merged);
    expect(merged).toHaveLength(31);
    expect(cursor).toEqual({ id: older.id, created_at: older.created_at });
    expect(notificationCursorFilter({ id: "050", created_at: older.created_at })).toContain("id.lt.050");
    expect(notificationCursorFilter({ id: "050", created_at: older.created_at })).toContain("created_at.eq.");
    const live = { ...unread, id: "live", created_at: "2026-07-31T12:00:00Z" };
    const afterLiveInsert = mergeNotifications(recent, [live], Number.POSITIVE_INFINITY);
    expect(afterLiveInsert).toHaveLength(31);
    expect(oldestNotificationCursor(afterLiveInsert)).toEqual(oldestNotificationCursor(recent));
    expect(reconcileNotificationUnreadCount(31, "2026-07-01T00:00:00Z", []).unreadCount).toBe(31);
    expect(reconcileNotificationUnreadCount(31, "2026-07-01T00:00:00Z", [
      { at: "2026-07-01T00:01:00Z", delta: 1 },
      { at: "2026-07-01T00:02:00Z", delta: -1 },
    ]).unreadCount).toBe(31);
    expect(reconcileNotificationUnreadCount(31, "2026-07-01T00:00:00Z", [
      { at: "2026-07-01T00:01:00Z", reset: true },
      { at: "2026-07-01T00:02:00Z", delta: 1 },
    ]).unreadCount).toBe(1);
  });

  it("suppresses historical and duplicate realtime deliveries", () => {
    const sessionStartedAt = "2026-07-28T12:30:00Z";
    expect(getRealtimeNotificationDelivery(unread, sessionStartedAt, new Set(), { popupsEnabled: true, soundEnabled: true })).toBeNull();
    expect(getRealtimeNotificationDelivery({ ...unread, created_at: "2026-07-28T13:00:00Z" }, sessionStartedAt, new Set(["a"]), { popupsEnabled: true, soundEnabled: true })).toBeNull();
  });

  it("turns missed query rows into deduplicated realtime deliveries", () => {
    const watermark = "2026-07-28T12:00:00Z";
    const recipientId = "user-1";
    const missed = { ...unread, recipient_id: recipientId, created_at: "2026-07-28T12:00:00.123456+00:00" };
    const pending = getRealtimeNotificationCatchup([
      missed,
      { ...missed, id: "read", read_at: "2026-07-28T12:02:00Z" },
      { ...missed, id: "unrelated", recipient_id: "user-2" },
      { ...missed, id: "old", created_at: "2026-07-28T11:59:59Z" },
    ], recipientId, "2026-07-28T12:00:00.123Z", new Set(), new Set(), { popupsEnabled: true, soundEnabled: false });
    const expectedItem = (({ recipient_id: _recipientId, ...item }) => item)(missed);
    expect(pending).toEqual([{ item: { ...expectedItem, actorName: null }, delivery: { showToast: true, playSound: false } }]);
    expect(addRealtimeToast([], pending[0]!.item)).toEqual([{ ...expectedItem, actorName: null }]);
    expect(getRealtimeNotificationCatchup([missed], recipientId, "2026-07-28T12:00:00.123Z", new Set([missed.id]), new Set(), { popupsEnabled: true, soundEnabled: true })).toEqual([]);
    expect(getRealtimeNotificationCatchup([missed], recipientId, "2026-07-28T12:00:00.123Z", new Set(), new Set([missed.id]), { popupsEnabled: true, soundEnabled: true })).toEqual([]);
    const backlog = Array.from({ length: 31 }, (_, index) => ({ ...missed, id: `missed-${index}`, created_at: `2026-07-28T12:00:${String(index + 1).padStart(2, "0")}Z` }));
    expect(getRealtimeNotificationCatchup(backlog, recipientId, watermark, new Set(), new Set(), { popupsEnabled: true, soundEnabled: true })).toHaveLength(31);
  });

  it("keeps popup and sound preferences independent", () => {
    const incoming = { ...unread, created_at: "2026-07-28T13:00:00Z" };
    expect(getRealtimeNotificationDelivery(incoming, "2026-07-28T12:30:00Z", new Set(), { popupsEnabled: false, soundEnabled: true })).toEqual({ showToast: false, playSound: true });
    expect(getRealtimeNotificationDelivery(incoming, "2026-07-28T12:30:00Z", new Set(), { popupsEnabled: true, soundEnabled: false })).toEqual({ showToast: true, playSound: false });
  });

  it("limits the toast stack and dismisses it without changing notification read state", () => {
    const notifications = [unread];
    const toastItems = ["b", "c", "d", "e"].reduce((current, id) => addRealtimeToast(current, { ...unread, id }), [] as NotificationItem[]);
    expect(toastItems.map((item) => item.id)).toEqual(["c", "d", "e"]);
    expect(dismissRealtimeToast(toastItems, "d").map((item) => item.id)).toEqual(["c", "e"]);
    expect(notifications[0].read_at).toBeNull();
  });
});
