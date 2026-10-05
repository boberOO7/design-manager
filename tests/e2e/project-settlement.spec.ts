import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["127.0.0.1", "localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Settlement browser fixtures require local Supabase");
const client = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID(), projectId = randomUUID(), usdId = randomUUID(), eurId = randomUUID();
const admin = { id: "", email: `project-settlement-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` };
const studio = `'${z.uuid().parse(studioId)}'`, project = `'${z.uuid().parse(projectId)}'`;

function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}

function teardown() {
  sql(`begin; set local session_replication_role=replica;
    delete from public.finance_settlement_adjustments where studio_id=${studio};
    delete from public.finance_project_cash_items where studio_id=${studio};
    delete from public.finance_project_cash_revisions where studio_id=${studio};
    delete from public.finance_project_refund_items where studio_id=${studio};
    delete from public.finance_project_cost_estimates where studio_id=${studio};
    delete from public.finance_recognition_entries where studio_id=${studio};
    delete from public.finance_report_coverage where studio_id=${studio};
    delete from public.finance_project_items where studio_id=${studio};
    delete from public.finance_project_plan_revisions where studio_id=${studio};
    delete from public.finance_project_terms where studio_id=${studio};
    delete from public.finance_project_orders where studio_id=${studio};
    delete from public.finance_allocations where studio_id=${studio};
    delete from public.finance_expected_items where studio_id=${studio};
    delete from public.finance_planning_requests where studio_id=${studio};
    delete from public.finance_movement_entries where studio_id=${studio};
    delete from public.finance_movements where studio_id=${studio};
    delete from public.finance_accounts where studio_id=${studio};
    delete from public.finance_categories where studio_id=${studio};
    delete from public.finance_settings where studio_id=${studio};
    delete from public.project_members where project_id in (select id from public.projects where studio_id=${studio});
    delete from public.project_task_stage_columns where project_id in (select id from public.projects where studio_id=${studio});
    delete from public.project_activity where project_id in (select id from public.projects where studio_id=${studio});
    delete from public.notifications where studio_id=${studio};
    delete from public.projects where studio_id=${studio};
    delete from public.studio_members where studio_id=${studio};
    delete from public.studios where id=${studio}; commit;`);
}

test.beforeAll(async () => {
  await client.from("studios").insert({ id: studioId, name: "Project settlement browser test" }).throwOnError();
  const result = await client.auth.admin.createUser({ email: admin.email, password: admin.password, email_confirm: true });
  if (result.error) throw result.error;
  admin.id = result.data.user.id;
  await client.from("profiles").upsert({ id: admin.id, email: admin.email, full_name: "Project settlement admin", system_role: "admin", is_active: true }).throwOnError();
  await client.from("studio_members").insert({ studio_id: studioId, user_id: admin.id, system_role: "admin" }).throwOnError();

  const day = sql("select (now() at time zone 'Europe/Kyiv')::date");
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(${studio},'USD','${day}','${admin.id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
      ('${usdId}',${studio},'A Operating USD','USD',0,'${admin.id}'),('${eurId}',${studio},'B Operating EUR','EUR',0,'${admin.id}');
    select set_config('request.jwt.claim.sub','${admin.id}',false); select public.finalize_finance_setup(${studio});
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status,country_code)
      values(${project},${studio},'Settlement regression project',90,'2025-01-01','${admin.id}','active','UA');
    select public.save_finance_project_terms(${studio},'${randomUUID()}',${project},'${JSON.stringify({ stream: "design", mode: "design", revision: 0, amount: "2000", currency: "USD", reason: "Settlement browser fixture" })}');
    do $$declare first_item uuid; second_item uuid; initial_cash uuid; category uuid; d date:=(now() at time zone 'Europe/Kyiv')::date;
    begin
      select id into category from public.finance_categories where studio_id=${studio} and default_key='project_payments';
      first_item:=public.save_finance_project_item(${studio},gen_random_uuid(),${project},jsonb_build_object('stream','design','source','manual','item',jsonb_build_object(
        'direction','incoming','amount','1000','currency','USD','categoryId',category,'description','First contract stage','dueDate',d+1,'expectedDate',d+1,'commitment','agreed','certainty','fixed','established',true)));
      second_item:=public.save_finance_project_item(${studio},gen_random_uuid(),${project},jsonb_build_object('stream','design','source','manual','item',jsonb_build_object(
        'direction','incoming','amount','1000','currency','USD','categoryId',category,'description','Second contract stage','dueDate',d+7,'expectedDate',d+7,'commitment','agreed','certainty','fixed','established',true)));
      initial_cash:=public.record_finance_movement(${studio},gen_random_uuid(),jsonb_build_object('kind','incoming','date',d,'amount','170','accountId','${usdId}',
        'categoryId',category,'description','Initial USD advance'));
      perform public.allocate_finance_payment(${studio},gen_random_uuid(),first_item,initial_cash,170);
    end $$;`);
});

test.afterAll(async () => {
  teardown();
  if (admin.id) {
    const result = await client.auth.admin.deleteUser(admin.id);
    if (result.error) throw result.error;
  }
});

test("project settlement previews, records cross-currency allocations, and closes only a remainder", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const f = uk.Finance, workspace = f.projectWorkspace, settlement = f.settlement;
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://127.0.0.1:3000" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(admin.email);
  await page.locator('input[type="password"]').fill(admin.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);

  const projectHref = `/projects/${projectId}?view=finance&financeTab=payments`;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(projectHref);
  const first = page.locator("[data-project-payment]").filter({ has: page.getByRole("heading", { name: "First contract stage", exact: true }) });
  const second = page.locator("[data-project-payment]").filter({ has: page.getByRole("heading", { name: "Second contract stage", exact: true }) });
  await expect(first).toContainText(/830/);
  await expect(first).toContainText(/Частково/);
  await expect(second).toContainText(/1[\s\u00a0]?000/);
  await page.locator("[data-project-finance]").screenshot({ path: testInfo.outputPath("project-unpaid-and-partial-desktop.png") });

  const rowActions = second.getByRole("button", { name: workspace.actionsFor.replace("{name}", "Second contract stage"), exact: true });
  await rowActions.click();
  await expect(page.getByRole("button", { name: settlement.closeRemainder, exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await first.getByRole("button", { name: f.planning.recordPayment, exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("First contract stage");
  await dialog.getByRole("combobox", { name: f.movements.account, exact: true }).click();
  await page.getByRole("option", { name: "B Operating EUR · EUR", exact: true }).click();
  await dialog.getByLabel(settlement.received, { exact: true }).fill("1100");
  await dialog.getByRole("button", { name: settlement.changeFx, exact: true }).click();
  await dialog.getByRole("combobox", { name: f.movements.settlementSourceLabel, exact: true }).click();
  await page.getByRole("option", { name: settlement.actualRate, exact: true }).click();
  await dialog.getByRole("combobox", { name: settlement.manualInput, exact: true }).click();
  await page.getByRole("option", { name: settlement.equivalentOption.replace("{currency}", "USD"), exact: true }).click();
  await dialog.getByLabel(settlement.equivalent.replace("{obligation}", "USD"), { exact: true }).fill("1276");
  await expect(dialog).toContainText(/1 EUR = 1[,.]16 USD/);
  await dialog.getByRole("combobox", { name: settlement.manualInput, exact: true }).click();
  await page.getByRole("option", { name: settlement.rateOption, exact: true }).click();
  await dialog.getByLabel(f.movements.settlementRate.replace("{currency}", "EUR").replace("{obligation}", "USD"), { exact: true }).fill("1.16");
  await dialog.getByRole("button", { name: settlement.changeAllocation, exact: true }).click();
  const firstAllocation = dialog.getByLabel(settlement.applyTo.replace("{name}", "First contract stage").replace("{currency}", "USD"), { exact: true });
  const secondAllocation = dialog.getByLabel(settlement.applyTo.replace("{name}", "Second contract stage").replace("{currency}", "USD"), { exact: true });
  await expect(firstAllocation).toHaveValue("830.00");
  await expect(secondAllocation).toHaveValue("446.00");
  await secondAllocation.fill("330");
  const consequence = dialog.getByRole("status");
  await expect(consequence).toContainText(/100[,.]00\s*EUR/);
  await dialog.screenshot({ path: testInfo.outputPath("settlement-preview-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath("settlement-preview-mobile.png") });
  await dialog.getByRole("button", { name: f.movements.record, exact: true }).scrollIntoViewIfNeeded();
  await dialog.screenshot({ path: testInfo.outputPath("settlement-preview-mobile-bottom.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole("button", { name: f.movements.record, exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const allocations = sql(`select e.description||':'||sum(a.amount)::text from public.finance_allocations a join public.finance_expected_items e on e.studio_id=a.studio_id and e.id=a.expected_item_id where a.studio_id=${studio} and a.movement_id<>(select id from public.finance_movements where studio_id=${studio} and description='Initial USD advance') and a.amount>0 group by e.description order by e.description`);
  expect(allocations).toContain("First contract stage:830");
  expect(allocations).toContain("Second contract stage:330");
  expect(sql(`select e.amount::text||' '||e.currency from public.finance_movement_entries e where e.studio_id=${studio} and e.account_id='${eurId}' and e.entry_role='primary'`)).toMatch(/^1100(?:\.0+)? EUR$/);
  await page.goto(projectHref);
  await page.getByRole("button", { name: workspace.reviewCash, exact: true }).click();
  let cashDialog = page.getByRole("dialog");
  await expect(cashDialog).toContainText(workspace.nativeAdvance);
  await expect(cashDialog).toContainText(/100[,.]00\s*EUR/);
  await expect(cashDialog).toContainText(workspace.cashDistinction);
  await cashDialog.getByRole("button", { name: f.movements.close, exact: true }).click();

  const settledFirst = page.locator("[data-project-payment]").filter({ has: page.getByRole("heading", { name: "First contract stage", exact: true }) });
  await settledFirst.getByRole("button", { name: workspace.history, exact: true }).click();
  dialog = page.getByRole("dialog");
  const crossCurrencyEvent = dialog.getByRole("listitem").filter({ hasText: "830,00 USD" });
  await dialog.screenshot({ path: testInfo.outputPath("settlement-history-desktop-collapsed.png") });
  await crossCurrencyEvent.getByRole("button", { name: workspace.settlementDetails, exact: true }).click();
  await expect(dialog).toContainText(/1[\s\u00a0]100/);
  await expect(dialog).toContainText(settlement.nativeAllocated);
  await expect(dialog).toContainText(/1 EUR = 1[,.]16 USD/);
  await expect(dialog).toContainText(f.movements.manualShort);
  await dialog.screenshot({ path: testInfo.outputPath("settlement-history-expanded-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.screenshot({ path: testInfo.outputPath("settlement-history-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole("button", { name: f.movements.close, exact: true }).click();

  await page.goto(projectHref);
  const recordStageTwo = page.locator("[data-project-payment]").filter({ has: page.getByRole("heading", { name: "Second contract stage", exact: true }) });
  await recordStageTwo.getByRole("button", { name: f.planning.recordPayment, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: f.movements.account, exact: true }).click();
  await page.getByRole("option", { name: "A Operating USD · USD", exact: true }).click();
  await dialog.getByLabel(settlement.received, { exact: true }).fill("669.98");
  await dialog.getByRole("button", { name: f.movements.record, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(sql(`select e.amount::text||' '||e.currency from public.finance_movement_entries e where e.studio_id=${studio} and e.account_id='${usdId}' and e.entry_role='primary' order by e.amount desc limit 1`)).toMatch(/^669\.98(?:0+)? USD$/);
  const expectedCashCount = sql(`select count(*) from public.finance_movements where studio_id=${studio}`);

  const partialSecond = page.locator("[data-project-payment]").filter({ has: page.getByRole("heading", { name: "Second contract stage", exact: true }) });
  await partialSecond.getByRole("button", { name: workspace.actionsFor.replace("{name}", "Second contract stage"), exact: true }).click();
  await page.getByRole("button", { name: settlement.closeRemainder, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/0,02\s*USD/);
  await expect(dialog.locator('input[name="remaining"]')).toHaveValue(/^0\.02(?:0+)?$/);
  await expect(dialog).toContainText(settlement.closureHelp);
  await dialog.getByRole("combobox", { name: settlement.reason, exact: true }).click();
  for (const reason of Object.values(settlement.reasons)) await expect(page.getByRole("option", { name: reason, exact: true })).toBeVisible();
  await page.getByRole("option", { name: settlement.reasons.other, exact: true }).click();
  await dialog.getByLabel(settlement.explanation, { exact: true }).fill("Client accepted the remainder closure");
  await dialog.getByRole("checkbox", { name: settlement.confirmClosure }).check();
  await dialog.screenshot({ path: testInfo.outputPath("remainder-closure-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath("remainder-closure-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole("button", { name: settlement.closeRemainder, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from public.finance_movements where studio_id=${studio}`)).toBe(expectedCashCount);
  expect(sql(`select count(*) from public.finance_recognition_entries where studio_id=${studio}`)).toBe("0");
  expect(sql(`select amount::text||'|'||reason||'|'||explanation from public.finance_settlement_adjustments where studio_id=${studio} and amount>0`)).toMatch(/^0\.02(?:0+)?\|other\|Client accepted the remainder closure$/);

  await page.goto(projectHref);
  const closedSecond = page.locator("[data-project-payment]").filter({ has: page.getByRole("heading", { name: "Second contract stage", exact: true }) });
  await expect(closedSecond).toContainText(settlement.closed);
  await closedSecond.getByRole("button", { name: workspace.history, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(settlement.closedAmount);
  await expect(dialog).toContainText(settlement.noCash);
  await dialog.getByRole("button", { name: settlement.reverseClosure, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(settlement.reverseHelp);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(closedSecond.getByRole("button", { name: workspace.history, exact: true })).toBeFocused();
  await closedSecond.getByRole("button", { name: workspace.history, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: settlement.reverseClosure, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(settlement.reverseHelp);
  await dialog.getByLabel(settlement.reason, { exact: true }).fill("Correction after client confirmation");
  await dialog.getByRole("checkbox", { name: settlement.confirmReverse }).check();
  await dialog.getByRole("button", { name: settlement.reverseClosure, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from public.finance_settlement_adjustments where studio_id=${studio}`)).toBe("2");
  expect(sql(`select remaining_amount::text from public.finance_project_expected_balances where studio_id=${studio} and description='Second contract stage'`)).toMatch(/^0\.02(?:0+)?$/);
  expect(sql(`select count(*) from public.finance_movements where studio_id=${studio}`)).toBe(expectedCashCount);
  expect(pageErrors).toEqual([]);
});
