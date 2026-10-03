import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), admin: vi.fn(), createClient: vi.fn(), attributions: vi.fn(), employment: vi.fn(), from: vi.fn(), select: vi.fn(), counts: vi.fn(), maybeSingle: vi.fn(), range: vi.fn(), insert: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-membership", () => ({ resolveActiveStudioMembership: mocks.resolve }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/data/queries/productivity-attributions", () => ({ getCanonicalProductivityAttributions: mocks.attributions }));
vi.mock("@/data/queries/employee-profile-employment", () => ({ getEmployeeProfileEmployment: mocks.employment }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getEmployeeProfile } from "./employee-profile";
import { getEmployeeProfileNotes } from "./employee-profile-notes";
import { addEmployeeProfileNote } from "@/app/(app)/team/[userId]/actions";

const targetId = "92000000-0000-4000-8000-000000000012";
const membership = { studio_id: "studio", system_role: "employee", authenticatedUserId: "viewer" };
const person = { is_active: true, joined_at: "2024-01-01", system_role: "employee", profile: { id: targetId, full_name: "Employee", job_title: "Architect" } };

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: mocks.select.mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), maybeSingle: mocks.maybeSingle, range: mocks.range, insert: mocks.insert, then: (resolve: (value: unknown) => unknown) => mocks.counts().then(resolve) };
  mocks.from.mockReturnValue(query);
  mocks.createClient.mockResolvedValue({ from: mocks.from });
  mocks.resolve.mockResolvedValue({ status: "ACTIVE_STUDIO", membership });
  mocks.admin.mockResolvedValue(null);
  mocks.maybeSingle.mockResolvedValue({ data: person, error: null });
  mocks.range.mockResolvedValue({ data: [], count: 0, error: null });
  mocks.attributions.mockResolvedValue([]);
  mocks.counts.mockResolvedValue({ data: [], count: 0, error: null });
  mocks.employment.mockResolvedValue({ asOf: "2026-10-03", absenceRequests: 0, makeupMinutes: 0, availableVacationDays: null, vacationPeriods: [] });
  mocks.insert.mockResolvedValue({ error: null });
});

describe("employee profile privacy boundary", () => {
  it("loads only RLS-scoped projects for a colleague, never performance, employment, or notes", async () => {
    const result = await getEmployeeProfile(targetId);
    expect(result).toMatchObject({ person, isOwn: false, isAdmin: false, work: null, activity: null, employment: null });
    expect(mocks.from.mock.calls).toEqual([["studio_members"], ["project_members"]]);
    expect(mocks.attributions).not.toHaveBeenCalled();
    expect(mocks.employment).not.toHaveBeenCalled();
  });

  it("loads safe self activity without fetching any m² accounting or history", async () => {
    mocks.resolve.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { ...membership, authenticatedUserId: targetId } });
    const result = await getEmployeeProfile(targetId);
    expect(result).toMatchObject({ work: null, activity: { completedTasks: 0, inProgressTasks: 0 }, employment: null });
    expect(mocks.attributions).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.select.mock.calls)).not.toMatch(/area_m2/);
    expect(JSON.stringify(result)).not.toMatch(/areaM2|history/);
    expect(mocks.employment).not.toHaveBeenCalled();
    expect(result?.activity?.heatmap.weeks).toHaveLength(52);
    const taskSelections = mocks.select.mock.calls.map(([selection]) => selection).filter((selection: string) => selection.includes("tasks_project_id_fkey"));
    expect(taskSelections.some((selection: string) => selection.includes("completed_at"))).toBe(true);
    expect(taskSelections.join(" ")).not.toContain("updated_at");
  });

  it("loads canonical accounting and employment for an admin viewing an employee", async () => {
    mocks.resolve.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { ...membership, authenticatedUserId: "admin", system_role: "admin" } });
    expect(await getEmployeeProfile(targetId)).toMatchObject({ work: { areaM2: 0, completedTasks: 0 } });
    expect(mocks.attributions).toHaveBeenCalledWith("studio", { contributorId: targetId });
    expect(mocks.employment).toHaveBeenCalledWith("92000000-0000-4000-8000-000000000012", expect.any(Date));
    expect(mocks.from.mock.calls.filter(([table]) => table !== "tasks")).toEqual([["studio_members"], ["project_members"], ["time_off_requests"], ["studio_days_off"]]);
  });

  it("counts assignee and collaborator tasks once and fails closed on unavailable counts", async () => {
    mocks.resolve.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { ...membership, authenticatedUserId: targetId } });
    for (const count of [4, 3, 2, 2, 2, 1]) mocks.counts.mockResolvedValueOnce({ count, error: null });
    expect(await getEmployeeProfile(targetId)).toMatchObject({ activity: { completedTasks: 5, inProgressTasks: 3 } });
    mocks.counts.mockResolvedValue({ count: null, error: { code: "unavailable" } });
    await expect(getEmployeeProfile(targetId)).rejects.toThrow("Unable to load profile activity");
  });

  it("derives milestones and counts from permitted history including past participation", async () => {
    const project = (id: string, assignedAt: string, completedAt: string | null, active = true) => ({ assigned_at: assignedAt, is_active: active, project: { id, name: id, status: completedAt ? "completed" : "active", completed_at: completedAt, archived_at: null, updated_at: assignedAt } });
    mocks.range.mockResolvedValue({ data: [project("past", "2024-01-01", "2024-06-01", false), project("recent", "2025-01-01", "2025-06-01"), project("current", "2026-01-01", null)], count: 3, error: null });
    const result = await getEmployeeProfile(targetId);
    expect(result).toMatchObject({ projectCount: 3, completedProjectCount: 2, activeProjectCount: 1, earliestParticipation: { id: "past" }, firstCompletedProject: { id: "past" } });
    expect(result?.projects.find(({ id }) => id === "past")?.isActive).toBe(false);
  });

  it("deduplicates project history after rejoining and retains earliest participation", async () => {
    const project = { id: "rejoined", name: "Rejoined project", status: "completed", completed_at: "2026-09-01", archived_at: null, updated_at: "2026-09-01" };
    mocks.range.mockResolvedValue({ data: [
      { assigned_at: "2026-01-01", is_active: true, project },
      { assigned_at: "2024-01-01", is_active: false, project },
      { assigned_at: "2025-01-01", is_active: false, project },
    ], count: 3, error: null });
    expect(await getEmployeeProfile(targetId)).toMatchObject({
      projectCount: 1, completedProjectCount: 1, activeProjectCount: 0,
      projects: [{ id: "rejoined", assignedAt: "2024-01-01", isActive: true }],
      earliestParticipation: { id: "rejoined", assignedAt: "2024-01-01" },
    });
  });

  it("selects current participation before recent history with stable date and ID ordering", async () => {
    const project = (id: string, status: string, updatedAt: string, completedAt: string | null = null, active = true, archivedAt: string | null = null) => ({
      assigned_at: "2024-01-01", is_active: active,
      project: { id, name: id, status, updated_at: updatedAt, completed_at: completedAt, archived_at: archivedAt },
    });
    const rows = [
      project("completed-old", "completed", "2026-10-03", "2025-01-01"),
      project("current-b", "active", "2024-01-01"),
      project("inactive", "active", "2026-09-01", null, false),
      project("paused", "paused", "2026-08-01"),
      project("current-a", "active", "2024-01-01"),
      project("completed-recent", "completed", "2025-02-01", "2026-09-10"),
      project("archived", "active", "2026-07-01", null, true, "2026-07-01"),
    ];
    mocks.range.mockResolvedValue({ data: rows, count: rows.length, error: null });
    const result = await getEmployeeProfile(targetId);
    expect(result?.projects.map(({ id }) => id)).toEqual(["current-a", "current-b", "completed-recent", "inactive", "paused", "archived"]);
    expect(result?.currentProjects.map(({ id }) => id)).toEqual(["current-a", "current-b"]);
    expect(result).toMatchObject({ projectCount: 7, activeProjectCount: 2, completedProjectCount: 2, firstCompletedProject: { id: "completed-old" } });
  });

  it("does not load work for unauthenticated, foreign, or former colleague profiles", async () => {
    mocks.resolve.mockResolvedValue({ status: "UNAUTHENTICATED" });
    expect(await getEmployeeProfile(targetId)).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.resolve.mockResolvedValue({ status: "ACTIVE_STUDIO", membership });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getEmployeeProfile(targetId)).toBeNull();
    mocks.maybeSingle.mockResolvedValue({ data: { ...person, is_active: false }, error: null });
    expect(await getEmployeeProfile(targetId)).toBeNull();
    expect(mocks.attributions).not.toHaveBeenCalled();
  });

  it("surfaces query failures instead of showing fabricated empty statistics", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "unavailable" } });
    await expect(getEmployeeProfile(targetId)).rejects.toThrow("Unable to load employee profile");
    mocks.resolve.mockResolvedValue({ status: "ACTIVE_STUDIO", membership: { ...membership, system_role: "admin" } });
    mocks.maybeSingle.mockResolvedValue({ data: person, error: null });
    mocks.attributions.mockRejectedValue(new Error("Accounting unavailable"));
    await expect(getEmployeeProfile(targetId)).rejects.toThrow("Accounting unavailable");
  });
});

describe("internal note server boundary", () => {
  const input = () => { const form = new FormData(); form.set("employeeId", targetId); form.set("reviewMonth", "2026-09"); form.set("note", "Private feedback"); return form; };

  it("rejects ordinary users before note queries or writes", async () => {
    await expect(getEmployeeProfileNotes(targetId)).rejects.toThrow("Studio administrator access required");
    expect(await addEmployeeProfileNote(input())).toEqual({ success: false });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("takes the studio and author from the verified boundary, independent of form fields", async () => {
    mocks.admin.mockResolvedValue({ ...membership, system_role: "admin" });
    const form = input(); form.set("studio_id", "foreign-studio"); form.set("author_id", "forged-author");
    expect(await addEmployeeProfileNote(form)).toEqual({ success: true });
    expect(mocks.insert).toHaveBeenCalledWith({ studio_id: "studio", employee_id: targetId, review_month: "2026-09-01", note: "Private feedback" });
  });

  it("rejects invalid periods and preserves a failed write as a failure", async () => {
    const form = input(); form.set("reviewMonth", "2026-99");
    expect(await addEmployeeProfileNote(form)).toEqual({ success: false });
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.admin.mockResolvedValue({ ...membership, system_role: "admin" });
    mocks.insert.mockResolvedValue({ error: { code: "42501" } });
    expect(await addEmployeeProfileNote(input())).toEqual({ success: false });
  });
});
