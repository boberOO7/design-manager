import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { getCrmCandidates, getCrmCandidateCycles, getCrmAdmins } from "./crm";
import { loadCandidateCycles } from "@/app/(app)/crm/actions";
import { filterCandidates } from "@/lib/crm";
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
const studios = [randomUUID(), randomUUID()];
const accounts = ["admin", "employee", "outsider"].map((role) => ({ role, id: "", email: `candidate-cycles-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
const clients: SupabaseClient<Database>[] = [];
let service: SupabaseClient<Database>;

let failDiscussionOffset: string | null = null;
const requests: Array<{ path: string; rows: number; bytes: number; query: string; cycles: number }> = [];
function id(value: string) { return `'${z.uuid().parse(value)}'`; }
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}
async function measure<T>(label: string, run: () => Promise<T>) {
  requests.length = 0;
  const result = await run();
  const snapshot = [...requests];
  if (process.env.CANDIDATE_CYCLES_MEASUREMENTS) appendFileSync(process.env.CANDIDATE_CYCLES_MEASUREMENTS, JSON.stringify({ label, requests: snapshot, dtoBytes: Buffer.byteLength(JSON.stringify(result)) }) + "\n");
  return { result, requests: snapshot };
}

async function oldWorkspace() {
  const membership = await getActiveStudioAdmin(); if (!membership) throw new Error("Missing membership");
  const [candidates, cycles] = await Promise.all([
    clients[0].from("crm_candidates").select("*").eq("studio_id", membership.studio_id).order("updated_at", { ascending: false }).throwOnError(),
    clients[0].from("crm_recruiting_cycles").select("*").eq("studio_id", membership.studio_id).order("started_at", { ascending: false }).throwOnError(),
  ]);
  await getCrmAdmins();
  return candidates.data.map((candidate) => ({ ...candidate, cycles: cycles.data.filter((cycle) => cycle.candidate_id === candidate.id) }));
}

describe.skipIf(!process.env.CANDIDATE_CYCLES_TEST_URL)("Candidate cycles on local Supabase", () => {
  beforeAll(async () => {
    const settings = z.object({ CANDIDATE_CYCLES_TEST_URL: z.url(), CANDIDATE_CYCLES_TEST_KEY: z.string(), CANDIDATE_CYCLES_TEST_SERVICE_KEY: z.string() }).parse(process.env);
    if (!["127.0.0.1", "localhost"].includes(new URL(settings.CANDIDATE_CYCLES_TEST_URL).hostname)) throw new Error("Local fixtures only");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", settings.CANDIDATE_CYCLES_TEST_URL);
    service = createClient<Database>(settings.CANDIDATE_CYCLES_TEST_URL, settings.CANDIDATE_CYCLES_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const studio of studios) await service.from("studios").insert({ id: studio, name: "Candidate cycles integration" }).throwOnError();
    for (const [index, account] of accounts.entries()) {
      const result = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true }); if (result.error) throw result.error;
      account.id = result.data.user.id;
      const role = index === 1 ? "employee" : "admin";
      await service.from("profiles").upsert({ id: account.id, full_name: account.role, email: account.email, system_role: role, is_active: true }).throwOnError();
      await service.from("studio_members").insert({ studio_id: studios[index === 2 ? 1 : 0], user_id: account.id, system_role: role, is_active: true }).throwOnError();
      const client = createClient<Database>(settings.CANDIDATE_CYCLES_TEST_URL, settings.CANDIDATE_CYCLES_TEST_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        if (url.pathname.endsWith("/crm_recruiting_cycles") && failDiscussionOffset === (url.searchParams.get("offset") ?? "0")) return new Response(JSON.stringify({ message: "Test failure" }), { status: 500 });
        const response = await fetch(url, init);
        if (url.pathname.startsWith("/rest/v1/") && response.ok) {
          const body = await response.clone().text(); const value: unknown = body ? JSON.parse(body) : null;
          requests.push({ path: url.pathname, rows: Array.isArray(value) ? value.length : value ? 1 : 0, bytes: Buffer.byteLength(body), query: url.search, cycles: url.pathname.endsWith("/crm_recruiting_cycles") ? (Array.isArray(value) ? value.length : 0) : url.pathname.endsWith("/crm_candidates") && Array.isArray(value) ? z.array(z.object({ cycles: z.array(z.unknown()).optional() })).parse(value).reduce((n, row) => n + (row.cycles?.length ?? 0), 0) : 0 });
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

  for (const size of [20, 100]) it(`keeps directory behavior with one summary per ${size} candidates`, async () => {
    sql(`delete from public.crm_candidates where studio_id=${id(studios[0])};
      insert into public.crm_candidates(studio_id,full_name,source,responsible_admin_id) select ${id(studios[0])},'Cycle candidate '||n,'Referral',${id(accounts[0].id)} from generate_series(1,${size}) n;
      insert into public.crm_recruiting_cycles(studio_id,candidate_id,target_position,stage,outcome,started_at,completed_at,next_contact_date,interview_at,interview_notes,test_task_result,decision_notes)
      select studio_id,id,case when n=8 then 'Architect' else 'Designer' end,case when n=8 and split_part(full_name,' ',3)::int%4=0 then 'interview_scheduled' else 'decision' end::public.recruiting_stage,
        case when n=8 and split_part(full_name,' ',3)::int%4=0 then null else (array['reserve','hired','rejected']::public.recruiting_outcome[])[split_part(full_name,' ',3)::int%3+1] end,
        '2026-01-01'::timestamptz+n*interval '1 day',case when n=8 and split_part(full_name,' ',3)::int%4=0 then null else '2026-01-02'::timestamptz+n*interval '1 day' end,
        '2026-10-02','2026-01-04T13:30:00Z',repeat('Interview notes ',80),repeat('Test result ',80),repeat('Decision notes ',40)
      from public.crm_candidates cross join generate_series(1,8) n where studio_id=${id(studios[0])};`);
    const before = await measure(`${size}-before`, oldWorkspace);
    const after = await measure(`${size}-after`, getCrmCandidates);
    expect(after.result.error).toBe(false);
    expect(before.requests).toHaveLength(5); expect(after.requests).toHaveLength(4); // uncached membership checks in Vitest
    expect(before.requests.reduce((n, r) => n + r.cycles, 0)).toBe(size * 8);
    expect(after.requests.reduce((n, r) => n + r.cycles, 0)).toBe(size);
    expect(after.requests.reduce((n, r) => n + r.bytes, 0)).toBeLessThan(before.requests.reduce((n, r) => n + r.bytes, 0) / 10);
    expect(after.result.candidates.map((c) => c.id)).toEqual(before.result.map((c) => c.id));
    for (const status of ['active','reserve','hired','rejected','all'] as const) for (const query of ['', 'Referral', 'Architect', 'Designer', 'candidate 1']) for (const position of ['', 'Architect', 'Designer']) {
      expect(filterCandidates(after.result.candidates, query, status, position).map((c) => c.id)).toEqual(filterCandidates(before.result, query, status, position).map((c) => c.id));
    }
    for (const candidate of after.result.candidates) {
      expect(candidate.cycles).toHaveLength(1);
      expect(candidate.cycles[0]).toEqual(expect.objectContaining({ target_position: 'Architect', next_contact_date: '2026-10-02' }));
      expect(candidate.cycles[0]).not.toHaveProperty('interview_notes');
    }
    const candidateId = after.result.candidates[0].id;
    const detail = await measure(`${size}-detail`, () => loadCandidateCycles(candidateId));
    expect(detail.requests).toHaveLength(2);
    expect(detail.result).toEqual(before.result.find((c) => c.id === candidateId)?.cycles);
  });

  it("uses started-at order even with an older active cycle, handles no cycles and stable ties", async () => {
    const candidateId = randomUUID(); const emptyId = randomUUID();
    sql(`insert into public.crm_candidates(id,studio_id,full_name) values (${id(candidateId)},${id(studios[0])},'Ordering fixture'),(${id(emptyId)},${id(studios[0])},'Empty fixture');
      insert into public.crm_recruiting_cycles(studio_id,candidate_id,target_position,started_at,outcome,completed_at) values
      (${id(studios[0])},${id(candidateId)},'Older active','2025-01-01',null,null),
      (${id(studios[0])},${id(candidateId)},'Newer final','2026-01-01','reserve','2026-02-01'),
      (${id(studios[0])},${id(candidateId)},'Date tie','2026-01-01','hired','2026-02-01');`);
    const data = await getCrmCandidates(); const cycles = await getCrmCandidateCycles(candidateId);
    expect(data.candidates.find((c) => c.id === candidateId)?.cycles[0].id).toBe(cycles?.[0].id);
    expect(cycles?.[0].outcome).not.toBeNull();
    expect(data.candidates.find((c) => c.id === emptyId)?.cycles).toEqual([]);
    expect(await loadCandidateCycles(emptyId)).toEqual([]);
  });

  it("returns full large history and fails locally without partial pages", async () => {
    const candidateId = sql(`select id from public.crm_candidates where studio_id=${id(studios[0])} and full_name='Cycle candidate 1';`);
    sql(`insert into public.crm_recruiting_cycles(studio_id,candidate_id,target_position,started_at,outcome,completed_at) select ${id(studios[0])},${id(candidateId)},'Past role','2025-01-01','reserve','2025-01-02' from generate_series(1,1005);`);
    const detail = await measure('large-history', () => loadCandidateCycles(candidateId));
    expect(detail.result).toHaveLength(1013); expect(detail.requests.filter((r) => r.path.endsWith('/crm_recruiting_cycles'))).toHaveLength(3);
    const ids = detail.result?.map((cycle) => cycle.id) ?? []; expect(new Set(ids).size).toBe(1013);
    expect(ids.slice(8)).toEqual(ids.slice(8).sort().reverse());
    failDiscussionOffset = '500';
    try { expect(await loadCandidateCycles(candidateId)).toBeNull(); } finally { failDiscussionOffset = null; }
    expect((await loadCandidateCycles(candidateId))?.length).toBe(1013);
  });

  it("keeps employee, inactive-admin and cross-studio reads restricted", async () => {
    const candidateId = sql(`select id from public.crm_candidates where studio_id=${id(studios[0])} limit 1;`);
    expect(await loadCandidateCycles('invalid')).toBeNull();
    for (const index of [1, 2]) {
      mocks.createClient.mockResolvedValue(clients[index]);
      expect(await loadCandidateCycles(candidateId)).toEqual(index === 1 ? null : []);
      expect((await getCrmCandidates()).candidates).toEqual([]);
      const cycles = await clients[index].from('crm_recruiting_cycles').select('id').eq('candidate_id', candidateId).throwOnError(); expect(cycles.data).toEqual([]);
    }
    mocks.createClient.mockResolvedValue(clients[0]);
    sql(`update public.profiles set is_active=false where id=${id(accounts[0].id)};`);
    try { expect(await loadCandidateCycles(candidateId)).toBeNull(); } finally { sql(`update public.profiles set is_active=true where id=${id(accounts[0].id)};`); }
  });

  it("reconciles a new cycle even without a candidate timestamp change", async () => {
    const candidateId = sql(`select id from public.crm_candidates where studio_id=${id(studios[0])} and full_name='Cycle candidate 1';`);
    const before = (await getCrmCandidates()).candidates.find((c) => c.id === candidateId)!;
    const newCycle = await clients[0].rpc('start_crm_recruiting_cycle', { p_candidate_id: candidateId, p_target_position: 'New attempt' }).throwOnError();
    const after = await measure('after-new-cycle-list', getCrmCandidates);
    const candidate = after.result.candidates.find((c) => c.id === candidateId)!;
    expect(candidate.updated_at).toBe(before.updated_at);
    expect(candidate.cycles[0]).toMatchObject({ id: newCycle.data, target_position: 'New attempt', outcome: null, stage: 'new' });
    const cycles = await measure('after-new-cycle-history', () => loadCandidateCycles(candidateId));
    expect(cycles.result?.[0].id).toBe(newCycle.data); expect(cycles.result).toHaveLength(1014);
  });
});
