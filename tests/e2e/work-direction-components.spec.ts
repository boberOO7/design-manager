import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";
import { signInLocalTestUser } from "../helpers/auth";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local Supabase required");
const service = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studio = randomUUID(), project = randomUUID();
const actor = { id: "", email: `direction-scope-${randomUUID()}@example.test`, password: `Terms-${randomUUID()}` };
const sql = (statement: string) => execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
let facade = "";

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studio, name: "Direction scope browser fixture" }).throwOnError();
  const result = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
  if (result.error) throw result.error;
  actor.id = result.data.user.id;
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Finance admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studio, user_id: actor.id, system_role: "admin" }).throwOnError();
  sql(`select set_config('request.jwt.claim.sub','${actor.id}',false);
    insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','UAH',current_date,'${actor.id}');
    insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values('${studio}','UAH account','UAH',0,'${actor.id}');
    select public.finalize_finance_setup('${studio}');
    select public.save_studio_contact_details('${studio}','https://space.example','agreements@space.example','','','Фінансові умови');
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status,country_code,client_name) values('${project}','${studio}','336 Напрями · фінансові умови',120,current_date,'${actor.id}','active','UA','Client');
    select public.save_project_work_direction('${project}','{"intent":"save","kind":"facade","name":"Фасад","areaM2":200,"coefficient":0.35}',(select stage_configuration_version from public.projects where id='${project}'));`);
  facade = sql(`select id from public.project_work_directions where project_id='${project}' and not is_default`);
});

test.afterAll(async () => {
  // Only this isolated fixture tenant is removed, including its immutable test history.
  sql(`begin; set local session_replication_role=replica;
    do $$ declare r record; begin
      for r in select distinct c.table_schema,c.table_name from information_schema.columns c join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
        where c.table_schema in ('public','private') and c.column_name='project_id' and p.relkind='r' loop
        execute format('delete from %I.%I where project_id=%L',r.table_schema,r.table_name,'${project}');
      end loop;
      for r in select distinct c.table_schema,c.table_name from information_schema.columns c join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
        where c.table_schema in ('public','private') and c.column_name='studio_id' and p.relkind='r' loop
        execute format('delete from %I.%I where studio_id=%L',r.table_schema,r.table_name,'${studio}');
      end loop;
    end $$;
    delete from public.projects where id='${project}'; delete from public.studios where id='${studio}'; commit;`);
  if (actor.id) await service.auth.admin.deleteUser(actor.id);
});

test("direction components supply production scope and initial financial pricing", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const d = uk.ProjectWorkspace.directions, c = d.components, f = uk.Finance;
  const label = (copy: string, number: number) => copy.replace("{number}", String(number));
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: String(testInfo.project.use.baseURL) }]);
  await signInLocalTestUser(page, actor);
  await page.goto(`/projects/${project}?workDirection=${facade}`);
  const openDirection = async () => {
    await page.locator(`[data-direction-id="${facade}"]`).getByRole("button", { name: d.actions.replace("{name}", "Фасад"), exact: true }).click();
    await page.getByRole("button", { name: d.edit, exact: true }).click();
    return page.getByRole("dialog", { name: d.edit, exact: true });
  };
  let direction = await openDirection();
  await expect(direction.getByLabel(d.area, { exact: true })).toHaveValue("200");
  await expect(direction.locator("[data-direction-components]")).toHaveCount(0);
  await direction.getByRole("button", { name: c.add, exact: true }).click();
  await direction.getByLabel(label(c.positionName, 1), { exact: true }).fill("Прибудинкова територія");
  await direction.getByLabel(label(c.positionArea, 1), { exact: true }).fill("30");
  await direction.getByLabel(label(c.positionCoefficient, 1), { exact: true }).fill("0.10");
  await expect(direction.getByLabel(c.total, { exact: true })).toContainText("73");
  await direction.screenshot({ path: testInfo.outputPath("direction-components.png") });
  await direction.getByRole("button", { name: d.save, exact: true }).click();
  await expect(direction).toHaveCount(0);
  expect(sql(`select equivalent_area_m2 from public.project_work_directions where id='${facade}'`)).toBe("73.00");
  direction = await openDirection();
  await expect(direction.getByLabel(c.total, { exact: true })).toContainText("73");
  await expect(direction.locator("[data-direction-components] input").first()).not.toBeVisible();
  await direction.getByRole("button", { name: c.title.replace("{count}", "1"), exact: true }).click();
  await expect(direction.getByLabel(label(c.positionArea, 1), { exact: true })).toHaveValue("30");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await direction.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await direction.screenshot({ path: testInfo.outputPath("direction-components-mobile.png") });
  await direction.getByRole("button", { name: d.cancel, exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/projects/${project}?view=finance&workDirection=${facade}`);
  await page.locator("[data-project-finance]").getByRole("button", { name: f.agreements.create, exact: true }).click();
  const finance = page.getByRole("dialog");
  await expect(finance.getByLabel(label(f.builder.components.positionName, 2), { exact: true })).toHaveValue("Прибудинкова територія");
  await expect(finance.getByLabel(label(f.builder.components.positionArea, 1), { exact: true })).toHaveValue("200");
  await expect(finance.getByLabel(label(f.builder.components.positionArea, 2), { exact: true })).toHaveValue("30");
  await finance.getByLabel(f.builder.rate, { exact: true }).fill("40");
  await expect(finance.locator("[data-price-summary]")).toContainText(/2\s?920,00/);
  await finance.screenshot({ path: testInfo.outputPath("finance-from-direction.png") });
  await finance.getByRole("button", { name: f.agreements.confirm, exact: true }).click();
  await expect(finance).toHaveCount(0);
  expect(sql(`select amount from public.finance_project_current_terms where project_id='${project}'`)).toBe("2920.00");
  expect(sql(`select area_snapshot from public.finance_project_plan_revisions where project_id='${project}'`)).toBe("73.0000");
});
