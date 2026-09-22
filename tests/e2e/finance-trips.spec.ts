import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";
const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["127.0.0.1", "localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local fixtures only");
const client = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studio = randomUUID(), project = randomUUID(), bank = randomUUID();
const actors = ["admin", "employee"].map(role => ({ role, id: "", email: `trip-${randomUUID()}@example.test`, password: `Trip-${randomUUID()}` }));
function sql(statement: string) { return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim(); }
test.beforeAll(async () => {
  await client.from("studios").insert({ id: studio, name: "Trip browser fixture" }).throwOnError();
  for (const actor of actors) {
    const r = await client.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
    if (r.error) throw r.error; actor.id = r.data.user.id;
    await client.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: `Trip ${actor.role}`, system_role: actor.role, is_active: true }).throwOnError();
    await client.from("studio_members").insert({ studio_id: studio, user_id: actor.id, system_role: actor.role }).throwOnError();
  }
  sql(`insert into finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','UAH','2026-09-01','${actors[0].id}');
  insert into finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${bank}','${studio}','Trip bank','UAH',0,'${actors[0].id}');
  select set_config('request.jwt.claim.sub','${actors[0].id}',false); select finalize_finance_setup('${studio}');
  insert into projects(id,studio_id,name,total_area_m2,start_date,status,created_by) values('${project}','${studio}','Dental Warsaw',100,'2026-09-01','active','${actors[0].id}');`);
});
test.afterAll(async () => {
  sql(`begin; set local session_replication_role=replica;
  do $$ declare tab record; begin for tab in select table_name from information_schema.columns where table_schema='public' and column_name='studio_id' and table_name like 'finance_%' and table_name in(select tablename from pg_tables where schemaname='public') loop execute format('delete from public.%I where studio_id=$1',tab.table_name) using '${studio}'::uuid; end loop; end $$;
  delete from calendar_event_participants where event_id in(select id from calendar_events where studio_id='${studio}'); delete from calendar_events where studio_id='${studio}'; delete from project_members where project_id='${project}'; delete from notifications where studio_id='${studio}'; delete from project_activity where project_id='${project}'; delete from project_task_stage_columns where project_id='${project}'; delete from projects where studio_id='${studio}'; delete from studio_members where studio_id='${studio}'; delete from studios where id='${studio}'; commit;`);
  for (const actor of actors) if (actor.id) await client.auth.admin.deleteUser(actor.id);
});

test("trip planning, personal costs, advance, return and matched cash render in EN/UK", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const t = en.Finance.trips, f = en.Finance;
  await page.goto("/login"); await page.locator('input[type="email"]').fill(actors[0].email); await page.locator('input[type="password"]').fill(actors[0].password); await page.locator('button[type="submit"]').click(); await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/finance"); await page.getByRole("button", { name: f.manageFinance }).click(); await page.getByRole("menuitem", { name: t.title }).click();
  await page.getByRole("button", { name: t.addTrip }).click(); const dialog = page.getByRole("dialog");
  await dialog.getByLabel(t.name).fill("Warsaw · site visit"); await dialog.getByLabel(t.destination).fill("Warsaw");
  await dialog.getByRole("checkbox", { name: "Trip admin" }).check(); await dialog.getByRole("checkbox", { name: "Trip employee" }).check();
  await dialog.getByRole("combobox", { name: t.project }).click(); await page.getByRole("option", { name: "Dental Warsaw", exact: true }).click();
  await dialog.getByRole("button", { name: f.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page).toHaveURL(/\/finance\/trips\/[\w-]+$/);
  const href = page.url(), tripId = z.uuid().parse(new URL(href).pathname.split("/").at(-1));
  await page.getByRole("button", { name: f.edit, exact: true }).click(); await dialog.getByLabel(t.name).fill("Warsaw · inspection"); await dialog.getByRole("button", { name: f.planning.save, exact: true }).click(); await expect(page.getByRole("heading", { name: "Warsaw · inspection" })).toBeVisible();
  await page.getByRole("button", { name: t.addPlan }).click(); await dialog.getByLabel(f.movements.amount, { exact: true }).fill("26000"); await dialog.getByRole("button", { name: f.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: t.addExpense }).click(); await dialog.getByRole("combobox", { name: t.paidBy }).click(); await page.getByRole("option", { name: "Trip employee", exact: true }).click();
  await dialog.getByLabel(f.movements.amount, { exact: true }).fill("18400"); await dialog.getByRole("button", { name: f.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from finance_movements where studio_id='${studio}'`)).toBe("0");
  await expect(page.getByText(t.toReimburse, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: t.issueAdvance, exact: true }).click(); await dialog.getByRole("combobox", { name: t.traveler, exact: true }).click(); await page.getByRole("option", { name: "Trip employee", exact: true }).click(); await dialog.getByLabel(f.movements.amount, { exact: true }).fill("20000"); await dialog.getByRole("button", { name: f.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: f.edit, exact: true }).click(); await dialog.getByRole("combobox", { name: t.status, exact: true }).click(); await page.getByRole("option", { name: t.statuses.completed, exact: true }).click(); await dialog.getByRole("button", { name: f.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  await expect(page.getByText(t.toReturn, { exact: true }).first()).toBeVisible(); expect(sql(`select recorded_balance from finance_account_balances where id='${bank}'`)).toBe("-20000");
  await page.screenshot({ path: testInfo.outputPath("trip-desktop-en-light.png"), fullPage: true });
  await page.getByRole("link", { name: t.recordReturn, exact: true }).click();
  await expect(dialog).toBeVisible(); await dialog.getByRole("button", { name: f.movements.record, exact: true }).click(); await expect(page).toHaveURL(href); await expect(page.getByText(t.nothingDue)).toBeVisible();
  // Per diem uses one traveler and the visible trip day count.
  await page.getByRole("button", { name: t.addExpense }).click(); await dialog.getByRole("combobox", { name: t.expenseType }).click(); await page.getByRole("option", { name: t.types.meals, exact: true }).click();
  await dialog.getByRole("combobox", { name: t.paidBy }).click(); await page.getByRole("option", { name: "Trip employee", exact: true }).click(); await dialog.getByRole("checkbox", { name: t.perDiem }).check(); await dialog.getByRole("checkbox", {name:"Trip admin",exact:true}).uncheck(); await dialog.getByLabel(t.dailyRate, { exact: true }).fill("800"); await dialog.getByLabel(t.days, { exact: true }).fill("4"); await expect(dialog.getByLabel(f.movements.amount, { exact: true })).toHaveValue("3200.00"); await dialog.getByRole("button", { name: f.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  const today = sql("select (now() at time zone 'Europe/Kyiv')::date");
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false); select record_finance_movement('${studio}','${randomUUID()}',jsonb_build_object('kind','outgoing','date','${today}','accountId','${bank}','amount','100','description','Hotel receipt','categoryId',(select id from finance_categories where studio_id='${studio}' and default_key='business_travel')));`);
  await page.reload(); await page.getByRole("button", { name: t.addExpense }).click(); await dialog.getByRole("combobox", { name: t.payment, exact: true }).click(); await page.getByRole("option", { name: t.matchPayment, exact: true }).click(); await dialog.getByRole("combobox", { name: t.existingPayment }).click(); await page.getByRole("option", { name: /Hotel receipt/ }).click(); await dialog.getByRole("button", { name: f.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from finance_movements where studio_id='${studio}'`)).toBe("3");
  await page.goto(`/projects/${project}?view=finance`); await expect(page.getByRole("heading", { name: t.title })).toBeVisible(); await expect(page.getByText(t.projectTotal, { exact: false })).toBeVisible();
  expect(sql(`select count(*) from finance_project_items where studio_id='${studio}'`)).toBe("0");
  await page.goto(href); await page.context().addCookies([{ name: "studioflow-locale", value: "uk", domain: "127.0.0.1", path: "/" }]); await page.reload();
  await page.evaluate(() => { document.documentElement.classList.add("dark"); document.documentElement.setAttribute("data-theme", "dark"); });
  await page.setViewportSize({ width: 390, height: 844 }); await expect(page.getByRole("button", { name: uk.Finance.trips.addExpense })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("trip-mobile-uk-dark.png"), fullPage: true });
  await page.getByRole("button", { name: uk.Finance.trips.addExpense }).click(); await expect(dialog).toBeVisible(); await page.screenshot({ path: testInfo.outputPath("expense-mobile-uk-dark.png") }); await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(page.getByRole("button", { name: uk.Finance.trips.addExpense })).toBeFocused();
  expect(sql(`select count(*) from finance_trip_entries where trip_id='${tripId}'`)).toBe("5");
});

test("Calendar trip planning, native currencies, coverage and current FX", async ({page},testInfo)=>{
  test.setTimeout(180_000);
  const t=en.Finance.trips,f=en.Finance;
  sql(`insert into project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values('${project}','${actors[0].id}','designer',0,current_date),('${project}','${actors[1].id}','designer',0,current_date); update projects set city='Warsaw',country_code='PL' where id='${project}';`);
  await page.goto("/login");await page.locator('input[type="email"]').fill(actors[0].email);await page.locator('input[type="password"]').fill(actors[0].password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
  const created=await page.request.post("/api/calendar/events",{data:{title:"Calendar trip",eventType:"business_trip",projectId:project,allDay:true,startsAt:"2026-10-24T00:00:00+03:00",endsAt:"2026-10-27T00:00:00+02:00",participantIds:actors.map(a=>a.id)}});
  expect(created.status()).toBe(201);
  const eventId=sql(`select id from calendar_events where studio_id='${studio}' and event_type='business_trip'`);
  const tripId=sql(`select id from finance_trips where calendar_source_id='${eventId}'`);
  expect(tripId).toMatch(/^[\w-]{36}$/);
  await page.setViewportSize({width:2560,height:1440});
  await page.goto(`/calendar?date=2026-10-24&event=${eventId}`);
  await expect(page.getByRole("link",{name:en.Calendar.tripFinance})).toBeVisible();
  await page.screenshot({animations:"disabled",path:testInfo.outputPath("calendar-trip-2k-en.png")});
  await page.getByRole("link",{name:en.Calendar.tripFinance}).click();await expect(page).toHaveURL(new RegExp(`/finance/trips/${tripId}$`));
  await expect(page.getByRole("button",{name:t.openPlan})).toHaveText("—");await expect(page.getByText(t.noPlan,{exact:true}).first()).toBeVisible();
  await page.screenshot({animations:"disabled",path:testInfo.outputPath("trip-no-plan-2k-en.png"),fullPage:true});
  const href=`/finance/trips/${tripId}?fx_PLN=10&fx_USD=40`;
  await page.goto(href);await page.setViewportSize({width:1920,height:1080});
  await page.getByRole("button",{name:t.types.accommodation,exact:true}).click();const dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("combobox",{name:f.movements.account,exact:true})).toHaveCount(0);
  await dialog.getByLabel(f.movements.amount,{exact:true}).fill("1200");await dialog.getByRole("combobox",{name:t.currency,exact:true}).click();await page.getByRole("option",{name:"PLN",exact:true}).click();
  await expect(dialog.getByText(/1200 PLN ≈ 12000.00 UAH/)).toBeVisible();await dialog.getByRole("button",{name:f.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:t.types.meals,exact:true}).click();await dialog.getByRole("checkbox",{name:t.perDiem,exact:true}).check();await dialog.getByLabel(t.dailyRate,{exact:true}).fill("50");
  await dialog.getByRole("combobox",{name:t.currency,exact:true}).click();await page.getByRole("option",{name:"USD",exact:true}).click();
  await expect(dialog.getByLabel(t.days,{exact:true})).toHaveValue("3");await expect(dialog.getByLabel(f.movements.amount,{exact:true})).toHaveValue("300.00");
  await page.screenshot({animations:"disabled",path:testInfo.outputPath("per-diem-two-travelers-en.png")});
  await dialog.getByRole("checkbox",{name:"Trip admin",exact:true}).uncheck();await expect(dialog.getByLabel(f.movements.amount,{exact:true})).toHaveValue("150.00");
  await dialog.getByRole("checkbox",{name:"Trip admin",exact:true}).check();await dialog.getByRole("checkbox",{name:t.includeForecast,exact:true}).check();await dialog.getByRole("button",{name:f.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from finance_trip_entries where trip_id='${tripId}' and kind='plan' and fx_rate is null`)).toBe("2");
  await expect(page.getByRole("button",{name:t.openPlan})).toContainText("24,000.00");
  await page.getByRole("heading",{name:/Business trip/}).scrollIntoViewIfNeeded();
  await page.screenshot({animations:"disabled",path:testInfo.outputPath("multicurrency-plan-fullhd-en.png"),fullPage:true});
  const planId=sql(`select id from finance_trip_entries where trip_id='${tripId}' and currency='USD'`);
  const beforeCash=sql(`select count(*) from finance_movements where studio_id='${studio}'`);
  await page.getByRole("button",{name:t.issueAdvance,exact:true}).click();await expect(dialog.getByRole("checkbox",{name:t.perDiem,exact:true})).toHaveCount(0);await page.keyboard.press("Escape");
  await page.getByRole("button",{name:t.addExpense,exact:true}).click();await dialog.getByRole("combobox",{name:t.paidBy,exact:true}).click();await page.getByRole("option",{name:"Trip employee",exact:true}).click();
  await dialog.getByLabel(f.movements.amount,{exact:true}).fill("11000");await dialog.getByRole("combobox",{name:t.replacesPlan,exact:true}).click();await page.getByRole("option",{name:/300.*USD/}).click();await dialog.getByRole("button",{name:f.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from finance_movements where studio_id='${studio}'`)).toBe(beforeCash);
  expect(sql(`select commitment from finance_expected_items where id=(select expected_item_id from finance_trip_entries where id='${planId}')`)).toBe("cancelled");
  await page.goto(`/finance/trips/${tripId}?fx_PLN=11&fx_USD=41`);await expect(page.getByRole("button",{name:t.openPlan})).toContainText("25,500.00");
  expect(sql(`select reporting_amount from finance_trip_entries where trip_id='${tripId}' and kind='expense'`)).toBe("11000.00");
  await page.context().addCookies([{name:"studioflow-locale",value:"uk",domain:"127.0.0.1",path:"/"}]);await page.reload();await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.documentElement.classList.add("dark");document.documentElement.setAttribute("data-theme","dark");});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({animations:"disabled",path:testInfo.outputPath("calendar-plan-mobile-uk-dark.png"),fullPage:true});
  await page.getByRole("button",{name:uk.Finance.trips.openPlan}).click();await page.getByRole("button",{name:uk.Finance.trips.types.meals,exact:true}).click();await dialog.getByRole("checkbox",{name:uk.Finance.trips.perDiem,exact:true}).check();await dialog.getByRole("checkbox",{name:"Trip admin",exact:true}).uncheck();await dialog.getByLabel(uk.Finance.trips.dailyRate,{exact:true}).fill("50");
  await page.screenshot({animations:"disabled",path:testInfo.outputPath("per-diem-subset-mobile-uk-dark.png")});await page.keyboard.press("Escape");
  await page.goto("/finance/trips?fx_PLN=11&fx_USD=41");await expect(page.getByText(uk.Finance.trips.variance,{exact:true}).first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>{document.documentElement.classList.add("dark");document.documentElement.setAttribute("data-theme","dark");});await page.screenshot({animations:"disabled",path:testInfo.outputPath("trip-list-mobile-uk-dark.png"),fullPage:true});
});

test("employee cannot open trips", async ({ page }) => {
  await page.goto("/login"); await page.locator('input[type="email"]').fill(actors[1].email); await page.locator('input[type="password"]').fill(actors[1].password); await page.locator('button[type="submit"]').click(); await expect(page).toHaveURL(/\/dashboard/); await page.goto("/finance/trips"); await expect(page).toHaveURL(/\/dashboard/);
});
