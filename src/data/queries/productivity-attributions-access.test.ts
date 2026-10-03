import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.resolve }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { getCanonicalProductivityAttributions } from "./productivity-attributions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ from: vi.fn() });
});

describe("canonical productivity attribution access", () => {
  it("does not query credited area for employees or a different studio", async () => {
    mocks.resolve.mockResolvedValue({
      status: "ACTIVE_STUDIO",
      membership: { system_role: "employee", studio_id: "studio-a" },
    });
    expect(await getCanonicalProductivityAttributions("studio-a")).toEqual([]);
    expect(mocks.createClient).not.toHaveBeenCalled();

    mocks.resolve.mockResolvedValue({
      status: "ACTIVE_STUDIO",
      membership: { system_role: "admin", studio_id: "studio-a" },
    });
    expect(await getCanonicalProductivityAttributions("studio-b")).toEqual([]);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
