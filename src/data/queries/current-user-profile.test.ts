import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("server-only", () => ({}));

async function loadProfileQuery() {
  vi.resetModules();
  return import("./index");
}

describe("getCurrentUserProfile", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: mocks.from,
    });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  });

  it("treats a stale or deleted Auth user as unauthenticated", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    const { getCurrentUserProfile } = await loadProfileQuery();

    await expect(getCurrentUserProfile()).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns the profile for a current Auth user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "current-user" } }, error: null });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: "current-user",
        full_name: "Current User",
        email: "current@example.com",
        avatar_url: null,
        country_code: null,
        city: null,
        city_geonames_id: null,
        job_title: "Designer",
        system_role: "admin",
        is_active: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    });
    const { getCurrentUserProfile } = await loadProfileQuery();

    await expect(getCurrentUserProfile()).resolves.toMatchObject({ id: "current-user", system_role: "admin" });
  });

  it("lets the authenticated layout recover when a stale session has no profile row", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "current-user" } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { getCurrentUserProfile } = await loadProfileQuery();

    await expect(getCurrentUserProfile()).resolves.toBeNull();
  });

  it("distinguishes a profile query failure from a missing row", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "current-user" } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "42501" } });
    const { getCurrentUserProfile } = await loadProfileQuery();

    await expect(getCurrentUserProfile()).rejects.toThrow("Unable to load the authenticated user's profile");
  });
});
