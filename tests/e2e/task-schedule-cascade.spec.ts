import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import type { Database } from "../../src/types/database.types";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local fixtures only");
const service = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID(), projectId = randomUUID(), taskIds = [randomUUID(), randomUUID(), randomUUID()];
const email = `schedule-cascade-${randomUUID()}@example.test`, password = `Ui-${randomUUID()}`;
let userId = "";
function id(value: string) { return `'${z.uuid().parse(value)}'::uuid`; }
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}
function due(taskId: string) { return sql(`select current_due from public.task_schedules where task_id=${id(taskId)};`); }
function after(day: string, count: number) { return sql(`select private.schedule_add_workdays('${day}',${count});`); }
async function login(page: Page) {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://127.0.0.1:3100" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.beforeAll(async () => {
  const user = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error) throw user.error;
  userId = user.data.user.id;
  await service.from("studios").insert({ id: studioId, name: "Schedule cascade browser" }).throwOnError();
  await service.from("profiles").upsert({ id: userId, email, full_name: "Schedule Admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studioId, user_id: userId, system_role: "admin", is_active: true }).throwOnError();
  sql(`insert into public.projects(id,studio_id,name,project_type,status,total_area_m2,start_date,created_by)
    values (${id(projectId)},${id(studioId)},'Schedule cascade project','private','active',100,current_date,${id(userId)});
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
    values (${id(projectId)},${id(userId)},'designer',0,current_date);
    insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by) values
    (${id(taskIds[0]!)},${id(projectId)},'Upstream task','stage_1','todo','normal',${id(userId)},${id(userId)}),
    (${id(taskIds[1]!)},${id(projectId)},'Dependent task','stage_1','todo','normal',${id(userId)},${id(userId)}),
    (${id(taskIds[2]!)},${id(projectId)},'Last task','stage_1','todo','normal',${id(userId)},${id(userId)});
    with anchor as (select private.schedule_workday_on_or_after((now() at time zone 'Europe/Kyiv')::date) as day)
    insert into public.task_schedules(task_id,project_id,stage,sort_order,expected_workdays,baseline_start,baseline_due,current_start,current_due)
    select ${id(taskIds[0]!)},${id(projectId)},'stage_1',0,2,day,private.schedule_add_workdays(day,1),day,private.schedule_add_workdays(day,1) from anchor
    union all
    select ${id(taskIds[1]!)},${id(projectId)},'stage_1',1,3,private.schedule_add_workdays(day,2),private.schedule_add_workdays(day,4),private.schedule_add_workdays(day,2),private.schedule_add_workdays(day,4) from anchor
    union all
    select ${id(taskIds[2]!)},${id(projectId)},'stage_1',2,1,private.schedule_add_workdays(day,5),private.schedule_add_workdays(day,5),private.schedule_add_workdays(day,5),private.schedule_add_workdays(day,5) from anchor;
    insert into public.task_schedule_dependencies(task_id,predecessor_task_id) values
    (${id(taskIds[1]!)},${id(taskIds[0]!)}),(${id(taskIds[2]!)},${id(taskIds[1]!)});
    insert into public.task_deadlines(task_id,target_status,due_date)
    select task_id,'internal_review',current_due from public.task_schedules where project_id=${id(projectId)};`);
});
test.afterAll(async () => {
  if (studioId) sql(`delete from public.project_activity where studio_id=${id(studioId)};
    delete from public.tasks where project_id=${id(projectId)};
    delete from public.project_members where project_id=${id(projectId)};
    delete from public.projects where id=${id(projectId)};
    delete from public.studios where id=${id(studioId)};`);
  if (userId) await service.auth.admin.deleteUser(userId);
});

test("deadline edit cascades and the dependent drawer shows the compact schedule", async ({ page }) => {
  const initialUpstream = due(taskIds[0]!);
  const initialDependent = due(taskIds[1]!);
  const initialLast = due(taskIds[2]!);
  const target = after(initialUpstream, 2);

  await login(page);
  await page.goto(`/projects/${projectId}?task=${taskIds[0]}`);
  const drawer = page.getByRole("dialog", { name: en.Tasks.taskDetails });
  await expect(drawer.getByRole("heading", { name: "Upstream task" })).toBeVisible();
  await drawer.getByRole("button", { name: en.Tasks.editTask }).click();
  await drawer.locator('section[aria-labelledby="task-deadlines"]').getByRole("combobox", { name: "Choose date" }).click();
  const targetDate = new Date(`${target}T12:00:00Z`);
  if (target.slice(0, 7) !== initialUpstream.slice(0, 7)) {
    await drawer.getByRole("button", { name: /^Next / }).click();
  }
  await drawer.getByRole("gridcell", { name: String(targetDate.getUTCDate()), exact: true }).first().click();
  await drawer.getByRole("button", { name: en.Tasks.saveChanges }).click();
  await expect(drawer.getByRole("status")).toContainText(en.Tasks.taskChangesSaved);
  expect(due(taskIds[0]!)).toBe(target);
  expect(due(taskIds[1]!)).toBe(after(initialDependent, 2));
  expect(due(taskIds[2]!)).toBe(after(initialLast, 2));
  expect(sql(`select baseline_due from public.task_schedules where task_id=${id(taskIds[1]!)};`)).toBe(initialDependent);

  const shiftedLabel = new Date(`${due(taskIds[1]!)}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric" });
  const dependentCard = page.locator("[data-task-card]").filter({ hasText: "Dependent task" }).first();
  await expect(dependentCard).toContainText(shiftedLabel);
  await drawer.getByRole("button", { name: en.Tasks.closeTaskDetails }).click();
  await dependentCard.click();
  const dependent = page.getByRole("dialog", { name: en.Tasks.taskDetails });
  await expect(dependent.getByRole("heading", { name: "Dependent task" })).toBeVisible();
  await expect(dependent.getByText("3 working days", { exact: true })).toBeVisible();
  const summary = dependent.locator("details").filter({ hasText: "Due:" }).locator("summary");
  await expect(summary).toContainText("+2 days from plan");
  await expect(dependent.getByText("Waiting for: Upstream task")).toBeVisible();
  await summary.click();
  await expect(dependent.getByText(/Baseline:/)).toBeVisible();
});
