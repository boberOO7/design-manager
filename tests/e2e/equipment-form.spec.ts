import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";
import { computerConfigurationSchema } from "../../src/lib/pc-configuration";

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
    let next = element.closest("section")?.nextElementSibling;
    while (next && next.getBoundingClientRect().height === 0) next = next.nextElementSibling;
    if (!content || !next) throw new Error("Missing accordion layout");
    const frames: { height: number; nextTop: number; opacity: number; time: number }[] = [];
    const start = performance.now();
    if (!(element instanceof HTMLElement)) throw new Error("Expected accordion button");
    element.click();
    await new Promise<void>((resolve) => {
      const sample = () => {
        // Measure layout independently of the drawer's automatic scroll anchoring.
        let nextTop = next.getBoundingClientRect().top;
        for (let parent = next.parentElement; parent; parent = parent.parentElement) nextTop += parent.scrollTop;
        frames.push({ height: content.getBoundingClientRect().height, nextTop, opacity: Number(getComputedStyle(content).opacity), time: performance.now() - start });
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
  if (studioId) localSql(`delete from public.equipment_service_events where studio_id = ${sqlId(studioId)}; delete from public.studios where id = ${sqlId(studioId)};`);
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
    const cpuSwitch = cpu.getByRole("switch");
    await cpuSwitch.click();
    await cpuSwitch.click();
    await expect(cpuSwitch).toHaveAttribute("aria-checked", "true");
    await expect(cpuSwitch.locator("[data-binary-switch-thumb]")).toHaveCSS("transform", /matrix\(1, 0, 0, 1, [1-9]/);
    await choose(page, cpu, t.configuration.family, "Core i7");
    await cpu.getByLabel(t.form.model, { exact: false }).fill("14700K");
    const gpu = await open(dialog, t.form.gpu);
    await expect(cpuButton).toHaveAttribute("aria-expanded", "false");
    await expect(dialog.locator('button[aria-expanded="true"][aria-controls]')).toHaveCount(1);
    const graphicsSwitch = gpu.getByRole("switch");
    await graphicsSwitch.click();
    await expect(graphicsSwitch).toHaveAttribute("aria-checked", "false");
    await expect(graphicsSwitch).toHaveAttribute("data-binary-switch-state", "left");
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
    const motherboard = await open(dialog, t.configuration.motherboard);
    await motherboard.getByLabel(t.form.manufacturer, { exact: false }).fill("ASUS");
    await motherboard.getByLabel(t.form.model, { exact: false }).fill("ProArt Z790");
    await motherboard.getByLabel(t.configuration.chipset).fill("Z790");
    const powerSupply = await open(dialog, t.configuration.powerSupply);
    await powerSupply.getByLabel(t.form.manufacturer, { exact: false }).fill("Seasonic");
    await powerSupply.getByLabel(t.form.model, { exact: false }).fill("Focus GX");
    await powerSupply.getByLabel(t.configuration.wattage).fill("850");
    await choose(page, powerSupply, t.configuration.efficiency, "80 PLUS Gold");
    await trigger(dialog, t.configuration.powerSupply).click();
    await expect(trigger(dialog, t.form.cpu)).toContainText("Intel Core i7 14700K");
    await expect(trigger(dialog, t.form.ram)).toContainText(`64 ${t.configuration.gb} · DDR5`);
    await expect(trigger(dialog, t.form.storage)).toContainText(`2 ${t.configuration.tb} SATA SSD + 1 ${t.configuration.tb} NVMe SSD`);
    await expect(trigger(dialog, t.form.identification)).toHaveCount(0);
    await dialog.locator('[name="displayName"]').fill(`UI-PC-${locale}`);
    await dialog.getByRole("button", { name: t.actions.createEquipment, exact: true }).click();
    await expect(page).toHaveURL(/item=/);
    const id = new URL(page.url()).searchParams.get("item");
    if (!id) throw new Error("Missing created equipment ID");
    dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(localSql(`select display_name from public.equipment where id = ${sqlId(id)};`)).toBe(`UI-PC-${locale}`);
    expect(localSql(`select asset_tag from public.equipment where id = ${sqlId(id)};`)).toMatch(/^PC-\d{2,}$/);
    const stored = computerConfigurationSchema.parse(readConfiguration(id));
    expect(stored.drives).toEqual([{ type: "sata_ssd", capacity: 2, unit: "TB" }, { type: "nvme_ssd", capacity: 1, unit: "TB" }]);
    expect(stored.graphics).toEqual({ mode: "integrated" });
    expect(stored.motherboard).toEqual({ manufacturer: "ASUS", model: "ProArt Z790", chipset: "Z790" });
    expect(stored.powerSupply).toEqual({ manufacturer: "Seasonic", model: "Focus GX", wattage: 850, efficiency: "80 PLUS Gold" });

    cpu = await open(dialog, t.form.cpu);
    await cpu.getByRole("switch").click();
    await cpu.getByRole("combobox", { name: t.configuration.family }).click();
    await expect(page.getByRole("option", { name: "Core i7", exact: true })).toHaveCount(0);
    await page.getByRole("option", { name: "Ryzen 7", exact: true }).click();
    await cpu.getByLabel(t.form.model, { exact: false }).fill("7800X3D");
    const editGpu = await open(dialog, t.form.gpu);
    await editGpu.getByRole("switch").click();
    await choose(page, editGpu, t.configuration.family, "GeForce RTX");
    await editGpu.getByLabel(t.form.model, { exact: false }).fill("4070 Ti");
    await editGpu.getByLabel(t.configuration.vram).fill("12");
    await trigger(dialog, t.form.gpu).click();
    await expect(trigger(dialog, t.form.gpu)).toContainText(`NVIDIA GeForce RTX 4070 Ti · 12 ${t.configuration.gb}`);
    await dialog.screenshot({ path: testInfo.outputPath(`equipment-${locale}.png`) });
    await expect(dialog.getByRole("button", { name: t.configuration.save, exact: true })).toHaveCount(0);
    await expect.poll(() => readConfiguration(id)).toMatchObject({ processor: { manufacturer: "AMD", family: "Ryzen 7", model: "7800X3D" }, graphics: { mode: "discrete", details: { vendor: "NVIDIA", model: "4070 Ti", vramGb: 12 } } });
    await page.evaluate(() => { window.confirm = () => { document.documentElement.dataset.confirmCalled = "true"; return true; }; });
    await dialog.getByRole("button", { name: t.close, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-confirm-called", "true");
    await page.goto(`/office/equipment?item=${id}`);
    await expect(trigger(page.getByRole("dialog"), t.form.cpu)).toContainText("AMD Ryzen 7 7800X3D");
    expect(errors).toEqual([]);
  });
}

test("workstation bulk dialog keeps compact controls and stable geometry", async ({ page }, testInfo) => {
  const t = en.Equipment;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? `${event.reason.name}: ${event.reason.message}` : String(event.reason);
    document.documentElement.dataset.testUnhandledRejection = reason;
  }));
  await login(page);
  await expect(page.getByRole("button", { name: en.Office.create, exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: t.actions.addEquipment, exact: true })).toBeVisible();
  await page.goto("/office/equipment?create=workstation");
  const dialog = page.getByRole("dialog");
  const quantity = dialog.getByLabel(t.workstation.form.quantity, { exact: true });
  const startingNumber = dialog.getByLabel(t.workstation.form.startingNumber, { exact: true });
  const increase = dialog.getByRole("button", { name: t.workstation.form.increaseQuantity, exact: true });
  const decrease = dialog.getByRole("button", { name: t.workstation.form.decreaseQuantity, exact: true });
  const workstationType = dialog.locator("[data-binary-switch-state]");
  const leftTypeLabel = workstationType.locator('[data-binary-switch-label="left"]');
  const rightTypeLabel = workstationType.locator('[data-binary-switch-label="right"]');
  const rows = dialog.locator("[data-workstation-draft]");
  const editor = dialog.locator("[data-workstation-editor]");
  const firstName = rows.first().locator('input:not([type="number"])');
  await expect(dialog).toBeFocused();
  await expect(quantity).not.toBeFocused();
  await expect(rows.first().getByRole("combobox", { name: t.workstation.form.employee, exact: false })).toBeVisible();
  await expect(dialog.locator('input[type="checkbox"]')).toHaveCount(0);
  const initialDialogBox = await dialog.boundingBox();
  const initialIncreaseBox = await increase.boundingBox();
  if (!initialDialogBox || !initialIncreaseBox) throw new Error("Missing workstation dialog geometry");
  const baselineDialogBox = initialDialogBox;
  const baselineIncreaseBox = initialIncreaseBox;
  expect(baselineIncreaseBox.width).toBeGreaterThanOrEqual(44);
  expect(baselineIncreaseBox.height).toBeGreaterThanOrEqual(44);
  const quantityControlBox = await dialog.locator("[data-numeric-stepper]").boundingBox();
  const startingNumberBox = await startingNumber.boundingBox();
  const quantityFieldBox = await dialog.locator("[data-quantity-stepper]").locator("..").boundingBox();
  const startingNumberFieldBox = await startingNumber.locator("..").boundingBox();
  const quantityFieldStyle = await dialog.locator("[data-quantity-stepper]").locator("..").evaluate((element) => {
    const field = getComputedStyle(element);
    const label = getComputedStyle(element.firstElementChild!);
    return { fontSize: label.fontSize, lineHeight: label.lineHeight, marginBottom: label.marginBottom, rowGap: field.rowGap, paddingTop: field.paddingTop, paddingBottom: field.paddingBottom };
  });
  const startingNumberFieldStyle = await startingNumber.locator("..").evaluate((element) => {
    const field = getComputedStyle(element);
    const label = getComputedStyle(element.firstElementChild!);
    return { fontSize: label.fontSize, lineHeight: label.lineHeight, marginBottom: label.marginBottom, rowGap: field.rowGap, paddingTop: field.paddingTop, paddingBottom: field.paddingBottom };
  });
  const leftLabelBox = await leftTypeLabel.boundingBox();
  const rightLabelBox = await rightTypeLabel.boundingBox();
  if (!quantityControlBox || !startingNumberBox || !quantityFieldBox || !startingNumberFieldBox || !leftLabelBox || !rightLabelBox) throw new Error("Missing workstation control geometry");
  expect(quantityControlBox.height).toBe(44);
  expect(startingNumberBox.height).toBe(quantityControlBox.height);
  expect(startingNumberBox.y).toBe(quantityControlBox.y);
  expect(startingNumberFieldBox.height).toBe(quantityFieldBox.height);
  expect(startingNumberFieldBox.y).toBe(quantityFieldBox.y);
  expect(startingNumberFieldStyle).toEqual(quantityFieldStyle);
  expect(startingNumberBox.width).toBeGreaterThan(150);
  const thumb = workstationType.locator("[data-binary-switch-thumb]");
  const initialThumbBox = await thumb.boundingBox();
  const thumbTransition = await thumb.evaluate((element) => ({ duration: getComputedStyle(element).transitionDuration, property: getComputedStyle(element).transitionProperty }));
  expect(thumbTransition).toEqual({ duration: "0.22s", property: "transform, opacity" });
  await workstationType.click();
  await expect(workstationType).toHaveAttribute("data-binary-switch-state", "right");
  await page.waitForTimeout(80);
  const movingThumbBox = await thumb.boundingBox();
  await page.waitForTimeout(180);
  const finalThumbBox = await thumb.boundingBox();
  if (!initialThumbBox || !movingThumbBox || !finalThumbBox) throw new Error("Missing switch thumb geometry");
  expect(movingThumbBox.x).toBeGreaterThan(initialThumbBox.x);
  expect(movingThumbBox.x).toBeLessThan(finalThumbBox.x);
  expect(finalThumbBox.x - initialThumbBox.x).toBeCloseTo(28, 0);
  const movedLeftLabelBox = await leftTypeLabel.boundingBox();
  const movedRightLabelBox = await rightTypeLabel.boundingBox();
  expect(movedLeftLabelBox).toEqual(leftLabelBox);
  expect(movedRightLabelBox).toEqual(rightLabelBox);
  await workstationType.click();
  await page.waitForTimeout(40);
  await workstationType.click();
  await page.waitForTimeout(40);
  await workstationType.click();
  await expect(workstationType).toHaveAttribute("data-binary-switch-state", "left");
  await page.waitForTimeout(240);
  expect((await thumb.boundingBox())?.x).toBeCloseTo(initialThumbBox.x, 0);
  await firstName.fill("Keep this name");

  async function verifyQuantity(value: number) {
    await expect(quantity).toHaveValue(String(value));
    await expect(rows).toHaveCount(value);
    await page.waitForTimeout(220);
    const dialogBox = await dialog.boundingBox();
    const increaseBox = await increase.boundingBox();
    expect(dialogBox?.x).toBeCloseTo(baselineDialogBox.x, 0);
    expect(dialogBox?.y).toBeCloseTo(baselineDialogBox.y, 0);
    expect(dialogBox?.width).toBeCloseTo(baselineDialogBox.width, 0);
    expect(dialogBox?.height).toBeCloseTo(baselineDialogBox.height, 0);
    expect(increaseBox?.x).toBeCloseTo(baselineIncreaseBox.x, 0);
    expect(increaseBox?.y).toBeCloseTo(baselineIncreaseBox.y, 0);
    await dialog.screenshot({ path: testInfo.outputPath(`workstations-${value}.png`) });
  }
  async function captureContainedTransition(name: string, requireAnimation = true) {
    if (requireAnimation) {
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.effect instanceof KeyframeEffect && animation.effect.pseudoElement?.startsWith("::view-transition")).length)).toBeGreaterThan(0);
      expect(await editor.evaluate((element) => getComputedStyle(element).getPropertyValue("view-transition-group"))).toBe("contain");
      expect(await editor.evaluate((element) => getComputedStyle(element, "::view-transition-group-children(root)").overflow)).toBe("clip");
    }
    await page.screenshot({ path: testInfo.outputPath(name) });
  }

  await verifyQuantity(1);
  await increase.click();
  await expect(rows).toHaveCount(2);
  expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.effect instanceof KeyframeEffect && animation.effect.pseudoElement?.startsWith("::view-transition")).length)).toBeGreaterThan(0);
  await verifyQuantity(2);
  await increase.focus();
  await page.keyboard.press("Enter");
  await verifyQuantity(3);
  await quantity.fill("10");
  await verifyQuantity(10);
  for (let value = 11; value <= 20; value += 1) {
    await increase.click();
    await expect(quantity).toHaveValue(String(value));
  }
  await verifyQuantity(20);
  expect(await editor.evaluate((element) => element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY === "auto")).toBe(true);

  await quantity.fill("5");
  await expect(rows).toHaveCount(5);
  await captureContainedTransition("workstations-rapid-20-to-5.png");
  await verifyQuantity(5);
  await quantity.fill("1");
  await verifyQuantity(1);
  await quantity.fill("20");
  await expect(rows).toHaveCount(20);
  await captureContainedTransition("workstations-rapid-1-to-20.png");
  await verifyQuantity(20);
  await quantity.fill("1");
  await verifyQuantity(1);
  for (let value = 2; value <= 15; value += 1) {
    await increase.click();
    await expect(quantity).toHaveValue(String(value));
  }
  await captureContainedTransition("workstations-rapid-plus.png", false);
  await expect(rows).toHaveCount(15);
  for (let value = 14; value >= 10; value -= 1) {
    await decrease.click();
    await expect(quantity).toHaveValue(String(value));
  }
  await verifyQuantity(10);

  await expect(firstName).toHaveValue("Keep this name");
  await startingNumber.fill("4");
  await expect(rows.first().locator('input[type="number"]')).toHaveValue("4");
  await expect(rows.last().locator('input[type="number"]')).toHaveValue("13");
  expect(await quantity.evaluate((element) => getComputedStyle(element).appearance)).toBe("none");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("html").evaluate((element) => element.setAttribute("data-motion", "system"));
  await decrease.click();
  await expect(rows).toHaveCount(9);
  expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.effect instanceof KeyframeEffect && animation.effect.pseudoElement?.startsWith("::view-transition")).length)).toBe(0);
  await quantity.fill("20");
  await expect(rows).toHaveCount(20);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await editor.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath("workstations-mobile.png") });
  expect(await page.locator("html").getAttribute("data-test-unhandled-rejection")).toBeNull();
  expect(errors).toEqual([]);
});

test("workstation details preserves relationships and uses contextual equipment pickers", async ({ page }, testInfo) => {
  const t = en.Equipment;
  const workstationId = randomUUID();
  const occupiedWorkstationId = randomUUID();
  const connectedPcId = randomUUID();
  const movableMonitorId = randomUUID();
  const unattachedMouseId = randomUUID();
  const unrelatedPrinterId = randomUUID();
  localSql(`
    insert into public.workstations(id, studio_id, number, name, assigned_employee_id) values
      (${sqlId(workstationId)}, ${sqlId(studioId)}, 801, 'Focus desk', ${sqlId(userId)}),
      (${sqlId(occupiedWorkstationId)}, ${sqlId(studioId)}, 802, 'Window desk', null);
    insert into public.equipment(id, studio_id, equipment_type, display_name, workstation_id) values
      (${sqlId(connectedPcId)}, ${sqlId(studioId)}, 'pc', 'Connected PC', ${sqlId(workstationId)}),
      (${sqlId(movableMonitorId)}, ${sqlId(studioId)}, 'monitor', 'Move Monitor', ${sqlId(occupiedWorkstationId)}),
      (${sqlId(unattachedMouseId)}, ${sqlId(studioId)}, 'mouse', 'Ready Mouse', null),
      (${sqlId(unrelatedPrinterId)}, ${sqlId(studioId)}, 'printer', 'Office Printer', null);
  `);
  await login(page);
  await page.goto(`/office/equipment?item=${workstationId}`);
  const drawer = page.getByRole("dialog", { name: /^Workstation #/ });
  const group = (title: string) => drawer.getByRole("heading", { name: title, exact: true }).locator("..").locator("..");

  await expect(drawer.locator("header h2")).toHaveText(t.workstation.numberLabel.replace("{number}", "801"));
  await expect(drawer.locator("header")).toContainText("Focus desk");
  await expect(drawer.locator("header")).toContainText("Equipment UI Admin");
  await expect(drawer.locator("button[type='submit']")).toHaveCount(0);
  await expect(group(t.groups.computers)).toContainText("Connected PC");
  await expect(group(t.groups.monitors).locator("[class*='border-dashed']")).toHaveCount(0);

  const name = drawer.getByLabel(t.workstation.form.name, { exact: false });
  await name.fill("Quiet desk");
  await name.press("Tab");
  await expect.poll(() => localSql(`select name from public.workstations where id = ${sqlId(workstationId)};`)).toBe("Quiet desk");

  await drawer.getByRole("switch", { name: new RegExp(`^${t.workstation.form.type}`) }).click();
  await expect.poll(() => localSql(`select workstation_type from public.workstations where id = ${sqlId(workstationId)};`)).toBe("remote");

  await drawer.getByRole("button", { name: t.actions.more, exact: true }).click();
  await page.getByRole("menuitem", { name: t.workstation.actions.renumber, exact: true }).click();
  const renumberDialog = page.getByRole("dialog", { name: t.workstation.actions.renumber, exact: true });
  const number = renumberDialog.getByRole("textbox");
  await number.fill("802");
  await renumberDialog.getByRole("button", { name: t.workstation.actions.renumber, exact: true }).click();
  await expect(renumberDialog.getByRole("alert")).toHaveText(t.workstation.form.numberConflict);
  expect(localSql(`select number from public.workstations where id = ${sqlId(workstationId)};`)).toBe("801");

  await number.fill("803");
  await expect(renumberDialog.getByRole("alert")).toHaveCount(0);
  await renumberDialog.getByRole("button", { name: t.workstation.actions.renumber, exact: true }).click();
  await expect(renumberDialog).toHaveCount(0);
  await expect.poll(() => localSql(`select number from public.workstations where id = ${sqlId(workstationId)};`)).toBe("803");
  expect(localSql(`select assigned_employee_id from public.workstations where id = ${sqlId(workstationId)};`)).toBe(userId);
  expect(localSql(`select workstation_id from public.equipment where id = ${sqlId(connectedPcId)};`)).toBe(workstationId);

  await group(t.groups.monitors).getByRole("button", { name: t.assignment.attachMonitor, exact: true }).click();
  let picker = drawer.locator("[data-equipment-attach-picker]");
  await expect(picker).toContainText("Move Monitor");
  await expect(picker).toContainText(`${t.workstation.numberLabel.replace("{number}", "802")} · Window desk`);
  await expect(picker).not.toContainText("Ready Mouse");
  await expect(picker).not.toContainText("Office Printer");
  page.once("dialog", (dialog) => dialog.accept());
  await picker.getByRole("button", { name: /Move Monitor/ }).click();
  await expect.poll(() => localSql(`select workstation_id from public.equipment where id = ${sqlId(movableMonitorId)};`)).toBe(workstationId);
  await expect(group(t.groups.monitors)).toContainText("Move Monitor");

  await group(t.groups.peripherals).getByRole("button", { name: t.assignment.attachPeripheral, exact: true }).click();
  picker = drawer.locator("[data-equipment-attach-picker]");
  await picker.getByRole("searchbox", { name: t.assignment.search, exact: true }).fill("Ready");
  await expect(picker).toContainText("Ready Mouse");
  await expect(picker).not.toContainText("Move Monitor");
  await expect(picker).not.toContainText("Office Printer");
  await picker.getByRole("button", { name: /Ready Mouse/ }).click();
  await expect.poll(() => localSql(`select workstation_id from public.equipment where id = ${sqlId(unattachedMouseId)};`)).toBe(workstationId);
  await expect(group(t.groups.peripherals)).toContainText("Ready Mouse");

  await group(t.groups.computers).getByRole("button", { name: t.assignment.attachComputer, exact: true }).click();
  await drawer.locator("[data-equipment-attach-picker]").getByRole("searchbox").fill("__no_matching_pc__");
  await expect(drawer.locator("[data-equipment-attach-picker]")).toContainText(t.assignment.noMatches);
  await group(t.groups.computers).getByRole("button", { name: t.assignment.attachComputer, exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 700 });
  await drawer.evaluate((element) => { element.querySelector("div.min-h-0.flex-1")!.scrollTop = 120; });
  const savedScrollTop = await drawer.evaluate((element) => element.querySelector("div.min-h-0.flex-1")!.scrollTop);
  expect(savedScrollTop).toBeGreaterThan(0);
  await group(t.groups.computers).getByRole("button", { name: /^Connected PC/ }).click();
  await expect(page.locator("section[role='dialog']").filter({ has: page.locator("header h2", { hasText: "Workstation #803" }) })).toHaveCount(1);
  const equipmentDrawer = page.getByRole("dialog", { name: "Connected PC", exact: true });
  await expect(equipmentDrawer).toBeVisible();
  await equipmentDrawer.getByRole("button", { name: t.close, exact: true }).click();
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate((element) => element.querySelector("div.min-h-0.flex-1")!.scrollTop)).toBe(savedScrollTop);
  await drawer.screenshot({ path: testInfo.outputPath("workstation-details-contextual-attach.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(() => drawer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await drawer.screenshot({ path: testInfo.outputPath("workstation-details-contextual-attach-mobile.png") });
});

test("legacy values, laptop configuration, mobile and reduced motion", async ({ page }, testInfo) => {
  const t = en.Equipment;
  const id = randomUUID();
  localSql(`insert into public.equipment(id,studio_id,equipment_type,display_name,manufacturer,model,serial_number,cpu,gpu,ram,storage) values (${sqlId(id)},${sqlId(studioId)},'pc','Legacy PC','Saved builder','Saved build','LEGACY-SERIAL','intel core i7-4790k','GTX 1080ti','32gb','unknown disks');`);
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
  await expect(identity.getByLabel(t.form.serialNumber, { exact: false })).toHaveValue("LEGACY-SERIAL");
  await dialog.locator('[name="notes"]').fill("Preserve legacy configuration");
  await dialog.locator('[name="notes"]').press("Tab");
  await expect.poll(() => localSql(`select notes from public.equipment where id = ${sqlId(id)};`)).toBe("Preserve legacy configuration");
  const row: unknown = JSON.parse(localSql(`select row_to_json(e) from (select manufacturer,model,serial_number,cpu,gpu,ram,storage from public.equipment where id = ${sqlId(id)}) e;`));
  expect(row).toEqual({ manufacturer: "Saved builder", model: "Saved build", serial_number: "LEGACY-SERIAL", cpu: "intel core i7-4790k", gpu: "GTX 1080ti", ram: "32gb", storage: "unknown disks" });
  await page.goto("/office/equipment?create=equipment");
  dialog = page.getByRole("dialog");
  await choose(page, dialog, t.form.type, t.types.laptop);
  const laptopIdentity = await open(dialog, t.form.identification);
  await expect(laptopIdentity.getByLabel(t.form.manufacturer, { exact: false })).toBeVisible();
  await expect(laptopIdentity.getByLabel(t.form.model, { exact: false })).toBeVisible();
  const laptopGraphics = await open(dialog, t.form.gpu);
  await expect(laptopGraphics.getByRole("switch")).toBeVisible();
  await expect(laptopGraphics.getByRole("switch")).toContainText(t.configuration.integrated);
  await expect(laptopGraphics.getByRole("switch")).toContainText(t.configuration.discrete);
  const laptopStorage = await open(dialog, t.form.storage);
  await laptopStorage.getByRole("button", { name: t.configuration.addDrive }).click();
  await laptopStorage.getByRole("button", { name: t.configuration.addDrive }).click();
  await expect(laptopStorage.getByRole("group")).toHaveCount(2);
  await expect(trigger(dialog, t.configuration.motherboard)).toHaveCount(0);
  await expect(trigger(dialog, t.configuration.powerSupply)).toHaveCount(0);
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

test("equipment URL presentation avoids navigation and reconciles each edit once", async ({ page }) => {
  const t = en.Equipment;
  const firstId = randomUUID();
  const secondId = randomUUID();
  const workstationId = randomUUID();
  localSql(`
    insert into public.workstations(id,studio_id,number) values (${sqlId(workstationId)},${sqlId(studioId)},9901);
    insert into public.equipment(id,studio_id,equipment_type,display_name,serial_number,workstation_id) values
      (${sqlId(firstId)},${sqlId(studioId)},'monitor','Routing monitor A','routing-serial-a',${sqlId(workstationId)}),
      (${sqlId(secondId)},${sqlId(studioId)},'monitor','Routing monitor B','routing-serial-b',${sqlId(workstationId)});
  `);
  await login(page);
  await expect(page.getByRole("button", { name: /Routing monitor A/ })).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) => {
    // Automatic Link prefetches are separate from navigation/action requests.
    if (new URL(request.url()).pathname === "/office/equipment" && !request.headers()["next-router-prefetch"]) {
      requests.push(request.headers()["next-action"] ? "action" : request.method());
    }
  });
  const historyLength = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: /Routing monitor A/ }).click();
  let drawer = page.getByRole("dialog", { name: "Routing monitor A", exact: true });
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`item=${firstId}`));
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /Routing monitor A/ }).click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await page.getByRole("button", { name: /Routing monitor B/ }).click();
  drawer = page.getByRole("dialog", { name: "Routing monitor B", exact: true });
  await expect(drawer).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  // The revalidated Server Action payload must update the mounted drawer and list.
  await drawer.locator('[name="displayName"]').fill("Routing monitor saved");
  await drawer.locator('[name="displayName"]').press("Tab");
  drawer = page.getByRole("dialog", { name: "Routing monitor saved", exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(t.actions.saved, { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await page.getByRole("button", { name: /Routing monitor saved/ }).click();
  await expect(drawer.locator('[name="displayName"]')).toHaveValue("Routing monitor saved");
  await drawer.locator('[name="displayName"]').focus();
  await drawer.locator('[name="displayName"]').press("Tab");
  await drawer.getByRole("button", { name: t.close, exact: true }).click();

  // Creation keeps Link's push semantics; item selection/closing keep replace semantics.
  await page.getByRole("link", { name: t.actions.addEquipment, exact: true }).click();
  await expect(page).toHaveURL(/create=equipment/);
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/create=equipment/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: t.close, exact: true }).click();
  await page.getByRole("button", { name: /Routing monitor A/ }).click();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole("dialog", { name: "Routing monitor A", exact: true })).toBeVisible();
  // Allow any erroneously scheduled refresh/navigation to reach the request observer.
  await page.waitForTimeout(300);
  expect(requests).toEqual(["action"]);
  expect(localSql(`select display_name from public.equipment where id=${sqlId(secondId)};`)).toBe("Routing monitor saved");

  // A real document load still initializes a nested deep link correctly.
  await page.goto(`/office/equipment?item=${workstationId}&equipment=${firstId}`);
  await expect(page.getByRole("dialog", { name: "Routing monitor A", exact: true })).toBeVisible();
  requests.length = 0;
  await page.getByRole("dialog", { name: "Routing monitor A", exact: true }).getByRole("button", { name: t.close, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`item=${workstationId}$`));
  const workstation = page.getByRole("dialog", { name: "Workstation #9901", exact: true });
  await expect(workstation).toBeVisible();
  await workstation.getByRole("button", { name: /^Routing monitor saved/ }).click();
  await expect(page).toHaveURL(new RegExp(`equipment=${secondId}`));
  await expect(page.getByRole("dialog", { name: "Routing monitor saved", exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  expect(requests).toEqual([]);
});

test("equipment failed autosave keeps its error and discard protection without refreshing", async ({ page }) => {
  const t = en.Equipment;
  const id = randomUUID();
  localSql(`insert into public.equipment(id,studio_id,equipment_type,display_name) values (${sqlId(id)},${sqlId(studioId)},'printer','Failed routing save');`);
  await login(page);
  await page.goto(`/office/equipment?item=${id}`);
  const drawer = page.getByRole("dialog", { name: "Failed routing save", exact: true });
  await expect(drawer).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/office/equipment" && !request.headers()["next-router-prefetch"]) requests.push(request.headers()["next-action"] ? "action" : request.method());
  });
  await page.route("**/office/equipment**", async (route) => {
    if (!route.request().headers()["next-action"]) return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.abort("failed");
  });
  await drawer.locator('[name="displayName"]').fill("Unsaved routing name");
  await drawer.locator('[name="displayName"]').press("Tab");
  await expect(drawer.getByText(t.actions.saving, { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("alert")).toBeVisible();
  await expect(drawer.getByText(t.actions.saved, { exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await expect(drawer).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await page.unroute("**/office/equipment**");
  await page.getByRole("button", { name: /Failed routing save/ }).click();
  await expect(drawer.locator('[name="displayName"]')).toHaveValue("Failed routing save");
  expect(localSql(`select display_name from public.equipment where id=${sqlId(id)};`)).toBe("Failed routing save");
  await page.waitForTimeout(300);
  expect(requests).toEqual(["action"]);
});

test("inventory filters, isolated autosave, inventory code changes, and contextual maintenance", async ({ page }, testInfo) => {
  const t = en.Equipment;
  const pcId = randomUUID();
  const printerId = randomUUID();
  const coffeeId = randomUUID();
  const workstationId = randomUUID();
  localSql(`
    insert into public.workstations(id,studio_id,number,workstation_type) values (${sqlId(workstationId)},${sqlId(studioId)},901,'remote');
    insert into public.equipment(id,studio_id,equipment_type,display_name,manufacturer,model,workstation_id,pc_configuration) values
      (${sqlId(pcId)},${sqlId(studioId)},'pc','Inventory attached PC',null,null,${sqlId(workstationId)},'{"processor":{"manufacturer":"Intel","family":"Core i9","model":"13900K"},"graphics":{"mode":"integrated"},"memory":{"capacityGb":64,"generation":"DDR5","moduleCount":2},"drives":[{"type":"nvme_ssd","capacity":1,"unit":"TB"}]}'),
      (${sqlId(printerId)},${sqlId(studioId)},'printer','Inventory printer','Brother','HL-L2350DW',null,null),
      (${sqlId(coffeeId)},${sqlId(studioId)},'coffee_machine','Inventory coffee','Jura','E8',null,null);
  `);
  await login(page);
  await expect(page.getByRole("link", { name: t.views.inventory, exact: true })).toHaveAttribute("aria-current", "page");
  const search = page.getByRole("searchbox", { name: t.inventory.search });
  await search.fill("Inventory");
  const pcRow = page.getByRole("button", { name: /Inventory attached PC/ });
  await expect(pcRow).toContainText("Intel Core i9 13900K");
  await expect(pcRow).toContainText(`64 ${t.configuration.gb}`);
  await expect(pcRow.locator("[data-workstation-badge]")).toHaveText("#901");
  await expect(pcRow.locator("[data-workstation-badge]")).toHaveAttribute("title", t.workstation.numberLabel.replace("{number}", "901"));
  await expect(page.getByRole("button", { name: /Inventory printer/ }).locator("[data-workstation-badge]")).toHaveCount(0);
  await page.getByRole("button", { name: t.inventory.office, exact: true }).click();
  await expect(page.getByRole("button", { name: /Inventory attached PC/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: t.types.printer, exact: true })).toContainText("Inventory printer");
  await expect(page.getByRole("region", { name: t.types.printer, exact: true })).toContainText("Brother HL-L2350DW");
  await expect(page.getByRole("region", { name: t.types.coffee_machine, exact: true })).toContainText("Inventory coffee");
  await expect(page.getByRole("region", { name: t.types.coffee_machine, exact: true })).toContainText("Jura E8");
  await page.screenshot({ path: testInfo.outputPath("inventory-office-groups.png") });
  await page.getByRole("button", { name: /Inventory printer/ }).click();
  let drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("button", { name: t.actions.saveEquipment, exact: true })).toHaveCount(0);
  await expect(drawer.getByRole("heading", { name: t.history.title, exact: true })).toHaveCount(0);
  const name = drawer.locator('[name="displayName"]');
  await name.fill("Inventory printer updated");
  expect(localSql(`select display_name from public.equipment where id=${sqlId(printerId)};`)).toBe("Inventory printer");
  await name.press("Tab");
  await expect.poll(() => localSql(`select display_name from public.equipment where id=${sqlId(printerId)};`)).toBe("Inventory printer updated");
  await page.route("**/office/equipment**", async (route) => {
    if (route.request().headers()["next-action"]) await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  await name.fill("Temporary queued name");
  await name.press("Tab");
  await name.fill("Inventory printer updated");
  await name.press("Tab");
  await expect(drawer.getByText(t.actions.saving, { exact: true })).toHaveCount(0);
  expect(localSql(`select display_name from public.equipment where id=${sqlId(printerId)};`)).toBe("Inventory printer updated");
  await page.unroute("**/office/equipment**");
  await choose(page, drawer, t.form.state, t.states.spare);
  await expect.poll(() => localSql(`select lifecycle_state from public.equipment where id=${sqlId(printerId)};`)).toBe("spare");
  // A notes autosave must not restore a stale maintenance date held by the drawer.
  localSql(`update public.equipment set recurring_maintenance_enabled=true,maintenance_interval_months=6,next_maintenance_due_date='2027-01-05' where id=${sqlId(printerId)};`);
  await drawer.locator('[name="notes"]').fill("Quiet notes");
  await drawer.locator('[name="notes"]').press("Tab");
  await expect.poll(() => localSql(`select notes from public.equipment where id=${sqlId(printerId)};`)).toBe("Quiet notes");
  expect(localSql(`select next_maintenance_due_date from public.equipment where id=${sqlId(printerId)};`)).toBe("2027-01-05");

  const originalCode = localSql(`select asset_tag from public.equipment where id=${sqlId(printerId)};`);
  const takenCode = localSql(`with inserted as (insert into public.equipment(studio_id,equipment_type) values (${sqlId(studioId)},'printer') returning asset_tag) select asset_tag from inserted;`);
  await drawer.getByRole("button", { name: t.actions.more, exact: true }).click();
  await page.getByRole("menuitem", { name: t.actions.changeCode }).click();
  const codeDialog = page.getByRole("dialog", { name: t.actions.changeCode, exact: true });
  await codeDialog.getByRole("textbox", { name: t.form.assetTagNumber, exact: true }).fill(takenCode.slice(4));
  await codeDialog.getByRole("button", { name: t.actions.changeCode, exact: true }).click();
  await expect(codeDialog.getByRole("alert")).toContainText(t.form.codeUnavailable);
  expect(localSql(`select asset_tag from public.equipment where id=${sqlId(printerId)};`)).toBe(originalCode);
  await codeDialog.getByRole("textbox", { name: t.form.assetTagNumber, exact: true }).fill("0099");
  await codeDialog.getByRole("button", { name: t.actions.changeCode, exact: true }).click();
  await expect(codeDialog).toHaveCount(0);
  drawer = page.getByRole("dialog");
  await expect(drawer.locator("header")).toContainText("PRN-0099");

  await drawer.getByRole("button", { name: t.service.send, exact: true }).click();
  const serviceDialog = page.getByRole("dialog", { name: t.service.send, exact: true });
  await expect(page.locator('section[role="dialog"]').filter({ has: page.locator("header h2", { hasText: "Inventory printer updated" }) })).toHaveCount(1);
  await expect(serviceDialog.getByRole("heading", { name: t.history.title })).toHaveCount(0);
  await choose(page, serviceDialog, t.service.type, t.history.types.repair);
  await serviceDialog.getByRole("button", { name: t.service.send, exact: true }).click();
  await expect(serviceDialog).toHaveCount(0);
  drawer = page.getByRole("dialog");
  await expect(drawer).toContainText(t.maintenance.currentlyInService);
  await expect(drawer.getByRole("button", { name: t.service.complete, exact: true })).toHaveCount(0);
  await drawer.getByRole("link", { name: t.maintenance.openWorkspace }).click();
  await expect(page).toHaveURL(/view=maintenance/);
  drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: t.history.title, exact: true })).toBeVisible();
  await expect(drawer.locator('[name="displayName"]')).toHaveCount(0);
  await drawer.getByRole("button", { name: t.service.complete, exact: true }).click();
  await expect.poll(() => localSql(`select lifecycle_state from public.equipment where id=${sqlId(printerId)};`)).toBe("active");
  await expect(drawer.getByRole("list")).toContainText(t.history.types.repair);
  expect(localSql(`select next_maintenance_due_date from public.equipment where id=${sqlId(printerId)};`)).toBe("2027-01-05");
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await page.getByRole("button", { name: t.inventory.all, exact: true }).click();
  await expect(page.getByRole("button", { name: /Inventory printer updated/ })).toBeVisible();

  await page.goto("/office/equipment");
  await page.getByRole("searchbox", { name: t.inventory.search }).fill("PRN-0099");
  await expect(page.getByRole("button", { name: /Inventory printer updated/ })).toBeVisible();
  await choose(page, page.locator("main"), t.form.state, t.states.retired);
  await expect(page.getByRole("heading", { name: t.inventory.noMatches })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.locator("main").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("inventory-mobile.png") });
});

test("creates remote workstations with normal numbering", async ({ page }) => {
  const t = en.Equipment;
  await login(page);
  await page.goto("/office/equipment?view=workstations&create=workstation");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("switch", { name: new RegExp(`^${t.workstation.form.type}`) }).click();
  await dialog.getByRole("button", { name: "Create workstation", exact: true }).click();
  await expect(page).toHaveURL(/item=/);
  const id = new URL(page.url()).searchParams.get("item");
  if (!id) throw new Error("Missing workstation");
  expect(localSql(`select workstation_type from public.workstations where id=${sqlId(id)};`)).toBe("remote");
  expect(Number(localSql(`select number from public.workstations where id=${sqlId(id)};`))).toBeGreaterThan(0);
});

test("floor plan places, moves, opens, and removes spatial entities", async ({ page }) => {
  const t = en.Equipment;
  const officeId = randomUUID();
  const remoteId = randomUUID();
  const printerId = randomUUID();
  const mouseId = randomUUID();
  localSql(`
    insert into public.workstations(id,studio_id,number,name,workstation_type) values
      (${sqlId(officeId)},${sqlId(studioId)},951,'Floor desk','office'),
      (${sqlId(remoteId)},${sqlId(studioId)},952,'Remote desk','remote');
    insert into public.equipment(id,studio_id,equipment_type,display_name) values
      (${sqlId(printerId)},${sqlId(studioId)},'printer','Floor printer'),
      (${sqlId(mouseId)},${sqlId(studioId)},'mouse','Floor mouse');
  `);
  await login(page);
  await page.goto("/office/equipment?view=workstations&layout=floor-plan");
  await expect(page.getByRole("link", { name: t.floorPlan.views.floorPlan, exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('svg image[href="/floor-1.svg"]')).toBeVisible();

  await page.getByRole("button", { name: t.floorPlan.edit, exact: true }).click();
  await expect(page.getByRole("button", { name: "Floor desk", exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remote desk", exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Floor printer", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Floor mouse", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Floor printer", exact: true }).click();
  await page.getByRole("button", { name: t.floorPlan.placeCenter, exact: true }).click();
  await page.getByRole("button", { name: /Workstation #951/ }).click();
  await page.getByRole("button", { name: t.floorPlan.placeCenter, exact: true }).click();
  const workstationMarker = page.locator('svg [role="button"][aria-label^="Workstation #951"]');
  await workstationMarker.focus();
  await page.keyboard.press("r");
  await page.keyboard.press("Shift+ArrowRight");
  await page.getByRole("button", { name: t.floorPlan.larger, exact: true }).click();
  const floorCanvas = page.getByRole("group", { name: t.floorPlan.canvasLabel.replace("{floor}", "1"), exact: true });
  const initialViewBox = await floorCanvas.getAttribute("viewBox");
  const pageScroll = await page.evaluate(() => window.scrollY);
  await floorCanvas.hover();
  await page.mouse.wheel(0, -180);
  await expect(floorCanvas).not.toHaveAttribute("viewBox", initialViewBox ?? "");
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
  await page.getByRole("button", { name: t.floorPlan.fitFloor, exact: true }).click();
  await expect(floorCanvas).toHaveAttribute("viewBox", "0 0 337.572 562.115");
  await page.getByRole("button", { name: t.floorPlan.save, exact: true }).click();
  await expect.poll(() => Number(localSql(`select count(*) from public.office_floor_plan_placements where studio_id=${sqlId(studioId)};`))).toBe(2);
  expect(Number(localSql(`select x from public.office_floor_plan_placements where workstation_id=${sqlId(officeId)};`))).toBeCloseTo(0.55, 4);
  expect(Number(localSql(`select display_metadata->>'rotation' from public.office_floor_plan_placements where workstation_id=${sqlId(officeId)};`))).toBe(90);
  expect(Number(localSql(`select display_metadata->>'width' from public.office_floor_plan_placements where workstation_id=${sqlId(officeId)};`))).toBeGreaterThan(34);

  await page.getByRole("button", { name: t.floorPlan.edit, exact: true }).click();
  await page.locator('svg [role="button"][aria-label="Floor printer"]').click();
  await page.getByRole("button", { name: t.floorPlan.floors["2"], exact: true }).last().click();
  await expect(page.locator('svg image[href="/floor-2.svg"]')).toBeVisible();
  const printerMarker = page.locator('svg [role="button"][aria-label="Floor printer"]');
  const markerBox = await printerMarker.boundingBox();
  if (!markerBox) throw new Error("Missing printer marker geometry");
  await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(markerBox.x + markerBox.width / 2 + 28, markerBox.y + markerBox.height / 2 + 18, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("button", { name: t.floorPlan.save, exact: true }).click();
  await expect.poll(() => localSql(`select floor::text from public.office_floor_plan_placements where equipment_id=${sqlId(printerId)};`)).toBe("2");
  expect(Number(localSql(`select x from public.office_floor_plan_placements where equipment_id=${sqlId(printerId)};`))).toBeGreaterThan(0.5);

  await page.locator('svg [role="button"][aria-label="Floor printer"]').click();
  const drawer = page.getByRole("dialog", { name: "Floor printer", exact: true });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: t.close, exact: true }).click();

  await page.getByRole("button", { name: t.floorPlan.edit, exact: true }).click();
  await page.locator('svg [role="button"][aria-label="Floor printer"]').click();
  await page.getByRole("button", { name: t.floorPlan.remove, exact: true }).click();
  await page.getByRole("button", { name: t.floorPlan.save, exact: true }).click();
  await expect.poll(() => Number(localSql(`select count(*) from public.office_floor_plan_placements where equipment_id=${sqlId(printerId)};`))).toBe(0);
  expect(localSql(`select display_name from public.equipment where id=${sqlId(printerId)};`)).toBe("Floor printer");

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.locator("main").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
});


test("concurrent inventory allocations cannot collide", async () => {
  const fixtureStudio = randomUUID();
  localSql(`insert into public.studios(id,name) values (${sqlId(fixtureStudio)},'Concurrent inventory test');`);
  try {
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => promisify(execFile)("docker", ["exec", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc", `insert into public.equipment(studio_id,equipment_type,display_name) values (${sqlId(fixtureStudio)},'pc','Concurrent ${index}') returning asset_tag;`])));
    const codes = results.map((result) => result.stdout.trim().split("\n")[0]);
    expect(new Set(codes)).toEqual(new Set(Array.from({ length: 12 }, (_, index) => `PC-${String(index + 1).padStart(2, "0")}`)));
  } finally { localSql(`delete from public.studios where id=${sqlId(fixtureStudio)};`); }
});

for (const locale of ["en", "uk"] as const) {
  test(`${locale}: local catalog search and manual fallback survive provider/search unavailability`, async ({ page }) => {
    const t = (locale === "en" ? en : uk).Equipment;
    const source = `ui_catalog_${randomUUID().replaceAll("-", "").slice(0,16)}`;
    // Synthetic references are confined to this test's source and removed in finally.
    localSql(`with catalog_model as (
        insert into public.equipment_catalog_models(catalog_type,manufacturer,model,is_current,on_market,popularity,provider_product_count,source_updated_at)
        values ('monitor','Catalog UI Dell','U2723UI',true,false,0,1,'2026-09-10') returning id
      ) insert into public.equipment_catalog_provider_products(source,source_product_id,catalog_model_id,is_current,on_market,popularity,source_updated_at,source_seen_at)
        select '${source}','1',id,true,false,0,'2026-09-10','2026-09-12' from catalog_model;
      insert into public.equipment_catalog_manufacturers(catalog_type,name,popularity,product_count) values ('monitor','Catalog UI Dell',999999999999,1) on conflict do nothing;`);
    const queries: URL[] = [];
    const external: string[] = [];
    page.on("request", request => {
      if (request.url().includes("/api/equipment/catalog?")) queries.push(new URL(request.url()));
      if (request.url().includes("icecat")) external.push(request.url());
    });
    try {
      await login(page, locale);
      await page.goto("/office/equipment?create=equipment");
      let dialog = page.getByRole("dialog");
      await choose(page, dialog, t.form.type, t.types.monitor);
      await dialog.locator('[name="displayName"]').fill(`Catalog selection ${locale}`);
      let identity = await open(dialog, t.form.identification);
      const manufacturer = identity.locator('input[name="manufacturer"]');
      await manufacturer.click();
      await expect(page.getByRole("option", { name: "Catalog UI Dell", exact: true })).toBeVisible();
      expect(await page.getByRole("listbox").getByRole("option").count()).toBeLessThanOrEqual(10);
      await manufacturer.fill("Catalog UI");
      await expect(page.getByRole("option", { name: "Catalog UI Dell", exact: true })).toBeVisible();
      await page.getByRole("option", { name: "Catalog UI Dell", exact: true }).click();
      const model = identity.locator('input[name="model"]');
      await model.fill("U");
      await page.waitForTimeout(350);
      expect(queries.filter(url => url.searchParams.get("field") === "model")).toHaveLength(0);
      await model.fill("U27");
      await expect(page.getByRole("option", { name: "U2723UI", exact: true })).toBeVisible();
      expect(queries.at(-1)?.searchParams.get("manufacturer")).toBe("Catalog UI Dell");
      await page.getByRole("option", { name: "U2723UI", exact: true }).click();
      await dialog.locator('button[type="submit"]').click();
      await expect(page).toHaveURL(/item=/);
      expect(localSql(`select model from public.equipment where studio_id=${sqlId(studioId)} and display_name='Catalog selection ${locale}'`)).toBe("U2723UI");

      await page.route("**/api/equipment/catalog?**", route => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
      await page.goto("/office/equipment?create=equipment");
      dialog = page.getByRole("dialog");
      await choose(page, dialog, t.form.type, t.types.printer);
      await dialog.locator('[name="displayName"]').fill(`Manual catalog fallback ${locale}`);
      identity = await open(dialog, t.form.identification);
      await identity.locator('input[name="manufacturer"]').click();
      await expect(page.getByRole("option", { name: "HP", exact: true })).toBeVisible();
      const unavailable = page.waitForResponse(response => response.url().includes("/api/equipment/catalog?") && response.status() === 503);
      await identity.locator('input[name="manufacturer"]').fill("Workshop 1985");
      await unavailable;
      await page.getByRole("option", { name: t.autocomplete.useValue.replace("{value}", "Workshop 1985"), exact: true }).click();
      await identity.locator('input[name="model"]').fill("Custom press Mk IV");
      await page.getByRole("option", { name: t.autocomplete.useValue.replace("{value}", "Custom press Mk IV"), exact: true }).click();
      await dialog.locator('button[type="submit"]').click();
      await expect(page).toHaveURL(/item=/);
      expect(localSql(`select manufacturer || ':' || model from public.equipment where studio_id=${sqlId(studioId)} and display_name='Manual catalog fallback ${locale}'`)).toBe("Workshop 1985:Custom press Mk IV");
      dialog = page.getByRole("dialog", { name: `Manual catalog fallback ${locale}`, exact: true });
      identity = await open(dialog, t.form.identification);
      await identity.locator('input[name="model"]').fill("Restored press Mk V");
      await identity.locator('input[name="model"]').press("Tab");
      await expect.poll(() => localSql(`select model from public.equipment where studio_id=${sqlId(studioId)} and display_name='Manual catalog fallback ${locale}'`)).toBe("Restored press Mk V");
      expect(external).toEqual([]);
    } finally {
      localSql(`delete from public.equipment_catalog_provider_products where source='${source}'; delete from public.equipment_catalog_models where manufacturer='Catalog UI Dell' and model='U2723UI'; delete from public.equipment_catalog_manufacturers where name='Catalog UI Dell';`);
    }
  });
}

test("catalog combobox cancels stale context and preserves server fuzzy results", async ({ page }) => {
  const t = en.Equipment;
  await login(page);
  await page.route("**/api/equipment/catalog?**", async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("field") === "manufacturer") return route.fulfill({ json: { suggestions: [] } });
    if (url.searchParams.get("query") === "old") {
      await new Promise(resolve => setTimeout(resolve, 800));
      return route.fulfill({ json: { suggestions: ["Stale result"] } }).catch(() => {});
    }
    return route.fulfill({ json: { suggestions: ["Fuzzy server result"] } });
  });
  await page.goto("/office/equipment?create=equipment");
  const dialog = page.getByRole("dialog");
  await choose(page, dialog, t.form.type, t.types.monitor);
  const identity = await open(dialog, t.form.identification);
  const input = identity.locator('input[name="model"]');
  const oldRequest = page.waitForRequest(request => new URL(request.url()).searchParams.get("query") === "old");
  await input.fill("old");
  await oldRequest;
  await input.fill("fzy");
  await expect(page.getByRole("option", { name: "Fuzzy server result", exact: true })).toBeVisible();
  await page.waitForTimeout(900);
  await expect(page.getByRole("option", { name: "Stale result", exact: true })).toHaveCount(0);
  await input.press("ArrowDown");
  await input.press("ArrowUp");
  await input.press("Enter");
  await expect(input).toHaveValue("Fuzzy server result");
});

test("service history is item-scoped, reused, locally retryable and reconciles after writes", async ({ page }, testInfo) => {
  const t = en.Equipment;
  const firstId = randomUUID(); const secondId = randomUUID();
  localSql(`insert into public.equipment(id,studio_id,equipment_type,display_name) values
    (${sqlId(firstId)},${sqlId(studioId)},'printer','Lazy history first'),
    (${sqlId(secondId)},${sqlId(studioId)},'printer','Lazy history second');
    insert into public.equipment_service_events(studio_id,equipment_id,event_type,started_on,completed_on,service_provider,cost_amount,cost_currency,started_notes,completion_notes) values
    (${sqlId(studioId)},${sqlId(firstId)},'repair','2026-01-01','2026-01-03','History provider',125,'UAH','Original start notes','Original completion notes'),
    (${sqlId(studioId)},${sqlId(secondId)},'upgrade','2026-02-01','2026-02-02',null,null,null,null,'Second item history');`);
  const historyReads: string[] = [];
  const navigations: string[] = [];
  let failSecond = true;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/office/equipment") return;
    if (request.headers()["next-action"] && [JSON.stringify([firstId]), JSON.stringify([secondId])].includes(request.postData() ?? "")) historyReads.push(request.postData() ?? "");
    if (request.method() === "GET" && !request.headers()["next-router-prefetch"]) navigations.push(request.url());
  });
  await page.route("**/office/equipment?**", async (route) => {
    if (!route.request().headers()["next-action"]) return route.continue();
    const body = route.request().postData();
    if (body === JSON.stringify([firstId])) await new Promise((resolve) => setTimeout(resolve, 250));
    if (body === JSON.stringify([secondId]) && failSecond) { failSecond = false; return route.abort("failed"); }
    await route.continue();
  });
  await login(page);
  expect(historyReads).toHaveLength(0);
  const initialNavigations = navigations.length;
  await page.getByRole("button", { name: /Lazy history first/ }).click();
  let drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  expect(historyReads).toHaveLength(0);
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await page.getByRole("button", { name: /Lazy history first/ }).click();
  expect(navigations).toHaveLength(initialNavigations);
  await drawer.getByRole("link", { name: t.maintenance.openWorkspace }).click();
  await expect(drawer.getByText(t.history.loading, { exact: true })).toBeVisible();
  await expect(drawer.getByRole("list")).toContainText("Original completion notes");
  await expect(drawer.getByRole("list")).toContainText("Original start notes");
  await expect(drawer.getByRole("list")).toContainText("History provider");
  expect(historyReads).toHaveLength(1);
  const maintenanceNavigations = navigations.length;
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await page.getByRole("button", { name: t.inventory.all, exact: true }).click();
  await page.getByRole("button", { name: /Lazy history first/ }).click();
  await expect(drawer.getByRole("list")).toContainText("Original completion notes");
  expect(historyReads).toHaveLength(1);
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await page.getByRole("button", { name: /Lazy history second/ }).click();
  await expect(drawer.getByRole("alert")).toHaveText(t.history.loadError);
  await expect(drawer.getByRole("button", { name: t.maintenance.saveSchedule })).toBeEnabled();
  await drawer.getByRole("button", { name: t.actions.retry, exact: true }).click();
  await expect(drawer.getByRole("list")).toContainText("Second item history");
  expect(historyReads).toHaveLength(3);
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await page.getByRole("button", { name: /Lazy history first/ }).click();
  await expect(drawer.getByRole("list")).toContainText("Original completion notes");
  expect(historyReads).toHaveLength(3);
  expect(navigations).toHaveLength(maintenanceNavigations);

  // A schedule edit follows the same authoritative refresh used by service writes.
  await drawer.getByRole("button", { name: t.maintenance.saveSchedule }).click();
  await expect.poll(() => historyReads.length).toBe(4);
  await expect(drawer.getByRole("list")).toContainText("Original completion notes");
  await drawer.locator('[name="notes"]').fill("Lazy service start");
  await drawer.getByRole("button", { name: t.service.send, exact: true }).click();
  await expect(drawer.getByRole("button", { name: t.service.complete, exact: true })).toBeVisible();
  await expect.poll(() => historyReads.length).toBe(5);
  await drawer.locator('[name="notes"]').fill("Lazy service completed");
  await drawer.getByRole("button", { name: t.service.complete, exact: true }).click();
  await expect(drawer.getByRole("list")).toContainText("Lazy service completed");
  expect(historyReads).toHaveLength(6);
  const updatedAt = localSql(`select updated_at from public.equipment where id=${sqlId(firstId)};`);
  await drawer.getByRole("button", { name: t.history.record, exact: true }).click();
  const historyForm = drawer.locator("form").filter({ has: page.getByRole("button", { name: t.history.save, exact: true }) });
  await historyForm.locator('[name="notes"]').fill("Recorded past repair");
  await historyForm.getByRole("button", { name: t.history.save, exact: true }).click();
  await expect(drawer.getByRole("list")).toContainText("Recorded past repair");
  expect(historyReads).toHaveLength(7);
  expect(localSql(`select updated_at from public.equipment where id=${sqlId(firstId)};`)).toBe(updatedAt);
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await page.getByRole("button", { name: /Lazy history first/ }).click();
  await expect(drawer.getByRole("list")).toContainText("Recorded past repair");
  expect(historyReads).toHaveLength(7);
  await page.goto(`/office/equipment?view=maintenance&item=${firstId}`);
  drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("list")).toContainText("Recorded past repair");
  expect(historyReads).toHaveLength(8);
  await page.goto(`/office/equipment?view=inventory&item=${firstId}`);
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(historyReads).toHaveLength(8);
  await testInfo.attach("history-requests", { body: JSON.stringify({ historyReads, navigations }), contentType: "application/json" });
});
