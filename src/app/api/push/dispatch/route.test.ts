import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ deliver: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/web-push/delivery", () => ({ deliverWebPush: mocks.deliver }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
import { GET, POST } from "./route";

const dispatchId = "65000000-0000-4000-8000-000000000001";
const webhook = (body: unknown = { dispatchId }, authorization = "Bearer worker-secret") => new Request("https://studio.test/api/push/dispatch", {
  method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("server-only Push dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET","worker-secret");
    mocks.deliver.mockResolvedValue({ claimed: 1, sent: 1, expired: 0, retry: 0 });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });
  it.each([null,"Bearer wrong","worker-secret"])("rejects missing/invalid worker authentication %s", async authorization => {
    const response = await GET(new Request("https://studio.test/api/push/dispatch", { headers: authorization ? { Authorization: authorization } : {} }));
    expect(response.status).toBe(401);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it("dispatches only with the configured server credential", async () => {
    const response = await GET(new Request("https://studio.test/api/push/dispatch", { headers: { Authorization: "Bearer worker-secret" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.deliver).toHaveBeenCalledOnce();
  });
  it("fails closed when no worker secret is configured", async () => {
    vi.stubEnv("CRON_SECRET","");
    expect((await GET(new Request("https://studio.test/api/push/dispatch"))).status).toBe(401);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it("authenticates webhook calls before dispatch or database access", async () => {
    expect((await POST(webhook({ dispatchId }, "Bearer wrong"))).status).toBe(401);
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ dispatchId: "invalid" }, { dispatchId, userId: dispatchId }, null])("rejects invalid webhook payload %j", async body => {
    expect((await POST(webhook(body))).status).toBe(400);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it("acknowledges the correlated webhook after the existing worker finishes", async () => {
    expect((await POST(webhook())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("complete_web_push_dispatch", { p_dispatch_id: dispatchId, p_success: true });
  });
  it("arms database recovery when the worker fails without leaking provider details", async () => {
    mocks.deliver.mockRejectedValue(new Error("private endpoint or token"));
    const response = await POST(webhook());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private endpoint");
    expect(mocks.rpc).toHaveBeenCalledWith("complete_web_push_dispatch", { p_dispatch_id: dispatchId, p_success: false });
  });
});
