import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), process: vi.fn(), after: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("./queue", () => ({ enqueueMetaLeads: mocks.enqueue, processMetaLeadQueue: mocks.process }));
import { GET, POST } from "@/app/api/integrations/meta-leads/webhook/route";
import { GET as worker } from "@/app/api/integrations/meta-leads/worker/route";

const event = (page = "123", value: Record<string, unknown> = {}) => ({ object: "page", entry: [{ id: page, changes: [{ field: "leadgen", value: { leadgen_id: "456", form_id: "789", page_id: page, ...value } }] }] });
function delivery(body: unknown, signedBody?: string) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const signature = createHmac("sha256", "app-secret").update(signedBody ?? raw).digest("hex");
  return new Request("https://example.test/api/integrations/meta-leads/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": `sha256=${signature}` } });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("META_APP_SECRET", "app-secret"); vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-secret");
  vi.stubEnv("META_PAGE_ID", "123"); vi.stubEnv("META_CRM_STUDIO_ID", "51000000-0000-4000-8000-000000000001");
  vi.stubEnv("CRON_SECRET", "cron-secret");
  mocks.enqueue.mockResolvedValue(1); mocks.process.mockResolvedValue({ completed: 1 });
});
afterEach(() => vi.unstubAllEnvs());

describe("Meta webhook trust boundary", () => {
  it("verifies GET challenge with an independent verify token and fails closed", async () => {
    const url = "https://example.test/?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=";
    const response = await GET(new Request(`${url}verify-secret`));
    expect(response.status).toBe(200); expect(await response.text()).toBe("12345");
    expect((await GET(new Request(`${url}app-secret`))).status).toBe(403);
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "");
    expect((await GET(new Request(url))).status).toBe(403);
  });
  it("requires the exact raw-body signature, rejecting missing, malformed and altered deliveries", async () => {
    const noSignature = new Request("https://example.test", { method: "POST", body: JSON.stringify(event()) });
    expect((await POST(noSignature)).status).toBe(403);
    expect((await POST(delivery(event(), "different bytes"))).status).toBe(403);
    const invalid = delivery(event()); invalid.headers.set("x-hub-signature-256", "sha256=aa");
    expect((await POST(invalid)).status).toBe(403);
    const raw = JSON.stringify(event(), null, 2);
    expect((await POST(delivery(raw))).status).toBe(200);
    expect(mocks.enqueue).toHaveBeenCalledOnce();
  });
  it("rejects foreign entry/value Page IDs and validates the entire batch before persisting", async () => {
    expect((await POST(delivery(event("999")))).status).toBe(403);
    expect((await POST(delivery(event("123", { page_id: "999" })))).status).toBe(403);
    const mixed = event(); mixed.entry.push(...event("999").entry);
    expect((await POST(delivery(mixed))).status).toBe(403);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("does not pass a payload-supplied tenant to the enqueue service", async () => {
    expect((await POST(delivery(event("123", { studio_id: "attacker", created_time: 1760000000 })))).status).toBe(200);
    expect(mocks.enqueue).toHaveBeenCalledWith([{ leadgen_id: "456", form_id: "789", ad_id: undefined, submitted_at: new Date(1760000000000).toISOString() }]);
  });
  it("acknowledges only after durable enqueue resolves, and returns a retryable status on DB failure", async () => {
    let release: (value: number) => void = () => {};
    mocks.enqueue.mockImplementationOnce(() => new Promise<number>(resolve => { release = resolve; }));
    let acknowledged = false;
    const pending = POST(delivery(event())).then(response => { acknowledged = true; return response; });
    await vi.waitFor(() => expect(mocks.enqueue).toHaveBeenCalled());
    expect(acknowledged).toBe(false); expect(mocks.after).not.toHaveBeenCalled();
    release(1); expect((await pending).status).toBe(200);
    mocks.enqueue.mockRejectedValueOnce(new Error("DB down"));
    expect((await POST(delivery(event()))).status).toBe(503);
  });
  it("accepts valid redelivery and rejects malformed signed payloads", async () => {
    mocks.enqueue.mockResolvedValue(0);
    expect((await POST(delivery(event()))).status).toBe(200);
    expect((await POST(delivery(event()))).status).toBe(200);
    expect((await POST(delivery("{"))).status).toBe(400);
    expect((await POST(delivery(event("123", { leadgen_id: "not-an-id" })))).status).toBe(400);
    vi.stubEnv("META_APP_SECRET", "");
    expect((await POST(delivery(event()))).status).toBe(403);
  });
});

it("authenticates the separate worker and exposes no provider errors or secrets", async () => {
  expect((await worker(new Request("https://example.test"))).status).toBe(401);
  expect((await worker(new Request("https://example.test", { headers: { Authorization: "Bearer wrong" } }))).status).toBe(401);
  expect(mocks.process).not.toHaveBeenCalled();
  // pg_net dispatches GET with the same bearer stored in Supabase Vault.
  const request = () => new Request("https://example.test/api/integrations/meta-leads/worker", { method: "GET", headers: { Authorization: "Bearer cron-secret" } });
  const response = await worker(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ completed: 1 });
  expect(mocks.process).toHaveBeenCalledExactlyOnceWith();
  mocks.process.mockRejectedValueOnce(new Error("provider secret"));
  const failed = await worker(request());
  expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("provider secret");
  vi.stubEnv("CRON_SECRET", ""); expect((await worker(request())).status).toBe(401);
});
