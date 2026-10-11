import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ membership: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/web-push/config", () => ({ getWebPushConfig: () => ({ publicKey: "D".repeat(87) }) }));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
import { POST } from "./route";

describe("Push registration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.membership.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { authenticatedUserId: "65000000-0000-4000-8000-000000000010" } });
    mocks.rpc.mockResolvedValue({ data: "subscription", error: null });
  });
  const input = { expectedUserId: "65000000-0000-4000-8000-000000000010", endpoint: "https://fcm.googleapis.com/fcm/send/device", keys: { p256dh: "B".repeat(87), auth: "C".repeat(22) }, locale: "uk" };
  const request = (body: unknown, origin = "https://studio.test") => new Request("https://studio.test/api/push/subscriptions", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  it("uses the caller-bound RPC without passing a user ID", async () => {
    expect((await POST(request(input))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("register_web_push_subscription", { p_endpoint: input.endpoint, p_p256dh: input.keys.p256dh, p_auth: input.keys.auth, p_locale: "uk", p_vapid_public_key: "D".repeat(87) });
  });
  it("rejects foreign recipients, cross-origin requests and inactive users", async () => {
    expect((await POST(request({ ...input, userId: "victim" }))).status).toBe(400);
    expect((await POST(request(input,"https://evil.test"))).status).toBe(403);
    mocks.membership.mockResolvedValue({ status: "UNAUTHENTICATED" });
    expect((await POST(request(input))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects account changes before registration", async () => {
    expect((await POST(request({ ...input, expectedUserId: "65000000-0000-4000-8000-000000000011" }))).status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
