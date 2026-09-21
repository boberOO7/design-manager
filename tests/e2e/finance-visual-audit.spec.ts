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
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','UAH',(date_trunc('month',now() at time zone 'Europe/Kyiv')-interval '2 months')::date,'${actors[0].id}');
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
    delete from public.finance_allocations where studio_id='${studio}';delete from public.finance_obligation_items where studio_id='${studio}';delete from public.finance_obligations where studio_id='${studio}';delete from public.finance_schedule_terms where studio_id='${studio}';delete from public.finance_schedules where studio_id='${studio}';delete from public.finance_expected_items where studio_id='${studio}';
    delete from public.finance_planning_requests where studio_id='${studio}';delete from public.finance_movement_entries where studio_id='${studio}';delete from public.finance_movements where studio_id='${studio}';
    delete from public.finance_accounts where studio_id='${studio}';delete from public.finance_categories where studio_id='${studio}';delete from public.finance_settings where studio_id='${studio}';
    delete from public.notifications where studio_id='${studio}';delete from public.studio_members where studio_id='${studio}';delete from public.studios where id='${studio}';commit;`);
  for (const actor of actors) if (actor.id) { const { error } = await client.auth.admin.deleteUser(actor.id); if (error) throw error; }
});
test("Overview and Finance navigation render across data states, sizes, languages and themes", async ({page}, testInfo) => {
 test.setTimeout(180000);
 await login(page);
 sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.save_finance_budget('${studio}',gen_random_uuid(),jsonb_build_object('categoryId','${category}','year',extract(year from now() at time zone 'Europe/Kyiv')+1,'revision',0,'months',to_jsonb(array_fill(100000,ARRAY[12])),'reason','Full horizon baseline'));`);
 const expense=sql(`select id from finance_categories where studio_id='${studio}' and default_key='rent'`);
 for(const [days,value,direction] of [[45,"25000","incoming"],[30,"8500","outgoing"],[15,"12000","incoming"],[7,"18000","outgoing"],[3,"9000","outgoing"]] as const) {
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','${direction}','date',(now() at time zone 'Europe/Kyiv')::date-${days},'amount','${value}','accountId','${bank}','categoryId','${direction==="incoming"?category:expense}'));`);
 }
 for(const [days,value,direction,title] of [[4,"10000","outgoing","Studio rent"],[9,"15000","incoming","Design milestone"],[14,"24000","outgoing","Contractor payment"],[21,"8000","incoming","Supervision payment"],[28,"6000","outgoing","Equipment rental"]] as const) {
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','${direction}','amount','${value}','currency','UAH','categoryId','${direction==="incoming"?category:expense}','description','${title}','expectedDate',(now() at time zone 'Europe/Kyiv')::date+${days},'commitment','agreed','certainty','fixed'));`);
 }
 const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
 for (const language of ["en","uk"] as const) for (const theme of ["light","dark"] as const) {
  await page.context().addCookies([{name:"studioflow-locale",value:language,url:"http://127.0.0.1:3100"}]);
  await page.emulateMedia({colorScheme:theme,reducedMotion:"reduce"});
  for (const [label,width,height] of [["fullhd",1920,1080],["2k",2560,1440],["mobile",390,844]] as const) {
   await page.setViewportSize({width,height});
   for (const route of ["", "planning", "movements", "expected", "schedules"]) {
    await page.goto(`/finance${route ? `/${route}` : ""}?fx_USD=40`);
    await page.locator("main h1").waitFor();
    await expect(page.locator("html")).toHaveAttribute("data-theme",theme);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    const nav=page.getByRole("navigation",{name:language==="en"?en.Finance.title:uk.Finance.title,exact:true});
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await nav.locator('a[aria-current="page"]').focus();
    expect(await nav.locator('a[aria-current="page"]').evaluate(el=>getComputedStyle(el).boxShadow)).not.toBe("none");
    await page.screenshot({path:testInfo.outputPath(`after-${route || "overview"}-${label}-${language}-${theme}.png`),fullPage:true});
    if(!route && width>=1920) {
      const shell=page.locator('main > div');
      expect((await shell.boundingBox())?.width).toBeGreaterThan(1700);
      await page.locator("main").evaluate(el=>el.scrollTop=el.scrollHeight);
      await page.screenshot({path:testInfo.outputPath(`after-overview-bottom-${label}-${language}-${theme}.png`)});
    }
   }
  }
 }
 await page.context().addCookies([{name:"studioflow-locale",value:"en",url:"http://127.0.0.1:3100"}]);
 await page.emulateMedia({colorScheme:"light"}); await page.setViewportSize({width:1920,height:1080});
 sql(`begin;set local session_replication_role=replica;delete from finance_budget_revisions where studio_id='${studio}';commit;`);
 await page.goto("/finance?fx_USD=40");
 await expect(page.getByRole("heading",{name:en.Finance.overview.budgetSignal})).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath("after-no-budget.png")});
 sql(`begin;set local session_replication_role=replica;delete from finance_expected_items where studio_id='${studio}' and description in ('Undated receipt','Overdue rent');commit;`);
 await page.goto("/finance?fx_USD=40");
 await expect(page.getByText(en.Finance.overview.allClear,{exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath("after-all-clear.png")});
 const input={categoryId:sql(`select id from finance_categories where studio_id='${studio}' and default_key='salary'`),name:"Design team",amount:"20000",currency:"UAH",kind:"payroll",employeeId:actors[1].id,basis:"net",employeePayout:"20000",employeeDeductions:"",employerCostStatus:"unknown",employerCost:"",intervalMonths:1,payoutDay:10,paymentMonthOffset:1,effectiveFrom:sql("select date_trunc('month',now() at time zone 'Europe/Kyiv')::date"),commitment:"agreed",certainty:"fixed",reason:"Visual fixture",revision:0};
 sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select save_finance_schedule('${studio}','${randomUUID()}','${JSON.stringify(input)}'::jsonb);`);
 await page.goto("/finance?fx_USD=40");
 await expect(page.locator("#overview-attention")).toContainText(en.Finance.forecast.issues.unknown_employer_cost);
 await page.screenshot({path:testInfo.outputPath("after-incomplete-payroll.png")});
 await page.getByRole("button",{name:/Show .* more priorities/}).click();
 await expect.poll(()=>page.locator("#overview-attention [role=region]").evaluate(el=>Math.abs(el.getBoundingClientRect().height-(el.firstElementChild?.getBoundingClientRect().height??0)))).toBeLessThan(1);
 await page.screenshot({path:testInfo.outputPath("after-incomplete-expanded.png")});
 await page.goto("/finance/schedules"); await page.screenshot({path:testInfo.outputPath("after-schedules-populated.png")});
 // Unsupported FX requires an explicit assumption; it must never be displayed as zero.
 sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','100','currency','BIF','categoryId','${category}','description','International receipt','expectedDate',(now() at time zone 'Europe/Kyiv')::date+7,'commitment','agreed','certainty','fixed'));`);
 await page.goto("/finance?fx_USD=40");
 await expect(page.locator("#overview-attention")).toContainText(en.Finance.forecast.issues.missing_fx);
 await page.screenshot({path:testInfo.outputPath("after-multi-currency.png")});
 expect(errors).toEqual([]);
});
