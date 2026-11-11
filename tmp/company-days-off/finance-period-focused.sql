begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$select ('7b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month_start(delta integer default 0) returns date language sql stable as $$
  select (date_trunc('month',pg_temp.today()::timestamp)+make_interval(months=>delta))::date
$$;
select is((private.finance_provisional_labor_values(jsonb_build_object('source',jsonb_build_object('sourceReady',true,
  'knownCost',0,'recognizedCost',0,'remainingCost',0,'basis','net','deductionsStatus','fixed','employerStatus','fixed'),
  'pools','[]'::jsonb,'manual',false,'issues',jsonb_build_array('missing_reports'),'reportingCurrency','UAH',
  'proposedAllocations','[]'::jsonb,'proposedRemainder','0.00','shares','{}'::jsonb,'days','[]'::jsonb,
  'expectedMinutes',0,'accruedFrom',pg_temp.today(),'asOf',pg_temp.today()))->>'provisionalRemainder'),
  '0.00','a genuinely known zero payroll amount stays a known provisional zero despite missing reports');

-- Elapsed salary is independent of Worklog; today still needs submission or leave.
select is((private.finance_provisional_labor_values(jsonb_build_object(
  'source',jsonb_build_object('sourceReady',true,'knownCost','1000','recognizedCost','0','remainingCost','1000','basis','net','deductionsStatus','fixed','employerStatus','fixed'),
  'pools','[]'::jsonb,'manual',false,'issues',jsonb_build_array('missing_reports'),'reportingCurrency','UAH',
  'proposedAllocations',jsonb_build_array(jsonb_build_object('projectId',pg_temp.pid(30),'amount','100')),'proposedRemainder','900',
  'shares',jsonb_build_object(pg_temp.pid(30)::text,100),'expectedMinutes',1000,'accruedFrom',pg_temp.today()-2,'asOf',pg_temp.today(),
  'days',jsonb_build_array(
    jsonb_build_object('date',pg_temp.today()-3,'submitted',true,'employed',true,'scheduled',200,'absence',0,'entries','[]'::jsonb),
    jsonb_build_object('date',pg_temp.today()-2,'submitted',true,'employed',true,'scheduled',200,'absence',0,'loggedMinutes',100,
      'entries',jsonb_build_array(jsonb_build_object('projectId',pg_temp.pid(30),'minutes',100))),
    jsonb_build_object('date',pg_temp.today()-1,'submitted',false,'employed',true,'scheduled',200,'absence',100,'entries','[]'::jsonb),
    jsonb_build_object('date',pg_temp.today(),'submitted',false,'employed',true,'scheduled',200,'absence',0,'entries','[]'::jsonb),
    jsonb_build_object('date',pg_temp.today()+1,'submitted',true,'employed',true,'scheduled',200,'absence',0,'entries','[]'::jsonb)
  )))->>'provisionalRemainder')::numeric,300::numeric,'elapsed missing reports retain salary; future and unsubmitted current-day capacity are excluded');

-- Setup changes use the same explicit read-only preview as the application.
create function pg_temp.previewed_capacity(input jsonb) returns jsonb language sql stable as $$
  select input||jsonb_build_object('previewDigest',public.preview_finance_labor_activation(pg_temp.pid(1),input-'previewDigest')->>'digest')
$$;

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
update public.finance_settings set recognition_start_month=pg_temp.month_start(-3) where studio_id=pg_temp.pid(1);

insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
values(pg_temp.pid(80),pg_temp.pid(1),'payroll',pg_temp.pid(11),pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.pid(81),pg_temp.pid(1),pg_temp.pid(80),1,'Known provisional salary',1000,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='salary'),1,31,0,pg_temp.month_start(-2),
  'agreed','fixed','net',1000,0,0,'fixed','Provisional labor test source',pg_temp.pid(10));
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

-- Current-month fixtures distinguish work before activation, complete zero-hour
-- reporting, an absent report, approved leave, and work reported today.
insert into public.work_log_entries(id,studio_id,user_id,work_date,activity_kind,task_id,minutes) values
(pg_temp.pid(50),pg_temp.pid(1),pg_temp.pid(11),pg_temp.today()-5,'task',pg_temp.pid(40),120),
(pg_temp.pid(53),pg_temp.pid(1),pg_temp.pid(11),pg_temp.today()-4,'task',pg_temp.pid(40),120),
(pg_temp.pid(51),pg_temp.pid(1),pg_temp.pid(11),pg_temp.today(),'task',pg_temp.pid(41),60),
(pg_temp.pid(54),pg_temp.pid(1),pg_temp.pid(11),pg_temp.today(),'task',pg_temp.pid(40),180),
(pg_temp.pid(55),pg_temp.pid(1),pg_temp.pid(11),pg_temp.today(),'task',pg_temp.pid(42),180),
(pg_temp.pid(52),pg_temp.pid(1),pg_temp.pid(11),pg_temp.month_start(-2)+2,'task',pg_temp.pid(40),120);
insert into public.work_log_days(studio_id,user_id,work_date) values
(pg_temp.pid(1),pg_temp.pid(11),pg_temp.today()-5),
(pg_temp.pid(1),pg_temp.pid(11),pg_temp.today()-4),
(pg_temp.pid(1),pg_temp.pid(11),pg_temp.today()-1),
(pg_temp.pid(1),pg_temp.pid(11),pg_temp.today()),
(pg_temp.pid(1),pg_temp.pid(11),pg_temp.month_start(-2)+2);
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
insert into public.time_off_requests(id,studio_id,user_id,request_type,start_date,end_date,all_day,private_note,status,reviewed_by,reviewed_at)
values(pg_temp.pid(60),pg_temp.pid(1),pg_temp.pid(11),'sick_leave',pg_temp.today()-2,pg_temp.today()-2,true,'Approved leave',
  'pending',null,null);
reset role;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
insert into public.time_off_request_approvals(request_id,admin_user_id) values(pg_temp.pid(60),pg_temp.pid(10));
update public.time_off_requests set status='approved',reviewed_by=pg_temp.pid(10),reviewed_at=now() where id=pg_temp.pid(60);

-- Initial activation uses today's product default, while the studio's capacity
-- starts on the first day of this month so the complete monthly denominator exists.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select lives_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(101),pg_temp.previewed_capacity(jsonb_build_object(
  'effectiveFrom',pg_temp.today(),'capacityFrom',pg_temp.month_start(),'dailyMinutes',360,'weekdays',jsonb_build_array(1,2,3,4,5,6,7),
  'internalProjectId',pg_temp.pid(32),'internalDesignationConfirmed',true)))$$,'initial activation accepts the current date');
reset role;
select is((select starts_on from public.finance_labor_automation where studio_id=pg_temp.pid(1)),pg_temp.today(),
  'activation defaults to the supplied current date');
select is((select effective_from from public.finance_labor_capacity_revisions where studio_id=pg_temp.pid(1) and employee_id is null order by effective_from limit 1),pg_temp.month_start(),
  'initial capacity is effective from month start to cover the full denominator');

-- A company break stays one row but excludes every covered day in both live helpers.
insert into public.studio_days_off(studio_id,date,end_date,name,created_by)
values(pg_temp.pid(1),pg_temp.month_start()+2,pg_temp.month_start()+4,'Period capacity test',pg_temp.pid(10));
select is((private.finance_automatic_labor_basis_before_source_review(pg_temp.pid(1),pg_temp.pid(21),null)->>'expectedMinutes')::integer,
  (pg_temp.month_start(1)-pg_temp.month_start()-3)*360,'automatic labor excludes every inclusive date of a company period');
select is((private.finance_labor_period_basis(pg_temp.pid(1),
  (select o from public.finance_obligations o where o.id=pg_temp.pid(21)),private.finance_labor_configuration(pg_temp.pid(1)),
  private.finance_labor_source(pg_temp.pid(1),pg_temp.pid(21)),null,'UAH',null)->>'expectedMinutes')::integer,
  (pg_temp.month_start(1)-pg_temp.month_start()-3)*360,'reporting labor excludes the same entire company period');
select is((select count(*) from jsonb_array_elements(private.finance_automatic_labor_basis_before_source_review(pg_temp.pid(1),pg_temp.pid(21),null)->'days') d
  where (d->>'date')::date between pg_temp.month_start()+2 and pg_temp.month_start()+4 and (d->>'scheduled')::integer=0),3::bigint,
  'start, middle and last period date all have zero scheduled minutes');
delete from public.studio_days_off where studio_id=pg_temp.pid(1) and name='Period capacity test';


select * from finish();
rollback;
