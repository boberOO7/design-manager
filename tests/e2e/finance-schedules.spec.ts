import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";

const local=z.object({EQUIPMENT_TEST_SUPABASE_URL:z.url(),EQUIPMENT_TEST_SERVICE_KEY:z.string()}).parse(process.env);
if(!["127.0.0.1","localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local Finance fixtures only");
const client=createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL,local.EQUIPMENT_TEST_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const studio=randomUUID(),bank=randomUUID();
const actors=["admin","employee","employee","employee","employee"].map((role,index)=>({role,name:["Payroll admin","Payroll employee","Payroll designer","Payroll architect","Payroll assistant"][index],id:"",email:`payroll-${randomUUID()}@example.test`,password:`Finance-${randomUUID()}`}));
function sql(statement:string){return execFileSync("docker",["exec","-i","supabase_db_design-manager","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-At"],{input:statement,encoding:"utf8"}).trim();}
const t=en.Finance,s=t.schedules;
async function login(page:Page,index=0){await page.goto("/login");await page.locator('input[type="email"]').fill(actors[index].email);await page.locator('input[type="password"]').fill(actors[index].password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);}

test.beforeAll(async()=>{
  await client.from("studios").insert({id:studio,name:"Payroll browser test"}).throwOnError();
  for(const actor of actors){
    const {data,error}=await client.auth.admin.createUser({email:actor.email,password:actor.password,email_confirm:true});if(error)throw error;actor.id=data.user.id;
    await client.from("profiles").upsert({id:actor.id,email:actor.email,full_name:actor.name,system_role:actor.role,is_active:true}).throwOnError();
    await client.from("studio_members").insert({studio_id:studio,user_id:actor.id,system_role:actor.role,joined_at:"2026-01-15"}).throwOnError();
  }
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','UAH','2026-01-01','${actors[0].id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${bank}','${studio}','Payroll bank','UAH',10000,'${actors[0].id}');
    select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.finalize_finance_setup('${studio}');`);
});
test.afterAll(async()=>{
  // Local fixture-only cleanup; preserve production's immutable financial history.
  sql(`begin;set local session_replication_role=replica;
    delete from public.finance_payroll_cost_revisions where studio_id='${studio}';delete from public.finance_obligation_items where studio_id='${studio}';delete from public.finance_obligations where studio_id='${studio}';
    delete from public.finance_schedule_terms where studio_id='${studio}';delete from public.finance_schedules where studio_id='${studio}';
    delete from public.finance_allocations where studio_id='${studio}';delete from public.finance_expected_items where studio_id='${studio}';
    delete from public.finance_planning_requests where studio_id='${studio}';delete from public.finance_movement_entries where studio_id='${studio}';
    delete from public.finance_movements where studio_id='${studio}';delete from public.finance_accounts where studio_id='${studio}';
    delete from public.finance_recurring_groups where studio_id='${studio}';delete from public.finance_categories where studio_id='${studio}';delete from public.finance_settings where studio_id='${studio}';
    delete from public.notifications where studio_id='${studio}';delete from public.studio_members where studio_id='${studio}';delete from public.studios where id='${studio}';commit;`);
  for(const actor of actors)if(actor.id){const {error}=await client.auth.admin.deleteUser(actor.id);if(error)throw error;}
});

test("compensation, obligations, payroll privacy, recurrence and owner payment",async({page},testInfo)=>{
  await login(page);await page.goto("/finance/schedules");
  let firstStartMonth="";
  async function salary(employee:string,cost:"unknown"|"none"="unknown",inspect=false){
    await page.getByRole("button",{name:s.addCompensation,exact:true}).click();const dialog=page.getByRole("dialog");
    await dialog.getByRole("combobox",{name:s.employee,exact:true}).click();await page.getByRole("option",{name:employee,exact:true}).click();
    await expect(dialog.getByLabel(s.name,{exact:true})).toHaveCount(0);await dialog.getByLabel(s.agreedAmount,{exact:true}).fill("1000");
    const startMonth=dialog.getByLabel(s.effectiveFrom,{exact:true});await expect(startMonth).toHaveAttribute("type","month");
    await expect(startMonth).toHaveValue("2026-01");
    await expect(dialog.getByRole("switch",{name:`${s.basis}: ${s.net}`,exact:true})).toBeVisible();await expect(dialog.getByLabel(s.payout,{exact:true})).toHaveCount(0);await expect(dialog.getByLabel(s.remittances,{exact:true})).toBeHidden();await dialog.getByRole("button",{name:s.payrollCosts,exact:true}).click();await expect(dialog.getByLabel(s.remittances,{exact:true})).toBeVisible();await expect(dialog.getByLabel(s.remittances,{exact:true})).toHaveValue("");
    if(inspect){
      await dialog.getByRole("switch",{name:`${s.basis}: ${s.net}`,exact:true}).click();await expect(dialog.getByLabel(s.deductions,{exact:true})).toBeVisible();await expect(dialog.getByLabel(s.payout,{exact:true})).toBeVisible();await expect(dialog.getByText(s.taxWarning,{exact:true})).toBeVisible();await dialog.getByRole("switch",{name:`${s.basis}: ${s.gross}`,exact:true}).click();await expect(dialog.getByRole("button",{name:s.payrollCosts,exact:true})).toHaveAttribute("aria-expanded","true");
      await dialog.getByRole("combobox",{name:s.costStatus,exact:true}).click();await page.getByRole("option",{name:s.costHas,exact:true}).click();await expect(dialog.getByLabel(s.employerCostAmount,{exact:true})).toBeVisible();await dialog.getByRole("combobox",{name:s.costStatus,exact:true}).click();await page.getByRole("option",{name:s.costUnknown,exact:true}).click();await expect(dialog.getByLabel(s.employerCostAmount,{exact:true})).toBeHidden();await expect(dialog.getByLabel(s.employerCostAmount,{exact:true})).toBeDisabled();
      firstStartMonth=await startMonth.inputValue();await dialog.getByLabel(s.hasEndDate,{exact:true}).check();const endMonth=dialog.getByLabel(s.endDate,{exact:true});await expect(endMonth).toHaveAttribute("type","month");await endMonth.fill("2027-02");
      const submittedStart=dialog.locator('input[name="effectiveFrom"]');await submittedStart.evaluate((input:HTMLInputElement)=>{input.value=`${input.value.slice(0,7)}-10`;});await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog.getByRole("alert")).toHaveText(s.errors.effectiveFromInput);await startMonth.fill("");await startMonth.fill(firstStartMonth);
    }
    if(cost==="none"){await dialog.getByLabel(s.remittances,{exact:true}).fill("0");await dialog.getByRole("combobox",{name:s.costStatus,exact:true}).click();await page.getByRole("option",{name:s.costNone,exact:true}).click();}
    await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  }
  await salary("Payroll employee","unknown",true);await salary("Payroll admin","none");
  expect(sql(`select h.effective_from||'|'||h.effective_through from public.finance_schedule_history h join public.finance_schedules s on s.studio_id=h.studio_id and s.id=h.schedule_id where h.studio_id='${studio}' and s.employee_id='${actors[1].id}' and h.revision=1`)).toBe(`${firstStartMonth}-01|2027-02-28`);
  sql(`update public.studio_members set joined_at='2026-05-20' where studio_id='${studio}' and user_id='${actors[1].id}'`);
  expect(sql(`select effective_from from public.finance_schedule_history h join public.finance_schedules s on s.studio_id=h.studio_id and s.id=h.schedule_id where h.studio_id='${studio}' and s.employee_id='${actors[1].id}' and h.revision=1`)).toBe(`${firstStartMonth}-01`);
  const row=page.locator("article").filter({hasText:"Payroll employee"});
  await expect(page.getByRole("button",{name:s.generate,exact:true})).toHaveCount(0);
  expect(sql(`select count(*)>0 and count(*)=count(distinct employee_id::text||':'||period_start::text) from public.finance_obligations where studio_id='${studio}' and kind='payroll'`)).toBe("t");
  expect(sql(`select count(*) from public.finance_movements where studio_id='${studio}'`)).toBe("0");
  expect(sql(`select count(*) from public.finance_schedule_terms where studio_id='${studio}' and employer_cost is null and employer_cost_status='unknown'`)).toBe("1");
  expect(sql(`select count(*) from public.finance_schedule_terms where studio_id='${studio}' and employer_cost=0 and employer_cost_status='fixed'`)).toBe("1");
  // Revisions are explicit and cannot rewrite this month's existing obligations.
  await row.getByRole("button",{name:s.revise,exact:true}).click();let dialog=page.getByRole("dialog");await expect(dialog.getByLabel(s.effectiveFrom,{exact:true})).toHaveAttribute("type","month");await expect(dialog.getByLabel(s.effectiveFrom,{exact:true})).toHaveValue("2026-10");await expect(dialog.getByLabel(s.endDate,{exact:true})).toHaveValue("2027-02");await dialog.getByLabel(s.agreedAmount,{exact:true}).fill("1200");await expect(dialog.getByLabel(s.payout,{exact:true})).toHaveCount(0);await dialog.getByRole("button",{name:s.note,exact:true}).click();await dialog.getByRole("textbox",{name:s.note,exact:true}).fill("Salary increase next month");await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from public.finance_schedule_terms where studio_id='${studio}'`)).toBe("3");
  expect(sql(`select string_agg(o.period_start||':'||i.amount,',' order by o.period_start) from public.finance_expected_items i join public.finance_obligation_items oi on oi.studio_id=i.studio_id and oi.expected_item_id=i.id join public.finance_obligations o on o.studio_id=oi.studio_id and o.id=oi.obligation_id where i.studio_id='${studio}' and o.employee_id='${actors[1].id}' and oi.component='payout' and o.period_start in ('2026-09-01','2026-10-01')`)).toBe("2026-09-01:1000,2026-10-01:1200");
  await page.getByRole("button",{name:s.addBonus,exact:true}).first().click();dialog=page.getByRole("dialog");await dialog.getByRole("combobox",{name:s.employee,exact:true}).click();await page.getByRole("option",{name:"Payroll employee",exact:true}).click();await dialog.getByLabel(t.movements.amount,{exact:true}).fill("75");await dialog.getByRole("button",{name:s.note,exact:true}).click();await dialog.getByLabel(t.movements.description,{exact:true}).fill("Manual employee award");await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:s.addRecurring,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(s.name,{exact:true}).fill("Google Drive");await dialog.getByLabel(t.movements.amount,{exact:true}).fill("50");await dialog.getByRole("combobox",{name:t.planning.currency,exact:true}).click();await page.getByRole("option",{name:"USD",exact:true}).click();await dialog.getByLabel(t.planning.estimatedAmount,{exact:true}).check();await dialog.getByRole("combobox",{name:t.movements.category,exact:true}).click();await page.getByRole("option",{name:t.planning.defaults.software,exact:true}).click();await dialog.getByRole("button",{name:s.note,exact:true}).click();await dialog.getByLabel(t.project.reason,{exact:true}).fill("Subscription estimate");await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:s.addRecurring,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(s.name,{exact:true}).fill("Studio rent");await dialog.getByLabel(t.movements.amount,{exact:true}).fill("1000");await dialog.getByRole("combobox",{name:t.movements.category,exact:true}).click();await page.getByRole("option",{name:t.planning.defaults.rent,exact:true}).click();await dialog.getByRole("button",{name:s.note,exact:true}).click();await dialog.getByLabel(t.project.reason,{exact:true}).fill("Rent agreement");await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:s.addRecurring,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(s.name,{exact:true}).fill("Owner draw");await dialog.getByLabel(t.movements.amount,{exact:true}).fill("500");await dialog.getByLabel(t.movements.kinds.owner_withdrawal,{exact:true}).check();await dialog.getByRole("combobox",{name:t.movements.category,exact:true}).click();await page.getByRole("option",{name:t.planning.defaults.owner_distribution,exact:true}).click();await dialog.getByRole("button",{name:s.note,exact:true}).click();await dialog.getByLabel(t.project.reason,{exact:true}).fill("Owner distribution agreement");await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from public.finance_obligations o join public.finance_schedules s on s.studio_id=o.studio_id and s.id=o.schedule_id where o.studio_id='${studio}' and s.kind='recurring'`)).not.toBe("0");
  sql(`insert into public.finance_expected_items(studio_id,direction,amount,currency,category_id,description,due_date,expected_payment_date,commitment,certainty,is_established,created_by)
    select '${studio}','outgoing',amount,'UAH',id,description,due_date,expected_date,'agreed','fixed',true,'${actors[0].id}' from public.finance_categories cross join (values
      (80,'Expected in October','2026-09-25'::date,'2026-10-15'::date),
      (90,'Due in October','2026-10-20'::date,null::date),
      (25,'Old overdue fixture','2026-08-10'::date,'2026-08-10'::date)
    ) fixture(amount,description,due_date,expected_date) where studio_id='${studio}' and default_key='rent' and archived_at is null;`);
  await page.goto("/finance/expected?filter=outgoing");
  await expect(page.locator('details[data-current-month="true"]')).toHaveAttribute("open","");
  const futureOctober=page.locator('details[data-future-month="2026-10"]'),futureOctoberSummary=futureOctober.locator(":scope > summary");await expect(futureOctober).not.toHaveAttribute("open","");await expect(futureOctoberSummary).toContainText("UAH");await expect(futureOctoberSummary).toContainText("USD");await futureOctoberSummary.click();await expect(futureOctober.getByRole("heading",{name:"Google Drive",exact:true})).toBeVisible();await expect(futureOctober.getByRole("heading",{name:"Studio rent",exact:true})).toBeVisible();await expect(futureOctober.getByRole("heading",{name:"Expected in October",exact:true})).toBeVisible();await expect(futureOctober.getByRole("heading",{name:"Due in October",exact:true})).toBeVisible();await expect(futureOctober.getByText(/2026-10/)).toHaveCount(0);
  const oldOverdue=page.locator("article").filter({hasText:"Old overdue fixture"});await expect(oldOverdue).toHaveCount(1);await page.locator('details[data-payment-month="2026-08"] > summary').click();await expect(oldOverdue).toBeVisible();
  const employeeItem=futureOctober.locator("article").filter({has:page.getByRole("heading",{name:new RegExp(`^${s.defaultSalaryName}`)})}).filter({hasText:"Payroll employee"}).filter({hasText:"For September 2026"}).first();
  await employeeItem.locator("summary").click();await expect(employeeItem.getByText(/For September 2026 · Pay by Oct 1/)).toBeVisible();await expect(employeeItem.locator("p").first()).not.toContainText("expected");await expect(employeeItem.getByText(s.period,{exact:true})).toBeVisible();await employeeItem.getByRole("link",{name:t.planning.recordPayment,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(t.movements.amount,{exact:true}).fill("250");await dialog.getByLabel(t.planning.allocateAmount,{exact:true}).fill("250");await dialog.getByRole("button",{name:t.movements.record,exact:true}).click();await expect(dialog).toHaveCount(0);const partialEmployee=page.locator("article").filter({has:page.getByRole("heading",{name:new RegExp(`^${s.defaultSalaryName}`)})}).filter({hasText:"Payroll employee"}).filter({hasText:"For September 2026"}).first();await expect(partialEmployee.getByText(t.planning.states.partial,{exact:true})).toBeVisible();await expect(partialEmployee.getByText(/Settled.*250.*remaining.*750/)).toBeVisible();
  await page.getByRole("link",{name:t.planning.filtersList.all,exact:true}).click();await page.getByRole("link",{name:t.planning.periodFilters["3months"],exact:true}).click();await expect(page).toHaveURL(/period=3months/);await expect(page.locator('[data-future-month]').first()).toBeVisible();
  await page.goto("/finance/expected?filter=outgoing&period=month");
  const ownerItem=page.locator("article").filter({has:page.getByRole("heading",{name:/^Owner draw/})}).first();await ownerItem.locator("summary").click();await ownerItem.getByRole("link",{name:t.planning.recordPayment,exact:true}).click();dialog=page.getByRole("dialog");await expect(dialog.getByText(t.movements.ownerHelp,{exact:true})).toBeVisible();await dialog.getByRole("button",{name:t.movements.record,exact:true}).click();await expect(dialog).toHaveCount(0);const completedCurrent=page.locator('details[data-completed-month="2026-09"]');await expect(completedCurrent).not.toHaveAttribute("open","");await expect(ownerItem).toBeHidden();await completedCurrent.locator(":scope > summary").click();await expect(ownerItem.getByText(t.planning.states.settled,{exact:true})).toBeVisible();await expect(ownerItem.getByText(t.planning.history,{exact:true})).toBeVisible();
  expect(sql(`select count(*) from public.finance_movements where studio_id='${studio}' and kind='owner_withdrawal' and nature='owner_distribution'`)).toBe("1");
  const paymentDate=sql(`select payment_date from public.finance_payroll_calendar where studio_id='${studio}' and employee_id='${actors[0].id}' limit 1`);
  await page.goto(`/calendar?date=${paymentDate}&view=month`);await expect(page.getByText("Payroll reminder · Payroll admin",{exact:true}).first()).toBeVisible();
  const oldCount=sql(`select count(*) from public.finance_obligations where studio_id='${studio}'`);
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.remove_studio_member('${actors[1].id}','[]'::jsonb,true);`);
  await page.goto("/finance/schedules");await expect(row.getByText(/Accruals stopped from/)).toBeVisible();expect(sql(`select count(*) from public.finance_obligations where studio_id='${studio}'`)).toBe(oldCount);
  await page.screenshot({path:testInfo.outputPath("finance-schedules-desktop.png"),fullPage:true});
  await page.setViewportSize({width:375,height:900});await page.emulateMedia({colorScheme:"dark",reducedMotion:"reduce"});await page.context().addCookies([{name:"studioflow-locale",value:"uk",url:"http://127.0.0.1:3100"}]);await page.reload();await expect(page.getByRole("heading",{name:uk.Finance.schedules.title,exact:true})).toBeVisible();await expect(page.getByRole("heading",{name:"Payroll employee",exact:true}).first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath("finance-schedules-mobile.png"),fullPage:true});
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.restore_studio_member('${actors[1].id}');`);
});

test("employee cannot access compensation UI or payroll Calendar",async({page})=>{
  await login(page,1);await page.goto("/finance/schedules");await expect(page).toHaveURL(/\/dashboard/);await expect(page.getByRole("button",{name:s.addCompensation,exact:true})).toHaveCount(0);
  await page.goto("/calendar");await expect(page.getByText(/Payroll reminder ·/)).toHaveCount(0);await expect(page.getByText(s.defaultSalaryName,{exact:true})).toHaveCount(0);await expect(page.getByText("Manual employee award",{exact:true})).toHaveCount(0);
});


test("replacement maintenance, category protection and audited historical costs",async({page})=>{
  await login(page);await page.goto("/finance/schedules");
  const nextMonth=sql("select (date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '1 month')::date");
  const oldFuture=sql(`select string_agg(id::text,',' order by period_start) from public.finance_obligations where studio_id='${studio}' and employee_id='${actors[1].id}' and period_start>='${nextMonth}'`);
  const ledgerBefore=sql(`select jsonb_agg(to_jsonb(m) order by id)::text from public.finance_movements m where studio_id='${studio}'`);
  await page.getByRole("button",{name:s.addCompensation,exact:true}).click();let dialog=page.getByRole("dialog");
  await dialog.getByRole("combobox",{name:s.employee,exact:true}).click();await page.getByRole("option",{name:"Payroll employee",exact:true}).click();
  await dialog.getByLabel(s.agreedAmount,{exact:true}).fill("1300");await dialog.getByRole("button",{name:s.payrollCosts,exact:true}).click();await dialog.getByLabel(s.remittances,{exact:true}).fill("150");
  await dialog.getByLabel(s.effectiveFrom,{exact:true}).fill(nextMonth.slice(0,7));
  await dialog.getByRole("combobox",{name:s.costStatus,exact:true}).click();await page.getByRole("option",{name:s.costNone,exact:true}).click();
  await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  const replacement=sql(`select id from public.finance_schedules where studio_id='${studio}' and employee_id='${actors[1].id}' and stopped_from is null`);
  const replacementIds=sql(`select string_agg(id::text,',' order by period_start) from public.finance_obligations where schedule_id='${replacement}'`).split(",");
  expect(replacementIds).toEqual(expect.arrayContaining(oldFuture.split(",")));
  expect(new Set(replacementIds).size).toBe(replacementIds.length);
  for(const horizon of ["3","6","year","12","12"]){
    sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.ensure_finance_schedule_occurrences('${studio}','${horizon}');`);
  }
  expect(sql(`select count(*) from public.finance_obligations o join public.finance_obligation_items l on l.obligation_id=o.id join public.finance_expected_items i on i.id=l.expected_item_id where o.schedule_id='${replacement}' and l.component='payout' and i.commitment='cancelled'`)).toBe("0");
  expect(sql(`select employee_deductions from public.finance_schedule_terms where schedule_id='${replacement}'`)).toBe("150");
  await page.goto("/finance/categories");const category=page.getByRole("listitem").filter({has:page.getByText(t.planning.defaults.employer_costs,{exact:true})});
  await category.getByRole("button",{name:t.planning.archiveNamed.replace("{name}",t.planning.defaults.employer_costs),exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:t.planning.archive,exact:true}).click();
  await expect(dialog.getByRole("alert")).toHaveText(t.planning.errors.categoryScheduleRequired);await dialog.getByRole("button",{name:t.movements.close,exact:true}).click();
  const historical=sql(`select i.id from public.finance_obligations o join public.finance_obligation_items l on l.obligation_id=o.id join public.finance_expected_items i on i.id=l.expected_item_id where o.studio_id='${studio}' and o.employee_id='${actors[1].id}' and l.component='payout' and o.period_start<date_trunc('month',now() at time zone 'Europe/Kyiv') order by o.period_start limit 1`);
  await page.goto(`/finance/expected?item=${historical}&period=all`);
  const row=page.locator(`#expected-${historical}`);await expect(row).toBeVisible();
  async function complete(component:string,status:string,amount:string){
    const line=row.locator('div').filter({has:page.getByRole("button",{name:s.completeCost,exact:true})}).filter({hasText:component}).last();
    await line.getByRole("button",{name:s.completeCost,exact:true}).click();dialog=page.getByRole("dialog");
    await dialog.getByRole("combobox",{name:s.certainty,exact:true}).click();await page.getByRole("option",{name:status,exact:true}).click();
    await dialog.getByLabel(t.movements.amount,{exact:true}).fill(amount);await dialog.getByLabel(t.movements.reason,{exact:true}).fill("Verified payroll statement");
    await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  }
  await complete(s.components.deductions,s.fixed,"0");
  await complete(s.components.employer_cost,s.estimated,"125");
  await complete(s.components.employer_cost,s.fixed,"130");
  expect(sql(`select count(*) from public.finance_payroll_cost_revisions where studio_id='${studio}'`)).toBe("3");
  expect(sql(`select jsonb_agg(to_jsonb(m) order by id)::text from public.finance_movements m where studio_id='${studio}'`)).toBe(ledgerBefore);
  const paymentDate=sql(`select payment_date from public.finance_payroll_calendar c join public.finance_obligation_items l on l.expected_item_id=c.expected_item_id join public.finance_obligations o on o.id=l.obligation_id where o.schedule_id='${replacement}' order by payment_date limit 1`);
  await page.goto(`/calendar?date=${paymentDate}&view=month`);await expect(page.getByText("Payroll reminder · Payroll employee",{exact:true}).first()).toBeVisible();
  await page.goto("/finance/planning");await expect(page.getByRole("heading",{name:en.Finance.forecast.title,exact:true})).toBeVisible();
});

// Use the same local tenant and guarded RPCs for reproducible visual/interaction QA.
test.describe("compensation visual QA", () => {
  test.beforeAll(() => {
    if (sql(`select count(*) from finance_schedules where studio_id='${studio}'`) === "0") {
    const rules = [
      { name: "Base salary", amount: "50000", category: "salary", employee: actors[0].id },
      { name: "Base salary", amount: "35000", category: "salary", employee: actors[1].id },
      { name: "Base salary", amount: "45000", category: "salary", employee: actors[2].id },
      { name: "Studio rent", amount: "40000", category: "rent", employee: "" },
      { name: "Utilities", amount: "4000", category: "utilities", employee: "" },
      { name: "Cleaning", amount: "2000", category: "cleaning", employee: "" },
      { name: "Water", amount: "500", category: "other_expense", employee: "" },
      { name: "Coffee", amount: "1000", category: "other_expense", employee: "" },
      { name: "Milk", amount: "400", category: "other_expense", employee: "" },
      { name: "Google Drive", amount: "50", category: "software", employee: "" },
      { name: "Owner draw", amount: "500", category: "owner_distribution", employee: "" },
    ];
    for (const rule of rules) {
      const categoryId = sql(`select id from finance_categories where studio_id='${studio}' and default_key='${rule.category}'`);
      const input = { name: rule.name, amount: rule.amount, currency: ["software", "owner_distribution"].includes(rule.category) ? "USD" : "UAH", categoryId, kind: rule.employee ? "payroll" : "recurring", employeeId: rule.employee, basis: rule.employee === actors[1].id ? "gross" : rule.employee ? "net" : "", employeePayout: rule.employee === actors[1].id ? "28000" : rule.employee ? rule.amount : "", employeeDeductions: rule.employee === actors[1].id ? "7000" : "", employerCostStatus: rule.employee === actors[1].id ? "fixed" : "unknown", employerCost: rule.employee === actors[1].id ? "7700" : "", intervalMonths: 1, payoutDay: 10, paymentMonthOffset: rule.employee ? 1 : 0, effectiveFrom: "2026-09-01", commitment: "agreed", certainty: rule.category === "software" ? "estimated" : "fixed", reason: "Visual fixture", revision: 0 };
      sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select save_finance_schedule('${studio}','${randomUUID()}','${JSON.stringify(input)}'::jsonb);`);
    }
    }
    for (const groupName of ["Office", "Software & subscriptions", "Owner", "Marketing"]) {
      const id = randomUUID();
      sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select manage_finance_recurring_group('${studio}','create','${id}','${groupName}');select manage_finance_recurring_group('${studio}','assign','${id}',null,s.id) from finance_schedules s join finance_schedule_terms t on t.schedule_id=s.id where s.studio_id='${studio}' and s.kind='recurring' and ${groupName === "Office" ? "t.name not in ('Google Drive','Owner draw')" : groupName === "Owner" ? "t.name='Owner draw'" : groupName === "Software & subscriptions" ? "t.name='Google Drive'" : "false"};`);
    }
  });
  for (const locale of ["en", "uk"] as const) for (const theme of ["light", "dark"] as const) for (const width of [1920, 2560, 375]) {
    test(`${locale} ${theme} ${width}`, async ({ page }, testInfo) => {
      const f = (locale === "uk" ? uk : en).Finance, labels = f.schedules;
      await page.setViewportSize({ width, height: width === 2560 ? 1440 : width === 375 ? 900 : 1080 });
      await page.addInitScript((value) => localStorage.setItem("studioflow-theme", value), theme);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.context().addCookies([{ name: "studioflow-locale", value: locale, url: "http://127.0.0.1:3100" }]);
      await login(page); await page.goto("/finance/schedules");
      await expect(page.getByRole("heading", { name: labels.payrollSection, exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: labels.recurringSection, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const nextId = sql(`select i.id from finance_expected_balances i join finance_obligation_items l on l.expected_item_id=i.id join finance_obligations o on o.id=l.obligation_id join finance_schedule_terms r on r.id=o.terms_id where i.studio_id='${studio}' and r.name='Studio rent' and i.commitment<>'cancelled' and i.remaining_amount>0 and coalesce(i.expected_payment_date,i.due_date)>=(now() at time zone 'Europe/Kyiv')::date order by coalesce(i.expected_payment_date,i.due_date) limit 1`);
      await expect(page.locator("article").filter({ has: page.getByRole("heading", { name: "Studio rent", exact: true }) }).getByRole("link")).toHaveAttribute("href", `/finance/expected?item=${nextId}&period=all`);
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath("rules.png"), fullPage: true });
      const screenshot = async (name: string) => {
        const dialog = page.getByRole("dialog");
        expect(await dialog.locator("[aria-hidden][style]").evaluateAll((nodes) => nodes.every((node) => node.scrollTop === 0))).toBe(true);
        await dialog.locator("form").evaluate((form) => form.parentElement?.scrollTo(0, 0));
        await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`${name}.png`) });
        await dialog.getByRole("button", { name: f.planning.save, exact: true }).scrollIntoViewIfNeeded();
        const bounds = await dialog.getByRole("button", { name: f.planning.save, exact: true }).boundingBox();
        expect(bounds && bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        if (width === 375) await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`${name}-bottom.png`) });
      };
      const close = () => page.getByRole("dialog").getByRole("button", { name: f.movements.close, exact: true }).first().click();
      await page.getByRole("button", { name: labels.setupTeam, exact: true }).click();
      const setup = page.getByRole("dialog");
      await setup.getByRole("group", { name: "Payroll architect", exact: true }).getByLabel(labels.agreedAmount, { exact: true }).fill("48000");
      await setup.getByRole("group", { name: "Payroll assistant", exact: true }).getByLabel(labels.agreedAmount, { exact: true }).fill("30000");
      await setup.locator("form").evaluate((form) => form.parentElement?.scrollTo(0, 0));
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath("team-setup.png") });
      await setup.getByRole("button", { name: labels.setupSave, exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath("team-setup-bottom.png") });
      await close();
      await page.getByRole("button", { name: labels.addCompensation, exact: true }).click();
      let dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox", { name: labels.employee, exact: true }).click();
      await page.getByRole("option", { name: "Payroll admin", exact: true }).click();
      await dialog.getByLabel(labels.agreedAmount, { exact: true }).fill("50000");
      await expect(dialog.getByLabel(labels.remittances, { exact: true })).toBeHidden();
      await screenshot("net-salary");
      await dialog.getByRole("switch").click();
      await dialog.getByLabel(labels.deductions, { exact: true }).fill("10000");
      await dialog.getByLabel(labels.payout, { exact: true }).fill("40000");
      await dialog.getByRole("combobox", { name: labels.costStatus, exact: true }).click();
      await page.getByRole("option", { name: labels.costHas, exact: true }).click();
      await dialog.getByLabel(labels.employerCostAmount, { exact: true }).fill("11000");
      await screenshot("gross-salary"); await close();
      await page.locator("article").filter({ has: page.getByRole("heading", { name: "Payroll admin", exact: true }) }).getByRole("button", { name: labels.revise, exact: true }).click();
      dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: labels.reviseCompensation, exact: true })).toBeVisible();
      await expect(dialog.getByLabel(labels.effectiveFrom, { exact: true })).toHaveAttribute("type", "month");
      await screenshot("salary-revision"); await close();
      await page.getByRole("button", { name: labels.addBonus, exact: true }).first().click();
      dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox", { name: labels.employee, exact: true }).click();
      await page.getByRole("option", { name: "Payroll employee", exact: true }).click();
      await dialog.getByLabel(f.movements.amount, { exact: true }).fill("1000");
      await expect(dialog.getByRole("switch")).toHaveCount(0);
      await screenshot("bonus"); await close();
      await page.getByRole("button", { name: labels.addRecurring, exact: true }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel(labels.name, { exact: true }).fill("Studio rent");
      await dialog.getByLabel(f.movements.amount, { exact: true }).fill("40000");
      await expect(dialog.getByLabel(labels.effectiveFrom, { exact: true })).toHaveAttribute("type", "month");
      await dialog.getByRole("combobox", { name: f.movements.category, exact: true }).click();
      await page.getByRole("option", { name: f.planning.defaults.rent, exact: true }).click();
      await screenshot("fixed-recurring");
      await dialog.getByLabel(labels.name, { exact: true }).fill("Utilities");
      await dialog.getByLabel(f.movements.amount, { exact: true }).fill("12000");
      await dialog.getByLabel(f.planning.estimatedAmount, { exact: true }).check();
      await dialog.getByLabel(f.planning.plannedPayment, { exact: true }).check();
      await dialog.getByLabel(labels.hasEndDate, { exact: true }).check();
      await dialog.getByLabel(labels.endDate, { exact: true }).fill("2028-02");
      expect(await dialog.locator("form").evaluate((form: HTMLFormElement) => Object.fromEntries(new FormData(form)))).toMatchObject({ certainty: "estimated", commitment: "tentative", effectiveFrom: "2026-09-01", effectiveThrough: "2028-02-29" });
      await screenshot("estimated-recurring");
      await dialog.getByLabel(f.movements.kinds.owner_withdrawal, { exact: true }).check();
      await expect(dialog.getByText(f.movements.ownerHelp, { exact: true })).toBeVisible();
      await dialog.getByLabel(labels.name, { exact: true }).fill("Owner withdrawal");
      await dialog.getByLabel(f.movements.amount, { exact: true }).fill("500");
      await dialog.getByLabel(f.planning.estimatedAmount, { exact: true }).uncheck();
      await dialog.getByLabel(f.planning.plannedPayment, { exact: true }).uncheck();
      await dialog.getByLabel(labels.hasEndDate, { exact: true }).uncheck();
      await dialog.getByRole("combobox", { name: f.planning.currency, exact: true }).click();
      await page.getByRole("option", { name: "USD", exact: true }).click();
      await dialog.getByRole("combobox", { name: f.movements.category, exact: true }).click();
      await page.getByRole("option", { name: f.planning.defaults.owner_distribution, exact: true }).click();
      await screenshot("owner-withdrawal"); await close();
      await page.locator("article").filter({ has: page.getByRole("heading", { name: "Studio rent", exact: true }) }).getByRole("button", { name: labels.revise, exact: true }).click();
      await screenshot("recurring-revision"); await close();
      const history = page.locator("article").filter({ has: page.getByRole("heading", { name: "Payroll admin", exact: true }) }).getByRole("button", { name: labels.history, exact: true });
      await history.focus(); await page.keyboard.press("Enter");
      await expect(history).toHaveAttribute("aria-expanded", "true");
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath("history.png"), fullPage: true });
      await page.getByRole("checkbox", { name: labels.selectRule.replace("{name}", "Studio rent"), exact: true }).check();
      await page.getByRole("checkbox", { name: labels.selectRule.replace("{name}", "Google Drive"), exact: true }).check();
      await expect(page.getByRole("region", { name: "Marketing", exact: true }).getByText(labels.groupEmpty, { exact: true })).toBeVisible();
      await page.getByRole("region", { name: labels.recurringSection, exact: true }).getByRole("status").scrollIntoViewIfNeeded();
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath("selection.png"), fullPage: true });
      await page.getByRole("button", { name: labels.moveSelected, exact: true }).filter({ hasText: labels.moveSelected }).click();
      await screenshot("bulk-move"); await close();
      await page.getByRole("button", { name: labels.clearSelection, exact: true }).click();
      const recurringHistory = page.locator("article").filter({ has: page.getByRole("heading", { name: "Studio rent", exact: true }) }).getByRole("button", { name: labels.history, exact: true });
      await recurringHistory.click();
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath("recurring-details.png"), fullPage: true });
    });
  }
});
