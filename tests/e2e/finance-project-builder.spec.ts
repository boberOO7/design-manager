import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["127.0.0.1", "localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Finance fixtures require local Supabase");
const client = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID();
const projectId=randomUUID(),bankId=randomUUID(),contractorId=randomUUID(),categoryId=randomUUID();
const actors = ["admin", "employee"].map((role) => ({ role, id: "", email: `project-finance-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` }));
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}
const studioLiteral = `'${z.uuid().parse(studioId)}'`;
function clearFoundation() {
  // Test-only local teardown of this suite's UUID tenant; production history is immutable.
  sql(`begin; set local session_replication_role=replica;
    delete from public.finance_project_items where studio_id=${studioLiteral};
    delete from public.finance_project_plan_revisions where studio_id=${studioLiteral};
    delete from public.finance_project_terms where studio_id=${studioLiteral};
    delete from public.finance_allocations where studio_id=${studioLiteral};
    delete from public.finance_expected_items where studio_id=${studioLiteral};
    delete from public.finance_planning_requests where studio_id=${studioLiteral};
    delete from public.finance_movement_entries where studio_id=${studioLiteral};
    delete from public.finance_movements where studio_id=${studioLiteral};
    delete from public.finance_accounts where studio_id=${studioLiteral};
    delete from public.finance_categories where studio_id=${studioLiteral};
    delete from public.finance_settings where studio_id=${studioLiteral}; commit;`);
}

test.beforeAll(async () => {
  await client.from("studios").insert({ id: studioId, name: "Finance browser test" }).throwOnError();
  for (const actor of actors) {
    const result = await client.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
    if (result.error) throw result.error;
    actor.id = result.data.user.id;
    await client.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: `Finance ${actor.role}`, system_role: actor.role, is_active: true }).throwOnError();
    await client.from("studio_members").insert({ studio_id: studioId, user_id: actor.id, system_role: actor.role }).throwOnError();
  }
});
test.beforeAll(async()=>{
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(${studioLiteral},'UAH','2026-09-01','${actors[0].id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${bankId}',${studioLiteral},'Bank','UAH',0,'${actors[0].id}');
    select set_config('request.jwt.claim.sub','${actors[0].id}',false); select public.finalize_finance_setup(${studioLiteral});
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status,country_code) values('${projectId}',${studioLiteral},'Finance project',100,'2026-09-01','${actors[0].id}','active','UA');
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values('${projectId}','${actors[1].id}','designer',0,'2026-09-01');
    insert into public.contractor_categories(id,studio_id,name,color_key) values('${categoryId}',${studioLiteral},'Builders','blue');
    insert into public.contractors(id,category_id,name,created_by) values('${contractorId}','${categoryId}','Studio builder','${actors[0].id}');
    select public.create_calendar_event_with_invites(${studioLiteral},'Inspection visit','site_visit','2026-10-10T10:00Z','2026-10-10T11:00Z',false,'${projectId}',p_assignee_id=>'${actors[1].id}');`);
});
test.afterAll(async () => {
  clearFoundation();
  sql(`begin; set local session_replication_role=replica; delete from public.notifications where studio_id=${studioLiteral}; delete from public.project_activity where project_id='${projectId}'; delete from public.calendar_events where studio_id=${studioLiteral}; delete from public.project_members where project_id='${projectId}'; delete from public.project_task_stage_columns where project_id='${projectId}'; delete from public.projects where studio_id=${studioLiteral}; delete from public.contractors where id='${contractorId}'; delete from public.contractor_categories where id='${categoryId}'; delete from public.studio_members where studio_id=${studioLiteral}; delete from public.studios where id=${studioLiteral}; commit;`);
  for (const actor of actors) if (actor.id) { const result = await client.auth.admin.deleteUser(actor.id); if (result.error) throw result.error; }
});


test("value builder preserves protected payments and native-currency area history",async({page},testInfo)=>{
 test.setTimeout(180000);
 const t=en.Finance,b=t.builder,p=t.project;
 const dollar=randomUUID();
 sql(`insert into finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${dollar}','${studioId}','Dollar bank','USD',0,'${actors[0].id}');`);
 await page.goto('/login');await page.locator('input[type="email"]').fill(actors[0].email);await page.locator('input[type="password"]').fill(actors[0].password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
 const href=`/projects/${projectId}?view=finance`;
 await page.goto(href);await page.getByRole('button',{name:p.editAgreement,exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('combobox',{name:b.pricingMethod,exact:true}).click();await page.getByRole('option',{name:b.perArea,exact:true}).click();
 await expect(dialog.getByLabel(b.area,{exact:true})).toHaveValue('100');
 await dialog.getByLabel(b.area,{exact:true}).fill('123');await dialog.getByLabel(b.rate,{exact:true}).fill('20');
 await dialog.getByRole('combobox',{name:p.currency,exact:true}).click();await page.getByRole('option',{name:'USD',exact:true}).click();
 await expect(dialog.getByLabel(p.contract,{exact:true})).toHaveValue('2460.00');
 for(const [label,amounts] of [['100%',['2460.00']],['50 / 50',['1230.00','1230.00']],['30 / 50 / 20',['738.00','1230.00','492.00']],['25 / 25 / 25 / 25',['615.00','615.00','615.00','615.00']]] as const) {
  await dialog.getByRole('button',{name:label,exact:true}).click();await expect(dialog.locator('[data-plan-row]')).toHaveCount(amounts.length);
  for(const [i,amount] of amounts.entries()) await expect(dialog.locator('[data-plan-row]').nth(i).getByLabel(t.movements.amount,{exact:true})).toHaveValue(amount);
 }
 await dialog.getByRole('button',{name:'30 / 50 / 20',exact:true}).click();
 await dialog.locator('[data-plan-row]').nth(0).getByLabel(b.percentage,{exact:true}).fill('25');
 await expect(dialog.locator('[data-plan-row]').nth(0).getByLabel(t.movements.amount,{exact:true})).toHaveValue('615.00');
 await expect(dialog.getByRole('button',{name:b.saveRevision,exact:true})).toBeDisabled();
 await dialog.locator('[data-plan-row]').nth(0).getByLabel(b.percentage,{exact:true}).fill('30');
 for(const [i,date] of ['2026-09-20','2026-10-15','2026-11-10'].entries()) await dialog.locator('[data-plan-row]').nth(i).getByLabel(t.planning.dueDate,{exact:true}).fill(date);
 await dialog.getByLabel(p.reason,{exact:true}).fill('Area pricing and three payments');await dialog.getByRole('button',{name:b.saveRevision,exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(sql(`select concat(amount,'|',currency) from finance_project_current_terms where project_id='${projectId}' and stream='design'`)).toBe('2460.00|USD');
 expect(sql(`select concat(area_snapshot,'|',rate_per_m2) from finance_project_plan_revisions where project_id='${projectId}'`)).toBe('123|20');
 const initialItems=sql(`select jsonb_agg(id order by id) from finance_project_plan_items where project_id='${projectId}'`);
 sql(`update projects set total_area_m2=150 where id='${projectId}';`);
 await page.reload();await expect(page.getByText(b.areaChanged.replace('{saved}','123').replace('{current}','150'),{exact:true})).toBeVisible();
 await page.getByRole('button',{name:p.editAgreement,exact:true}).click();await expect(dialog.getByLabel(b.area,{exact:true})).toHaveValue('123');await expect(dialog.getByLabel(p.contract,{exact:true})).toHaveValue('2460.00');
 await dialog.getByRole('button',{name:b.useCurrentArea,exact:true}).click();await expect(dialog.getByLabel(p.contract,{exact:true})).toHaveValue('3000.00');
 await dialog.getByRole('button',{name:t.movements.close,exact:true}).click();
 expect(sql(`select jsonb_agg(id order by id) from finance_project_plan_items where project_id='${projectId}'`)).toBe(initialItems);
 sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);do $$declare item record; begin
 for item in select * from finance_project_plan_items where project_id='${projectId}' and amount in (738,1230) loop
 perform record_finance_expected_payment('${studioId}',gen_random_uuid(),item.id,jsonb_build_object('kind','incoming','date','2026-09-20','amount',case when item.amount=738 then '738' else '100' end,'accountId','${dollar}','categoryId',item.category_id,'fx',jsonb_build_object('rate','40','source','manual','effectiveDate','2026-09-20')),case when item.amount=738 then 738 else 100 end);
 end loop;end $$;`);
 const protectedBefore=sql(`select jsonb_agg(to_jsonb(e) order by e.id) from finance_expected_items e where id in(select id from finance_project_plan_items where project_id='${projectId}' and has_settlement_history)`);
 await page.reload();await page.getByRole('button',{name:p.editAgreement,exact:true}).click();
 await expect(dialog.getByText(b.protectedHelp,{exact:true})).toBeVisible();await expect(dialog.locator('[data-plan-row]')).toHaveCount(1);
 await dialog.getByRole('button',{name:'50 / 50',exact:true}).click();
 await expect(dialog.locator('[data-plan-row]')).toHaveCount(2);
 await expect(dialog.locator('[data-plan-row]').first().getByLabel(t.movements.amount,{exact:true})).toHaveValue('246.00');
 await dialog.locator('[data-plan-row]').nth(1).getByLabel(b.paymentName,{exact:true}).fill('Fourth payment');
 await dialog.getByLabel(p.reason,{exact:true}).fill('Fourth payment without changing collected history');await dialog.getByRole('button',{name:b.saveRevision,exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(sql(`select count(*) from finance_project_plan_items where project_id='${projectId}'`)).toBe('4');
 expect(sql(`select jsonb_agg(to_jsonb(e) order by e.id) from finance_expected_items e where id in(select id from finance_project_plan_items where project_id='${projectId}' and has_settlement_history)`)).toBe(protectedBefore);
 await page.getByRole('button',{name:p.editAgreement,exact:true}).click();
 await dialog.getByRole('combobox',{name:b.pricingMethod,exact:true}).click();await page.getByRole('option',{name:b.fixed,exact:true}).click();
 await dialog.getByLabel(p.contract,{exact:true}).fill('2560');
 await dialog.getByRole('combobox',{name:b.strategy,exact:true}).click();await page.getByRole('option',{name:b.keep,exact:true}).click();
 await expect(dialog.locator('[data-plan-row]').first().getByLabel(t.movements.amount,{exact:true})).toHaveAttribute('readonly','');
 await dialog.getByRole('button',{name:p.addPayment,exact:true}).click();await dialog.locator('[data-plan-row]').last().getByLabel(t.movements.amount,{exact:true}).fill('100');
 await dialog.locator('[data-plan-row]').last().getByLabel(b.paymentName,{exact:true}).fill('Extra payment');
 await dialog.getByLabel(p.reason,{exact:true}).fill('Additional scope, preserve unpaid amounts');await dialog.getByRole('button',{name:b.saveRevision,exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(sql(`select concat(trim_scale(contract_amount),'|',trim_scale(scheduled_amount),'|',trim_scale(collected_amount)) from finance_project_totals where project_id='${projectId}' and stream='design'`)).toBe('2560|2560|838');
 expect(sql(`select count(*) from finance_movements where studio_id='${studioId}'`)).toBe('2');

 await page.getByRole('button',{name:p.editAgreement,exact:true}).click();
 await dialog.locator('[data-plan-row]').nth(0).getByLabel(t.movements.amount,{exact:true}).fill('200');
 await dialog.locator('[data-plan-row]').nth(1).getByLabel(t.movements.amount,{exact:true}).fill('292');
 await dialog.locator('[data-plan-row]').nth(0).getByRole('button',{name:b.moveDown,exact:true}).click();
 await dialog.getByLabel(p.reason,{exact:true}).fill('Manual amounts and reviewed order');await dialog.getByRole('button',{name:b.saveRevision,exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(sql(`select e.description from finance_project_plan_revisions p join finance_project_current_terms t on t.id=p.terms_id join finance_expected_items e on e.id=p.item_order[1] where p.project_id='${projectId}'`)).toBe('Fourth payment');
 expect(sql(`select jsonb_agg(to_jsonb(e) order by e.id) from finance_expected_items e where id in(select id from finance_project_plan_items where project_id='${projectId}' and has_settlement_history)`)).toBe(protectedBefore);
 // Render the populated builder in both locales/themes at all required widths.
 for(const [label,width,height] of [['fullhd',1920,1080],['2k',2560,1440],['mobile',390,844]] as const) for(const language of ['en','uk'] as const) for(const theme of ['light','dark'] as const) {
  const messages=(language==='en'?en:uk).Finance;
  await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await page.context().addCookies([{name:'studioflow-locale',value:language,url:'http://127.0.0.1:3100'}]);await page.goto(href);
  await page.getByRole('button',{name:messages.project.editAgreement,exact:true}).click();await expect(dialog.getByText(messages.builder.protectedHelp,{exact:true})).toBeVisible();
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`builder-${label}-${language}-${theme}.png`)});
  await dialog.getByRole('combobox',{name:messages.builder.pricingMethod,exact:true}).click();await page.getByRole('option',{name:messages.builder.perArea,exact:true}).click();
  await dialog.getByLabel(messages.builder.rate,{exact:true}).fill('20');
  await page.screenshot({path:testInfo.outputPath(`area-${label}-${language}-${theme}.png`)});
  await dialog.getByLabel(messages.project.reason,{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`review-${label}-${language}-${theme}.png`)});
  await dialog.getByRole('button',{name:messages.movements.close,exact:true}).click();
 }
});
