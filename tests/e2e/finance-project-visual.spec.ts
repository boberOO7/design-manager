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


test("Project Finance rendered audit", async ({page}, testInfo) => {
 test.setTimeout(180000);
 const category=sql(`select id from finance_categories where studio_id='${studioId}' and default_key='project_payments'`);
 sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);
 select save_finance_project_terms('${studioId}',gen_random_uuid(),'${projectId}','{"stream":"design","mode":"design","revision":0,"amount":"300000","currency":"UAH","reason":"Signed project value"}');
 do $$declare item uuid; begin
 item:=save_finance_project_item('${studioId}',gen_random_uuid(),'${projectId}',jsonb_build_object('stream','design','source','manual','item',jsonb_build_object('direction','incoming','amount','60000','currency','UAH','categoryId','${category}','description','Advance','dueDate','2026-09-20','expectedDate','2026-09-20','commitment','agreed','certainty','fixed','established',true)));
 perform record_finance_expected_payment('${studioId}',gen_random_uuid(),item,jsonb_build_object('kind','incoming','date','2026-09-20','amount','20000','accountId','${bankId}','categoryId','${category}'),20000);
 perform save_finance_project_item('${studioId}',gen_random_uuid(),'${projectId}',jsonb_build_object('stream','design','source','manual','item',jsonb_build_object('direction','incoming','amount','80000','currency','UAH','categoryId','${category}','description','After concept','dueDate','2026-10-15','commitment','agreed','certainty','fixed','established',false)));
 perform save_finance_project_item('${studioId}',gen_random_uuid(),'${projectId}',jsonb_build_object('stream','design','source','manual','item',jsonb_build_object('direction','incoming','amount','140000','currency','UAH','categoryId','${category}','description','Final payment','dueDate','2026-11-10','commitment','agreed','certainty','fixed','established',false)));
 end $$;`);
 await page.goto('/login');await page.locator('input[type="email"]').fill(actors[0].email);await page.locator('input[type="password"]').fill(actors[0].password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
 for(const [label,width,height] of [["fullhd",1920,1080],["2k",2560,1440],["mobile",390,844]] as const) {
  await page.setViewportSize({width,height});
  for(const language of ["en","uk"] as const) for(const theme of ["light","dark"] as const) {
   await page.context().addCookies([{name:"studioflow-locale",value:language,url:"http://127.0.0.1:3100"}]);
   await page.emulateMedia({colorScheme:theme,reducedMotion:"reduce"});
   await page.goto(`/projects/${projectId}?view=finance`);
   await expect(page.getByRole('button',{name:(language==='en'?en:uk).Finance.project.editAgreement,exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   const messages=(language==='en'?en:uk).Finance;
   const summary=page.getByRole('region',{name:messages.project.summary,exact:true});
   await expect(summary).toContainText(messages.project.nextPayment);
   await expect(summary).toContainText('After concept');
   await expect(page.getByRole('heading',{name:'Final payment',exact:true})).toBeVisible();
   const partial=page.locator('article').filter({has:page.getByRole('heading',{name:'Advance',exact:true})});
   await expect(partial.locator('summary')).toContainText(language==='en'?'remaining':'залишок');
   if(width>=1920) expect((await page.locator('[data-project-finance]').boundingBox())?.width).toBeGreaterThan(1700);
   await page.screenshot({path:testInfo.outputPath(`project-${label}-${language}-${theme}.png`),fullPage:true});
   await partial.locator('summary').focus();await page.keyboard.press('Enter');
   await expect(partial.getByRole('link',{name:messages.planning.recordPayment,exact:true})).toBeVisible();
   await page.screenshot({path:testInfo.outputPath(`details-${label}-${language}-${theme}.png`),fullPage:true});
   for(const stream of ['supervision','contractor_bonus','other'] as const) {
    await page.getByRole('navigation',{name:messages.project.streamNavigation,exact:true}).getByRole('link',{name:messages.project.streams[stream],exact:true}).click();
    await expect(page.getByRole('navigation',{name:messages.project.streamNavigation,exact:true}).getByRole('link',{name:messages.project.streams[stream],exact:true})).toHaveAttribute('aria-current','page');
    await expect(page.getByRole('heading',{name:messages.project.streams[stream],exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:messages.project.addPayment,exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`${stream}-${label}-${language}-${theme}.png`),fullPage:true});
   }
  }
  if(width===1920) for(const route of ['','/movements','/expected']) {
   await page.goto(`/finance${route}`);await page.screenshot({path:testInfo.outputPath(`global-${route.slice(1)||'overview'}.png`),fullPage:true});
  }
 }
});
