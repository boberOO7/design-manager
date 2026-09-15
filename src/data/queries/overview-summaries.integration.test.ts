import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { getAdministrationData } from "./administration";
import { getDashboardAdministration } from "./dashboard-administration";
import { getOfficeOverview } from "./office-overview";
import { getSubmissionsData } from "./submissions";
import { getOfficeAssignmentsData } from "./office-assignments";
import { isTerminalSubmissionStatus } from "@/lib/submissions";
import { isOfficeAssignmentOverdue, isTerminalOfficeAssignmentStatus } from "@/lib/office-assignments";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
const studios = [randomUUID(), randomUUID()];
const accounts = ["admin", "employee", "outsider"].map((role) => ({ role, id: "", email: `overview-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
const clients: SupabaseClient<Database>[] = [];
let service: SupabaseClient<Database>;
const requests: Array<{ path: string; rows: number; bytes: number }> = [];
function id(value: string) { return `'${z.uuid().parse(value)}'`; }
function sql(statement: string, actor?: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: `begin; ${actor ? `select set_config('request.jwt.claim.sub',${id(actor)},true);` : ""} ${statement} commit;`, encoding: "utf8" });
}
async function measured<T>(label: string, run: () => Promise<T>) {
  requests.length = 0;
  const start = performance.now();
  const result = await run();
  const elapsedMs = performance.now() - start;
  const snapshot = [...requests];
  if (process.env.SUMMARY_QUERY_MEASUREMENTS) appendFileSync(process.env.SUMMARY_QUERY_MEASUREMENTS, JSON.stringify({ label, elapsedMs, requests: snapshot }) + "\n");
  return { result, requests: snapshot };
}
async function oldOffice() {
  const [submissions, assignments] = await Promise.all([getSubmissionsData(), getOfficeAssignmentsData()]);
  const own = submissions.items.filter((item) => item.author?.id === submissions.currentUserId);
  const active = assignments.items.filter((item) => !isTerminalOfficeAssignmentStatus(item.status));
  const recent = [
    ...(assignments.isAdmin ? submissions.items : own).map((item) => ({ id: item.id, title: item.title, updatedAt: item.updatedAt, kind: "submission", person: item.isAnonymous ? null : item.author, anonymous: item.isAnonymous })),
    ...assignments.items.map((item) => ({ id: item.id, title: item.title, updatedAt: item.updatedAt, kind: "assignment", person: item.responsible, anonymous: false })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6).map(({ id, title, kind, person, anonymous }) => ({ id, title, kind, person, anonymous }));
  return { isAdmin: assignments.isAdmin, counts: { ownSubmissions: own.length, attention: submissions.items.filter((item) => !isTerminalSubmissionStatus(item.type, item.status)).length, activeAssignments: active.length, assignedToMe: active.filter((item) => item.responsible.id === assignments.currentUserId).length, overdueAssignments: assignments.items.filter((item) => isOfficeAssignmentOverdue(item.deadline, item.status, "2026-09-15")).length }, recent };
}

describe.skipIf(!process.env.SUMMARY_QUERY_TEST_URL)("Overview summaries against local authenticated PostgREST", () => {
  beforeAll(async () => {
    const settings = z.object({ SUMMARY_QUERY_TEST_URL: z.url(), SUMMARY_QUERY_TEST_KEY: z.string(), SUMMARY_QUERY_TEST_SERVICE_KEY: z.string() }).parse(process.env);
    if (!["localhost", "127.0.0.1"].includes(new URL(settings.SUMMARY_QUERY_TEST_URL).hostname)) throw new Error("Local fixtures only");
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-14T21:30:00Z")); // Already September 15 in Kyiv.
    service = createClient<Database>(settings.SUMMARY_QUERY_TEST_URL, settings.SUMMARY_QUERY_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const studio of studios) await service.from("studios").insert({ id: studio, name: "Overview summary integration" }).throwOnError();
    for (const [i, account] of accounts.entries()) {
      const user = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
      if (user.error) throw user.error;
      account.id = user.data.user.id;
      const role = i === 1 ? "employee" : "admin";
      await service.from("profiles").upsert({ id: account.id, full_name: account.role, email: account.email, system_role: role, is_active: true }).throwOnError();
      await service.from("studio_members").insert({ studio_id: studios[i === 2 ? 1 : 0], user_id: account.id, system_role: role, is_active: true }).throwOnError();
      const client = createClient<Database>(settings.SUMMARY_QUERY_TEST_URL, settings.SUMMARY_QUERY_TEST_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
        const response = await fetch(input, init);
        const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname;
        if (path.startsWith("/rest/v1/") && response.ok) {
          const body = await response.clone().text(); const data: unknown = JSON.parse(body);
          requests.push({ path, rows: Array.isArray(data) ? data.length : 1, bytes: Buffer.byteLength(body) });
        }
        return response;
      } } });
      const auth = await client.auth.signInWithPassword({ email: account.email, password: account.password });
      if (auth.error) throw auth.error;
      clients.push(client);
    }
    sql(`insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,private_note) select ${id(studios[0])},${id(accounts[1].id)},'other','2026-09-15','2026-09-15',repeat('private ',200) from generate_series(1,55);`, accounts[1].id);
    sql(`insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,private_note,all_day,start_time,end_time) select ${id(studios[0])},${id(accounts[0].id)},'other',d::date,d::date,repeat('private ',200),t is null,t::time,case when t is null then null else '18:00'::time end from (values ('2026-09-15',null),('2026-09-15','09:00'),('2026-09-15','08:00'),('2026-10-14',null),('2026-10-15',null),('2026-09-14',null)) v(d,t);`, accounts[0].id);
    sql(`insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,private_note) values (${id(studios[0])},${id(accounts[0].id)},'other','2026-09-13','2026-09-15','overlapping');`, accounts[0].id);
    sql(`insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,private_note) values (${id(studios[0])},${id(accounts[0].id)},'other','2026-09-12','2026-09-16','cancelled absence'); update public.time_off_requests set status='cancelled',cancelled_at=now() where studio_id=${id(studios[0])} and private_note='cancelled absence';`, accounts[0].id);
    sql(`update public.time_off_requests set status='rejected',reviewed_by=${id(accounts[0].id)},reviewed_at=now() where id in (select id from public.time_off_requests where studio_id=${id(studios[0])} and status='pending' limit 1);`, accounts[0].id);
    sql(`insert into public.time_off_request_reviews(request_id,note,created_by) select id,repeat('review ',200),${id(accounts[0].id)} from public.time_off_requests where studio_id=${id(studios[0])} and status='approved';
      with templates as (insert into public.checklist_templates(studio_id,name,archived_at,created_by) select ${id(studios[0])},'Template '||n,case when n%2=0 then now() else null end,${id(accounts[0].id)} from generate_series(1,10) n returning id) insert into public.checklist_template_items(template_id,title,weight,position) select id,'Stage '||n,1,n from templates cross join generate_series(1,10) n;`);
    sql(`insert into public.submissions(studio_id,type,title,description,status,author_id,is_anonymous,created_at,updated_at) select ${id(studios[0])},(case n%3 when 0 then 'complaint' when 1 then 'request' else 'suggestion' end)::public.submission_type,'Submission '||n,repeat('description ',300),(case when n%4<>0 then 'new' when n%3=0 then 'closed' when n%3=1 then 'done' else 'implemented' end)::public.submission_status,case when n%6=0 then null when n%2=0 then ${id(accounts[1].id)} else ${id(accounts[0].id)} end::uuid,n%6=0,'2026-09-01'::timestamptz+n*interval '1 minute','2026-09-10'::timestamptz+(n/2)*interval '1 hour' from generate_series(1,80) n;
      insert into public.submission_comments(submission_id,studio_id,author_id,body) select id,studio_id,${id(accounts[0].id)},repeat('discussion ',100) from public.submissions cross join generate_series(1,2) where studio_id=${id(studios[0])} and not is_anonymous;
      insert into public.submission_admin_details(submission_id,studio_id,internal_note) select id,studio_id,repeat('internal ',150) from public.submissions where studio_id=${id(studios[0])};
      insert into public.submission_reactions(submission_id,studio_id,user_id) select id,studio_id,${id(accounts[1].id)} from public.submissions where studio_id=${id(studios[0])} and type='suggestion';
      insert into public.office_assignments(studio_id,title,description,creator_id,responsible_id,status,deadline,created_at,updated_at) select ${id(studios[0])},'Assignment '||n,repeat('description ',300),${id(accounts[0].id)},case when n%2=0 then ${id(accounts[1].id)} else ${id(accounts[0].id)} end::uuid,(array['assigned','in_progress','done','cancelled']::public.office_assignment_status[])[n%4+1],case n%3 when 0 then null when 1 then '2026-09-14'::date else '2026-09-15'::date end,'2026-09-01'::timestamptz+n*interval '1 minute','2026-09-10'::timestamptz+n*interval '1 hour' from generate_series(1,40) n;
      insert into public.submissions(studio_id,type,title,description,author_id) values (${id(studios[1])},'suggestion','Other studio','Other studio',${id(accounts[2].id)});`);
  }, 60_000);
  afterAll(async () => {
    vi.useRealTimers();
    if (!service) return;
    for (const studio of studios) sql(`delete from public.studios where id=${id(studio)};`);
    for (const account of accounts) if (account.id) { const result = await service.auth.admin.deleteUser(account.id); if (result.error) throw result.error; }
  });

  it("matches the capped pending count and ordered 30-day availability with no detail/configuration reads", async () => {
    mocks.createClient.mockResolvedValue(clients[0]);
    const before = await measured("dashboard-admin-before", getAdministrationData);
    const after = await measured("dashboard-admin-after", getDashboardAdministration);
    expect(after.result).toEqual({ pendingCount: before.result!.pendingRequests.length, upcomingAbsences: before.result!.upcomingAbsences.slice(0, 3).map(({ id, employeeName, startDate, endDate, startTime, endTime, allDay }) => ({ id, employeeName, startDate, endDate, startTime, endTime, allDay })) });
    expect(after.result?.pendingCount).toBe(50);
    expect(after.requests.filter((r) => r.path === "/rest/v1/time_off_requests").map((r) => r.rows).sort((a, b) => a - b)).toEqual([5, 50]);
    expect(after.result?.upcomingAbsences.map((item) => [item.startDate, item.startTime])).toEqual([["2026-09-13", null], ["2026-09-15", null], ["2026-09-15", "08:00:00"]]);
    expect(after.requests.filter((r) => r.path !== "/rest/v1/studio_members").map((r) => r.path)).toEqual(["/rest/v1/time_off_requests", "/rest/v1/time_off_requests"]);
    expect(after.requests.reduce((n, r) => n + r.bytes, 0)).toBeLessThan(before.requests.reduce((n, r) => n + r.bytes, 0) / 10);
  });
  it("does not load admin time-off data for an employee", async () => {
    mocks.createClient.mockResolvedValue(clients[1]);
    const result = await measured("dashboard-employee-after", getDashboardAdministration);
    expect(result.result).toBeNull();
    expect(result.requests.some((r) => r.path === "/rest/v1/time_off_requests")).toBe(false);
  });
  for (const index of [0, 1, 2]) it(`preserves Office counts, RLS and recent ordering for ${accounts[index].role}`, async () => {
    mocks.createClient.mockResolvedValue(clients[index]);
    const before = await measured(`office-${accounts[index].role}-before`, oldOffice);
    const after = await measured(`office-${accounts[index].role}-after`, getOfficeOverview);
    expect(after.result).toEqual(before.result);
    expect(after.result.recent.length).toBeLessThanOrEqual(6);
    expect(after.result.recent.filter((r) => r.anonymous).every((r) => r.person === null)).toBe(true);
    if (index === 0) expect(after.result.recent.some((r) => r.anonymous)).toBe(true);
    if (index === 1) expect(after.result.recent.filter((r) => r.kind === "submission").every((r) => r.person?.id === accounts[1].id)).toBe(true);
    expect(after.requests.some((r) => /submission_(comments|reactions|admin_details)/.test(r.path))).toBe(false);
    expect(after.requests.filter((r) => r.path === "/rest/v1/studio_members")).toHaveLength(1);
    if (index < 2) expect(after.requests.reduce((n, r) => n + r.bytes, 0)).toBeLessThan(before.requests.reduce((n, r) => n + r.bytes, 0) / 10);
  });
  it("keeps empty states and skips empty activity detail reads", async () => {
    sql(`delete from public.submissions where studio_id=${id(studios[1])};`);
    mocks.createClient.mockResolvedValue(clients[2]);
    const office = await measured("office-empty", getOfficeOverview);
    expect(office.result).toEqual({ isAdmin: true, counts: { ownSubmissions: 0, attention: 0, activeAssignments: 0, assignedToMe: 0, overdueAssignments: 0 }, recent: [] });
    expect(office.requests).toHaveLength(3);
    expect(await getDashboardAdministration()).toEqual({ pendingCount: 0, upcomingAbsences: [] });
  });
});
