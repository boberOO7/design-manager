import { beforeEach, describe, expect, it, vi } from "vitest";
import { createContractor, setContractorRecommendation, updateContractor } from "./actions";

const mocks = vi.hoisted(() => ({
  membership: vi.fn(), admin: vi.fn(), client: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/data/queries/active-studio-membership", () => ({ getActiveStudioMembership: mocks.membership }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));

const id = "71000000-0000-4000-8000-000000000001";
const query = {
  update: vi.fn(() => query), insert: vi.fn(() => query), eq: vi.fn(() => query), select: vi.fn(() => query),
  maybeSingle: vi.fn(), single: vi.fn(),
};
const client = { from: vi.fn(() => query), rpc: vi.fn() };
function form(status?: string) {
  const data = new FormData();
  data.set("name", "Contact"); data.set("category", "Category");
  if (status) data.set("cooperation_status", status);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership.mockResolvedValue({ authenticatedUserId: id, system_role: "employee" });
  mocks.admin.mockResolvedValue(null);
  mocks.client.mockResolvedValue(client);
  query.maybeSingle.mockResolvedValue({ data: { id }, error: null });
  query.single.mockResolvedValue({ data: { id }, error: null });
  client.rpc.mockResolvedValue({ data: id, error: null });
});

describe("contractor cooperation actions", () => {
  it("rejects recommendation writes before accessing data for non-admins", async () => {
    expect(await setContractorRecommendation(id, true)).toEqual({ error: "errors.cooperationPermission" });
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("writes an explicit recommendation only for a verified contractor", async () => {
    mocks.admin.mockResolvedValue({ studio_id: id });
    for (const value of [true, false]) expect(await setContractorRecommendation(id, value)).toEqual({});
    expect(query.update).toHaveBeenNthCalledWith(1, { is_recommended: true });
    expect(query.update).toHaveBeenNthCalledWith(2, { is_recommended: false });
    expect(query.eq).toHaveBeenCalledWith("id", id);
    expect(query.eq).toHaveBeenCalledWith("cooperation_status", "verified");
    expect(mocks.revalidate).toHaveBeenCalledWith("/contractors");
  });

  it("reports missing/inaccessible/prospective records and database failures", async () => {
    mocks.admin.mockResolvedValue({ studio_id: id });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await setContractorRecommendation(id, true)).toEqual({ error: "errors.recommendationFailed" });
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "failed" } });
    expect(await setContractorRecommendation(id, true)).toEqual({ error: "errors.recommendationFailed" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("rejects invalid recommendation input", async () => {
    mocks.admin.mockResolvedValue({ studio_id: id });
    expect(await setContractorRecommendation("invalid", true)).toEqual({ error: "errors.recommendationFailed" });
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("rejects forged status in create and edit forms for employees", async () => {
    for (const status of ["verified", "prospective"]) {
      expect(await createContractor({}, form(status))).toEqual({ formError: "errors.cooperationPermission" });
      expect(await updateContractor(id, {}, form(status))).toEqual({ formError: "errors.cooperationPermission" });
    }
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("preserves member editing without writing cooperation fields", async () => {
    expect(await updateContractor(id, {}, form())).toEqual({ contractorId: id });
    expect(query.update).toHaveBeenCalledWith({ name: "Contact", website_url: null, phone: null, description: null, category_id: id, subcategory_id: null });
  });

  it("lets admins create prospective contacts and change their status", async () => {
    mocks.membership.mockResolvedValue({ authenticatedUserId: id, system_role: "admin" });
    expect(await createContractor({}, form("prospective"))).toEqual({ contractorId: id });
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ cooperation_status: "prospective" }));
    expect(await updateContractor(id, {}, form("verified"))).toEqual({ contractorId: id });
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ cooperation_status: "verified" }));
  });
});
