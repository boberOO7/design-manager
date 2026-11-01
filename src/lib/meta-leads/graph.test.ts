import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fetchMetaLead, listMetaIds } from "./graph";

function configure() {
  vi.stubEnv("META_GRAPH_API_VERSION", "v25.0"); vi.stubEnv("META_PAGE_ACCESS_TOKEN", "secret-page-token"); vi.stubEnv("META_APP_SECRET", "app-secret");
  return vi.fn<typeof fetch>();
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Meta Graph client", () => {
  it("fetches full answers with server bearer auth, explicit version, timeout and appsecret proof", async () => {
    const fetcher = configure(); vi.stubGlobal("fetch", fetcher);
    fetcher.mockResolvedValue(Response.json({ id: "456", field_data: [], created_time: "2026-10-31T12:00:00Z", campaign_id: "333", custom_disclaimer_responses: [{ checkbox_key: "consent", is_checked: "1" }] }));
    expect(await fetchMetaLead("456")).toMatchObject({ campaign_id: "333", custom_disclaimer_responses: [{ checkbox_key: "consent", is_checked: "1" }] });
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toContain("https://graph.facebook.com/v25.0/456?");
    expect(String(url)).not.toContain("secret-page-token"); expect(String(url)).toContain("appsecret_proof=");
    expect(options).toMatchObject({ headers: { Authorization: "Bearer secret-page-token" }, redirect: "error", cache: "no-store" });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it("paginates from cursors without following provider next URLs or sending secrets elsewhere", async () => {
    const fetcher = configure(); vi.stubGlobal("fetch", fetcher);
    fetcher.mockResolvedValueOnce(Response.json({ data: [{ id: "1" }], paging: { next: "https://attacker.test/?access_token=secret", cursors: { after: "cursor" } } }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: "2" }] }));
    const ids = []; for await (const id of listMetaIds("123", "leadgen_forms")) ids.push(id);
    expect(ids).toEqual(["1", "2"]);
    expect(String(fetcher.mock.calls[1][0])).toContain("graph.facebook.com/v25.0/123/leadgen_forms?");
    expect(String(fetcher.mock.calls[1][0])).toContain("after=cursor");
  });
  it("returns safe error codes for throttling/auth failures and rejects ID mismatches", async () => {
    const fetcher = configure(); vi.stubGlobal("fetch", fetcher);
    fetcher.mockResolvedValueOnce(Response.json({ error: { code: 190, message: "secret-page-token personal data" } }, { status: 400 }));
    await expect(fetchMetaLead("456")).rejects.toThrow("graph_http_400_code_190");
    fetcher.mockResolvedValueOnce(Response.json({ id: "999", field_data: [] }));
    await expect(fetchMetaLead("456")).rejects.toThrow("invalid_graph_lead");
    fetcher.mockRejectedValueOnce(new Error("secret-page-token"));
    await expect(fetchMetaLead("456")).rejects.toThrow("graph_unavailable");
  });
  it("stops on a repeating pagination cursor", async () => {
    const fetcher = configure(); vi.stubGlobal("fetch", fetcher);
    fetcher.mockImplementation(async () => Response.json({ data: [], paging: { next: "next", cursors: { after: "same" } } }));
    await expect((async () => { for await (const id of listMetaIds("123", "leads")) void id; })()).rejects.toThrow("invalid_graph_cursor");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
