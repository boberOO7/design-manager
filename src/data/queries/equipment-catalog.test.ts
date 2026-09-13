import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), client: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.resolve }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { GET } from "@/app/api/equipment/catalog/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { system_role: "admin" } });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: [{ value: "14700KF" }], error: null });
});
it("passes bounded normalized context through the caller's local RPC", async () => {
  const result = await GET(new Request("http://localhost/api/equipment/catalog?type=cpu&manufacturer=Intel&family=Core+i7&query=147"));
  expect(await result.json()).toEqual({ suggestions: ["14700KF"] });
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.rpc).toHaveBeenCalledWith("search_equipment_catalog", { p_type: "cpu", p_query: "147", p_manufacturer: "Intel", p_family: "Core i7", p_field: "model" });
});
it("denies unauthenticated, employee, and ambiguous membership before querying", async () => {
  for (const actor of [{ status: "UNAUTHENTICATED" }, { status: "MULTIPLE_ACTIVE_STUDIOS" }, { status: "ACTIVE_STUDIO", membership: { system_role: "employee" } }]) {
    mocks.resolve.mockResolvedValue(actor);
    expect((await GET(new Request("http://localhost/api/equipment/catalog?type=monitor&query=U27"))).status).toBe(403);
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects invalid queries and avoids model queries below the threshold", async () => {
  expect((await GET(new Request("http://localhost/api/equipment/catalog?type=invalid"))).status).toBe(400);
  expect(await (await GET(new Request("http://localhost/api/equipment/catalog?type=monitor&query=U"))).json()).toEqual({ suggestions: [] });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("returns a recoverable unavailable response when the local catalog fails", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "offline" }, data: null });
  expect((await GET(new Request("http://localhost/api/equipment/catalog?type=monitor&query=U27"))).status).toBe(503);
});
