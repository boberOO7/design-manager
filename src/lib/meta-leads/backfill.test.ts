import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock("@/lib/supabase/admin-client", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ data: [{ form_id: "10" }, { form_id: "20" }], error: null }) }) }) }) }) }) }));
vi.mock("./queue", () => ({ enqueueMetaLeads: mocks.enqueue }));
import { backfillMetaLeads } from "./backfill";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("walks paginated forms and leads, resuming repeatable history through the common inbox", async () => {
  vi.stubEnv("META_PAGE_ID", "123"); vi.stubEnv("META_CRM_STUDIO_ID", "51000000-0000-4000-8000-000000000001");
  vi.stubEnv("META_GRAPH_API_VERSION", "v25.0"); vi.stubEnv("META_PAGE_ACCESS_TOKEN", "token"); vi.stubEnv("META_APP_SECRET", "secret");
  const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
  const queued = new Set<string>();
  mocks.enqueue.mockImplementation(async (events: Array<{ leadgen_id: string }>) => {
    const id = events[0].leadgen_id, inserted = queued.has(id) ? 0 : 1; queued.add(id); return inserted;
  });
  fetcher.mockImplementation(async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/123/leadgen_forms")) return Response.json(url.searchParams.has("after")
      ? { data: [{ id: "20" }, { id: "30" }] }
      : { data: [{ id: "10" }], paging: { next: "next", cursors: { after: "forms-next" } } });
    if (url.pathname.endsWith("/10/leads")) return Response.json(url.searchParams.has("after")
      ? { data: [{ id: "102" }] }
      : { data: [{ id: "101" }], paging: { next: "next", cursors: { after: "leads-next" } } });
    if (url.pathname.endsWith("/20/leads")) return Response.json({ data: [{ id: "201" }] });
    throw new Error("unexpected Graph call");
  });
  expect(await backfillMetaLeads()).toEqual({ forms: 2, scanned: 3, enqueued: 3 });
  expect(await backfillMetaLeads(true)).toEqual({ forms: 2, scanned: 3, enqueued: 0 });
  expect(mocks.enqueue).toHaveBeenCalledWith([{ leadgen_id: "102", form_id: "10" }], false, true);
  expect(mocks.enqueue).toHaveBeenLastCalledWith([{ leadgen_id: "201", form_id: "20" }], true, true);
});
