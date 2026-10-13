import { beforeEach, describe, expect, it, vi } from "vitest";
import AppLayout from "./layout";
import { PROJECTS_PREFETCH_HEADER } from "@/lib/projects-prefetch-request";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), timer: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/data/queries", () => ({ getCurrentUserProfile: async () => ({ id: "user" }) }));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: async () => ({ status: "ACTIVE_STUDIO", membership: { authenticatedUserId: "user", studio_id: "studio", system_role: "admin" } }) }));
vi.mock("@/data/queries/crm", () => ({ getCrmOverdueLeadFollowUpCount: async () => 0 }));
vi.mock("@/data/queries/review-timers", () => ({ getReviewTimerSnapshot: mocks.timer }));
vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
vi.mock("@/components/layout/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/layout/push-lifecycle", () => ({ PushLifecycle: () => null }));
vi.mock("@/i18n/domain-messages", () => ({ DomainMessages: () => null }));
vi.mock("@/hooks/use-review-timer", () => ({ ReviewTimerProvider: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers());
  mocks.timer.mockResolvedValue(null);
});

describe("Projects prefetch shared-layout side effects", () => {
  it("does not invoke timer synchronization or its labor scheduling path during Projects speculation", async () => {
    mocks.headers.mockResolvedValue(new Headers({ [PROJECTS_PREFETCH_HEADER]: "1" }));
    await AppLayout({ children: null });
    expect(mocks.timer).not.toHaveBeenCalled();
  });
  it("preserves timer synchronization for real visits and other routes", async () => {
    await AppLayout({ children: null });
    expect(mocks.timer).toHaveBeenCalledOnce();
  });
});
