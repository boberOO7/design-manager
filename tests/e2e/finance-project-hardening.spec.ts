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
const actors = ["admin", "employee"].map((role) => ({ role, id: "", email: `project-hardening-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` }));
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}
const studioLiteral = `'${z.uuid().parse(studioId)}'`;
function clearFoundation() {
  // Test-only local teardown of this suite's UUID tenant; production history is immutable.
  sql(`begin; set local session_replication_role=replica;
    delete from public.finance_project_items where studio_id=${studioLiteral};
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

test("refunded project expectations cancel explicitly and retain partial payment",async({page})=>{
  const t=en.Finance,p=t.project;
  const ids=[randomUUID(),randomUUID()];
  for(const [index,item] of ids.entries()) {
    sql(`begin; select set_config('request.jwt.claim.sub','${actors[0].id}',true);
      ${index===0?`select public.save_finance_project_terms(${studioLiteral},'${randomUUID()}','${projectId}','{"stream":"design","mode":"design","revision":0,"amount":"300000","currency":"UAH","reason":"Signed scope"}');`:""}
      do $$declare expected uuid; payment uuid; begin
        expected:=public.save_finance_project_item(${studioLiteral},'${item}','${projectId}',jsonb_build_object('stream','design','item',jsonb_build_object('amount','100000','currency','UAH','direction','incoming','categoryId',(select id from public.finance_categories where studio_id=${studioLiteral} and default_key='project_payments'),'commitment','agreed','certainty','fixed','established',true,'dueDate','2026-09-01','expectedDate','2026-10-01','description','${index===0?'Fully refunded':'Partly refunded'}')));
        payment:=public.record_finance_expected_payment(${studioLiteral},'${randomUUID()}',expected,jsonb_build_object('kind','incoming','date','2026-09-02','amount','100000','accountId','${bankId}','categoryId',(select id from public.finance_categories where studio_id=${studioLiteral} and default_key='project_payments')),100000);
        perform public.record_finance_movement(${studioLiteral},'${randomUUID()}',jsonb_build_object('kind','refund','date','2026-09-03','amount','${index===0?'100000':'60000'}','accountId','${bankId}','relatedMovementId',payment));
      end $$; commit;`);
  }
  const cash=sql(`select jsonb_agg(to_jsonb(e) order by id) from public.finance_movement_entries e where studio_id=${studioLiteral}`);
  const history=sql(`select jsonb_agg(to_jsonb(m) order by id) from public.finance_movements m where studio_id=${studioLiteral}`);
  await page.goto("/login");await page.locator('input[type="email"]').fill(actors[0].email);await page.locator('input[type="password"]').fill(actors[0].password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
  for(const [index,request] of ids.entries()) {
    const item=sql(`select result_id from public.finance_planning_requests where studio_id=${studioLiteral} and request_id='${request}'`);
    await page.goto(`/finance/expected?item=${item}`);
    const row=page.locator("article").filter({has:page.getByRole("heading",{name:index===0?'Fully refunded':'Partly refunded',exact:true})});
    await row.getByRole("button",{name:p.cancelExpectation,exact:true}).click();
    const dialog=page.getByRole("dialog");
    await expect(dialog.getByRole("textbox",{name:t.movements.reason,exact:true})).toHaveAttribute("required","");
    await dialog.getByRole("textbox",{name:t.movements.reason,exact:true}).fill("Engagement ended after refund");
    if(index===1) {
      await expect(dialog.getByRole("checkbox")).not.toBeChecked();
      await expect(dialog.getByRole("checkbox")).toHaveAttribute("required","");
      await dialog.getByRole("checkbox").check();
    }
    await dialog.getByRole("button",{name:p.cancelExpectation,exact:true}).click();await expect(dialog).toHaveCount(0);
    expect(sql(`select concat(amount,'|',settled_amount,'|',commitment) from public.finance_expected_balances where id='${item}'`)).toBe("100000|0|cancelled");
  }
  expect(sql(`select jsonb_agg(to_jsonb(e) order by id) from public.finance_movement_entries e where studio_id=${studioLiteral}`)).toBe(cash);
  expect(sql(`select jsonb_agg(to_jsonb(m) order by id) from public.finance_movements m where studio_id=${studioLiteral}`)).toBe(history);
  expect(sql(`select concat(collected_amount,'|',outstanding_amount,'|',planned_amount,'|',scheduled_amount) from public.finance_project_totals where project_id='${projectId}' and stream='design'`)).toBe("40000|0|0|40000");
  expect(sql(`select count(*) from public.finance_expected_balances where studio_id=${studioLiteral} and amount=40000 and settled_amount=40000`)).toBe("1");
});

test("visit defaults follow historical terms and manual overrides survive visit changes",async({page})=>{
  const t=en.Finance,p=t.project,plan=t.planning;
  sql(`begin; select set_config('request.jwt.claim.sub','${actors[0].id}',true);
    select public.save_finance_project_terms(${studioLiteral},'${randomUUID()}','${projectId}','{"stream":"supervision","mode":"monthly","revision":0,"amount":"15000","currency":"UAH","effectiveFrom":"2026-04-01","reason":"Original retainer"}');
    select public.create_calendar_event_with_invites(${studioLiteral},'May retainer visit','site_visit','2026-05-10T10:00Z','2026-05-10T11:00Z',false,'${projectId}',p_assignee_id=>'${actors[1].id}');
    select public.save_finance_project_terms(${studioLiteral},'${randomUUID()}','${projectId}','{"stream":"supervision","mode":"per_visit","revision":1,"amount":"3000","currency":"UAH","effectiveFrom":"2026-06-01","reason":"June rate"}');
    select public.save_finance_project_terms(${studioLiteral},'${randomUUID()}','${projectId}','{"stream":"supervision","mode":"per_visit","revision":2,"amount":"4000","currency":"USD","effectiveFrom":"2026-09-01","reason":"September rate"}');
    select public.create_calendar_event_with_invites(${studioLiteral},'June historic visit','site_visit','2026-06-10T10:00Z','2026-06-10T11:00Z',false,'${projectId}',p_assignee_id=>'${actors[1].id}');
    select public.create_calendar_event_with_invites(${studioLiteral},'June override visit','site_visit','2026-06-11T10:00Z','2026-06-11T11:00Z',false,'${projectId}',p_assignee_id=>'${actors[1].id}'); commit;`);
  await page.goto("/login");await page.locator('input[type="email"]').fill(actors[0].email);await page.locator('input[type="password"]').fill(actors[0].password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/projects/${projectId}?view=finance&stream=supervision`);
  const dialog=page.getByRole("dialog");
  async function begin(){await page.getByRole("button",{name:plan.create,exact:true}).click();await dialog.getByRole("combobox",{name:p.chargeSource,exact:true}).click();await page.getByRole("option",{name:p.visitCharge,exact:true}).click();}
  async function selectVisit(name:string){await dialog.getByRole("combobox",{name:p.visit,exact:true}).click();await page.getByRole("option",{name:new RegExp(name)}).click();}
  async function save(name:string){await dialog.getByText(t.movements.description,{exact:true}).click();await dialog.getByLabel(t.movements.description,{exact:true}).fill(name);await dialog.getByRole("button",{name:plan.save,exact:true}).click();await expect(dialog).toHaveCount(0);}
  await begin();await selectVisit("May retainer visit");
  await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveValue("");
  await expect(dialog.locator('select[name="currency"]')).toHaveValue("");
  await expect(dialog.getByRole("checkbox",{name:p.extraVisit,exact:true})).toHaveAttribute("required","");
  await selectVisit("Inspection visit");await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveValue("4000");
  await selectVisit("May retainer visit");await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveValue("");
  await dialog.getByRole("checkbox",{name:p.extraVisit,exact:true}).check();
  await dialog.getByLabel(t.movements.amount,{exact:true}).fill("1250");
  await expect(dialog.locator('select[name="currency"]')).toHaveValue("");
  await dialog.getByRole("combobox",{name:plan.currency,exact:true}).click();await page.getByRole("option",{name:"UAH",exact:true}).click();
  await selectVisit("Inspection visit");await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveValue("1250");
  await selectVisit("May retainer visit");await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveValue("1250");
  await expect(dialog.locator('select[name="currency"]')).toHaveValue("UAH");await save("Manual retainer extra");
  expect(sql(`select concat(e.amount,'|',e.currency,'|',t.mode) from public.finance_expected_items e join public.finance_project_items p on p.expected_item_id=e.id join public.finance_project_terms t on t.id=p.terms_id where e.studio_id=${studioLiteral} and e.description='Manual retainer extra'`)).toBe("1250|UAH|monthly");
  await begin();await selectVisit("June historic visit");
  await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveValue("3000");await expect(dialog.getByLabel(plan.currency,{exact:true})).toHaveValue("UAH");await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveAttribute("readonly","");
  await selectVisit("Inspection visit");await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveValue("4000");await expect(dialog.getByLabel(plan.currency,{exact:true})).toHaveValue("USD");
  await selectVisit("June historic visit");await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveValue("3000");await save("Historical default");
  await begin();await selectVisit("June override visit");await dialog.getByRole("checkbox",{name:p.overrideVisitPrice,exact:true}).check();await dialog.getByLabel(t.movements.amount,{exact:true}).fill("3500");
  await selectVisit("Inspection visit");await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveValue("3500");await expect(dialog.locator('select[name="currency"]')).toHaveValue("UAH");
  await selectVisit("June override visit");await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveValue("3500");await save("Historical manual price");
  await begin();await selectVisit("Inspection visit");await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveValue("4000");await save("Current default");
  expect(sql(`select string_agg(description||'|'||amount||'|'||currency,',' order by description) from public.finance_expected_items where studio_id=${studioLiteral} and description in ('Historical default','Historical manual price','Current default')`)).toBe("Current default|4000|USD,Historical default|3000|UAH,Historical manual price|3500|UAH");
  await begin();await selectVisit("June historic visit");await dialog.getByRole("button",{name:plan.save,exact:true}).click();await expect(dialog.getByRole("alert")).toHaveText(p.errors.duplicateCharge);
  expect(sql(`select count(*) from public.finance_project_items where project_id='${projectId}' and source='visit'`)).toBe("4");
});

test("large Project Finance aggregates retain every decimal through the Data API",async({page})=>{
  sql(`begin; select set_config('request.jwt.claim.sub','${actors[0].id}',true);
    do $$begin for i in 1..100 loop
      perform public.save_finance_project_item(${studioLiteral},gen_random_uuid(),'${projectId}',jsonb_build_object('stream','other','item',jsonb_build_object('amount',case when i=100 then '9999999999.0102' else '9999999999.9999' end,'currency','CLF','direction','incoming','categoryId',(select id from public.finance_categories where studio_id=${studioLiteral} and default_key='other_income'),'commitment','agreed','certainty','fixed','established',false,'description','Large aggregate')));
    end loop; end $$; commit;`);
  expect(sql(`select concat(scheduled_amount,'|',planned_amount) from public.finance_project_totals where project_id='${projectId}' and stream='other'`)).toBe("999999999999.0003|999999999999.0003");
  await page.goto("/login");await page.locator('input[type="email"]').fill(actors[0].email);await page.locator('input[type="password"]').fill(actors[0].password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
  for(const [locale,messages,exact] of [["en",en,"999,999,999,999.0003"],["uk",uk,"999 999 999 999,0003"]] as const){
    await page.context().addCookies([{name:"studioflow-locale",value:locale,url:"http://127.0.0.1:3100"}]);
    await page.goto(`/projects/${projectId}?view=finance&stream=other`);
    await expect(page.getByRole("region",{name:messages.Finance.project.summary,exact:true})).toContainText(exact);
  }
});
