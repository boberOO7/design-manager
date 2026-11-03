import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import { signInLocalTestUser } from "../helpers/auth";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Lead proposal fixtures require local Supabase");
const service = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false } });
const studioId = randomUUID(), leadId = randomUUID();
const account = { id: "", email: `lead-proposal-ui-${randomUUID()}@example.test`, password: `Quote-${randomUUID()}` };

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studioId, name: "Lead quote UI fixture" }).throwOnError();
  const { data, error } = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
  if (error) throw error;
  account.id = data.user.id;
  await service.from("profiles").upsert({ id: account.id, full_name: "Quote UI administrator", email: account.email, system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role: "admin" }).throwOnError();
  execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: `insert into public.crm_leads(id,studio_id,client_name,company,approximate_area,first_contact_date)
      values('${leadId}','${studioId}','Lead proposal fixture','Клініка',100,'2026-11-01');`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
});

test.afterAll(async () => {
  // Transaction-local trigger bypass removes only this test's immutable history.
  execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: `begin; set local session_replication_role=replica;
      delete from public.crm_lead_proposals where studio_id='${studioId}';
      set local session_replication_role=origin;
      delete from public.crm_leads where studio_id='${studioId}';
      set local session_replication_role=replica;
      delete from private.finance_labor_membership_events where studio_id='${studioId}';
      set local session_replication_role=origin;
      delete from public.studio_members where studio_id='${studioId}';
      ${account.id ? `delete from public.profiles where id='${z.uuid().parse(account.id)}';` : ""}
      delete from public.studios where id='${studioId}'; commit;`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
  if (account.id) await service.auth.admin.deleteUser(account.id);
});

test("lead quote: clear validation, area formula, compact payments and saved PDF", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://localhost:3000" }]);
  await signInLocalTestUser(page, account);
  await page.goto("/crm/leads");
  await page.getByRole("button", { name: "Відкрити лід Lead proposal fixture", exact: true }).click();
  const leadDetail = page.getByRole("dialog").last();
  await expect(leadDetail.getByRole("button", { name: "Створити проєкт", exact: true })).toHaveCount(0);
  await expect(leadDetail.getByText("Контактний і комерційний контекст цього ліда.", { exact: true })).toHaveCount(0);
  await expect(leadDetail.getByRole("button", { name: "Редагувати", exact: true })).toHaveText("");
  await expect(leadDetail.getByRole("button", { name: "Історія", exact: true })).toHaveText("");
  mkdirSync(".local", { recursive: true });
  const proposalAction = leadDetail.locator("header").getByRole("button", { name: "Комерційна пропозиція", exact: true });
  const normalColor = await proposalAction.evaluate(element => getComputedStyle(element).backgroundColor);
  await proposalAction.hover();
  await expect(proposalAction).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -1)");
  await expect.poll(() => proposalAction.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(normalColor);
  // Tooltips open after 400 ms; observe past that delay before checking absence.
  await page.waitForTimeout(450);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.screenshot({ path: ".local/crm-lead-detail-hover.png" });
  await page.mouse.down();
  await expect.poll(() => proposalAction.evaluate(element => getComputedStyle(element).boxShadow)).toContain("inset");
  await page.mouse.move(0, 0); await page.mouse.up();
  await leadDetail.getByRole("button", { name: "Історія", exact: true }).hover();
  await expect(page.getByRole("tooltip", { name: "Історія", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await proposalAction.hover();
  await expect(proposalAction).toHaveCSS("transform", "none");
  await page.mouse.move(0, 0);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await page.screenshot({ path: ".local/crm-lead-detail-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => leadDetail.locator("header").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: ".local/crm-lead-detail-mobile.png" });
  await page.setViewportSize({ width: 1128, height: 1060 });
  await leadDetail.locator("header").getByRole("button", { name: "Комерційна пропозиція", exact: true }).click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog.getByRole("button", { name: "За м²", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByLabel("Площа (м²)", { exact: true })).toHaveValue("100");
  const currency = dialog.getByRole("combobox", { name: "Валюта", exact: true });
  await expect(currency).toContainText("USD");
  const currencyColor = await currency.evaluate(element => getComputedStyle(element).backgroundColor);
  await currency.hover();
  await expect.poll(() => currency.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(currencyColor);
  await expect(currency).toHaveCSS("transform", "none");
  await currency.click();
  const common = page.getByRole("group", { name: "Основні валюти", exact: true });
  await expect(common.getByRole("option")).toHaveText(["UAH", "USD", "EUR", "PLN"]);
  await expect(page.getByRole("group", { name: "Інші валюти", exact: true }).getByRole("option", { name: "AED", exact: true })).toBeAttached();
  await common.getByRole("option", { name: "PLN", exact: true }).click();
  await dialog.getByLabel("Ціна / м²", { exact: true }).fill("50");
  await expect(dialog.locator("[data-lead-price-formula]")).toContainText("50 PLN/м²");
  await currency.click();
  await page.getByRole("group", { name: "Основні валюти", exact: true }).getByRole("option", { name: "USD", exact: true }).click();
  const paymentList = dialog.locator(".lead-proposal-payment-list");
  async function expectSmoothGrowth(action: () => Promise<unknown>) {
    const before = await dialog.evaluate(element => element.getBoundingClientRect().height);
    await action();
    const heights = await dialog.evaluate(element => new Promise<number[]>(resolve => {
      const values: number[] = [], started = performance.now();
      function sample() {
        values.push(element.getBoundingClientRect().height);
        if (performance.now() - started < 350) requestAnimationFrame(sample);
        else resolve(values);
      }
      requestAnimationFrame(sample);
    }));
    expect(heights.at(-1)).toBeGreaterThan(before);
    expect(new Set(heights.map(height => Math.round(height))).size).toBeGreaterThan(2);
  }
  await expectSmoothGrowth(() => dialog.getByRole("button", { name: /4 платежі/ }).click());
  await dialog.getByRole("button", { name: /1 платіж/ }).click();
  await expect.poll(() => paymentList.evaluate(element => {
    const natural = element.firstElementChild?.getBoundingClientRect().height;
    return natural === undefined ? null : Math.abs(element.getBoundingClientRect().height - natural);
  })).toBeLessThan(1);
  await expectSmoothGrowth(() => dialog.getByRole("button", { name: "Додати платіж", exact: true }).click());
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(paymentList).toHaveCSS("transition-property", "none");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await dialog.getByRole("button", { name: /2 платежі/ }).click();
  await dialog.getByRole("button", { name: "Переглянути пропозицію", exact: true }).click();
  await expect(dialog.getByText("Вкажіть номер цифрами. Назву внесіть в окреме поле.")).toBeVisible();
  await expect(dialog.getByText("Сума часток має бути 100%, а сума кожного платежу — більшою за нуль.")).toHaveCount(0);
  await dialog.getByLabel("Номер КП", { exact: true }).fill("546");
  await dialog.getByLabel("Назва проєкту", { exact: true }).fill("Бімба");
  await expect(dialog.locator("[data-lead-price-formula]")).toContainText("100 м² × 50 USD/м²");
  await expect(dialog.getByRole("button", { name: "Знижка та ПДВ", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(dialog.getByRole("button", { name: "Примітки до платежів", exact: true })).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 1128, height: 1060 });
  const priceOptions = dialog.getByRole("button", { name: "Знижка та ПДВ", exact: true });
  const paymentNotes = dialog.getByRole("button", { name: "Примітки до платежів", exact: true });
  await expect.poll(async () => {
    const [price, notes] = await Promise.all([priceOptions.boundingBox(), paymentNotes.boundingBox()]);
    return price && notes ? price.y - notes.y : null;
  }).toBe(0);
  mkdirSync(".local", { recursive: true });
  await page.screenshot({ path: ".local/crm-lead-proposal-terms-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(() => dialog.locator("[data-lead-proposal-terms]").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: ".local/crm-lead-proposal-terms-mobile.png" });
  await page.setViewportSize({ width: 1128, height: 1060 });
  // The pasted project-style identifier from the reported failure is supported.
  await dialog.getByLabel("Номер КП", { exact: true }).fill("546 Бімба");
  await dialog.getByRole("button", { name: "Переглянути пропозицію", exact: true }).click();
  await expect(dialog.getByLabel("Назва проєкту", { exact: true })).toHaveValue("Бімба");
  const generate = dialog.getByRole("button", { name: "Створити PDF", exact: true });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  const generateColor = await generate.evaluate(element => getComputedStyle(element).backgroundColor);
  await generate.hover();
  await expect(generate).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -1)");
  await expect.poll(() => generate.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(generateColor);
  await generate.click();
  const download = dialog.getByRole("link", { name: "Завантажити PDF", exact: true });
  await expect(download).toBeVisible({ timeout: 30_000 });
  const response = await page.request.get(await download.getAttribute("href") ?? "");
  expect(response.status()).toBe(200);
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await dialog.getByRole("button", { name: "Закрити", exact: true }).last().click();
  await page.getByRole("button", { name: "Комерційна пропозиція", exact: true }).click();
  await expect(page.getByRole("dialog").last().getByRole("link", { name: "Завантажити PDF", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
