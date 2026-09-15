import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { getActiveStudioMembership } from "./active-studio-membership";
import { getSubmissionsData } from "./submissions";
import { loadSubmissionDetail, manageSubmission, addSubmissionComment, toggleSuggestionSupport } from "@/app/(app)/submissions/actions";
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
const studios = [randomUUID(), randomUUID()];
const accounts = ["admin", "employee", "outsider"].map((role) => ({ role, id: "", email: `submission-detail-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
const clients: SupabaseClient<Database>[] = [];
let service: SupabaseClient<Database>;

let failDiscussionOffset: string | null = null;
const requests: Array<{ path: string; rows: number; bytes: number; query: string }> = [];
function id(value: string) { return `'${z.uuid().parse(value)}'`; }
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}
async function measure<T>(label: string, run: () => Promise<T>) {
  requests.length = 0;
  const result = await run();
  const snapshot = [...requests];
  if (process.env.SUBMISSION_DETAIL_MEASUREMENTS) appendFileSync(process.env.SUBMISSION_DETAIL_MEASUREMENTS, JSON.stringify({ label, requests: snapshot, dtoBytes: Buffer.byteLength(JSON.stringify(result)) }) + "\n");
  return { result, requests: snapshot };
}

async function oldWorkspace() {
  const membership = await getActiveStudioMembership(); if (!membership) throw new Error("Missing membership");
  const supabase = clients[0];
  return Promise.all([
    supabase.from("submissions").select("id, studio_id, type, request_category, title, description, status, is_anonymous, priority, deadline, created_at, updated_at, author:profiles!submissions_author_id_fkey(id, full_name, avatar_url), responsible:studio_members!submissions_studio_id_responsible_id_fkey(profile:profiles!studio_members_user_id_fkey(id, full_name, avatar_url))").eq("studio_id", membership.studio_id).order("created_at", { ascending: false }),
    supabase.from("submission_comments").select("id, submission_id, body, created_at, author:profiles!submission_comments_author_id_fkey!inner(id, full_name, avatar_url)").eq("studio_id", membership.studio_id).order("created_at"),
    supabase.from("submission_reactions").select("submission_id, user_id").eq("studio_id", membership.studio_id),
    supabase.from("submission_admin_details").select("submission_id, internal_note").eq("studio_id", membership.studio_id),
    supabase.from("studio_members").select("profile:profiles!studio_members_user_id_fkey!inner(id, full_name, avatar_url)").eq("studio_id", membership.studio_id).eq("is_active", true),
  ]);
}

describe.skipIf(!process.env.SUBMISSION_DETAIL_TEST_URL)("Submission detail on local Supabase", () => {
  beforeAll(async () => {
    const settings = z.object({ SUBMISSION_DETAIL_TEST_URL: z.url(), SUBMISSION_DETAIL_TEST_KEY: z.string(), SUBMISSION_DETAIL_TEST_SERVICE_KEY: z.string() }).parse(process.env);
    if (!["127.0.0.1", "localhost"].includes(new URL(settings.SUBMISSION_DETAIL_TEST_URL).hostname)) throw new Error("Local fixtures only");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", settings.SUBMISSION_DETAIL_TEST_URL);
    service = createClient<Database>(settings.SUBMISSION_DETAIL_TEST_URL, settings.SUBMISSION_DETAIL_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const studio of studios) await service.from("studios").insert({ id: studio, name: "Submission detail integration" }).throwOnError();
    for (const [index, account] of accounts.entries()) {
      const result = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true }); if (result.error) throw result.error;
      account.id = result.data.user.id;
      const role = index === 1 ? "employee" : "admin";
      await service.from("profiles").upsert({ id: account.id, full_name: account.role, email: account.email, system_role: role, is_active: true }).throwOnError();
      await service.from("studio_members").insert({ studio_id: studios[index === 2 ? 1 : 0], user_id: account.id, system_role: role, is_active: true }).throwOnError();
      const client = createClient<Database>(settings.SUBMISSION_DETAIL_TEST_URL, settings.SUBMISSION_DETAIL_TEST_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        if (url.pathname.endsWith("/submission_comments") && failDiscussionOffset === (url.searchParams.get("offset") ?? "0")) return new Response(JSON.stringify({ message: "Test failure" }), { status: 500 });
        const response = await fetch(url, init);
        if (url.pathname.startsWith("/rest/v1/") && response.ok) {
          const body = await response.clone().text(); const value: unknown = body ? JSON.parse(body) : null;
          requests.push({ path: url.pathname, rows: Array.isArray(value) ? value.length : value ? 1 : 0, bytes: Buffer.byteLength(body), query: url.search });
        }
        return response;
      } } });
      const auth = await client.auth.signInWithPassword({ email: account.email, password: account.password }); if (auth.error) throw auth.error;
      clients.push(client);
    }
    mocks.createClient.mockResolvedValue(clients[0]);
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllEnvs(); if (!service) return;
    for (const studio of studios) sql(`delete from public.studios where id=${id(studio)};`);
    for (const account of accounts) if (account.id) { const result = await service.auth.admin.deleteUser(account.id); if (result.error) throw result.error; }
  });

  for (const size of [20, 100]) it(`loads only list data for ${size} submissions`, async () => {
    sql(`delete from public.submissions where studio_id=${id(studios[0])};
      insert into public.submissions(studio_id,type,author_id,title,description) select ${id(studios[0])},'suggestion',${id(accounts[0].id)},'Lazy submission '||n,repeat('Description ',200) from generate_series(1,${size}) n;
      insert into public.submission_comments(submission_id,studio_id,author_id,body,created_at)
      select id,studio_id,${id(accounts[0].id)},'Comment '||n||' '||repeat('Discussion ',150),'2026-01-01'::timestamptz+n*interval '1 minute' from public.submissions cross join generate_series(1,8) n where studio_id=${id(studios[0])};
      insert into public.submission_reactions(submission_id,studio_id,user_id) select id,studio_id,${id(accounts[0].id)} from public.submissions where studio_id=${id(studios[0])};
      insert into public.submission_reactions(submission_id,studio_id,user_id) select id,studio_id,${id(accounts[1].id)} from public.submissions where studio_id=${id(studios[0])};
      insert into public.submission_admin_details(submission_id,studio_id,internal_note) select id,studio_id,btrim(repeat('Private note ',100)) from public.submissions where studio_id=${id(studios[0])};`);
    const before = await measure(`${size}-before`, oldWorkspace);
    expect(before.result.every((result) => !result.error)).toBe(true);
    const after = await measure(`${size}-after`, getSubmissionsData);
    expect(before.requests).toHaveLength(6); expect(after.requests).toHaveLength(3); // includes membership guard
    expect(before.requests.find((r) => r.path.endsWith('/submission_comments'))?.rows).toBe(size * 8);
    expect(after.requests.some((r) => /submission_(comments|reactions|admin_details)/.test(r.path))).toBe(false);
    expect(after.requests.reduce((n, r) => n + r.bytes, 0)).toBeLessThan(before.requests.reduce((n, r) => n + r.bytes, 0) / 10);
    expect(after.result.items).toHaveLength(size);
    expect(after.result.items.every((item) => item.supportCount === 2 && item.supportedByMe && !("comments" in item) && !("description" in item) && !("internalNote" in item))).toBe(true);
    const detail = await measure(`${size}-detail`, () => loadSubmissionDetail(after.result.items[0].id));
    expect(detail.result?.comments).toHaveLength(8); expect(detail.requests).toHaveLength(4);
    expect(detail.result?.description).toBe('Description '.repeat(200)); expect(detail.result?.internalNote).toBe('Private note '.repeat(100).trim());
    expect(detail.result?.comments.map((comment) => comment.body.split(' Discussion')[0])).toEqual(Array.from({ length: 8 }, (_, n) => `Comment ${n + 1}`));
    expect(detail.result?.comments[0].author).toEqual({ id: accounts[0].id, fullName: 'admin', avatarUrl: null });
  });

  it("loads large discussions completely and rejects partial results on page failure", async () => {
    const submissionId = sql(`select id from public.submissions where studio_id=${id(studios[0])} order by id limit 1;`);
    sql(`insert into public.submission_comments(submission_id,studio_id,author_id,body,created_at) select ${id(submissionId)},${id(studios[0])},${id(accounts[1].id)},'Large discussion '||n,'2026-02-01' from generate_series(1,1005) n;`);
    const result = await measure('large-detail', () => loadSubmissionDetail(submissionId));
    expect(result.result?.comments).toHaveLength(1013); expect(result.requests.filter((r) => r.path.endsWith('/submission_comments'))).toHaveLength(3);
    const comments = result.result?.comments ?? [];
    expect(new Set(comments.map((c) => c.id)).size).toBe(1013);
    expect(comments.slice(8).map((c) => c.id)).toEqual(comments.slice(8).map((c) => c.id).sort());
    failDiscussionOffset = '500';
    try { expect(await loadSubmissionDetail(submissionId)).toBeNull(); } finally { failDiscussionOffset = null; }
    expect((await loadSubmissionDetail(submissionId))?.comments).toHaveLength(1013);
  });

  it("preserves employee visibility, anonymous identity, private notes and tenant boundaries", async () => {
    const named = randomUUID(); const anonymous = randomUUID(); const assigned = randomUUID();
    sql(`insert into public.submissions(id,studio_id,type,author_id,title,description,is_anonymous,responsible_id) values
      (${id(named)},${id(studios[0])},'complaint',${id(accounts[0].id)},'Named complaint','Named private body',false,null),
      (${id(anonymous)},${id(studios[0])},'complaint',null,'Anonymous complaint','Anonymous private body',true,null),
      (${id(assigned)},${id(studios[0])},'request',${id(accounts[0].id)},'Assigned request','Assigned private body',false,${id(accounts[1].id)});`);
    const adminData = await getSubmissionsData();
    expect(adminData.items.find((item) => item.id === anonymous)?.author).toBeNull();
    expect((await loadSubmissionDetail(anonymous))?.comments).toEqual([]);
    const suggestionId = adminData.items.find((item) => item.type === 'suggestion')!.id;
    mocks.createClient.mockResolvedValue(clients[1]);
    const employeeData = await getSubmissionsData();
    expect(employeeData.items.some((item) => (item.id === named || item.id === anonymous))).toBe(false);
    expect(employeeData.items.some((item) => item.id === assigned)).toBe(true);
    expect(await loadSubmissionDetail(named)).toBeNull(); expect(await loadSubmissionDetail(anonymous)).toBeNull();
    const employeeDetail = await measure('employee-detail', () => loadSubmissionDetail(suggestionId));
    expect(employeeDetail.result?.internalNote).toBeNull();
    expect(employeeDetail.requests.some((r) => r.path.endsWith('/submission_admin_details'))).toBe(false);
    expect((await loadSubmissionDetail(assigned))?.description).toBe('Assigned private body');
    mocks.createClient.mockResolvedValue(clients[2]);
    expect(await loadSubmissionDetail(suggestionId)).toBeNull(); expect((await getSubmissionsData()).items).toEqual([]);
    expect(await loadSubmissionDetail('invalid')).toBeNull();
    mocks.createClient.mockResolvedValue(clients[0]);
  });

  it("reconciles comment/support changes and preserves omitted private notes on inline workflow", async () => {
    const submissionId = sql(`select id from public.submissions where studio_id=${id(studios[0])} and type='suggestion' order by id desc limit 1;`);
    const comment = await addSubmissionComment({ submissionId, body: 'Local mutation comment' }); expect(comment.error).toBeUndefined();
    expect((await loadSubmissionDetail(submissionId))?.comments.filter((c) => c.id === comment.comment?.id)).toHaveLength(1);
    expect(await toggleSuggestionSupport(submissionId, true)).toEqual({});
    let item = (await getSubmissionsData()).items.find((item) => item.id === submissionId);
    expect(item).toMatchObject({ supportCount: 1, supportedByMe: false });
    expect(await toggleSuggestionSupport(submissionId, false)).toEqual({});
    item = (await getSubmissionsData()).items.find((item) => item.id === submissionId);
    expect(item).toMatchObject({ supportCount: 2, supportedByMe: true });
    expect(await manageSubmission({ submissionId, status: 'accepted', responsibleId: null, priority: 'normal', deadline: null })).toEqual({});
    expect((await loadSubmissionDetail(submissionId))?.internalNote).toBe('Private note '.repeat(100).trim());
    expect(await manageSubmission({ submissionId, status: 'accepted', responsibleId: null, priority: 'normal', deadline: null, internalNote: '' })).toEqual({});
    expect((await loadSubmissionDetail(submissionId))?.internalNote).toBeNull();
  });
});
