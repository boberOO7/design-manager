import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_PUBLISHABLE_KEY: z.string(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Statistics tests require local Supabase");
const service = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID();
const projectId = randomUUID();
const taskIds = [randomUUID(), randomUUID()] as const;
const makeAccount = (role: "admin" | "employee") => ({ role, id: "", email: `statistics-${role}-${randomUUID()}@example.test`, password: `Stats-${randomUUID()}` });
const accounts = [makeAccount("admin"), makeAccount("employee")] as const;
const renderDir = ".local/statistics/renders";
mkdirSync(renderDir, { recursive: true });

function id(value: string) { return `'${z.uuid().parse(value)}'`; }
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}
async function login(page: Page, index: 0 | 1 = 0) {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://localhost:3000" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(accounts[index].email);
  await page.locator('input[type="password"]').fill(accounts[index].password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studioId, name: "Statistics browser test" }).throwOnError();
  for (const account of accounts) {
    const result = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
    if (result.error) throw result.error;
    account.id = result.data.user.id;
    await service.from("profiles").upsert({ id: account.id, email: account.email, full_name: `Statistics ${account.role}`, system_role: account.role, is_active: true }).throwOnError();
    await service.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role: account.role, is_active: true }).throwOnError();
  }
  const admin = accounts[0], employee = accounts[1];
  sql(`
    insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by)
    values (${id(projectId)},${id(studioId)},'Statistics production fixture',100,'planned',current_date-45,${id(admin.id)});
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
    values (${id(projectId)},${id(admin.id)},'designer',0,current_date),(${id(projectId)},${id(employee.id)},'designer',0,current_date);
    insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by,completed_area_m2)
    values (${id(taskIds[0])},${id(projectId)},'Statistics credit A','stage_2','todo','normal',${id(admin.id)},${id(admin.id)},20),
      (${id(taskIds[1])},${id(projectId)},'Statistics credit B','stage_2','todo','normal',${id(employee.id)},${id(admin.id)},20);
    select set_config('request.jwt.claim.sub',${id(admin.id)},false);
    update public.projects set status='active' where id=${id(projectId)};
    update public.project_activity set created_at=(current_date-45)::timestamp
      where project_id=${id(projectId)} and entity_type='project' and action_type='project_lifecycle_changed'
        and changes->'status'->>'from'='planned' and changes->'status'->>'to'='active';
    update public.tasks set status='in_progress' where project_id=${id(projectId)};
    update public.tasks set status='completed' where project_id=${id(projectId)};
    update public.tasks set completed_at=current_date-10 where project_id=${id(projectId)};
    update public.projects set status='completed' where id=${id(projectId)};
    update public.projects set completed_at=current_date-10 where id=${id(projectId)};
  `);
  expect(sql(`select status||'|'||completed_at||'|'||total_area_m2 from public.projects where id=${id(projectId)}`)).toMatch(/^completed\|\d{4}-\d{2}-\d{2}\|100$/);
  expect(sql(`select sum(credited_area_m2) from public.productivity_attributions where project_id=${id(projectId)} and voided_at is null`)).toBe("40");
});

test.afterAll(async () => {
  sql(`delete from public.project_members where project_id=${id(projectId)};
    delete from public.tasks where project_id=${id(projectId)};
    delete from public.projects where id=${id(projectId)};
    delete from public.studios where id=${id(studioId)};`);
  for (const account of accounts) if (account.id) {
    const result = await service.auth.admin.deleteUser(account.id);
    if (result.error) sql(`delete from auth.users where id=${id(account.id)};`);
  }
});

test("admin can open Statistics, change periods, and render at common widths", async ({ page }, testInfo) => {
  await login(page);
  const navLink = page.getByRole("link", { name: "Statistics", exact: true });
  await expect(navLink).toBeVisible();
  await navLink.click();
  await expect(page).toHaveURL(/\/statistics(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Statistics", exact: true })).toBeVisible();
  for (const id of ["stats-production", "stats-credits", "stats-economics", "stats-duration"]) await expect(page.locator(`#${id}`)).toBeVisible();
  await expect(page.getByText(/Current month is partial/).first()).toBeVisible();
  await expect(page.locator("#stats-production")).toContainText("100");
  await expect(page.locator("#stats-credits")).toContainText("40");

  const creditChart = page.locator("#stats-credits").getByRole("group").first();
  const point = creditChart.locator('[role="button"][data-point]').first();
  await point.focus();
  await expect(page.locator("#stats-credits div[aria-hidden='true']").filter({ hasText: /40/ })).toBeVisible();
  await point.tap();

  for (const [period, label] of [["3", "3 months"], ["6", "6 months"], ["12", "12 months"], ["year", "This year"], ["all", "All history"]] as const) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]period=${period}(?:&|$)`));
    await expect(page.getByRole("heading", { name: "Statistics", exact: true })).toBeVisible();
    if (period === "3") {
      const selected = page.locator('#stats-credits [role="button"][tabindex="0"]').last();
      await expect(selected).toBeVisible();
      await selected.focus();
      await expect(page.locator("#stats-credits div[aria-hidden='true']").filter({ hasText: /40/ })).toBeVisible();
    }
  }

  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto("/statistics?period=12");
    await expect(page.getByRole("heading", { name: "Statistics", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `${renderDir}/statistics-${width}.png`, fullPage: true });
  }
  await testInfo.attach("statistics-render-directory", { body: renderDir, contentType: "text/plain" });
});

test("employee cannot navigate to or read private Statistics data", async ({ page }) => {
  await login(page, 1);
  await expect(page.getByRole("link", { name: "Statistics", exact: true })).toHaveCount(0);
  await page.goto("/statistics");
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);

  const employee = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await employee.auth.signInWithPassword({ email: accounts[1].email, password: accounts[1].password });
  if (signedIn.error) throw signedIn.error;
  const [attributions, payroll, projectTerms] = await Promise.all([
    employee.from("productivity_attributions").select("id"),
    employee.from("finance_obligations").select("id"),
    employee.from("finance_project_terms").select("id"),
  ]);
  expect(attributions.error || attributions.data.length === 0).toBeTruthy();
  expect(payroll.error || payroll.data.length === 0).toBeTruthy();
  expect(projectTerms.error || projectTerms.data.length === 0).toBeTruthy();
  await employee.auth.signOut();
});
