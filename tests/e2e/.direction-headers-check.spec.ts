import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import { signInLocalTestUser } from "../helpers/auth";
import uk from "../../messages/uk.json";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local fixtures only");
const service = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studio = randomUUID(), project = randomUUID();
const actor = { id: "", email: `stage-methods-${randomUUID()}@example.test`, password: `Methods-${randomUUID()}` };
const sql = (statement: string) => execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1"], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studio, name: "Stage methods browser" }).throwOnError();
  const user = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
  if (user.error) throw user.error;
  actor.id = user.data.user.id;
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Methods admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studio, user_id: actor.id, system_role: "admin" }).throwOnError();
  sql(`select set_config('request.jwt.claim.sub','${actor.id}',false);
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
    values('${project}','${studio}','Stage methods',120,current_date,'${actor.id}','active');
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
    values('${project}','${actor.id}','designer',0,current_date);
    insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','UAH',current_date,'${actor.id}');
    insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values('${studio}','UAH account','UAH',0,'${actor.id}');
    select public.finalize_finance_setup('${studio}');`);
});

test.afterAll(async () => {
  // Scope cleanup to this fixture, including immutable membership history.
  sql(`begin; set local session_replication_role=replica;
    do $$ declare r record; begin
      for r in select distinct c.table_schema,c.table_name from information_schema.columns c
        join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
        where c.table_schema in ('public','private') and c.column_name='project_id' and p.relkind='r' loop
        execute format('delete from %I.%I where project_id=%L',r.table_schema,r.table_name,'${project}');
      end loop;
      for r in select distinct c.table_schema,c.table_name from information_schema.columns c
        join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
        where c.table_schema in ('public','private') and c.column_name='studio_id' and p.relkind='r' loop
        execute format('delete from %I.%I where studio_id=%L',r.table_schema,r.table_name,'${studio}');
      end loop;
    end $$;
    delete from public.projects where id='${project}'; delete from public.studios where id='${studio}'; commit;`);
  if (actor.id) await service.auth.admin.deleteUser(actor.id);
});

test("direction workspace headers align across tabs", async ({ page }) => {
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: String(test.info().project.use.baseURL) }]);
  await signInLocalTestUser(page, actor);
  await page.goto(`/projects/${project}`);
  const nav = page.getByRole("navigation", { name: uk.ProjectWorkspace.navigation });
  const geometry: Array<{ x: number; y: number; height: number }> = [];
  async function check(title: string, image: string) {
    const heading = page.getByRole("heading", { name: title, exact: true });
    await expect(heading).toBeVisible();
    const box = await heading.boundingBox();
    if (!box) throw new Error("Missing heading geometry");
    geometry.push(box);
    await page.screenshot({ path: `/tmp/direction-header-${image}.png`, animations: "disabled" });
  }
  await check("Етапи та задачі", "board");
  await expect(page.getByRole("button", { name: uk.Tasks.addTask, exact: true }).first()).toBeVisible();
  await nav.getByRole("link", { name: uk.ProjectWorkspace.details, exact: true }).click();
  await check("Параметри напряму", "details");
  const details = page.locator("[data-direction-details]");
  await expect(details.getByRole("button", { name: uk.ProjectWorkspace.directions.edit, exact: true })).toBeVisible();
  await expect(details.getByText(uk.ProjectWorkspace.directions.kinds.interior, { exact: true })).toHaveCount(1);
  await details.getByRole("button", { name: uk.ProjectWorkspace.directions.edit, exact: true }).click();
  await expect(page.getByRole("dialog", { name: uk.ProjectWorkspace.directions.edit })).toBeVisible();
  await page.keyboard.press("Escape");
  await nav.getByRole("link", { name: uk.ProjectWorkspace.finance, exact: true }).click();
  await check("Фінансові умови", "finance");
  await expect(page.getByRole("link", { name: uk.Finance.directionWorkspace.allFinance, exact: true })).toBeVisible();
  for (const box of geometry.slice(1)) {
    expect(Math.abs(box.x - geometry[0].x)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y - geometry[0].y)).toBeLessThanOrEqual(1);
    expect(box.height).toBe(geometry[0].height);
  }
});
