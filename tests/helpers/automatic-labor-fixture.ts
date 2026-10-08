import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database.types";
import { z } from "zod";

const local = z.object({ API_URL: z.url(), SERVICE_ROLE_KEY: z.string() });
const sqlId = (value: string) => `'${z.uuid().parse(value)}'::uuid`;
export function automaticLaborSql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], {
    input: statement, encoding: "utf8",
  }).trim();
}

export async function concurrentAutomaticLaborRetry(input: {
  apiUrl: string; serviceRoleKey: string; admin: { email: string; password: string };
  studioId: string; obligationId: string; digest: string; requestId: string;
}) {
  const digest = z.string().regex(/^[a-f0-9]{32}$/).parse(input.digest);
  const requestId = z.uuid().parse(input.requestId), studioId = z.uuid().parse(input.studioId), obligationId = z.uuid().parse(input.obligationId);
  const client = createClient<Database>(input.apiUrl, input.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword(input.admin);
  if (signInError) throw signInError;
  const execute = async () => {
    const { data, error } = await client.rpc("process_finance_automatic_labor", {
      p_studio_id: studioId, p_obligation_id: obligationId, p_digest: digest, p_fx: null, p_request_id: requestId, p_approve: false,
    });
    if (error) throw error;
    return data;
  };
  return Promise.all([execute(), execute()]);
}

export async function createAutomaticLaborFixture(options: { periodStart?: string; startsOn?: string } = {}) {
  const periodStart = z.iso.date().parse(options.periodStart ?? "2026-08-01");
  const startsOn = z.iso.date().parse(options.startsOn ?? "2026-07-01");
  const periodEnd = new Date(Date.UTC(Number(periodStart.slice(0, 4)), Number(periodStart.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const config = local.parse(JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, DO_NOT_TRACK: "1" },
  })));
  if (!["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)) throw new Error("Automatic labor fixtures require local Supabase");
  const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const studioId = randomUUID(), projectId = randomUUID(), internalProjectId = randomUUID(), taskId = randomUUID(), scheduleId = randomUUID(), termsId = randomUUID();
  const obligationId = randomUUID(), payoutRequestId = randomUUID();
  const admin = { id: "", email: `labor-admin-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` };
  const employee = { id: "", email: `labor-employee-${randomUUID()}@example.test`, password: `Employee-${randomUUID()}` };
  const studio = sqlId(studioId), project = sqlId(projectId), task = sqlId(taskId);
  const internalProject = sqlId(internalProjectId);
  async function dispose() {
    automaticLaborSql(`begin; set local session_replication_role=replica;
      delete from public.finance_labor_calculations where studio_id=${studio};
      delete from public.finance_labor_capacity_revisions where studio_id=${studio};
      delete from public.finance_labor_automation where studio_id=${studio};
      delete from public.work_log_day_revisions where studio_id=${studio};
      delete from public.work_log_days where studio_id=${studio};
      delete from public.work_log_entries where studio_id=${studio};
      delete from public.finance_labor_allocation_items where studio_id=${studio};
      delete from public.finance_labor_allocation_revisions where studio_id=${studio};
      delete from public.finance_recognition_entries where studio_id=${studio};
      delete from public.finance_payroll_cost_revisions where studio_id=${studio};
      delete from public.finance_obligation_items where studio_id=${studio};
      delete from public.finance_obligations where studio_id=${studio};
      delete from public.finance_schedule_terms where studio_id=${studio};
      delete from public.finance_schedules where studio_id=${studio};
      delete from public.finance_expected_items where studio_id=${studio};
      delete from public.finance_planning_requests where studio_id=${studio};
      delete from public.finance_accounts where studio_id=${studio};
      delete from public.finance_categories where studio_id=${studio};
      delete from public.finance_settings where studio_id=${studio};
      delete from private.finance_labor_membership_events where studio_id=${studio};
      delete from public.project_members where project_id in (${project},${internalProject});
      delete from public.project_task_stage_columns where project_id in (${project},${internalProject});
      delete from public.project_activity where project_id in (${project},${internalProject});
      delete from public.tasks where id=${task};
      delete from public.tasks where project_id in (${project},${internalProject});
      delete from public.projects where id in (${project},${internalProject});
      delete from public.studio_members where studio_id=${studio};
      delete from public.studios where id=${studio}; commit;`);
    for (const actor of [admin, employee]) if (actor.id) {
      const { error } = await service.auth.admin.deleteUser(actor.id);
      if (error) throw error;
    }
  }
  try {
    await service.from("studios").insert({ id: studioId, name: "Automatic labor browser test" }).throwOnError();
    for (const [actor, name, role] of [[admin, "Labor admin", "admin"], [employee, "Labor employee", "employee"]] as const) {
      const { data, error } = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
      if (error) throw error;
      actor.id = data.user.id;
      await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: name, system_role: role, is_active: true }).throwOnError();
      await service.from("studio_members").insert({ studio_id: studioId, user_id: actor.id, system_role: role, joined_at: "2026-07-01" }).throwOnError();
    }
    automaticLaborSql(`insert into public.projects(id,studio_id,name,project_type,total_area_m2,start_date,status,created_by) values
      (${project},${studio},'Automatic labor client','private',10,date '2026-07-01','active',${sqlId(admin.id)}),
      (${sqlId(internalProjectId)},${studio},'0 IN SPACE','private',0,date '2026-07-01','active',${sqlId(admin.id)});
      insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
      values(${project},${sqlId(employee.id)},'designer',0,date '2026-07-01');
      insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by)
      values(${task},${project},'Automatic labor browser task','stage_1','in_progress','normal',${sqlId(employee.id)},${sqlId(admin.id)});
      insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
      values(${studio},'UAH',date '2026-07-01',${sqlId(admin.id)});
      insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
      values(gen_random_uuid(),${studio},'Test UAH account','UAH',0,${sqlId(admin.id)});
      select set_config('request.jwt.claim.sub',${sqlId(admin.id)}::text,false);
      select public.finalize_finance_setup(${studio});
      update public.finance_settings set recognition_start_month=date '2026-07-01' where studio_id=${studio};
      insert into public.finance_labor_automation(studio_id,starts_on,internal_project_id,created_by)
      values(${studio},date '${startsOn}',${sqlId(internalProjectId)},${sqlId(admin.id)});
      insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
      values(${studio},${sqlId(employee.id)},date '2026-07-01',360,array[1,2,3,4,5],${sqlId(admin.id)});
      insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
      values(${sqlId(scheduleId)},${studio},'payroll',${sqlId(employee.id)},${sqlId(admin.id)});
      insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
        payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
      values(${sqlId(termsId)},${studio},${sqlId(scheduleId)},1,'Known payroll',1000,'UAH',
        (select id from public.finance_categories where studio_id=${studio} and default_key='salary'),1,31,0,date '${periodStart}',
        'agreed','fixed','net',1000,0,0,'fixed','Automatic labor browser fixture',${sqlId(admin.id)});`);
    automaticLaborSql(`set role authenticated; select set_config('request.jwt.claim.sub',${sqlId(admin.id)}::text,false);
      select public.save_finance_expected_item(${studio},${sqlId(payoutRequestId)},jsonb_build_object('direction','outgoing','amount','1000','currency','UAH',
        'categoryId',(select id from public.finance_categories where studio_id=${studio} and default_key='salary'),
        'description','August employee payroll','dueDate',date '${periodEnd}','expectedDate',date '${periodEnd}',
        'commitment','agreed','certainty','fixed','established',true)); reset role;
      insert into public.finance_obligations(id,studio_id,schedule_id,terms_id,kind,employee_id,employee_name,period_start,period_end,created_by)
      values(${sqlId(obligationId)},${studio},${sqlId(scheduleId)},${sqlId(termsId)},'payroll',${sqlId(employee.id)},'Labor employee',date '${periodStart}',date '${periodEnd}',${sqlId(admin.id)});
      insert into public.finance_obligation_items(studio_id,obligation_id,expected_item_id,component)
      select ${studio},${sqlId(obligationId)},result_id,'payout' from public.finance_planning_requests where studio_id=${studio} and request_id=${sqlId(payoutRequestId)};`);
    return { apiUrl: config.API_URL, serviceRoleKey: config.SERVICE_ROLE_KEY, studioId, projectId, taskId, obligationId, admin, employee, dispose };
  } catch (error) { await dispose(); throw error; }
}
