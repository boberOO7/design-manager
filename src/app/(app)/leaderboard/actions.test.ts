import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveProductivityStageShares } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ studio_id: "verified" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ error: null });
});

it("saves only in the verified administrator's studio and refreshes affected reports", async () => {
  expect(await saveProductivityStageShares(30)).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_productivity_stage_shares", { p_studio_id: "verified", p_stage_1_percent: 30 });
  expect(mocks.revalidate).toHaveBeenCalledWith("/leaderboard");
  expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard");
  expect(mocks.revalidate).toHaveBeenCalledWith("/statistics");
  expect(mocks.revalidate).toHaveBeenCalledWith("/team/[userId]", "page");
});

it("rejects invalid percentages and non-administrators before creating a client", async () => {
  for (const value of [-1, 101, NaN, Infinity]) expect(await saveProductivityStageShares(value)).toBe(false);
  mocks.admin.mockResolvedValue(null);
  expect(await saveProductivityStageShares(30)).toBe(false);
  expect(mocks.client).not.toHaveBeenCalled();
});

it("preserves the draft and reports failure when the atomic save fails", async () => {
  mocks.rpc.mockResolvedValue({ error: { code: "55P03" } });
  expect(await saveProductivityStageShares(30)).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
