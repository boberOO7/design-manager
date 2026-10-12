import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ membership: vi.fn(), rpc: vi.fn(), send: vi.fn(), maybeSingle: vi.fn(), deleteEq: vi.fn(), queryEq: vi.fn(), configured: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.membership }));
vi.mock("@/lib/web-push/config", () => ({ getWebPushConfig: mocks.configured }));
vi.mock("@/lib/web-push/send", () => ({ sendWebPush: mocks.send }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, from: () => ({ select: () => ({ eq: mocks.queryEq }) }) }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: mocks.queryEq }), delete: () => ({ eq: mocks.deleteEq }) }) }) }));
import { GET, POST } from "./route";

const userId = "65000000-0000-4000-8000-000000000010";
const subscription = { id: "65000000-0000-4000-8000-000000000020", user_id: userId, endpoint: "https://fcm.googleapis.com/fcm/send/device", locale: "uk", p256dh: "private-key", auth: "private-auth", vapid_public_key: "public-key" };
const request = (origin = "https://studio.test", endpoint = subscription.endpoint) => new Request("https://studio.test/api/push/test", { method: "POST", headers: { origin, "X-Push-Endpoint": endpoint } });

describe("authenticated current-device push test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.membership.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { authenticatedUserId: userId } });
    mocks.configured.mockReturnValue({ publicKey: "public-key" });
    mocks.rpc.mockResolvedValue({ data: subscription.id, error: null });
    mocks.queryEq.mockReturnValue({ eq: mocks.queryEq, maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: subscription, error: null });
    mocks.deleteEq.mockReturnValue({ eq: mocks.deleteEq, then: (resolve: (value: { error: null }) => void) => resolve({ error: null }) });
    mocks.send.mockResolvedValue({ status: 201, reason: "accepted" });
  });
  it("rejects cross-origin, unsafe endpoints and unauthenticated requests before sending", async () => {
    expect((await POST(request("https://evil.test"))).status).toBe(403);
    expect((await POST(request("https://studio.test", "https://127.0.0.1/private"))).status).toBe(400);
    mocks.membership.mockResolvedValue({ status: "UNAUTHENTICATED" });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("uses the caller-bound limiter and sends to exactly the returned owned subscription", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, reason: "accepted", status: 201 });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("claim_web_push_test", { p_endpoint: subscription.endpoint });
    expect(mocks.queryEq).toHaveBeenCalledWith("user_id", userId);
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(subscription, expect.objectContaining({ subscriptionId: subscription.id, recipientId: userId, test: true }), expect.any(Object));
  });
  it("rejects the cooldown and missing subscriptions without contacting the provider", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "web_push_test_rate_limited" } });
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "web_push_subscription_missing" } });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects invalid configuration before consuming a test allowance", async () => {
    mocks.configured.mockReturnValue(null);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reports the exact expiry reason and removes the expired subscription", async () => {
    mocks.send.mockResolvedValue({ status: 410, reason: "vapid_public_key_mismatch" });
    const response = await POST(request());
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ accepted: false, reason: "vapid_public_key_mismatch", status: 410 });
    expect(mocks.deleteEq).toHaveBeenCalledWith("id", subscription.id);
    expect(mocks.deleteEq).toHaveBeenCalledWith("user_id", userId);
  });
  it("keeps retryable provider failures subscribed", async () => {
    mocks.send.mockResolvedValue({ status: 403, reason: "provider_rejected" });
    expect((await POST(request())).status).toBe(502);
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });
  it("returns no endpoints, keys or raw database errors", async () => {
    const accepted = await POST(request());
    expect(await accepted.text()).not.toMatch(/private-key|private-auth|fcm\.googleapis/);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private-endpoint-or-token" } });
    expect(await (await POST(request())).text()).toBe('{"reason":"unavailable"}');
  });
  it("authorizes the self-test preview through membership and an owned subscription", async () => {
    const request = new Request(`https://studio.test/api/push/test?subscriptionId=${subscription.id}`);
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ recipientId: userId, test: true, href: "/dashboard" });
    expect(mocks.queryEq).toHaveBeenCalledWith("user_id", userId);
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await GET(request)).status).toBe(404);
    mocks.membership.mockResolvedValueOnce({ status: "UNAUTHENTICATED" });
    expect((await GET(request)).status).toBe(401);
  });
});
