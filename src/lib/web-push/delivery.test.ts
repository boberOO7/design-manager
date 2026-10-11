import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import webPush from "web-push";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("web-push", async importOriginal => ({ ...await importOriginal<typeof import("web-push")>(), default: { ...await importOriginal<typeof import("web-push")>(), sendNotification: mocks.send } }));
import { deliverWebPush } from "./delivery";

const key = "D".repeat(87);
const job = { id: randomUUID(), lease_token: randomUUID(), subscription_id: randomUUID(), notification_id: randomUUID(), user_id: randomUUID(), endpoint: "https://fcm.googleapis.com/fcm/send/capability", p256dh: "B".repeat(87), auth: "C".repeat(22), vapid_public_key: key, locale: "uk", attempts: 1 };

describe("server Web Push delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WEB_PUSH_VAPID_PUBLIC_KEY", key);
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", "E".repeat(43));
    vi.stubEnv("WEB_PUSH_VAPID_SUBJECT", "mailto:admin@example.test");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.rpc.mockImplementation(async name => ({ data: name === "claim_web_push_deliveries" ? [job] : null, error: null }));
    mocks.send.mockResolvedValue({ statusCode: 201 });
  });
  it("sends only generic previews and acknowledges the claimed pair", async () => {
    expect(await deliverWebPush()).toMatchObject({ sent: 1 });
    const payload = JSON.parse(mocks.send.mock.calls[0][1]);
    expect(payload).toEqual({ notificationId: job.notification_id, subscriptionId: job.subscription_id, recipientId: job.user_id, title: "StudioFlow", body: "У вас нове сповіщення у StudioFlow." });
    expect(mocks.rpc).toHaveBeenCalledWith("finish_web_push_delivery", { p_id: job.id, p_lease_token: job.lease_token, p_status: 201 });
  });
  it.each([404,410,429,503])("records provider status %i for expiry or retry", async status => {
    mocks.send.mockRejectedValue(new webPush.WebPushError("provider error",status,{},"",job.endpoint));
    expect(await deliverWebPush()).toMatchObject(status === 404 || status === 410 ? { expired: 1 } : { retry: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("finish_web_push_delivery", expect.objectContaining({ p_status: status }));
  });
  it("expires a regex-shaped invalid subscription public key rejected by real encryption", async () => {
    const { default: actual } = await vi.importActual<{ default: typeof webPush }>("web-push");
    mocks.send.mockImplementation((...args: Parameters<typeof webPush.generateRequestDetails>) => {
      // Request generation encrypts locally; never contact the provider.
      actual.generateRequestDetails(...args);
      return Promise.resolve({ statusCode: 201 });
    });
    expect(await deliverWebPush()).toMatchObject({ expired: 1, retry: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith("finish_web_push_delivery", { p_id: job.id, p_lease_token: job.lease_token, p_status: 410 });
  });
  it.each([
    new Error("Socket timeout"),
    Object.assign(new Error("connection reset"), { code: "ECONNRESET" }),
    Object.assign(new Error("VAPID signing failed"), { code: "ERR_OSSL_UNSUPPORTED" }),
    new Error("unrelated encryption failure"),
  ])("keeps transient and unrelated local failures retryable: %s", async error => {
    mocks.send.mockRejectedValueOnce(error);
    expect(await deliverWebPush()).toMatchObject({ expired: 0, retry: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("finish_web_push_delivery", { p_id: job.id, p_lease_token: job.lease_token, p_status: 0 });
  });
  it("rejects unsafe endpoints and rotated VAPID bindings before sending", async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === "claim_web_push_deliveries" ? [{ ...job, endpoint: "https://127.0.0.1/private" }, { ...job, vapid_public_key: "old-key" }] : null, error: null }));
    expect(await deliverWebPush()).toMatchObject({ expired: 2 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not claim jobs without configuration", async () => {
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", "");
    await expect(deliverWebPush()).rejects.toThrow("configuration");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("waits for every claimed job before reporting an acknowledgement failure", async () => {
    const other = { ...job, id: randomUUID(), subscription_id: randomUUID() };
    let release = () => {};
    const pending = new Promise<{ data: null; error: null }>(resolve => { release = () => resolve({ data: null, error: null }); });
    mocks.rpc.mockImplementation(async (name: string, args?: { p_id?: string }) => {
      if (name === "claim_web_push_deliveries") return { data: [job, other], error: null };
      if (args?.p_id === job.id) return { data: null, error: { message: "unavailable" } };
      return pending;
    });
    const delivery = deliverWebPush();
    let settled = false;
    void delivery.then(() => { settled = true; }, () => { settled = true; });
    await vi.waitFor(() => expect(mocks.rpc.mock.calls.filter(([name]) => name === "finish_web_push_delivery")).toHaveLength(2));
    expect(settled).toBe(false);
    release();
    await expect(delivery).rejects.toThrow("acknowledge");
  });
});
