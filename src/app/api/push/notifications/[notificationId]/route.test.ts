import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }));
import { GET } from "./route";

const userId = "65000000-0000-4000-8000-000000000010";
const subscriptionId = "65000000-0000-4000-8000-000000000020";
const notificationId = "65000000-0000-4000-8000-000000000030";

function query(data: unknown, error: unknown = null) {
  return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
}
const notification = (notification_type = "task_assigned") => ({ href: "/projects/project?task=task", read_at: null, notification_type, metadata: { subject: "План кухні", eventTitle: "Зустріч", projectName: "Квартира" }, entity_id: "event", entity_type: notification_type.startsWith("calendar_") ? "calendar_event" : "task" });
const request = () => GET(new Request(`https://studio.test/api/push/notifications/${notificationId}?subscriptionId=${subscriptionId}`), { params: Promise.resolve({ notificationId }) });

describe("authorized Web Push previews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.membership.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { authenticatedUserId: userId } });
  });

  it("binds both records to the verified user and uses the subscription locale", async () => {
    const item = query(notification());
    const subscription = query({ id: subscriptionId, locale: "en" });
    mocks.from.mockReturnValueOnce(item).mockReturnValueOnce(subscription);
    const response = await request();
    expect(item.eq).toHaveBeenCalledWith("recipient_id", userId);
    expect(subscription.eq).toHaveBeenCalledWith("user_id", userId);
    expect(item.eq).toHaveBeenCalledWith("id", notificationId);
    expect(subscription.eq).toHaveBeenCalledWith("id", subscriptionId);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ recipientId: userId, href: "/projects/project?task=task", read: false, title: "New task assigned", body: "“План кухні” · Квартира" });
  });

  it("returns no content without authentication or either owned record", async () => {
    mocks.membership.mockResolvedValueOnce({ status: "UNAUTHENTICATED" });
    expect((await request()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    for (const [item, subscription] of [[null, { id: subscriptionId, locale: "uk" }], [notification(), null]]) {
      mocks.from.mockReturnValueOnce(query(item)).mockReturnValueOnce(query(subscription));
      const response = await request();
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({});
    }
  });

  it.each([false, null])("suppresses stale or future reminders at browser display time: %s", async data => {
    mocks.from.mockReturnValueOnce(query(notification("equipment_maintenance_upcoming"))).mockReturnValueOnce(query({ id: subscriptionId, locale: "en" }));
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    expect((await request()).status).toBe(404);
    expect(mocks.rpc).toHaveBeenCalledWith("is_notification_deliverable", { p_notification_id: notificationId });
  });

  it("fails closed if current reminder validation is unavailable", async () => {
    mocks.from.mockReturnValueOnce(query(notification())).mockReturnValueOnce(query({ id: subscriptionId, locale: "en" }));
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Unavailable" } });
    expect((await request()).status).toBe(503);
  });

  it.each([
    { name: "accessible project meeting", event: { event_type: "meeting", project_id: "project" }, body: "«Зустріч» · Квартира" },
    { name: "HR interview", event: { event_type: "interview", project_id: "project" }, body: "Перегляньте подію в календарі StudioFlow." },
    { name: "non-project event", event: { event_type: "meeting", project_id: null }, body: "Перегляньте подію в календарі StudioFlow." },
    { name: "inaccessible or deleted event", event: null, body: "Перегляньте подію в календарі StudioFlow." },
  ])("handles $name without exposing private event names", async ({ event, body }) => {
    mocks.from.mockReturnValueOnce(query(notification("calendar_event_invitation"))).mockReturnValueOnce(query({ id: subscriptionId, locale: "uk" })).mockReturnValueOnce(query(event));
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ title: "Запрошення на подію", body });
  });

  it("keeps delivery available with a safe fallback if calendar lookup fails", async () => {
    mocks.from.mockReturnValueOnce(query(notification("calendar_event_updated"))).mockReturnValueOnce(query({ id: subscriptionId, locale: "uk" })).mockReturnValueOnce(query(null, { message: "Unavailable" }));
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ title: "Подію оновлено", body: "Перегляньте подію в календарі StudioFlow." });
  });
});
