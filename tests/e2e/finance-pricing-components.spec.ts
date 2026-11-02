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
const actor = { id: "", email: `pricing-components-${randomUUID()}@example.test`, password: `Terms-${randomUUID()}` };
const sql = (statement: string) => execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
let facade = "";

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studio, name: "Pricing components browser fixture" }).throwOnError();
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

test("single to multiple components, immutable revision, preview and PDF", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const f = uk.Finance, c = f.builder.components;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const label = (copy: string, number: number) => copy.replace("{number}", String(number));
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: String(testInfo.project.use.baseURL) }]);
  await signInLocalTestUser(page, actor);
  await page.goto(`/projects/${project}?view=finance&workDirection=${facade}`);
  const workspace = page.locator("[data-project-finance]");
  await workspace.getByRole("button", { name: f.agreements.create, exact: true }).click();
  let editor = page.getByRole("dialog");
  await expect(editor.getByLabel(f.builder.area, { exact: true })).toHaveValue("200");
  await expect(editor.getByLabel(c.coefficient, { exact: true })).toHaveValue("0.35");
  await expect(editor.locator("[data-pricing-components] input")).toHaveCount(0);
  const singleControls = [editor.getByLabel(f.builder.area, { exact: true }), editor.getByLabel(c.coefficient, { exact: true }), editor.getByLabel(f.builder.rate, { exact: true }), editor.getByRole("combobox", { name: f.project.currency, exact: true })];
  await expect.poll(async () => {
    const tops = await Promise.all(singleControls.map(async control => (await control.boundingBox())?.y ?? 0));
    return Math.max(...tops) - Math.min(...tops);
  }).toBeLessThan(1);
  await editor.screenshot({ path: testInfo.outputPath("single-controls-aligned.png") });
  await editor.getByLabel(f.builder.rate, { exact: true }).fill("40");
  await expect(editor.locator("[data-price-summary]")).toContainText(/2\s?800,00/);
  await editor.getByRole("button", { name: c.add, exact: true }).click();
  await expect(editor.getByLabel(label(c.positionName, 2), { exact: true })).toBeFocused();
  await editor.getByRole("button", { name: label(c.remove, 2), exact: true }).click();
  await expect(editor.locator("[data-pricing-components] fieldset")).toHaveCount(1);
  await expect(editor.getByLabel(label(c.positionAmount, 1), { exact: true })).toContainText(/2\s?800,00/);
  await editor.getByRole("button", { name: c.add, exact: true }).click();
  await expect(editor.getByLabel(label(c.positionName, 1), { exact: true })).toHaveValue("Фасад");
  // Incomplete optional rows must not block switching to manual fixed pricing.
  await editor.getByRole("button", { name: f.builder.fixedShort, exact: true }).click();
  await editor.getByLabel(f.project.contract, { exact: true }).fill("2800");
  await expect(editor.getByRole("button", { name: f.agreements.confirm, exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: f.builder.perAreaShort, exact: true }).click();
  await editor.getByLabel(label(c.positionName, 2), { exact: true }).fill("Прилегла територія");
  await editor.getByLabel(label(c.positionArea, 2), { exact: true }).fill("30");
  await editor.getByLabel(label(c.positionCoefficient, 2), { exact: true }).fill("0.10");
  await expect(editor.getByLabel(label(c.positionAmount, 1), { exact: true })).toContainText(/2\s?800,00/);
  await expect(editor.getByLabel(label(c.positionAmount, 2), { exact: true })).toContainText(/120,00/);
  await expect(editor.locator("[data-price-summary]")).toContainText(/2\s?920,00/);
  await editor.screenshot({ path: testInfo.outputPath("components-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await editor.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await editor.screenshot({ path: testInfo.outputPath("components-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await editor.getByRole("button", { name: f.agreements.confirm, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const order = sql(`select id from public.finance_project_orders where project_id='${project}' and status='confirmed'`);
  expect(sql(`select amount from public.finance_project_current_terms where order_id='${order}'`)).toBe("2920.00");
  expect(sql(`select area_m2||':'||complexity_coefficient from public.project_work_directions where id='${facade}'`)).toBe("200:0.35");
  await workspace.locator("[data-order-group]").first().getByRole("button", { name: f.orders.details, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: f.project.editAgreement, exact: true }).click();
  editor = page.getByRole("dialog");
  await expect(editor.getByLabel(label(c.positionArea, 2), { exact: true })).toHaveValue("30");
  await editor.getByLabel(label(c.positionArea, 2), { exact: true }).fill("40");
  await editor.getByRole("button", { name: "50 / 50", exact: true }).click();
  await editor.getByLabel(f.project.reason, { exact: true }).fill("Уточнення прилеглої території");
  await editor.getByRole("button", { name: f.builder.saveRevision, exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: f.proposal.action, exact: true })).toBeVisible();
  expect(sql(`select string_agg(area_components->1->>'actualArea',',' order by t.revision) from public.finance_project_plan_revisions r join public.finance_project_terms t on t.id=r.terms_id where t.order_id='${order}'`)).toBe("30,40");
  expect(sql(`select amount from public.finance_project_current_terms where order_id='${order}'`)).toBe("2960.00");
  await page.getByRole("dialog").getByRole("button", { name: f.proposal.action, exact: true }).click();
  const proposal = page.getByRole("dialog");
  await expect(proposal.locator("[data-proposal-pages] canvas")).toBeVisible({ timeout: 60000 });
  await expect(proposal.locator("[data-proposal-pages]")).toContainText("Прилегла територія");
  await expect(proposal.locator("[data-proposal-pages]")).toContainText(/2\s?960,00/);
  await proposal.getByLabel(f.proposal.showPercentages, { exact: true }).uncheck();
  await expect(proposal.locator("[data-proposal-pages]")).not.toContainText("Частка");
  await expect(proposal.getByRole("button", { name: f.proposal.generate, exact: true })).toBeEnabled({ timeout: 60000 });
  await proposal.screenshot({ path: testInfo.outputPath("components-preview.png") });
  await proposal.getByRole("button", { name: f.proposal.generate, exact: true }).click();
  await expect(proposal.getByText(f.proposal.saved, { exact: true })).toBeVisible({ timeout: 60000 });
  const href = await proposal.getByRole("link", { name: f.proposal.download, exact: true }).getAttribute("href");
  expect(href).toBeTruthy();
  const response = await page.request.get(href ?? "");
  expect(response.headers()["content-type"]).toBe("application/pdf");
  const pdf = await response.body();
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(sql(`select snapshot->'areaComponents'->1->>'actualArea' from public.finance_project_proposals where order_id='${order}'`)).toBe("40");
  expect(sql(`select snapshot->>'showPercentages' from public.finance_project_proposals where order_id='${order}'`)).toBe("false");
  expect(errors).toEqual([]);
});
