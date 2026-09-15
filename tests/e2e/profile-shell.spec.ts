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
  for (const account of accounts) {
    if (!account.id) continue;
    const { data } = await service.storage.from("avatars").list(account.id);
    if (data?.length) await service.storage.from("avatars").remove(data.map((object) => `${account.id}/${object.name}`));
  }
  execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: `delete from public.studios where id='${z.uuid().parse(studioId)}';`, stdio: ["pipe", "ignore", "pipe"] });
  for (const account of accounts) if (account.id) await service.auth.admin.deleteUser(account.id);
});

test("production shell delivery and first profile interaction", async ({ page }, testInfo) => {
  await login(page);
  const measurements = [];
  for (const route of ["/dashboard", "/projects", "/office/equipment", "/calendar"]) {
    await page.goto(route);
    const trigger = page.getByRole("button", { name: en.Account.editProfilePhoto, exact: true });
    await expect(trigger).toBeVisible();
    const beforeBox = await trigger.boundingBox();
    const initial = await scripts(page);
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: en.Account.profileEditor, exact: true });
    await expect(dialog.locator('[name="profile-city"]')).toBeVisible();
    await expect(dialog.getByRole("link", { name: en.Account.connectGoogleCalendar, exact: true })).toBeVisible();
    const opened = await scripts(page);
    measurements.push({ route, initialBytes: initial.reduce((sum, chunk) => sum + chunk.bytes, 0), initial, firstOpen: opened.filter((chunk) => !initial.some((item) => item.url === chunk.url)), dialogBox: await dialog.boundingBox() });
    expect(await trigger.boundingBox()).toEqual(beforeBox);
    await dialog.getByRole("button", { name: en.Account.closeProfilePhoto, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await testInfo.attach("profile-shell-measurements", { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
  for (const measurement of measurements) {
    expect(measurement.initial.flatMap((chunk) => chunk.modules), measurement.route).not.toContain("profileEditor");
    expect(measurement.initial.flatMap((chunk) => chunk.modules), measurement.route).not.toContain("avatarCrop");
    expect(measurement.initial.flatMap((chunk) => chunk.modules), measurement.route).not.toContain("googleIntegration");
    expect(measurement.firstOpen.flatMap((chunk) => chunk.modules), measurement.route).toContain("profileEditor");
  }
});

for (const [locale, messages, account] of [["en", en, 0], ["uk", uk, 1]] as const) {
  test(`profile fields, city/date controls and keyboard on ${locale}`, async ({ page }) => {
    if (locale === "uk") await page.setViewportSize({ width: 390, height: 844 });
    await login(page, account, locale);
    const trigger = page.getByRole("button", { name: messages.Account.editProfilePhoto, exact: true });
    await trigger.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: messages.Account.profileEditor, exact: true });
    const city = dialog.locator('[name="profile-city"]');
    await expect(city).toHaveValue("Kyiv");
    await city.fill("Unsaved city");
    await dialog.getByRole("button", { name: messages.Account.cancel, exact: true }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(city).toHaveValue("Kyiv");
    await page.route("**/api/cities?*", (route) => route.fulfill({ json: { results: [{ id: 702550, name: "Lviv", displayName: "Lviv", region: "Lviv", countryName: "Ukraine" }] } }));
    await city.fill("Lvi");
    await expect(dialog.getByRole("option")).toBeVisible();
    await city.press("Enter");
    await expect(city).toHaveValue("Lviv");
    const birthday = dialog.getByRole("combobox", { name: messages.Account.birthday, exact: true });
    await birthday.click();
    await page.getByRole("button", { name: locale === "en" ? "Today" : "Сьогодні", exact: true }).click();
    if (account === 0) {
      await dialog.getByRole("combobox", { name: messages.Account.startDate, exact: true }).click();
      await page.getByRole("button", { name: "Today", exact: true }).click();
    } else {
      await expect(dialog.getByRole("combobox", { name: messages.Account.startDate, exact: true })).toHaveCount(0);
      await expect(dialog.getByText(messages.Account.startDateManagedByAdmin)).toBeVisible();
    }
    const birthdayText = await birthday.textContent();
    const popups = dialog.getByRole("checkbox", { name: messages.Account.notificationPopups, exact: true });
    const popupsEnabled = await popups.isChecked();
    await popups.setChecked(!popupsEnabled);
    const save = dialog.getByRole("button", { name: messages.Account.save, exact: true });
    await page.route("**/rest/v1/rpc/update_my_profile_details", (route) => route.fulfill({ status: 500, json: { message: "Unavailable" } }));
    await save.click();
    await expect(dialog.getByRole("alert")).toHaveText(messages.Account.profileSaveFailed);
    await expect(city).toHaveValue("Lviv");
    await page.unroute("**/rest/v1/rpc/update_my_profile_details");
    await save.click();
    await expect(dialog).toHaveCount(0);
    await trigger.click();
    await expect(city).toHaveValue("Lviv");
    await expect(birthday).toHaveText(birthdayText ?? "");
    await expect(popups).toBeChecked({ checked: !popupsEnabled });
    await expect(save).toBeDisabled();
    const box = await dialog.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });
}

test("slow profile code is cancellable without shifting the header or reopening itself", async ({ page }) => {
  const chunks = readdirSync(".next/static/chunks").filter((file) => file.endsWith(".js") && readFileSync(`.next/static/chunks/${file}`, "utf8").includes(moduleMarkers.profileEditor));
  expect(chunks.length).toBeGreaterThan(0);
  let requested = 0;
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/_next/static/chunks/*.js", async (route) => {
    if (chunks.some((file) => new URL(route.request().url()).pathname.endsWith(`/${file}`))) { requested++; await held; }
    await route.continue();
  });
  try {
    await login(page);
    const trigger = page.getByRole("button", { name: en.Account.editProfilePhoto, exact: true });
    const box = await trigger.boundingBox();
    expect(requested).toBe(0);
    await trigger.click();
    await expect(page.getByRole("status")).toHaveText(en.Common.loading);
    await expect.poll(() => requested).toBeGreaterThan(0);
    expect(await trigger.boundingBox()).toEqual(box);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(page.getByRole("status")).toHaveText(en.Common.loading);
    await trigger.click();
    const chunkFinished = page.waitForResponse((response) => chunks.some((file) => new URL(response.url()).pathname.endsWith(`/${file}`)));
    release(); await chunkFinished;
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(page.locator('[name="profile-city"]')).toBeVisible();
    const count = requested;
    await page.keyboard.press("Escape");
    await trigger.click();
    await expect(page.locator('[name="profile-city"]')).toBeVisible();
    expect(requested).toBe(count);
  } finally { release(); }
});

test("avatar validation, crop, upload, reopen and removal use local Storage", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const trigger = page.getByRole("button", { name: en.Account.editProfilePhoto, exact: true });
  await trigger.click();
  const editor = page.getByRole("dialog", { name: en.Account.profileEditor, exact: true });
  const input = editor.locator('input[type="file"]');
  await input.setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(editor.getByRole("alert")).toHaveText(en.Account.unsupported_type);
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 600;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.fillStyle = "#527067"; context.fillRect(0, 0, 800, 600);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await input.setInputFiles({ name: "profile.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") });
  const crop = page.getByRole("dialog", { name: en.Account.cropAvatar, exact: true });
  const zoom = crop.getByRole("slider", { name: en.Account.zoom, exact: true });
  await expect(zoom).toBeEnabled();
  await zoom.focus(); await zoom.press("ArrowRight");
  await expect(zoom).toHaveValue("1.01");
  await crop.getByRole("button", { name: en.Account.cancel, exact: true }).click();
  await expect(input).toBeAttached();
  await input.setInputFiles({ name: "profile.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") });
  await expect(zoom).toBeEnabled();
  await crop.getByRole("button", { name: en.Account.usePhoto, exact: true }).click();
  await expect(editor.getByRole("button", { name: en.Account.removePhoto, exact: true })).toBeVisible();
  await expect(trigger.locator("img")).toHaveAttribute("src", /\.avatar\.png|\.avatar\.jpg/);
  const { data: objects, error } = await service.storage.from("avatars").list(accounts[0].id);
  expect(error).toBeNull();
  expect(objects?.map((object) => object.name).sort()).toEqual([expect.stringMatching(/\.avatar\.jpg$/), expect.stringMatching(/\.avatar\.jpg\.original$/)]);
  const imageUrl = await trigger.locator("img").getAttribute("src");
  if (!imageUrl) throw new Error("Uploaded avatar missing");
  const dimensions = await page.evaluate(async (url) => {
    const image = new Image(); image.src = url; await image.decode(); return [image.naturalWidth, image.naturalHeight];
  }, imageUrl);
  expect(dimensions).toEqual([512, 512]);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await editor.getByRole("button", { name: en.Account.removePhoto, exact: true }).click();
  await expect(trigger.locator("img")).toHaveCount(0);
  await expect(editor.getByRole("button", { name: en.Account.removePhoto, exact: true })).toHaveCount(0);
  const remaining = await service.storage.from("avatars").list(accounts[0].id);
  expect(remaining.error).toBeNull(); expect(remaining.data).toEqual([]);
});

test("OAuth return, reconnect, sync and nested disconnect preserve account state", async ({ page }) => {
  await login(page);
  let connected = true;
  let reconnect = false;
  let failDisconnect = true;
  let statusReads = 0;
  await page.route("**/api/integrations/google-calendar/status", (route) => {
    statusReads++;
    return route.fulfill({ json: connected ? { connected: true, email: "profile@example.test", calendarName: "Profile Team", requiresReconnect: reconnect, lastSyncAt: null, lastSyncError: null } : { connected: false } });
  });
  await page.route("**/api/integrations/google-calendar/sync", (route) => route.fulfill({ json: { inserted: 1, updated: 0, removed: 0 } }));
  await page.route("**/api/integrations/google-calendar/disconnect", (route) => {
    if (failDisconnect) return route.fulfill({ status: 500 });
    connected = false; return route.fulfill({ json: { success: true } });
  });
  await page.goto("/dashboard?keep=1&googleCalendar=connected#account");
  const editor = page.getByRole("dialog", { name: en.Account.profileEditor, exact: true });
  await expect(editor.getByText(en.Account.googleCalendarConnected, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\?keep=1#account$/);
  await expect(editor.getByText("profile@example.test")).toBeVisible();
  await editor.getByRole("button", { name: en.Account.syncNow, exact: true }).click();
  await expect(editor.getByText(en.Account.googleCalendarSyncComplete.replace("{inserted}", "1").replace("{updated}", "0").replace("{removed}", "0"))).toBeVisible();
  const disconnect = editor.getByRole("button", { name: en.Account.disconnectGoogleCalendar, exact: true });
  await disconnect.click();
  const confirm = page.getByRole("dialog", { name: en.Account.googleCalendarDisconnectTitle, exact: true });
  await expect(confirm.locator("[data-dialog-initial-focus]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0); await expect(disconnect).toBeFocused();
  await disconnect.click();
  await confirm.getByRole("button", { name: en.Account.disconnectGoogleCalendar, exact: true }).click();
  await expect(confirm.getByRole("alert")).toHaveText(en.Account.googleCalendarDisconnectFailed);
  failDisconnect = false;
  await confirm.getByRole("button", { name: en.Account.disconnectGoogleCalendar, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(editor.getByRole("link", { name: en.Account.connectGoogleCalendar, exact: true })).toHaveAttribute("href", "/api/integrations/google-calendar/connect");
  await page.keyboard.press("Escape");
  connected = true; reconnect = true;
  const previousReads = statusReads;
  await page.getByRole("button", { name: en.Account.editProfilePhoto, exact: true }).click();
  await expect(editor.getByRole("link", { name: en.Account.reconnectGoogleCalendar, exact: true })).toHaveAttribute("href", "/api/integrations/google-calendar/connect");
  expect(statusReads).toBeGreaterThan(previousReads);
  const callback = await page.request.get("/api/integrations/google-calendar/callback?state=invalid", { maxRedirects: 0 });
  expect(callback.status()).toBe(307);
  const target = new URL(callback.headers().location);
  expect(target.searchParams.get("googleCalendar")).toBe("invalid_state");
  // next start uses localhost for redirects; retain the fixture's 127.0.0.1 cookies.
  await page.goto(`${target.pathname}${target.search}`);
  await expect(editor.getByRole("alert")).toHaveText(en.Account.googleCalendarConnectFailed);
  await expect(page).toHaveURL(/\/dashboard$/);
});
