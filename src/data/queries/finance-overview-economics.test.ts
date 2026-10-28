import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { getFinanceOverviewProjectEconomics } from "./finance-overview-economics";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), management: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("./finance-management", () => ({ getFinanceManagement: mocks.management }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFxDates: vi.fn() }));

describe("Overview project economics read boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ studio_id: "active-studio" }); });
  it("stops before reading financial data when the user is not a studio admin", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await getFinanceOverviewProjectEconomics()).toBeNull();
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.management).not.toHaveBeenCalled();
  });
  it("loads project metadata while the management report is still pending", async () => {
    let finishReport = () => {};
    const pendingReport = new Promise<null>(resolve => { finishReport = () => resolve(null); });
    mocks.management.mockReturnValueOnce(pendingReport);
    const fetcher = vi.fn(async () => Response.json([]));
    mocks.client.mockResolvedValue(createClient<Database>("http://127.0.0.1:54321", "test", {
      auth: { persistSession: false }, global: { fetch: fetcher },
    }));
    const pending = getFinanceOverviewProjectEconomics();
    try {
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    } finally {
      finishReport();
    }
    expect(await pending).toBeNull();
  });
  it("reuses canonical profitability without triggering labor maintenance and reads tenant-scoped project area", async () => {
    const urls: URL[] = [];
    mocks.management.mockResolvedValue({ projectProfitability: [], currency: { code: "USD", minor_units: 2 }, today: "2026-10-17", labor: { automation: null }, projectRows: [], history: [], provisional: [], provisionalLabor: [], coverage: [] });
    mocks.client.mockResolvedValue(createClient<Database>("http://127.0.0.1:54321", "test", { auth: { persistSession: false }, global: { fetch: async input => {
      urls.push(new URL(String(input)));
      if (urls.at(-1)?.pathname.endsWith("/finance_trip_entry_values")) return Response.json([]);
      return Response.json([{ id: "82000000-0000-4000-8000-000000000001", status: "completed", total_area_m2: "100.00" }]);
    } } }));
    const result = await getFinanceOverviewProjectEconomics();
    expect(mocks.management).toHaveBeenCalledWith({});
    expect(urls.map(url => url.pathname)).toEqual(["/rest/v1/projects"]);
    expect(urls.every(url => url.searchParams.get("studio_id") === "eq.active-studio")).toBe(true);
    expect(urls[0].searchParams.get("studio_id")).toBe("eq.active-studio");
    expect(urls[0].searchParams.get("select")).toContain("total_area_m2::text");
    expect(result).toMatchObject({ averageContract: null, averageMargin: null, projects: [] });
  });
});
