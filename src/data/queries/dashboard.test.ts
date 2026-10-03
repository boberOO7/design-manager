import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import type { DashboardTaskSummary } from "@/types/tasks";
import { isTaskInWorkloadCategory, WORKLOAD_CATEGORIES } from "@/lib/dashboard";
import { getDashboard } from "./dashboard";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/data/mutations/refresh-task-schedules", () => ({ refreshProjectTaskSchedules: vi.fn() }));
vi.mock("@/data/queries", () => ({ getCurrentUserProfile: async () => ({ id: "member", full_name: "Member", is_active: true }) }));
vi.mock("@/data/queries/active-studio-membership", () => ({
  getActiveStudioMembership: async () => ({ studio_id: "studio", authenticatedUserId: "member", system_role: "admin" }),
}));

function task(index: number, overrides: Partial<DashboardTaskSummary> = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    project_id: "project", stage: "stage_1", title: `Task ${index}`, status: "completed", priority: "normal",
    assignee_id: "member", due_date: null, completed_area_m2: null, productivity_area_m2: null,
    manual_progress_override: false, production_completion: 0, progress_weight: 1,
    created_at: "2026-09-01T00:00:00Z", checklist_items: [], deadlines: [],
    project: { id: "project", name: "0 IN SPACE", status: "active", archived_at: null },
    ...overrides,
    collaborators: (overrides.collaborators ?? []).map(({ id }) => ({ user_id: id, profile: { id } })),
  };
}

it("loads tasks and current status periods beyond the Data API cap before calculating every workload metric", async () => {
  const tasks = Array.from({ length: 1125 }, (_, index) => task(index));
  tasks[1] = task(1, { status: "todo" });
  tasks[1000] = task(1000, { status: "todo" });
  tasks[1001] = task(1001, { status: "in_progress" });
  tasks[1002] = task(1002, { status: "internal_review" });
  tasks[1003] = task(1003, { status: "review", priority: "urgent", deadlines: [{ id: "late", target_status: "completed", due_date: "2020-01-01" }] });
  tasks[1004] = task(1004, { status: "cancelled", priority: "urgent" });
  tasks[1005] = task(1005, { status: "completed", priority: "urgent" });
  tasks[1006] = task(1006, { status: "in_progress", assignee_id: "other", collaborators: [{ id: "member" }] });
  const tables: Record<string, unknown[]> = {
    projects: [{ id: "project", name: "0 IN SPACE", project_code: null, client_name: null, due_date: null, status: "active", total_area_m2: 100, include_in_productivity: false }],
    tasks,
    studio_members: [{ profile: { id: "member", full_name: "Member", job_title: "Designer", is_active: true } }],
    project_task_stage_columns: [], project_members: [],
    task_status_periods: tasks.map(({ id, status }) => ({ task_id: id, status, entered_at: id === tasks[1006].id ? "2026-09-03T00:00:00Z" : "2026-09-01T00:00:00Z" })),
  };
  const requests: Array<{ table: string; offset: number; limit: number; order: string | null; studio: string | null }> = [];
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const table = url.pathname.split("/").at(-1)!;
      const rows = tables[table];
      if (!rows) throw new Error(`Unexpected table ${table}`);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), 1000);
      requests.push({ table, offset, limit, order: url.searchParams.get("order"), studio: url.searchParams.get(table === "tasks" ? "project.studio_id" : "studio_id") });
      return Response.json(rows.slice(offset, offset + limit));
    } },
  });
  mocks.createClient.mockResolvedValue(client);

  const dashboard = await getDashboard();
  if (dashboard?.kind !== "admin") throw new Error("Expected admin Dashboard");
  const member = dashboard.workload[0];
  expect(member).toMatchObject({ openTaskCount: 6, todoCount: 2, inProgressCount: 2, reviewCount: 2, urgentCount: 1, overdueCount: 1, workloadAreaM2: 0, recentFocus: { id: tasks[1006].id, currentStatusEnteredAt: "2026-09-03T00:00:00Z" } });
  expect(new Set(member.tasks.map(({ id }) => id)).size).toBe(6);
  expect(member.tasks.filter(({ status }) => status === "todo").map(({ id }) => id).sort()).toEqual([tasks[1].id, tasks[1000].id]);
  const counts = { todo: member.todoCount, in_progress: member.inProgressCount, review: member.reviewCount, urgent: member.urgentCount, overdue: member.overdueCount };
  for (const category of WORKLOAD_CATEGORIES) {
    expect(member.tasks.filter((task) => isTaskInWorkloadCategory(task, category, dashboard.today))).toHaveLength(counts[category]);
  }
  for (const table of ["tasks", "task_status_periods"]) {
    const pages = requests.filter((request) => request.table === table);
    expect(pages.map(({ offset, limit }) => [offset, limit])).toEqual([[0, 500], [500, 500], [1000, 500]]);
    expect(pages.every(({ order, studio }) => order === (table === "tasks" ? "id.asc" : "task_id.asc") && studio === "eq.studio")).toBe(true);
  }
});
