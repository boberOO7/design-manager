import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { createAutomaticLaborFixture, automaticLaborSql } from "../helpers/automatic-labor-fixture";
import { signInLocalTestUser } from "../helpers/auth";
import en from "../../messages/en.json";
import { startOfMondayWeek } from "../../src/lib/calendar";
import { getKyivDateOnly } from "../../src/lib/validation/project";

async function chooseWorkDate(log: Locator, date: string) {
  const trigger = log.locator("[data-work-log-date]");
  const current = await trigger.getAttribute("data-work-log-date");
  if (!current) throw new Error("Expected selected work-log date");
  await trigger.click();
  const popup = log.locator(`[id="${await trigger.getAttribute("aria-controls")}"]`);
  const monthIndex = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
  const offset = monthIndex(date) - monthIndex(current);
  for (let index = 0; index < Math.abs(offset); index++) {
    await popup.getByRole("button", { name: offset > 0 ? /^Next / : /^Previous / }).click();
  }
  const gridStart = startOfMondayWeek(`${date.slice(0, 7)}-01`);
  const index = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${gridStart}T00:00:00Z`)) / 86_400_000);
  await popup.getByRole("gridcell").nth(index).click();
}

async function chooseDuration(log: Locator, row: Locator) {
  const trigger = row.locator("[data-work-log-duration]");
  await trigger.click();
  await log.getByRole("listbox", { name: "Hours", exact: true }).getByRole("option", { name: "02", exact: true }).click();
  await log.getByRole("listbox", { name: "Minutes", exact: true }).getByRole("option", { name: "00", exact: true }).click();
  await trigger.click();
}

async function saveWorkLog(page: Page, log: Locator) {
  const saved = page.waitForResponse(response => response.url().includes("/api/work-log") && response.request().method() === "PUT");
  await log.getByRole("button", { name: en.WorkLog.save, exact: true }).click();
  expect((await saved).ok()).toBe(true);
}

test("submitted work log automatically reaches Project Profitability as attributed labor", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const fixture = await createAutomaticLaborFixture();
  try {
    const date = "2026-08-03";
    const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:3100";
    await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: baseURL }]);
    const remindersReady = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/api/work-log") && url.searchParams.get("mode") === "reminders";
    });
    await signInLocalTestUser(page, fixture.employee);
    await remindersReady;
    await page.getByRole("button", { name: en.WorkLog.entry, exact: true }).click();
    const log = page.getByRole("dialog", { name: en.WorkLog.title });
    await chooseWorkDate(log, date);
    const row = log.locator(`[data-work-log-row="task:${fixture.taskId}"]`);
    await expect(row).toBeVisible();
    await chooseDuration(log, row);
    await saveWorkLog(page, log);
    await log.getByRole("button", { name: en.WorkLog.close, exact: true }).click();
    await expect(log).toHaveCount(0);

    // The normal post-save worker and daily retry path discover this closed payroll period.
    await expect.poll(() => automaticLaborSql(`select count(*) from public.finance_labor_calculations where studio_id='${fixture.studioId}'::uuid
      and obligation_id='${fixture.obligationId}'::uuid and status='applied'`), { timeout: 45_000, intervals: [500, 1000, 2000] }).toBe("1");
    expect(automaticLaborSql(`select string_agg(i.project_id::text||'|'||i.amount::text,',' order by i.project_id)
      from public.finance_current_labor_allocations i join public.finance_labor_cost_pools p on p.id=i.entry_id
      where p.studio_id='${fixture.studioId}'::uuid and p.obligation_id='${fixture.obligationId}'::uuid`)).toContain(`${fixture.projectId}|15.87`);

    const adminPage = await browser.newPage();
    try {
      await adminPage.context().addCookies([{ name: "studioflow-locale", value: "en", url: baseURL }]);
      await signInLocalTestUser(adminPage, fixture.admin);
      await adminPage.goto(`/projects/${fixture.projectId}?view=finance&financeTab=result`);
      const result = adminPage.locator("#project-result");
      await expect(result).toBeVisible();
      const currencySaved = adminPage.waitForResponse(response => new URL(response.url()).pathname === "/api/finance/display-currency" && response.request().method() === "PATCH");
      await adminPage.getByRole("combobox", { name: en.Finance.displayCurrency, exact: true }).click();
      await adminPage.getByRole("option", { name: "UAH", exact: true }).click();
      expect((await currencySaved).ok()).toBe(true);
      const labor = result.getByText(en.Finance.projectResult.attributedLabor, { exact: true }).locator("..");
      await expect(labor).toContainText("15.87 UAH");
      await expect(result.getByText(en.Finance.projectResult.costsIncomplete, { exact: true })).toBeVisible();
    } finally { await adminPage.close(); }
  } finally { await fixture.dispose(); }
});

test("current-month work appears as provisional labor without recognized payroll expense", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const today = getKyivDateOnly();
  const date = new Date(`${today}T00:00:00Z`);
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() - 1);
  const workDate = date.toISOString().slice(0, 10), periodStart = `${workDate.slice(0, 7)}-01`;
  const fixture = await createAutomaticLaborFixture({ periodStart, startsOn: workDate });
  try {
    const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:3100";
    await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: baseURL }]);
    const remindersReady = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/api/work-log") && new URL(response.url()).searchParams.get("mode") === "reminders");
    await signInLocalTestUser(page, fixture.employee);
    await remindersReady;
    await page.getByRole("button", { name: en.WorkLog.entry, exact: true }).click();
    const log = page.getByRole("dialog", { name: en.WorkLog.title });
    await chooseWorkDate(log, workDate);
    const row = log.locator(`[data-work-log-row="task:${fixture.taskId}"]`);
    await expect(row).toBeVisible();
    await chooseDuration(log, row);
    await saveWorkLog(page, log);
    await log.getByRole("button", { name: en.WorkLog.close, exact: true }).click();
    await expect.poll(() => automaticLaborSql(`select count(*) from public.finance_labor_calculations where studio_id='${fixture.studioId}'::uuid
      and obligation_id='${fixture.obligationId}'::uuid and status='provisional'`), { timeout: 45_000 }).toBe("1");
    const expected = automaticLaborSql(`select trunc(1000::numeric*120/(count(*)*360),2)::text from generate_series(date '${periodStart}',
      (date '${periodStart}'+interval '1 month - 1 day')::date,interval '1 day') d where extract(isodow from d) between 1 and 5`);
    expect(automaticLaborSql(`select count(*) from public.finance_recognition_entries where studio_id='${fixture.studioId}'::uuid`)).toBe("0");
    const adminPage = await browser.newPage();
    try {
      await adminPage.context().addCookies([{ name: "studioflow-locale", value: "en", url: baseURL }]);
      await signInLocalTestUser(adminPage, fixture.admin);
      await adminPage.goto(`/projects/${fixture.projectId}?view=finance&financeTab=result&profitPeriod=month`);
      const saved = adminPage.waitForResponse(response => new URL(response.url()).pathname === "/api/finance/display-currency" && response.request().method() === "PATCH");
      await adminPage.getByRole("combobox", { name: en.Finance.displayCurrency, exact: true }).click();
      await adminPage.getByRole("option", { name: "UAH", exact: true }).click();
      expect((await saved).ok()).toBe(true);
      const provisional = adminPage.locator("#project-result [data-provisional-labor]");
      await expect(provisional).toBeVisible();
      await expect(provisional).toContainText(`${expected} UAH`);
      await expect(provisional).toContainText("has not yet been recognized");
      expect(automaticLaborSql(`select count(*) from public.finance_recognition_entries where studio_id='${fixture.studioId}'::uuid`)).toBe("0");
    } finally { await adminPage.close(); }
  } finally { await fixture.dispose(); }
});
