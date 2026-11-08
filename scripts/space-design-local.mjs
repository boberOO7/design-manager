import { execFileSync, spawn } from "node:child_process";
import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const root = fileURLToPath(new URL("../", import.meta.url));
const envFile = `${root}.env.space-design.e2e.local`;
const privateDir = `${root}.local/space-design-e2e`;
const baseUrl = "http://127.0.0.1:3100";
const leadPath = "/api/integrations/space-design/leads";
const studioName = "SPACE DESIGN E2E (local only)";
const keyId = "space-design-e2e-local";
class LocalSetupError extends Error {}

function config() {
  const value = parseEnv(readFileSync(envFile, "utf8"));
  assert.equal(value.SPACE_DESIGN_KEY_ID, keyId, "Unexpected E2E key ID");
  assert.match(value.SPACE_DESIGN_CRM_STUDIO_ID ?? "", /^[a-f0-9-]{36}$/, "Invalid E2E studio");
  assert.match(value.SPACE_DESIGN_HMAC_SECRET ?? "", /^[a-f0-9]{64}$/, "Invalid local HMAC secret");
  delete value.SPACE_DESIGN_WORKER_SECRET; // Ignore legacy local configuration.
  return value;
}

function backend() {
  let status;
  try {
    status = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
      cwd: root, encoding: "utf8", env: { ...process.env, DO_NOT_TRACK: "1" }, stdio: ["ignore", "pipe", "pipe"],
    }));
  } catch { throw new LocalSetupError("Local Supabase is unavailable; no credentials printed."); }
  assert.equal(status.API_URL, "http://127.0.0.1:54321", "Only local Supabase is allowed");
  assert.equal(typeof status.SERVICE_ROLE_KEY, "string", "Local service role is missing");
  assert.equal(typeof status.ANON_KEY, "string", "Local anon key is missing");
  return {
    status,
    admin: createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  };
}

function check(result, message) {
  // Supabase errors can include SQL values: never print the original response.
  if (result.error) throw new LocalSetupError(message);
  return result.data;
}

async function ownedStudio(admin, value) {
  const studio = check(await admin.from("studios").select("id,name")
    .eq("id", value.SPACE_DESIGN_CRM_STUDIO_ID).maybeSingle(), "Cannot verify local studio");
  assert.equal(studio?.name, studioName, "Refusing to use a non-E2E studio");
}

async function prepare() {
  const { admin } = backend();
  const ignored = execFileSync("git", ["check-ignore", "--", ".env.space-design.e2e.local", ".local/space-design-e2e/wordpress-private.php"], { cwd: root, encoding: "utf8" });
  assert.equal(ignored.trim().split("\n").length, 2, "Private files must be gitignored");
  mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  chmodSync(privateDir, 0o700);
  if (!existsSync(envFile)) {
    const value = {
      SPACE_DESIGN_KEY_ID: keyId,
      SPACE_DESIGN_CRM_STUDIO_ID: randomUUID(),
      SPACE_DESIGN_HMAC_SECRET: randomBytes(32).toString("hex"),
    };
    writeFileSync(envFile, Object.entries(value).map(([name, item]) => `${name}=${item}`).join("\n") + "\n", { mode: 0o600, flag: "wx" });
  }
  chmodSync(envFile, 0o600);
  const value = config();
  const existing = check(await admin.from("studios").select("id,name")
    .eq("id", value.SPACE_DESIGN_CRM_STUDIO_ID).maybeSingle(), "Cannot check local studio");
  if (existing) assert.equal(existing.name, studioName, "Refusing to modify a non-E2E studio");
  else check(await admin.from("studios").insert({ id: value.SPACE_DESIGN_CRM_STUDIO_ID, name: studioName }), "Cannot create E2E studio");
  const key = check(await admin.from("space_design_integration_keys").select("studio_id")
    .eq("key_id", keyId).maybeSingle(), "SPACE DESIGN migrations/registry are unavailable");
  if (key) assert.equal(key.studio_id, value.SPACE_DESIGN_CRM_STUDIO_ID, "Key belongs to another studio");
  else check(await admin.from("space_design_integration_keys").insert({ key_id: keyId, studio_id: value.SPACE_DESIGN_CRM_STUDIO_ID }), "Cannot register E2E key");
  const php = `<?php\n// LOCAL E2E ONLY. Private file: never put under a web root or print its contents.\n`
    + `define('SD_STUDIOFLOW_BASE_URL', '${baseUrl}');\n`
    + `define('SD_STUDIOFLOW_KEY_ID', '${keyId}');\n`
    + `define('SD_STUDIOFLOW_HMAC_SECRET', '${value.SPACE_DESIGN_HMAC_SECRET}');\n`
    + `define('SD_STUDIOFLOW_SEND_ENABLED', false);\n`;
  writeFileSync(`${privateDir}/wordpress-private.php`, php, { mode: 0o600 });
  chmodSync(`${privateDir}/wordpress-private.php`, 0o600);
  console.log(`Prepared local studio: ${value.SPACE_DESIGN_CRM_STUDIO_ID}`);
  console.log(`Key ID: ${keyId}; endpoint: ${baseUrl}${leadPath}`);
  console.log("Private WordPress handoff: .local/space-design-e2e/wordpress-private.php (HMAC only; sending disabled)");
  console.log("Server credentials: .env.space-design.e2e.local (never share this file with WordPress)");
}

async function start() {
  const value = config(), { admin, status } = backend();
  await ownedStudio(admin, value);
  const env = { ...process.env };
  // Prevent Next's .env.local fallback from loading configured third-party secrets.
  for (const name of Object.keys(parseEnv(readFileSync(`${root}.env.example`, "utf8")))) env[name] = "";
  Object.assign(env, value, {
    NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL, SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, NEXT_PUBLIC_USE_MOCK_DATA: "false",
    NEXT_PUBLIC_APP_NAME: "StudioFlow SPACE DESIGN E2E", NEXT_PUBLIC_APP_THEME: "light",
  });
  const child = spawn(process.execPath, [`${root}node_modules/next/dist/bin/next`, "dev", "--hostname", "127.0.0.1", "--port", "3100"], { cwd: root, env, stdio: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => { console.error("Cannot start local Next.js"); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 0; });
}

async function noOtherPendingJobs(admin, value) {
  await ownedStudio(admin, value);
  const result = await admin.from("space_design_lead_jobs").select("submission_id", { count: "exact", head: true })
    .neq("studio_id", value.SPACE_DESIGN_CRM_STUDIO_ID).in("status", ["pending", "processing"]);
  check(result, "Cannot verify worker isolation");
  assert.equal(result.count, 0, "Another studio has queued jobs; refusing global worker execution");
}

async function worker(value = config(), admin = backend().admin) {
  await noOtherPendingJobs(admin, value);
  const result = localDbJson("select private.process_space_design_lead_jobs();");
  console.log("Worker:", result);
  return result;
}

function localDbJson(query) {
  try {
    return JSON.parse(execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
      { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }));
  } catch { throw new LocalSetupError("Local SQL worker/query failed; check the SQL-worker migration"); }
}

async function test() {
  const value = config(), { admin } = backend();
  await noOtherPendingJobs(admin, value);
  const run = randomUUID();
  const phone = `+999${randomInt(100000000000, 999999999999)}`;
  const email = `sd-e2e-${run}@example.test`;
  const event = (patch = {}) => ({ schema_version: 1, submission_id: randomUUID(), submitted_at: new Date().toISOString(),
    form_id: 3032, form_location: "footer", language: "uk", page_url: "http://space-design.local/e2e", client_name: `SD E2E ${run}`,
    phone, email: null, ...patch });
  async function send(body, expectedStatus) {
    const raw = JSON.stringify(body), timestamp = String(Math.floor(Date.now() / 1000));
    const response = await fetch(`${baseUrl}${leadPath}`, { method: "POST", body: raw, redirect: "error", signal: AbortSignal.timeout(60000), headers: {
      "content-type": "application/json", "x-sd-key-id": value.SPACE_DESIGN_KEY_ID, "x-sd-timestamp": timestamp,
      "idempotency-key": body.submission_id,
      "x-sd-signature": `sha256=${createHmac("sha256", value.SPACE_DESIGN_HMAC_SECRET).update(`${timestamp}\nPOST\n${leadPath}\n${raw}`).digest("hex")}`,
    } });
    assert.equal(response.status, expectedStatus, "Unexpected local endpoint status");
    const receipt = await response.json();
    if (expectedStatus < 300) assert.equal(receipt.submission_id, body.submission_id);
    return receipt;
  }
  const first = event();
  assert.equal((await send(first, 202)).status, "accepted");
  assert.equal((await send(first, 200)).status, "already_accepted");
  await send(Object.fromEntries(Object.entries(first).reverse()), 200);
  await send({ ...first, client_name: "Changed synthetic payload" }, 409);
  await worker(value, admin);
  const phoneDuplicate = event({ phone: `00${phone.slice(1)}`, language: "en" });
  const emailFirst = event({ phone: null, email: ` ${email.toUpperCase()} `, form_id: 7153, form_location: "modal", language: "pl" });
  const emailDuplicate = event({ phone: null, email, form_id: 7153, form_location: "modal" });
  const phonePresent = event({ phone: `+999${randomInt(100000000000, 999999999999)}`, email });
  await send(emailFirst, 202);
  await worker(value, admin);
  for (const item of [phoneDuplicate, emailDuplicate, phonePresent]) await send(item, 202);
  console.log("PASS HTTP acceptance, replay, JSON key order, payload conflict, both forms and uk/en/pl");
  await worker(value, admin);
  const ids = [first, phoneDuplicate, emailFirst, emailDuplicate, phonePresent].map(item => item.submission_id);
  const rows = check(await admin.from("space_design_lead_jobs").select("submission_id,status,payload,crm_lead_id")
    .eq("studio_id", value.SPACE_DESIGN_CRM_STUDIO_ID).in("submission_id", ids), "Cannot inspect E2E results");
  assert.equal(rows.length, 5);
  const statuses = new Map(rows.map(row => [row.submission_id, row.status]));
  assert.deepEqual(ids.map(id => statuses.get(id)), ["created", "duplicate", "created", "duplicate", "created"]);
  assert.ok(rows.every(row => row.payload === null), "Successful inbox payloads must be cleared");
  // CRM completion is a guarded definer RPC; service_role intentionally lacks
  // table SELECT. Inspect only our synthetic results as the local DB operator.
  const leadIds = rows.flatMap(row => row.crm_lead_id ? [row.crm_lead_id] : []);
  for (const id of leadIds) assert.match(id, /^[a-f0-9-]{36}$/, "Invalid local lead reference");
  const query = `select coalesce(json_agg(row_to_json(lead)), '[]'::json) from (
    select id,source,status from public.crm_leads where studio_id='${value.SPACE_DESIGN_CRM_STUDIO_ID}'
      and id in (${leadIds.map(id => `'${id}'`).join(",")})
  ) lead;`;
  const leads = localDbJson(query);
  assert.equal(leads.length, 3);
  assert.ok(leads.every(lead => lead.source === "SPACE DESIGN Website" && lead.status === "new"));
  await send(first, 200);
  const repeat = await worker(value, admin);
  assert.equal(repeat.claimed, 0, "Replay must not enqueue new work");
  console.log("PASS SQL worker, CRM creation, phone/email deduplication, phone priority, PII cleanup and completed replay");
  writeFileSync(`${privateDir}/last-test.json`, JSON.stringify({ testedAt: new Date().toISOString(), studioId: value.SPACE_DESIGN_CRM_STUDIO_ID,
    keyId, endpoint: `${baseUrl}${leadPath}`, submissionIds: ids, created: 3, duplicate: 2, result: "PASS" }, null, 2) + "\n", { mode: 0o600 });
}

async function status() {
  const value = config(), { admin } = backend();
  await ownedStudio(admin, value);
  const rows = check(await admin.from("space_design_lead_jobs").select("status,attempts,last_error,submission_id")
    .eq("studio_id", value.SPACE_DESIGN_CRM_STUDIO_ID).order("received_at", { ascending: false }).limit(20), "Cannot read local diagnostics");
  console.log(JSON.stringify({ studioId: value.SPACE_DESIGN_CRM_STUDIO_ID, keyId, endpoint: `${baseUrl}${leadPath}`, jobs: rows }, null, 2));
}

try {
  const commands = { prepare, start, worker: () => worker(), test, status };
  const command = commands[process.argv[2]];
  assert.ok(command, "Usage: node scripts/space-design-local.mjs prepare|start|worker|test|status");
  await command();
} catch (error) {
  // Do not expose stack traces, response bodies, environment or credentials.
  console.error(error instanceof assert.AssertionError ? error.message.split("\n")[0] : error instanceof LocalSetupError ? error.message : "Local SPACE DESIGN operation failed; inspect services/configuration without printing secrets.");
  process.exitCode = 1;
}
