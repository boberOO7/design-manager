import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proposalLead, leadQuoteTerms, quoteContacts } from "@/lib/crm-proposal.test-fixtures";
import { proposalPresentation, proposalSnapshotSchema, type ProposalSnapshot } from "@/lib/finance-proposal";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), save: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.save }) }));
import { GET, POST } from "./route";

let lead = { ...proposalLead };
let saved: { id: string; lead_id: string; snapshot: ProposalSnapshot; request_id: string; pdf: string; revision: number; created_at: string }[] = [];
const requestId = "00000000-0000-4000-8000-000000000050";
const url = `http://localhost/api/crm/leads/${proposalLead.id}/proposals`;
const params = { params: Promise.resolve({ leadId: proposalLead.id }) };
const post = (body: unknown) => POST(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), params);

beforeEach(() => {
  vi.clearAllMocks(); lead = { ...proposalLead }; saved = [];
  mocks.admin.mockResolvedValue({ studio_id: lead.studio_id, authenticatedUserId: "actor" });
  mocks.client.mockResolvedValue({ from: (table: string) => {
    const filters = new Map<string, unknown>();
    const matches = () => saved.filter(item => (!filters.has("id") || item.id === filters.get("id"))
      && (!filters.has("lead_id") || item.lead_id === filters.get("lead_id"))
      && (!filters.has("request_id") || item.request_id === filters.get("request_id")));
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters.set(key, value); return query; },
      order: async () => ({ data: table === "finance_currencies" ? [{ code: "EUR", minor_units: 2 }] : matches().toReversed(), error: null }),
      single: async () => ({ data: { ...quoteContacts, business_address: quoteContacts.businessAddress, contact_person: "" }, error: null }),
      maybeSingle: async () => ({ data: table === "crm_leads"
        ? filters.get("studio_id") === lead.studio_id && filters.get("id") === lead.id ? lead : null
        : matches()[0] ?? null, error: null }),
    };
    return query;
  } });
  mocks.save.mockImplementation(async (_name: string, input: { p_snapshot: ProposalSnapshot; p_pdf: string; p_request_id: string }) => {
    const id = "00000000-0000-4000-8000-000000000060";
    saved.push({ id, lead_id: lead.id, snapshot: input.p_snapshot, request_id: input.p_request_id,
      pdf: `\\x${Buffer.from(input.p_pdf, "base64").toString("hex")}`, revision: input.p_snapshot.revision, created_at: new Date().toISOString() });
    return { data: id, error: null };
  });
});

it("creates, previews, saves and reopens a lead PDF with immutable revisions and idempotent retries", async () => {
  const initial = await GET(new NextRequest(url), params);
  expect(await initial.json()).toMatchObject({ source: null, history: [], leadContext: { terms: null, area: "100" } });
  const draft = await post({ intent: "draft", terms: leadQuoteTerms });
  expect(draft.status).toBe(200);
  const source = proposalSnapshotSchema.parse((await draft.json()).source);
  expect(source).toMatchObject({ schemaVersion: 3, projectId: null, leadId: lead.id, gross: "4320.00" });
  const presentation = { ...proposalPresentation(source), designVariant: "folded-plane", showPercentages: false };
  const payload = { intent: "generate", requestId, source, presentation };
  const preview = await post({ ...payload, intent: "preview" });
  expect(preview.status).toBe(200);
  expect(Buffer.from(await preview.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  expect(mocks.save).not.toHaveBeenCalled();
  const generated = await post(payload);
  expect(generated.status).toBe(200);
  const { id } = await generated.json();
  expect(saved).toHaveLength(1);
  expect((await post(payload)).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect((await post({ intent: "draft", terms: { ...leadQuoteTerms, number: "999" } })).status).toBe(400);
  const history = await GET(new NextRequest(url), params);
  expect(await history.json()).toMatchObject({ source: null, history: [{ id, revision: 1, designVariant: "folded-plane", showPercentages: false }] });
  const downloaded = await GET(new NextRequest(`${url}?id=${id}&download`), params);
  expect(downloaded.status).toBe(200);
  expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(Buffer.from(saved[0].pdf.slice(2), "hex"));
  const next = await GET(new NextRequest(`${url}?draft=1`), params);
  const nextSource = (await next.json()).source;
  expect(nextSource.revision).toBe(2);
  lead.updated_at = "2026-11-02T12:00:00+00:00";
  expect((await post({ ...payload, source: nextSource, intent: "preview" })).status).toBe(409);
  expect(saved).toHaveLength(1);
}, 15000);

it("rejects unverified actors, foreign leads and tampered quote money before rendering or saving", async () => {
  mocks.admin.mockResolvedValueOnce(null);
  expect((await GET(new NextRequest(url), params)).status).toBe(403);
  mocks.admin.mockResolvedValueOnce({ studio_id: "another-studio", authenticatedUserId: "actor" });
  expect((await GET(new NextRequest(url), params)).status).toBe(404);
  const draft = await post({ intent: "draft", terms: leadQuoteTerms });
  const source = proposalSnapshotSchema.parse((await draft.json()).source);
  const presentation = proposalPresentation(source);
  expect((await post({ intent: "generate", requestId, source: { ...source, gross: "1" }, presentation })).status).toBe(409);
  expect((await post({ intent: "generate", requestId, source: { ...source, leadId: requestId }, presentation })).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
});
