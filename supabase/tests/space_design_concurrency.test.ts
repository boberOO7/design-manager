import { execFileSync, spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { POST } from "@/app/api/integrations/space-design/leads/route";
import { processSpaceDesignQueue } from "@/lib/space-design/queue";

// Hard-coded local container: never use a linked project or an arbitrary DB URL.
const args = ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"];
const studio = randomUUID(), key = `sd-fixture-${randomUUID()}`, secret = "b".repeat(64);
const sql = (input: string) => execFileSync("docker", args, { input, encoding: "utf8" }).trim();
function session(input: string) {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "", error = "";
  child.stdout.on("data", data => { output += data.toString(); });
  child.stderr.on("data", data => { error += data.toString(); });
  const done = new Promise<string>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve(output) : reject(new Error(error)));
  });
  child.stdin.write(input);
  return { child, done, output: () => output };
}
async function until(check: () => boolean) {
  const end = Date.now() + 8000;
  while (!check()) {
    if (Date.now() > end) throw new Error("SPACE DESIGN local concurrency barrier timed out");
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}
function enqueue(id: string, phone: string | null, email: string | null = null) {
  const payload = JSON.stringify({ submission_id: id, client_name: "SD concurrency fixture", phone, email, submitted_at: "2026-11-07T12:00:00Z" });
  return `select public.accept_space_design_lead('${key}','${studio}','${id}',repeat('a',64),'${payload}');`;
}
function complete(id: string) {
  return `select public.complete_space_design_lead('${studio}','${id}',(select lease_token from public.space_design_lead_jobs where studio_id='${studio}' and submission_id='${id}'));`;
}
async function waiters(count: number) {
  await until(() => Number(sql(`select count(*) from pg_stat_activity where application_name='SpaceDesignFixture' and wait_event='advisory';`)) === count);
}
async function raceCompletions(contacts: Array<{ phone: string | null; email?: string }>) {
  const ids = contacts.map(() => randomUUID());
  sql(`set role service_role;${contacts.map((contact, i) => enqueue(ids[i], contact.phone, contact.email)).join("\n")}select count(*) from public.claim_space_design_leads();`);
  const barrier = session(`begin;select pg_advisory_xact_lock(hashtextextended('studioflow:crm_lead_phone:${studio}',0));select 'ready';\n`);
  const workers: Array<ReturnType<typeof session>> = [];
  try {
    await until(() => barrier.output().includes("ready"));
    for (const id of ids) {
      const worker = session(`set application_name='SpaceDesignFixture';set role service_role;${complete(id)}\n`);
      worker.child.stdin.end(); workers.push(worker);
    }
    await waiters(ids.length); barrier.child.stdin.end("commit;\n");
    await Promise.all([barrier.done, ...workers.map(worker => worker.done)]);
    expect(workers.map(worker => worker.output().trim()).sort()).toEqual(["created", "duplicate"]);
  } finally {
    if (!barrier.child.stdin.writableEnded) barrier.child.stdin.end("rollback;\n");
    await Promise.allSettled([barrier.done, ...workers.map(worker => worker.done)]);
  }
}

describe.skipIf(process.env.SPACE_DESIGN_LOCAL_DB_TESTS !== "1")("local SPACE DESIGN pipeline and concurrency", () => {
  beforeAll(() => {
    sql(`insert into public.studios(id,name) values('${studio}','SD disposable concurrency fixture');
      insert into public.space_design_integration_keys(key_id,studio_id,requests_per_minute) values('${key}','${studio}',1000);`);
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    sql(`delete from public.space_design_lead_jobs where studio_id='${studio}';delete from public.space_design_integration_keys where studio_id='${studio}';
      delete from public.crm_leads where studio_id='${studio}';delete from public.studios where id='${studio}';`);
  });
  it("serializes concurrent deliveries of the same event", async () => {
    const id = randomUUID();
    const first = session(`begin;set role service_role;${enqueue(id, "+380501111111")}select 'ready';\n`);
    let second: ReturnType<typeof session> | undefined;
    try {
      await until(() => first.output().includes("ready"));
      second = session(`set application_name='SpaceDesignAcceptanceFixture';set role service_role;${enqueue(id, "+380501111111")}\n`);
      second.child.stdin.end();
      await until(() => Number(sql("select count(*) from pg_stat_activity where application_name='SpaceDesignAcceptanceFixture' and wait_event_type='Lock';")) === 1);
      first.child.stdin.end("commit;\n"); await Promise.all([first.done, second.done]);
      expect(second.output().trim()).toBe("replayed");
      expect(sql(`select count(*) from public.space_design_lead_jobs where studio_id='${studio}' and submission_id='${id}';`)).toBe("1");
    } finally {
      if (!first.child.stdin.writableEnded) first.child.stdin.end("rollback;\n");
      await Promise.allSettled([first.done, ...(second ? [second.done] : [])]);
      sql(`delete from public.space_design_lead_jobs where studio_id='${studio}' and submission_id='${id}';`);
    }
  }, 15000);
  it("serializes phone variants into exactly one CRM lead", async () => {
    await raceCompletions([{ phone: "050 (123) 45-67" }, { phone: "+380501234567" }]);
    expect(sql(`select count(*) from public.crm_leads where studio_id='${studio}' and private.space_design_phone_key(phone,country_code)='380501234567';`)).toBe("1");
  }, 15000);
  it("serializes email-only submissions into exactly one CRM lead", async () => {
    await raceCompletions([{ phone: null, email: "Person@Example.test" }, { phone: null, email: "person@example.test" }]);
    expect(sql(`select count(*) from public.crm_leads where studio_id='${studio}' and private.crm_lead_email_key(email)='person@example.test';`)).toBe("1");
  }, 15000);
  it("waits for a manual phone insertion before deciding duplicate", async () => {
    const id = randomUUID();
    sql(`set role service_role;${enqueue(id, "0048503448352")}select count(*) from public.claim_space_design_leads();`);
    const manual = session(`begin;insert into public.crm_leads(studio_id,client_name,phone,first_contact_date)
      values('${studio}','SD manual phone fixture','+48 503 448 352','2026-11-07');select 'ready';\n`);
    let worker: ReturnType<typeof session> | undefined;
    try {
      await until(() => manual.output().includes("ready"));
      worker = session(`set application_name='SpaceDesignFixture';set role service_role;${complete(id)}\n`); worker.child.stdin.end();
      await waiters(1); manual.child.stdin.end("commit;\n"); await Promise.all([manual.done, worker.done]);
      expect(worker.output().trim()).toBe("duplicate");
    } finally {
      if (!manual.child.stdin.writableEnded) manual.child.stdin.end("rollback;\n");
      await Promise.allSettled([manual.done, ...(worker ? [worker.done] : [])]);
    }
  }, 15000);
  it("waits for an in-flight manual email edit", async () => {
    const id = randomUUID(), lead = randomUUID();
    sql(`insert into public.crm_leads(id,studio_id,client_name,email,first_contact_date) values('${lead}','${studio}','SD email edit fixture','old@example.test','2026-11-07');
      set role service_role;${enqueue(id, null, "edited@example.test")}select count(*) from public.claim_space_design_leads();`);
    const manual = session(`begin;update public.crm_leads set email='EDITED@example.test' where id='${lead}';select 'ready';\n`);
    let worker: ReturnType<typeof session> | undefined;
    try {
      await until(() => manual.output().includes("ready"));
      worker = session(`set application_name='SpaceDesignFixture';set role service_role;${complete(id)}\n`); worker.child.stdin.end();
      await waiters(1); manual.child.stdin.end("commit;\n"); await Promise.all([manual.done, worker.done]);
      expect(worker.output().trim()).toBe("duplicate");
    } finally {
      if (!manual.child.stdin.writableEnded) manual.child.stdin.end("rollback;\n");
      await Promise.allSettled([manual.done, ...(worker ? [worker.done] : [])]);
    }
  }, 15000);
  it("uses SKIP LOCKED when two workers claim simultaneously", async () => {
    const ids: string[] = [randomUUID(), randomUUID()];
    sql(`set role service_role;${ids.map(id => enqueue(id, "+380671111111")).join("\n")}`);
    const first = session("begin;set role service_role;select submission_id from public.claim_space_design_leads(1);select 'ready';\n");
    let second: ReturnType<typeof session> | undefined;
    try {
      await until(() => first.output().includes("ready"));
      second = session("set role service_role;select submission_id from public.claim_space_design_leads(1);\n"); second.child.stdin.end();
      await second.done;
      const firstId = first.output().split("\n").find(line => ids.includes(line));
      expect(ids).toContain(second.output().trim()); expect(second.output().trim()).not.toBe(firstId);
      first.child.stdin.end("commit;\n"); await first.done;
    } finally {
      if (!first.child.stdin.writableEnded) first.child.stdin.end("rollback;\n");
      await Promise.allSettled([first.done, ...(second ? [second.done] : [])]);
      sql(`delete from public.space_design_lead_jobs where studio_id='${studio}' and submission_id in ('${ids[0]}','${ids[1]}');`);
    }
  }, 15000);
  it("runs signed endpoint -> local PostgREST inbox -> worker -> actual CRM lead", async () => {
    // Capture local status in memory; never print service keys or read .env.prod.
    const config: Record<string, unknown> = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
      encoding: "utf8", env: { ...process.env, DO_NOT_TRACK: "1" }, stdio: ["ignore", "pipe", "pipe"],
    }));
    if (typeof config.API_URL !== "string" || !/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(config.API_URL)
      || typeof config.SERVICE_ROLE_KEY !== "string") throw new Error("Expected local Supabase credentials");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", config.API_URL); vi.stubEnv("SUPABASE_SECRET_KEY", config.SERVICE_ROLE_KEY);
    vi.stubEnv("SPACE_DESIGN_KEY_ID", key); vi.stubEnv("SPACE_DESIGN_CRM_STUDIO_ID", studio); vi.stubEnv("SPACE_DESIGN_HMAC_SECRET", secret);
    const id = randomUUID(), path = "/api/integrations/space-design/leads";
    const body = JSON.stringify({ schema_version: 1, submission_id: id, submitted_at: new Date().toISOString(), form_id: 7153,
      form_location: "modal", language: "uk", page_url: "https://space.example.test/contact", client_name: "SD pipeline fixture", phone: null, email: "pipeline@example.test" });
    const request = (raw = body) => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      return new Request(`http://localhost:3000${path}`, { method: "POST", body: raw, headers: {
        "content-type": "application/json", "x-sd-key-id": key, "x-sd-timestamp": timestamp, "idempotency-key": id,
        "x-sd-signature": `sha256=${createHmac("sha256", secret).update(`${timestamp}\nPOST\n${path}\n${raw}`).digest("hex")}`,
      } });
    };
    expect((await POST(request())).status).toBe(202);
    expect((await POST(request())).status).toBe(200);
    const reordered = Object.fromEntries(Object.entries(JSON.parse(body)).reverse());
    expect((await POST(request(JSON.stringify(reordered, null, 2)))).status).toBe(200);
    expect((await POST(request(body.replace("SD pipeline fixture", "Changed fixture")))).status).toBe(409);
    expect(await processSpaceDesignQueue()).toMatchObject({ created: 1 });
    expect(sql(`select count(*) from public.crm_leads where studio_id='${studio}' and client_name='SD pipeline fixture' and source='SPACE DESIGN Website' and status='new';`)).toBe("1");
    expect(sql(`select status||':'||(payload is null)::text from public.space_design_lead_jobs where studio_id='${studio}' and submission_id='${id}';`)).toBe("created:true");
    expect((await POST(request())).status).toBe(200);
  }, 15000);
});
