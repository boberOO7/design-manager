import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProjectsNavigationScope } from "./projects-navigation";

const mocks = vi.hoisted(() => ({ access: vi.fn(), rows: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.access }));
vi.mock("./project-progress", () => ({ getAccessibleProjectListRows: mocks.rows }));
const membership = { authenticatedUserId: "user", studio_id: "studio", system_role: "employee", joined_at: "2026-01-01" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ status: "ACTIVE_STUDIO", membership });
  mocks.rows.mockResolvedValue({ data: [{ id: "b" }, { id: "a" }], error: null });
});

describe("retained Projects authorization scope", () => {
  it("is stable across ordering and changes for user, studio, role, membership and RLS visibility", async () => {
    const original = await getProjectsNavigationScope();
    mocks.rows.mockResolvedValue({ data: [{ id: "a" }, { id: "b" }], error: null });
    expect(await getProjectsNavigationScope()).toBe(original);
    for (const change of [{ authenticatedUserId: "other" }, { studio_id: "other" }, { system_role: "admin" }, { joined_at: "2026-02-01" }]) {
      mocks.access.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { ...membership, ...change } });
      expect(await getProjectsNavigationScope()).not.toBe(original);
    }
    mocks.access.mockResolvedValue({ status: "ACTIVE_STUDIO", membership });
    mocks.rows.mockResolvedValue({ data: [{ id: "a" }], error: null });
    expect(await getProjectsNavigationScope()).not.toBe(original);
  });

  it("fails closed when session, membership or the RLS read cannot be verified", async () => {
    for (const status of ["UNAUTHENTICATED", "AUTH_ERROR", "NO_ACTIVE_STUDIO", "MULTIPLE_ACTIVE_STUDIOS"]) {
      mocks.access.mockResolvedValue({ status });
      expect(await getProjectsNavigationScope()).toBeNull();
    }
    expect(mocks.rows).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue({ status: "ACTIVE_STUDIO", membership });
    mocks.rows.mockResolvedValue({ data: null, error: new Error("Unavailable") });
    await expect(getProjectsNavigationScope()).rejects.toThrow("Unable to verify");
  });
});
