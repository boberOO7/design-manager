import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local fixtures only");
const service = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID();
const projectId = randomUUID();
const password = `Ui-${randomUUID()}`;
const accounts = ["Admin", "Ada Architect", "Ben Designer", "Cara Designer"].map((name) => ({ name, id: "", email: `team-${randomUUID()}@example.test` }));
const id = (value: string) => `'${z.uuid().parse(value)}'`;
const sql = (statement: string) => execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" });

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studioId, name: "Team add browser test" }).throwOnError();
  for (const [index, account] of accounts.entries()) {
    const user = await service.auth.admin.createUser({ email: account.email, password, email_confirm: true });
    if (user.error) throw user.error;
    account.id = user.data.user.id;
    const role = index === 0 ? "admin" : "employee";
    await service.from("profiles").upsert({ id: account.id, email: account.email, full_name: account.name, job_title: index === 1 ? "Architect" : "Designer", system_role: role, is_active: true }).throwOnError();
    await service.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role: role, is_active: true }).throwOnError();
  }
  sql(`insert into public.projects(id,studio_id,name,status,total_area_m2,start_date,created_by) values (${id(projectId)},${id(studioId)},'Team test project','active',100,'2026-09-01',${id(accounts[0].id)});
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values (${id(projectId)},${id(accounts[0].id)},'designer',0,'2026-09-01');`);
});

test.afterAll(async () => {
  sql(`delete from public.project_members where project_id=${id(projectId)}; delete from public.project_activity where studio_id=${id(studioId)}; delete from public.projects where id=${id(projectId)}; delete from public.studios where id=${id(studioId)};`);
  for (const account of accounts) if (account.id) await service.auth.admin.deleteUser(account.id);
});

test("search, select multiple members, add together, and close the popover", async ({ page }) => {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://127.0.0.1:3100" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(accounts[0].email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/projects/${projectId}?view=team`);
  await page.getByRole("button", { name: "Add members" }).click();
  const search = page.getByRole("searchbox", { name: "Search members…" });
  await expect(search).toBeFocused();
  await expect(page.getByLabel("Admin", { exact: false })).toHaveCount(0);
  await search.fill("architect");
  await expect(page.getByText("Ada Architect", { exact: true })).toBeVisible();
  await expect(page.getByText("Ben Designer", { exact: true })).toHaveCount(0);
  const adaCheckbox = page.getByRole("checkbox", { name: /Ada Architect/ });
  await adaCheckbox.click();
  const adaRow = adaCheckbox.locator("..");
  await expect(adaRow).toHaveCSS("box-shadow", "none");
  await search.focus();
  await page.keyboard.press("Tab");
  await expect(adaCheckbox).toBeFocused();
  await expect.poll(() => adaRow.evaluate((row) => getComputedStyle(row).boxShadow)).not.toBe("none");
  await expect(search).toBeVisible();
  await search.fill("designer");
  await page.getByRole("checkbox", { name: /Ben Designer/ }).check();
  await expect(page.getByRole("button", { name: "Add 2 members" })).toBeEnabled();
  await page.getByRole("button", { name: "Add 2 members" }).click();
  await expect(search).toHaveCount(0);
  await expect(page.getByText("Ada Architect", { exact: true })).toBeVisible();
  await expect(page.getByText("Ben Designer", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add members" }).click();
  await expect(page.getByRole("checkbox", { name: /Ada Architect/ })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /Ben Designer/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(search).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add members" })).toBeFocused();
  await page.setViewportSize({ width: 375, height: 780 });
  await page.getByRole("button", { name: "Add members" }).click();
  await expect(page.locator("[data-radix-popper-content-wrapper]")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("heading", { name: "Project team" }).click();
  await expect(search).toHaveCount(0);
});

test("member removal action reveals on hover, keyboard focus, and touch layouts", async ({ page }) => {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://127.0.0.1:3100" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(accounts[0].email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/projects/${projectId}?view=team`);

  const benRow = page.getByText("Ben Designer", { exact: true }).locator("xpath=../../..");
  const remove = benRow.getByRole("button", { name: "Remove" });
  await expect(remove).toHaveCSS("opacity", "0");
  const mutedColor = await remove.evaluate((button) => getComputedStyle(button).color);
  await benRow.hover();
  await expect(remove).toHaveCSS("opacity", "1");
  await remove.hover();
  await expect.poll(() => remove.evaluate((button) => getComputedStyle(button).color)).not.toBe(mutedColor);

  const addMembers = page.getByRole("button", { name: "Add members" });
  await addMembers.focus();
  await page.keyboard.press("Tab");
  const firstRemove = page.getByRole("button", { name: "Remove" }).first();
  await expect(firstRemove).toBeFocused();
  await expect(firstRemove).toHaveCSS("opacity", "1");
  await expect.poll(() => firstRemove.evaluate((button) => getComputedStyle(button).boxShadow)).not.toBe("none");

  await page.setViewportSize({ width: 375, height: 780 });
  await expect(remove).toHaveCSS("opacity", "1");
});


test("first, middle, and last team rows have equal sizing in normal and hover states", async ({ page }) => {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://127.0.0.1:3100" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(accounts[0].email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  for (const account of accounts.slice(1, 3)) {
    sql(`insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
      select ${id(projectId)},${id(account.id)},'other',0,'2026-09-01'
      where not exists (select 1 from public.project_members where project_id=${id(projectId)} and user_id=${id(account.id)} and is_active);`);
  }
  await page.goto(`/projects/${projectId}?view=team`);

  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Project team" }) });
  const rows = card.locator(":scope > div.mt-5 > div");
  await expect(rows).toHaveCount(3);
  const first = rows.nth(0);
  const middle = rows.nth(1);
  const last = rows.nth(2);
  const measure = (row: typeof first) => row.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { height: bounds.height, background: getComputedStyle(element).backgroundColor };
  });

  const normal = await Promise.all([first, middle, last].map(measure));
  expect(new Set(normal.map(({ height }) => height)).size).toBe(1);
  expect(new Set(normal.map(({ background }) => background)).size).toBe(1);

  const hovered = [];
  for (const row of [first, middle, last]) {
    await row.hover();
    await page.waitForTimeout(220);
    hovered.push(await measure(row));
  }
  expect(new Set(hovered.map(({ height }) => height)).size).toBe(1);
  expect(new Set(hovered.map(({ background }) => background)).size).toBe(1);
  expect(hovered[0].background).not.toBe(normal[0].background);
});
