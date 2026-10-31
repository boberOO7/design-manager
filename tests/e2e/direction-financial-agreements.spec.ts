import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";
import { signInLocalTestUser } from "../helpers/auth";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local Supabase required");
const service = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studio = randomUUID(), project = randomUUID();
const actor = { id: "", email: `direction-terms-${randomUUID()}@example.test`, password: `Terms-${randomUUID()}` };
const sql = (statement: string) => execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
let interior = "", facade = "";

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studio, name: "Direction finance browser fixture" }).throwOnError();
  const result = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
  if (result.error) throw result.error;
  actor.id = result.data.user.id;
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Finance admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studio, user_id: actor.id, system_role: "admin" }).throwOnError();
  sql(`select set_config('request.jwt.claim.sub','${actor.id}',false);
    insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','UAH',current_date,'${actor.id}');
    insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values('${studio}','UAH account','UAH',0,'${actor.id}');
    select public.finalize_finance_setup('${studio}');
    select public.save_studio_contact_details('${studio}','https://space.example','agreements@space.example','','','Фінансові умови');
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status,country_code,client_name) values('${project}','${studio}','336 Напрями · фінансові умови',120,current_date,'${actor.id}','active','UA','Client');
    select public.save_project_work_direction('${project}','{"intent":"save","kind":"facade","name":"Фасад","areaM2":300,"coefficient":0.3}',(select stage_configuration_version from public.projects where id='${project}'));`);
  interior = sql(`select id from public.project_work_directions where project_id='${project}' and is_default`);
  facade = sql(`select id from public.project_work_directions where project_id='${project}' and not is_default`);
});

test.afterAll(async () => {
  // Only this isolated fixture tenant is removed, including its immutable test history.
  sql(`begin; set local session_replication_role=replica;
    do $$ declare r record; begin
      for r in select distinct c.table_schema,c.table_name from information_schema.columns c join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
        where c.table_schema in ('public','private') and c.column_name='project_id' and p.relkind='r' loop
        execute format('delete from %I.%I where project_id=%L',r.table_schema,r.table_name,'${project}');
      end loop;
      for r in select distinct c.table_schema,c.table_name from information_schema.columns c join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
        where c.table_schema in ('public','private') and c.column_name='studio_id' and p.relkind='r' loop
        execute format('delete from %I.%I where studio_id=%L',r.table_schema,r.table_name,'${studio}');
      end loop;
    end $$;
    delete from public.projects where id='${project}'; delete from public.studios where id='${studio}'; commit;`);
  if (actor.id) await service.auth.admin.deleteUser(actor.id);
});

test("direction terms create, settle and share without changing consolidated money", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const f = uk.Finance;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: String(testInfo.project.use.baseURL) }]);
  await signInLocalTestUser(page, actor);
  const href = (direction: string) => `/projects/${project}?view=finance&workDirection=${direction}`;
  await page.goto(href(facade));
  const workspace = page.locator("[data-project-finance]");
  await workspace.getByRole("combobox", { name: f.displayCurrency, exact: true }).click();
  await page.getByRole("option", { name: "UAH", exact: true }).click();
  await workspace.getByRole("button", { name: f.agreements.create, exact: true }).click();
  let editor = page.getByRole("dialog", { name: f.agreements.create, exact: true });
  await expect(editor.getByLabel(f.builder.area, { exact: true })).toHaveValue("300");
  expect(sql(`select count(*) from public.finance_project_orders where project_id='${project}'`)).toBe("0");
  const setPrice = async (dialog: Locator, amount: string) => {
    await dialog.getByRole("button", { name: f.builder.fixedShort, exact: true }).click();
    await dialog.getByLabel(f.project.contract, { exact: true }).fill(amount);
    await dialog.getByRole("combobox", { name: f.project.currency, exact: true }).click();
    await page.getByRole("option", { name: "UAH", exact: true }).click();
  };
  await setPrice(editor, "1000");
  await editor.getByRole("button", { name: f.agreements.confirm, exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(workspace.locator("[data-project-payment]")).toHaveCount(2);
  expect(sql(`select status from public.finance_project_orders where project_id='${project}'`)).toBe("confirmed");

  await workspace.locator("[data-project-payment]").first().getByRole("button", { name: f.planning.recordPayment, exact: true }).click();
  const payment = page.getByRole("dialog", { name: f.planning.recordPayment, exact: true });
  await payment.getByLabel(f.settlement.received, { exact: true }).fill("100");
  await payment.getByRole("button", { name: f.movements.record, exact: true }).click();
  await expect(payment).toHaveCount(0);
  await expect(workspace.locator("[data-project-payment]").first()).toContainText(f.planning.states.partial);
  await expect.poll(() => sql(`select collected_amount from public.finance_project_totals where project_id='${project}' and stream='design'`)).toBe("100.00");

  await workspace.locator("[data-order-group]").first().getByRole("button", { name: f.orders.details, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: f.project.editAgreement, exact: true }).click();
  editor = page.getByRole("dialog");
  await editor.getByRole("button", { name: f.builder.perAreaShort, exact: true }).click();
  await expect(editor.getByLabel(f.builder.area, { exact: true })).toHaveValue("300");
  await expect(editor.getByText(f.builder.areaChanged.replace("{saved}", "300").replace("{current}", "120"))).toHaveCount(0);
  await editor.getByRole("button", { name: f.builder.fixedShort, exact: true }).click();
  await editor.getByLabel(f.project.contract, { exact: true }).fill("1200");
  await editor.getByRole("button", { name: "100%", exact: true }).click();
  await editor.getByLabel(f.project.reason, { exact: true }).fill("Клієнт погодив розширення обсягу");
  await editor.getByRole("button", { name: f.builder.saveRevision, exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: f.project.editAgreement, exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: f.movements.close, exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(sql(`select count(*) from public.finance_project_terms where project_id='${project}'`)).toBe("2");

  await workspace.getByRole("button", { name: f.orders.add, exact: true }).click();
  editor = page.getByRole("dialog", { name: f.agreements.create, exact: true });
  await setPrice(editor, "200");
  await editor.getByRole("button", { name: f.agreements.confirm, exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(workspace.locator("[data-order-group]")).toHaveCount(2);
  expect(sql(`select contract_gross_amount from public.finance_project_totals where project_id='${project}' and stream='design'`)).toBe("1400.00");

  // Link the first agreement to a second direction through the real UI.
  await page.goto(href(interior));
  await workspace.getByRole("button", { name: f.directionWorkspace.attach, exact: true }).click();
  const attaching = page.getByRole("dialog", { name: f.directionWorkspace.attach, exact: true });
  await attaching.getByRole("button", { name: "Фасад", exact: true }).click();
  await expect(attaching).toHaveCount(0);
  await expect(workspace).toContainText(f.agreements.notAllocated);
  await expect(workspace.locator("[data-order-group]")).toHaveCount(1);
  expect(sql(`select contract_gross_amount||':'||collected_amount from public.finance_project_totals where project_id='${project}' and stream='design'`)).toBe("1400.00:100.00");

  await page.goto(href(facade));
  await workspace.getByRole("button", { name: f.orders.add, exact: true }).click();
  editor = page.getByRole("dialog", { name: f.agreements.create, exact: true });
  await setPrice(editor, "50");
  await editor.getByLabel(f.agreements.optionalName, { exact: true }).fill("Ескіз · чернетка");
  await editor.getByRole("button", { name: f.orders.saveDraft, exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(workspace.getByRole("button", { name: f.agreements.draftsArchive, exact: true })).toBeVisible();
  expect(sql(`select count(*) from public.finance_project_items where project_id='${project}' and stream='design'`)).toBe("4");
  expect(sql(`select contract_gross_amount||':'||collected_amount from public.finance_project_totals where project_id='${project}' and stream='design'`)).toBe("1400.00:100.00");
  await workspace.getByRole("button", { name: f.agreements.draftsArchive, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Ескіз · чернетка/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: f.proposal.action, exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(f.proposal.orderDraft);
  await page.getByRole("dialog").getByRole("button", { name: f.proposal.close, exact: true }).last().click();
  await page.getByRole("dialog").getByRole("button", { name: f.movements.close, exact: true }).click();

  await page.goto(href("all"));
  await expect(page.locator("[data-project-finance-overview]")).toHaveCount(0);
  await expect(workspace.locator("[data-order-group]")).toHaveCount(2);
  await expect(workspace.getByRole("button", { name: f.orders.manage.replace("{count}", "2"), exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: f.agreements.cashAndObligations, exact: true })).toHaveCount(0);
  await expect(workspace.locator("#expected-attention")).toContainText("4 платежі без зазначеної дати");
  await expect(workspace.locator("#expected-attention svg")).not.toHaveClass(/text-\[var\(--ui-danger-text\)\]/);
  await workspace.getByRole("button", { name: f.projectWorkspace.cashActions, exact: true }).click();
  const receivedFunds = page.getByRole("dialog", { name: f.projectWorkspace.cashActions, exact: true });
  await expect(receivedFunds).toContainText(/100,00\s*UAH/);
  await expect(receivedFunds.getByText(f.projectWorkspace.cashDistinction, { exact: true })).toHaveCount(0);
  await receivedFunds.getByRole("button", { name: f.projectWorkspace.assignCash, exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(f.projectWorkspace.cashDistinction);
  await page.getByRole("dialog").getByRole("button", { name: f.projectWorkspace.close, exact: true }).click();
  await page.screenshot({ path: "/tmp/studioflow-project-finance-agreements.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(href(facade));
  await expect(workspace.locator("[data-order-group]")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/studioflow-direction-finance-agreements-mobile.png", fullPage: true, animations: "disabled" });
  await workspace.getByRole("navigation", { name: f.projectWorkspace.navigation, exact: true }).getByRole("link", { name: f.projectWorkspace.tabs.expenses, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`workDirection=${facade}`));
  await workspace.getByRole("link", { name: f.agreements.projectExpenses, exact: true }).click();
  await expect(page).toHaveURL(/workDirection=all/);
  await expect(workspace).not.toHaveAttribute("data-direction-finance");
  await workspace.getByRole("navigation", { name: f.projectWorkspace.navigation, exact: true }).getByRole("link", { name: f.projectWorkspace.tabs.result, exact: true }).click();
  await expect(page.locator("#project-result")).toBeVisible();
  await page.getByRole("navigation", { name: f.projectResult.periodLabel, exact: true }).getByRole("link", { name: f.projectResult.period.month, exact: true }).click();
  await expect(page).toHaveURL(/workDirection=all/);
  await expect(page).toHaveURL(/profitPeriod=month/);
  expect(errors).toEqual([]);
});
