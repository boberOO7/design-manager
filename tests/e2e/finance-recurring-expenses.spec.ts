import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import uk from "../../messages/uk.json";
import { signInLocalTestUser } from "../helpers/auth";

const env = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(env.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local recurring fixtures only");
const service = createClient<Database>(env.EQUIPMENT_TEST_SUPABASE_URL, env.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false } });
const studioId = randomUUID();
const actor = { id: "", email: `recurring-${randomUUID()}@example.test`, password: `Recurring-${randomUUID()}` };
let month = "", monthlyId = "", annualId = "", legacyId = "";
const payrollId = randomUUID();
function sql(input: string) {
  return execFileSync("psql", ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-Atq"], {
    input, encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres", PGCONNECT_TIMEOUT: "3" },
  }).trim();
}

test.beforeAll(async () => {
  const user = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
  if (user.error) throw user.error;
  actor.id = user.data.user.id;
  await service.from("studios").insert({ id: studioId, name: "Recurring source browser fixture" }).throwOnError();
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Recurring admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studioId, user_id: actor.id, system_role: "admin" }).throwOnError();
  month = sql("select (date_trunc('month',now() at time zone 'Europe/Kyiv'))::date");
  sql(`begin;
    insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studioId}','UAH',current_date,'${actor.id}');
    insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values('${studioId}','Bank','UAH',0,'${actor.id}');
    select set_config('request.jwt.claim.sub','${actor.id}',true);
    select public.finalize_finance_setup('${studioId}');
    commit;`);
  for (const [name, intervalMonths] of [["Browser SMM", 1], ["Browser annual service", 12], ["Browser salary-coded supplier", 1]] as const) {
    const requestId = randomUUID();
    sql(`select set_config('request.jwt.claim.sub','${actor.id}',false);
      select public.save_finance_recurring_schedule('${studioId}','${requestId}',jsonb_build_object('kind','recurring','name','${name}','amount','1000','currency','UAH',
        'categoryId',(select id from finance_categories where studio_id='${studioId}' and default_key='${name === "Browser salary-coded supplier" ? "salary" : name === "Browser SMM" ? "smm" : "software"}'),'intervalMonths',${intervalMonths},'payoutDay',5,'paymentMonthOffset',1,
        'effectiveFrom','${month}','commitment','agreed','certainty','fixed','reason','Browser source fixture','revision',0));`);
    if (name === "Browser SMM") monthlyId = sql(`select result_id from finance_planning_requests where studio_id='${studioId}' and request_id='${requestId}'`);
    if (name === "Browser annual service") annualId = sql(`select result_id from finance_planning_requests where studio_id='${studioId}' and request_id='${requestId}'`);
  }
  // Native accrual checks need no accounting activation or pgTAP installation.
  for (const [scheduleId, months] of [[monthlyId, 1], [annualId, 12]] as const) {
    expect(sql(`select sum((c->>'amount')::numeric)=trunc(1000::numeric*((now() at time zone 'Europe/Kyiv')::date-'${month}'::date+1)
      /(('${month}'::date+make_interval(months=>${months}))::date-'${month}'::date),2)
      from private.finance_expense_service_calculations('${studioId}',true) c where c->'policy'->>'schedule_id'='${scheduleId}'
      and (c->>'month')::date='${month}' and c->>'issue' is null`)).toBe("t");
  }
  sql(`begin;
    select set_config('request.jwt.claim.sub','${actor.id}',true);
    update finance_settings set recognition_start_month='${month}' where studio_id='${studioId}';
    do $$declare c jsonb;before_rows jsonb;begin
      for c in select candidate from private.finance_expense_service_candidates('${studioId}') candidate where candidate->>'issue' is null loop
        perform public.process_finance_automatic_expense('${studioId}',(c->>'sourceId')::uuid,(c->>'month')::date,c->>'digest');
        perform public.process_finance_automatic_expense('${studioId}',(c->>'sourceId')::uuid,(c->>'month')::date,c->>'digest');
      end loop;
      if not exists(select 1 from finance_recognition_entries where studio_id='${studioId}' and expense_policy_id is not null) then raise exception 'missing_accrual';end if;
      select jsonb_agg(to_jsonb(r) order by r.id) into before_rows from finance_recognition_entries r where studio_id='${studioId}';
      perform public.prepare_finance_automatic_expenses('${studioId}');
      if exists(select 1 from private.finance_expense_service_candidates('${studioId}') pending where pending->>'issue' is null) then raise exception 'duplicate_accrual_candidate';end if;
      if before_rows is distinct from (select jsonb_agg(to_jsonb(r) order by r.id) from finance_recognition_entries r where studio_id='${studioId}') then raise exception 'recognition_history_changed';end if;
    end$$;
    rollback;`);
  sql(`select set_config('request.jwt.claim.sub','${actor.id}',false);
    select public.save_finance_recurring_schedule('${studioId}','${randomUUID()}',jsonb_build_object('kind','recurring','revision',0,'name','Browser legacy completion','amount','1000','currency','UAH',
      'categoryId',(select id from finance_categories where studio_id='${studioId}' and default_key='rent'),'intervalMonths',1,'payoutDay',1,'effectiveFrom','${month}',
      'commitment','agreed','certainty','fixed','reason','Legacy completion fixture','expenseService',jsonb_build_object('confirmed',true,'policy','period_end')));`);
  legacyId = sql(`select schedule_id from finance_schedule_terms where studio_id='${studioId}' and name='Browser legacy completion' and revision=1`);
  sql(`begin;
    insert into public.finance_categories(studio_id,name,direction,nature,project_expense_enabled) values('${studioId}','Browser external accounting','outgoing','operating',false);
    insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by) values('${payrollId}','${studioId}','payroll','${actor.id}','${actor.id}');
    insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
      values('${studioId}','${payrollId}',1,'Browser employee salary',1000,'UAH',(select id from public.finance_categories where studio_id='${studioId}' and default_key='salary'),1,5,1,'${month}','agreed','fixed','gross',1000,0,0,'fixed','Payroll source fixture','${actor.id}');
    commit;`);
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

test("ordinary recurring payments need no accrual interaction and protected category mistakes stay explicit", async ({ page }) => {
  const f = uk.Finance, e = f.expenses;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL! }]);
  await signInLocalTestUser(page, actor);
  await page.goto("/finance/schedules");
  const monthly = page.locator("article").filter({ has: page.getByRole("heading", { name: "Browser SMM", exact: true }) });
  expect(await monthly.evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(64);
  await monthly.getByRole("button", { name: f.schedules.changeTerms, exact: true }).focus();
  await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog");
  await expect(dialog.locator("[name=servicePolicy], [name=serviceStart], [name=serviceProjectId]")).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: e.sourceTreatment, exact: true })).not.toBeVisible();
  await dialog.getByRole("button", { name: f.planning.cancel, exact: true }).click();
  expect(sql(`select count(*)||':'||min(coverage_from)::text from public.finance_expense_service_policies where studio_id='${studioId}' and schedule_id='${monthlyId}'`)).toBe(`1:${month}`);
  const annual = page.locator("article").filter({ has: page.getByRole("heading", { name: "Browser annual service", exact: true }) });
  expect(await annual.evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(64);
  await annual.getByRole("button", { name: f.schedules.changeTerms, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.locator("[name=servicePolicy], [name=serviceStart], [name=serviceProjectId]")).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: e.sourceTreatment, exact: true })).not.toBeVisible();
  await dialog.getByRole("button", { name: f.planning.cancel, exact: true }).click();
  // Existing diagnostic links land in the payment editor, without a separate accrual dialog.
  await page.goto(`/finance/schedules?expense=${annualId}`);
  dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName(f.schedules.changeTerms);
  await expect(dialog.locator("[name=servicePolicy], [name=serviceStart], [name=serviceProjectId]")).toHaveCount(0);
  await dialog.getByRole("button", { name: f.planning.cancel, exact: true }).click();
  expect(sql(`select count(*)||':'||min(service_start)::text||':'||min(service_months)::text from finance_expense_service_policies where studio_id='${studioId}' and schedule_id='${annualId}'`)).toBe(`1:${month}:12`);
  sql(`select set_config('request.jwt.claim.sub','${actor.id}',false);
    select public.save_finance_recurring_schedule('${studioId}','${randomUUID()}',jsonb_build_object('kind','recurring','id','${annualId}','revision',1,
      'name','Browser annual service','amount','1200','currency','UAH','categoryId',(select id from finance_categories where studio_id='${studioId}' and default_key='software'),
      'intervalMonths',12,'payoutDay',1,'paymentMonthOffset',0,'effectiveFrom',('${month}'::date+interval '12 months')::date,
      'commitment','agreed','certainty','fixed','reason','Future renewal fixture'));`);
  expect(sql(`select count(*)||':'||min(service_start)::text from finance_expense_service_policies where studio_id='${studioId}' and schedule_id='${annualId}'`)).toBe(`1:${month}`);
  await page.goto("/finance/schedules");
  const supplier = page.locator("article").filter({ has: page.getByRole("heading", { name: "Browser salary-coded supplier", exact: true }) });
  const supplierId = sql(`select schedule_id from finance_schedule_terms where studio_id='${studioId}' and name='Browser salary-coded supplier' and revision=1`);
  // A confirmed original obligation must stay byte-for-byte unchanged by a future revision.
  sql(`update finance_expected_items set is_established=true where studio_id='${studioId}' and id in(
    select l.expected_item_id from finance_obligations o join finance_obligation_items l on l.obligation_id=o.id and l.studio_id=o.studio_id
    where o.schedule_id='${supplierId}' and o.period_start='${month}')`);
  const originalSnapshot = () => sql(`select jsonb_build_object('term',to_jsonb(t),'payments',(
    select jsonb_agg(jsonb_build_object('obligation',to_jsonb(o),'item',to_jsonb(i)) order by i.id)
    from finance_obligations o join finance_obligation_items l on l.obligation_id=o.id and l.studio_id=o.studio_id
    join finance_expected_items i on i.id=l.expected_item_id and i.studio_id=l.studio_id
    where o.schedule_id=t.schedule_id and o.period_start='${month}'))::text
    from finance_schedule_terms t where t.studio_id='${studioId}' and t.schedule_id='${supplierId}' and t.revision=1`);
  const original = originalSnapshot();
  sql(`do $$declare category uuid;begin
    select id into strict category from finance_categories where studio_id='${studioId}' and name='Browser external accounting';
    begin
      update finance_schedule_terms set category_id=category where studio_id='${studioId}' and schedule_id='${supplierId}' and revision=1;
      raise exception 'unexpected_allowed_correction';
    exception when others then if sqlerrm<>'finance_history_immutable' then raise;end if;end;
    begin
      update finance_expected_items set category_id=category where studio_id='${studioId}' and id in(
        select l.expected_item_id from finance_obligations o join finance_obligation_items l on l.obligation_id=o.id and l.studio_id=o.studio_id
        where o.schedule_id='${supplierId}' and o.period_start='${month}');
      raise exception 'unexpected_allowed_correction';
    exception when others then if sqlerrm<>'finance_obligation_locked' then raise;end if;end;
  end$$;`);
  expect(originalSnapshot()).toBe(original);
  await supplier.getByRole("button", { name: e.sourceStatus.payrollCategory, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText(f.schedules.revisionDateHelp, { exact: true })).toBeVisible();
  await dialog.getByRole("combobox", { name: f.movements.category, exact: true }).click();
  await page.getByRole("option", { name: "Browser external accounting", exact: true }).click();
  await dialog.getByRole("button", { name: f.schedules.changeTerms, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from finance_schedule_terms t join finance_categories c on c.id=t.category_id where t.studio_id='${studioId}' and t.name='Browser salary-coded supplier' and t.revision=1 and c.default_key='salary'`)).toBe("1");
  expect(sql(`select count(*) from finance_schedule_terms t join finance_categories c on c.id=t.category_id where t.studio_id='${studioId}' and t.name='Browser salary-coded supplier' and t.revision=2 and c.name='Browser external accounting'`)).toBe("1");
  expect(sql(`select count(*) from finance_expense_service_policies p join finance_schedules s on s.id=p.schedule_id where p.studio_id='${studioId}' and s.id in(select schedule_id from finance_schedule_terms where studio_id='${studioId}' and name='Browser salary-coded supplier') and p.project_id is null and s.employee_id is null`)).toBe("1");
  expect(originalSnapshot()).toBe(original);
  // One collapsed action opens the preserved versions, including their original categories.
  const historyAction = supplier.getByRole("button", { name: f.schedules.recurringHistory, exact: true });
  await expect(historyAction).toHaveAttribute("aria-expanded", "false");
  await historyAction.click();
  await expect(historyAction).toHaveAttribute("aria-expanded", "true");
  const history = supplier.getByRole("region");
  await expect(history.getByRole("button", { name: f.schedules.correctMistake, exact: true })).toHaveAttribute("aria-expanded", "false");
  await history.getByRole("button", { name: f.schedules.correctMistake, exact: true }).click();
  await expect(history.getByText(f.schedules.correctionBlocked, { exact: true })).toBeVisible();
  await expect(history.getByText(f.schedules.correctionScope, { exact: true })).toBeVisible();

  await expect(history.getByText(f.schedules.changeHistory.replace("{count}", "1"), { exact: true })).toBeVisible();
  await expect(history.getByText(f.movements.category, { exact: true }).first()).toBeVisible();
  await historyAction.click();
  await expect(historyAction).toHaveAttribute("aria-expanded", "false");
  const payroll = page.locator("article").filter({ has: page.getByRole("heading", { name: "Recurring admin", exact: true }) });
  await payroll.getByRole("button", { name: f.schedules.editPay, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: f.planning.cancel, exact: true }).click();
  const createPayment = async (name: string, interval: "1" | "12", treatment?: "manual" | "service_days") => {
    await page.getByRole("button", { name: treatment ? e.arrangementCreate : f.schedules.addRecurring, exact: true }).click();
    const form = page.getByRole("dialog");
    await form.locator("input[name=name]").fill(name);
    await form.locator("input[name=amount]").fill("1000");
    await form.getByRole("combobox", { name: f.movements.category, exact: true }).click();
    await page.getByRole("option", { name: "Browser external accounting", exact: true }).click();
    await form.getByRole("combobox", { name: f.schedules.recurrence, exact: true }).click();
    await page.getByRole("option", { name: f.schedules.intervals[interval], exact: true }).click();
    if (treatment) {
      await form.getByRole("combobox", { name: e.sourceTreatment, exact: true }).click();
      await page.getByRole("option", { name: treatment === "manual" ? e.sourceAfterDelivery : e.sourceStandardService, exact: true }).click();
      if (treatment === "service_days") {
        await form.getByRole("combobox", { name: e.serviceStart, exact: true }).click();
        await page.getByRole("button", { name: "Сьогодні", exact: true }).click();
      }
    } else await expect(form.locator("[name=servicePolicy], [name=serviceStart], [name=serviceProjectId]")).toHaveCount(0);
    await form.getByRole("button", { name: f.planning.save, exact: true }).click();
    await expect(form).toHaveCount(0);
    return sql(`select schedule_id from finance_schedule_terms where studio_id='${studioId}' and name='${name}' and revision=1`);
  };
  for (const interval of ["1", "12"] as const) {
    const name = `Browser created service ${interval}`;
    const id = await createPayment(name, interval);
    expect(sql(`select count(*)||':'||min(service_months)::text||':'||min(service_start)::text from finance_expense_service_policies where studio_id='${studioId}' and schedule_id='${id}'`)).toBe(`1:${interval}:${month}`);
    const row = page.locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
    expect(await row.evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(64);
    await row.getByRole("button", { name: f.schedules.changeTerms, exact: true }).click();
    const form = page.getByRole("dialog");
    await expect(form.locator("[name=servicePolicy], [name=serviceStart], [name=serviceProjectId]")).toHaveCount(0);
    await form.locator("input[name=amount]").fill("1200");
    await form.getByRole("button", { name: f.schedules.changeTerms, exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(sql(`select count(*)||':'||min(service_start)::text from finance_expense_service_policies where studio_id='${studioId}' and schedule_id='${id}'`)).toBe(`1:${month}`);
    await row.getByRole("button", { name: f.schedules.recurringHistory, exact: true }).click();
    await expect(row.getByRole("region").getByText(f.schedules.changeHistory.replace("{count}", "1"), { exact: true })).toBeVisible();
    await row.getByRole("button", { name: f.schedules.recurringHistory, exact: true }).click();
  }
  const legacy = page.locator("article").filter({ has: page.getByRole("heading", { name: "Browser legacy completion", exact: true }) });
  await legacy.getByRole("button", { name: f.schedules.recurringHistory, exact: true }).click();
  await legacy.getByRole("button", { name: e.arrangementTitle, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: e.sourceTreatment, exact: true })).toContainText(e.policy.period_end);
  await dialog.locator("input[name=amount]").fill("1300");
  await dialog.getByRole("button", { name: f.schedules.changeTerms, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*)||':'||min(policy) from finance_expense_service_policies where studio_id='${studioId}' and schedule_id='${legacyId}'`)).toBe("1:period_end");
  const eventId = await createPayment("Browser event arrangement", "12", "manual");
  expect(sql(`select policy from finance_expense_service_policies where studio_id='${studioId}' and schedule_id='${eventId}'`)).toBe("manual");
  const event = page.locator("article").filter({ has: page.getByRole("heading", { name: "Browser event arrangement", exact: true }) });
  await event.getByRole("button", { name: f.schedules.changeTerms, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.locator("[name=servicePolicy], [name=serviceStart], [name=serviceProjectId]")).toHaveCount(0);
  await dialog.locator("input[name=amount]").fill("1250");
  await dialog.getByRole("button", { name: f.schedules.changeTerms, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*)||':'||min(policy) from finance_expense_service_policies where studio_id='${studioId}' and schedule_id='${eventId}'`)).toBe("1:manual");
  expect(sql(`select count(*) from private.finance_expense_service_calculations('${studioId}',true) c where c->'policy'->>'schedule_id'='${eventId}'`)).toBe("0");
  const partialId = await createPayment("Browser partial arrangement", "1", "service_days");
  expect(sql(`select coverage_from=(now() at time zone 'Europe/Kyiv')::date and service_start='${month}'::date from finance_expense_service_policies where studio_id='${studioId}' and schedule_id='${partialId}'`)).toBe("t");
  expect(sql(`select count(*) from finance_expense_service_policies where studio_id='${studioId}' and schedule_id='${payrollId}'`)).toBe("0");
  expect(sql(`select count(*) from finance_labor_automation where studio_id='${studioId}'`)).toBe("0");
  expect(sql(`select recognition_start_month is null and recognition_enabled_at is null from finance_settings where studio_id='${studioId}'`)).toBe("t");
  expect(sql(`select count(*) from finance_recognition_entries where studio_id='${studioId}'`)).toBe("0");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await event.getByRole("button", { name: f.schedules.recurringHistory, exact: true }).click();
  await expect(event.getByRole("button", { name: e.arrangementTitle, exact: true })).toBeVisible();
  await event.getByRole("button", { name: f.schedules.recurringHistory, exact: true }).click();
  expect(errors).toEqual([]);
});
