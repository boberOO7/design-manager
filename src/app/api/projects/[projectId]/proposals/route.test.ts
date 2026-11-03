import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createProposalSnapshot, proposalPresentation, proposalSnapshotSchema } from "@/lib/finance-proposal";
import { proposalDesignSample } from "@/components/finance/proposal/design-preview/sample";

const mocks = vi.hoisted(() => ({ client: vi.fn(), adminRpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: async () => ({ studio_id: "studio", authenticatedUserId: "admin" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.adminRpc }) }));
import { GET, POST } from "./route";

beforeEach(() => vi.clearAllMocks());
it.each(["coefficient", "unit", "legacy", "manual"].flatMap(state => [true, false].map(showPercentages => ({ state, showPercentages }))))("previews, generates and reopens $state calculation with percentages=$showPercentages", async ({ state, showPercentages }) => {
  const id = "00000000-0000-4000-8000-000000000099";
  const order = { id, name: "Благоустрій", status: "confirmed" };
  const { pricing: _pricing, ...sample } = proposalDesignSample;
  const source = proposalSnapshotSchema.parse({ ...sample, schemaVersion: 2, order, sourceRevision: 3,
    area: state === "unit" ? "800" : "120", clientRatePerM2: state === "manual" ? null : "40",
    areaCalculation: state === "coefficient" ? { actualArea: "800", coefficient: "0.15" }
      : state === "unit" ? { actualArea: "800", coefficient: "1.00" } : null,
    gross: state === "unit" ? "32000.00" : "4800.00", vatRate: null, vatAmount: "0",
    rows: [{ ...proposalDesignSample.rows[0], percentage: "100", gross: state === "unit" ? "32000.00" : "4800.00" }],
  });
  if (source.schemaVersion !== 2) throw new Error("Expected a project proposal");
  let saved: { id: string; snapshot: ReturnType<typeof createProposalSnapshot>; pdf: string } | null = null;
  const sourceRpc = vi.fn(async () => ({ data: source, error: null }));
  mocks.client.mockResolvedValue({ rpc: sourceRpc, from: (table: string) => {
    const query = { select: () => query, eq: () => query, neq: () => query,
      order: async () => ({ data: saved ? [{ id: saved.id, revision: 1, created_at: "2026-11-02T12:00:00Z", snapshot: saved.snapshot }] : [], error: null }),
      maybeSingle: async () => ({ data: table === "finance_project_orders" ? order : saved, error: null }),
    };
    return query;
  } });
  mocks.adminRpc.mockImplementation(async (_name: string, input: { p_source: unknown; p_presentation: unknown; p_pdf: string }) => {
    saved = { id, snapshot: createProposalSnapshot(input.p_source, input.p_presentation), pdf: `\\x${Buffer.from(input.p_pdf, "base64").toString("hex")}` };
    return { data: id, error: null };
  });
  const presentation = { ...proposalPresentation(source), showPercentages };
  const context = { params: Promise.resolve({ projectId: source.projectId }) };
  const url = `http://localhost/api/projects/${source.projectId}/proposals?orderId=${id}`;
  const request = (intent: string) => new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent, requestId: id, orderId: id, source, presentation }),
  });
  const preview = await POST(request("preview"), context);
  expect(preview.status).toBe(200);
  expect(preview.headers.get("Content-Type")).toBe("application/pdf");
  expect(mocks.adminRpc).not.toHaveBeenCalled();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(await preview.arrayBuffer()) });
  const pdf = await task.promise;
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").replace(/\/\s+/g, "/");
  expect(pdf.numPages).toBe(1);
  expect(text.includes("Частка")).toBe(showPercentages);
  expect(text.includes("Коефіцієнт трудомісткості: 0,15")).toBe(state === "coefficient");
  expect(text.includes("120 м² × 40 USD/м²")).toBe(state === "legacy");
  if (state === "unit") expect(text).toContain("800 м² × 40 USD/м²");
  await task.destroy();
  const generated = await POST(request("generate"), context);
  expect(generated.status).toBe(200);
  expect(await generated.json()).toEqual({ id });
  expect(mocks.adminRpc).toHaveBeenCalledWith("save_finance_project_proposal", expect.objectContaining({ p_source: source }));
  const stored = mocks.adminRpc.mock.calls[0][1];
  expect(createProposalSnapshot(stored.p_source, stored.p_presentation).showPercentages).toBe(showPercentages);
  const nextDraft = await GET(new NextRequest(`${url}&draft=1`), context);
  expect((await nextDraft.json()).history[0].showPercentages).toBe(showPercentages);
  const downloaded = await GET(new NextRequest(`${url}&id=${id}&download=1`), context);
  expect(downloaded.status).toBe(200);
  expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(Buffer.from(stored.p_pdf, "base64"));
  expect(source.gross).toBe(state === "unit" ? "32000.00" : "4800.00");
}, 15000);
