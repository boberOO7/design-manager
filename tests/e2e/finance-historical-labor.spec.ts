import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import uk from "../../messages/uk.json";
import { signInLocalTestUser } from "../helpers/auth";

const env = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(env.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local historical fixtures only");
const service = createClient<Database>(env.EQUIPMENT_TEST_SUPABASE_URL, env.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false } });
const studioId = randomUUID(), projectId = randomUUID(), taskId = randomUUID(), scheduleId = randomUUID(), termsId = randomUUID();
const actor = { id: "", email: `historical-${randomUUID()}@example.test`, password: `Historical-${randomUUID()}` };
let month = "", end = "";
function sql(input: string) {
  return execFileSync("psql", ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-Atq"], {
    input, encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres", PGCONNECT_TIMEOUT: "3" },
  }).trim();
}

test.beforeAll(async () => {
  const user = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true, user_metadata: { finance_display_currency: "UAH" } });
  if (user.error) throw user.error;
  actor.id = user.data.user.id;
  await service.from("studios").insert({ id: studioId, name: "Historical labor browser fixture" }).throwOnError();
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Historical admin", system_role: "admin", is_active: true }).throwOnError();
  month = sql("select (date_trunc('month',now() at time zone 'Europe/Kyiv')-interval '1 month')::date");
  end = sql(`select (date '${month}'+interval '1 month - 1 day')::date`);
  await service.from("studio_members").insert({ studio_id: studioId, user_id: actor.id, system_role: "admin", joined_at: `${month}T00:00:00+03:00` }).throwOnError();
  sql(`begin;
    insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studioId}','UAH','${month}','${actor.id}');
    insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values('${studioId}','Bank','UAH',0,'${actor.id}');
    select set_config('request.jwt.claim.sub','${actor.id}',true);
    select public.finalize_finance_setup('${studioId}');
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
      values('${projectId}','${studioId}','Historical client work',10,'${month}','${actor.id}','active');
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
      values('${projectId}','${actor.id}','designer',10,'${month}');
    insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by)
      values('${taskId}','${projectId}','Historical work','stage_1','in_progress','normal','${actor.id}','${actor.id}');
    insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by) values('${scheduleId}','${studioId}','payroll','${actor.id}','${actor.id}');
    insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
      payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
      values('${termsId}','${studioId}','${scheduleId}',1,'Historical salary',1000,'UAH',
        (select id from public.finance_categories where studio_id='${studioId}' and default_key='salary'),1,31,0,'${month}',
        'agreed','fixed','gross',1000,0,0,'fixed','Local browser evidence','${actor.id}');
    insert into public.finance_labor_capacity_revisions(studio_id,effective_from,daily_minutes,weekdays,created_by)
      values('${studioId}','${month}',480,array[1,2,3,4,5,6,7],'${actor.id}');
    insert into public.work_log_days(studio_id,user_id,work_date) values('${studioId}','${actor.id}','${month}');
    insert into public.work_log_entries(studio_id,user_id,work_date,activity_kind,task_id,internal_activity_type,minutes) values
      ('${studioId}','${actor.id}','${month}','task','${taskId}',null,480),
      ('${studioId}','${actor.id}','${month}','internal',null,'team_walkthrough',480);
    commit;`);
});

test.afterAll(async () => {
  // Remove this randomly identified local fixture only, including append-only fixture rows.
  sql(`begin;set local session_replication_role=replica;
    delete from public.tasks where id='${taskId}';
    delete from public.project_members where project_id='${projectId}';
    do $$declare item record;begin
      for item in select table_schema,table_name from information_schema.columns where column_name='studio_id' and table_schema in ('public','private')
        and table_name in(select tablename from pg_tables where schemaname in ('public','private')) loop
        execute format('delete from %I.%I where studio_id=$1',item.table_schema,item.table_name) using '${studioId}'::uuid;
      end loop;
    end$$;
    delete from public.studios where id='${studioId}';commit;`);
  if (actor.id) { const deleted = await service.auth.admin.deleteUser(actor.id); if (deleted.error) throw deleted.error; }
});

test("historical Finance reports show known salary and partial attribution without activation or posting", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL ?? "http://127.0.0.1:3000" }]);
  await signInLocalTestUser(page, actor);
  // Existing dashboard cash-planning maintenance can create scheduled payables;
  // the historical report must not add any on top of that existing behavior.
  const obligationsBefore = sql(`select count(*) from public.finance_obligations where studio_id='${studioId}'`);
  await page.goto(`/finance/reports?from=${month}&to=${end}`);
  const historical = page.getByTestId("historical-labor");
  await expect(historical).toBeVisible();
  await expect(historical.getByTestId("historical-calculated-cost")).toContainText(/1\s?000.*UAH/);
  await expect(historical).toContainText(uk.Finance.historicalLabor.issue.missing_reports);
  await expect(historical).toContainText(uk.Finance.historicalLabor.coverage.replace("{periods}", "1").replace("{completed}", "1").replace("{required}", String(Number(end.slice(-2)))));
  await historical.getByRole("button", { name: uk.Finance.historicalLabor.sources, exact: true }).click();
  await expect(historical).toContainText("Historical admin");
  expect(sql(`select recognition_start_month is null from public.finance_settings where studio_id='${studioId}'`)).toBe("t");
  expect(sql(`select count(*) from public.finance_recognition_entries where studio_id='${studioId}'`)).toBe("0");
  expect(sql(`select count(*) from public.finance_obligations where studio_id='${studioId}'`)).toBe(obligationsBefore);
  expect(sql(`select count(*) from public.finance_labor_automation where studio_id='${studioId}'`)).toBe("0");
  expect(errors).toEqual([]);
});
