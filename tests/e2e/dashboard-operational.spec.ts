import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import type { Database } from "../../src/types/database.types";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["127.0.0.1", "localhost"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local Dashboard fixtures only");
const service = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const populatedStudio = randomUUID(), emptyStudio = randomUUID(), project = randomUUID(), approvedAbsence = randomUUID(), pendingAbsence = randomUUID(), employee = { id: "", email: `dashboard-employee-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` };
const admins = [populatedStudio, emptyStudio].map((studio, index) => ({ studio, id: "", email: `dashboard-admin-${index}-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
function sql(statement: string) { return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim(); }
async function createActor(actor: { id: string; email: string; password: string }, studio: string, role: "admin" | "employee", name: string) {
  const result = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true }); if (result.error) throw result.error;
  actor.id = result.data.user.id;
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: name, system_role: role, is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studio, user_id: actor.id, system_role: role, is_active: true }).throwOnError();
}
async function login(page: Page, actor: { email: string; password: string }) {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://127.0.0.1:3100" }]);
  await page.goto("/login"); await page.locator('input[type="email"]').fill(actor.email); await page.locator('input[type="password"]').fill(actor.password); await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.beforeAll(async () => {
  await service.from("studios").insert([{ id: populatedStudio, name: "Operational Dashboard" }, { id: emptyStudio, name: "Empty Dashboard" }]).throwOnError();
  await createActor(admins[0], populatedStudio, "admin", "Operations admin");
  await createActor(admins[1], emptyStudio, "admin", "Empty admin");
  await createActor(employee, populatedStudio, "employee", "Alex Designer");
  sql(`insert into public.projects(id,studio_id,name,status,total_area_m2,start_date,due_date,created_by) values('${project}','${populatedStudio}','Clinic renewal','active',100,current_date,current_date+5,'${admins[0].id}');
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values
      ('${project}','${employee.id}','designer',0,current_date),
      ('${project}','${admins[0].id}','designer',0,current_date);
    insert into public.tasks(project_id,stage,title,status,priority,assignee_id,created_by) values
      ('${project}','stage_1','Overdue kitchen','in_progress','urgent','${employee.id}','${admins[0].id}'),
      ('${project}','stage_2','Upcoming lobby','todo','normal','${employee.id}','${admins[0].id}'),
      ('${project}','stage_3','Admin coordination','todo','high','${admins[0].id}','${admins[0].id}');
    insert into public.task_deadlines(task_id,target_status,due_date) select id,'internal_review',case title when 'Overdue kitchen' then current_date-1 when 'Upcoming lobby' then current_date+2 else current_date+7 end from public.tasks where project_id='${project}';
    insert into public.crm_leads(studio_id,client_name,first_contact_date,responsible_admin_id,next_contact_at) values
      ('${populatedStudio}','Late CRM client',current_date,'${admins[0].id}',clock_timestamp()-interval '1 day'),
      ('${populatedStudio}','Upcoming CRM client',current_date,'${admins[0].id}',clock_timestamp()+interval '2 days');
    select set_config('request.jwt.claim.sub','${employee.id}',false);
    insert into public.time_off_requests(id,studio_id,user_id,request_type,start_date,end_date,private_note) values
      ('${approvedAbsence}','${populatedStudio}','${employee.id}','day_off',current_date+3,current_date+4,'Dashboard fixture'),
      ('${pendingAbsence}','${populatedStudio}','${employee.id}','day_off',current_date+6,current_date+6,'Dashboard fixture');
    select set_config('request.jwt.claim.sub','${admins[0].id}',false); select public.approve_time_off_request('${approvedAbsence}');
    insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${populatedStudio}','UAH',date_trunc('month',now() at time zone 'Europe/Kyiv')::date,'${admins[0].id}');
    insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values('${populatedStudio}','Main account','UAH',10000,'${admins[0].id}');
    select set_config('request.jwt.claim.sub','${admins[0].id}',false); select public.finalize_finance_setup('${populatedStudio}');
    select public.save_finance_expected_item('${populatedStudio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','1000','currency','UAH','categoryId',(select id from public.finance_categories where studio_id='${populatedStudio}' and default_key='project_payments'),'description','Late client payment','dueDate',current_date-1,'expectedDate',current_date-1,'commitment','agreed','certainty','fixed','established',true));
    select public.save_finance_expected_item('${populatedStudio}',gen_random_uuid(),jsonb_build_object('direction','outgoing','amount','500','currency','UAH','categoryId',(select id from public.finance_categories where studio_id='${populatedStudio}' and default_key='rent'),'description','Late rent','dueDate',current_date-1,'expectedDate',current_date-1,'commitment','agreed','certainty','fixed'));
    select public.save_finance_expected_item('${populatedStudio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','1200','currency','UAH','categoryId',(select id from public.finance_categories where studio_id='${populatedStudio}' and default_key='project_payments'),'description','Upcoming client payment','dueDate',current_date+4,'expectedDate',current_date+4,'commitment','agreed','certainty','fixed','established',true));
    do $$begin for n in 1..5 loop perform public.save_finance_expected_item('${populatedStudio}',gen_random_uuid(),jsonb_build_object('direction','outgoing','amount','100','currency','UAH','categoryId',(select id from public.finance_categories where studio_id='${populatedStudio}' and default_key='rent'),'description','Extra finance '||n,'dueDate',current_date+n,'expectedDate',current_date+n,'commitment','agreed','certainty','fixed')); end loop; end$$;`);
});

test.afterAll(async () => {
  sql(`begin; set local session_replication_role=replica;
    delete from public.notifications where studio_id in ('${populatedStudio}','${emptyStudio}');
    delete from public.time_off_request_reviews where request_id in (select id from public.time_off_requests where studio_id in ('${populatedStudio}','${emptyStudio}'));
    delete from public.time_off_request_approvals where request_id in (select id from public.time_off_requests where studio_id in ('${populatedStudio}','${emptyStudio}'));
    delete from public.time_off_requests where studio_id in ('${populatedStudio}','${emptyStudio}');
    delete from public.crm_lead_history where studio_id in ('${populatedStudio}','${emptyStudio}'); delete from public.crm_leads where studio_id in ('${populatedStudio}','${emptyStudio}');
    delete from public.finance_allocations where studio_id in ('${populatedStudio}','${emptyStudio}'); delete from public.finance_expected_items where studio_id in ('${populatedStudio}','${emptyStudio}');
    delete from public.finance_planning_requests where studio_id in ('${populatedStudio}','${emptyStudio}'); delete from public.finance_movement_entries where studio_id in ('${populatedStudio}','${emptyStudio}'); delete from public.finance_movements where studio_id in ('${populatedStudio}','${emptyStudio}');
    delete from public.finance_accounts where studio_id in ('${populatedStudio}','${emptyStudio}'); delete from public.finance_categories where studio_id in ('${populatedStudio}','${emptyStudio}'); delete from public.finance_settings where studio_id in ('${populatedStudio}','${emptyStudio}');
    delete from public.project_activity where studio_id in ('${populatedStudio}','${emptyStudio}'); delete from public.tasks where project_id='${project}'; delete from public.project_members where project_id='${project}'; delete from public.project_task_stage_columns where project_id='${project}'; delete from public.projects where studio_id in ('${populatedStudio}','${emptyStudio}');
    delete from public.studio_members where studio_id in ('${populatedStudio}','${emptyStudio}'); delete from public.studios where id in ('${populatedStudio}','${emptyStudio}'); commit;`);
  for (const actor of [...admins, employee]) if (actor.id) { const result = await service.auth.admin.deleteUser(actor.id); if (result.error) throw result.error; }
});

test("populated admin Dashboard surfaces actionable domain state and a mixed upcoming feed", async ({ page }) => {
  await login(page, admins[0]);
  await expect(page.getByRole("heading", { name: en.Dashboard.needsAttention })).toBeVisible();
  await expect(page.locator('a[href="#team-workload"]')).toHaveAccessibleName(/overdue task/);
  await expect(page.locator('a[href="/finance/expected?filter=incoming&attention=overdue"]')).toHaveAccessibleName(/overdue receivable/);
  await expect(page.locator('a[href="/finance/expected?filter=outgoing&attention=overdue"]')).toHaveAccessibleName(/overdue obligation/);
  await expect(page.locator('a[href="/crm/leads?attention=1"]')).toHaveAccessibleName(/overdue follow-up/);
  await expect(page.locator('a[href="/admin#requests"]')).toHaveAccessibleName(/time-off request/);
  for (const label of [en.Dashboard.metricActiveProjects, en.Dashboard.metricOpenTasks, en.Dashboard.metricOverdueTasks, en.Dashboard.metricDueThisWeek]) await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: en.Dashboard.attentionProjects })).toBeVisible();
  await expect(page.getByRole("link", { name: /Clinic renewal.*overdue task.*urgent task/ })).toHaveAttribute("href", `/projects/${project}`);
  await expect(page.getByRole("heading", { name: en.Dashboard.myTasks })).toBeVisible();
  await expect(page.getByRole("button", { name: `Admin coordination. ${en.Dashboard.openTaskDetails}` })).toBeVisible();
  await expect(page.getByRole("heading", { name: en.Dashboard.teamWorkload })).toBeVisible();
  await page.getByRole("button", { name: "Alex Designer" }).click();
  await expect(page.getByText("Overdue kitchen", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show 1 Urgent tasks for Alex Designer" }).click();
  await expect(page.getByText("Overdue kitchen", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Alex Designer · Urgent" })).toHaveCount(0);
  await page.getByRole("button", { name: `Admin coordination. ${en.Dashboard.openTaskDetails}` }).click();
  await expect(page.getByRole("dialog", { name: en.Tasks.taskDetails })).toHaveCount(1);
  await page.getByRole("button", { name: en.Tasks.closeTaskDetails }).click();
  const upcoming = page.getByRole("heading", { name: en.Dashboard.upcoming, exact: true }).locator("..").locator("..");
  await expect(upcoming).toContainText("Upcoming lobby");
  await expect(upcoming).toContainText("Extra finance 1");
  await expect(upcoming).toContainText("Extra finance 2");
  await expect(upcoming).not.toContainText("Late rent");
  await expect(upcoming).toContainText("Upcoming client payment");
  await expect(upcoming).toContainText("Upcoming CRM client");
  await expect(upcoming.getByText(/^(Upcoming client payment|Extra finance)/)).toHaveCount(6);
  const availability = page.getByRole("heading", { name: en.Dashboard.upcomingAvailability, exact: true }).locator("..").locator("..");
  await expect(availability).toContainText("Alex Designer");
  await expect(availability.getByRole("link", { name: en.Dashboard.viewTeamCalendar })).toHaveAttribute("href", "/calendar?timeOff=1");
  await upcoming.getByRole("link", { name: /Upcoming CRM client/ }).click();
  await expect(page).toHaveURL(/\/crm\/leads\?lead=/);
  await expect(page.getByRole("dialog", { name: "Upcoming CRM client" })).toBeVisible();
  await page.goto("/dashboard");
  await page.locator('a[href="/finance/expected?filter=incoming&attention=overdue"]').click();
  await expect(page).toHaveURL(/filter=incoming&attention=overdue/);
  await expect(page.getByRole("link", { name: en.Finance.planning.income, exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("More filters · Overdue")).toBeVisible();
  await expect(page.getByText("Late client payment")).toBeVisible();
  await page.goto("/dashboard");
  await page.locator('a[href="/finance/expected?filter=outgoing&attention=overdue"]').click();
  await expect(page.getByRole("link", { name: en.Finance.planning.expenses, exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Late rent")).toBeVisible();
});

test("mostly empty admin Dashboard stays compact", async ({ page }) => {
  await login(page, admins[1]);
  await expect(page.getByText(en.Dashboard.emptyOperationalAttention, { exact: true })).toBeVisible();
  await expect(page.getByText(en.Dashboard.emptyUpcoming, { exact: true })).toBeVisible();
  await expect(page.getByText(en.Dashboard.metricActiveProjects, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: en.Dashboard.attentionProjects })).toBeVisible();
  await expect(page.getByText(en.Dashboard.emptyAdminAttention, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: en.Dashboard.myTasks })).toBeVisible();
  await expect(page.getByText(en.Dashboard.emptyMyTasks, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: en.Dashboard.teamWorkload })).toBeVisible();
  await expect(page.getByRole("heading", { name: en.Dashboard.teamWorkload }).locator("../..").getByText("Empty admin", { exact: true })).toBeVisible();
});
