begin;
select no_plan();
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$select ('7f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month_start(delta integer default 0) returns date language sql stable as $$select (date_trunc('month',pg_temp.today())+make_interval(months=>delta))::date$$;
insert into public.studios(id,name) values(pg_temp.pid(1),'Provisional labor test');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.pid(10),'authenticated','authenticated','provisional-labor-admin@test','{}','{}',now(),now()),
      (pg_temp.pid(11),'authenticated','authenticated','provisional-labor-employee@test','{}','{}',now(),now()),
      (pg_temp.pid(12),'authenticated','authenticated','provisional-labor-foreign-employee@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active) values
(pg_temp.pid(10),'Provisional admin','provisional-labor-admin@test','admin',true),
(pg_temp.pid(11),'Provisional employee','provisional-labor-employee@test','employee',true),
(pg_temp.pid(12),'Foreign employee','provisional-labor-foreign-employee@test','employee',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active,joined_at) values
(pg_temp.pid(1),pg_temp.pid(10),'admin',true,pg_temp.month_start(-3)),
(pg_temp.pid(1),pg_temp.pid(11),'employee',true,pg_temp.month_start(-3)),
(pg_temp.pid(1),pg_temp.pid(12),'employee',true,pg_temp.month_start(-3));
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.pid(1),'UAH',pg_temp.month_start(-3),pg_temp.pid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
values(pg_temp.pid(20),pg_temp.pid(1),'Test cash','UAH',0,pg_temp.pid(10));
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values
(pg_temp.pid(30),pg_temp.pid(1),'Client A',10,'active',pg_temp.month_start(-3),pg_temp.pid(10)),
(pg_temp.pid(31),pg_temp.pid(1),'Client B',10,'active',pg_temp.month_start(-3),pg_temp.pid(10)),
(pg_temp.pid(32),pg_temp.pid(1),'Internal',0,'active',pg_temp.month_start(-3),pg_temp.pid(10));
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values
(pg_temp.pid(30),pg_temp.pid(11),'designer',0,pg_temp.month_start(-3)),
(pg_temp.pid(31),pg_temp.pid(11),'designer',0,pg_temp.month_start(-3)),
(pg_temp.pid(32),pg_temp.pid(11),'designer',0,pg_temp.month_start(-3));
insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by) values
(pg_temp.pid(40),pg_temp.pid(30),'Client A work','stage_1','in_progress','normal',pg_temp.pid(11),pg_temp.pid(10)),
(pg_temp.pid(41),pg_temp.pid(31),'Client B work','stage_1','in_progress','normal',pg_temp.pid(11),pg_temp.pid(10)),
(pg_temp.pid(42),pg_temp.pid(32),'Internal work','stage_1','in_progress','normal',pg_temp.pid(11),pg_temp.pid(10));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select public.finalize_finance_setup(pg_temp.pid(1));
reset role;
-- Recognition remains inactive throughout this read-only calculation fixture.

insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
values(pg_temp.pid(80),pg_temp.pid(1),'payroll',pg_temp.pid(11),pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.pid(81),pg_temp.pid(1),pg_temp.pid(80),1,'Historical salary',1000,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='salary'),1,31,0,pg_temp.month_start(-2),
  'agreed','fixed','net',1000,200,100,'fixed','Historical salary conditions',pg_temp.pid(10));
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
values(pg_temp.pid(82),pg_temp.pid(1),'payroll',pg_temp.pid(12),pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.pid(83),pg_temp.pid(1),pg_temp.pid(82),1,'Foreign provisional salary',1000,'USD',
  (select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='salary'),1,31,0,pg_temp.month_start(-2),
  'agreed','fixed','net',1000,0,0,'fixed','Provisional FX snapshot test',pg_temp.pid(10));
insert into public.finance_obligations(id,studio_id,schedule_id,terms_id,kind,employee_id,employee_name,period_start,period_end,created_by) values
(pg_temp.pid(21),pg_temp.pid(1),pg_temp.pid(80),pg_temp.pid(81),'payroll',pg_temp.pid(11),'Provisional employee',pg_temp.month_start(),
  (pg_temp.month_start(1)-1),pg_temp.pid(10)),
(pg_temp.pid(22),pg_temp.pid(1),pg_temp.pid(80),pg_temp.pid(81),'payroll',pg_temp.pid(11),'Closed employee',pg_temp.month_start(-2),
  (pg_temp.month_start(-1)-1),pg_temp.pid(10)),
(pg_temp.pid(23),pg_temp.pid(1),pg_temp.pid(82),pg_temp.pid(83),'payroll',pg_temp.pid(12),'Foreign provisional employee',pg_temp.month_start(),
  (pg_temp.month_start(1)-1),pg_temp.pid(10)),
(pg_temp.pid(24),pg_temp.pid(1),pg_temp.pid(82),pg_temp.pid(83),'payroll',pg_temp.pid(12),'Foreign closed employee',pg_temp.month_start(-2),
  (pg_temp.month_start(-1)-1),pg_temp.pid(10));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select public.save_finance_expected_item(pg_temp.pid(1),pg_temp.pid(201),jsonb_build_object('direction','outgoing','amount','1000','currency','UAH',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='salary'),
  'description','Current monthly payroll','dueDate',pg_temp.month_start(1)-1,'expectedDate',pg_temp.month_start(1)-1,
  'commitment','agreed','certainty','fixed','established',true));
select public.save_finance_expected_item(pg_temp.pid(1),pg_temp.pid(202),jsonb_build_object('direction','outgoing','amount','1000','currency','UAH',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='salary'),
  'description','Closed monthly payroll','dueDate',pg_temp.month_start(-1)-1,'expectedDate',pg_temp.month_start(-1)-1,
  'commitment','agreed','certainty','fixed','established',true));
select public.save_finance_expected_item(pg_temp.pid(1),pg_temp.pid(203),jsonb_build_object('direction','outgoing','amount','1000','currency','USD',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='salary'),
  'description','Current foreign payroll','dueDate',pg_temp.month_start(1)-1,'expectedDate',pg_temp.month_start(1)-1,
  'commitment','agreed','certainty','fixed','established',true));
select public.save_finance_expected_item(pg_temp.pid(1),pg_temp.pid(204),jsonb_build_object('direction','outgoing','amount','1000','currency','USD',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='salary'),
  'description','Closed foreign payroll','dueDate',pg_temp.month_start(-1)-1,'expectedDate',pg_temp.month_start(-1)-1,
  'commitment','agreed','certainty','fixed','established',true));
reset role;
insert into public.finance_obligation_items(studio_id,obligation_id,expected_item_id,component)
select pg_temp.pid(1),o.obligation_id,r.result_id,'payout' from (values(pg_temp.pid(21),pg_temp.pid(201)),(pg_temp.pid(22),pg_temp.pid(202)),
  (pg_temp.pid(23),pg_temp.pid(203)),(pg_temp.pid(24),pg_temp.pid(204))) o(obligation_id,request_id)
join public.finance_planning_requests r on r.studio_id=pg_temp.pid(1) and r.request_id=o.request_id;

create function pg_temp.historical(p_fx jsonb default '{}') returns jsonb language sql stable as $$
  select public.get_finance_historical_labor_reporting(pg_temp.pid(1),p_fx)
$$;
create function pg_temp.period(p_employee integer,p_month integer,p_fx jsonb default '{}') returns jsonb language sql stable as $$
  select p from jsonb_array_elements(pg_temp.historical(p_fx)->'periods') p
    where p->>'employeeId'=pg_temp.pid(p_employee)::text and p->>'periodStart'=pg_temp.month_start(p_month)::text
$$;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
savepoint studio_baseline;
update public.studios set standard_workday_minutes=420 where id=pg_temp.pid(1);
insert into public.work_log_days(studio_id,user_id,work_date)
select pg_temp.pid(1),pg_temp.pid(11),d::date from generate_series(pg_temp.month_start(-2)::timestamp,(pg_temp.month_start(-1)-1)::timestamp,interval '1 day') d;
insert into public.work_log_entries(studio_id,user_id,work_date,activity_kind,task_id,minutes)
select pg_temp.pid(1),pg_temp.pid(11),min(d)::date,'task',pg_temp.pid(40),420
from generate_series(pg_temp.month_start(-2)::timestamp,(pg_temp.month_start(-1)-1)::timestamp,interval '1 day') d
where extract(isodow from d) between 1 and 5;
select ok(not (pg_temp.period(11,-2)->'issues' ? 'missing_capacity'),'a salary and submitted work need no separate Finance capacity setup');
select is((pg_temp.period(11,-2)->>'expectedMinutes')::numeric,
  (select count(*)*420 from generate_series(pg_temp.month_start(-2)::timestamp,(pg_temp.month_start(-1)-1)::timestamp,interval '1 day') d
    where extract(isodow from d) between 1 and 5)::numeric,'the baseline uses the actual studio duration and Monday-Friday');
select is((pg_temp.period(11,-2)->'allocations'->0->>'amount')::numeric,
  (select trunc(1300::numeric/count(*),2) from generate_series(pg_temp.month_start(-2)::timestamp,(pg_temp.month_start(-1)-1)::timestamp,interval '1 day') d
    where extract(isodow from d) between 1 and 5),'submitted project hours accrue salary cost without an artificial activation date');
select is((select count(*) from public.finance_labor_capacity_revisions where studio_id=pg_temp.pid(1)),0::bigint,'the fallback creates no capacity history');
rollback to studio_baseline;

-- Historical capacity is explicit; a different current capacity must never leak backwards.
insert into public.finance_labor_capacity_revisions(studio_id,effective_from,daily_minutes,weekdays,created_by) values
(pg_temp.pid(1),pg_temp.month_start(-2),480,array[1,2,3,4,5,6,7],pg_temp.pid(10)),
(pg_temp.pid(1),pg_temp.month_start(),960,array[1,2,3,4,5,6,7],pg_temp.pid(10));
insert into public.work_log_days(studio_id,user_id,work_date)
select pg_temp.pid(1),pg_temp.pid(11),d::date from generate_series(pg_temp.month_start(-2)::timestamp,(pg_temp.month_start(-1)-1)::timestamp,interval '1 day') d;
insert into public.work_log_entries(studio_id,user_id,work_date,activity_kind,task_id,internal_activity_type,minutes) values
(pg_temp.pid(1),pg_temp.pid(11),pg_temp.month_start(-2)+2,'task',pg_temp.pid(40),null,480),
(pg_temp.pid(1),pg_temp.pid(11),pg_temp.month_start(-2)+2,'internal',null,'team_walkthrough',480);
select is((select recognition_start_month from public.finance_settings where studio_id=pg_temp.pid(1)),null,'recognition starts inactive');
select is((select count(*) from public.finance_labor_automation where studio_id=pg_temp.pid(1)),0::bigint,'historical reads need no automation configuration');
select is((pg_temp.period(11,-2)->>'knownNative')::numeric,1300::numeric,'historical net salary includes fixed deductions and employer costs once');
select is((pg_temp.period(11,-2)->>'calculatedCost')::numeric,1300::numeric,'known closed studio payroll is calculated before recognition activation');
select is((pg_temp.period(11,-2)->>'expectedMinutes')::integer,(pg_temp.month_start(-1)-pg_temp.month_start(-2))*480,'historical capacity is used instead of the current 960-minute revision');
select is((pg_temp.period(11,-2)->>'completedDays')::integer,pg_temp.month_start(-1)-pg_temp.month_start(-2),'only actual submitted days establish complete historical Worklog');
select ok(not (pg_temp.period(11,-2)->'issues' ? 'missing_reports'),'complete historical submissions have no missing-report issue');
select is((pg_temp.period(11,-2)->'allocations'->0->>'amount')::numeric,
  trunc(1300::numeric*240/((pg_temp.month_start(-1)-pg_temp.month_start(-2))*480),2),'project attribution reuses capacity normalization including internal overtime');
select is((pg_temp.period(11,-2)->>'unattributedCost')::numeric+(pg_temp.period(11,-2)->'allocations'->0->>'amount')::numeric,
  1300::numeric,'internal and unused capacity stay in the studio remainder');



savepoint missing_worklog;
delete from public.work_log_days where studio_id=pg_temp.pid(1) and user_id=pg_temp.pid(11) and work_date=pg_temp.month_start(-2)+2;
select is((pg_temp.period(11,-2)->>'calculatedCost')::numeric,1300::numeric,'missing Worklog cannot erase known historical salary');
select is(jsonb_array_length(pg_temp.period(11,-2)->'allocations'),0,'unsubmitted project work is not reliably attributed');
select ok(pg_temp.period(11,-2)->'issues' ? 'missing_reports','missing Worklog is explicit coverage evidence');
rollback to missing_worklog;

-- One existing source, not both an obligation and an inferred schedule occurrence.
select is((select count(*) from jsonb_array_elements(pg_temp.historical()->'periods') p where p->>'employeeId'=pg_temp.pid(11)::text
  and p->>'periodStart'=pg_temp.month_start(-2)::text),1::bigint,'actual payroll suppresses the synthetic employee-period candidate');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.historical()->'periods') p where p->>'employeeId'=pg_temp.pid(11)::text
  and p->>'periodStart'=pg_temp.month_start(-1)::text and p->>'obligationId' is null),'historical terms support a period without creating an obligation');
select is((select count(*) from public.finance_obligations where studio_id=pg_temp.pid(1)),4::bigint,'historical reading creates no missing payroll occurrences');
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1)),0::bigint,'historical reading posts no ledger entries');
select is((select count(*) from public.finance_labor_calculations where studio_id=pg_temp.pid(1)),0::bigint,'historical reading creates no worker calculation history');
select is((select recognition_start_month from public.finance_settings where studio_id=pg_temp.pid(1)),null,'historical reading does not activate recognition');

select is(pg_temp.period(12,-2)->>'calculatedCost',null,'missing historical FX is explicit rather than using current rates');
select is((pg_temp.period(12,-2)->>'knownNative')::numeric,1000::numeric,'native historical salary stays known without reporting FX');
select is((pg_temp.period(12,-2,jsonb_build_object('USD:'||(pg_temp.month_start(-1)-1)::text,
  jsonb_build_object('rate','2','source','manual','effectiveDate',pg_temp.month_start(-1)-1)))->>'calculatedCost')::numeric,
  2000::numeric,'historical period-end FX values the outstanding payroll without posting');
select throws_ok($$select pg_temp.historical(jsonb_build_object('USD:'||(pg_temp.month_start(-1)-1)::text,
  jsonb_build_object('rate','2','source','manual','effectiveDate',pg_temp.today())))$$,'P0001','finance_fx_required','current FX cannot substitute for period-end valuation');

-- Existing immutable recognition is seeded only inside this rollback fixture.
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
select pg_temp.pid(84),studio_id,schedule_id,2,'Current salary must not leak backwards',9000,currency,category_id,interval_months,payout_day,
  payment_month_offset,pg_temp.month_start(),commitment,certainty,basis,9000,employee_deductions,employer_cost,employer_cost_status,'Current conditions',created_by
from public.finance_schedule_terms where id=pg_temp.pid(81);
select is((pg_temp.period(11,-2)->>'knownNative')::numeric,1300::numeric,'current salary conditions never substitute for historical conditions');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.pid(16),'authenticated','authenticated','historical-gross@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active)
values(pg_temp.pid(16),'Historical gross employee','historical-gross@test','employee',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active,joined_at)
values(pg_temp.pid(1),pg_temp.pid(16),'employee',true,pg_temp.month_start(-6));
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
values(pg_temp.pid(90),pg_temp.pid(1),'payroll',pg_temp.pid(16),pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,effective_through,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.pid(91),pg_temp.pid(1),pg_temp.pid(90),1,'Historical gross salary',2000,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='salary'),1,31,0,pg_temp.month_start(-3),pg_temp.month_start()-1,
  'agreed','fixed','gross',1700,300,200,'fixed','Gross historical condition',pg_temp.pid(10));
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
values(pg_temp.pid(30),pg_temp.pid(16),'designer',0,pg_temp.month_start(-6));
insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by)
values(pg_temp.pid(45),pg_temp.pid(30),'Gross employee work','stage_1','in_progress','normal',pg_temp.pid(16),pg_temp.pid(10));
insert into public.work_log_entries(studio_id,user_id,work_date,activity_kind,task_id,minutes)
values(pg_temp.pid(1),pg_temp.pid(16),pg_temp.month_start(-3)+2,'task',pg_temp.pid(45),60);
insert into public.work_log_days(studio_id,user_id,work_date) values
(pg_temp.pid(1),pg_temp.pid(16),pg_temp.month_start(-3)+2),(pg_temp.pid(1),pg_temp.pid(16),pg_temp.month_start(-4)+2);
select is((pg_temp.period(16,-3)->>'knownNative')::numeric,2200::numeric,'gross payroll adds employer cost once without adding deductions again');
select is((pg_temp.period(16,-3)->>'calculatedCost')::numeric,2200::numeric,'missing historical capacity does not erase known closed salary');
select ok(not (pg_temp.period(16,-3)->'issues' ? 'missing_capacity'),'historical salary uses the studio workday before the first dated override');
select is((pg_temp.period(16,-3)->>'expectedMinutes')::numeric,
  (select count(*)*480 from generate_series(pg_temp.month_start(-3)::timestamp,(pg_temp.month_start(-2)-1)::timestamp,interval '1 day') d
    where extract(isodow from d) between 1 and 5)::numeric,'historical baseline never borrows a later dated capacity revision');
select is(pg_temp.period(16,-4)->>'knownNative',null,'unmatched Worklog cannot fabricate a historical salary');
select ok(pg_temp.period(16,-4)->'issues' ? 'missing_salary','unmatched submitted Worklog exposes its missing salary input');
select is((select count(*) from public.finance_obligations where studio_id=pg_temp.pid(1)),4::bigint,'term-only calculations still create no occurrences');
savepoint ambiguous_salary;
insert into public.finance_schedules(id,studio_id,kind,employee_id,stopped_from,created_by)
values(pg_temp.pid(92),pg_temp.pid(1),'payroll',pg_temp.pid(16),pg_temp.month_start(),pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
select pg_temp.pid(93),studio_id,pg_temp.pid(92),1,'Conflicting old salary',amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,pg_temp.month_start(-1),commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,'Conflicting historical input',created_by
from public.finance_schedule_terms where id=pg_temp.pid(91);
select is(pg_temp.period(16,-1)->>'knownNative',null,'competing historical salary sources are not summed or guessed');
select ok(pg_temp.period(16,-1)->'issues' ? 'ambiguous_salary','ambiguous sources have a specific missing-input explanation');
rollback to ambiguous_salary;
savepoint unknown_component;
insert into public.finance_payroll_cost_revisions(studio_id,obligation_id,component,revision,status,amount,reason,created_by)
values(pg_temp.pid(1),pg_temp.pid(22),'employer_cost',1,'unknown',null,'Employer cost is not historically established',pg_temp.pid(10));
select is((pg_temp.period(11,-2)->>'knownNative')::numeric,1200::numeric,'known net salary remains calculable when employer cost is unknown');
select ok(pg_temp.period(11,-2)->'issues' ? 'unknown_employer_cost','unknown employer costs remain explicit instead of fabricated zeroes');
rollback to unknown_component;
select throws_ok($$select public.get_finance_historical_labor_reporting(pg_temp.pid(999))$$,'P0001','finance_admin_required','historical reads preserve the tenant boundary');
insert into public.finance_recognition_entries(studio_id,classification,source_kind,obligation_id,employee_id,category_id,source_snapshot,
  period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,reason,created_by)
values(pg_temp.pid(1),'labor','labor',pg_temp.pid(22),pg_temp.pid(11),(select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='salary'),
  private.finance_labor_source(pg_temp.pid(1),pg_temp.pid(22))->'snapshot',pg_temp.month_start(-2),pg_temp.month_start(-1)-1,pg_temp.month_start(-1)-1,
  'Existing recognized payroll','UAH',400,0,400,'UAH',400,1,'identity',pg_temp.month_start(-1)-1,'Existing fixture evidence',pg_temp.pid(10));
select is((pg_temp.period(11,-2)->>'calculatedCost')::numeric,900::numeric,'partial recognition leaves only the unrecognized native remainder');
select is((pg_temp.period(11,-2)->>'knownStudioCost')::numeric,1300::numeric,'recognized and calculated studio costs conserve the known salary');
select is((select count(*) from jsonb_array_elements(pg_temp.historical()->'periods') p where p->>'obligationId'=pg_temp.pid(22)::text),1::bigint,'recognition preserves source-level identity');
savepoint manual_attribution;
select private.save_finance_labor_allocation_core(pg_temp.pid(1),pg_temp.pid(401),
  (select id from public.finance_labor_cost_pools where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22)),
  jsonb_build_object('revision',0,'reason','Historical manual attribution','items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.pid(30),'amount','5.00'))),
  pg_temp.pid(10),'manual_management');
select is((pg_temp.period(11,-2)->>'calculatedCost')::numeric,900::numeric,'manual attribution retains the known unrecognized studio delta');
select is(jsonb_array_length(pg_temp.period(11,-2)->'allocations'),0,'historical read cannot override manual project allocation ownership');
select ok(pg_temp.period(11,-2)->'issues' ? 'manual_attribution','manual ownership remains an explicit attribution gap');
rollback to manual_attribution;
insert into public.finance_recognition_entries(studio_id,classification,source_kind,obligation_id,employee_id,category_id,source_snapshot,
  period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,reason,created_by)
values(pg_temp.pid(1),'labor','labor',pg_temp.pid(22),pg_temp.pid(11),(select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='salary'),
  private.finance_labor_source(pg_temp.pid(1),pg_temp.pid(22))->'snapshot',pg_temp.month_start(-2),pg_temp.month_start(-1)-1,pg_temp.month_start(-1)-1,
  'Remaining recognized payroll','UAH',900,0,900,'UAH',900,1,'identity',pg_temp.month_start(-1)-1,'Existing fixture evidence',pg_temp.pid(10));
select is((pg_temp.period(11,-2)->>'calculatedCost')::numeric,0::numeric,'full recognition removes calculated overlap');
select is((pg_temp.period(11,-2)->>'recognizedCost')::numeric,1300::numeric,'recognized historical valuation is preserved');
select is((public.get_finance_management_reporting(pg_temp.pid(1))->'historicalLabor'->>'reportingCurrency'),'UAH','management reporting exposes independent historical calculations');
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.pid(1))->'months') m where m->>'status'='confirmed'),'historical calculations never implicitly confirm inactive management history');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
select throws_ok($$select pg_temp.historical()$$,'P0001','finance_admin_required','employees cannot read historical payroll calculations');
reset role;
select * from finish();
rollback;

