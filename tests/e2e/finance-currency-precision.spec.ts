import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["127.0.0.1", "localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local Finance fixtures only");
const client = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studio = randomUUID(), bank = randomUUID();
const actor = { id: "", email: `precision-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` };
function sql(statement: string) { return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim(); }

test.beforeAll(async () => {
  await client.from("studios").insert({ id: studio, name: "IQD precision test" }).throwOnError();
  const { data, error } = await client.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
  if (error) throw error;
  actor.id = data.user.id;
  await client.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Precision admin", system_role: "admin", is_active: true }).throwOnError();
  await client.from("studio_members").insert({ studio_id: studio, user_id: actor.id, system_role: "admin" }).throwOnError();
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','IQD',date_trunc('month',now() at time zone 'Europe/Kyiv')::date,'${actor.id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${bank}','${studio}','IQD bank','IQD',0.125,'${actor.id}');
    select set_config('request.jwt.claim.sub','${actor.id}',false);select public.finalize_finance_setup('${studio}');
    select public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','0.125','currency','IQD','categoryId',(select id from public.finance_categories where studio_id='${studio}' and default_key='project_payments'),'established',true,'description','Subunit receipt','dueDate',(now() at time zone 'Europe/Kyiv')::date,'expectedDate',(now() at time zone 'Europe/Kyiv')::date,'commitment','agreed','certainty','fixed'));`);
});
test.afterAll(async () => {
  sql(`begin;set local session_replication_role=replica;
    delete from public.finance_expected_items where studio_id='${studio}';delete from public.finance_planning_requests where studio_id='${studio}';
    delete from public.finance_accounts where studio_id='${studio}';delete from public.finance_categories where studio_id='${studio}';delete from public.finance_settings where studio_id='${studio}';
    delete from public.notifications where studio_id='${studio}';delete from public.studio_members where studio_id='${studio}';delete from public.studios where id='${studio}';commit;`);
  if (actor.id) { const { error } = await client.auth.admin.deleteUser(actor.id); if (error) throw error; }
});

test("IQD subunits reconcile across Accounts, Planning, Overview, chart text and drilldowns in EN and UK", async ({ page }) => {
  await page.goto("/login");await page.locator('input[type="email"]').fill(actor.email);await page.locator('input[type="password"]').fill(actor.password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
  for (const [locale,messages,fraction,projected] of [["en",en,"0.125","0.250"],["uk",uk,"0,125","0,250"]] as const) {
    const t=messages.Finance,overview=t.overview;
    await page.context().addCookies([{name:"studioflow-locale",value:locale,url:"http://127.0.0.1:3100"}]);
    await page.goto("/finance/accounts");
    await expect(page.getByRole("listitem").filter({has:page.getByText("IQD bank",{exact:true})})).toContainText(fraction);
    await page.goto("/finance");
    const cash=page.getByRole("button",{name:new RegExp(`^${overview.cash}`)});
    const receivables=page.getByRole("button",{name:new RegExp(`^${overview.receivables}`)});
    await expect(cash).toContainText(fraction);await expect(receivables).toContainText(fraction);
    await cash.click();await expect(page.locator("#overview-breakdown")).toContainText(`IQD`);await expect(page.locator("#overview-breakdown")).toContainText(fraction);
    await receivables.click();await expect(page.locator("#overview-breakdown")).toContainText(fraction);
    await page.getByText(overview.chartData,{exact:true}).click();
    const chart=page.getByRole("table",{name:overview.cashChart});
    await expect(chart).toContainText(fraction);await expect(chart).toContainText(projected);
    const point=page.locator('circle[role="button"]').first();
    await expect(point).toHaveAttribute("aria-label",new RegExp(fraction.replace(".","\\.")));
    await point.focus();await expect(page.locator('p[aria-live="polite"]')).toContainText(fraction);
    await page.getByRole("link",{name:"Subunit receipt",exact:true}).last().click();
    await expect(page).toHaveURL(/\/finance\/expected\?item=/);await expect(page.locator("article").filter({has:page.getByRole("heading",{name:"Subunit receipt",exact:true})})).toContainText(fraction);
    await page.goto("/finance/planning");
    await expect(page.getByRole("table",{name:t.forecast.cashProjection})).toContainText(projected);
    await expect(page.getByRole("table",{name:t.forecast.comparison})).toContainText(fraction);
  }
});
