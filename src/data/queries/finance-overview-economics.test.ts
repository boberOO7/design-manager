import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { getFinanceOverviewProjectEconomics } from "./finance-overview-economics";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), management: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("./finance-management", () => ({ getFinanceManagement: mocks.management }));

describe("Overview project economics read boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ studio_id: "active-studio" }); });
  it("stops before reading financial data when the user is not a studio admin", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await getFinanceOverviewProjectEconomics()).toBeNull();
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.management).not.toHaveBeenCalled();
  });
  it("reuses canonical profitability without triggering labor maintenance and reads tenant-scoped project area", async () => {
    const urls: URL[] = [];
    mocks.management.mockResolvedValue({ projectProfitability: [], currency: { code: "USD", minor_units: 2 }, today: "2026-10-17", labor: { automation: null } });
    mocks.client.mockResolvedValue(createClient<Database>("http://127.0.0.1:54321", "test", { auth: { persistSession: false }, global: { fetch: async input => {
      urls.push(new URL(String(input)));
      return Response.json([{ id: "82000000-0000-4000-8000-000000000001", status: "completed", total_area_m2: "100.00" }]);
    } } }));
    const result = await getFinanceOverviewProjectEconomics();
    expect(mocks.management).toHaveBeenCalledWith({}, { refreshAutomaticLabor: false });
    expect(urls[0].pathname).toBe("/rest/v1/projects");
    expect(urls[0].searchParams.get("studio_id")).toBe("eq.active-studio");
    expect(urls[0].searchParams.get("select")).toContain("total_area_m2::text");
    expect(result).toMatchObject({ averageContract: null, averageMargin: null, projects: [] });
  });
});
