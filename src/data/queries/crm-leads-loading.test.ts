import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCrmAdmins, getCrmLeads } from "./crm";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), from: vi.fn(), order: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));

describe("CRM Leads loading dependencies", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.membership.mockResolvedValue({ studio_id: "studio", authenticatedUserId: "admin" });
    mocks.from.mockImplementation((table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: (column: string, options?: { ascending: boolean }) => {
          mocks.order(column, options);
          return Promise.resolve({ error: null, data: table === "studio_members"
            ? [{ user_id: "admin", profile: { full_name: "Administrator", avatar_url: null } }]
            : [{ id: "lead", responsible_admin_id: "admin" }] });
        },
      };
      return builder;
    });
  });

  it("shares the page's administrator read with responsible labels without another request", async () => {
    const pendingAdmins = getCrmAdmins();
    const [result, admins] = await Promise.all([getCrmLeads(pendingAdmins), pendingAdmins]);
    expect(result.currentUserId).toBe("admin");
    expect(result.leads[0].responsibleAdmin).toEqual(admins[0]);
    expect(mocks.from.mock.calls.map(([table]) => table).sort()).toEqual(["crm_leads", "studio_members"]);
    expect(mocks.order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("keeps standalone callers and missing-membership behavior", async () => {
    expect((await getCrmLeads()).leads[0].responsibleAdmin?.name).toBe("Administrator");
    mocks.membership.mockResolvedValue(null);
    mocks.from.mockClear();
    expect(await getCrmLeads()).toEqual({ currentUserId: null, error: false, leads: [] });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
