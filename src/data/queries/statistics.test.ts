import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), attributions: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/data/queries/productivity-attributions", () => ({ getCanonicalProductivityAttributions: mocks.attributions }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));

import { getStatistics } from "@/data/queries/statistics";

describe("Statistics query access boundary", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns before creating a data client or fetching analytics when the active membership is not admin", async () => {
    mocks.admin.mockResolvedValue(null);

    await expect(getStatistics("12", "2025-04-01")).resolves.toBeNull();

    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.attributions).not.toHaveBeenCalled();
  });
});
