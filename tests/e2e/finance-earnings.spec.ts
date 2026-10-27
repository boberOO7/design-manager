import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import uk from "../../messages/uk.json";
import { signInLocalTestUser } from "../helpers/auth";

const env = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(env.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local earning fixtures only");
const service = createClient<Database>(env.EQUIPMENT_TEST_SUPABASE_URL, env.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false } });
const studioId = randomUUID(), projectId = randomUUID(), accountId = randomUUID();
const actor = { id: "", email: `earning-${randomUUID()}@example.test`, password: `Earning-${randomUUID()}` };
let orderId = "", concurrentMilestone = "";
const e = uk.Finance.earnings;
test.use({ timezoneId: "Europe/Kyiv" });
function sql(input: string) {
  return execFileSync("psql", ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-Atq"], {
    input, encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres" },
  }).trim();
}

test.beforeAll(async () => {
  const user = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true, user_metadata: { finance_display_currency: "UAH" } });
  if (user.error) throw user.error; actor.id = user.data.user.id;
  await service.from("studios").insert({ id: studioId, name: "Earning browser fixture" }).throwOnError();
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Earning admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studioId, user_id: actor.id, system_role: "admin" }).throwOnError();
  sql(`begin;
    insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studioId}','UAH',date_trunc('month',now() at time zone 'Europe/Kyiv')::date,'${actor.id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${accountId}','${studioId}','Bank','UAH',0,'${actor.id}');
    select set_config('request.jwt.claim.sub','${actor.id}',true);
    select public.finalize_finance_setup('${studioId}');
    select public.activate_finance_recognition('${studioId}',gen_random_uuid(),date_trunc('month',now() at time zone 'Europe/Kyiv')::date);
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values('${projectId}','${studioId}','Earning workflow',100,date_trunc('month',now() at time zone 'Europe/Kyiv')::date,'${actor.id}','active');
    select public.save_finance_project_plan('${studioId}',gen_random_uuid(),'${projectId}',jsonb_build_object('revision',0,'pricingMethod','fixed','amount','1000','currency','UAH','vatRate','20','priceBasis','net','reason','Signed contract','known','[]'::jsonb,'items',jsonb_build_array(jsonb_build_object('id','','name','Advance','amount','1000','dueDate',null,'expectedDate',null))));
    commit;`);
  orderId = sql(`select id from public.finance_project_orders where studio_id='${studioId}' and project_id='${projectId}' and is_default`);
});

test.afterAll(async () => {
  // Only this random fixture tenant is removed; application accounting history is untouched.
  sql(`begin;set local session_replication_role=replica;
    do $$declare item record;begin
      for item in select table_schema,table_name from information_schema.columns where column_name='studio_id' and table_schema in ('public','private')
        and table_name in(select tablename from pg_tables where schemaname in ('public','private')) loop
        execute format('delete from %I.%I where studio_id=$1',item.table_schema,item.table_name) using '${studioId}'::uuid;
      end loop;
    end$$;
    delete from public.studios where id='${studioId}';commit;`);
  if (actor.id) { const deleted = await service.auth.admin.deleteUser(actor.id); if (deleted.error) throw deleted.error; }
});

test("order earning milestones recognize actual delivery and acceptance, including concurrent retries", async ({ page }) => {
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://localhost:3000" }]);
  await signInLocalTestUser(page, actor);
  await page.goto(`/projects/${projectId}?view=finance`);
  await page.getByRole("button", { name: uk.Finance.orders.manage.replace("{count}", "1") }).click();
  await page.getByRole("button", { name: /Основне замовлення/ }).click();
  const earnings = page.getByTestId("order-earnings");
  await expect(earnings).toContainText(e.unconfigured);
  await earnings.getByRole("button", { name: e.title, exact: true }).click();
  await earnings.getByRole("button", { name: e.add, exact: true }).click();
  const form = earnings.locator('form').filter({ has: page.locator('input[name="title"]') });
  await form.locator('input[name="title"]').fill("Contract drawings");
  await form.locator('input[name="netAmount"]').fill("400");
  await form.getByRole("button", { name: e.save, exact: true }).click();
  const milestone = earnings.getByTestId("earning-milestone").filter({ hasText: "Contract drawings" });
  await expect(milestone).toBeVisible();
  await milestone.getByRole("button", { name: e.confirmEvent, exact: true }).click();
  const date = sql("select (now() at time zone 'Europe/Kyiv')::date");
  await milestone.getByRole("combobox", { name: "Вибрати дату" }).click();
  await page.getByRole("button", { name: "Сьогодні", exact: true }).click();
  await milestone.locator('input[name="confirmed"]').check();
  await milestone.getByRole("button", { name: e.delivery, exact: true }).click();
  await expect(milestone).toContainText("Визнано:");
  expect(sql(`select sum(amount) from public.finance_recognition_entries where studio_id='${studioId}' and classification='revenue'`)).toBe("400");

  // The second milestone requires client acceptance and is fulfilled concurrently through the guarded API.
  const auth = createClient<Database>(env.EQUIPMENT_TEST_SUPABASE_URL, z.string().parse(process.env.EQUIPMENT_TEST_PUBLISHABLE_KEY), { auth: { persistSession: false } });
  const login = await auth.auth.signInWithPassword(actor); if (login.error) throw login.error;
  const saved = await auth.rpc("save_finance_earning_milestone", { p_studio_id: studioId, p_request_id: randomUUID(), p_project_id: projectId, p_order_id: orderId,
    p_input: { revision: 0, title: "Accepted final package", netAmount: "600", condition: "acceptance" } }).throwOnError();
  concurrentMilestone = z.uuid().parse(saved.data);
  const fulfill = (kind: string) => auth.rpc("fulfill_finance_earning_milestone", { p_studio_id: studioId, p_request_id: randomUUID(), p_milestone_id: concurrentMilestone,
    p_input: { intent: "fulfill", revision: 1, kind, date, confirmed: true } }).throwOnError();
  await fulfill("delivery");
  expect(sql(`select sum(amount) from public.finance_recognition_entries where studio_id='${studioId}' and classification='revenue'`)).toBe("400");
  await Promise.all([fulfill("acceptance"), fulfill("acceptance")]);
  expect(sql(`select count(*) from public.finance_recognition_entries where studio_id='${studioId}' and kind='recognition'`)).toBe("2");
  expect(sql(`select sum(amount) from public.finance_recognition_entries where studio_id='${studioId}' and classification='revenue'`)).toBe("1000");
  await page.goto(`/projects/${projectId}?view=finance&financeTab=result`);
  await expect(page.getByRole("heading", { name: uk.Finance.projectResult.title, exact: true })).toBeVisible();
  await expect(page.locator("#project-result")).toContainText(/1\s*000/);

  // The financial dashboard combines known cost evidence without posting it again.
  const item = await auth.rpc("save_finance_project_item", { p_studio_id: studioId, p_request_id: randomUUID(), p_project_id: projectId,
    p_input: { stream: "expenses", source: "manual", item: { direction: "outgoing", amount: "100", currency: "UAH",
      categoryId: sql(`select id from public.finance_categories where studio_id='${studioId}' and default_key='project_other_expense'`),
      description: "Delivered project materials", commitment: "agreed", certainty: "fixed", established: true } } }).throwOnError();
  await auth.rpc("confirm_finance_expense_receipt", { p_studio_id: studioId, p_request_id: randomUUID(), p_kind: "expected", p_source_id: z.uuid().parse(item.data),
    p_input: { date, version: "1", confirmed: true } }).throwOnError();
  const before = sql(`select count(*) from public.finance_recognition_entries where studio_id='${studioId}'`);
  await page.goto("/finance");
  const economics = page.getByTestId("overview-economics");
  const point = economics.locator(`[data-economics-point="${projectId}"]`);
  await expect(point.locator("[data-cost-kind]")).toHaveCount(2);
  await expect(point.locator('[data-cost-kind="knownCosts"]')).toContainText(/100,00/);
  await expect(point.locator('[data-cost-kind="recordedCosts"], [data-cost-kind="provisionalCosts"]')).toHaveCount(0);
  await expect(point).toHaveAccessibleName(/Витрати неповні/);
  await expect(economics.getByTestId("economics-highlights")).not.toContainText(uk.Finance.overview.economics.leastExpensive);
  await point.focus();
  await expect(economics.getByTestId("economics-tooltip")).toContainText(uk.Finance.overview.economics.costs);
  await expect(economics.getByTestId("economics-tooltip")).not.toContainText(uk.Finance.overview.economics.recordedCosts);
  const tooltipBox = await economics.getByTestId("economics-tooltip").boundingBox();
  expect(tooltipBox).not.toBeNull();
  await page.screenshot({ path: "test-results/finance-known-costs.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await point.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/finance-known-costs-mobile.png", fullPage: false });
  expect(sql(`select count(*) from public.finance_recognition_entries where studio_id='${studioId}'`)).toBe(before);

});
