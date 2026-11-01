import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => {
  const query = { eq(_column: string, _value: unknown) { return this; }, select(_columns: string) { return this; }, maybeSingle: vi.fn() };
  const update = vi.fn(() => query);
  return { query, update, rpc: vi.fn(), from: vi.fn(() => ({ update })), fetchLead: vi.fn() };
});
vi.mock("@/lib/supabase/admin-client", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("./graph", async importOriginal => ({ ...await importOriginal<typeof import("./graph")>(), fetchMetaLead: mocks.fetchLead }));
import { enqueueMetaLeads, processMetaLeadQueue } from "./queue";

const studioId = "51000000-0000-4000-8000-000000000001";
const job: Database["public"]["Tables"]["meta_lead_jobs"]["Row"] = {
  page_id: "123", leadgen_id: "456", studio_id: studioId, form_id: "789", ad_id: null, submitted_at: null, payload: null,
  crm_lead_id: null, status: "processing", attempts: 1, available_at: "2026-10-31T12:00:00Z", locked_at: "2026-10-31T12:00:00Z",
  lease_token: "51000000-0000-4000-8000-000000000009", last_error: null, created_at: "2026-10-31T12:00:00Z", updated_at: "2026-10-31T12:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("META_PAGE_ID", "123"); vi.stubEnv("META_CRM_STUDIO_ID", studioId);
  vi.stubEnv("META_GRAPH_API_VERSION", "v25.0"); vi.stubEnv("META_PAGE_ACCESS_TOKEN", "token"); vi.stubEnv("META_APP_SECRET", "secret");
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_meta_lead_jobs" ? [job] : name === "complete_meta_lead_job" ? "lead-id" : 1, error: null }));
  mocks.query.maybeSingle.mockResolvedValue({ data: { leadgen_id: "456" }, error: null });
  mocks.fetchLead.mockResolvedValue({ id: "456", form_id: "789", created_time: "2026-10-30T23:30:00+0000", field_data: [{ name: "full_name", values: ["Real Name"] }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("durable Meta worker orchestration", () => {
  it("enqueues with only the configured page and studio, passing explicit retry only for operator repair", async () => {
    await enqueueMetaLeads([{ leadgen_id: "456" }]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("enqueue_meta_lead_jobs", { p_page_id: "123", p_studio_id: studioId, p_events: [{ leadgen_id: "456" }], p_retry_failed: false });
    await enqueueMetaLeads([{ leadgen_id: "456" }], true);
    expect(mocks.rpc.mock.calls[1][1].p_retry_failed).toBe(true);
  });
  it("claims only its configured tenant and persists original answers before atomic completion", async () => {
    expect(await processMetaLeadQueue()).toMatchObject({ claimed: 1, completed: 1, failed: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_meta_lead_jobs", { p_page_id: "123", p_studio_id: studioId, p_limit: 5 });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ id: "456" }), submitted_at: "2026-10-30T23:30:00.000Z" }));
    expect(mocks.rpc).toHaveBeenCalledWith("complete_meta_lead_job", expect.objectContaining({ p_page_id: "123", p_studio_id: studioId, p_lease_token: job.lease_token, p_lead: expect.objectContaining({ client_name: "Real Name" }) }));
  });
  it("retains incomplete answers and marks missing required data as failed without fabricating a CRM lead", async () => {
    mocks.fetchLead.mockResolvedValue({ id: "456", form_id: "789", field_data: [{ name: "email", values: ["real@example.test"] }] });
    expect(await processMetaLeadQueue()).toMatchObject({ failed: 1, completed: 0 });
    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("fail_meta_lead_job", expect.objectContaining({ p_retry: false, p_error: "missing_or_invalid_created_time" }));
    expect(mocks.rpc.mock.calls.map(call => call[0])).not.toContain("complete_meta_lead_job");
  });
  it("retries transient failures without storing provider errors or overwriting a lost lease", async () => {
    mocks.fetchLead.mockRejectedValueOnce(new Error("secret provider response"));
    expect(await processMetaLeadQueue()).toMatchObject({ retried: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("fail_meta_lead_job", expect.objectContaining({ p_retry: true, p_error: "meta_processing_failed" }));
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await processMetaLeadQueue()).toMatchObject({ stale: 1, completed: 0 });
    expect(mocks.rpc.mock.calls.map(call => call[0])).not.toContain("complete_meta_lead_job");
  });
  it("does not claim jobs when Graph credentials or the studio mapping are missing", async () => {
    vi.stubEnv("META_PAGE_ACCESS_TOKEN", "");
    await expect(processMetaLeadQueue()).rejects.toThrow("meta_graph_not_configured");
    expect(mocks.rpc).not.toHaveBeenCalled();
    vi.stubEnv("META_CRM_STUDIO_ID", "bad");
    await expect(enqueueMetaLeads([{ leadgen_id: "456" }])).rejects.toThrow("meta_target_not_configured");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
