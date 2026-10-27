import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import uk from "../../messages/uk.json";
import { formatDateOnly } from "../../src/lib/utils";
import { signInLocalTestUser } from "../helpers/auth";

const env = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(env.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local month fixtures only");
const service = createClient<Database>(env.EQUIPMENT_TEST_SUPABASE_URL, env.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false } });
const studioId = randomUUID(), projectId = randomUUID(), scheduleId = randomUUID(), termId = randomUUID();
const actor = { id: "", email: `month-${randomUUID()}@example.test`, password: `Month-${randomUUID()}` };
let today = "", month = "", previous = "", itemId = "";
const m = uk.Finance.management, close = m.monthClose, expenses = uk.Finance.expenses, labor = uk.Finance.labor.auto;
function sql(input: string) {
  return execFileSync("psql", ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-Atq"], {
    input, encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres" },
  }).trim();
}

test.beforeAll(async () => {
  const user = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true, user_metadata: { finance_display_currency: "UAH" } });
  if (user.error) throw user.error; actor.id = user.data.user.id;
  await service.from("studios").insert({ id: studioId, name: "Month reporting browser fixture" }).throwOnError();
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Month admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studioId, user_id: actor.id, system_role: "admin" }).throwOnError();
  today = sql("select (now() at time zone 'Europe/Kyiv')::date"); month = `${today.slice(0, 7)}-01`;
  previous = sql(`select (date '${month}'-interval '1 month')::date`);
  sql(`begin;
    insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studioId}','UAH','${previous}','${actor.id}');
    insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values('${studioId}','Bank','UAH',0,'${actor.id}');
    select set_config('request.jwt.claim.sub','${actor.id}',true);
    select public.finalize_finance_setup('${studioId}');
    -- Test-only historical boundary, confined to this random fixture tenant.
    update public.finance_settings set recognition_start_month='${previous}' where studio_id='${studioId}';
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values('${projectId}','${studioId}','Internal month work',0,'${previous}','${actor.id}','active');
    select public.save_finance_expected_item('${studioId}',gen_random_uuid(),jsonb_build_object('direction','outgoing','amount','120','currency','UAH',
      'categoryId',(select id from public.finance_categories where studio_id='${studioId}' and default_key='other_expense'),'description','Delivered month supplies',
      'commitment','agreed','certainty','fixed','established',true));
    commit;`);
  itemId = sql(`select id from public.finance_expected_items where studio_id='${studioId}' and description='Delivered month supplies'`);
});

test.afterAll(async () => {
  sql(`begin;set local session_replication_role=replica;
    do $$declare item record;begin
      for item in select table_schema,table_name from information_schema.columns where column_name='studio_id' and table_schema in ('public','private')
        and table_name in(select tablename from pg_tables where schemaname in ('public','private')) loop
        execute format('delete from %I.%I where studio_id=$1',item.table_schema,item.table_name) using '${studioId}'::uuid;
      end loop;
    end$$;
    delete from public.studios where id='${studioId}';commit;`);
  if (actor.id) { const deleted = await service.auth.admin.deleteUser(actor.id); if (deleted.error) throw deleted.error; }
});

test("monthly reports, one completeness approval, late exceptions, and Phase 2/3 setup smoke", async ({ page }) => {
  test.setTimeout(150_000);
  const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: baseURL }]);
  await signInLocalTestUser(page, actor);
  await page.goto(`/finance/reports?from=${previous}&to=${month}`);
  await expect(page.getByRole("heading", { name: m.title, exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: m.provisionalAmount, exact: true })).toBeVisible();
  const closing = page.getByTestId("month-closing");
  const closedMonth = closing.getByTestId("management-month-status").first();
  await expect(closedMonth.getByTestId("month-status")).toHaveText(close.status.provisional);
  await closedMonth.getByRole("button", { name: close.details, exact: true }).click();
  await closedMonth.getByRole("checkbox", { name: close.approval, exact: true }).check();
  await closedMonth.getByRole("button", { name: close.confirm, exact: true }).click();
  await expect(closedMonth.getByTestId("month-status")).toHaveText(close.status.confirmed);
  expect(sql(`select count(*) from public.finance_month_confirmations where studio_id='${studioId}'`)).toBe("1");
  await page.screenshot({ path: "test-results/management-month-confirmed.png", fullPage: false });
  const authenticated = createClient<Database>(env.EQUIPMENT_TEST_SUPABASE_URL, z.string().parse(process.env.EQUIPMENT_TEST_PUBLISHABLE_KEY), { auth: { persistSession: false } });
  await authenticated.auth.signInWithPassword(actor).then(result => { if (result.error) throw result.error; });
  const prior = z.object({ requestId: z.uuid(), input: z.record(z.string(), z.string().or(z.number())) }).parse(JSON.parse(sql(`select jsonb_build_object('requestId',request_id,'input',payload->'input') from public.finance_planning_requests where studio_id='${studioId}' and payload->>'operation'='confirm_month'`)));
  const retries = await Promise.all([1, 2].map(() => authenticated.rpc("confirm_finance_month", { p_studio_id: studioId, p_request_id: prior.requestId, p_input: prior.input }).throwOnError()));
  expect(retries[0].data).toBe(retries[1].data);
  expect(sql(`select count(*) from public.finance_month_confirmations where studio_id='${studioId}'`)).toBe("1");

  // Labor setup reuses the studio schedule without a mandatory internal project.
  const laborForm = page.locator('form').filter({ has: page.locator('input[name="intent"][value="configure"]') });
  await laborForm.getByRole("button", { name: labor.previewImpact, exact: true }).click();
  await laborForm.getByRole("button", { name: labor.activate, exact: true }).click();
  await expect.poll(() => sql(`select count(*) from public.finance_labor_automation where studio_id='${studioId}'`)).toBe("1");

  // Add a fixture recurring source; its standard schedule edit derives coverage without a second setup flow.
  sql(`begin;
    insert into public.finance_schedules(id,studio_id,kind,created_by) values('${scheduleId}','${studioId}','recurring','${actor.id}');
    insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,reason,created_by)
      values('${termId}','${studioId}','${scheduleId}',1,'Monthly browser service',100,'UAH',(select id from public.finance_categories where studio_id='${studioId}' and default_key='other_expense'),1,1,0,'${month}','agreed','fixed','Fixture service','${actor.id}');
    select private.reconcile_finance_schedule_occurrences('${studioId}','${scheduleId}','${month}','${month}','${actor.id}');commit;`);
  await page.goto("/finance/schedules#expense-automation");
  const recurring = page.locator("article").filter({ has: page.getByRole("heading", { name: "Monthly browser service", exact: true }) });
  await recurring.getByRole("button", { name: uk.Finance.schedules.changeTerms, exact: true }).click();
  const paymentEditor = page.getByRole("dialog");
  await expect(paymentEditor.locator("[name=servicePolicy], [name=serviceStart], [name=serviceProjectId]")).toHaveCount(0);
  await paymentEditor.getByRole("button", { name: uk.Finance.schedules.changeTerms, exact: true }).click();
  await expect(paymentEditor).toHaveCount(0);
  await expect.poll(() => sql(`select count(*) from public.finance_expense_service_policies where studio_id='${studioId}'`)).toBe("1");

  // An unrelated operating service does not reopen payroll-source review.
  await page.goto("/finance/reports");
  const capacity = page.locator('form').filter({ has: page.locator('input[name="intent"][value="configure"]') });
  await expect(capacity.locator('select').filter({ has: page.locator('option[value="separate"]') })).toHaveCount(0);
  await expect.poll(() => sql(`select (private.finance_labor_source_review('${studioId}')->>'reviewed')::boolean`)).toBe("t");

  // Phase 3 receipt confirmation goes through its original Expected workspace.
  await page.goto(`/finance/expected?item=${itemId}`);
  await page.getByRole("button", { name: expenses.receiptTitle, exact: true }).click();
  const receipt = page.locator('form').filter({ has: page.locator(`input[name="sourceId"][value="${itemId}"]`) });
  await receipt.getByRole("combobox").first().click();
  await page.getByRole("button", { name: "Сьогодні", exact: true }).click();
  await receipt.getByRole("checkbox", { name: expenses.receiptConfirmation, exact: true }).check();
  await receipt.getByRole("button", { name: expenses.confirmReceived, exact: true }).click();
  await expect(page.getByText(expenses.receiptRecorded.replace("{date}", formatDateOnly(today, "uk")))).toBeVisible();
  expect(sql(`select count(*) from public.finance_recognition_entries where studio_id='${studioId}' and expected_item_id='${itemId}'`)).toBe("1");

  // An explicit late correction retains the confirmed snapshot and shows its source.
  sql(`begin;select set_config('request.jwt.claim.sub','${actor.id}',true);
    select public.save_finance_expected_item('${studioId}',gen_random_uuid(),jsonb_build_object('direction','outgoing','amount','10','currency','USD',
      'categoryId',(select id from public.finance_categories where studio_id='${studioId}' and default_key='other_expense'),'description','Late unvalued service','commitment','agreed','certainty','fixed','established',true));
    select public.confirm_finance_expense_receipt('${studioId}',gen_random_uuid(),'expected',(select id from public.finance_expected_items where studio_id='${studioId}' and description='Late unvalued service'),jsonb_build_object('date','${previous}','version','1','confirmed',true,'approveReviewed',true));commit;`);
  await page.goto(`/finance/reports?from=${previous}&to=${month}`);
  const changedMonth = page.getByTestId("month-closing").getByTestId("management-month-status").first();
  await expect(changedMonth.getByTestId("month-status")).toHaveText(close.status.needs_review);
  await changedMonth.getByRole("button", { name: close.details, exact: true }).click();
  await expect(changedMonth).toContainText("Late unvalued service");
  await expect(changedMonth.getByRole("button", { name: close.confirm, exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/management-month-incomplete.png", fullPage: false });
});
