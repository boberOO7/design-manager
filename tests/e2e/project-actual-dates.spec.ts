import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Project date tests require local Supabase");
const service = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false } });
const studioId = randomUUID(), projectId = randomUUID();
const accounts = (["admin", "employee"] as const).map(role => ({ role, id: "", email: `project-dates-${role}-${randomUUID()}@example.test`, password: `Dates-${randomUUID()}` }));

function id(value: string) { return `'${z.uuid().parse(value)}'`; }
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studioId, name: "Project actual dates browser fixture" }).throwOnError();
  for (const account of accounts) {
    const { data, error } = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
    if (error) throw error;
    account.id = data.user.id;
    await service.from("profiles").upsert({ id: account.id, full_name: `Date ${account.role}`, email: account.email, system_role: account.role, is_active: true }).throwOnError();
    await service.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role: account.role, is_active: true }).throwOnError();
  }
  sql(`insert into public.projects(id,studio_id,name,total_area_m2,status,completed_at,created_by)
    values (${id(projectId)},${id(studioId)},'Legacy date browser fixture',100,'completed','2025-03-12',${id(accounts[0].id)});
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
    values ${accounts.map(account => `(${id(projectId)},${id(account.id)},'designer',0,'2025-01-01')`).join(",")};`);
});

test.afterAll(async () => {
  sql(`delete from public.project_members where project_id=${id(projectId)};
    delete from public.projects where id=${id(projectId)};
    delete from public.studios where id=${id(studioId)};`);
  for (const account of accounts) if (account.id) {
    const { error } = await service.auth.admin.deleteUser(account.id);
    if (error) sql(`delete from auth.users where id=${id(account.id)};`);
  }
});

async function login(page: Page, role: "admin" | "employee") {
  const account = accounts.find(account => account.role === role);
  if (!account) throw new Error("Missing browser account");
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://localhost:3000" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function chooseMarch2025(page: Page, day: string) {
  await page.getByRole("combobox", { name: "Actual start date", exact: true }).click();
  await page.getByRole("button", { name: "Choose month", exact: true }).click();
  await page.getByRole("button", { name: "Choose year", exact: true }).click();
  await page.getByRole("gridcell", { name: "2025", exact: true }).click();
  await page.getByRole("gridcell", { name: "Mar", exact: true }).click();
  await page.getByRole("grid", { name: "Day view: March 2025", exact: true }).getByRole("gridcell", { name: day, exact: true }).first().click();
}

test("admin saves historical actual start in Details and Statistics recalculates", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/statistics?period=all");
  await expect(page.locator("#stats-duration")).toContainText("0 / 1 completed with actual dates");
  await expect(page.getByTestId("duration-highlight")).toHaveCount(0);
  await page.goto(`/projects/${projectId}?view=details`);
  await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fact", exact: true })).toBeVisible();
  await chooseMarch2025(page, "13");
  const startForm = page.locator("form").filter({ has: page.locator('[name="started_at"]') });
  await startForm.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(startForm.getByRole("alert")).toHaveText("Completion cannot be before the actual start.");
  await chooseMarch2025(page, "1");
  await startForm.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(startForm.getByRole("alert")).toHaveCount(0);
  await expect.poll(() => sql(`select started_at from public.projects where id=${id(projectId)}`)).toBe("2025-03-01");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Actual start date", exact: true })).toContainText("03/01/2025");
  await page.screenshot({ path: ".local/project-actual-dates-details.png" });
  await page.goto("/statistics?period=all");
  await expect(page.locator("#stats-duration")).toContainText("1 / 1 completed with actual dates");
  const duration = page.getByRole("list", { name: "Duration by project", exact: true });
  await expect(duration).toContainText("Legacy date browser fixture");
  await expect(duration).toContainText("11 days");
  await expect(page.locator("[data-statistics-motion]")).toHaveAttribute("data-statistics-motion", "complete");
  await page.locator("#stats-duration").scrollIntoViewIfNeeded();
  await expect(duration).toBeVisible();
  await page.screenshot({ path: ".local/project-actual-dates-statistics.png" });
});

test("employee sees actual dates without historical editing controls", async ({ page }) => {
  await login(page, "employee");
  await page.goto(`/projects/${projectId}?view=details`);
  await expect(page.getByRole("heading", { name: "Fact", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Actual start date", exact: true })).toHaveCount(0);
  await expect(page.locator('[name="started_at"], [name="completed_at"]')).toHaveCount(0);
});
