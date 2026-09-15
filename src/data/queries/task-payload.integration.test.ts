import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import type { MyTask } from "@/types/tasks";
import { normalizeTaskCollaborators, type TaskCollaboratorRelation } from "@/lib/task-collaborators";
import { getActiveTaskDeadline } from "@/lib/task-deadlines";
import { calculateProjectProgress, calculateStageProgress, getProjectHealth, type ProjectStageProgressMethods } from "@/lib/project-progress";
import { getEmployeeTasksNeedingAttention, isDashboardTaskProjectEligible, isOpenTask, sortEmployeeTasks } from "@/lib/dashboard";
import { getDashboard } from "./dashboard";
import { getProjectTasks } from "./tasks";
import { getProjectTasksForProgress } from "./project-progress";
import { loadDashboardTask } from "@/app/(app)/dashboard/task-actions";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
const studios = [randomUUID(), randomUUID()];
const projects = Array.from({ length: 6 }, () => randomUUID());
const accounts = ["admin", "employee", "outsider"].map((role) => ({ role, id: "", email: `task-payload-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
let service: SupabaseClient<Database>;
const clients: SupabaseClient<Database>[] = [];
const requests: Array<{ path: string; tasks: number; nested: number; bytes: number }> = [];
function id(value: string) { return `'${z.uuid().parse(value)}'`; }
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" });
}
async function measure<T>(label: string, run: () => Promise<T>) {
  requests.length = 0; const start = performance.now(); const result = await run();
  const snapshot = [...requests];
  if (process.env.TASK_PAYLOAD_MEASUREMENTS) appendFileSync(process.env.TASK_PAYLOAD_MEASUREMENTS, JSON.stringify({ label, elapsedMs: performance.now() - start, requests: snapshot }) + "\n");
  return { result, requests: snapshot };
}
// Original Dashboard task select retained as an independent before-query reference.
async function oldDashboardTasks(client: SupabaseClient<Database>) {
  const { data } = await client.from("tasks").select("id, project_id, stage, title, description, status, priority, assignee_id, due_date, completed_at, completed_area_m2, manual_progress_override, production_completion, progress_weight, created_at, created_by, deadlines:task_deadlines(id, target_status, due_date, created_at, updated_at), checklist_items:task_checklist_items(id, task_id, title, is_completed, weight, position, created_at, updated_at), assignee:profiles!tasks_assignee_id_fkey(id, full_name, job_title, avatar_url), collaborators:task_collaborators(user_id, profile:profiles!task_collaborators_user_id_fkey(id, full_name, job_title, avatar_url)), creator:profiles!tasks_created_by_fkey(id, full_name, job_title, avatar_url), project:projects!tasks_project_id_fkey!inner(id, name, studio_id, status, archived_at)")
    .eq("project.studio_id", studios[0]).is("project.archived_at", null).neq("project.status", "paused").neq("project.status", "archived")
    .overrideTypes<Array<Omit<MyTask, "collaborators"> & { collaborators: TaskCollaboratorRelation[] }>, { merge: false }>().throwOnError();
  return data.map((task) => ({ ...task, collaborators: normalizeTaskCollaborators(task.collaborators), due_date: getActiveTaskDeadline(task)?.due_date ?? null })).filter(isDashboardTaskProjectEligible);
}

describe.skipIf(!process.env.TASK_PAYLOAD_TEST_URL)("Task payload equivalence on local Supabase", () => {
  beforeAll(async () => {
    const settings = z.object({ TASK_PAYLOAD_TEST_URL: z.url(), TASK_PAYLOAD_TEST_KEY: z.string(), TASK_PAYLOAD_TEST_SERVICE_KEY: z.string() }).parse(process.env);
    if (!["127.0.0.1", "localhost"].includes(new URL(settings.TASK_PAYLOAD_TEST_URL).hostname)) throw new Error("Local fixtures only");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", settings.TASK_PAYLOAD_TEST_URL);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    service = createClient<Database>(settings.TASK_PAYLOAD_TEST_URL, settings.TASK_PAYLOAD_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const studio of studios) await service.from("studios").insert({ id: studio, name: "Task payload integration" }).throwOnError();
    for (const [index, account] of accounts.entries()) {
      const result = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true }); if (result.error) throw result.error;
      account.id = result.data.user.id; const role = index === 1 ? "employee" : "admin";
      await service.from("profiles").upsert({ id: account.id, full_name: account.role, email: account.email, system_role: role, is_active: true }).throwOnError();
      await service.from("studio_members").insert({ studio_id: studios[index === 2 ? 1 : 0], user_id: account.id, system_role: role, is_active: true }).throwOnError();
      const client = createClient<Database>(settings.TASK_PAYLOAD_TEST_URL, settings.TASK_PAYLOAD_TEST_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
        const response = await fetch(input, init); const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname;
        if (path.startsWith("/rest/v1/") && response.ok) {
          const body = await response.clone().text(); const value: unknown = JSON.parse(body);
          const rows = Array.isArray(value) ? value : value ? [value] : [];
          const taskRows = path === "/rest/v1/tasks" ? z.array(z.object({ deadlines: z.array(z.unknown()).optional(), checklist_items: z.array(z.unknown()).optional(), collaborators: z.array(z.unknown()).optional() })).parse(rows) : [];
          requests.push({ path, tasks: taskRows.length, nested: taskRows.reduce((n, row) => n + (row.deadlines?.length ?? 0) + (row.checklist_items?.length ?? 0) + (row.collaborators?.length ?? 0), 0) + (path === "/rest/v1/task_deadline_completions" ? rows.length : 0), bytes: Buffer.byteLength(body) });
        }
        return response;
      } } });
      const auth = await client.auth.signInWithPassword({ email: account.email, password: account.password }); if (auth.error) throw auth.error;
      clients.push(client);
    }
    for (const [index, project] of projects.entries()) {
      const owner = accounts[index === 5 ? 2 : 0].id;
      sql(`insert into public.projects(id,studio_id,name,status,total_area_m2,start_date,created_by) values (${id(project)},${id(studios[index === 5 ? 1 : 0])},'Payload project ${index}','active',10000,'2026-09-01',${id(owner)});
        insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values (${id(project)},${id(owner)},'designer',0,'2026-09-01');`);
      if (index < 4) sql(`insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values (${id(project)},${id(accounts[1].id)},'designer',0,'2026-09-01');`);
      sql(`insert into public.tasks(project_id,stage,title,description,status,priority,assignee_id,created_by,completed_area_m2,progress_weight,manual_progress_override,production_completion,created_at)
        select ${id(project)},('stage_'||(n%4+1)),'Payload task ${index}-'||n,repeat('Task description ',200),case when ${index}=2 and n%4<>3 then 'completed' else (array['todo','in_progress','internal_review','review','completed','cancelled'])[n%6+1] end,(array['low','normal','high','urgent'])[n%4+1],case when n%10=0 then null when ${index}<4 and n%2=0 then ${id(accounts[1].id)} else ${id(owner)} end::uuid,${id(owner)},n%7+1,n%9+1,n%5=0,case when n%5=0 then 37 else 0 end,'2026-09-01'::timestamptz+n*interval '1 minute' from generate_series(1,${index === 0 ? 120 : 8}) n;
        insert into public.task_deadlines(task_id,target_status,due_date) select id,milestone,'2026-09-10'::date+day_offset from public.tasks cross join (values ('internal_review',0),('review',5),('completed',10)) m(milestone,day_offset) where project_id=${id(project)};
        insert into public.task_checklist_items(task_id,title,is_completed,weight,position) select id,'Checklist detail '||n||' '||repeat('label ',20),status in ('completed','review') or n%3=0,n,n from public.tasks cross join generate_series(1,8) n where project_id=${id(project)} and not manual_progress_override;
        insert into public.task_deadline_completions(studio_id,project_id,task_id,assignee_id,target_status,due_date,completed_on) select ${id(studios[index === 5 ? 1 : 0])},project_id,id,assignee_id,'internal_review','2026-09-10','2026-09-11' from public.tasks where project_id=${id(project)} and status in ('internal_review','review','completed');`);
      if (index < 4) sql(`insert into public.task_collaborators(task_id,user_id) select id,${id(accounts[1].id)} from public.tasks where project_id=${id(project)} and assignee_id=${id(owner)};`);
      sql(`update public.project_task_stage_columns set progress_method=case stage when 'stage_2' then 'area' when 'stage_3' then 'weighted' else 'equal' end where project_id=${id(project)};`);
    }
    sql(`update public.projects set status='paused' where id=${id(projects[1])}; update public.projects set status='completed',completed_at=now() where id=${id(projects[2])}; update public.projects set status='archived',archived_at=now() where id=${id(projects[3])};`);
  }, 60_000);
  afterAll(async () => {
    vi.useRealTimers(); vi.unstubAllEnvs(); if (!service) return;
    for (const studio of studios) sql(`delete from public.tasks where project_id in (select id from public.projects where studio_id=${id(studio)}); delete from public.project_members where project_id in (select id from public.projects where studio_id=${id(studio)}); delete from public.projects where studio_id=${id(studio)}; delete from public.studios where id=${id(studio)};`);
    for (const account of accounts) if (account.id) { const result = await service.auth.admin.deleteUser(account.id); if (result.error) throw result.error; }
  });

  for (const index of [0, 1]) it(`preserves Dashboard selection/progress for ${accounts[index].role}`, async () => {
    mocks.createClient.mockResolvedValue(clients[index]);
    const before = await measure(`dashboard-${accounts[index].role}-before-task-query`, () => oldDashboardTasks(clients[index]));
    const after = await measure(`dashboard-${accounts[index].role}-after-loader`, getDashboard);
    const dashboard = after.result; expect(dashboard).not.toBeNull(); if (!dashboard) return;
    const personal = before.result.filter((task) => task.assignee_id === accounts[index].id || task.collaborators.some((p) => p.id === accounts[index].id));
    const expected = dashboard.kind === "admin" ? sortEmployeeTasks(personal.filter(isOpenTask), "2026-09-15").slice(0, 5) : getEmployeeTasksNeedingAttention(personal, "2026-09-15").slice(0, 8);
    const actual = dashboard.kind === "admin" ? dashboard.myTasks : dashboard.needsAttention;
    expect(actual.map((task) => task.id)).toEqual(expected.map((task) => task.id));
    expect(actual.map((task) => [task.due_date, task.status, task.priority])).toEqual(expected.map((task) => [task.due_date, task.status, task.priority]));
    expect(actual.every((task) => !("description" in task) && task.checklist_items.every((item) => !("title" in item)) && task.collaborators.every((p) => !("full_name" in p)))).toBe(true);
    const methods: ProjectStageProgressMethods = { stage_1: "equal", stage_2: "area", stage_3: "weighted" };
    const actualProject = dashboard.kind === "admin" ? dashboard.attentionProjects.find((p) => p.id === projects[0]) : dashboard.projects.find((p) => p.id === projects[0]);
    expect(actualProject?.progressPercent).toEqual(calculateProjectProgress(before.result.filter((task) => task.project_id === projects[0]), "2026-09-15", methods).progressPercent);
    const taskRequests = after.requests.filter((r) => r.path === "/rest/v1/tasks");
    expect(taskRequests).toHaveLength(1);
    expect(taskRequests[0].tasks).toBe(before.requests[0].tasks);
    expect(taskRequests[0].bytes).toBeLessThan(before.requests[0].bytes / 4);
  });
  for (const view of ["board", "details", "team", "activity"]) it(`preserves complete progress/health for Project ${view}`, async () => {
    mocks.createClient.mockResolvedValue(clients[0]);
    const before = await measure(`project-${view}-before`, () => getProjectTasks(projects[0]));
    const after = await measure(`project-${view}-after`, () => view === "board" ? getProjectTasks(projects[0]) : getProjectTasksForProgress(projects[0]));
    for (const method of ["equal", "area", "weighted"] as const) {
      const methods = { stage_1: method, stage_2: method, stage_3: method };
      const oldProgress = calculateProjectProgress(before.result, "2026-09-15", methods);
      const newProgress = calculateProjectProgress(after.result, "2026-09-15", methods);
      expect(newProgress).toEqual(oldProgress);
      expect(calculateStageProgress(after.result, methods)).toEqual(calculateStageProgress(before.result, methods));
      for (const status of ["active", "paused", "completed", "archived"] as const) expect(getProjectHealth({ projectStatus: status, projectDueDate: "2026-09-20", progress: newProgress })).toEqual(getProjectHealth({ projectStatus: status, projectDueDate: "2026-09-20", progress: oldProgress }));
    }
    if (view === "board") expect(after.result).toEqual(before.result);
    else {
      expect(after.requests).toHaveLength(1);
      expect(after.requests[0].bytes).toBeLessThan(before.requests.reduce((n, r) => n + r.bytes, 0) / 4);
      expect(after.result.every((task) => !("description" in task) && !("collaborators" in task))).toBe(true);
    }
  });
  it("loads full drawer detail on demand with history and rejects inaccessible/mismatched IDs", async () => {
    mocks.createClient.mockResolvedValue(clients[0]);
    const tasks = await getProjectTasks(projects[0]); const task = tasks.find((task) => task.status === "internal_review")!;
    const detail = await measure("dashboard-drawer-open", () => loadDashboardTask(task.id, projects[0]));
    expect(detail.result).toEqual(task);
    expect(detail.result?.deadlines?.some((d) => d.completion)).toBe(true);
    expect(detail.result?.checklist_items[0].title).toContain("Checklist detail");
    expect(await loadDashboardTask(task.id, projects[1])).toBeNull();
    expect(await loadDashboardTask("invalid", projects[0])).toBeNull();
    mocks.createClient.mockResolvedValue(clients[1]);
    expect(await loadDashboardTask(task.id, projects[0])).toEqual(task);
    expect(await getProjectTasksForProgress(projects[4])).toEqual([]);
    mocks.createClient.mockResolvedValue(clients[2]);
    expect(await loadDashboardTask(task.id, projects[0])).toBeNull();
    expect(await getProjectTasksForProgress(projects[0])).toEqual([]);
  });
});
