import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { getCalendarRange } from "@/lib/calendar";
import { getActiveTaskDeadline } from "@/lib/task-deadlines";
import { getCalendarTasks } from "./calendar-tasks";

vi.mock("server-only", () => ({}));

// Explicit opt-in; never reads the application's .env.local or a remote target.
const enabled = Boolean(process.env.CALENDAR_QUERY_TEST_URL);
const studios = [randomUUID(), randomUUID()];
const projects = [randomUUID(), randomUUID(), randomUUID()];
const accounts = ["admin", "employee", "outsider"].map((role) => ({ role, id: "", email: `calendar-range-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
let admin: SupabaseClient<Database>;
const clients: SupabaseClient<Database>[] = [];
const requests: Array<{ rows: number; deadlines: number; bytes: number; full: boolean }> = [];
function sqlId(value: string) { return `'${z.uuid().parse(value)}'`; }
function localSql(sql: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: sql, encoding: "utf8" }).trim();
}
const cases = [
  { name: "active inside", status: "todo", dates: ["2026-09-16", "2026-09-19", "2026-10-01"] },
  { name: "earlier outside later inside", status: "in_progress", dates: ["2026-09-10", "2026-09-16", "2026-09-18"] },
  { name: "active after range", status: "todo", dates: ["2026-10-02", "2026-10-04", "2026-10-06"] },
  { name: "workflow order beats date order", status: "todo", dates: ["2026-10-02", "2026-09-16", "2026-10-06"] },
  { name: "earlier reached", status: "internal_review", dates: ["2026-09-10", "2026-09-17", "2026-10-02"] },
  { name: "two reached", status: "review", dates: ["2026-09-10", "2026-09-12", "2026-09-20"] },
  { name: "completed", status: "completed", dates: ["2026-09-15", "2026-09-16", "2026-09-17"] },
  { name: "cancelled", status: "cancelled", dates: ["2026-09-15", "2026-09-16", "2026-09-17"] },
  { name: "start boundary", status: "todo", dates: ["2026-09-14"] },
  { name: "end boundary", status: "todo", dates: ["2026-09-20"] },
  { name: "before start", status: "todo", dates: ["2026-09-13"] },
  { name: "after end", status: "todo", dates: ["2026-09-21"] },
  { name: "leap day", status: "todo", dates: ["2028-02-29"] },
  { name: "no milestones", status: "todo", dates: [] },
  { name: "unassigned", status: "todo", dates: ["2026-09-15"] },
];

async function oldTasks(client: SupabaseClient<Database>, studioId: string) {
  return (await client.from("tasks")
    .select("id, project_id, title, description, status, priority, assignee_id, deadlines:task_deadlines(id, target_status, due_date), project:projects!tasks_project_id_fkey!inner(id, name, studio_id, status), assignee:profiles!tasks_assignee_id_fkey!inner(id, full_name)")
    .eq("project.studio_id", studioId).neq("status", "cancelled").order("created_at").throwOnError()).data;
}
function visible(tasks: Awaited<ReturnType<typeof oldTasks>>, range: { start: string; end: string }) {
  return tasks.flatMap((task) => {
    const deadline = getActiveTaskDeadline(task);
    return deadline && deadline.due_date >= range.start && deadline.due_date <= range.end && task.assignee_id ? [{ ...task, activeDeadline: deadline }] : [];
  }).sort((a, b) => a.id.localeCompare(b.id));
}

describe.skipIf(!enabled)("Calendar task range query against local PostgREST", () => {
  beforeAll(async () => {
    const settings = z.object({ CALENDAR_QUERY_TEST_URL: z.url(), CALENDAR_QUERY_TEST_KEY: z.string(), CALENDAR_QUERY_TEST_SERVICE_KEY: z.string() }).parse(process.env);
    if (!["127.0.0.1", "localhost"].includes(new URL(settings.CALENDAR_QUERY_TEST_URL).hostname)) throw new Error("Local fixtures only");
    admin = createClient<Database>(settings.CALENDAR_QUERY_TEST_URL, settings.CALENDAR_QUERY_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const id of studios) await admin.from("studios").insert({ id, name: "Calendar range query test" }).throwOnError();
    for (const [index, account] of accounts.entries()) {
      const created = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
      if (created.error) throw created.error;
      account.id = created.data.user.id;
      const role = index === 1 ? "employee" : "admin";
      await admin.from("profiles").upsert({ id: account.id, email: account.email, full_name: account.role, system_role: role, is_active: true }).throwOnError();
      await admin.from("studio_members").insert({ studio_id: studios[index === 2 ? 1 : 0], user_id: account.id, system_role: role, is_active: true }).throwOnError();
      const client = createClient<Database>(settings.CALENDAR_QUERY_TEST_URL, settings.CALENDAR_QUERY_TEST_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname === "/rest/v1/tasks" && response.ok) {
            const body = await response.clone().text();
            const rows = z.array(z.object({ deadlines: z.array(z.unknown()), title: z.string().optional() })).parse(JSON.parse(body));
            requests.push({ rows: rows.length, deadlines: rows.reduce((sum, row) => sum + row.deadlines.length, 0), bytes: Buffer.byteLength(body), full: rows.some((row) => row.title !== undefined) });
          }
          return response;
        } },
      });
      const auth = await client.auth.signInWithPassword({ email: account.email, password: account.password });
      if (auth.error) throw auth.error;
      clients.push(client);
    }
    for (const [i, id] of projects.entries()) localSql(`insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by) values (${sqlId(id)},${sqlId(studios[i === 2 ? 1 : 0])},'Range project ${i}',100,'2026-09-01',${sqlId(accounts[i === 2 ? 2 : 0].id)});`);
    localSql(`insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values (${sqlId(projects[0])},${sqlId(accounts[1].id)},'designer',0,'2026-09-01');`);
    for (const item of cases) {
      const id = randomUUID();
      localSql(`insert into public.tasks(id,project_id,title,description,status,assignee_id,created_by) values (${sqlId(id)},${sqlId(projects[0])},'${item.name}',repeat('calendar description ',80),'${item.status}',${item.name === "unassigned" ? "null" : sqlId(accounts[1].id)},${sqlId(accounts[0].id)});`);
      for (const [i, date] of item.dates.entries()) localSql(`insert into public.task_deadlines(task_id,target_status,due_date) values (${sqlId(id)},'${["internal_review", "review", "completed"][i]}','${date}');`);
    }
    // Accumulated history stays outside both representative ranges.
    localSql(`with seeded as (insert into public.tasks(project_id,title,description,status,assignee_id,created_by) select ${sqlId(projects[0])},'Historical task '||n,repeat('calendar description ',80),case when n%2=0 then 'completed' else 'todo' end,${sqlId(accounts[1].id)},${sqlId(accounts[0].id)} from generate_series(1,400) n returning id) insert into public.task_deadlines(task_id,target_status,due_date) select id,milestone,'2025-01-01'::date from seeded cross join (values ('internal_review'),('review'),('completed')) m(milestone);`);
    for (const i of [1, 2]) localSql(`insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values (${sqlId(projects[i])},${sqlId(accounts[i === 2 ? 2 : 0].id)},'designer',0,'2026-09-01');`);
    for (const i of [1, 2]) localSql(`with seeded as (insert into public.tasks(project_id,title,assignee_id,created_by) values (${sqlId(projects[i])},'Restricted task ${i}',${sqlId(accounts[i === 2 ? 2 : 0].id)},${sqlId(accounts[i === 2 ? 2 : 0].id)}) returning id) insert into public.task_deadlines(task_id,target_status,due_date) select id,'completed','2026-09-16' from seeded;`);
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    for (const id of studios) localSql(`delete from public.tasks where project_id in (select id from public.projects where studio_id=${sqlId(id)}); delete from public.project_members where project_id in (select id from public.projects where studio_id=${sqlId(id)}); delete from public.projects where studio_id=${sqlId(id)}; delete from public.studios where id=${sqlId(id)};`);
    for (const account of accounts) if (account.id) { const result = await admin.auth.admin.deleteUser(account.id); if (result.error) throw result.error; }
  });

  for (const view of ["week", "month"] as const) {
    it(`preserves complete ${view} results with smaller full-task payloads`, async () => {
      const range = getCalendarRange(view, "2026-09-15");
      requests.length = 0;
      const before = visible(await oldTasks(clients[0], studios[0]), range);
      const beforeRequests = [...requests]; requests.length = 0;
      const after = await getCalendarTasks(clients[0], studios[0], range);
      expect(visible(after.data, range)).toEqual(before);
      expect(after.data).toHaveLength(before.length);
      if (view === "week") expect(after.data.map((task) => task.title)).not.toContain("earlier outside later inside");
      if (view === "week") expect(before.map((task) => task.title).sort()).toEqual(["Restricted task 1", "active inside", "earlier reached", "end boundary", "start boundary", "two reached"].sort());
      if (process.env.CALENDAR_QUERY_MEASUREMENTS) appendFileSync(process.env.CALENDAR_QUERY_MEASUREMENTS, JSON.stringify({ view, range, before: beforeRequests, after: requests }) + "\n");
      expect(requests.reduce((sum, request) => sum + request.bytes, 0)).toBeLessThan(beforeRequests[0].bytes / 10);
    });
  }

  it("preserves project membership and studio RLS for employees and outsiders", async () => {
    const range = getCalendarRange("week", "2026-09-15");
    for (const client of clients.slice(1)) {
      const before = visible(await oldTasks(client, studios[0]), range);
      const after = await getCalendarTasks(client, studios[0], range);
      expect(visible(after.data, range)).toEqual(before);
      expect(after.data.some((task) => task.title.startsWith("Restricted"))).toBe(false);
    }
  });

  it("handles leap dates and omits the full-task read for an empty range", async () => {
    const leap = await getCalendarTasks(clients[0], studios[0], { start: "2028-02-29", end: "2028-02-29" });
    expect(leap.data.map((task) => task.title)).toEqual(["leap day"]);
    requests.length = 0;
    const empty = await getCalendarTasks(clients[0], studios[0], { start: "2040-01-01", end: "2040-01-31" });
    expect(empty.data).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(requests[0].rows).toBe(0);
  });

  it("paginates lightweight candidates and bounds full-detail batches", async () => {
    localSql(`with seeded as (insert into public.tasks(project_id,title,status,assignee_id,created_by) select ${sqlId(projects[0])},'Paged task '||n,'todo',${sqlId(accounts[1].id)},${sqlId(accounts[0].id)} from generate_series(1,510) n returning id) insert into public.task_deadlines(task_id,target_status,due_date) select id,'completed','2035-01-15'::date from seeded;`);
    requests.length = 0;
    const result = await getCalendarTasks(clients[0], studios[0], { start: "2035-01-01", end: "2035-01-31" });
    expect(result.data).toHaveLength(510);
    expect(new Set(result.data.map((task) => task.id)).size).toBe(510);
    expect(requests.filter((request) => !request.full).map((request) => request.rows)).toEqual([500, 10]);
    expect(requests.filter((request) => request.full)).toHaveLength(6);
    expect(requests.filter((request) => request.full).every((request) => request.rows <= 100)).toBe(true);
  });

});
