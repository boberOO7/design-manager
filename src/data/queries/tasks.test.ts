import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import type { MyTask } from "@/types/tasks";
import { getMyTasks } from "./tasks";

const mocks = vi.hoisted(() => ({ client: vi.fn(), profile: vi.fn(), refresh: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/data/queries", () => ({ getCurrentUserProfile: mocks.profile }));
vi.mock("@/data/mutations/refresh-task-schedules", () => ({ refreshProjectTaskSchedules: mocks.refresh }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

const tasks: MyTask[] = Array.from({ length: 160 }, (_, index) => ({
  id: `00000000-0000-0000-0000-${String(index).padStart(12,"0")}`,project_id: "project",stage: "stage_1",title: `Task ${index}`,
  status: "completed",priority: "normal",assignee_id: "worker",description: null,created_by: "admin",created_at: "2026-09-01T10:00:00Z",
  due_date: null,completed_at: "2026-09-18",completed_area_m2: null,manual_progress_override: false,production_completion: 100,progress_weight: 1,
  checklist_template_id: null,checklist_items: [],collaborators: [],assignee: null,creator: null,schedule: null,
  project: { id: "project",name: "Project",status: "active",archived_at: null },
  corrections: index === 159 ? [{ id: "correction",task_id: `00000000-0000-0000-0000-${String(index).padStart(12,"0")}`,
    description: "Fix dimensions",assignee_id: "worker",created_by: "admin",created_at: "2026-11-02T10:00:00Z",updated_at: "2026-11-02T10:00:00Z",
    status: "in_progress",due_date: "2026-11-04",closed_at: null,reviewer_ids: ["admin"],assignee: null,creator: null,events: [] }] : [],
}));
const requests: URL[] = [];
let failSecondBatch = false;

beforeEach(() => {
  vi.clearAllMocks(); requests.length = 0; failSecondBatch = false;
  mocks.profile.mockResolvedValue({ id: "worker",is_active: true });
  const client = createClient<Database>("http://localhost:54321","test-key", {
    auth: { persistSession: false,autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      requests.push(url);
      if (url.href.length > 8192) return new Response("URI too long",{ status: 414 });
      const table = url.pathname.split("/").at(-1);
      const ids = url.searchParams.get("id")?.slice(4,-1).split(",") ?? [];
      const detail = table === "tasks" && url.searchParams.get("select") !== "project_id";
      if (failSecondBatch && detail && ids.includes(tasks[100].id)) return new Response(JSON.stringify({ message: "Batch unavailable" }),{ status: 400 });
      const rows = table === "get_personal_task_ids" ? tasks.map(task => ({ task_id: task.id }))
        : table === "tasks" ? tasks.filter(task => ids.includes(task.id))
        : table === "project_task_stage_columns" ? [{ project_id: "project",stage: "stage_1",kind: "work",display_name: null,direction_id: "direction",direction: { name: null,kind: "interior",status: "active" } }] : [];
      return new Response(JSON.stringify(rows),{ headers: { "Content-Type": "application/json" } });
    } },
  });
  mocks.client.mockResolvedValue(client);
});

describe("personal tasks request size", () => {
  it("loads 160 tasks including corrections without exceeding the API URL limit", async () => {
    const result = await getMyTasks();
    expect(result).toHaveLength(tasks.length);
    expect(new Set(result.map(task => task.id)).size).toBe(tasks.length);
    expect(result.find(task => task.id === tasks[159].id)?.corrections).toEqual(tasks[159].corrections);
    expect(requests.every(url => url.href.length <= 8192)).toBe(true);
    expect(requests.filter(url => url.pathname.endsWith("/tasks") && url.searchParams.get("select") !== "project_id")).toHaveLength(2);
  });
  it("reports an unavailable batch instead of returning an incomplete task list", async () => {
    failSecondBatch = true;
    await expect(getMyTasks()).rejects.toThrow("Unable to load tasks assigned to the current user.");
  });
});
