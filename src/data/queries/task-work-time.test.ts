import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.access }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { getTaskWorkTime } from "./task-work-time";

describe("task time access", () => {
  afterEach(() => vi.clearAllMocks());
  it("does not load time without verified active membership", async () => {
    mocks.access.mockResolvedValue({ status: "UNAUTHENTICATED" });
    expect(await getTaskWorkTime("task")).toBeNull();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("checks task visibility before reading independently visible historical time", async () => {
    mocks.access.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { studio_id: "studio", system_role: "employee" } });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    const from = vi.fn(() => query);
    mocks.client.mockResolvedValue({ from });
    expect(await getTaskWorkTime("hidden")).toBeNull();
    expect(from).toHaveBeenCalledExactlyOnceWith("tasks");
    expect(query.eq).toHaveBeenCalledWith("project.studio_id", "studio");
  });
  it.each(["employee", "admin"])("uses caller RLS and labels the visible scope for %s", async role => {
    mocks.access.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { studio_id: "studio", system_role: role } });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "task" }, error: null }), range: vi.fn().mockResolvedValue({ data: [
        { id: "log", task_id: "task", user_id: "worker", work_date: "2026-10-02", activity_kind: "task", minutes: 45,
          review_round_id: null, person: { full_name: "Worker", avatar_url: "avatar" } },
      ], error: null }) };
    mocks.client.mockResolvedValue({ from: vi.fn(() => query) });
    expect(await getTaskWorkTime("task")).toMatchObject({ ownTimeOnly: role !== "admin", totalMinutes: 45,
      employees: [{ id: "worker", name: "Worker", avatarUrl: "avatar", days: [{ date: "2026-10-02", totalMinutes: 45 }] }] });
    expect(query.eq).toHaveBeenCalledWith("studio_id", "studio");
    expect(query.eq).toHaveBeenCalledWith("task_id", "task");
    expect(query.lte).toHaveBeenCalledWith("work_date", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });
});
