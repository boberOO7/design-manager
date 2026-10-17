import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";
import { signInLocalTestUser } from "../helpers/auth";
const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["127.0.0.1", "localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local Finance fixtures only");
const client = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studio = randomUUID(), bank = randomUUID();
const actors = ["admin", "employee"].map(role => ({ role, id: "", email: `overview-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` }));
const setupStudio = randomUUID();
const setupActor = { id: "", email: `overview-setup-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` };
const t = en.Finance.overview;
const d = t.dashboard;
const f = en.Finance.forecast;
const foreign = randomUUID(), secondBank = randomUUID();
function sql(statement: string) { return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim(); }
async function login(page: Page, index = 0) { await signInLocalTestUser(page, actors[index]); }
let category = "";
test.beforeAll(async () => {
  await client.from("studios").insert([{ id: studio, name: "Forecast browser test" }, { id: setupStudio, name: "Finance setup acceptance" }]).throwOnError();
  const setup = await client.auth.admin.createUser({ email: setupActor.email, password: setupActor.password, email_confirm: true, user_metadata: { finance_display_currency: "UAH" } });
  if (setup.error) throw setup.error;
  setupActor.id = setup.data.user.id;
  await client.from("profiles").upsert({ id: setupActor.id, email: setupActor.email, full_name: "Finance setup admin", system_role: "admin", is_active: true }).throwOnError();
  await client.from("studio_members").insert({ studio_id: setupStudio, user_id: setupActor.id, system_role: "admin" }).throwOnError();
  for (const actor of actors) {
    const { data, error } = await client.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true, user_metadata: { finance_display_currency: "UAH" } }); if (error) throw error; actor.id = data.user.id;
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
  for (const fixtureStudio of [studio, setupStudio]) {
  sql(`begin;set local session_replication_role=replica;
    delete from private.finance_labor_membership_events where studio_id='${fixtureStudio}';
    delete from public.finance_report_coverage where studio_id='${fixtureStudio}';delete from public.finance_recognition_entries where studio_id='${fixtureStudio}';delete from public.projects where studio_id='${fixtureStudio}';
    delete from public.finance_forecast_snapshots where studio_id='${fixtureStudio}';delete from public.finance_budget_revisions where studio_id='${fixtureStudio}';
    delete from public.finance_allocations where studio_id='${fixtureStudio}';delete from public.finance_expected_items where studio_id='${fixtureStudio}';
    delete from public.finance_planning_requests where studio_id='${fixtureStudio}';delete from public.finance_movement_entries where studio_id='${fixtureStudio}';delete from public.finance_movements where studio_id='${fixtureStudio}';
    delete from public.finance_accounts where studio_id='${fixtureStudio}';delete from public.finance_categories where studio_id='${fixtureStudio}';delete from public.finance_settings where studio_id='${fixtureStudio}';
    delete from public.notifications where studio_id='${fixtureStudio}';delete from public.studio_members where studio_id='${fixtureStudio}';delete from public.studios where id='${fixtureStudio}';commit;`);
  }
  for (const actor of [...actors, setupActor]) if (actor.id) { const { error } = await client.auth.admin.deleteUser(actor.id); if (error) throw error; }
});
test("cash overview separates actuals, future payments, overdue obligations and missing dates", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await login(page); await page.goto("/finance?fx_USD=40");
  await expect(page.getByTestId("overview-balance")).toContainText("40,898.00");
  await expect(page.getByTestId("actual-received")).toContainText("+40,390.00");
  await expect(page.getByTestId("actual-spent")).toContainText("−502.00");
  await expect(page.getByTestId("actual-net")).toContainText("+39,888.00");
  await expect(page.getByTestId("finance-analytics")).toHaveCount(0);
  await expect(page.getByTestId("upcoming-incoming")).toContainText("60,000.00");
  await expect(page.getByTestId("upcoming-net")).toContainText("+60,000.00");
  await expect(page.getByTestId("overview-economics")).toBeVisible();
  await expect(page.getByTestId("upcoming-outgoing")).not.toContainText("Overdue rent");
  await expect(page.getByTestId("overdue-outgoing")).toContainText("120.00");
  await page.getByTestId("overdue-outgoing").getByRole("button", {name:d.viewOverdue}).click();
  await page.getByRole("link", {name:"Overdue rent",exact:true}).click();
  await expect(page).toHaveURL(/\/finance\/expected\?item=/);
  await page.goto("/finance?fx_USD=40");
  await page.getByRole("button",{name:d.accounts,exact:true}).click();
  await expect(page.getByRole("dialog", {name:d.accounts,exact:true})).toContainText("10.00 USD");
  await page.keyboard.press("Escape");
  const unscheduled = page.getByTestId("attention-unscheduled");
  await unscheduled.getByRole("button").first().click();
  await unscheduled.getByRole("button",{name:"Undated receipt",exact:true}).click();
  await expect(unscheduled.getByRole("link",{name:"Undated receipt",exact:true})).toBeVisible();
  const chart = page.getByTestId("overview-dynamics");
  await expect(page.getByTestId("overview-forecast")).toHaveCount(0);
  await chart.getByRole("button",{name:t.chartData,exact:true}).click();
  const table = page.getByRole("table",{name:d.dynamics,exact:true});
  await expect(table).toContainText("40,390.00");
  await expect(table).toContainText("502.00");
  await expect(table).toContainText("39,888.00");
  await expect(page.getByTestId("finance-cash").getByRole("navigation",{name:d.moreFinance})).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("historical period, currency and monthly chart controls remain independent", async ({page}, testInfo) => {
  await login(page); await page.goto("/finance?fx_USD=40");
  const actual = page.getByTestId("overview-actual");
  await expect(actual.getByRole("link",{name:d.periods.month,exact:true})).toHaveAttribute("aria-current","page");
  await actual.getByRole("link",{name:d.periods["3"],exact:true}).click();
  await expect(page).toHaveURL(/period=3/);
  const chart = page.getByTestId("overview-dynamics");
  await chart.getByRole("button",{name:d.months.replace("{count}","12"),exact:true}).click();
  await expect(chart.locator("[data-point]")).toHaveCount(12);
  const point = chart.locator("[data-point]").last();
  await point.focus();
  await expect(page.getByTestId("monthly-cash-tooltip")).toContainText("39,888.00");
  await page.keyboard.press("ArrowLeft");
  await expect(chart.locator('[data-point="10"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(actual.getByRole("link",{name:d.periods["3"],exact:true})).toHaveAttribute("aria-current","page");
  await expect(page.getByTestId("overview-balance")).toContainText("40,898.00");
  const control = page.getByRole("combobox",{name:en.Finance.displayCurrency,exact:true});
  await control.click(); await page.getByRole("option",{name:"USD",exact:true}).click();
  await expect(page.getByTestId("overview-balance")).toContainText("USD");
  await control.click(); await page.getByRole("option",{name:"UAH",exact:true}).click();
  await expect(page.getByTestId("overview-balance")).toContainText("40,898.00");
  for (const [label,width,height,theme] of [["desktop",1440,1000,"light"],["laptop",1280,800,"dark"]] as const) {
    await page.setViewportSize({width,height}); await page.emulateMedia({colorScheme:theme,reducedMotion:"reduce"});
    await page.locator("html").evaluate((element, theme) => element.setAttribute("data-theme", theme), theme);
    await page.locator("main").evaluate(element => {element.scrollTop=0;});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`${label}-top.png`)});
    await page.getByTestId("overview-dynamics").scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath(`${label}-dynamics.png`)});
  }
});
test("draft setup finalizes through Finance and locks finalized account openings", async ({ page }) => {
  await signInLocalTestUser(page, setupActor);
  await page.goto("/finance");
  const settings = en.Finance;
  await expect(page.getByRole("heading", { name: settings.title, exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: settings.baseCurrency, exact: true }).click();
  await page.getByRole("option", { name: "UAH", exact: true }).click();
  await page.getByRole("button", { name: settings.saveSettings }).click();
  await expect(page.getByRole("button", { name: settings.reviewFinalize })).toBeDisabled();
  await page.getByRole("button", { name: settings.addAccount, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(settings.accountName, { exact: true }).fill("Acceptance bank");
  await dialog.getByLabel(settings.openingBalance, { exact: true }).fill("1234.567");
  await dialog.getByRole("button", { name: settings.saveAccount }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel(settings.openingBalance, { exact: true }).fill("1234.56");
  await dialog.getByRole("button", { name: settings.saveAccount }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: settings.reviewFinalize }).click();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: settings.finalize, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: t.title, exact: true })).toBeVisible();
  await expect(page.locator("#main-content").getByTestId("finance-cash")).toContainText("1,234.56");
  expect(sql(`select base_currency || ':' || (finalized_at is not null) from public.finance_settings where studio_id='${z.uuid().parse(setupStudio)}';`)).toBe("UAH:true");
  await page.goto("/finance/accounts");
  await page.getByRole("button", { name: settings.balance.actionsFor.replace("{name}", "Acceptance bank"), exact: true }).click();
  await page.getByRole("menuitem", { name: settings.edit, exact: true }).click();
  await expect(dialog.getByLabel(settings.openingBalance, { exact: true })).toHaveAttribute("readonly");
  await expect(dialog.getByRole("textbox", { name: settings.currency, exact: true })).toHaveAttribute("readonly");
  await expect(dialog.getByRole("textbox", { name: settings.currency, exact: true })).toHaveValue("UAH");
  await dialog.getByRole("button", { name: settings.close, exact: true }).click();
});

test("employee cannot access Overview or Accounts", async ({ page }) => {
  await login(page, 1);
  for (const route of ["/finance", "/finance/accounts"]) { await page.goto(route); await expect(page).toHaveURL(/\/dashboard/); }
  const employee = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, z.string().min(1).parse(process.env.EQUIPMENT_TEST_PUBLISHABLE_KEY), { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await employee.auth.signInWithPassword(actors[1]);
  if (signedIn.error) throw signedIn.error;
  const denied = await employee.rpc("finalize_finance_setup", { p_studio_id: studio });
  expect(denied.error?.message).toContain("finance_admin_required");
});

test("large decimal amounts stay exact in cards, chart tables, drilldowns and stored valuations", async ({ page }) => {
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);
    select public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','1234567890.12','accountId','${foreign}','categoryId','${category}','fx',jsonb_build_object('rate','1000000.0000000006','source','manual','effectiveDate',(now() at time zone 'Europe/Kyiv')::date)));
    select public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','56.78','accountId','${bank}','categoryId','${category}'));`);
  await login(page); await page.goto("/finance?fx_USD=1000000");
  const cash = page.getByTestId("overview-balance");
  await expect(cash).toContainText("1,234,567,900,160,554.78");
  await page.getByRole("button", { name: d.accounts, exact: true }).click();
  const breakdown = page.getByRole("dialog",{name:d.accounts,exact:true});
  await expect(breakdown).toContainText("1,234,567,900,120,000.00");
  await expect(cash).toContainText("1,234,567,900,160,554.78");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: d.dynamics })).toHaveCount(0);
  await expect(page.getByText(t.chartScale, { exact: true }).first()).toBeVisible();
  const chart = page.getByRole("table", { name: d.dynamics }); // Opens automatically when coordinates are unsafe.
  await expect(chart).toBeVisible();
  await expect(chart).toContainText("1,234,567,890,159,945.52");
  await expect(page.getByTestId("actual-net")).toContainText("1,234,567,890,159,945.52"); // Net flow remains exact after owner distribution and transfer fee.
  await page.goto("/finance/movements");
  for (const detail of await page.locator("details").all()) await detail.evaluate(el => el.setAttribute("open", ""));
  await expect(page.getByText(/1,234,567,890,120,000\.74/)).toBeVisible();
  await page.goto("/finance/planning?fx_USD=1000000");
  await page.getByRole("button", { name: f.monthlyCash, exact: false }).click();
  await expect(page.getByRole("table", { name: f.cashProjection })).toContainText("1,234,567,900,220,434.78");
  await page.goto("/finance?fx_USD=1000000");
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: new URL(page.url()).origin }]); await page.reload();
  await expect(page.getByTestId("overview-balance")).toContainText("1 234 567 900 160 554,78");
});
