import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint, pushSubscriptionSchema, safeNotificationHref } from "./subscription";

describe("Push trust boundaries", () => {
  it.each(["https://fcm.googleapis.com/fcm/send/token", "https://updates.push.services.mozilla.com/wpush/v2/token", "https://web.push.apple.com/token", "https://wns2-test.notify.windows.com/w/?token=abc"])("allows provider %s", endpoint => expect(isAllowedPushEndpoint(endpoint)).toBe(true));
  it.each(["https://localhost/push", "http://fcm.googleapis.com/push", "https://fcm.googleapis.com.evil.test/push", "https://user@fcm.googleapis.com/push", "https://fcm.googleapis.com:444/push", "https://169.254.169.254/latest/meta-data", "https://fcm.googleapis.com/push#fragment"])("rejects %s", endpoint => expect(isAllowedPushEndpoint(endpoint)).toBe(false));
  it("rejects browser-supplied recipient and invalid encryption keys", () => {
    const value = { expectedUserId: "65000000-0000-4000-8000-000000000010", endpoint: "https://fcm.googleapis.com/push", keys: { p256dh: "B".repeat(87), auth: "C".repeat(22) }, locale: "uk" };
    expect(pushSubscriptionSchema.safeParse(value).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ ...value, userId: "another-user" }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...value, keys: { p256dh: "broken", auth: "broken" } }).success).toBe(false);
  });
  it.each(["//evil.test", "/\\evil.test", "/\n/evil.test", "https://evil.test"])("rejects unsafe navigation %s", href => expect(safeNotificationHref(href)).toBe("/dashboard"));
  it("preserves task deep links", () => expect(safeNotificationHref("/projects/abc?task=123#details")).toBe("/projects/abc?task=123#details"));
});
