import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), attributions: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/data/queries/productivity-attributions", () => ({ getCanonicalProductivityAttributions: mocks.attributions }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));

import { getStatistics, readStatisticsPages } from "@/data/queries/statistics";

describe("Statistics query access boundary", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns before creating a data client or fetching analytics when the active membership is not admin", async () => {
    mocks.admin.mockResolvedValue(null);

    await expect(getStatistics("12", "2025-04-01")).resolves.toBeNull();

    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.attributions).not.toHaveBeenCalled();
  });

  it("fails closed when verified membership resolution fails", async () => {
    mocks.admin.mockRejectedValue(new Error("Authentication unavailable"));
    await expect(getStatistics("all")).rejects.toThrow("Authentication unavailable");
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("loads production Statistics without querying Finance sources", async () => {
    mocks.admin.mockResolvedValue({ studio_id: "studio" });
    mocks.attributions.mockResolvedValue([]);
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const from = vi.fn((_table: string) => query);
    mocks.client.mockResolvedValue({ from });
    const report = await getStatistics("all", "2026-10-04", "2026-10-04T12:00:00Z");
    expect(from.mock.calls.some(([table]) => table.startsWith("finance_"))).toBe(false);
    expect(report).not.toHaveProperty("payroll");
    expect(report?.from).toBe("2026-10-01");
  });

  it("loads all source rows beyond the API cap, including an exact multiple", async () => {
    const all = Array.from({ length: 2000 }, (_, id) => ({ id }));
    const page = vi.fn(async (offset: number) => ({ data: all.slice(offset, offset + 1000), error: null }));
    expect(await readStatisticsPages(page)).toEqual(all);
    expect(page.mock.calls.map(([offset]) => offset)).toEqual([0, 1000, 2000]);
  });

  it("does not return a plausible partial aggregate when a later page fails", async () => {
    await expect(readStatisticsPages(async offset => offset === 0
      ? { data: Array.from({ length: 1000 }, (_, id) => id), error: null }
      : { data: null, error: new Error("Failed page") })).rejects.toThrow("Unable to load Statistics");
  });
});
