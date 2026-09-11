import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";
import { pcConfigurationSchema } from "../../src/lib/pc-configuration";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local fixtures only");
const admin = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let studioId: string;
let userId: string;
let email: string;
let password: string;

function localSql(sql: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: sql, encoding: "utf8" }).trim();
}
function sqlId(value: string) { return `'${z.uuid().parse(value)}'`; }
function readConfiguration(id: string): unknown {
  return JSON.parse(localSql(`select pc_configuration from public.equipment where id = ${sqlId(id)};`));
}

async function choose(page: Page, scope: Locator, label: string, value: string) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}
function trigger(dialog: Locator, title: string) { return dialog.getByRole("button", { name: new RegExp(`^${title}`) }); }
function panel(dialog: Locator, title: string) { return dialog.getByRole("region", { name: new RegExp(`^${title}`) }); }
async function open(dialog: Locator, title: string) {
  const button = trigger(dialog, title);
  if (await button.getAttribute("aria-expanded") !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  return panel(dialog, title);
}
async function login(page: Page, locale = "en") {
  await page.context().addCookies([{ name: "studioflow-locale", value: locale, url: "http://127.0.0.1:3100" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/office/equipment");
  await expect(page).toHaveURL(/\/office\/equipment/);
}
async function motionFrames(button: Locator) {
  await button.scrollIntoViewIfNeeded();
  return button.evaluate(async (element) => {
    const id = element.getAttribute("aria-controls");
    const content = id ? document.getElementById(id) : null;
    const next = element.closest("section")?.nextElementSibling;
    if (!content || !next) throw new Error("Missing accordion layout");
    const frames: { height: number; nextTop: number; opacity: number; time: number }[] = [];
    const start = performance.now();
    if (!(element instanceof HTMLElement)) throw new Error("Expected accordion button");
    element.click();
    await new Promise<void>((resolve) => {
      const sample = () => {
        frames.push({ height: content.getBoundingClientRect().height, nextTop: next.getBoundingClientRect().top, opacity: Number(getComputedStyle(content).opacity), time: performance.now() - start });
        if (performance.now() - start < 350) requestAnimationFrame(sample); else resolve();
      };
      requestAnimationFrame(sample);
    });
    return frames;
  });
}
function expectVisibleLayoutMotion(frames: Awaited<ReturnType<typeof motionFrames>>) {
  const full = frames.at(-1)?.height ?? 0;
  expect(full).toBeGreaterThan(50);
  expect(frames.filter((frame) => frame.height > 2 && frame.height < full - 2).length).toBeGreaterThanOrEqual(3);
  expect(new Set(frames.map((frame) => Math.round(frame.nextTop))).size).toBeGreaterThan(3);
}

// Disposable local fixtures; inventory that predates this run is never changed.
test.beforeAll(async () => {
  studioId = randomUUID();
  email = `equipment-ui-${randomUUID()}@example.test`;
  password = `Ui-${randomUUID()}`;
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error) throw user.error;
  userId = user.data.user.id;
  await admin.from("studios").insert({ id: studioId, name: "Equipment UI test" }).throwOnError();
  await admin.from("profiles").upsert({ id: userId, email, full_name: "Equipment UI Admin", system_role: "admin", is_active: true }).throwOnError();
  await admin.from("studio_members").insert({ studio_id: studioId, user_id: userId, system_role: "admin", is_active: true }).throwOnError();
});
test.afterAll(async () => {
  if (studioId) localSql(`delete from public.studios where id = ${sqlId(studioId)};`);
  if (userId) { const result = await admin.auth.admin.deleteUser(userId); if (result.error) throw result.error; }
});

for (const locale of ["en", "uk"] as const) {
  test(`${locale}: real dialog animates, creates and edits structured PCs`, async ({ page }, testInfo) => {
    const t = (locale === "en" ? en : uk).Equipment;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await login(page, locale);
    await page.goto("/office/equipment?create=equipment");
    let dialog = page.getByRole("dialog");
    await choose(page, dialog, t.form.type, t.types.pc);
    await expect(dialog.locator('[name="displayName"]')).not.toHaveAttribute("required");
    const cpuButton = trigger(dialog, t.form.cpu);
    const opening = await motionFrames(cpuButton);
    const full = opening.at(-1)?.height ?? 0;
    expectVisibleLayoutMotion(opening);
    expect(opening.some((frame) => frame.opacity > 0.05 && frame.opacity < 0.95)).toBe(true);
    const closing = await motionFrames(cpuButton);
    expect(closing.at(-1)?.height).toBe(0);
    expect(closing.filter((frame) => frame.height > 2 && frame.height < full - 2).length).toBeGreaterThanOrEqual(3);
    await testInfo.attach("accordion-frame-measurements", { body: JSON.stringify({ opening, closing }, null, 2), contentType: "application/json" });

    let cpu = await open(dialog, t.form.cpu);
    await cpu.getByRole("radio", { name: "Intel", exact: true }).check();
    await choose(page, cpu, t.configuration.family, "Core i7");
    await cpu.getByLabel(t.form.model, { exact: false }).fill("14700K");
    const gpu = await open(dialog, t.form.gpu);
    await expect(cpuButton).toHaveAttribute("aria-expanded", "false");
    await expect(dialog.locator('button[aria-expanded="true"][aria-controls]')).toHaveCount(1);
    await gpu.getByRole("radio", { name: t.configuration.integrated, exact: true }).check();
    await expect(gpu.getByRole("group", { name: t.configuration.vendor, exact: true })).toHaveCount(0);
    const ram = await open(dialog, t.form.ram);
    await ram.getByLabel(t.configuration.totalMemory).fill("64");
    await choose(page, ram, t.configuration.memoryType, "DDR5");
    await ram.getByLabel(t.configuration.moduleCount).fill("2");
    const drives = await open(dialog, t.form.storage);
    await drives.getByRole("button", { name: t.configuration.addDrive }).click();
    await drives.getByRole("button", { name: t.configuration.addDrive }).click();
    await choose(page, drives.getByRole("group").nth(1), t.configuration.driveType, "SATA SSD");
    await drives.getByLabel(t.configuration.capacity, { exact: true }).nth(1).fill("2");
    // Remove the first row: the second drive's controlled values must stay intact.
    await drives.getByRole("button", { name: t.configuration.removeDrive.replace("{number}", "1") }).click();
    await expect(drives.getByLabel(t.configuration.capacity, { exact: true })).toHaveValue("2");
    await drives.getByRole("button", { name: t.configuration.addDrive }).click();
    await trigger(dialog, t.form.storage).click();
    await expect(trigger(dialog, t.form.cpu)).toContainText("Intel Core i7 14700K");
    await expect(trigger(dialog, t.form.ram)).toContainText(`64 ${t.configuration.gb} · DDR5`);
    await expect(trigger(dialog, t.form.storage)).toContainText(`2 ${t.configuration.tb} SATA SSD + 1 ${t.configuration.tb} NVMe SSD`);
    const identity = await open(dialog, t.form.identification);
    await expect(identity.getByLabel(t.form.manufacturer, { exact: false })).toHaveCount(0);
    await identity.getByLabel(t.form.assetTag, { exact: false }).fill(`UI-PC-${locale}`);
    await dialog.getByRole("button", { name: t.actions.createEquipment, exact: true }).click();
    await expect(page).toHaveURL(/item=/);
    const id = new URL(page.url()).searchParams.get("item");
    if (!id) throw new Error("Missing created equipment ID");
    dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(localSql(`select display_name from public.equipment where id = ${sqlId(id)};`)).toBe(`UI-PC-${locale}`);
    const stored = pcConfigurationSchema.parse(readConfiguration(id));
    expect(stored.drives).toEqual([{ type: "sata_ssd", capacity: 2, unit: "TB" }, { type: "nvme_ssd", capacity: 1, unit: "TB" }]);
    expect(stored.graphics).toEqual({ mode: "integrated" });

    cpu = await open(dialog, t.form.cpu);
    await cpu.getByRole("radio", { name: "AMD", exact: true }).check();
    await cpu.getByRole("combobox", { name: t.configuration.family }).click();
    await expect(page.getByRole("option", { name: "Core i7", exact: true })).toHaveCount(0);
    await page.getByRole("option", { name: "Ryzen 7", exact: true }).click();
    await cpu.getByLabel(t.form.model, { exact: false }).fill("7800X3D");
    const editGpu = await open(dialog, t.form.gpu);
    await editGpu.getByRole("radio", { name: t.configuration.discrete, exact: true }).check();
    await choose(page, editGpu, t.configuration.family, "GeForce RTX");
    await editGpu.getByLabel(t.form.model, { exact: false }).fill("4070 Ti");
    await editGpu.getByLabel(t.configuration.vram).fill("12");
    await trigger(dialog, t.form.gpu).click();
    await expect(trigger(dialog, t.form.gpu)).toContainText(`NVIDIA GeForce RTX 4070 Ti · 12 ${t.configuration.gb}`);
    await dialog.screenshot({ path: testInfo.outputPath(`equipment-${locale}.png`) });
    await dialog.getByRole("button", { name: t.actions.saveEquipment, exact: true }).click();
    await expect.poll(() => readConfiguration(id)).toMatchObject({ processor: { manufacturer: "AMD", family: "Ryzen 7", model: "7800X3D" }, graphics: { mode: "discrete", details: { vendor: "NVIDIA", model: "4070 Ti", vramGb: 12 } } });
    await page.reload();
    await expect(trigger(page.getByRole("dialog"), t.form.cpu)).toContainText("AMD Ryzen 7 7800X3D");
    expect(errors).toEqual([]);
  });
}

test("legacy values, category identity, mobile and reduced motion", async ({ page }, testInfo) => {
  const t = en.Equipment;
  const id = randomUUID();
  localSql(`insert into public.equipment(id,studio_id,equipment_type,display_name,manufacturer,model,cpu,gpu,ram,storage) values (${sqlId(id)},${sqlId(studioId)},'pc','Legacy PC','Saved builder','Saved build','intel core i7-4790k','GTX 1080ti','32gb','unknown disks');`);
  await page.addInitScript(() => localStorage.setItem("studioflow-motion", "system"));
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/office/equipment?item=${id}`);
  let dialog = page.getByRole("dialog");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "system");
  await expect(trigger(dialog, t.form.cpu)).toContainText("intel core i7-4790k");
  for (const title of [t.form.identification, t.form.cpu, t.form.gpu, t.form.ram, t.form.storage]) {
    expectVisibleLayoutMotion(await motionFrames(trigger(dialog, title)));
  }
  await open(dialog, t.form.cpu);
  await expect(panel(dialog, t.form.cpu)).toContainText(t.configuration.savedTextHint);
  const identity = await open(dialog, t.form.identification);
  await expect(identity.getByLabel(t.form.manufacturer, { exact: false })).toHaveValue("Saved builder");
  await dialog.getByRole("button", { name: t.actions.saveEquipment, exact: true }).click();
  await expect(dialog.getByRole("button", { name: t.actions.saveEquipment, exact: true })).toBeEnabled();
  const row: unknown = JSON.parse(localSql(`select row_to_json(e) from (select manufacturer,model,cpu,gpu,ram,storage from public.equipment where id = ${sqlId(id)}) e;`));
  expect(row).toEqual({ manufacturer: "Saved builder", model: "Saved build", cpu: "intel core i7-4790k", gpu: "GTX 1080ti", ram: "32gb", storage: "unknown disks" });
  await page.goto("/office/equipment?create=equipment");
  dialog = page.getByRole("dialog");
  await choose(page, dialog, t.form.type, t.types.laptop);
  const laptopIdentity = await open(dialog, t.form.identification);
  await expect(laptopIdentity.getByLabel(t.form.manufacturer, { exact: false })).toBeVisible();
  await expect(laptopIdentity.getByLabel(t.form.model, { exact: false })).toBeVisible();
  const laptopSpecs = await open(dialog, t.form.specifications);
  await expect(laptopSpecs.locator('[name="cpu"]')).toBeVisible();
  await expect(dialog.getByRole("button", { name: t.configuration.addDrive })).toHaveCount(0);
  await choose(page, dialog, t.form.type, t.types.monitor);
  await expect(trigger(dialog, t.form.specifications)).toHaveCount(0);
  await open(dialog, t.form.identification);
  await expect(dialog.locator('[name="serialNumber"]')).toBeVisible();
  await expect(dialog.locator('[name="notes"]')).toBeVisible();
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath("equipment-mobile.png") });
  await trigger(dialog, t.form.identification).focus();
  await page.keyboard.press("Enter");
  await expect(trigger(dialog, t.form.identification)).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Tab");
  await expect(dialog.locator('[name="recurringMaintenanceEnabled"]')).toBeFocused();
});
