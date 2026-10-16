begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('7a000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.day_basis(employee integer) returns jsonb language sql stable as $$
  select private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(employee))
$$;

insert into public.studios(id,name) values(pg_temp.fid(1),'Automatic labor test');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','automatic-labor-'||n||'@test','{}','{}',now(),now() from generate_series(10,18)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Automatic labor '||n,'automatic-labor-'||n||'@test',case when n=10 then 'admin' else 'employee' end,true from generate_series(10,18)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active,joined_at)
select pg_temp.fid(1),pg_temp.fid(n),case when n=10 then 'admin' else 'employee' end,true,
  case when n=13 then date '2026-08-01' else date '2026-07-01' end from generate_series(10,18)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by,finalized_at,finalized_by)
values(pg_temp.fid(1),'UAH',date '2026-07-01',pg_temp.fid(10),null,null);
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
values(pg_temp.fid(20),pg_temp.fid(1),'Test cash','UAH',0,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values
(pg_temp.fid(30),pg_temp.fid(1),'Client A',10,'active',date '2026-07-01',pg_temp.fid(10)),
(pg_temp.fid(31),pg_temp.fid(1),'Client B',10,'active',date '2026-07-01',pg_temp.fid(10)),
(pg_temp.fid(32),pg_temp.fid(1),'Internal',0,'active',date '2026-07-01',pg_temp.fid(10)),
(pg_temp.fid(33),pg_temp.fid(1),'Unrelated client',10,'active',date '2026-07-01',pg_temp.fid(10));
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values
(pg_temp.fid(30),pg_temp.fid(11),'designer',0,date '2026-07-01'),
(pg_temp.fid(31),pg_temp.fid(11),'designer',0,date '2026-07-01'),
(pg_temp.fid(32),pg_temp.fid(11),'designer',0,date '2026-07-01'),
(pg_temp.fid(33),pg_temp.fid(12),'designer',0,date '2026-07-01');
insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by) values
(pg_temp.fid(40),pg_temp.fid(30),'A task','stage_1','in_progress','normal',pg_temp.fid(11),pg_temp.fid(10)),
(pg_temp.fid(41),pg_temp.fid(31),'B task','stage_1','in_progress','normal',pg_temp.fid(11),pg_temp.fid(10)),
(pg_temp.fid(42),pg_temp.fid(32),'Internal task','stage_1','in_progress','normal',pg_temp.fid(11),pg_temp.fid(10)),
(pg_temp.fid(43),pg_temp.fid(33),'Other employee task','stage_1','in_progress','normal',pg_temp.fid(12),pg_temp.fid(10));
-- Test-only historical activation isolates closed periods; current-date activation is covered in finance_provisional_labor.test.sql.
insert into public.finance_labor_automation(studio_id,starts_on,internal_project_id,created_by)
values(pg_temp.fid(1),date '2026-07-01',pg_temp.fid(32),pg_temp.fid(10));
insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
values(pg_temp.fid(1),pg_temp.fid(11),date '2026-07-01',360,array[1,2,3,4,5],pg_temp.fid(10));
insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
values(pg_temp.fid(1),pg_temp.fid(13),date '2026-07-01',360,array[1,2,3,4,5],pg_temp.fid(10));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.finalize_finance_setup(pg_temp.fid(1));
reset role;
-- Backdated recognition is deliberately seeded only inside this isolated SQL test fixture.
update public.finance_settings set recognition_start_month=date '2026-07-01' where studio_id=pg_temp.fid(1);
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
values(pg_temp.fid(80),pg_temp.fid(1),'payroll',pg_temp.fid(11),pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.fid(81),pg_temp.fid(1),pg_temp.fid(80),1,'Known payroll',1000,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),1,31,0,date '2026-08-01',
  'agreed','fixed','net',1000,0,0,'fixed','Automatic labor test source',pg_temp.fid(10));
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
values(pg_temp.fid(90),pg_temp.fid(1),'payroll',pg_temp.fid(12),pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.fid(91),pg_temp.fid(1),pg_temp.fid(90),1,'Payroll with unknown additions',500,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),1,31,0,date '2026-08-01',
  'agreed','fixed','net',500,null,null,'unknown','Unknown component test source',pg_temp.fid(10));
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
values(pg_temp.fid(33),pg_temp.fid(14),'designer',0,date '2026-07-01'),
(pg_temp.fid(30),pg_temp.fid(15),'designer',0,date '2026-07-01'),
(pg_temp.fid(31),pg_temp.fid(16),'designer',0,date '2026-07-01');
insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
values(pg_temp.fid(1),pg_temp.fid(14),date '2026-07-01',360,array[1,2,3,4,5],pg_temp.fid(10));
insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
values(pg_temp.fid(1),pg_temp.fid(16),date '2026-07-01',360,'{}',pg_temp.fid(10));
insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
values(pg_temp.fid(1),pg_temp.fid(17),date '2026-07-01',360,array[1,2,3,4,5],pg_temp.fid(10));
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
values(pg_temp.fid(100),pg_temp.fid(1),'payroll',pg_temp.fid(14),pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.fid(101),pg_temp.fid(1),pg_temp.fid(100),1,'Foreign currency payroll',1000,'USD',
  (select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),1,31,0,date '2026-08-01',
  'agreed','fixed','net',1000,0,0,'fixed','Protected FX preview test',pg_temp.fid(10));
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by) values
(pg_temp.fid(110),pg_temp.fid(1),'payroll',pg_temp.fid(15),pg_temp.fid(10)),
(pg_temp.fid(120),pg_temp.fid(1),'payroll',pg_temp.fid(16),pg_temp.fid(10)),
(pg_temp.fid(130),pg_temp.fid(1),'payroll',pg_temp.fid(17),pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values
(pg_temp.fid(111),pg_temp.fid(1),pg_temp.fid(110),1,'Missing capacity payroll',300,'UAH',
 (select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),1,31,0,date '2026-08-01',
 'agreed','fixed','net',300,0,0,'fixed','Missing capacity safety test',pg_temp.fid(10)),
(pg_temp.fid(121),pg_temp.fid(1),pg_temp.fid(120),1,'Zero weekday capacity payroll',400,'UAH',
 (select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),1,31,0,date '2026-08-01',
 'agreed','fixed','net',400,0,0,'fixed','Zero weekday capacity test',pg_temp.fid(10)),
(pg_temp.fid(131),pg_temp.fid(1),pg_temp.fid(130),1,'Adjustable employer cost payroll',400,'UAH',
 (select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),1,31,0,date '2026-08-01',
 'agreed','fixed','net',400,0,null,'unknown','Automatic payroll correction test',pg_temp.fid(10));
set local role authenticated;
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(71),jsonb_build_object('direction','outgoing','amount','1000','currency','UAH',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),
  'description','August payroll','dueDate',date '2026-08-31','expectedDate',date '2026-08-31','commitment','agreed','certainty','fixed','established',true));
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(75),jsonb_build_object('direction','outgoing','amount','500','currency','UAH',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),
  'description','August payroll with unknown components','dueDate',date '2026-08-31','expectedDate',date '2026-08-31',
  'commitment','agreed','certainty','fixed','established',true));
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(102),jsonb_build_object('direction','outgoing','amount','1000','currency','USD',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),
  'description','August foreign currency payroll','dueDate',date '2026-08-31','expectedDate',date '2026-08-31',
  'commitment','agreed','certainty','fixed','established',true));
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(103),jsonb_build_object('direction','outgoing','amount','300','currency','UAH',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),
  'description','August missing capacity payroll','dueDate',date '2026-08-31','expectedDate',date '2026-08-31',
  'commitment','agreed','certainty','fixed','established',true));
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(104),jsonb_build_object('direction','outgoing','amount','400','currency','UAH',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),
  'description','August zero weekday capacity payroll','dueDate',date '2026-08-31','expectedDate',date '2026-08-31',
  'commitment','agreed','certainty','fixed','established',true));
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(105),jsonb_build_object('direction','outgoing','amount','400','currency','UAH',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),
  'description','August adjustable employer cost payroll','dueDate',date '2026-08-31','expectedDate',date '2026-08-31',
  'commitment','agreed','certainty','fixed','established',true));
reset role;
insert into public.finance_obligations(id,studio_id,schedule_id,terms_id,kind,employee_id,employee_name,period_start,period_end,created_by)
values(pg_temp.fid(11),pg_temp.fid(1),pg_temp.fid(80),pg_temp.fid(81),'payroll',pg_temp.fid(11),'Automatic labor 11',date '2026-08-01',date '2026-08-31',pg_temp.fid(10));
insert into public.finance_obligation_items(studio_id,obligation_id,expected_item_id,component)
select pg_temp.fid(1),pg_temp.fid(11),result_id,'payout' from public.finance_planning_requests
where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(71);
insert into public.finance_obligations(id,studio_id,schedule_id,terms_id,kind,employee_id,employee_name,period_start,period_end,created_by)
values(pg_temp.fid(13),pg_temp.fid(1),pg_temp.fid(90),pg_temp.fid(91),'payroll',pg_temp.fid(12),'Automatic labor 12',date '2026-08-01',date '2026-08-31',pg_temp.fid(10));
insert into public.finance_obligation_items(studio_id,obligation_id,expected_item_id,component)
select pg_temp.fid(1),pg_temp.fid(13),result_id,'payout' from public.finance_planning_requests
where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(75);
insert into public.finance_obligations(id,studio_id,kind,employee_id,employee_name,period_start,period_end,created_by) values
(pg_temp.fid(12),pg_temp.fid(1),'bonus',pg_temp.fid(12),'Automatic labor 12',date '2026-08-01',date '2026-08-31',pg_temp.fid(10));
insert into public.finance_obligations(id,studio_id,kind,employee_id,employee_name,period_start,period_end,created_by)
values(pg_temp.fid(14),pg_temp.fid(1),'bonus',pg_temp.fid(13),'First-day joiner bonus',date '2026-08-01',date '2026-08-31',pg_temp.fid(10));
insert into public.finance_obligations(id,studio_id,schedule_id,terms_id,kind,employee_id,employee_name,period_start,period_end,created_by)
values(pg_temp.fid(15),pg_temp.fid(1),pg_temp.fid(100),pg_temp.fid(101),'payroll',pg_temp.fid(14),'Protected FX employee',date '2026-08-01',date '2026-08-31',pg_temp.fid(10));
insert into public.finance_obligation_items(studio_id,obligation_id,expected_item_id,component)
select pg_temp.fid(1),pg_temp.fid(15),result_id,'payout' from public.finance_planning_requests
where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(102);
insert into public.finance_obligations(id,studio_id,schedule_id,terms_id,kind,employee_id,employee_name,period_start,period_end,created_by)
values
(pg_temp.fid(16),pg_temp.fid(1),pg_temp.fid(110),pg_temp.fid(111),'payroll',pg_temp.fid(15),'No capacity employee',date '2026-08-01',date '2026-08-31',pg_temp.fid(10)),
(pg_temp.fid(17),pg_temp.fid(1),pg_temp.fid(120),pg_temp.fid(121),'payroll',pg_temp.fid(16),'Zero weekdays employee',date '2026-08-01',date '2026-08-31',pg_temp.fid(10)),
(pg_temp.fid(18),pg_temp.fid(1),pg_temp.fid(130),pg_temp.fid(131),'payroll',pg_temp.fid(17),'Adjustable payroll employee',date '2026-08-01',date '2026-08-31',pg_temp.fid(10));
insert into public.finance_obligation_items(studio_id,obligation_id,expected_item_id,component)
select pg_temp.fid(1),o.obligation_id,p.result_id,'payout' from (values(pg_temp.fid(16),pg_temp.fid(103)),(pg_temp.fid(17),pg_temp.fid(104)),(pg_temp.fid(18),pg_temp.fid(105))) o(obligation_id,request_id)
join public.finance_planning_requests p on p.studio_id=pg_temp.fid(1) and p.request_id=o.request_id;
-- Current open-month source: all elapsed scheduled weekdays have reports, but
-- the unrecognized payroll remainder remains an actionable project-scoped issue.
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
values(pg_temp.fid(30),pg_temp.fid(18),'designer',0,date '2026-07-01');
insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by)
values(pg_temp.fid(44),pg_temp.fid(30),'Current month task','stage_1','in_progress','normal',pg_temp.fid(18),pg_temp.fid(10));
insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
values(pg_temp.fid(1),pg_temp.fid(18),date '2026-07-01',360,array[1,2,3,4,5],pg_temp.fid(10));
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
values(pg_temp.fid(140),pg_temp.fid(1),'payroll',pg_temp.fid(18),pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.fid(141),pg_temp.fid(1),pg_temp.fid(140),1,'Current month payroll',600,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),1,31,0,date '2026-10-01',
  'agreed','fixed','net',600,0,0,'fixed','Open period reporting issue test',pg_temp.fid(10));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(150),jsonb_build_object('direction','outgoing','amount','600','currency','UAH',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),
  'description','October employee payroll','dueDate',date '2026-10-31','expectedDate',date '2026-10-31',
  'commitment','agreed','certainty','fixed','established',true));
reset role;
insert into public.finance_obligations(id,studio_id,schedule_id,terms_id,kind,employee_id,employee_name,period_start,period_end,created_by)
values(pg_temp.fid(19),pg_temp.fid(1),pg_temp.fid(140),pg_temp.fid(141),'payroll',pg_temp.fid(18),'Open-month employee',date '2026-10-01',date '2026-10-31',pg_temp.fid(10));
insert into public.finance_obligation_items(studio_id,obligation_id,expected_item_id,component)
select pg_temp.fid(1),pg_temp.fid(19),result_id,'payout' from public.finance_planning_requests
where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(150);
insert into public.work_log_days(studio_id,user_id,work_date)
select pg_temp.fid(1),pg_temp.fid(18),d::date from generate_series(date '2026-10-01',date '2026-10-08',interval '1 day') d
where extract(isodow from d)<=5;
insert into public.work_log_entries(id,studio_id,user_id,work_date,activity_kind,task_id,minutes)
select gen_random_uuid(),pg_temp.fid(1),pg_temp.fid(18),d::date,'task',pg_temp.fid(44),60
from generate_series(date '2026-10-01',date '2026-10-08',interval '1 day') d where extract(isodow from d)<=5;
-- A completed short day carries two client projects and internal work. The next weekday is an explicit completed zero-hour day.
insert into public.work_log_entries(id,studio_id,user_id,work_date,activity_kind,task_id,minutes) values
(pg_temp.fid(50),pg_temp.fid(1),pg_temp.fid(11),date '2026-08-03','task',pg_temp.fid(40),120),
(pg_temp.fid(51),pg_temp.fid(1),pg_temp.fid(11),date '2026-08-03','task',pg_temp.fid(41),60),
(pg_temp.fid(52),pg_temp.fid(1),pg_temp.fid(11),date '2026-08-03','task',pg_temp.fid(42),30);
insert into public.work_log_entries(id,studio_id,user_id,work_date,activity_kind,task_id,minutes)
values(pg_temp.fid(53),pg_temp.fid(1),pg_temp.fid(12),date '2026-08-03','task',pg_temp.fid(43),45),
(pg_temp.fid(54),pg_temp.fid(1),pg_temp.fid(13),date '2026-08-03','task',pg_temp.fid(40),60);
insert into public.work_log_days(studio_id,user_id,work_date) values
(pg_temp.fid(1),pg_temp.fid(11),date '2026-08-03'),(pg_temp.fid(1),pg_temp.fid(11),date '2026-08-04'),
(pg_temp.fid(1),pg_temp.fid(12),date '2026-08-03'),(pg_temp.fid(1),pg_temp.fid(13),date '2026-08-03'),
(pg_temp.fid(1),pg_temp.fid(14),date '2026-08-03'),(pg_temp.fid(1),pg_temp.fid(15),date '2026-08-03'),
(pg_temp.fid(1),pg_temp.fid(17),date '2026-08-03');
insert into public.work_log_entries(id,studio_id,user_id,work_date,activity_kind,task_id,minutes)
values(pg_temp.fid(55),pg_temp.fid(1),pg_temp.fid(14),date '2026-08-03','task',pg_temp.fid(43),120);
insert into public.work_log_entries(id,studio_id,user_id,work_date,activity_kind,task_id,minutes)
values(pg_temp.fid(56),pg_temp.fid(1),pg_temp.fid(15),date '2026-08-03','task',pg_temp.fid(40),120);
insert into public.work_log_entries(id,studio_id,user_id,work_date,activity_kind,task_id,minutes)
values(pg_temp.fid(57),pg_temp.fid(1),pg_temp.fid(17),date '2026-08-03','task',pg_temp.fid(40),120);
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,false);
insert into public.time_off_requests(id,studio_id,user_id,request_type,start_date,end_date,all_day,private_note,status,reviewed_by,reviewed_at)
values(pg_temp.fid(60),pg_temp.fid(1),pg_temp.fid(11),'sick_leave',date '2026-08-05',date '2026-08-05',true,'Approved leave fixture','pending',null,null);
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,false);
insert into public.time_off_request_approvals(request_id,admin_user_id) values(pg_temp.fid(60),pg_temp.fid(10));
update public.time_off_requests set status='approved',reviewed_by=pg_temp.fid(10),reviewed_at=now() where id=pg_temp.fid(60);

select is((pg_temp.day_basis(11)->>'expectedMinutes')::integer,7560,'uses 21 employee six-hour weekdays, not the studio default');
select is((pg_temp.day_basis(11)->>'completedDays')::integer,2,'completed zero-hour submission counts as complete');
select is((pg_temp.day_basis(11)->>'requiredDays')::integer,20,'approved full-day leave is excluded from required reporting');
select is(jsonb_array_length(pg_temp.day_basis(11)->'missingDates'),18,'missing reports remain distinct from zero-hour and approved leave days');
select is(((pg_temp.day_basis(11)->'shares'->>pg_temp.fid(30)::text)::numeric),120::numeric,'short client work uses submitted minutes over actual daily capacity');
select is(((pg_temp.day_basis(11)->'shares'->>pg_temp.fid(31)::text)::numeric),60::numeric,'second client project receives only its own submitted share');
select ok(not ((pg_temp.day_basis(11)->'shares') ? pg_temp.fid(32)::text),'internal work is excluded from client-project attribution');
select ok(not ((pg_temp.day_basis(11)->'projectIds') ? pg_temp.fid(33)::text),'another employee missing reports do not implicate an unrelated project');
select is((pg_temp.day_basis(11)->'source'->>'knownCost')::numeric,1000::numeric,'automatic basis uses the existing known payroll source');
select is((pg_temp.day_basis(11)->'source'->>'sourceReady')::boolean,true,'fixed payroll payout is eligible without a second manual confirmation');
select is((pg_temp.day_basis(11)->'source'->>'deductionsStatus'),'fixed','confirmed zero deductions remain known zero');
select is((pg_temp.day_basis(11)->'source'->>'employerStatus'),'fixed','confirmed zero employer cost remains known zero');
select is((pg_temp.day_basis(12)->>'expectedMinutes')::integer,0,'missing employee capacity is not inferred from the studio default');
select ok((pg_temp.day_basis(12)->'issues') ? 'missing_capacity','missing employee capacity is reported as an exception');
select is((private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(16))->>'expectedMinutes')::integer,0,
  'an employee with no configured capacity has no invented allocation denominator');
select ok((private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(16))->'issues') ? 'missing_capacity',
  'missing capacity remains an explicit issue even when the denominator is zero');
select is((private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(17))->>'expectedMinutes')::integer,0,
  'zero scheduled weekdays safely produce a zero denominator');
select ok(not ((private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(17))->'issues') ? 'missing_capacity'),
  'an explicit zero-weekday schedule is distinct from missing capacity');
select set_config('test.automatic_labor_basis_16',private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(16))->>'digest',true);
select set_config('test.automatic_labor_basis_17',private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(17))->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(16),current_setting('test.automatic_labor_basis_16'),null,pg_temp.fid(110),false)$$,
  'known payroll with missing capacity is recognized at studio level with an exception');
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(17),current_setting('test.automatic_labor_basis_17'),null,pg_temp.fid(111),false)$$,
  'known payroll with zero eligible scheduled minutes processes without dividing by zero');
reset role;
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(16)),300::numeric,
  'missing-capacity payroll expense remains recognized exactly once');
select is((select coalesce(sum(i.amount),0) from public.finance_current_labor_allocations i join public.finance_labor_cost_pools p on p.id=i.entry_id
  where p.studio_id=pg_temp.fid(1) and p.obligation_id=pg_temp.fid(16)),0::numeric,'missing capacity never creates a project allocation');
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(17)),400::numeric,
  'zero-weekday payroll expense remains a studio-level cost');
select is((select coalesce(sum(i.amount),0) from public.finance_current_labor_allocations i join public.finance_labor_cost_pools p on p.id=i.entry_id
  where p.studio_id=pg_temp.fid(1) and p.obligation_id=pg_temp.fid(17)),0::numeric,'zero expected capacity does not allocate to client projects');
select is((select status from public.finance_labor_calculations where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(17) order by created_at desc limit 1),
  'applied','an explicit zero-work schedule is a safe complete period');
select ok(private.finance_labor_known_zero(jsonb_build_object('source',jsonb_build_object('sourceReady',true,'knownCost',0,'recognizedCost',0,'remainingCost',0,
  'employerStatus','fixed','deductionsStatus','fixed','basis','net'),'pools','[]'::jsonb)),
  'the known-zero predicate accepts a fully known, unrecognized zero-cost source');
select ok(not private.finance_labor_known_zero(jsonb_build_object('source',jsonb_build_object('sourceReady',true,'knownCost',0,'recognizedCost',0,'remainingCost',0,
  'employerStatus','unknown','deductionsStatus','fixed','basis','net'),'pools','[]'::jsonb)),
  'an unknown component cannot be treated as known zero');
select ok(not private.finance_labor_known_zero(jsonb_build_object('source',jsonb_build_object('sourceReady',true,'knownCost',0,'recognizedCost',0,'remainingCost',0,
  'employerStatus','fixed','deductionsStatus','fixed','basis','net'),'pools',jsonb_build_array(jsonb_build_object('id',pg_temp.fid(11))))),
  'an existing recognition pool prevents the source from being treated as known zero');
select is((pg_temp.day_basis(13)->'source'->>'knownCost')::numeric,500::numeric,'known payout cost remains available when other components are unknown');
select is((pg_temp.day_basis(13)->'source'->>'deductionsStatus'),'unknown','unknown deductions do not collapse into known zero');
select is((pg_temp.day_basis(13)->'source'->>'employerStatus'),'unknown','unknown employer cost does not collapse into known zero');
select is((pg_temp.day_basis(14)->>'expectedMinutes')::integer,7560,'membership beginning on the first day of the service month retains actual scheduled capacity');
select ok(not ((pg_temp.day_basis(14)->'issues') ? 'partial_employment'),'a first-of-month employee start is not mistaken for partial-month service');
select throws_like($$delete from public.tasks where id=pg_temp.fid(40)$$,'%work_log_entries%','a task with saved work-log history cannot be deleted');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(76),jsonb_build_object('obligationId',pg_temp.fid(13),
  'version',(select s->>'version' from jsonb_array_elements(public.get_finance_labor_sources(pg_temp.fid(1)))s where s->>'obligationId'=pg_temp.fid(13)::text),
  'reason','Preserved legacy manual payroll recognition'))$$,'existing manually confirmed labor pool remains available');
select lives_ok($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(77),
  (select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(76)),
  jsonb_build_object('revision',0,'items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','500')),'reason','Prior manual ownership'))$$,
  'legacy manual allocation remains valid');
reset role;
select set_config('test.automatic_labor_basis_13',pg_temp.day_basis(13)->>'digest',true);
set local role authenticated;
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(13),current_setting('test.automatic_labor_basis_13'),null,pg_temp.fid(78),false)$$,
  'automatic processing recognizes legacy manual ownership and skips duplicate attribution');
reset role;
select is((select count(*) from public.finance_labor_allocation_revisions r join public.finance_recognition_entries e on e.id=r.entry_id
  where e.studio_id=pg_temp.fid(1) and e.obligation_id=pg_temp.fid(13)),1::bigint,'manual-owned pool retains only its existing allocation revision');
select is((select status from public.finance_labor_calculations where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(13) order by created_at desc limit 1),
  'manual','manual-owned pool is clearly disclosed in automatic reporting');
update public.tasks set status='completed' where id=pg_temp.fid(43);
delete from public.project_members where project_id=pg_temp.fid(33) and user_id=pg_temp.fid(12);
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,false);
select ok(exists(select 1 from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.fid(1))->'projectIssues') issue
  where issue->>'employeeId'=pg_temp.fid(12)::text and issue->>'projectId'=pg_temp.fid(33)::text and issue->>'kind'='payroll_source'),
  'admin reporting finds a legacy payroll issue from logged project history when current membership is absent');
select ok(exists(select 1 from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.fid(1))->'projectIssues') issue
  where issue->>'employeeId'=pg_temp.fid(13)::text and issue->>'projectId'=pg_temp.fid(30)::text and issue->>'kind'='missing_payroll'),
  'a bonus-only record does not hide missing monthly salary coverage for client work');
select ok(exists(select 1 from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.fid(1))->'projectIssues') issue
  where issue->>'employeeId'=pg_temp.fid(17)::text and issue->>'projectId'=pg_temp.fid(30)::text and issue->>'kind'='missing_reports'),
  'actual logged project work scopes missing reports even without a membership grant');
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.fid(1))->'projectIssues') issue
  where issue->>'employeeId'=pg_temp.fid(17)::text and issue->>'projectId'=pg_temp.fid(31)::text and issue->>'kind'='missing_reports'),
  'missing report coverage does not leak to unrelated client projects');
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.fid(1))->'projectIssues') issue
  where issue->>'employeeId'=pg_temp.fid(18)::text and issue->>'projectId'=pg_temp.fid(30)::text and issue->>'kind'='payroll_source')
  and exists(select 1 from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.fid(1))->'automaticPeriods') period
    where period->>'obligationId'=pg_temp.fid(19)::text and period->>'status'='provisional'),
  'an eligible open-month payroll is provisional without a false unconfirmed-source error');
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.fid(1))->'projectIssues') issue
  where issue->>'employeeId'=pg_temp.fid(18)::text and issue->>'projectId'=pg_temp.fid(31)::text and issue->>'kind'='payroll_source'),
  'an open-month payroll issue does not contaminate an unrelated project');
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(19)),0::bigint,
  'open-month payroll remains unrecognized before period close');
select set_config('test.automatic_labor_basis_19',private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(19))->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(19),current_setting('test.automatic_labor_basis_19'),null,pg_temp.fid(151),false)$$,
  'automatic provisional calculation can run before the open service period ends');
reset role;
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(19)),0::bigint,
  'processing open-month payroll still creates no recognized labor expense');

-- A protected foreign-currency period must first save an exact FX preview. Approval
-- consumes that immutable quote even if the request later supplies another rate.
insert into public.finance_report_coverage(studio_id,project_id,month,reviewed_through,revenue_reviewed,direct_costs_reviewed,
  labor_reviewed,overhead_reviewed,revision,reason,created_by)
values(pg_temp.fid(1),pg_temp.fid(33),date '2026-08-01',date '2026-08-31',true,true,true,true,1,'Protected FX preview',pg_temp.fid(10));
select set_config('test.automatic_labor_basis_15',private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(15))->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select throws_like($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(15),current_setting('test.automatic_labor_basis_15'),null,pg_temp.fid(109),true)$$,
  '%finance_preview_required%','protected foreign-currency approval without an exact preview is rejected');
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(15),current_setting('test.automatic_labor_basis_15'),null,pg_temp.fid(106),false)$$,
  'automatic processing records an unvalued protected proposal when FX is missing');
reset role;
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(15)),0::bigint,
  'FX preview does not recognize payroll expense before approval');
select is((select status from public.finance_labor_calculations where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(15) order by created_at desc limit 1),
  'pending_review','protected foreign-currency preview remains pending');
select is((select snapshot->>'proposedRemainder' from public.finance_labor_calculations where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(15) order by created_at desc limit 1),
  null,'an FX-less protected proposal is visibly unresolved');
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(15),current_setting('test.automatic_labor_basis_15'),
  '{"rate":"1.234","source":"manual","effectiveDate":"2026-08-31"}',pg_temp.fid(107),false)$$,
  'a pending FX-less proposal retries with and preserves a valued historical FX preview');
reset role;
select is((select snapshot->'proposalFx'->>'rate' from public.finance_labor_calculations where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(15) order by created_at desc limit 1),
  '1.234','immutable proposal retains the exact FX rate');
select set_config('test.automatic_labor_basis_15',private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(15))->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(15),current_setting('test.automatic_labor_basis_15'),
  '{"rate":"2.000","source":"manual","effectiveDate":"2026-08-31"}',pg_temp.fid(108),true)$$,
  'approval applies the stored FX proposal even when a different rate is submitted');
reset role;
select is((select fx_rate from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(15)),1.234::numeric,
  'recognized foreign payroll uses the previewed FX rate');
select is((select reporting_amount from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(15)),1234::numeric,
  'recognized foreign payroll uses the previewed reporting value');
select is((select sum(i.amount) from public.finance_current_labor_allocations i join public.finance_labor_cost_pools p on p.id=i.entry_id
  where p.studio_id=pg_temp.fid(1) and p.obligation_id=pg_temp.fid(15) and i.project_id=pg_temp.fid(33)),19.58::numeric,
  'approval allocates the exact previewed value over actual expected capacity');

-- Payroll cost revisions use the existing guarded completion RPC. Positive deltas
-- add a cost pool; negative deltas remain visible until admin approval reverses
-- the old pools and recognizes the exact reduced source total.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(115),jsonb_build_object('obligationId',pg_temp.fid(18),
  'component','employer_cost','status','fixed','amount','100','revision',0,'reason','First confirmed employer cost'))$$,
  'the established payroll completion RPC confirms an unknown employer cost');
reset role;
select set_config('test.automatic_labor_basis_18',private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(18))->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(18),current_setting('test.automatic_labor_basis_18'),null,pg_temp.fid(116),false)$$,
  'confirmed payroll source is automatically recognized and attributed');
reset role;
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(18)),500::numeric,
  'initial known payroll cost is exactly payout plus confirmed employer cost');
select is((select sum(i.amount) from public.finance_current_labor_allocations i join public.finance_labor_cost_pools p on p.id=i.entry_id
  where p.studio_id=pg_temp.fid(1) and p.obligation_id=pg_temp.fid(18)),7.93::numeric,'initial client allocation uses expected capacity');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(117),jsonb_build_object('obligationId',pg_temp.fid(18),
  'component','employer_cost','status','fixed','amount','150','revision',1,'reason','Upward payroll correction'))$$,
  'a later positive payroll cost revision is recorded through the guarded RPC');
reset role;
select set_config('test.automatic_labor_basis_18',private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(18))->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(18),current_setting('test.automatic_labor_basis_18'),null,pg_temp.fid(118),false)$$,
  'positive confirmed payroll delta is recognized automatically');
reset role;
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(18) and kind='recognition'),2::bigint,
  'positive payroll correction creates a separate additional recognition pool');
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(18)),550::numeric,
  'positive payroll correction increases recognized cost only to the confirmed total');
select is((select sum(i.amount) from public.finance_current_labor_allocations i join public.finance_labor_cost_pools p on p.id=i.entry_id
  where p.studio_id=pg_temp.fid(1) and p.obligation_id=pg_temp.fid(18)),8.72::numeric,'allocation across both cost pools remains within confirmed payroll');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(119),jsonb_build_object('obligationId',pg_temp.fid(18),
  'component','employer_cost','status','fixed','amount','20','revision',2,'reason','Downward payroll correction'))$$,
  'a payroll cost reduction is appended through the existing guarded RPC');
reset role;
select set_config('test.automatic_labor_basis_18',private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(18))->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(18),current_setting('test.automatic_labor_basis_18'),null,pg_temp.fid(120),false)$$,
  'automatic processing protects existing history while a lower payroll total awaits approval');
reset role;
select is((select status from public.finance_labor_calculations where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(18) order by created_at desc limit 1),
  'exception','a negative remaining payroll correction requires administrator approval');
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(18)),550::numeric,
  'pending payroll reduction leaves existing studio expense unchanged');
select is((select count(*) from public.finance_labor_allocation_revisions r join public.finance_recognition_entries e on e.id=r.entry_id
  where r.studio_id=pg_temp.fid(1) and e.obligation_id=pg_temp.fid(18)),2::bigint,'pending reduction preserves prior project allocation revisions');
select set_config('test.automatic_labor_basis_18',private.finance_automatic_labor_basis(pg_temp.fid(1),pg_temp.fid(18))->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(18),current_setting('test.automatic_labor_basis_18'),null,pg_temp.fid(121),true)$$,
  'administrator approval applies the payroll reduction without deleting prior history');
reset role;
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(18)),420::numeric,
  'approved correction leaves the studio expense at the revised confirmed payroll total');
select is((select sum(i.amount) from public.finance_current_labor_allocations i join public.finance_labor_cost_pools p on p.id=i.entry_id
  where p.studio_id=pg_temp.fid(1) and p.obligation_id=pg_temp.fid(18)),6.66::numeric,'approved labor attribution is capped at the corrected payroll total');
select is((select count(*) from public.finance_labor_allocation_revisions r join public.finance_recognition_entries e on e.id=r.entry_id
  where r.studio_id=pg_temp.fid(1) and e.obligation_id=pg_temp.fid(18)),5::bigint,'approved correction appends allocation revisions and retains the original two');

select set_config('test.automatic_labor_basis_11',pg_temp.day_basis(11)->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(11),current_setting('test.automatic_labor_basis_11'),null,pg_temp.fid(72),false)$$,
  'closed confirmed payroll is recognized and attributed automatically');
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(11),current_setting('test.automatic_labor_basis_11'),null,pg_temp.fid(72),false)$$,
  'an identical processing retry is idempotent');
reset role;
select is((select amount from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(11)),1000::numeric,
  'automatic attribution reuses exactly one existing studio labor expense');
select ok((select sum(amount)<=1000 from public.finance_current_labor_allocations where studio_id=pg_temp.fid(1)
  and entry_id in (select id from public.finance_labor_cost_pools where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(11))),
  'project allocation never exceeds the recognized payroll cost');
select ok((select sum(amount)>0 and sum(amount)<1000 from public.finance_current_labor_allocations where studio_id=pg_temp.fid(1)
  and entry_id in (select id from public.finance_labor_cost_pools where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(11))),
  'unused capacity and internal work remain at studio level');
select is((select count(*) from public.finance_labor_calculations where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(11)
  and status='applied'),1::bigint,'automatic processing stores an auditable calculation snapshot');

-- A later edit to a reviewed project period proposes a correction and preserves the saved allocation until approval.
insert into public.finance_report_coverage(studio_id,project_id,month,reviewed_through,revenue_reviewed,direct_costs_reviewed,
  labor_reviewed,overhead_reviewed,revision,reason,created_by)
values(pg_temp.fid(1),pg_temp.fid(30),date '2026-08-01',date '2026-08-31',true,true,true,true,1,'Protected automatic labor period',pg_temp.fid(10));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select public.save_daily_work_log(date '2026-08-03',jsonb_build_array(
  jsonb_build_object('activity_kind','task','task_id',pg_temp.fid(40),'minutes',180),
  jsonb_build_object('activity_kind','task','task_id',pg_temp.fid(41),'minutes',60),
  jsonb_build_object('activity_kind','task','task_id',pg_temp.fid(42),'minutes',30)));
reset role;
select set_config('test.automatic_labor_basis_11',pg_temp.day_basis(11)->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(11),current_setting('test.automatic_labor_basis_11'),null,pg_temp.fid(73),false)$$,
  'retroactive work-log correction is recorded as a pending reviewed-period proposal');
reset role;
select is((select count(*) from public.finance_labor_calculations where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.fid(11)
  and status='pending_review'),1::bigint,'reviewed-period correction requires contextual approval');
select is((select count(*) from public.finance_labor_allocation_revisions r join public.finance_labor_cost_pools p on p.id=r.entry_id
  where r.studio_id=pg_temp.fid(1) and p.obligation_id=pg_temp.fid(11)),1::bigint,'proposed correction does not overwrite or append project allocation history');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.fid(1),pg_temp.fid(11),current_setting('test.automatic_labor_basis_11'),null,pg_temp.fid(74),true)$$,
  'admin approval appends the protected correction');
reset role;
select is((select count(*) from public.finance_labor_allocation_revisions r join public.finance_labor_cost_pools p on p.id=r.entry_id
  where r.studio_id=pg_temp.fid(1) and p.obligation_id=pg_temp.fid(11)),2::bigint,'approved correction preserves the original allocation revision');

-- Finance-only history is hidden from employees, while an employee can read their own work-log revisions.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select is((select count(*) from public.finance_labor_automation),0::bigint,'employee cannot read financial automation configuration');
select is((select count(*) from public.finance_labor_capacity_revisions),0::bigint,'employee cannot read payroll capacity history');
select is((select count(*) from public.finance_labor_calculations),0::bigint,'employee cannot read payroll attribution calculations');
select ok((select count(*)>0 from public.work_log_day_revisions where user_id=pg_temp.fid(11)),'employee can inspect own immutable work-log revisions');
select is((select count(*) from public.work_log_day_revisions where user_id=pg_temp.fid(12)),0::bigint,'employee cannot inspect another employee work-log revisions');
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select is((select count(*) from public.finance_labor_automation),1::bigint,'finance admin can inspect automation configuration');
select * from finish();
rollback;
