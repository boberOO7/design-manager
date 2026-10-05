import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["127.0.0.1", "localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Project orders fixtures require local Supabase");
const client = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID(), projectId = randomUUID(), accountId = randomUUID();
const admin = { id: "", email: `project-orders-${randomUUID()}@example.test`, password: `Orders-${randomUUID()}` };
const studio = `'${z.uuid().parse(studioId)}'`, project = `'${z.uuid().parse(projectId)}'`;
const facadeName = "Фасад · додаткове замовлення на архітектурну концепцію";
const sql = (statement: string) => execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();

function teardown() {
  // Only this test's isolated UUID tenant is removed; immutable production history is untouched.
  sql(`begin; set local session_replication_role=replica;
    delete from public.finance_project_proposals where studio_id=${studio};
    delete from public.finance_project_cash_items where studio_id=${studio};
    delete from public.finance_project_cash_revisions where studio_id=${studio};
    delete from public.finance_project_refund_items where studio_id=${studio};
    delete from public.finance_settlement_adjustments where studio_id=${studio};
    delete from public.finance_movement_corrections where studio_id=${studio};
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
  await client.from("studios").insert({ id: studioId, name: "Project orders browser test" }).throwOnError();
  const result = await client.auth.admin.createUser({ email: admin.email, password: admin.password, email_confirm: true });
  if (result.error) throw result.error;
  admin.id = result.data.user.id;
  await client.from("profiles").upsert({ id: admin.id, email: admin.email, full_name: "Project orders admin", system_role: "admin", is_active: true }).throwOnError();
  await client.from("studio_members").insert({ studio_id: studioId, user_id: admin.id, system_role: "admin" }).throwOnError();
  const today = sql("select (now() at time zone 'Europe/Kyiv')::date");
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(${studio},'EUR','${today}','${admin.id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${accountId}',${studio},'Order receipts','EUR',0,'${admin.id}');
    select set_config('request.jwt.claim.sub','${admin.id}',false); select public.finalize_finance_setup(${studio});
    select public.save_studio_contact_details(${studio},'https://space.example','orders@space.example','','','Менеджер замовлень');
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status,country_code,client_name)
      values(${project},${studio},'336 Інтер’єр будинку та додаткова архітектурна концепція фасаду',120,'${today}','${admin.id}','active','UA','Олена Коваль');
    select public.save_finance_project_plan(${studio},'${randomUUID()}',${project},jsonb_build_object(
      'revision',0,'pricingMethod','fixed','amount','6000','currency','EUR','vatRate',null,'priceBasis',null,'reason','Signed interior agreement',
      'known','[]'::jsonb,'items',jsonb_build_array(
        jsonb_build_object('id','','name','Аванс інтер’єру','amount','1800','percentage','30','dueDate','${today}','expectedDate','${today}'),
        jsonb_build_object('id','','name','Етап 2 інтер’єру','amount','3000','percentage','50','dueDate',date '${today}'+14,'expectedDate',date '${today}'+14),
        jsonb_build_object('id','','name','Фінальний платіж інтер’єру','amount','1200','percentage','20','dueDate',date '${today}'+30,'expectedDate',date '${today}'+30))));
    select public.save_finance_project_order(${studio},'${randomUUID()}',${project},jsonb_build_object('intent','rename','name','Інтер’єр','version',1,
      'orderId',(select id from public.finance_project_orders where studio_id=${studio} and project_id=${project} and is_default)));
    select public.save_finance_project_item(${studio},'${randomUUID()}',${project},jsonb_build_object('stream','supervision','source','manual','item',jsonb_build_object(
      'direction','incoming','amount','250','currency','EUR','categoryId',(select id from public.finance_categories where studio_id=${studio} and default_key='supervision'),
      'description','Окремий авторський нагляд','expectedDate','${today}','commitment','agreed','certainty','fixed','established',true)));
    select public.save_finance_project_item(${studio},'${randomUUID()}',${project},jsonb_build_object('stream','expenses','source','manual','item',jsonb_build_object(
      'direction','outgoing','amount','100','currency','EUR','categoryId',(select id from public.finance_categories where studio_id=${studio} and default_key='project_services'),
      'description','Обміри будинку','expectedDate','${today}','commitment','agreed','certainty','fixed','established',true)));`);
});

test.afterAll(async () => {
  teardown();
  if (admin.id) {
    const result = await client.auth.admin.deleteUser(admin.id);
    if (result.error) throw result.error;
  }
});

test("orders own proposals and schedules, and automatic receipts stay within the originating order", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const f = uk.Finance, orders = f.orders, builder = f.builder, proposal = f.proposal, workspace = f.projectWorkspace;
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/login");
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  await page.locator('input[type="email"]').fill(admin.email);
  await page.locator('input[type="password"]').fill(admin.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: new URL(page.url()).origin }]);
  const projectHref = `/projects/${projectId}?view=finance`;
  await page.goto(projectHref);
  const summary = page.getByRole("region", { name: orders.scope, exact: true });
  await summary.getByRole("combobox", { name: f.displayCurrency, exact: true }).click();
  await page.getByRole("option", { name: "EUR", exact: true }).click();
  await expect(summary).toContainText(/6[\s\u00a0]?000/);
  await expect(page.locator("[data-order-group]")).toHaveCount(1);
  await expect(page.locator("[data-project-payment]")).toHaveCount(3);
  await expect(page.getByRole("combobox", { name: orders.category, exact: true })).toContainText(orders.contractual);
  // The existing next-payment deep link retains row focus without opening another hierarchy.
  await summary.getByRole("link", { name: /Аванс інтер’єру/ }).click();
  await expect(page.locator("#project-payments [data-selected]")).toBeFocused();
  await page.goto(projectHref);

  await summary.getByRole("button", { name: orders.manage.replace("{count}", "1"), exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /Інтер’єр/ })).toBeVisible();
  await dialog.getByRole("button", { name: orders.add, exact: true }).click();
  await dialog.getByLabel(orders.name, { exact: true }).fill(facadeName);
  await dialog.getByRole("button", { name: orders.create, exact: true }).click();
  await expect(dialog.getByRole("heading", { name: facadeName, exact: true })).toBeVisible();
  await expect(dialog).toContainText(orders.draftHelp);
  await dialog.getByRole("button", { name: f.project.editAgreement, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByRole("combobox", { name: f.project.currency, exact: true })).toContainText("USD");
  await dialog.getByRole("button", { name: builder.fixedShort, exact: true }).click();
  await dialog.getByLabel(f.project.contract, { exact: true }).fill("3500");
  await dialog.getByRole("button", { name: "50 / 50", exact: true }).click();
  const discountChoices = dialog.getByRole("group", { name: builder.discount, exact: true });
  await discountChoices.getByRole("button", { name: builder.discountFixed, exact: true }).click();
  const discountAmount = dialog.getByRole("textbox", { name: builder.discountAmount, exact: true });
  await expect(discountAmount).toHaveValue("");
  await expect(discountAmount).toHaveAttribute("placeholder", "0");
  await discountAmount.fill("100");
  await expect(dialog.locator("[data-price-summary]")).toContainText("3 400,00 USD");
  await discountAmount.clear();
  await expect(dialog.locator("[data-price-summary]")).toContainText("3 500,00 USD");
  await expect(dialog.getByRole("button", { name: orders.saveDraft, exact: true })).toBeEnabled();
  await discountChoices.getByRole("button", { name: builder.discountNone, exact: true }).click();
  // Empty custom rates calculate as zero, and entering a preset value keeps the custom field open.
  for (const [groupName, fieldName, preset, none] of [
    [builder.vatRate, builder.customRate, "20", builder.vatNone],
    [builder.revenueTax, builder.revenueTaxCustomRate, "6", builder.revenueTaxNone],
  ] as const) {
    const choices = dialog.getByRole("group", { name: groupName, exact: true });
    await choices.getByRole("button", { name: builder.vatOther, exact: true }).click();
    const customRate = dialog.getByRole("textbox", { name: fieldName, exact: true });
    await expect(customRate).toHaveValue("");
    await expect(dialog.locator("[data-price-summary]")).toContainText("3 500,00 USD");
    await expect(dialog).not.toContainText(builder.invalidPreview);
    await customRate.fill(`letters${preset}x`);
    await expect(customRate).toHaveValue(preset);
    await customRate.fill("1,5abc");
    await expect(customRate).toHaveValue("1,5");
    await expect(customRate).toBeVisible();
    await customRate.clear();
    await expect(dialog.locator("[data-price-summary]")).toContainText("3 500,00 USD");
    await expect(dialog.getByRole("button", { name: orders.saveDraft, exact: true })).toBeEnabled();
    await choices.getByRole("button", { name: none, exact: true }).click();
  }
  await dialog.locator("[data-plan-row]").nth(0).getByLabel(builder.paymentName, { exact: true }).fill("Аванс фасаду");
  await dialog.locator("[data-plan-row]").nth(1).getByLabel(builder.paymentName, { exact: true }).fill("Фінальний платіж фасаду");
  await dialog.locator("[data-plan-row]").nth(0).getByLabel(f.planning.expectedDate, { exact: true }).click();
  await page.getByRole("button", { name: "Сьогодні", exact: true }).click();
  await dialog.getByRole("button", { name: orders.saveDraft, exact: true }).click();
  await expect(dialog.getByRole("button", { name: orders.confirm, exact: true })).toBeVisible();
  await dialog.screenshot({ path: testInfo.outputPath("order-manager-draft-desktop.png") });
  const facadeId = z.uuid().parse(sql(`select id from public.finance_project_orders where studio_id=${studio} and project_id=${project} and not is_default`));
  const canonicalCount = () => sql(`select count(*) from public.finance_project_items where studio_id=${studio} and project_id=${project} and stream='design'`);
  expect(canonicalCount()).toBe("3");
  expect(sql(`select status from public.finance_project_orders where id='${facadeId}'`)).toBe("draft");

  // A client-facing proposal can precede agreement confirmation without publishing finance rows.
  await dialog.getByRole("button", { name: proposal.action, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toContainText(proposal.orderDraft);
  await expect(dialog.locator("[data-proposal-pages] canvas")).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByRole("button", { name: proposal.generate, exact: true })).toBeEnabled({ timeout: 60_000 });
  await dialog.getByRole("button", { name: proposal.generate, exact: true }).click();
  await expect(dialog.getByRole("link", { name: proposal.download, exact: true })).toBeVisible({ timeout: 60_000 });
  const pdfHref = await dialog.getByRole("link", { name: proposal.download, exact: true }).getAttribute("href");
  expect(pdfHref).toContain(`orderId=${facadeId}`);
  const original = await page.request.get(pdfHref ?? "");
  expect(original.headers()["content-disposition"]).toContain(`SPACE-336-${facadeId}-r1.pdf`);
  const pdfBytes = await original.body();
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(canonicalCount()).toBe("3");
  await dialog.getByRole("button", { name: proposal.close, exact: true }).last().click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: facadeName, exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: f.movements.close, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(summary).toContainText(/6[\s\u00a0]?000/);
  await expect(page.locator("[data-order-group]")).toHaveCount(1);

  await summary.getByRole("button", { name: orders.manage.replace("{count}", "1"), exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: new RegExp("Фасад") }).click();
  await dialog.getByLabel(orders.confirmCheck, { exact: true }).check();
  await dialog.getByRole("button", { name: orders.confirm, exact: true }).click();
  await expect(dialog.getByText(orders.status.confirmed, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: f.movements.close, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-order-group]")).toHaveCount(2);
  await expect(page.locator("[data-project-payment]")).toHaveCount(5);
  await expect(summary).toContainText(/9[\s\u00a0]?500/);
  expect(canonicalCount()).toBe("5");
  expect(await (await page.request.get(pdfHref ?? "")).body()).toEqual(pdfBytes);
  const groups = page.locator("[data-order-group]");
  await expect(groups.nth(0)).toHaveAttribute("aria-label", "Інтер’єр");
  await expect(groups.nth(1)).toHaveAttribute("aria-label", facadeName);

  // The other income streams remain available through the compact selector and legacy URL.
  await page.getByRole("combobox", { name: orders.category, exact: true }).click();
  await page.getByRole("option", { name: f.project.streams.supervision, exact: true }).click();
  await expect(page).toHaveURL(/stream=supervision/);
  await expect(page.getByRole("heading", { name: "Окремий авторський нагляд", exact: true })).toBeVisible();
  await page.goto(projectHref);
  const first = page.locator("[data-project-payment]").filter({ has: page.getByRole("heading", { name: "Аванс інтер’єру", exact: true }) });
  await first.getByRole("button", { name: f.planning.recordPayment, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(f.settlement.received, { exact: true })).toBeFocused();
  await expect(dialog.getByRole("button", { name: f.settlement.changeAllocation, exact: true })).toHaveCount(0);
  await dialog.getByLabel(f.settlement.received, { exact: true }).fill("6500");
  await dialog.getByRole("button", { name: f.settlement.addNote, exact: true }).click();
  await dialog.getByLabel(f.movements.description, { exact: true }).fill("Оплата інтер’єру з надлишком");
  // The preview shows only this order's automatic candidates.
  await expect(dialog.getByRole("status")).toContainText("Етап 2 інтер’єру");
  await expect(dialog.getByRole("status")).toContainText("Фінальний платіж інтер’єру");
  await expect(dialog.getByText("Аванс фасаду", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: f.movements.record, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const allocated = (orderSql: string) => Number(sql(`select coalesce(sum(a.amount),0) from public.finance_allocations a join public.finance_project_items i
    on i.studio_id=a.studio_id and i.expected_item_id=a.expected_item_id where a.studio_id=${studio} and i.order_id=${orderSql}`));
  const interiorId = z.uuid().parse(sql(`select id from public.finance_project_orders where studio_id=${studio} and project_id=${project} and is_default`));
  expect(allocated(`'${interiorId}'`)).toBe(6000);
  expect(allocated(`'${facadeId}'`)).toBe(0);
  expect(Number(sql(`select unapplied_amount from public.finance_payment_availability where studio_id=${studio} and description='Оплата інтер’єру з надлишком'`))).toBe(500);

  // Cross-order use of excess cash requires an explicit compatible target choice.
  await page.getByRole("button", { name: workspace.reviewCash, exact: true }).or(page.getByRole("button", { name: workspace.cashActions, exact: true })).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("listitem").filter({ hasText: "Оплата інтер’єру з надлишком" }).getByRole("button", { name: workspace.matchCash, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Фасад.*Аванс фасаду/ }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(facadeName);
  await dialog.getByLabel(f.planning.allocateAmount, { exact: true }).fill("500");
  await dialog.getByRole("button", { name: f.planning.match, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(allocated(`'${interiorId}'`)).toBe(6000);
  expect(allocated(`'${facadeId}'`)).toBe(500);
  expect(Number(sql(`select amount from public.finance_expected_items where studio_id=${studio} and description='Обміри будинку'`))).toBe(100);

  // A confirmed scope can retain a large native value while its schedule is deferred.
  const unscheduledName = "Додаткове замовлення без погодженого графіка оплат";
  sql(`select set_config('request.jwt.claim.sub','${admin.id}',false);
    do $$declare commercial_order uuid; begin
      commercial_order:=public.save_finance_project_order(${studio},gen_random_uuid(),${project},jsonb_build_object(
        'intent','create','name','${unscheduledName}','plan',jsonb_build_object('revision',0,'pricingMethod','fixed',
          'amount','9876543210.98','currency','EUR','vatRate',null,'priceBasis',null,'reason','Schedule later browser fixture',
          'allowUnscheduled',true,'known','[]'::jsonb,'items','[]'::jsonb)));
      perform public.save_finance_project_order(${studio},gen_random_uuid(),${project},jsonb_build_object(
        'intent','confirm','orderId',commercial_order,'version',1));
    end $$;`);
  const largeOrderId = z.uuid().parse(sql(`select id from public.finance_project_orders where studio_id=${studio} and project_id=${project} and name='${unscheduledName}'`));
  const largeGroup = page.locator(`[data-order-group="${largeOrderId}"]`);

  // One bounded responsive inspection covers long identity, large money, partial and empty schedules.
  for (const [label, width, height] of [["desktop", 1440, 1000], ["notebook", 1024, 900], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(projectHref);
    await expect(page.locator("[data-order-group]")).toHaveCount(3);
    await expect(largeGroup).toContainText(orders.noSchedule);
    await expect(largeGroup).toContainText(/9[\s\u00a0]?876[\s\u00a0]?543[\s\u00a0]?210/);
    await expect(largeGroup.getByRole("button", { name: orders.configure, exact: true })).toBeVisible();
    await expect(summary).toContainText(/9[\s\u00a0]?876[\s\u00a0]?552[\s\u00a0]?710/);
    await expect(summary.getByRole("link", { name: /Аванс фасаду/ })).toBeVisible();
    expect(await summary.locator("dd").evaluateAll(values => values.every(value => value.scrollWidth <= value.clientWidth))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const financeRoot = page.locator("[data-project-finance]");
    const captureHeight = await financeRoot.evaluate(element => Math.ceil(element.scrollHeight + element.getBoundingClientRect().top + 24));
    await page.setViewportSize({ width, height: Math.max(height, captureHeight) });
    await financeRoot.screenshot({ path: testInfo.outputPath(`orders-${label}.png`) });
    await page.setViewportSize({ width, height });
  }
  await groups.nth(1).getByRole("button", { name: orders.details, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: facadeName, exact: true })).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath("order-manager-confirmed-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(groups.nth(1).getByRole("button", { name: orders.details, exact: true })).toBeFocused();

  // Publish >50 sequenced rows after the screenshot batch. Reversed dates detect date-first sorting.
  sql(`select set_config('request.jwt.claim.sub','${admin.id}',false);
    select public.save_finance_project_plan(${studio},'${randomUUID()}',${project},jsonb_build_object(
      'orderId','${largeOrderId}','revision',1,'pricingMethod','fixed','amount','9876543210.98','currency','EUR',
      'vatRate',null,'priceBasis',null,'reason','Pagination browser fixture','allowUnscheduled',true,'known','[]'::jsonb,
      'items',(select jsonb_agg(jsonb_build_object('id','','name','Графік великого замовлення · '||lpad(n::text,2,'0'),
        'amount','1','dueDate',(now() at time zone 'Europe/Kyiv')::date+55-n,
        'expectedDate',(now() at time zone 'Europe/Kyiv')::date+55-n) order by n) from generate_series(1,55)n)));`);
  const scheduleNames = Array.from({ length: 55 }, (_, index) => `Графік великого замовлення · ${String(index + 1).padStart(2, "0")}`);
  await page.goto(projectHref);
  await expect(page.locator("[data-project-payment]")).toHaveCount(50);
  await expect(page.locator("[data-project-payment]").getByRole("heading")).toHaveText([
    "Аванс інтер’єру", "Етап 2 інтер’єру", "Фінальний платіж інтер’єру", "Аванс фасаду", "Фінальний платіж фасаду",
    ...scheduleNames.slice(0, 45),
  ]);
  await expect(largeGroup).toContainText(orders.payments.replace("{count}", "55"));
  const pagination = page.getByRole("navigation", { name: f.movements.pages, exact: true });
  await pagination.getByRole("link", { name: f.movements.next, exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator("[data-project-payment]")).toHaveCount(10);
  await expect(page.locator("[data-project-payment]").getByRole("heading")).toHaveText(scheduleNames.slice(45));
  await expect(page.locator("[data-order-group]")).toHaveCount(1);
  await expect(largeGroup).toContainText(orders.payments.replace("{count}", "55"));
  await pagination.getByRole("link", { name: f.movements.previous, exact: true }).click();
  await expect(page.locator("[data-project-payment]")).toHaveCount(50);
  await expect(page.getByRole("heading", { name: scheduleNames[54], exact: true })).toHaveCount(0);

  const offPageId = z.uuid().parse(sql(`select id from public.finance_project_plan_items where studio_id=${studio} and order_id='${largeOrderId}' and description='${scheduleNames[54]}'`));
  await page.goto(`${projectHref}&stream=design&page=1&item=${offPageId}#expected-${offPageId}`);
  const selectedPayment = page.locator(`#expected-${offPageId}`);
  await expect(selectedPayment).toBeVisible();
  await expect(selectedPayment).toBeFocused();
  await expect(selectedPayment).toHaveAttribute("data-selected", "true");
  await expect(largeGroup.locator("[data-selected]")).toHaveCount(1);
  await expect(selectedPayment.getByRole("heading", { name: scheduleNames[54], exact: true })).toBeVisible();
  await expect(page.locator("[data-project-payment]")).toHaveCount(51);
  expect(pageErrors).toEqual([]);
});

test("compact order surfaces preserve inline rename keyboard and blur focus", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const f = uk.Finance, orders = f.orders;
  const polishId = randomUUID(), polishProject = `'${polishId}'`;
  const originalName = orders.defaultName;
  sql(`select set_config('request.jwt.claim.sub','${admin.id}',false);
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status,country_code)
      values(${polishProject},${studio},'337 Перевірка інтерфейсу замовлень',120,(now() at time zone 'Europe/Kyiv')::date,'${admin.id}','active','UA');
    select public.save_finance_project_plan(${studio},gen_random_uuid(),${polishProject},jsonb_build_object(
      'revision',0,'pricingMethod','fixed','amount','6000','currency','EUR','vatRate',null,'priceBasis',null,'reason','Signed agreement',
      'known','[]'::jsonb,'items',jsonb_build_array(
        jsonb_build_object('id','','name','Аванс','amount','1800','dueDate',(now() at time zone 'Europe/Kyiv')::date),
        jsonb_build_object('id','','name','Етап 2','amount','3000'),jsonb_build_object('id','','name','Етап 3','amount','1200'))));
    do $$declare facade uuid; begin
      facade:=public.save_finance_project_order(${studio},gen_random_uuid(),${polishProject},jsonb_build_object(
        'intent','create','name','Фасад','plan',jsonb_build_object('revision',0,'pricingMethod','fixed','amount','3500','currency','EUR',
          'vatRate',null,'priceBasis',null,'reason','Facade agreement','known','[]'::jsonb,'items',jsonb_build_array(
            jsonb_build_object('draftKey',gen_random_uuid(),'name','Аванс фасаду','amount','1750'),
            jsonb_build_object('draftKey',gen_random_uuid(),'name','Фінальний платіж','amount','1750')))));
      perform public.save_finance_project_order(${studio},gen_random_uuid(),${polishProject},jsonb_build_object('intent','confirm','orderId',facade,'version',1));
      perform public.save_finance_project_order(${studio},gen_random_uuid(),${polishProject},'{"intent":"create","name":"Ландшафт"}');
    end $$;`);
  const history = () => sql(`select jsonb_build_object(
    'terms',(select jsonb_agg(to_jsonb(t) order by t.id) from public.finance_project_terms t where project_id=${polishProject}),
    'plans',(select jsonb_agg(to_jsonb(p) order by p.terms_id) from public.finance_project_plan_revisions p where project_id=${polishProject}),
    'items',(select jsonb_agg(to_jsonb(e) order by e.id) from public.finance_expected_items e join public.finance_project_items i on i.expected_item_id=e.id where i.project_id=${polishProject}))`);
  const originalHistory = history();
  const version = () => sql(`select version from public.finance_project_orders where project_id=${polishProject} and is_default`);
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill(admin.email);
  await page.locator('input[type="password"]').fill(admin.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: new URL(page.url()).origin }]);
  await page.goto(`/projects/${polishId}?view=finance`);
  await page.getByRole("combobox", { name: f.displayCurrency, exact: true }).click();
  await page.getByRole("option", { name: "EUR", exact: true }).click();
  const summary = page.getByRole("region", { name: orders.scope, exact: true });
  await expect(summary).toContainText(/9[\s\u00a0]?500/);

  for (const [label, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await expect(summary.getByText(orders.scope, { exact: true })).toHaveCount(0);
    await expect(summary.getByRole("link", { name: /Аванс/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await summary.getByText(orders.value, { exact: true }).click();
    await summary.screenshot({ path: testInfo.outputPath(`summary-${label}.png`), style: "nextjs-portal { visibility: hidden; }" });
    const manage = summary.getByRole("button", { name: orders.manage.replace("{count}", "2"), exact: true });
    await manage.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("header").getByRole("button", { name: orders.add, exact: true })).toBeVisible();
    await expect(dialog.getByText(orders.status.draft, { exact: false })).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.screenshot({ path: testInfo.outputPath(`orders-list-${label}.png`), style: "nextjs-portal { visibility: hidden; }" });
    const row = dialog.getByRole("button").filter({ has: page.getByText(originalName, { exact: true }) });
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("heading", { name: originalName, exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: orders.rename, exact: true })).toHaveCount(0);
    const edit = dialog.getByRole("button", { name: orders.editName, exact: true });
    const input = dialog.getByRole("textbox", { name: orders.name, exact: true });
    await edit.focus();
    await page.keyboard.press("Enter");
    await expect(input).toBeFocused();
    await input.fill("Основне замовлення · уточнена назва");
    await input.press("Enter");
    await expect(dialog.getByRole("heading", { name: "Основне замовлення · уточнена назва", exact: true })).toBeVisible();
    await expect(edit).toBeFocused();
    const savedVersion = version();
    await edit.press("Enter");
    await input.fill("Скасована назва");
    await input.press("Escape");
    await expect(dialog).toHaveCount(1);
    await expect(input).toHaveCount(0);
    await expect(edit).toBeFocused();
    expect(version()).toBe(savedVersion);
    await edit.press("Enter");
    await input.fill(originalName);
    await input.press("Tab");
    await expect(dialog.getByRole("heading", { name: originalName, exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: f.movements.close, exact: true })).toBeFocused();
    await edit.click();
    await input.fill(" ");
    await input.press("Tab");
    await expect(dialog.getByRole("alert")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(edit).toBeFocused();
    await expect(dialog.getByRole("heading", { name: originalName, exact: true })).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByText(orders.status.confirmed, { exact: true }).click();
    await dialog.screenshot({ path: testInfo.outputPath(`order-detail-${label}.png`), style: "nextjs-portal { visibility: hidden; }" });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(manage).toBeFocused();
  }
  expect(history()).toBe(originalHistory);
  expect(pageErrors).toEqual([]);
});
