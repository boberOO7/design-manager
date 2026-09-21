import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";
const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["127.0.0.1", "localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local Finance fixtures only");
const client = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studio = randomUUID(), bank = randomUUID();
const actors = ["admin", "employee"].map(role => ({ role, id: "", email: `overview-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` }));
const t = en.Finance.overview;
const f = en.Finance.forecast;
const foreign = randomUUID(), secondBank = randomUUID();
function sql(statement: string) { return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim(); }
async function login(page: Page, index = 0) { await page.goto("/login"); await page.locator('input[type="email"]').fill(actors[index].email); await page.locator('input[type="password"]').fill(actors[index].password); await page.locator('button[type="submit"]').click(); await expect(page).toHaveURL(/\/dashboard/); }
let category = "";
test.beforeAll(async () => {
  await client.from("studios").insert({ id: studio, name: "Forecast browser test" }).throwOnError();
  for (const actor of actors) {
    const { data, error } = await client.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true }); if (error) throw error; actor.id = data.user.id;
    await client.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: `Forecast ${actor.role}`, system_role: actor.role, is_active: true }).throwOnError();
    await client.from("studio_members").insert({ studio_id: studio, user_id: actor.id, system_role: actor.role, joined_at: "2026-01-01" }).throwOnError();
  }
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','UAH',date_trunc('month',now() at time zone 'Europe/Kyiv')::date,'${actors[0].id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${bank}','${studio}','Bank','UAH',1000,'${actors[0].id}'),('${foreign}','${studio}','Dollar bank','USD',0,'${actors[0].id}'),('${secondBank}','${studio}','Second bank','UAH',0,'${actors[0].id}');
    select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.finalize_finance_setup('${studio}');`);
  category = sql(`select id from public.finance_categories where studio_id='${studio}' and default_key='project_payments'`);
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);
    do $$declare item uuid; begin
      item:=public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','100000','currency','UAH','categoryId','${category}','established',true,'description','Contract receipt','dueDate',(now() at time zone 'Europe/Kyiv')::date,'expectedDate',(now() at time zone 'Europe/Kyiv')::date,'commitment','agreed','certainty','fixed'));
      perform public.record_finance_expected_payment('${studio}',gen_random_uuid(),item,jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','40000','accountId','${bank}','categoryId','${category}'),40000);
      perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','100','currency','UAH','categoryId','${category}','description','Tentative receipt','expectedDate',(now() at time zone 'Europe/Kyiv')::date,'commitment','tentative','certainty','estimated'));
      perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','75','currency','UAH','categoryId','${category}','established',true,'description','Undated receipt','commitment','agreed','certainty','fixed'));
      perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','outgoing','amount','120','currency','UAH','categoryId',(select id from public.finance_categories where studio_id='${studio}' and default_key='rent'),'description','Overdue rent','dueDate',(now() at time zone 'Europe/Kyiv')::date-1,'commitment','agreed','certainty','fixed'));
      perform public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','owner_withdrawal','date',(now() at time zone 'Europe/Kyiv')::date,'amount','500','accountId','${bank}','categoryId',(select id from public.finance_categories where studio_id='${studio}' and default_key='owner_distribution')));
      perform public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','transfer','category','Transfer','date',(now() at time zone 'Europe/Kyiv')::date,'amount','100','accountId','${bank}','destinationId','${secondBank}','receivedAmount','100','fee','2'));
      perform public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','10','accountId','${foreign}','categoryId','${category}','fx',jsonb_build_object('rate','39','source','manual','effectiveDate',(now() at time zone 'Europe/Kyiv')::date)));
      perform public.save_finance_budget('${studio}',gen_random_uuid(),jsonb_build_object('categoryId','${category}','year',extract(year from now() at time zone 'Europe/Kyiv'),'revision',0,'months',to_jsonb(array_fill(100000,ARRAY[12])),'reason','Overview reference'));
    end $$;`);
});
test.afterAll(async () => {
  sql(`begin;set local session_replication_role=replica;
    delete from public.finance_forecast_snapshots where studio_id='${studio}';delete from public.finance_budget_revisions where studio_id='${studio}';
    delete from public.finance_allocations where studio_id='${studio}';delete from public.finance_expected_items where studio_id='${studio}';
    delete from public.finance_planning_requests where studio_id='${studio}';delete from public.finance_movement_entries where studio_id='${studio}';delete from public.finance_movements where studio_id='${studio}';
    delete from public.finance_accounts where studio_id='${studio}';delete from public.finance_categories where studio_id='${studio}';delete from public.finance_settings where studio_id='${studio}';
    delete from public.notifications where studio_id='${studio}';delete from public.studio_members where studio_id='${studio}';delete from public.studios where id='${studio}';commit;`);
  for (const actor of actors) if (actor.id) { const { error } = await client.auth.admin.deleteUser(actor.id); if (error) throw error; }
});
test("Overview summarizes canonical cash and links to the owning workflows", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await login(page); await page.goto("/finance?fx_USD=40");
  const cash = page.getByRole("button", { name: new RegExp(`^${t.cash}`) });
  await expect(cash).toContainText("40,898.00");
  await expect(page.getByRole("link", { name: new RegExp(`^${t.netFlow}`) })).toContainText("+39,888.00");
  await expect(page.getByRole("link", { name: new RegExp(`^${t.outgoing}`) })).toContainText("−120.00");
  await expect(page.getByRole("region", { name: t.currentState }).getByRole("link", { name: new RegExp(`^${t.overdue}`) })).toContainText("1");
  await expect(page.getByLabel(f.horizon, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(f.scenario, { exact: true })).toHaveCount(0);
  await expect(page.getByText(f.fxTitle, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("table", { name: t.budgetComparison })).toHaveCount(0);
  await cash.click(); await expect(page.locator("#overview-breakdown")).toContainText("Dollar bank");
  await expect(page.locator("#overview-breakdown")).toContainText("400.00"); await cash.click();
  await page.getByText(t.chartData, { exact: true }).click();
  const chart = page.getByRole("table", { name: t.cashChart });
  await expect(chart).toContainText("40,888.00"); await expect(chart).toContainText("40,898.00");
  await expect(chart).toContainText("100,778.00");
  await page.getByText(t.chartData, { exact: true }).click();
  await expect(page.locator("#overview-attention")).toContainText("Overdue rent");
  await expect(page.locator("#overview-attention")).toContainText("Undated receipt");
  await expect(page.getByRole("heading", { name: t.monthFlows })).toBeVisible();
  await expect(page.getByRole("heading", { name: t.monthFlows }).locator("../..")).toContainText(`${en.Finance.movements.natures.owner_distribution} · ${en.Finance.movements.kinds.outgoing}`);
  await page.locator("#overview-attention").getByRole("link", { name: /Overdue rent/ }).click();
  await expect(page).toHaveURL(/\/finance\/expected\?item=/);
  await expect(page.getByText("Contract receipt", { exact: true })).toHaveCount(0);
  await page.goto("/finance?fx_USD=40");
  await page.getByRole("link", { name: t.fullForecast, exact: true }).first().click();
  await expect(page).toHaveURL(/fx_USD=40/);
  await page.getByRole("button", { name: f.comparison, exact: false }).click();
  await expect(page.getByRole("table", { name: f.comparison })).toContainText("100,390.00");
  await page.goto("/finance?fx_USD=40");
  await page.locator('circle[role="button"]').first().focus(); await page.keyboard.press("ArrowRight");
  await expect(page.locator('p[aria-live="polite"]')).not.toHaveText(t.chartInteraction);
  await page.setViewportSize({width:1920,height:1080});
  await page.screenshot({path:testInfo.outputPath("overview-desktop.png")});
  await page.setViewportSize({width:375,height:900}); await page.emulateMedia({colorScheme:"dark", reducedMotion:"reduce"});
  await page.context().addCookies([{name:"studioflow-locale",value:"uk",url:"http://127.0.0.1:3100"}]); await page.reload();
  await expect(page.getByRole("heading", {name:uk.Finance.overview.title,exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("overview-mobile.png"),fullPage:true});
  expect(errors).toEqual([]);
});
test("employee cannot access Overview or Accounts", async ({ page }) => {
  await login(page, 1);
  for (const route of ["/finance", "/finance/accounts"]) { await page.goto(route); await expect(page).toHaveURL(/\/dashboard/); }
});

test("large decimal amounts stay exact in cards, chart tables, drilldowns and stored valuations", async ({ page }) => {
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);
    select public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','1234567890.12','accountId','${foreign}','categoryId','${category}','fx',jsonb_build_object('rate','1000000.0000000006','source','manual','effectiveDate',(now() at time zone 'Europe/Kyiv')::date)));
    select public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','56.78','accountId','${bank}','categoryId','${category}'));`);
  await login(page); await page.goto("/finance?fx_USD=1000000");
  const cash = page.getByRole("button", { name: new RegExp(`^${t.cash}`) });
  await expect(cash).toContainText("1,234,567,900,160,554.78");
  await cash.click();
  const breakdown = page.locator("#overview-breakdown");
  await expect(breakdown).toContainText("1,234,567,900,120,000.00");
  await expect(cash).toContainText("1,234,567,900,160,554.78");
  await expect(page.getByRole("group", { name: t.cashChart })).toHaveCount(0);
  await expect(page.getByText(t.chartScale, { exact: true }).first()).toBeVisible();
  const chart = page.getByRole("table", { name: t.cashChart }); // Opens automatically when coordinates are unsafe.
  await expect(chart).toBeVisible();
  await expect(chart).toContainText("1,234,567,890,160,945.52"); // Historical posted FX, not today's assumed FX.
  await expect(chart).toContainText("1,234,567,900,160,554.78");
  await expect(page.getByRole("link", { name: new RegExp(`^${t.netFlow}`) })).toContainText("1,234,567,890,159,945.52"); // Net flow remains exact after owner distribution and transfer fee.
  await page.goto("/finance/movements");
  for (const detail of await page.locator("details").all()) await detail.evaluate(el => el.setAttribute("open", ""));
  await expect(page.getByText(/1,234,567,890,120,000\.74/)).toBeVisible();
  await page.goto("/finance/planning?fx_USD=1000000");
  await page.getByRole("button", { name: f.monthlyCash, exact: false }).click();
  await expect(page.getByRole("table", { name: f.cashProjection })).toContainText("1,234,567,900,220,434.78");
  await page.goto("/finance?fx_USD=1000000");
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://127.0.0.1:3100" }]); await page.reload();
  await expect(page.getByRole("button", { name: new RegExp(`^${uk.Finance.overview.cash}`) })).toContainText("1 234 567 900 160 554,78");
});
