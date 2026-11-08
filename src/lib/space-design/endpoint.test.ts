import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ accept: vi.fn() }));
vi.mock("./queue", () => ({ acceptSpaceDesignLead: mocks.accept }));
import { POST } from "@/app/api/integrations/space-design/leads/route";
import { SPACE_DESIGN_PATH, MAX_BODY_BYTES } from "./security";

const secret = "a".repeat(64), studio = "65000000-0000-4000-8000-000000000001";
const payload = {
  schema_version: 1, submission_id: "65000000-0000-4000-8000-000000000002", submitted_at: "2026-11-07T12:00:00Z",
  form_id: 3032, form_location: "footer", language: "uk", page_url: "https://space.example.test/contact", client_name: "Тест",
  phone: "050 123 45 67", email: null,
};
function signed(body = JSON.stringify(payload), timestamp = "1794052800", extra: Record<string, string> = {}) {
  const signature = createHmac("sha256", secret).update(`${timestamp}\nPOST\n${SPACE_DESIGN_PATH}\n${body}`).digest("hex");
  return new Request(`https://crm.test${SPACE_DESIGN_PATH}`, { method: "POST", body, headers: {
    "content-type": "application/json", "x-sd-key-id": "space-dev", "x-sd-timestamp": timestamp,
    "idempotency-key": payload.submission_id, "x-sd-signature": `sha256=${signature}`, ...extra,
  } });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
  vi.stubEnv("SPACE_DESIGN_KEY_ID", "space-dev"); vi.stubEnv("SPACE_DESIGN_CRM_STUDIO_ID", studio);
  vi.stubEnv("SPACE_DESIGN_HMAC_SECRET", secret);
  mocks.accept.mockResolvedValue("accepted");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("SPACE DESIGN authenticated inbox endpoint", () => {
  it("accepts only after the durable inbox acknowledges the event, with server-bound tenant", async () => {
    const response = await POST(signed());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ submission_id: payload.submission_id, status: "accepted" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.accept).toHaveBeenCalledWith("space-dev", studio, expect.stringMatching(/^[a-f0-9]{64}$/), payload);
    const reordered = Object.fromEntries(Object.entries(payload).reverse());
    await POST(signed(JSON.stringify(reordered, null, 2)));
    expect(mocks.accept.mock.calls[1][2]).toBe(mocks.accept.mock.calls[0][2]);
  });
  it.each([["replayed", 200], ["conflict", 409], ["unauthorized", 401], ["rate_limited", 429]])("maps durable result %s to %i", async (result, status) => {
    mocks.accept.mockResolvedValue(result);
    const response = await POST(signed()); expect(response.status).toBe(status);
    if (status === 429) expect(response.headers.get("retry-after")).toBe("60");
  });
  it.each<Record<string, string>>([
    { "x-sd-signature": `sha256=${"0".repeat(64)}` }, { "x-sd-signature": "" }, { "x-sd-key-id": "another-studio" },
    { "x-sd-timestamp": "1794052499" }, { "x-sd-timestamp": "1794053101" }, { "x-sd-timestamp": "1794052800000" },
  ])("rejects forged, missing, expired and future credentials before enqueue: %j", async headers => {
    expect((await POST(signed(undefined, undefined, headers))).status).toBe(401); expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("checks raw bytes and the signed method/path", async () => {
    const request = signed(); const headers = Object.fromEntries(request.headers);
    expect((await POST(new Request(request.url, { method: "POST", headers, body: `${JSON.stringify(payload)} ` }))).status).toBe(401);
    headers["x-sd-signature"] = `sha256=${createHmac("sha256", secret).update(`1794052800\nGET\n/wrong\n${JSON.stringify(payload)}`).digest("hex")}`;
    expect((await POST(signed(undefined, undefined, headers))).status).toBe(401);
  });
  it.each([
    { phone: null, email: null }, { phone: "bad" }, { phone: "123" }, { email: "bad" }, { client_name: " " },
    { schema_version: 2 }, { form_id: 123 }, { form_location: "modal" }, { language: "ru" }, { submitted_at: "yesterday" },
    { page_url: "javascript:alert(1)" }, { page_url: "https://user:password@example.test" }, { studio_id: studio }, { email: "" },
  ])("validates contract and rejects tenant injection: %j", async patch => {
    expect((await POST(signed(JSON.stringify({ ...payload, ...patch })))).status).toBe(400);
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("accepts modal email-only contact, normalizes whitespace/case, and checks Idempotency-Key", async () => {
    const body = JSON.stringify({ ...payload, form_id: 7153, form_location: "modal", phone: null, email: " Person@Example.test " });
    expect((await POST(signed(body))).status).toBe(202);
    expect(mocks.accept.mock.calls[0][3]).toMatchObject({ phone: null, email: "person@example.test" });
    expect((await POST(signed(body, undefined, { "idempotency-key": studio }))).status).toBe(400);
    expect((await POST(signed(body, undefined, { "idempotency-key": "" }))).status).toBe(400);
  });
  it("bounds chunked bodies and declared size, rejects invalid JSON and media type", async () => {
    expect((await POST(signed("{"))).status).toBe(400);
    expect((await POST(signed(" ".repeat(MAX_BODY_BYTES + 1)))).status).toBe(413);
    expect((await POST(signed(undefined, undefined, { "content-length": String(MAX_BODY_BYTES + 1) }))).status).toBe(413);
    expect((await POST(signed(undefined, undefined, { "content-type": "text/plain" }))).status).toBe(415);
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("fails closed during API/configuration outages without leaking payloads or secrets", async () => {
    mocks.accept.mockRejectedValue(new Error(`database error ${secret} ${payload.phone}`));
    const response = await POST(signed()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
    vi.stubEnv("SPACE_DESIGN_HMAC_SECRET", ""); expect((await POST(signed())).status).toBe(503);
  });
});
