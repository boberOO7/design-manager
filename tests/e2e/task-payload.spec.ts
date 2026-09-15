import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import type { Database } from "../../src/types/database.types";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local fixtures only");
const service = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID(); const projectId = randomUUID(); const tasks = [randomUUID(), randomUUID()];
const accounts = ["admin", "employee"].map((role) => ({ role, id: "", email: `task-ui-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
function id(value: string) { return `'${z.uuid().parse(value)}'`; }
function sql(statement: string) { return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }); }
async function login(page: Page, index = 0) {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://127.0.0.1:3100" }]);
  await page.goto("/login"); await page.locator('input[type="email"]').fill(accounts[index].email); await page.locator('input[type="password"]').fill(accounts[index].password); await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}
test.beforeAll(async () => {
  await service.from("studios").insert({ id: studioId, name: "Task payload browser" }).throwOnError();
  for (const account of accounts) {
    const user = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true }); if (user.error) throw user.error;
    account.id = user.data.user.id; const role = account.role === "admin" ? "admin" : "employee";
    await service.from("profiles").upsert({ id: account.id, email: account.email, full_name: `Task ${role}`, system_role: role, is_active: true }).throwOnError();
    await service.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role: role, is_active: true }).throwOnError();
  }
  sql(`insert into public.projects(id,studio_id,name,status,total_area_m2,start_date,created_by) values (${id(projectId)},${id(studioId)},'Task payload project','active',100,'2026-09-01',${id(accounts[0].id)});`);
  for (const account of accounts) sql(`insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values (${id(projectId)},${id(account.id)},'designer',0,'2026-09-01');`);
  for (const [index, account] of accounts.entries()) sql(`insert into public.tasks(id,project_id,title,description,stage,status,priority,assignee_id,created_by,progress_weight) values (${id(tasks[index])},${id(projectId)},'Task ${index}','Full description ${index}','stage_1','in_progress','high',${id(account.id)},${id(accounts[0].id)},${index + 1});
    insert into public.task_checklist_items(task_id,title,is_completed,weight,position) values (${id(tasks[index])},'Checklist ${index} A',false,3,0),(${id(tasks[index])},'Checklist ${index} B',true,1,1);
    insert into public.task_deadlines(task_id,target_status,due_date) values (${id(tasks[index])},'internal_review','2026-09-10'),(${id(tasks[index])},'completed','2026-09-20');
    insert into public.task_collaborators(task_id,user_id) values (${id(tasks[index])},${id(accounts[1-index].id)});`);
});
test.afterAll(async () => {
  sql(`delete from public.tasks where project_id=${id(projectId)}; delete from public.project_members where project_id=${id(projectId)}; delete from public.projects where id=${id(projectId)}; delete from public.studios where id=${id(studioId)};`);
  for (const account of accounts) if (account.id) { const result = await service.auth.admin.deleteUser(account.id); if (result.error) throw result.error; }
});

test("Board, Details, Team and Activity preserve project progress and task deep links", async ({ page }) => {
  await login(page);
  let progress: Array<string | null> | null = null;
  for (const view of ["board", "details", "team", "activity"]) {
    await page.goto(`/projects/${projectId}${view === "board" ? "" : `?view=${view}`}`);
    const bar = page.locator('section[aria-labelledby="project-context-heading"]').getByRole("progressbar");
    await expect(bar).toHaveCount(4);
    const value = await bar.evaluateAll((bars) => bars.map((item) => item.getAttribute("aria-valuenow")));
    if (progress === null) progress = value; else expect(value).toEqual(progress);
  }
  await page.goto(`/projects/${projectId}?task=${tasks[0]}`);
  await expect(page.getByRole("dialog", { name: en.Tasks.taskDetails }).getByText("Full description 0", { exact: true })).toBeVisible();
});

for (const index of [0, 1]) test(`Dashboard on-demand task detail and checklist updates for ${accounts[index].role}`, async ({ page }) => {
  await login(page, index);
  const open = page.getByRole("button", { name: `Task ${index}. ${en.Dashboard.openTaskDetails}`, exact: true });
  await expect(open).toBeVisible();
  let reads = 0; let navigations = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/dashboard") { if (request.headers()["next-action"]) reads++; else if (!request.headers()["next-router-prefetch"]) navigations++; } });
  await open.click();
  const drawer = page.getByRole("dialog", { name: en.Tasks.taskDetails });
  await expect(drawer.getByText(`Full description ${index}`, { exact: true })).toBeVisible();
  await expect(drawer.getByText(`Task ${accounts[1-index].role}`, { exact: true }).first()).toBeVisible();
  await drawer.getByRole("checkbox", { name: new RegExp(`Checklist ${index} A`) }).check();
  await expect(drawer.getByRole("checkbox", { name: new RegExp(`Checklist ${index} A`) })).toBeChecked();
  await expect.poll(() => sql(`select is_completed from public.task_checklist_items where task_id=${id(tasks[index])} and title='Checklist ${index} A';`).trim()).toBe("t");
  await drawer.getByRole("button", { name: en.Tasks.closeTaskDetails }).click();
  await expect(drawer).toHaveCount(0);
  await open.click();
  await expect(drawer.getByText(`Full description ${index}`, { exact: true })).toBeVisible();
  await expect(drawer.getByRole("checkbox", { name: new RegExp(`Checklist ${index} A`) })).toBeChecked();
  expect(reads).toBe(2); expect(navigations).toBe(0);
});

test("Dashboard ignores closed or superseded reads and lets failed detail loads retry", async ({ page }) => {
  await login(page);
  const open = page.getByRole("button", { name: `Task 0. ${en.Dashboard.openTaskDetails}`, exact: true });
  await expect(open).toBeVisible();
  let release: () => void = () => {}; let started = false;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/dashboard", async (route) => {
    if (!route.request().headers()["next-action"]) return route.continue();
    started = true; const response = await route.fetch(); await held; await route.fulfill({ response });
  });
  await open.click(); await expect.poll(() => started).toBe(true);
  const drawer = page.getByRole("dialog", { name: en.Tasks.taskDetails });
  await expect(drawer.getByRole("status")).toHaveText(en.Common.loading);
  await drawer.getByRole("button", { name: en.Tasks.closeTaskDetails }).click();
  release(); await expect(drawer).toHaveCount(0);
  await page.unroute("**/dashboard");
  await page.route("**/dashboard", async (route) => route.request().headers()["next-action"] ? route.fulfill({ status: 500, body: "Unavailable" }) : route.continue());
  await open.click(); await expect(drawer.getByRole("alert")).toHaveText(en.Tasks.loadFailed);
  await page.unroute("**/dashboard");
  await drawer.getByRole("button", { name: en.Tasks.retryLoad }).click();
  await expect(drawer.getByText("Full description 0", { exact: true })).toBeVisible();
});
