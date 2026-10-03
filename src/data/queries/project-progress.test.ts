import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationDatabase } from "@/types/application-database";
import { calculateProjectSummary, type ProjectTaskForProgress } from "@/lib/project-progress";
import { getPresentedProjects } from "@/lib/project-list-presentation";
import { getAccessibleProjectsWithTasks, getProjectTasksForProgress } from "./project-progress";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), refresh: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/data/mutations/refresh-task-schedules", () => ({ refreshProjectTaskSchedules: mocks.refresh }));

const projects = ["305", "269", "empty"].map((id) => ({ id, name: id, status: "active", priority: "normal", due_date: null, archived_at: null, total_area_m2: 100, project_code: null, client_name: null, description: null }));
const tasks: Array<ProjectTaskForProgress & { project_id: string; deadlines: Array<{ id: string; target_status: string; due_date: string }> }> = Array.from({ length: 1200 }, (_, index) => ({
  id: String(index).padStart(5, "0"), project_id: projects[Math.floor(index / 600)].id,
  stage: `stage_${index % 4 + 1}`, status: ["todo", "in_progress", "internal_review", "review", "completed", "cancelled"][index % 6],
  priority: "normal", due_date: "2000-01-01", assignee_id: null, completed_area_m2: index % 7 + 1,
  progress_weight: index % 9 + 1, manual_progress_override: false, production_completion: index % 5 === 0 ? 70 : 37,
  checklist_items: index % 3 === 0 ? [{ id: `item-${index}`, is_completed: false, is_not_needed: true, weight: 2 }] : [],
  deadlines: [{ id: `deadline-${index}`, target_status: "completed", due_date: "2026-09-20" }],
}));

const taskRequests: URL[] = [];
let failedOffset: number | null;

beforeEach(() => {
  vi.clearAllMocks();
  taskRequests.length = 0;
  failedOffset = null;
  const client = createClient<ApplicationDatabase>("http://localhost:54321", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const table = url.pathname.split("/").at(-1);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Math.min(1000, Number(url.searchParams.get("limit") ?? 1000));
      if (table === "tasks") {
        taskRequests.push(url);
        if (failedOffset !== null && offset >= failedOffset) return new Response(JSON.stringify({ code: "test_error", message: "Page unavailable" }), { status: 400 });
      }
      const ids = url.searchParams.get("project_id")?.slice(4, -1).split(",") ?? projects.map((project) => project.id);
      const rows = table === "projects" ? projects
        : table === "tasks" ? tasks.filter((task) => ids.includes(task.project_id))
        : table === "project_members" ? projects.map((project) => ({ project_id: project.id, user_id: "member", profile: { id: "member", full_name: "Member", avatar_url: null } }))
        : table === "project_task_stage_columns" ? projects.flatMap((project) => ["stage_1", "stage_2", "stage_3", "stage_4"].map((stage) => ({ project_id: project.id, stage, progress_method: stage === "stage_2" ? "area" : stage === "stage_3" ? "weighted" : "equal" }))) : [];
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { headers: { "Content-Type": "application/json" } });
    } },
  });
  mocks.createClient.mockResolvedValue(client);
});

describe("complete project-summary reads", () => {
  it("loads a portfolio above the API cap in batches and matches individual detail summaries", async () => {
    const result = await getAccessibleProjectsWithTasks();
    expect(result.error).toBeNull();
    if (!result.projects) throw new Error("Portfolio query failed");
    expect(taskRequests.map((url) => Number(url.searchParams.get("offset")))).toEqual([0, 1000]);
    expect(taskRequests.every((url) => url.searchParams.get("order") === "id.asc")).toBe(true);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(result.projects.map((project) => project.tasks.length)).toEqual([600, 600, 0]);
    const presented = getPresentedProjects(result.projects, "2026-09-15");
    for (const project of result.projects) {
      const detail = await getProjectTasksForProgress(project.id);
      expect(detail).toEqual(project.tasks);
      expect(presented.find((item) => item.id === project.id)?.progress).toEqual(calculateProjectSummary(detail, "2026-09-15", project.stageProgressMethods).progress);
    }
    expect(presented[1].progress).toMatchObject({ eligibleTaskCount: 500, completedTaskCount: 100, openTaskCount: 400, overdueTaskCount: 0 });
  });

  it("discards partial summaries when a later task page fails", async () => {
    failedOffset = 1000;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await getAccessibleProjectsWithTasks()).toEqual({ projects: null, error: "query_failed" });
      failedOffset = 0;
      await expect(getProjectTasksForProgress("305")).rejects.toThrow("Unable to load project task progress.");
    } finally {
      log.mockRestore();
    }
  });
});
