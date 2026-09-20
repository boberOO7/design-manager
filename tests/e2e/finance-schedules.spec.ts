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
const actors=["admin","employee"].map((role)=>({role,id:"",email:`payroll-${randomUUID()}@example.test`,password:`Finance-${randomUUID()}`}));
function sql(statement:string){return execFileSync("docker",["exec","-i","supabase_db_design-manager","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-At"],{input:statement,encoding:"utf8"}).trim();}
const t=en.Finance,s=t.schedules;
async function login(page:Page,index=0){await page.goto("/login");await page.locator('input[type="email"]').fill(actors[index].email);await page.locator('input[type="password"]').fill(actors[index].password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);}

test.beforeAll(async()=>{
  await client.from("studios").insert({id:studio,name:"Payroll browser test"}).throwOnError();
  for(const actor of actors){
    const {data,error}=await client.auth.admin.createUser({email:actor.email,password:actor.password,email_confirm:true});if(error)throw error;actor.id=data.user.id;
    await client.from("profiles").upsert({id:actor.id,email:actor.email,full_name:`Payroll ${actor.role}`,system_role:actor.role,is_active:true}).throwOnError();
    await client.from("studio_members").insert({studio_id:studio,user_id:actor.id,system_role:actor.role,joined_at:"2026-01-15"}).throwOnError();
  }
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','UAH','2026-01-01','${actors[0].id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${bank}','${studio}','Payroll bank','UAH',10000,'${actors[0].id}');
    select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.finalize_finance_setup('${studio}');`);
});
test.afterAll(async()=>{
  // Local fixture-only cleanup; preserve production's immutable financial history.
  sql(`begin;set local session_replication_role=replica;
    delete from public.finance_obligation_items where studio_id='${studio}';delete from public.finance_obligations where studio_id='${studio}';
    delete from public.finance_schedule_terms where studio_id='${studio}';delete from public.finance_schedules where studio_id='${studio}';
    delete from public.finance_allocations where studio_id='${studio}';delete from public.finance_expected_items where studio_id='${studio}';
    delete from public.finance_planning_requests where studio_id='${studio}';delete from public.finance_movement_entries where studio_id='${studio}';
    delete from public.finance_movements where studio_id='${studio}';delete from public.finance_accounts where studio_id='${studio}';
    delete from public.finance_categories where studio_id='${studio}';delete from public.finance_settings where studio_id='${studio}';
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
    await expect(dialog.getByRole("switch",{name:`${s.basis}: ${s.net}`,exact:true})).toBeVisible();await expect(dialog.getByLabel(s.payout,{exact:true})).toHaveCount(0);await expect(dialog.getByLabel(s.deductions,{exact:true})).toHaveCount(0);
    if(inspect){
      await dialog.getByRole("switch",{name:`${s.basis}: ${s.net}`,exact:true}).click();await expect(dialog.getByLabel(s.deductions,{exact:true})).toBeVisible();await expect(dialog.getByLabel(s.payout,{exact:true})).toBeVisible();await expect(dialog.getByText(s.taxWarning,{exact:true})).toBeVisible();await dialog.getByRole("switch",{name:`${s.basis}: ${s.gross}`,exact:true}).click();
      await dialog.getByRole("combobox",{name:s.costStatus,exact:true}).click();await page.getByRole("option",{name:s.costHas,exact:true}).click();await expect(dialog.getByLabel(s.employerCostAmount,{exact:true})).toBeVisible();await dialog.getByRole("combobox",{name:s.costStatus,exact:true}).click();await page.getByRole("option",{name:s.costUnknown,exact:true}).click();await expect(dialog.getByLabel(s.employerCostAmount,{exact:true})).toHaveCount(0);
      firstStartMonth=await startMonth.inputValue();await dialog.getByLabel(s.hasEndDate,{exact:true}).check();const endMonth=dialog.getByLabel(s.endDate,{exact:true});await expect(endMonth).toHaveAttribute("type","month");await endMonth.fill("2027-02");
      const submittedStart=dialog.locator('input[name="effectiveFrom"]');await submittedStart.evaluate((input:HTMLInputElement)=>{input.value=`${input.value.slice(0,7)}-10`;});await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog.getByRole("alert")).toHaveText(s.errors.effectiveFromInput);await startMonth.fill("");await startMonth.fill(firstStartMonth);
    }
    if(cost==="none"){await dialog.getByRole("combobox",{name:s.costStatus,exact:true}).click();await page.getByRole("option",{name:s.costNone,exact:true}).click();}
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
  await row.getByRole("button",{name:s.revise,exact:true}).click();let dialog=page.getByRole("dialog");await expect(dialog.getByLabel(s.effectiveFrom,{exact:true})).toHaveAttribute("type","month");await expect(dialog.getByLabel(s.effectiveFrom,{exact:true})).toHaveValue("2026-10");await expect(dialog.getByLabel(s.endDate,{exact:true})).toHaveValue("2027-02");await dialog.getByLabel(s.agreedAmount,{exact:true}).fill("1200");await expect(dialog.getByLabel(s.payout,{exact:true})).toHaveCount(0);await dialog.getByLabel(s.note,{exact:true}).fill("Salary increase next month");await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from public.finance_schedule_terms where studio_id='${studio}'`)).toBe("3");
  expect(sql(`select string_agg(o.period_start||':'||i.amount,',' order by o.period_start) from public.finance_expected_items i join public.finance_obligation_items oi on oi.studio_id=i.studio_id and oi.expected_item_id=i.id join public.finance_obligations o on o.studio_id=oi.studio_id and o.id=oi.obligation_id where i.studio_id='${studio}' and o.employee_id='${actors[1].id}' and oi.component='payout' and o.period_start in ('2026-09-01','2026-10-01')`)).toBe("2026-09-01:1000,2026-10-01:1200");
  await page.getByRole("button",{name:s.addBonus,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByRole("combobox",{name:s.employee,exact:true}).click();await page.getByRole("option",{name:"Payroll employee",exact:true}).click();await dialog.getByLabel(t.movements.amount,{exact:true}).fill("75");await dialog.getByLabel(t.movements.description,{exact:true}).fill("Manual employee award");await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:s.addRecurring,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(s.name,{exact:true}).fill("Google Drive");await dialog.getByLabel(t.movements.amount,{exact:true}).fill("50");await dialog.getByRole("combobox",{name:t.currency,exact:true}).click();await page.getByRole("option",{name:"USD",exact:true}).click();await dialog.getByRole("combobox",{name:s.certainty,exact:true}).click();await page.getByRole("option",{name:s.estimated,exact:true}).click();await dialog.getByRole("combobox",{name:t.movements.category,exact:true}).click();await page.getByRole("option",{name:t.planning.defaults.software,exact:true}).click();await dialog.getByLabel(t.project.reason,{exact:true}).fill("Subscription estimate");await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:s.addRecurring,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(s.name,{exact:true}).fill("Studio rent");await dialog.getByLabel(t.movements.amount,{exact:true}).fill("1000");await dialog.getByRole("combobox",{name:t.movements.category,exact:true}).click();await page.getByRole("option",{name:t.planning.defaults.rent,exact:true}).click();await dialog.getByLabel(t.project.reason,{exact:true}).fill("Rent agreement");await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:s.addRecurring,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(s.name,{exact:true}).fill("Owner draw");await dialog.getByLabel(t.movements.amount,{exact:true}).fill("500");await dialog.getByLabel(t.movements.kinds.owner_withdrawal,{exact:true}).check();await dialog.getByRole("combobox",{name:t.movements.category,exact:true}).click();await page.getByRole("option",{name:t.planning.defaults.owner_distribution,exact:true}).click();await dialog.getByLabel(t.project.reason,{exact:true}).fill("Owner distribution agreement");await dialog.getByRole("button",{name:t.planning.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from public.finance_obligations o join public.finance_schedules s on s.studio_id=o.studio_id and s.id=o.schedule_id where o.studio_id='${studio}' and s.kind='recurring'`)).not.toBe("0");
  sql(`insert into public.finance_expected_items(studio_id,direction,amount,currency,category_id,description,due_date,expected_payment_date,commitment,certainty,is_established,created_by)
    select '${studio}','outgoing',amount,'UAH',id,description,due_date,expected_date,'agreed','fixed',true,'${actors[0].id}' from public.finance_categories cross join (values
      (80,'Expected in October','2026-09-25'::date,'2026-10-15'::date),
      (90,'Due in October','2026-10-20'::date,null::date),
      (25,'Old overdue fixture','2026-08-10'::date,'2026-08-10'::date)
    ) fixture(amount,description,due_date,expected_date) where studio_id='${studio}' and default_key='rent' and archived_at is null;`);
  await page.goto("/finance/expected?filter=outgoing");
  await expect(page.getByRole("heading",{name:new RegExp(`^${t.planning.sections.current}`)})).toBeVisible();
  await expect(page.getByRole("heading",{name:new RegExp(`^${t.planning.sections.future}`)})).toBeVisible();
  const futureOctober=page.locator('details[data-future-month="2026-10"]'),futureOctoberSummary=futureOctober.locator(":scope > summary");await expect(futureOctober).not.toHaveAttribute("open","");await expect(futureOctoberSummary).toContainText("UAH");await expect(futureOctoberSummary).toContainText("USD");await futureOctoberSummary.click();await expect(futureOctober.getByRole("heading",{name:"Google Drive",exact:true})).toBeVisible();await expect(futureOctober.getByRole("heading",{name:"Studio rent",exact:true})).toBeVisible();await expect(futureOctober.getByRole("heading",{name:"Expected in October",exact:true})).toBeVisible();await expect(futureOctober.getByRole("heading",{name:"Due in October",exact:true})).toBeVisible();await expect(futureOctober.getByText(/2026-10/)).toHaveCount(0);
  const employeeItem=futureOctober.locator("article").filter({has:page.getByRole("heading",{name:new RegExp(`^${s.defaultSalaryName}`)})}).filter({hasText:"Payroll employee"}).filter({hasText:"For September 2026"}).first();
  await expect(employeeItem.getByText(/For September 2026 · Pay by Oct 1/)).toBeVisible();await expect(employeeItem.locator("p").first()).not.toContainText("expected");await employeeItem.getByText(t.planning.details,{exact:true}).click();await expect(employeeItem.getByText(s.period,{exact:true})).toBeVisible();await employeeItem.getByRole("link",{name:t.planning.recordPayment,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(t.movements.amount,{exact:true}).fill("250");await dialog.getByLabel(t.planning.allocateAmount,{exact:true}).fill("250");await dialog.getByRole("button",{name:t.movements.record,exact:true}).click();await expect(dialog).toHaveCount(0);const partialEmployee=page.locator("article").filter({has:page.getByRole("heading",{name:new RegExp(`^${s.defaultSalaryName}`)})}).filter({hasText:"Payroll employee"}).filter({hasText:"For September 2026"}).first();await expect(partialEmployee.getByText(t.planning.states.partial,{exact:true})).toBeVisible();await expect(partialEmployee.getByText(/Settled.*250.*remaining.*750/)).toBeVisible();
  await page.getByRole("link",{name:t.planning.periodFilters["3months"],exact:true}).click();await expect(page).toHaveURL(/period=3months/);await expect(page.getByRole("heading",{name:new RegExp(`^${t.planning.sections.future}`)})).toBeVisible();
  await page.getByRole("link",{name:t.planning.periodFilters.month,exact:true}).click();await expect(page).toHaveURL(/period=month/);const oldOverdue=page.locator("article").filter({has:page.getByRole("heading",{name:"Old overdue fixture",exact:true})});await expect(oldOverdue).toBeVisible();await expect(oldOverdue).toHaveCount(1);
  const ownerItem=page.locator("article").filter({has:page.getByRole("heading",{name:/^Owner draw/})}).first();await ownerItem.getByRole("link",{name:t.planning.recordPayment,exact:true}).click();dialog=page.getByRole("dialog");await expect(dialog.getByText(t.movements.ownerHelp,{exact:true})).toBeVisible();await dialog.getByRole("button",{name:t.movements.record,exact:true}).click();await expect(dialog).toHaveCount(0);const completedCurrent=page.locator("details[data-settled-current]");await expect(completedCurrent).not.toHaveAttribute("open","");await expect(ownerItem).toBeHidden();await completedCurrent.locator(":scope > summary").click();await expect(ownerItem.getByText(t.planning.states.settled,{exact:true})).toBeVisible();await ownerItem.getByText(t.planning.details,{exact:true}).click();await expect(ownerItem.getByText(t.planning.history,{exact:true})).toBeVisible();
  expect(sql(`select count(*) from public.finance_movements where studio_id='${studio}' and kind='owner_withdrawal' and nature='owner_distribution'`)).toBe("1");
  const paymentDate=sql(`select payment_date from public.finance_payroll_calendar where studio_id='${studio}' and employee_id='${actors[0].id}' limit 1`);
  await page.goto(`/calendar?date=${paymentDate}&view=month`);await expect(page.getByText("Payroll reminder · Payroll admin",{exact:true}).first()).toBeVisible();
  const oldCount=sql(`select count(*) from public.finance_obligations where studio_id='${studio}'`);
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.remove_studio_member('${actors[1].id}','[]'::jsonb,true);`);
  await page.goto("/finance/schedules");await expect(row.getByText(/Schedule stopped from/)).toBeVisible();expect(sql(`select count(*) from public.finance_obligations where studio_id='${studio}'`)).toBe(oldCount);
  await page.screenshot({path:testInfo.outputPath("finance-schedules-desktop.png"),fullPage:true});
  await page.setViewportSize({width:375,height:900});await page.emulateMedia({colorScheme:"dark",reducedMotion:"reduce"});await page.context().addCookies([{name:"studioflow-locale",value:"uk",url:"http://127.0.0.1:3100"}]);await page.reload();await expect(page.getByRole("heading",{name:uk.Finance.schedules.title,exact:true})).toBeVisible();await expect(page.getByRole("heading",{name:uk.Finance.schedules.defaultSalaryName,exact:true}).first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath("finance-schedules-mobile.png"),fullPage:true});
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.restore_studio_member('${actors[1].id}');`);
});

test("employee cannot access compensation UI or payroll Calendar",async({page})=>{
  await login(page,1);await page.goto("/finance/schedules");await expect(page).toHaveURL(/\/dashboard/);await expect(page.getByRole("button",{name:s.addCompensation,exact:true})).toHaveCount(0);
  await page.goto("/calendar");await expect(page.getByText(/Payroll reminder ·/)).toHaveCount(0);await expect(page.getByText(s.defaultSalaryName,{exact:true})).toHaveCount(0);await expect(page.getByText("Manual employee award",{exact:true})).toHaveCount(0);
});
