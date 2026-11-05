import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import { signInLocalTestUser } from "../helpers/auth";
import uk from "../../messages/uk.json";

const t = uk.Contractors;
const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local contractor fixtures only");
const service = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false } });
const studioId = randomUUID();
const categoryId = randomUUID();
const secondaryCategoryId = randomUUID();
const subcategoryId = randomUUID();
const accounts = ["admin", "employee"].map(role => ({ role, id: "", email: `contractor-${role}-${randomUUID()}@example.test`, password: `Test-${randomUUID()}` }));
const name = "A UI prospective contractor";

async function choose(page: Page, scope: Locator, label: string, value: string) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}
function sqlId(value: string) { return `'${z.uuid().parse(value)}'`; }
function localSql(input: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function stored() {
  return z.object({ cooperation_status: z.enum(["verified", "prospective"]), is_recommended: z.boolean() }).parse(JSON.parse(localSql(`select json_build_object('cooperation_status',cooperation_status,'is_recommended',is_recommended) from public.contractors where category_id=${sqlId(categoryId)} and name='A UI prospective contractor';`)));
}

async function tableLayout(page: Page) {
  return page.locator("table").evaluate(table => ({
    columns: Array.from(table.querySelectorAll("thead th"), cell => {
      const box = cell.getBoundingClientRect();
      return { x: box.x, width: box.width };
    }),
    rowHeights: Array.from(table.querySelectorAll("tbody tr"), row => row.getBoundingClientRect().height),
  }));
}

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studioId, name: "Contractor cooperation UI" }).throwOnError();
  for (const account of accounts) {
    const result = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
    if (result.error) throw result.error;
    account.id = result.data.user.id;
    const system_role = account.role === "admin" ? "admin" : "employee";
    await service.from("profiles").upsert({ id: account.id, email: account.email, full_name: `Contractor ${account.role}`, system_role, is_active: true }).throwOnError();
    await service.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role, is_active: true }).throwOnError();
  }
  localSql(`insert into public.contractor_categories(id,studio_id,name,color_key) values
      (${sqlId(categoryId)},${sqlId(studioId)},'UI category','blue'),
      (${sqlId(secondaryCategoryId)},${sqlId(studioId)},'Оздоблювальні матеріали та декоративні рішення','bronze');
    insert into public.contractor_subcategories(id,category_id,name) values
      (${sqlId(subcategoryId)},${sqlId(secondaryCategoryId)},'Виготовлення корпусних меблів за індивідуальним проєктом');
    insert into public.contractors(category_id,subcategory_id,name,phone,description,created_by) values
      (${sqlId(categoryId)},null,'Other verified contact','+380635692681','Короткий опис.',${sqlId(accounts[0].id)}),
      (${sqlId(secondaryCategoryId)},${sqlId(subcategoryId)},'Меблева майстерня з дуже довгою назвою для перевірки таблиці',null,repeat('Виготовлення меблів за індивідуальним проєктом. ',10),${sqlId(accounts[0].id)}),
      (${sqlId(secondaryCategoryId)},null,'Декоративні матеріали',null,repeat('ДовгийОписБезПробілів',20),${sqlId(accounts[0].id)}),
      (${sqlId(categoryId)},null,'Студія світла',null,null,${sqlId(accounts[0].id)});`);
});
test.afterAll(async () => {
  localSql(`begin; delete from public.contractors where category_id in (${sqlId(categoryId)},${sqlId(secondaryCategoryId)});
    set local session_replication_role=replica;
    delete from private.finance_labor_membership_events where studio_id=${sqlId(studioId)};
    set local session_replication_role=origin;
    delete from public.studios where id=${sqlId(studioId)}; commit;`);
  for (const account of accounts) if (account.id) {
    const result = await service.auth.admin.deleteUser(account.id);
    if (result.error) throw result.error;
  }
});

test("prospective creation, verification, optimistic recommendation, rollback and member visibility", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { localStorage.setItem("studioflow-theme", "dark"); });
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: new URL(test.info().project.use.baseURL ?? "http://127.0.0.1:3100").origin }]);
  await signInLocalTestUser(page, accounts[0]);
  await page.goto("/contractors");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const filterCenters = await Promise.all([
    page.getByRole("searchbox"),
    page.getByRole("combobox", { name: t.columns.category, exact: true }),
    page.getByRole("combobox", { name: t.columns.subcategory, exact: true }),
    page.getByRole("combobox", { name: t.cooperation.label, exact: true }),
    page.getByRole("checkbox", { name: t.recommendation.only }),
  ].map(async control => {
    const box = await control.boundingBox();
    if (!box) throw new Error("Missing filter control");
    return box.y + box.height / 2;
  }));
  expect(Math.max(...filterCenters) - Math.min(...filterCenters)).toBeLessThan(1);
  await page.getByRole("button", { name: t.add, exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.locator('input[name="category"]').fill("UI category");
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.locator('input[name="website_url"]').fill("https://example.test/contractor");
  await dialog.locator('textarea[name="description"]').fill("Широкий асортимент меблів, освітлення та матеріалів для інтер’єру. ".repeat(6));
  await choose(page, dialog, t.cooperation.label, t.cooperation.prospective);
  await dialog.getByRole("button", { name: t.add, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: name });
  const otherRow = page.getByRole("row").filter({ hasText: "Other verified contact" });
  const star = row.getByRole("button", { name: new RegExp(name) }).filter({ has: page.locator("svg.lucide-star") });
  await expect(row.getByRole("img", { name: t.cooperation.prospective, exact: true })).toBeVisible();
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await expect(star).toBeDisabled();
  await expect(otherRow).toBeVisible();
  await expect(row.getByRole("link", { name: t.openLink.replace("{name}", name) })).toHaveAttribute("href", "https://example.test/contractor");
  expect(await stored()).toEqual({ cooperation_status: "prospective", is_recommended: false });

  await row.getByRole("button", { name: t.editAria.replace("{name}", name), exact: true }).click();
  dialog = page.getByRole("dialog");
  await choose(page, dialog, t.cooperation.label, t.cooperation.verified);
  await dialog.getByRole("button", { name: t.save, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(star).toBeEnabled();

  // Hold the real write to verify the optimistic value without a visible spinner.
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/contractors", async route => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  try {
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    await expect(star).toHaveAttribute("aria-busy", "true");
    await expect(star.locator("svg")).toHaveCount(1);
    await expect(otherRow.locator('button[aria-pressed]')).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("columnheader", { name: t.columns.name })).toHaveAttribute("aria-sort", "ascending");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally { release(); }
  await expect(star).toHaveAttribute("aria-busy", "false");
  await page.unroute("**/contractors");
  await expect.poll(stored).toEqual({ cooperation_status: "verified", is_recommended: true });

  await page.route("**/contractors", route => route.request().method() === "POST"
    ? route.fulfill({ status: 500, contentType: "text/plain", body: "Simulated save failure" }) : route.continue());
  await star.click();
  await expect(page.getByRole("alert").filter({ hasText: name })).toContainText(t.errors.recommendationFailed);
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await expect(star).toHaveAttribute("aria-busy", "false");
  await page.unroute("**/contractors");
  expect((await stored()).is_recommended).toBe(true);
  await star.focus();
  await star.press("Space");
  await expect.poll(async () => (await stored()).is_recommended).toBe(false);
  await expect(star).toHaveAttribute("aria-busy", "false");
  await star.click();
  await expect.poll(async () => (await stored()).is_recommended).toBe(true);
  await expect(star).toHaveAttribute("aria-busy", "false");

  const fullLayout = await tableLayout(page);
  expect(fullLayout.rowHeights.every(height => Math.abs(height - 64) < 1)).toBe(true);
  await page.getByRole("checkbox", { name: t.recommendation.only }).check();
  await expect(row).toBeVisible();
  await expect(otherRow).toHaveCount(0);
  const filteredLayout = await tableLayout(page);
  expect(filteredLayout.columns).toEqual(fullLayout.columns);
  expect(filteredLayout.rowHeights).toEqual([fullLayout.rowHeights[0]]);
  const dividerFrames = await page.getByRole("checkbox", { name: t.recommendation.only }).evaluate(async checkbox => {
    const lastVisibleRow = document.querySelector("tbody tr:last-child");
    const header = document.querySelector("thead");
    if (!(checkbox instanceof HTMLInputElement) || !lastVisibleRow || !header) throw new Error("Missing contractor table");
    const expectedColor = getComputedStyle(header).borderBottomColor;
    const colors: string[] = [];
    checkbox.click();
    const start = performance.now();
    await new Promise<void>(resolve => {
      const sample = () => {
        const style = getComputedStyle(lastVisibleRow);
        if (parseFloat(style.borderBottomWidth) > 0) colors.push(style.borderBottomColor);
        if (performance.now() - start < 220) requestAnimationFrame(sample); else resolve();
      };
      requestAnimationFrame(sample);
    });
    return { expectedColor, colors };
  });
  expect(dividerFrames.colors.length).toBeGreaterThan(1);
  expect([...new Set(dividerFrames.colors)]).toEqual([dividerFrames.expectedColor]);
  expect(await tableLayout(page)).toEqual(fullLayout);

  await page.setViewportSize({ width: 2400, height: 1000 });
  const wideLayout = await tableLayout(page);
  expect(wideLayout.rowHeights).toEqual(fullLayout.rowHeights);
  await page.getByRole("checkbox", { name: t.recommendation.only }).check();
  expect((await tableLayout(page)).columns).toEqual(wideLayout.columns);
  await page.getByRole("checkbox", { name: t.recommendation.only }).uncheck();
  await page.screenshot({ path: test.info().outputPath("contractors-wide.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  const tableScroll = await page.locator("table").evaluate(table => {
    const container = table.parentElement;
    if (!container) throw new Error("Missing table scroll container");
    const bounds = container.getBoundingClientRect();
    return { visible: container.clientWidth, scrollable: container.scrollWidth, left: bounds.left, right: bounds.right, viewport: innerWidth };
  });
  expect(tableScroll.left).toBeGreaterThanOrEqual(0);
  expect(tableScroll.right).toBeLessThanOrEqual(tableScroll.viewport);
  expect(tableScroll.scrollable).toBeGreaterThan(tableScroll.visible);
  expect((await tableLayout(page)).rowHeights).toEqual(fullLayout.rowHeights);
  await page.screenshot({ path: test.info().outputPath("contractors-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await row.getByRole("button", { name: t.editAria.replace("{name}", name), exact: true }).click();
  dialog = page.getByRole("dialog");
  await choose(page, dialog, t.cooperation.label, t.cooperation.prospective);
  await dialog.getByRole("button", { name: t.save, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(stored).toEqual({ cooperation_status: "prospective", is_recommended: false });
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await expect(star).toBeDisabled();
  await choose(page, page.locator("main"), t.cooperation.label, t.cooperation.prospective);
  await expect(otherRow).toHaveCount(0);
  await expect(row).toBeVisible();

  await signInLocalTestUser(page, accounts[1]);
  await page.goto("/contractors");
  await expect(row).toHaveCount(0);
  await expect(otherRow).toBeVisible();
  await expect(page.getByRole("combobox", { name: t.cooperation.label })).toHaveCount(0);
  await expect(otherRow.locator('button[aria-pressed]')).toHaveCount(0);
  await expect(otherRow.getByRole("img", { name: t.recommendation.no, exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill(name);
  await expect(page.getByText(t.empty.filteredTitle, { exact: true })).toBeVisible();
});
