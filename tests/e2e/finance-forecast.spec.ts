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
const actors = ["admin", "employee"].map(role => ({ role, id: "", email: `forecast-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` }));
const t = en.Finance.forecast;
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
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${bank}','${studio}','Bank','UAH',1000,'${actors[0].id}');
    select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.finalize_finance_setup('${studio}');`);
  category = sql(`select id from public.finance_categories where studio_id='${studio}' and default_key='project_payments'`);
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);
    do $$declare item uuid; begin
      item:=public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','100000','currency','UAH','categoryId','${category}','description','Contract receipt','dueDate',(now() at time zone 'Europe/Kyiv')::date,'expectedDate',(now() at time zone 'Europe/Kyiv')::date,'commitment','agreed','certainty','fixed'));
      perform public.record_finance_expected_payment('${studio}',gen_random_uuid(),item,jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','40000','accountId','${bank}','categoryId','${category}'),40000);
      perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','100','currency','UAH','categoryId','${category}','description','Tentative receipt','expectedDate',(now() at time zone 'Europe/Kyiv')::date,'commitment','tentative','certainty','estimated'));
      perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','75','currency','UAH','categoryId','${category}','description','Undated receipt','commitment','agreed','certainty','fixed'));
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
test("annual revisions, scenarios, horizons, attention and stable snapshot comparison", async ({ page }, testInfo) => {
  const pageErrors: string[] = []; page.on("pageerror", error => pageErrors.push(error.message));
  await login(page); await page.goto("/finance/planning");
  await expect(page.getByRole("heading", { name: t.title, exact: true })).toBeVisible();
  await expect(page.getByText(t.incomplete, { exact: true })).toBeVisible();
  await expect(page.getByText(t.issues.undated, { exact: false })).toBeVisible();
  const comparison = page.getByRole("table", { name: t.comparison });
  await expect(comparison.getByRole("cell", { name: "40,000.00", exact: true })).toBeVisible();
  await expect(comparison.getByRole("cell", { name: "60,000.00", exact: true })).toBeVisible();
  await page.getByLabel(t.category, { exact: true }).selectOption(category);
  await page.getByLabel(t.repeatAmount, { exact: true }).fill("100000"); await page.getByRole("button", { name: t.fillYear, exact: true }).click();
  await expect(page.locator('input[name="months"]')).toHaveCount(12);
  await page.getByLabel(t.revisionNote, { exact: true }).fill("Approved reference"); await page.getByRole("button", { name: t.approveBudget, exact: true }).click();
  await expect(page.getByText(t.budgetSaved, { exact: true })).toBeVisible();
  expect(sql(`select count(*) from public.finance_movements where studio_id='${studio}'`)).toBe("1");
  expect(sql(`select count(*) from public.finance_expected_items where studio_id='${studio}'`)).toBe("3");
  await expect(page.getByText("Revision 1", { exact: false }).first()).toBeVisible();
  await page.getByLabel(t.repeatAmount, { exact: true }).fill("150000"); await page.getByRole("button", { name: t.fillYear, exact: true }).click();
  await page.getByLabel(t.revisionNote, { exact: true }).fill("Deliberate amendment"); await page.getByRole("button", { name: t.approveBudget, exact: true }).click();
  await expect(page.getByText("Revision 2", { exact: false }).first()).toBeVisible();
  expect(sql(`select count(*) from public.finance_budget_revisions where studio_id='${studio}'`)).toBe("2");
  await page.getByText(t.budgetHistory, { exact: true }).click(); await expect(page.getByText(/Approved reference/)).toBeVisible();
  await page.getByLabel(t.scenario, { exact: true }).selectOption("planned"); await page.getByLabel(t.horizon, { exact: true }).selectOption("3"); await page.getByRole("button", { name: t.apply, exact: true }).click();
  await expect(page).toHaveURL(/horizon=3/);
  await expect(comparison.getByRole("cell", { name: "60,100.00", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: t.cashProjection }).locator("tbody tr")).toHaveCount(3);
  for (const horizon of ["12", "year", "6"]) {
    await page.getByLabel(t.horizon, { exact: true }).selectOption(horizon); await page.getByRole("button", { name: t.apply, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`horizon=${horizon}`));
    if (horizon !== "year") await expect(page.getByRole("table", { name: t.cashProjection }).locator("tbody tr")).toHaveCount(Number(horizon));
  }
  await page.getByLabel(t.snapshotName, { exact: true }).fill("Month close expectations"); await page.getByRole("button", { name: t.saveSnapshot, exact: true }).click();
  await expect(page.getByRole("heading", { name: /Month close expectations/ })).toBeVisible();
  const frozen = sql(`select forecast from public.finance_forecast_snapshots where studio_id='${studio}'`);
  // A later cash event on the SAME day must be included in saved-vs-actual comparison.
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','50','accountId','${bank}','categoryId','${category}'));`);
  await page.reload(); await expect(page.getByRole("cell", { name: "50.00", exact: true })).toBeVisible();
  expect(sql(`select forecast from public.finance_forecast_snapshots where studio_id='${studio}'`)).toBe(frozen);
  const savedUrl = page.url();
  await page.goto(`${savedUrl}&fx_USD=0`);
  await expect(page.getByRole("alert").filter({ hasText: t.invalidManualFx })).toBeVisible();
  await page.goto(savedUrl);
  await page.screenshot({ path: testInfo.outputPath("finance-planning-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 }); await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://127.0.0.1:3100" }]); await page.reload();
  await expect(page.getByRole("heading", { name: uk.Finance.forecast.title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("finance-planning-mobile.png"), fullPage: true });
  expect(pageErrors).toEqual([]);
});
test("employee cannot access cash planning", async ({ page }) => {
  await login(page, 1); await page.goto("/finance/planning"); await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: t.title, exact: true })).toHaveCount(0);
});
