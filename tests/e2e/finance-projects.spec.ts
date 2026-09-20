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

test("project agreements, shared settlement, supervision, bonus and archived collections",async({page},testInfo)=>{
  const t=en.Finance,p=t.project,plan=t.planning;
  const actor=actors[0];
  await page.goto("/login");await page.locator('input[type="email"]').fill(actor.email);await page.locator('input[type="password"]').fill(actor.password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
  const projectHref=`/projects/${projectId}?view=finance`;
  await page.goto(projectHref);
  await expect(page.getByRole("navigation",{name:en.ProjectWorkspace.navigation,exact:true}).getByRole("link",{name:en.ProjectWorkspace.finance,exact:true})).toBeVisible();
  await page.getByRole("button",{name:p.editAgreement,exact:true}).click();
  let dialog=page.getByRole("dialog");
  await dialog.getByLabel(p.contract,{exact:true}).fill("1000");await dialog.getByLabel(p.reason,{exact:true}).fill("Signed design scope");await dialog.getByRole("button",{name:plan.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  async function createPayment(amount:string,name:string,dated=false){
    await page.getByRole("button",{name:plan.create,exact:true}).click();dialog=page.getByRole("dialog");
    await dialog.getByLabel(t.movements.amount,{exact:true}).fill(amount);await dialog.getByLabel(t.movements.description,{exact:true}).fill(name);
    if(dated){await dialog.getByRole("combobox",{name:plan.dueDate,exact:true}).click();await dialog.getByRole("gridcell",{name:"1",exact:true}).first().click();await dialog.getByRole("combobox",{name:plan.expectedDate,exact:true}).click();await dialog.getByRole("gridcell",{name:"30",exact:true}).first().click();}
    await dialog.getByRole("button",{name:plan.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  }
  await createPayment("400","Advance",true);await createPayment("300","After concept");
  expect(sql(`select concat(scheduled_amount,'|',unscheduled_amount,'|',outstanding_amount,'|',planned_amount) from public.finance_project_totals where project_id='${projectId}' and stream='design'`)).toBe("700|300|400|300");
  const advance=page.locator("article").filter({has:page.getByRole("heading",{name:"Advance",exact:true})});
  await advance.getByRole("link",{name:plan.recordPayment,exact:true}).click();dialog=page.getByRole("dialog");
  await dialog.getByLabel(t.movements.amount,{exact:true}).fill("150");await dialog.getByLabel(plan.allocateAmount,{exact:true}).fill("150");await dialog.getByRole("button",{name:t.movements.record,exact:true}).click();await expect(page).toHaveURL(new RegExp(`/projects/${projectId}.*view=finance`));
  await expect(advance.getByText(plan.states.partial,{exact:true})).toBeVisible();
  expect(sql(`select concat(collected_amount,'|',outstanding_amount) from public.finance_project_totals where project_id='${projectId}' and stream='design'`)).toBe("150|250");
  await page.goto("/finance/movements");await page.getByRole("button",{name:t.movements.add,exact:true}).click();dialog=page.getByRole("dialog");
  await dialog.getByLabel(t.movements.amount,{exact:true}).fill("300");await dialog.getByRole("combobox",{name:t.movements.category,exact:true}).click();await page.getByRole("option",{name:plan.defaults.project_payments,exact:true}).click();await dialog.getByText(t.movements.additionalDetails,{exact:true}).click();await dialog.getByLabel(t.movements.description,{exact:true}).fill("Bank receipt");await dialog.getByRole("button",{name:t.movements.record,exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.goto(projectHref);await advance.locator("summary").click();await advance.getByRole("button",{name:plan.match,exact:true}).click();dialog=page.getByRole("dialog");
  await dialog.getByRole("combobox",{name:plan.payment,exact:true}).click();await page.getByRole("option",{name:/Bank receipt/}).click();await dialog.getByRole("button",{name:plan.match,exact:true}).click();await expect(dialog).toHaveCount(0);await page.locator("[data-settled-current] > summary").click();await expect(advance.getByText(plan.states.settled,{exact:true})).toBeVisible();
  expect(sql(`select count(*) from public.finance_movements where studio_id=${studioLiteral}`)).toBe("2");
  await page.getByRole("button",{name:p.editAgreement,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(p.contract,{exact:true}).fill("1200");await dialog.getByLabel(p.reason,{exact:true}).fill("Additional design scope");await dialog.getByRole("button",{name:plan.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(sql(`select concat(contract_amount,'|',scheduled_amount,'|',unscheduled_amount,'|',collected_amount) from public.finance_project_totals where project_id='${projectId}' and stream='design'`)).toBe("1200|700|500|400");
  await page.screenshot({path:testInfo.outputPath("project-finance-design.png"),fullPage:true});
  await page.getByRole("link",{name:p.streams.supervision,exact:true}).click();await page.getByRole("button",{name:p.editSupervision,exact:true}).click();dialog=page.getByRole("dialog");
  await dialog.getByLabel(p.rate,{exact:true}).fill("50");await dialog.getByLabel(p.reason,{exact:true}).fill("Monthly retainer");await dialog.getByRole("button",{name:plan.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:p.generate,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:p.generate,exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from public.finance_project_items where project_id='${projectId}' and source='monthly'`)).toBe("1");
  await page.getByRole("button",{name:p.editSupervision,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByRole("combobox",{name:p.arrangement,exact:true}).click();await page.getByRole("option",{name:p.modes.per_visit,exact:true}).click();await dialog.getByLabel(p.rate,{exact:true}).fill("25");await dialog.getByRole("combobox",{name:p.effectiveFrom,exact:true}).click();await dialog.getByRole("button",{name:/^Next /}).click();await dialog.getByRole("gridcell",{name:"1",exact:true}).first().click();await dialog.getByLabel(p.reason,{exact:true}).fill("Per-visit from October");await dialog.getByRole("button",{name:plan.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:plan.create,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByRole("combobox",{name:p.chargeSource,exact:true}).click();await page.getByRole("option",{name:p.visitCharge,exact:true}).click();await dialog.getByRole("combobox",{name:p.visit,exact:true}).click();await page.getByRole("option",{name:/Inspection visit/}).click();await expect(dialog.getByLabel(t.movements.amount,{exact:true})).toHaveValue("25");await dialog.getByLabel(t.movements.description,{exact:true}).fill("October inspection");await dialog.getByRole("button",{name:plan.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from public.finance_project_items where project_id='${projectId}' and source='visit'`)).toBe("1");
  await page.getByRole("link",{name:p.streams.contractor_bonus,exact:true}).click();await page.getByRole("button",{name:plan.create,exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByRole("combobox",{name:p.contractor,exact:true}).click();await page.getByRole("option",{name:"Studio builder",exact:true}).click();await dialog.getByLabel(t.movements.amount,{exact:true}).fill("80");await dialog.getByLabel(t.movements.description,{exact:true}).fill("Supplier bonus");await dialog.getByRole("button",{name:plan.save,exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(sql(`select concat(outstanding_amount,'|',planned_amount) from public.finance_project_totals where project_id='${projectId}' and stream='contractor_bonus'`)).toBe("0|80");
  sql(`select set_config('request.jwt.claim.sub','${actor.id}',false);update public.projects set status='completed',completed_at='2026-09-10' where id='${projectId}';update public.projects set status='archived',archived_at='2026-09-11' where id='${projectId}';`);
  await page.goto(projectHref);await expect(page.getByRole("button",{name:plan.create,exact:true})).toBeVisible();await createPayment("100","Post-completion collection",true);
  await page.setViewportSize({width:375,height:900});await page.emulateMedia({colorScheme:"dark",reducedMotion:"reduce"});await page.context().addCookies([{name:"studioflow-locale",value:"uk",url:"http://127.0.0.1:3100"}]);await page.reload();
  await expect(page.getByRole("navigation",{name:uk.ProjectWorkspace.navigation,exact:true}).getByRole("link",{name:uk.ProjectWorkspace.finance,exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath("project-finance-mobile.png"),fullPage:true});
});

test("assigned employee cannot see Project Finance or open its view",async({page})=>{
  const actor=actors[1];await page.goto("/login");await page.locator('input[type="email"]').fill(actor.email);await page.locator('input[type="password"]').fill(actor.password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/projects/${projectId}?view=details`);await expect(page.getByRole("navigation",{name:en.ProjectWorkspace.navigation,exact:true}).getByRole("link",{name:en.ProjectWorkspace.finance,exact:true})).toHaveCount(0);
  await page.goto(`/projects/${projectId}?view=finance`);await expect(page.getByRole("button",{name:en.Finance.project.editAgreement,exact:true})).toHaveCount(0);await expect(page.getByText("1200.00",{exact:true})).toHaveCount(0);
});
