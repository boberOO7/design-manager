import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), sourceHash: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }));
vi.mock("@/lib/feedback-rate-limit", () => ({ getFeedbackSourceHash: mocks.sourceHash }));
import { POST } from "./route";
const token = "a".repeat(64);
const body = { satisfaction: 5, communication: 4, timeliness: 3, expectations: 5, recommendation: 0, strengths: " Thoughtful ", improvements: "", website: "" };
function post(value: unknown = body, options: { token?: string; origin?: string; contentType?: string; raw?: string } = {}) {
  return POST(new Request("https://studio.example/api/feedback/" + (options.token ?? token), {
    method: "POST", headers: { origin: options.origin ?? "https://studio.example", "content-type": options.contentType ?? "application/json" }, body: options.raw ?? JSON.stringify(value),
  }), { params: Promise.resolve({ token: options.token ?? token }) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.sourceHash.mockReturnValue("b".repeat(64)); mocks.client.mockReturnValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ data: true, error: null }); });
describe("public feedback trust boundary", () => {
  it.each([
    [{ ...body, satisfaction: 0 }, {}], [{ ...body, recommendation: 11 }, {}],
    [{ ...body, communication: 1.5 }, {}], [{ ...body, timeliness: "5" }, {}],
    [{ ...body, projectId: "forged" }, {}], [{ ...body, studioId: "forged" }, {}],
    [{ ...body, strengths: "x".repeat(2001) }, {}], [{ ...body, website: "spam" }, {}],
    [{ ...body, expectations: null }, {}], [body, { raw: "{" }], [body, { contentType: "text/plain" }],
  ])("rejects malformed, spoofed or bot payloads before database access", async (value, options) => {
    expect((await post(value, options)).status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("bounds actual request bytes", async () => {
    expect((await post(body, { raw: "x".repeat(200001) })).status).toBe(413);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("requires a same-origin browser submission", async () => {
    expect((await post(body, { origin: "https://evil.example" })).status).toBe(403);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("rejects malformed tokens before database access", async () => {
    expect((await post(body, { token: "invalid" })).status).toBe(410);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("accepts NPS zero and sends only validated fields to the atomic RPC", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("submit_feedback_with_cooldown", {
      p_token: token, p_source_hash: "b".repeat(64),
      p_answers: { satisfaction: 5, communication: 4, timeliness: 3, expectations: 5, recommendation: 0, strengths: "Thoughtful", improvements: "" },
    });
  });
  it("handles invalid, expired and revoked capabilities without exposing internal state", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const response = await post();
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
  it("does not expose database errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    const response = await post();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "save" });
  });
});

it("submits versioned answers without accepting client-supplied version or tenant IDs", async () => {
  const { website, ...answers } = body;
  const response = await post({ answers, website });
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("submit_feedback_with_cooldown", { p_token: token, p_source_hash: "b".repeat(64), p_answers: { ...answers, strengths: "Thoughtful" } });
  mocks.client.mockClear();
  expect((await post({ answers, website, versionId: "forged" })).status).toBe(400);
  expect(mocks.client).not.toHaveBeenCalled();
});
it("maps invitation-specific answer validation to a safe client error", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "feedback_invalid_response" } });
  const { website, ...answers } = body;
  const response = await post({ answers, website });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid" });
});

it("returns an actionable cooldown without disclosing internal database details", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "feedback_rate_limited", details: "243" } });
  const response = await post();
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("243");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "rate_limited" });
});
it.each([undefined, "", "private detail", "-1", "0", "301", "1.5"])("bounds malformed cooldown details: %s", async details => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "feedback_rate_limited", details } });
  const response = await post();
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("300");
});
