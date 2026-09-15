import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { getEquipmentData, getEquipmentHistory } from "./equipment";
import { loadEquipmentHistory } from "@/app/(app)/office/equipment/actions";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
const studios = [randomUUID(), randomUUID()];
const accounts = ["admin", "employee", "outsider"].map((role) => ({ role, id: "", email: `equipment-history-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
const clients: SupabaseClient<Database>[] = [];
let service: SupabaseClient<Database>;
let replayEagerQuery = false;
let failHistory = false;
const requests: Array<{ path: string; rows: number; bytes: number; query: string }> = [];
function id(value: string) { return `'${z.uuid().parse(value)}'`; }
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}
async function measure<T>(label: string, run: () => Promise<T>) {
  requests.length = 0;
  const result = await run();
  const snapshot = [...requests];
  if (process.env.EQUIPMENT_HISTORY_MEASUREMENTS) appendFileSync(process.env.EQUIPMENT_HISTORY_MEASUREMENTS, JSON.stringify({ label, requests: snapshot, dtoBytes: Buffer.byteLength(JSON.stringify(result)) }) + "\n");
  return { result, requests: snapshot };
}

describe.skipIf(!process.env.EQUIPMENT_HISTORY_TEST_URL)("Equipment history on local Supabase", () => {
  beforeAll(async () => {
    const settings = z.object({ EQUIPMENT_HISTORY_TEST_URL: z.url(), EQUIPMENT_HISTORY_TEST_KEY: z.string(), EQUIPMENT_HISTORY_TEST_SERVICE_KEY: z.string() }).parse(process.env);
    if (!["127.0.0.1", "localhost"].includes(new URL(settings.EQUIPMENT_HISTORY_TEST_URL).hostname)) throw new Error("Local fixtures only");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", settings.EQUIPMENT_HISTORY_TEST_URL);
    service = createClient<Database>(settings.EQUIPMENT_HISTORY_TEST_URL, settings.EQUIPMENT_HISTORY_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const studio of studios) await service.from("studios").insert({ id: studio, name: "Equipment history integration" }).throwOnError();
    for (const [index, account] of accounts.entries()) {
      const result = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true }); if (result.error) throw result.error;
      account.id = result.data.user.id;
      const role = index === 1 ? "employee" : "admin";
      await service.from("profiles").upsert({ id: account.id, full_name: account.role, email: account.email, system_role: role, is_active: true }).throwOnError();
      await service.from("studio_members").insert({ studio_id: studios[index === 2 ? 1 : 0], user_id: account.id, system_role: role, is_active: true }).throwOnError();
      const client = createClient<Database>(settings.EQUIPMENT_HISTORY_TEST_URL, settings.EQUIPMENT_HISTORY_TEST_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        if (url.pathname.endsWith("/equipment_service_events")) {
          if (failHistory) return new Response(JSON.stringify({ message: "Test read failure" }), { status: 500 });
          // Replay the exact pre-batch query; the other four workspace queries are unchanged.
          if (replayEagerQuery) { url.searchParams.set("select", "*"); url.searchParams.delete("completed_on"); url.searchParams.set("order", "completed_on.desc.nullsfirst,started_on.desc"); }
        }
        const response = await fetch(url, init);
        if (url.pathname.startsWith("/rest/v1/") && response.ok) {
          const body = await response.clone().text(); const value: unknown = JSON.parse(body);
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
    for (const studio of studios) sql(`delete from public.equipment_service_events where studio_id=${id(studio)}; delete from public.studios where id=${id(studio)};`);
    for (const account of accounts) if (account.id) { const result = await service.auth.admin.deleteUser(account.id); if (result.error) throw result.error; }
  });

  for (const size of [20, 100]) it(`reduces the initial ${size}-item workspace while keeping active state`, async () => {
    sql(`delete from public.equipment_service_events where studio_id=${id(studios[0])}; delete from public.equipment where studio_id=${id(studios[0])};
      insert into public.equipment(studio_id,equipment_type,display_name,lifecycle_state) select ${id(studios[0])},'printer','History printer '||n,'active' from generate_series(1,${size}) n;
      insert into public.equipment_service_events(studio_id,equipment_id,event_type,started_on,completed_on,service_provider,cost_amount,cost_currency,started_notes,completion_notes)
      select studio_id,id,'repair','2026-01-01'::date+n,'2026-01-03'::date+n,'Service provider',150,'UAH',repeat('Start detail ',40),repeat('Completion detail ',60) from public.equipment cross join generate_series(1,8) n where studio_id=${id(studios[0])};`);
    const equipmentId = sql(`select id from public.equipment where studio_id=${id(studios[0])} order by id limit 1;`);
    await clients[0].rpc("start_equipment_service", { p_equipment_id: equipmentId, p_event_type: "regular_maintenance", p_started_on: "2026-09-01", p_notes: "Private active notes" }).throwOnError();
    const admin = await getActiveStudioAdmin(); if (!admin) throw new Error("Missing admin");
    replayEagerQuery = true;
    let before;
    try { before = await measure(`${size}-before-postgrest`, () => getEquipmentData(admin)); } finally { replayEagerQuery = false; }
    const after = await measure(`${size}-after-initial`, () => getEquipmentData(admin));
    expect(before.requests).toHaveLength(5); expect(after.requests).toHaveLength(5);
    expect(before.requests.find((r) => r.path.endsWith("/equipment_service_events"))?.rows).toBe(size * 8 + 1);
    expect(after.requests.find((r) => r.path.endsWith("/equipment_service_events"))?.rows).toBe(1);
    expect(after.requests.reduce((n, r) => n + r.bytes, 0)).toBeLessThan(before.requests.reduce((n, r) => n + r.bytes, 0) / 5);
    expect(after.result.equipment.find((e) => e.id === equipmentId)?.activeService).toEqual({ id: expect.any(String), eventType: "regular_maintenance", startedOn: "2026-09-01" });
    expect(JSON.stringify(after.result)).not.toContain("Private active notes");
    const history = await measure(`${size}-history-on-demand`, () => getEquipmentHistory(admin, equipmentId));
    expect(history.requests).toHaveLength(1); expect(history.result).toHaveLength(8);
    expect(history.result.map((e) => e.completedOn)).toEqual([...history.result.map((e) => e.completedOn)].sort().reverse());
    expect(history.result[0]).toMatchObject({ startedOn: "2026-01-09", completedOn: "2026-01-11", serviceProvider: "Service provider", costAmount: 150, costCurrency: "UAH", startedNotes: "Start detail ".repeat(40), completionNotes: "Completion detail ".repeat(60) });
  });

  it("returns all history beyond the response cap with stable date ties", async () => {
    const equipmentId = sql(`select id from public.equipment where studio_id=${id(studios[0])} order by id limit 1;`);
    sql(`insert into public.equipment_service_events(studio_id,equipment_id,event_type,started_on,completed_on) select ${id(studios[0])},${id(equipmentId)},'upgrade','2025-01-01','2025-01-01' from generate_series(1,1005);`);
    const admin = await getActiveStudioAdmin(); if (!admin) throw new Error("Missing admin");
    const result = await measure("large-history", () => getEquipmentHistory(admin, equipmentId));
    expect(result.result).toHaveLength(1013); expect(new Set(result.result.map((e) => e.id)).size).toBe(1013); expect(result.requests).toHaveLength(3);
    expect(result.result.slice(8).map((e) => e.id)).toEqual(result.result.slice(8).map((e) => e.id).sort().reverse());
  });

  it("keeps admin, tenant, invalid ID and history read failures scoped", async () => {
    const equipmentId = sql(`select id from public.equipment where studio_id=${id(studios[0])} order by id limit 1;`);
    expect(await loadEquipmentHistory("invalid")).toBeNull();
    failHistory = true;
    try { expect(await loadEquipmentHistory(equipmentId)).toBeNull(); } finally { failHistory = false; }
    expect((await loadEquipmentHistory(equipmentId))?.length).toBe(1013);
    for (const index of [1, 2]) {
      mocks.createClient.mockResolvedValue(clients[index]);
      expect(await loadEquipmentHistory(equipmentId)).toEqual(index === 1 ? null : []);
      const { data } = await clients[index].from("equipment_service_events").select("id").eq("equipment_id", equipmentId).throwOnError();
      expect(data).toEqual([]);
    }
    mocks.createClient.mockResolvedValue(clients[0]);
  });

  it("reads authoritative state after completion and history-only writes", async () => {
    const admin = await getActiveStudioAdmin(); if (!admin) throw new Error("Missing admin");
    const before = await getEquipmentData(admin); const item = before.equipment.find((e) => e.activeService); if (!item?.activeService) throw new Error("Missing open service");
    await clients[0].rpc("complete_equipment_service", { p_service_event_id: item.activeService.id, p_completed_on: "2026-09-02", p_return_state: "active", p_notes: "Completion persisted" }).throwOnError();
    const after = await measure("after-completion-workspace", () => getEquipmentData(admin));
    expect(after.result.equipment.find((e) => e.id === item.id)?.activeService).toBeNull();
    const history = await measure("after-completion-history", () => getEquipmentHistory(admin, item.id));
    expect(history.result[0]).toMatchObject({ id: item.activeService.id, completionNotes: "Completion persisted", startedNotes: "Private active notes" });
    await clients[0].rpc("record_equipment_history_event", { p_equipment_id: item.id, p_event_type: "repair", p_completed_on: "2026-09-03", p_notes: "History-only write" }).throwOnError();
    expect((await getEquipmentHistory(admin, item.id))[0].completionNotes).toBe("History-only write");
  });
});
