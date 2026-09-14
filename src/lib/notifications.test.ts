import { describe, expect, it } from "vitest";
import { addRealtimeToast, dismissRealtimeToast, getRealtimeNotificationDelivery, markAllNotificationsRead, markNotificationRead, mergeNotifications, unreadNotificationCount } from "@/lib/notifications";
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

  it("suppresses historical and duplicate realtime deliveries", () => {
    const sessionStartedAt = "2026-07-28T12:30:00Z";
    expect(getRealtimeNotificationDelivery(unread, sessionStartedAt, new Set(), { popupsEnabled: true, soundEnabled: true })).toBeNull();
    expect(getRealtimeNotificationDelivery({ ...unread, created_at: "2026-07-28T13:00:00Z" }, sessionStartedAt, new Set(["a"]), { popupsEnabled: true, soundEnabled: true })).toBeNull();
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
