import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local profile fixtures only");
const service = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID();
const accounts = ["admin", "employee"].map((role) => ({ role, id: "", email: `profile-shell-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
const moduleMarkers = {
  profileEditor: "update_my_profile_details",
  avatarCrop: "Avatar crop could not be created",
  googleIntegration: "/api/integrations/google-calendar/status",
  cityCombobox: "/api/cities?",
  datePicker: "Choose month",
};

// Read actual provider props from Flight, including the Flight embedded in HTML.
function messageProps(flight: string) {
  const dictionaries: Record<string, unknown>[] = [];
  for (const match of flight.matchAll(/"messages":(\{)/g)) {
    const start = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < flight.length; end++) {
      const char = flight[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        dictionaries.push(z.record(z.string(), z.unknown()).parse(JSON.parse(flight.slice(start, end + 1))));
        break;
      }
    }
  }
  return dictionaries;
}

for (const [locale, messages] of [["en", en], ["uk", uk]] as const) {
  test(`translation delivery and domain navigation ${locale}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (entry) => { if (/MISSING_MESSAGE|INVALID_MESSAGE|IntlError/.test(entry.text())) errors.push(entry.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await login(page, 0, locale);
    const measurements = [];
    for (const route of ["/dashboard", "/projects", "/office/equipment", "/calendar", "/crm/leads", "/office"]) {
      const response = await page.goto(route);
      await expect(page.getByRole("button", { name: messages.Account.editProfilePhoto, exact: true })).toBeVisible();
      if (!response) throw new Error(`No response for ${route}`);
      const html = await response.text();
      const flight = await page.locator("script").evaluateAll((elements) => elements.flatMap((element) => {
        const match = element.textContent?.match(/^self\.__next_f\.push\(([\s\S]*)\)$/);
        if (!match) return [];
        const entry: unknown = JSON.parse(match[1]);
        return Array.isArray(entry) && entry[0] === 1 && typeof entry[1] === "string" ? [entry[1]] : [];
      }).join(""));
      const props = messageProps(flight);
      expect(props.length).toBeGreaterThan(0);
      const names = props.flatMap((dict) => Object.keys(dict));
      expect(names.length).toBe(new Set(names).size);
      expect(names.length).toBeLessThan(Object.keys(messages).length);
      for (const dict of props) for (const [namespace, value] of Object.entries(dict)) expect(value, namespace).toEqual(Object.entries(messages).find(([name]) => name === namespace)?.[1]);
      const rsc = await page.request.get(route, { headers: { RSC: "1" } });
      const rscBody = await rsc.text();
      const initial = await scripts(page);
      for (const deferred of ["profileEditor", "avatarCrop", "googleIntegration"]) expect(initial.flatMap((chunk) => chunk.modules), route).not.toContain(deferred);
      await page.getByRole("button", { name: messages.Account.editProfilePhoto, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: messages.Account.profileEditor, exact: true });
      await expect(dialog.locator('[name="profile-city"]')).toBeVisible();
      const opened = await scripts(page);
      await page.keyboard.press("Escape");
      measurements.push({ route, locale, dictionaryBytes: Buffer.byteLength(JSON.stringify(messages)), namespaces: props.map((dict) => Object.keys(dict)), messageBytes: props.reduce((sum, dict) => sum + Buffer.byteLength(JSON.stringify(dict)), 0), htmlBytes: Buffer.byteLength(html), flightBytes: Buffer.byteLength(flight), rscBytes: Buffer.byteLength(rscBody), rscMessageBytes: messageProps(rscBody).reduce((sum, dict) => sum + Buffer.byteLength(JSON.stringify(dict)), 0), initialJsBytes: initial.reduce((sum, chunk) => sum + chunk.bytes, 0), initialModules: initial.flatMap((chunk) => chunk.modules), profileOpenJsBytes: opened.filter((chunk) => !initial.some((item) => item.url === chunk.url)).reduce((sum, chunk) => sum + chunk.bytes, 0) });
    }
    await testInfo.attach(`translation-payload-${locale}`, { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
    expect(errors).toEqual([]);
  });
}

async function login(page: Page, index = 0, locale = "en") {
  await page.context().addCookies([{ name: "studioflow-locale", value: locale, url: "http://127.0.0.1:3100" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(accounts[index].email);
  await page.locator('input[type="password"]').fill(accounts[index].password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function scripts(page: Page) {
  const urls = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname).filter((url) => url.startsWith("/_next/static/") && url.endsWith(".js")));
  return [...new Set(urls)].map((url) => {
    const content = readFileSync(`.next/${url.slice("/_next/".length)}`);
    return { url, bytes: content.length, modules: Object.entries(moduleMarkers).filter(([, marker]) => content.includes(marker)).map(([name]) => name) };
  });
}

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studioId, name: "Profile shell browser" }).throwOnError();
  for (const account of accounts) {
    const user = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
    if (user.error) throw user.error;
    account.id = user.data.user.id;
    const role = account.role === "admin" ? "admin" : "employee";
    await service.from("profiles").upsert({ id: account.id, email: account.email, full_name: `Profile ${role}`, system_role: role, is_active: true, birth_date: "1990-02-03", country_code: "UA", city: "Kyiv" }).throwOnError();
    await service.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role: role, is_active: true, joined_at: "2024-01-01" }).throwOnError();
  }
});

test.afterAll(async () => {
  execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: `delete from public.studios where id='${z.uuid().parse(studioId)}';`, stdio: ["pipe", "ignore", "pipe"] });
  for (const account of accounts) if (account.id) await service.auth.admin.deleteUser(account.id);
});

test("locale dictionaries stay out of executable client chunks", () => {
  const chunks = readdirSync(".next/static/chunks").filter((file) => file.endsWith(".js")).map((file) => readFileSync(`.next/static/chunks/${file}`, "utf8"));
  for (const messages of [en, uk]) for (const text of [messages.Account.profileSaveFailed, messages.Crm.candidates.detailDescription, messages.Equipment.history.loadError]) {
    expect(chunks.some((chunk) => chunk.includes(text)), text).toBe(false);
  }
});

for (const [locale, messages] of [["en", en], ["uk", uk]] as const) {
  test(`remaining domain scopes and public pages ${locale}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (entry) => { if (/MISSING_MESSAGE|INVALID_MESSAGE|IntlError/.test(entry.text())) errors.push(entry.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await login(page, 0, locale);
    for (const route of ["/team", "/admin", "/leaderboard", "/contractors", "/archive", "/my-tasks", "/projects/templates", "/office/assignments", "/privacy", "/terms"]) {
      const response = await page.goto(route);
      expect(response?.ok(), route).toBe(true);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("button", { name: locale === "en" ? messages.Account.switchToUkrainian : messages.Account.switchToEnglish, exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

for (const [locale, messages, other] of [["en", en, uk], ["uk", uk, en]] as const) {
  test(`localized lazy workflows and client navigation ${locale}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (entry) => { if (/MISSING_MESSAGE|INVALID_MESSAGE|IntlError/.test(entry.text())) errors.push(entry.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    const equipmentId = randomUUID();
    const submissionId = randomUUID();
    const id = (value: string) => `'${z.uuid().parse(value)}'`;
    execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
      input: `insert into public.equipment(id,studio_id,equipment_type,display_name) values (${id(equipmentId)},${id(studioId)},'printer','Translation printer ${locale}');
        insert into public.submissions(id,studio_id,author_id,type,title,description) values (${id(submissionId)},${id(studioId)},${id(accounts[0].id)},'suggestion','Translation suggestion ${locale}','Translation discussion');`,
      stdio: ["pipe", "ignore", "pipe"],
    });
    await login(page, 0, locale);
    await page.locator('aside a[href="/projects"]').press("Enter");
    await page.getByRole("button", { name: messages.Projects.newProject, exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog.locator('[name="project_name"]').fill(`Translation project ${locale}`);
    await dialog.locator('[name="total_area_m2"]').fill("0");
    await dialog.getByRole("button", { name: messages.ProjectForm.create, exact: true }).click();
    await expect(dialog.getByText(messages.ProjectForm.validation.areaPositive, { exact: true })).toBeVisible();
    await dialog.locator('[name="total_area_m2"]').fill("100");
    await dialog.getByRole("button", { name: messages.ProjectForm.create, exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
    await page.getByRole("button", { name: messages.ProjectWorkspace.edit, exact: true }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.locator('[name="project_name"]')).toHaveValue(`Translation project ${locale}`);
    await dialog.locator('[name="client_name"]').fill("Localized client");
    await dialog.getByRole("button", { name: messages.ProjectForm.save, exact: true }).click();
    await expect(dialog).toHaveCount(0);

    await page.locator('aside a[href="/office"]').press("Enter");
    await page.locator('nav a[href="/office/equipment"]').click();
    await page.getByRole("button", { name: new RegExp(`Translation printer ${locale}`) }).click();
    dialog = page.getByRole("dialog", { name: `Translation printer ${locale}`, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("link", { name: messages.Equipment.maintenance.openWorkspace, exact: true }).click();
    await expect(dialog.getByRole("heading", { name: messages.Equipment.history.title, exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: messages.Equipment.history.record, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.locator('aside a[href="/calendar"]').press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(messages.Calendar.title);
    await page.locator('aside a[href="/office"]').press("Enter");
    await page.locator('nav a[href="/office/submissions"]').click();
    await page.getByRole("button", { name: new RegExp(`Translation suggestion ${locale}$`) }).click();
    dialog = page.getByRole("dialog", { name: `Translation suggestion ${locale}`, exact: true });
    await expect(dialog.getByText("Translation discussion", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: messages.Submissions.send, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.locator('aside a[href="/crm"]').press("Enter");
    await page.getByRole("button", { name: messages.Crm.leads.add, exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.locator('[name="client_name"]').fill(`Translation lead ${locale}`);
    await dialog.getByRole("button", { name: messages.Crm.save, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("row").filter({ hasText: `Translation lead ${locale}` }).getByRole("button", { name: messages.Crm.conversion.action, exact: true }).click();
    await expect(dialog.locator('[name="client_name"]')).toHaveValue(`Translation lead ${locale}`);
    await expect(dialog.getByRole("button", { name: messages.ProjectForm.create, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator('nav a[href="/crm/candidates"]').click();
    await page.getByRole("button", { name: messages.Crm.candidates.add, exact: true }).click();
    await dialog.locator('[name="full_name"]').fill(`Translation candidate ${locale}`);
    await dialog.locator('[name="target_position"]').locator("..").getByRole("combobox").click();
    await page.getByRole("option").nth(1).click();
    await dialog.getByRole("button", { name: messages.Crm.save, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: messages.Crm.candidates.openRecord.replace("{name}", `Translation candidate ${locale}`), exact: true }).click();
    await expect(dialog.getByRole("heading", { name: messages.Crm.candidates.currentCycle, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: messages.Account.editProfilePhoto, exact: true }).click();
    await expect(dialog.locator('[name="profile-city"]')).toBeVisible();
    await expect(dialog.getByRole("link", { name: messages.Account.connectGoogleCalendar, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: locale === "en" ? messages.Account.switchToUkrainian : messages.Account.switchToEnglish, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", locale === "en" ? "uk" : "en");
    await expect(page.getByRole("button", { name: other.Crm.candidates.add, exact: true })).toBeVisible();
    await page.getByRole("button", { name: other.Account.editProfilePhoto, exact: true }).click();
    await expect(page.getByRole("dialog", { name: other.Account.profileEditor, exact: true }).locator('[name="profile-city"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByRole("button", { name: other.Crm.candidates.add, exact: true })).toBeVisible();
    await page.locator('aside a[href="/projects"]').press("Enter");
    await page.getByRole("button", { name: other.Projects.newProject, exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: other.ProjectForm.create, exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
