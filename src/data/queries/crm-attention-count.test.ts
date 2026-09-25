import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getActiveStudioAdmin: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  not: vi.fn(),
  neq: vi.fn(),
  lt: vi.fn(),
  in: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.getActiveStudioAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

async function loadQuery() {
  vi.resetModules();
  return import("./crm");
}

describe("CRM overdue lead follow-up count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const builder = {
      select: mocks.select,
      eq: mocks.eq,
      not: mocks.not,
      neq: mocks.neq,
      lt: mocks.lt,
      in: mocks.in,
    };
    mocks.getActiveStudioAdmin.mockResolvedValue({ authenticatedUserId: "admin-1", studio_id: "studio-1", system_role: "admin" });
    mocks.createClient.mockResolvedValue({ from: mocks.from });
    mocks.from.mockReturnValue(builder);
    mocks.select.mockReturnValue(builder);
    mocks.eq.mockReturnValue(builder);
    mocks.not.mockReturnValue(builder);
    mocks.neq.mockReturnValue(builder);
    mocks.lt.mockResolvedValue({ count: 3, error: null });
    mocks.in.mockResolvedValue({ count: 4, error: null });
  });

  it("counts only past active follow-ups assigned to the authenticated administrator", async () => {
    const { getCrmOverdueLeadFollowUpCount } = await loadQuery();

    await expect(getCrmOverdueLeadFollowUpCount(new Date("2026-09-15T12:00:00.000Z"))).resolves.toBe(3);
    expect(mocks.from).toHaveBeenCalledWith("crm_leads");
    expect(mocks.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "studio_id", "studio-1");
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "responsible_admin_id", "admin-1");
    expect(mocks.not).toHaveBeenCalledWith("next_contact_at", "is", null);
    expect(mocks.neq).toHaveBeenCalledWith("status", "invalid");
    expect(mocks.lt).toHaveBeenCalledWith("next_contact_at", "2026-09-15T12:00:00.000Z");
  });

  it("counts active lead pipeline statuses across the studio", async () => {
    const { getActiveCrmLeadCount } = await loadQuery();
    await expect(getActiveCrmLeadCount()).resolves.toBe(4);
    expect(mocks.eq).toHaveBeenCalledWith("studio_id", "studio-1");
    expect(mocks.in).toHaveBeenCalledWith("status", ["new", "contacted", "discussion", "proposal"]);
  });

  it("does not query CRM without active administrator access", async () => {
    mocks.getActiveStudioAdmin.mockResolvedValue(null);
    const { getCrmOverdueLeadFollowUpCount } = await loadQuery();

    await expect(getCrmOverdueLeadFollowUpCount()).resolves.toBe(0);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("uses the same inactive follow-up definition in Calendar", async () => {
    const source = await readFile(new URL("./calendar.ts", import.meta.url), "utf8");
    expect(source).toContain("CRM_INACTIVE_FOLLOW_UP_LEAD_STATUS");
    expect(source).toContain('.neq("status", CRM_INACTIVE_FOLLOW_UP_LEAD_STATUS)');
  });
});
