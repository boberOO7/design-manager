import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["127.0.0.1", "localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Project Finance fixtures require local Supabase");
const client = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID(), projectId = randomUUID(), bankId = randomUUID(), euroId = randomUUID();
const admin = { id: "", email: `project-finance-redesign-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` };
const studio = `'${z.uuid().parse(studioId)}'`;
const project = `'${z.uuid().parse(projectId)}'`;

function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}

function teardown() {
  // Test-only teardown for the isolated UUID tenant; no production history is touched.
  sql(`begin; set local session_replication_role=replica;
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
    delete from public.project_members where project_id=${project};
    delete from public.project_task_stage_columns where project_id in (select id from public.projects where studio_id=${studio});
    delete from public.project_activity where project_id in (select id from public.projects where studio_id=${studio});
    delete from public.notifications where studio_id=${studio};
    delete from public.projects where studio_id=${studio};
    delete from public.studio_members where studio_id=${studio};
    delete from public.studios where id=${studio}; commit;`);
}

test.beforeAll(async () => {
  await client.from("studios").insert({ id: studioId, name: "Project Finance redesign browser test" }).throwOnError();
  const result = await client.auth.admin.createUser({ email: admin.email, password: admin.password, email_confirm: true });
  if (result.error) throw result.error;
  admin.id = result.data.user.id;
  await client.from("profiles").upsert({ id: admin.id, email: admin.email, full_name: "Project Finance admin", system_role: "admin", is_active: true }).throwOnError();
  await client.from("studio_members").insert({ studio_id: studioId, user_id: admin.id, system_role: "admin" }).throwOnError();
  if (process.env.PROJECT_FINANCE_FIXTURE_STATE) {
    const file = process.env.PROJECT_FINANCE_FIXTURE_STATE;
    let previous: Array<Record<string, string>> = [];
    try {
      const value: unknown = JSON.parse(readFileSync(file, "utf8"));
      const parsed = z.union([z.record(z.string(), z.string()), z.array(z.record(z.string(), z.string()))]).parse(value);
      previous = Array.isArray(parsed) ? parsed : [parsed];
    } catch { /* First isolated run. */ }
    previous.push({ studioId, projectId, adminEmail: admin.email, adminId: admin.id });
    writeFileSync(file, JSON.stringify(previous, null, 2));
  }

  const day = sql("select (now() at time zone 'Europe/Kyiv')::date");
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(${studio},'UAH','${day}','${admin.id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
      ('${bankId}',${studio},'Operating UAH','UAH',0,'${admin.id}'),('${euroId}',${studio},'Operating EUR','EUR',0,'${admin.id}');
    select set_config('request.jwt.claim.sub','${admin.id}',false); select public.finalize_finance_setup(${studio});
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status,country_code)
      values(${project},${studio},'Finance redesign project',120,'2024-02-01','${admin.id}','active','UA');
    select public.save_finance_project_terms(${studio},'${randomUUID()}',${project},'{"stream":"design","mode":"design","revision":0,"amount":"300000","currency":"UAH","reason":"Signed project agreement"}');
    do $$declare unpaid uuid; partial uuid; settled uuid; supervision uuid; expense uuid; partial_cash uuid; matched_cash uuid; attributed_cash uuid; studio_cash uuid;
      category uuid; supervision_category uuid; expense_category uuid; d date:=(now() at time zone 'Europe/Kyiv')::date;
    begin
      select id into category from public.finance_categories where studio_id=${studio} and default_key='project_payments';
      select id into supervision_category from public.finance_categories where studio_id=${studio} and default_key='supervision';
      select id into expense_category from public.finance_categories where studio_id=${studio} and default_key='project_services';
      unpaid:=public.save_finance_project_item(${studio},gen_random_uuid(),${project},jsonb_build_object('stream','design','source','manual','item',jsonb_build_object(
        'direction','incoming','amount','60000','currency','UAH','categoryId',category,'description','Перший платіж','dueDate',d-2,'expectedDate',d,'commitment','agreed','certainty','fixed','established',true)));
      partial:=public.save_finance_project_item(${studio},gen_random_uuid(),${project},jsonb_build_object('stream','design','source','manual','item',jsonb_build_object(
        'direction','incoming','amount','80000','currency','UAH','categoryId',category,'description','Після концепції','dueDate',d+7,'expectedDate',d+7,'commitment','agreed','certainty','fixed','established',true)));
      settled:=public.save_finance_project_item(${studio},gen_random_uuid(),${project},jsonb_build_object('stream','design','source','manual','item',jsonb_build_object(
        'direction','incoming','amount','50000','currency','UAH','categoryId',category,'description','Фінальний платіж','dueDate',d+14,'expectedDate',d+14,'commitment','agreed','certainty','fixed','established',true)));
      supervision:=public.save_finance_project_item(${studio},gen_random_uuid(),${project},jsonb_build_object('stream','supervision','source','manual','item',jsonb_build_object(
        'direction','incoming','amount','10000','currency','UAH','categoryId',supervision_category,'description','Авторський нагляд','dueDate',d+21,'expectedDate',d+21,'commitment','agreed','certainty','fixed','established',true)));
      partial_cash:=public.record_finance_movement(${studio},gen_random_uuid(),jsonb_build_object('kind','incoming','date',d,'amount','20000','accountId','${bankId}','categoryId',category,'description','Часткова оплата'));
      perform public.allocate_finance_payment(${studio},gen_random_uuid(),partial,partial_cash,20000);
      perform public.record_finance_expected_payment(${studio},gen_random_uuid(),settled,jsonb_build_object('kind','incoming','date',d,'amount','1000','accountId','${euroId}',
        'categoryId',category,'description','Кросвалютне погашення','settlementFx',jsonb_build_object('rate','50','source','manual','effectiveDate',d)),50000);
      expense:=public.save_finance_project_item(${studio},gen_random_uuid(),${project},jsonb_build_object('stream','expenses','source','manual','item',jsonb_build_object(
        'direction','outgoing','amount','12000','currency','UAH','categoryId',expense_category,'description','Вимірювання на об’єкті','expectedDate',d,'commitment','agreed','certainty','fixed','established',true)));
      perform public.record_finance_expected_payment(${studio},gen_random_uuid(),expense,jsonb_build_object('kind','outgoing','date',d,'amount','4000','accountId','${bankId}',
        'categoryId',expense_category,'description','Часткова оплата витрати'),4000);
      attributed_cash:=public.record_finance_movement(${studio},gen_random_uuid(),jsonb_build_object('kind','incoming','date',d,'amount','12000','accountId','${bankId}',
        'categoryId',category,'description','Аванс для розподілу','allocationIntent',true,'projectReceiptSplits',jsonb_build_array(jsonb_build_object('projectId',${project},'amount','12000'))));
      studio_cash:=public.record_finance_movement(${studio},gen_random_uuid(),jsonb_build_object('kind','incoming','date',d,'amount','9000','accountId','${bankId}',
        'categoryId',category,'description','Надходження іншого проєкту','allocationIntent',true));
      perform public.activate_finance_recognition(${studio},gen_random_uuid(),date_trunc('month',d)::date);
      perform public.record_finance_recognition(${studio},gen_random_uuid(),jsonb_build_object('sourceKind','project_terms','sourceId',
        (select id from public.finance_project_current_terms where project_id=${project} and stream='design'),'classification','revenue','projectId',${project},
        'amount','150000','date',d,'periodStart',date_trunc('month',d)::date,'periodEnd',d,'description','Виконана частина робіт','reason','Browser fixture recognition'));
      perform public.save_finance_project_cost_estimate(${studio},gen_random_uuid(),${project},jsonb_build_object('revision',0,'currency','UAH','date',d,
        'directBudget','30000','laborBudget','18000','remainingDirect','15000','remainingLabor','9000','reason','Browser fixture cost estimate'));
    end $$;`);
});

test.afterAll(async () => {
  const keep = process.env.PROJECT_FINANCE_KEEP_FIXTURE === "1";
  if (!keep) teardown();
  if (admin.id && !keep) {
    const result = await client.auth.admin.deleteUser(admin.id);
    if (result.error) throw result.error;
  }
});

test("Project Finance workspaces preserve payment, cash, expense and result behavior", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const f = uk.Finance, p = f.project, workspace = f.projectWorkspace, resultT = f.projectResult, profit = f.profitability;
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://127.0.0.1:3000" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(admin.email);
  await page.locator('input[type="password"]').fill(admin.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  if (process.env.PROJECT_FINANCE_STORAGE_STATE) await page.context().storageState({ path: process.env.PROJECT_FINANCE_STORAGE_STATE });

  const projectHref = `/projects/${projectId}?view=finance`;
  await page.goto(projectHref);
  await expect(page.locator("[data-project-finance]")).toBeVisible();
  await page.getByRole("combobox", { name: f.displayCurrency, exact: true }).click();
  await page.getByRole("option", { name: "UAH", exact: true }).click();
  await expect(page.getByRole("region", { name: f.orders.scope, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: f.orders.scope, exact: true })).toContainText(/300[\s\u00a0]?000/);
  await expect(page.getByRole("region", { name: f.orders.scope, exact: true })).toContainText(/70[\s\u00a0]?000/);
  await expect(page.getByRole("region", { name: f.orders.scope, exact: true })).toContainText(/230[\s\u00a0]?000/);
  await expect(page.getByRole("navigation", { name: workspace.navigation, exact: true }).getByRole("link", { name: workspace.tabs.payments, exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-project-payment]')).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Перший платіж", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Після концепції", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Фінальний платіж", exact: true })).toBeVisible();
  await expect(page.getByText("Надходження іншого проєкту", { exact: true })).toHaveCount(0);

  // The summary's next-payment deep link stays inside this project and focuses the row.
  await page.getByRole("link", { name: new RegExp("Перший платіж") }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}.*financeTab=payments.*item=.*#expected-`));
  await expect(page.locator("#project-payments [data-selected]")).toHaveCount(1);
  await expect(page.locator("#project-payments [data-selected]")).toBeFocused();
  await expect(page.locator("#project-payments [data-project-payment] details[open]")).toHaveCount(0);
  await expect(page.locator("#project-payments [data-project-payment]").first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(projectHref);

  const firstPayment = page.locator('[data-project-payment]').filter({ has: page.getByRole("heading", { name: "Перший платіж", exact: true }) });
  await firstPayment.getByRole("button", { name: f.planning.detailsNamed.replace("{name}", "Перший платіж"), exact: true }).click();
  await expect(firstPayment).toContainText(f.planning.dueDate);
  await expect(firstPayment).toContainText(f.planning.expectedDate);
  await page.screenshot({ path: testInfo.outputPath("payment-details-desktop.png"), fullPage: true });
  await firstPayment.getByRole("button", { name: f.planning.detailsNamed.replace("{name}", "Перший платіж"), exact: true }).click();

  // Populated payment layout at desktop, notebook, and mobile widths.
  for (const [label, width, height] of [["desktop", 1440, 1000], ["notebook", 1024, 900], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(projectHref);
    await expect(page.locator('[data-project-payment]')).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "Після концепції", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const financeRoot = page.locator("[data-project-finance]");
    await financeRoot.scrollIntoViewIfNeeded();
    await financeRoot.screenshot({ path: testInfo.outputPath(`payments-${label}.png`) });
  }

  const partial = page.locator('[data-project-payment]').filter({ has: page.getByRole("heading", { name: "Після концепції", exact: true }) });
  await expect(partial).toContainText(/Частково|частково|20[\s\u00a0]?000/);
  await partial.getByRole("button", { name: workspace.actionsFor.replace("{name}", "Після концепції"), exact: true }).click();
  await expect(page.getByRole("button", { name: f.edit, exact: true }).last()).toBeVisible();
  await page.keyboard.press("Escape");
  await partial.getByRole("button", { name: f.planning.recordPayment, exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: f.movements.account, exact: true }).click();
  await page.getByRole("option", { name: "Operating UAH · UAH", exact: true }).click();
  const recordAmount = dialog.getByLabel(f.settlement.received, { exact: true });
  await recordAmount.fill("5000");
  await dialog.getByRole("button", { name: f.movements.record, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(sql(`select coalesce(sum(amount),0) from public.finance_allocations where studio_id=${studio} and expected_item_id=(select id from public.finance_expected_items where studio_id=${studio} and description='Після концепції') and amount>0`)).toBe("25000");

  // Project-attributed cash is an actionable exception; studio-only cash appears only in the explicit pool.
  const reviewCash = page.getByRole("button", { name: workspace.reviewCash, exact: true });
  await expect(reviewCash).toBeVisible();
  await reviewCash.click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Аванс для розподілу", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Надходження іншого проєкту", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: workspace.findStudioCash, exact: true }).click();
  await expect(dialog.getByText("Надходження іншого проєкту", { exact: true })).toBeVisible();
  await expect(dialog.getByText(workspace.studioCashHelp)).toBeVisible();
  await dialog.getByRole("button", { name: workspace.projectCash, exact: true }).click();
  await dialog.getByRole("button", { name: workspace.matchCash, exact: true }).click();
  let matchingChoice = page.getByRole("dialog");
  await expect(matchingChoice).toContainText("Авторський нагляд");
  await matchingChoice.getByRole("button", { name: /Перший платіж/ }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Перший платіж");
  await dialog.locator('input[name="amount"]').fill("12000");
  await dialog.getByRole("button", { name: f.planning.match, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(sql(`select coalesce(sum(amount),0) from public.finance_allocations where studio_id=${studio} and expected_item_id=(select id from public.finance_expected_items where studio_id=${studio} and description='Перший платіж') and amount>0`)).toBe("12000");
  await page.getByRole("button", { name: workspace.cashActions, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Надходження іншого проєкту", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: workspace.findStudioCash, exact: true }).click();
  await expect(dialog.getByText("Надходження іншого проєкту", { exact: true })).toBeVisible();
  await dialog.getByRole("listitem").filter({ hasText: "Надходження іншого проєкту" }).getByRole("button", { name: workspace.assignCash, exact: true }).click();
  await dialog.getByRole("button", { name: profit.addProject, exact: true }).click();
  await dialog.getByLabel(`${profit.amount} · UAH`, { exact: true }).fill("9000");
  await dialog.getByLabel(profit.reason, { exact: true }).fill("Browser test project attribution");
  await dialog.getByRole("button", { name: profit.saveCash, exact: true }).click();
  await expect(dialog.getByText("Надходження іншого проєкту", { exact: true })).toBeVisible();
  await expect.poll(() => sql(`select count(*) from public.finance_project_cash_items where studio_id=${studio} and project_id=${project} and amount=9000`)).toBe("1");
  await dialog.getByRole("button", { name: f.movements.close, exact: true }).click();

  // Matched cross-currency history remains progressively disclosed.
  const settled = page.locator('[data-project-payment]').filter({ has: page.getByRole("heading", { name: "Фінальний платіж", exact: true }) });
  await settled.getByRole("button", { name: workspace.history, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Фінальний платіж");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.screenshot({ path: testInfo.outputPath("payment-history-desktop-collapsed.png") });
  await dialog.getByRole("button", { name: workspace.settlementDetails, exact: true }).click();
  await expect(dialog).toContainText("50");
  await dialog.screenshot({ path: testInfo.outputPath("payment-history-dialog.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.screenshot({ path: testInfo.outputPath("payment-history-mobile-expanded.png") });
  await dialog.getByRole("button", { name: workspace.settlementDetails, exact: true }).click();
  await dialog.screenshot({ path: testInfo.outputPath("payment-history-mobile-collapsed.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole("button", { name: workspace.settlementDetails, exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("payment-history-desktop.png"), fullPage: true });
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await dialog.getByRole("button", { name: f.planning.unmatch, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.locator('textarea[name="reason"]').fill("Browser test releases only the matched portion");
  await dialog.getByRole("button", { name: f.planning.unmatch, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from public.finance_allocations where studio_id=${studio} and expected_item_id=(select id from public.finance_expected_items where studio_id=${studio} and description='Фінальний платіж') and amount<0`)).toBe("1");
  await page.goto(projectHref);
  const reopenedHistory = page.locator('[data-project-payment]').filter({ has: page.getByRole("heading", { name: "Фінальний платіж", exact: true }) });
  await reopenedHistory.getByRole("button", { name: workspace.actionsFor.replace("{name}", "Фінальний платіж"), exact: true }).click();
  await page.getByRole("button", { name: workspace.history, exact: true }).last().click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(f.planning.manualRelease);
  await dialog.getByRole("button", { name: f.movements.close, exact: true }).click();

  // Expense workspace retains the existing expense-payment flow and row.
  await page.getByRole("navigation", { name: workspace.navigation, exact: true }).getByRole("link", { name: workspace.tabs.expenses, exact: true }).click();
  await expect(page).toHaveURL(/financeTab=expenses/);
  await expect(page.getByRole("heading", { name: "Вимірювання на об’єкті", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("expenses-desktop.png"), fullPage: true });
  const expense = page.locator('[data-project-payment]').filter({ has: page.getByRole("heading", { name: "Вимірювання на об’єкті", exact: true }) });
  await expense.getByRole("button", { name: p.recordExpense, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: f.movements.account, exact: true }).click();
  await page.getByRole("option", { name: "Operating UAH · UAH", exact: true }).click();
  await dialog.getByLabel(`${f.movements.sentAmount} (UAH)`, { exact: true }).fill("2000");
  await dialog.getByRole("button", { name: f.movements.record, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(sql(`select coalesce(sum(amount),0) from public.finance_allocations where studio_id=${studio} and expected_item_id=(select id from public.finance_expected_items where studio_id=${studio} and description='Вимірювання на об’єкті') and amount>0`)).toBe("6000");
  await page.getByRole("navigation", { name: workspace.navigation, exact: true }).getByRole("link", { name: workspace.tabs.payments, exact: true }).click();
  await page.getByRole("combobox", { name: f.orders.category, exact: true }).click();
  await expect(page.getByRole("option", { name: p.streams.supervision, exact: true })).toBeVisible();
  await page.getByRole("option", { name: p.streams.other, exact: true }).click();
  await expect(page).toHaveURL(/stream=other/);
  await page.goBack();
  await expect(page).toHaveURL(/stream=design/);

  // Result displays recognition coverage independently from incomplete costs below the shared order summary.
  await page.getByRole("navigation", { name: workspace.navigation, exact: true }).getByRole("link", { name: workspace.tabs.result, exact: true }).click();
  await expect(page).toHaveURL(/financeTab=result/);
  const resultRoot = page.locator("#project-result");
  await expect(resultRoot).toBeVisible();
  await expect(resultRoot.getByRole("navigation", { name: resultT.periodLabel, exact: true }).getByRole("link", { name: resultT.period.all, exact: true })).toHaveAttribute("aria-current", "page");
  await expect(resultRoot.getByText(resultT.historyGapHelp)).toBeVisible();
  await expect(resultRoot.getByText(resultT.costsIncomplete)).toBeVisible();
  await expect(resultRoot.getByRole("button", { name: resultT.recognizeWork, exact: true })).toBeVisible();
  await expect(resultRoot.getByRole("button", { name: resultT.updateEstimate, exact: true })).toBeVisible();
  const contractSummary = page.getByRole("region", { name: f.orders.scope, exact: true });
  expect((await resultRoot.boundingBox())?.y).toBeGreaterThan((await contractSummary.boundingBox())?.y ?? 0);
  await resultRoot.getByRole("link", { name: resultT.period.custom, exact: true }).click();
  const customPeriod = resultRoot.locator("form");
  await expect(customPeriod.getByRole("combobox")).toHaveCount(2);
  await expect(customPeriod.locator('select[name="profitFrom"]')).toHaveCount(1);
  await expect(customPeriod.locator('select[name="profitTo"]')).toHaveCount(1);
  await expect(page).toHaveURL(/profitPeriod=custom/);
  await resultRoot.getByRole("link", { name: resultT.period.all, exact: true }).click();
  const csvLink = resultRoot.getByRole("link", { name: profit.exportCsv, exact: true });
  const exportHref = await csvLink.getAttribute("href");
  expect(exportHref).toContain(`project=${projectId}`);
  expect(exportHref).toContain("version=");
  await page.screenshot({ path: testInfo.outputPath("result-desktop.png"), fullPage: true });
  await resultRoot.getByRole("button", { name: resultT.updateEstimate, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(profit.unknownHelp);
  await dialog.locator('input[name="directBudget"]').fill("32000");
  await dialog.locator('input[name="laborBudget"]').fill("19000");
  await dialog.locator('input[name="remainingDirect"]').fill("14000");
  await dialog.locator('input[name="remainingLabor"]').fill("8000");
  await dialog.locator('textarea[name="reason"]').fill("Browser test estimate revision");
  await page.screenshot({ path: testInfo.outputPath("estimate-dialog-desktop.png"), fullPage: true });
  await dialog.getByRole("button", { name: profit.saveEstimate, exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from public.finance_project_cost_estimates where studio_id=${studio} and project_id=${project} and revision=2`)).toBe("1");
  await resultRoot.getByRole("button", { name: resultT.recognizeWork, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(resultT.recognizeDialogHelp);
  await dialog.locator('textarea[name="reason"]').fill("Browser test recognition revision");
  await dialog.getByRole("button", { name: f.management.confirmRecognition, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from public.finance_recognized_actuals where studio_id=${studio} and project_id=${project} and classification='revenue'`)).toBe("2");
  const staleExportResponse = await page.request.get(exportHref ?? "");
  expect(staleExportResponse.status()).toBe(409);
  await page.reload();
  const currentExportHref = await page.locator("#project-result").getByRole("link", { name: profit.exportCsv, exact: true }).getAttribute("href");
  const exportResponse = await page.request.get(currentExportHref ?? "");
  expect(exportResponse.ok()).toBeTruthy();
  expect(exportResponse.headers()["content-type"]).toContain("text/csv");

  // Narrow layout preserves the full workspace navigation and the result action hierarchy.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${projectId}?view=finance&financeTab=result`);
  await expect(page.locator("#project-result")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator("#project-result").screenshot({ path: testInfo.outputPath("result-mobile.png") });
  expect(pageErrors).toEqual([]);
});
