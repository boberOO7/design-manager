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
const studio = randomUUID(), bank = randomUUID(), dollars = randomUUID();
const actors = ["admin", "employee"].map(role => ({ role, id: "", email: `opening-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` }));
const t = en.Finance;
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
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','UAH','1900-01-01','${actors[0].id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${bank}','${studio}','Bank','UAH',1000,'${actors[0].id}'),('${dollars}','${studio}','Legacy dollars','USD',5000,'${actors[0].id}');
    begin; alter table public.finance_settings disable trigger guard_finance_opening_finalization;
    update public.finance_settings set finalized_at=now(),finalized_by='${actors[0].id}' where studio_id='${studio}';
    alter table public.finance_settings enable trigger guard_finance_opening_finalization;commit;`);
  category = sql(`select id from public.finance_categories where studio_id='${studio}' and default_key='project_payments'`);
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
test("legacy opening valuation: missing NBU, explicit manual completion, frozen history and mobile access", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await login(page); await page.goto("/finance?fx_USD=40");
  const initial = sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.get_finance_overview('${studio}')->>'historyIncomplete'`).split("\n").at(-1);
  expect(initial).toBe("true");
  await page.goto("/finance/accounts");
  await expect(page.getByText(t.openingFx.legacy, { exact: true })).toBeVisible();
  await expect(page.getByText(t.openingFx.missing, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: t.openingFx.named.replace("{name}", "Legacy dollars"), exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('select[name="fxMode"]')).toHaveValue("nbu");
  await expect(dialog).toContainText("1900-01-01");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: t.openingFx.save, exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(t.openingFx.unavailable, { timeout: 15000 });
  expect(sql(`select opening_reporting_amount is null from public.finance_accounts where id='${dollars}'`)).toBe("t");
  await dialog.locator('select[name="fxMode"]').selectOption("manual");
  await dialog.locator('input[name="manualRate"]').fill("0");
  await dialog.getByRole("button", { name: t.openingFx.save, exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(t.openingFx.invalid);
  await dialog.locator('input[name="manualRate"]').fill("39.25");
  await dialog.getByRole("button", { name: t.openingFx.save, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(t.openingFx.missing, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: t.openingFx.named.replace("{name}", "Legacy dollars"), exact: true })).toHaveCount(0);
  expect(sql(`select concat(opening_balance,'|',opening_reporting_amount,'|',opening_fx_rate,'|',opening_fx_source,'|',opening_fx_effective_date) from public.finance_accounts where id='${dollars}'`)).toBe("5000|196250.00|39.25|manual|1900-01-01");
  expect(sql(`select count(*) from public.finance_movements where studio_id='${studio}'`)).toBe("0");
  await page.goto("/finance?fx_USD=40"); await page.getByText(t.overview.chartData, { exact: true }).click();
  await expect(page.getByRole("table", { name: t.overview.cashChart })).toContainText("197,250.00");
  await expect(page.getByRole("button", { name: new RegExp(`^${t.overview.cash}`) })).toContainText("201,000.00");
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','10','accountId','${dollars}','categoryId','${category}','fx',jsonb_build_object('rate','41','source','manual','effectiveDate',(now() at time zone 'Europe/Kyiv')::date)));`);
  await page.goto("/finance?fx_USD=50"); await page.getByText(t.overview.chartData, { exact: true }).click();
  await expect(page.getByRole("table", { name: t.overview.cashChart })).toContainText("197,660.00");
  await expect(page.getByRole("button", { name: new RegExp(`^${t.overview.netFlow}`) })).toContainText("410.00");
  await page.goto("/finance/accounts");
  await page.setViewportSize({ width: 375, height: 900 }); await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://127.0.0.1:3100" }]); await page.reload();
  await page.getByText(new RegExp(`^${uk.Finance.openingFx.value}`)).click();
  await expect(page.getByText(/39.25 UAH/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("opening-valuation-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});
test("employee cannot access opening valuation", async ({ page }) => {
  await login(page, 1); await page.goto("/finance/accounts"); await expect(page).toHaveURL(/\/dashboard/);
});
