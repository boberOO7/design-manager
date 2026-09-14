import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
const admin = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let studioId: string;
let userId: string;
let email: string;
let password: string;

function localSql(sql: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: sql, encoding: "utf8" }).trim();
}

function sqlId(value: string) {
  return `'${z.uuid().parse(value)}'`;
}

async function login(page: Page) {
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://127.0.0.1:3100" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function choose(page: Page, scope: Locator, label: string, value: string) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}

async function expectDraft(dialog: Locator, values: { area: string; city: string; client: string; description: string; name: string }) {
  await expect(dialog.locator('[name="project_name"]')).toHaveValue(values.name);
  await expect(dialog.locator('[name="client_name"]')).toHaveValue(values.client);
  await expect(dialog.locator('[name="city_search"]')).toHaveValue(values.city);
  await expect(dialog.locator('[name="city"]')).toHaveValue(values.city);
  await expect(dialog.locator('[name="total_area_m2"]')).toHaveValue(values.area);
  await expect(dialog.getByRole("combobox", { name: uk.ProjectForm.priority, exact: true })).toContainText(uk.Priority.urgent);
  await expect(dialog.locator('[name="due_date"]')).not.toHaveValue("");
  await expect(dialog.locator('[name="description"]')).toHaveValue(values.description);
}

test.beforeAll(async () => {
  studioId = randomUUID();
  email = `project-form-${randomUUID()}@example.test`;
  password = `Ui-${randomUUID()}`;
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error) throw user.error;
  userId = user.data.user.id;
  await admin.from("studios").insert({ id: studioId, name: "Project form UI test" }).throwOnError();
  await admin.from("profiles").upsert({ id: userId, email, full_name: "Project Form Admin", system_role: "admin", is_active: true }).throwOnError();
  await admin.from("studio_members").insert({ studio_id: studioId, user_id: userId, system_role: "admin", is_active: true }).throwOnError();
});

test.afterAll(async () => {
  if (studioId) localSql(`delete from public.studios where id = ${sqlId(studioId)};`);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

test("Project create/edit preserves localized drafts through client and server failures", async ({ page }) => {
  await login(page);
  await page.goto("/projects");
  await page.getByRole("button", { name: uk.Projects.newProject, exact: true }).click();
  let dialog = page.getByRole("dialog");
  const createDraft = { area: "0", city: "Львів", client: "Олена", description: "Повний опис проєкту", name: "Квартира на Личаківській" };

  await dialog.getByLabel(uk.ProjectForm.projectName, { exact: true }).fill(createDraft.name);
  await choose(page, dialog, uk.ProjectForm.projectType, uk.ProjectTypes.other);
  await dialog.getByLabel(uk.ProjectForm.projectTypeCustom, { exact: true }).fill("Реконструкція");
  await dialog.getByLabel(uk.ProjectForm.clientName, { exact: true }).fill(createDraft.client);
  await dialog.locator('[name="city_search"]').fill(createDraft.city);
  await dialog.getByLabel(uk.ProjectForm.totalArea, { exact: true }).fill(createDraft.area);
  await choose(page, dialog, uk.ProjectForm.priority, uk.Priority.urgent);
  await dialog.locator("label").filter({ hasText: uk.ProjectForm.dueDate }).getByRole("button").click();
  await page.getByRole("button", { name: "Сьогодні", exact: true }).click();
  await dialog.getByLabel(uk.ProjectForm.description, { exact: true }).fill(createDraft.description);
  await dialog.getByRole("button", { name: uk.ProjectForm.create, exact: true }).click();

  await expect(dialog.getByText(uk.ProjectForm.validation.areaPositive, { exact: true })).toBeVisible();
  await expect(dialog.getByText(uk.ProjectForm.validation.correctFields, { exact: true })).toBeVisible();
  await expectDraft(dialog, createDraft);

  await dialog.locator('[name="total_area_m2"]').fill("96");
  await dialog.locator('[name="project_template_id"]').evaluate((input: HTMLInputElement) => { input.value = "invalid-template"; });
  await dialog.getByRole("button", { name: uk.ProjectForm.create, exact: true }).click();
  await expect(dialog.getByText(uk.ProjectForm.errors.createFailed, { exact: true })).toBeVisible();
  await expectDraft(dialog, { ...createDraft, area: "96" });

  await dialog.locator('[name="project_template_id"]').evaluate((input: HTMLInputElement) => { input.value = ""; });
  await dialog.getByRole("button", { name: uk.ProjectForm.create, exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  await expect(page.getByText(createDraft.name, { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: uk.ProjectWorkspace.edit, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(uk.ProjectForm.clientName, { exact: true }).fill("Марія");
  await dialog.getByLabel(uk.ProjectForm.totalArea, { exact: true }).fill("0");
  await dialog.getByRole("button", { name: uk.ProjectForm.save, exact: true }).click();
  await expect(dialog.getByText(uk.ProjectForm.validation.areaPositive, { exact: true })).toBeVisible();
  await expect(dialog.locator('[name="project_name"]')).toHaveValue(createDraft.name);
  await expect(dialog.locator('[name="client_name"]')).toHaveValue("Марія");

  await dialog.locator('[name="total_area_m2"]').fill("104");
  await dialog.locator("form").evaluate((form) => {
    const input = document.createElement("input");
    input.name = "status";
    input.value = "archived";
    form.append(input);
  });
  await dialog.getByRole("button", { name: uk.ProjectForm.save, exact: true }).click();
  await expect(dialog.getByText(uk.ProjectForm.errors.statusManaged, { exact: true })).toBeVisible();
  await expect(dialog.locator('[name="client_name"]')).toHaveValue("Марія");
  await expect(dialog.locator('[name="total_area_m2"]')).toHaveValue("104");

  await dialog.locator('[name="status"]').evaluate((input) => input.remove());
  await dialog.getByRole("button", { name: uk.ProjectForm.save, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: uk.ProjectWorkspace.edit, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.locator('[name="client_name"]')).toHaveValue("Марія");
  await expect(dialog.locator('[name="total_area_m2"]')).toHaveValue("104");
});
