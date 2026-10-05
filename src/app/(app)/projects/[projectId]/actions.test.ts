import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), project: vi.fn(), client: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => {
  const [group, field] = key.split(".");
  const values = group === "validation" ? en.ProjectForm.validation : en.ProjectForm.errors;
  return Object.entries(values).find(([name]) => name === field)?.[1] ?? key;
} }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/data/queries/project-by-id", () => ({ getProjectById: mocks.project }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));

import { updateProjectActualStartDate, updateProjectCompletionDate } from "./actions";

describe("project actual date corrections", () => {
  const update = vi.fn();
  const eq = vi.fn();
  const select = vi.fn();
  const query = { update, eq, select, is: vi.fn(), maybeSingle: vi.fn() };
  function input(field: string, value: string) {
    const data = new FormData();
    data.set(field, value);
    return data;
  }
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue({ studio_id: "studio" });
    mocks.project.mockResolvedValue({ id: "project", studio_id: "studio", status: "completed", started_at: null, completed_at: "2025-03-12", archived_at: null });
    for (const method of [update, eq, select, query.is]) method.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: { id: "project", started_at: "2020-01-01" }, error: null });
    mocks.client.mockResolvedValue({ from: () => query });
  });

  it("lets an admin backfill a completed legacy project and refreshes Statistics", async () => {
    await expect(updateProjectActualStartDate("project", {}, input("started_at", "2020-01-01"))).resolves.toEqual({ projectId: "project", startedAt: "2020-01-01" });
    expect(update).toHaveBeenCalledWith({ started_at: "2020-01-01" });
    expect(eq).toHaveBeenCalledWith("studio_id", "studio");
    expect(mocks.revalidate).toHaveBeenCalledWith("/statistics");
  });

  it("denies non-admin corrections before looking up the project or creating a client", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await updateProjectActualStartDate("project", {}, input("started_at", "2020-01-01"))).toHaveProperty("formError");
    expect(mocks.project).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("denies another studio's project", async () => {
    mocks.admin.mockResolvedValue({ studio_id: "other-studio" });
    expect(await updateProjectActualStartDate("project", {}, input("started_at", "2020-01-01"))).toHaveProperty("formError");
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("rejects a start after completion and a completion before start", async () => {
    expect(await updateProjectActualStartDate("project", {}, input("started_at", "2025-03-13"))).toHaveProperty("fieldErrors.started_at", en.ProjectForm.validation.completionBeforeActualStart);
    mocks.project.mockResolvedValue({ id: "project", studio_id: "studio", status: "completed", started_at: "2025-03-01", completed_at: "2025-03-12", archived_at: null });
    expect(await updateProjectCompletionDate("project", {}, input("completed_at", "2025-02-28"))).toHaveProperty("fieldErrors.completed_at", en.ProjectForm.validation.completionBeforeActualStart);
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("can clear an unreliable actual start without estimating another date", async () => {
    mocks.project.mockResolvedValue({ id: "project", studio_id: "studio", started_at: "2025-03-01", completed_at: "2025-03-12" });
    query.maybeSingle.mockResolvedValue({ data: { id: "project", started_at: null }, error: null });
    await expect(updateProjectActualStartDate("project", {}, input("started_at", ""))).resolves.toEqual({ projectId: "project", startedAt: null });
    expect(update).toHaveBeenCalledWith({ started_at: null });
  });
});
