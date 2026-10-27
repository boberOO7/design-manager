begin;
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

-- The first live-period calculation is provisional only: it contributes no
-- recognized studio expense or saved allocation revision.
select set_config('test.provisional_open_digest',private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->>'digest',true);
select is((private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->>'expectedMinutes')::integer,
  (pg_temp.month_start(1)-pg_temp.month_start())*360,'open-period denominator covers the full scheduled month');
select is(((private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'shares'->>pg_temp.pid(30)::text)::numeric),
  360::numeric*180/420,'preactivation work is excluded while current project work is capped by actual logged minutes');
select is(((private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'shares'->>pg_temp.pid(31)::text)::numeric),
  360::numeric*60/420,'multiple client projects receive their expected-capacity shares');
select ok(not ((private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'shares') ? pg_temp.pid(32)::text),
  'internal work remains studio-level and is excluded from client shares');
select ok(((private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'shares'->>pg_temp.pid(30)::text)::numeric
  +(private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'shares'->>pg_temp.pid(31)::text)::numeric)<360,
  'project shares never exceed the daily scheduled capacity during overtime');
select is(jsonb_array_length(private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'missingDates'),0,
  'reports before activation do not create current-period coverage gaps');
select is((private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->>'completedDays')::integer,0,
  'reports before activation do not count as completed current-period days');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.pid(1),pg_temp.pid(21),current_setting('test.provisional_open_digest'),null,pg_temp.pid(102),false)$$,
  'an eligible open month creates a provisional attribution calculation');
reset role;
select is((select status from public.finance_labor_calculations where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(21) order by created_at desc limit 1),
  'provisional','open payroll is labelled provisional');
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(21)),0::bigint,
  'provisional attribution creates no recognized studio labor expense');
select is((select count(*) from public.finance_labor_allocation_revisions r join public.finance_recognition_entries e on e.id=r.entry_id
  where e.studio_id=pg_temp.pid(1) and e.obligation_id=pg_temp.pid(21)),0::bigint,
  'provisional attribution creates no saved project allocation history');
select is(((select p->'provisionalAllocations'->0->>'amount' from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.pid(1))->'automaticPeriods') p
  where p->>'obligationId'=pg_temp.pid(21)::text)::numeric),
  trunc(1000::numeric*(360::numeric*180/420)/((pg_temp.month_start(1)-pg_temp.month_start())*360),2),
  'provisional client allocation is the exact known cost share over the full-month denominator');
select is(((select (p->>'provisionalRemainder')::numeric from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.pid(1))->'automaticPeriods') p
  where p->>'obligationId'=pg_temp.pid(21)::text)),
  trunc(1000::numeric*360/((pg_temp.month_start(1)-pg_temp.month_start())*360),2)
    -trunc(1000::numeric*(360::numeric*180/420)/((pg_temp.month_start(1)-pg_temp.month_start())*360),2)
    -trunc(1000::numeric*(360::numeric*60/420)/((pg_temp.month_start(1)-pg_temp.month_start())*360),2),
  'provisional remainder includes only incurred daily capacity, excluding future and preactivation payroll');
select is((select sum((item->>'amount')::numeric) from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.pid(1))->'automaticPeriods') p
  cross join lateral jsonb_array_elements(p->'provisionalDailyAllocations') item where p->>'obligationId'=pg_temp.pid(21)::text
    and item->>'projectId'=pg_temp.pid(30)::text),
  trunc(1000::numeric*(360::numeric*180/420)/((pg_temp.month_start(1)-pg_temp.month_start())*360),2),
  'daily provisional amounts sum exactly to the aggregate per-project amount');
-- Taskless internal time must normalize the dated values used by Project Result
-- exactly as it normalizes the whole-period allocation proposal.
savepoint internal_daily;
update public.studio_members set system_role='admin' where studio_id=pg_temp.pid(1) and user_id=pg_temp.pid(11);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
select public.save_daily_work_log(pg_temp.today(),jsonb_build_array(
  jsonb_build_object('activity_kind','task','task_id',pg_temp.pid(40),'minutes',360),
  jsonb_build_object('activity_kind','internal','internal_activity_type','team_walkthrough','minutes',360)));
reset role;
select is((select (d->>'loggedMinutes')::integer from jsonb_array_elements(private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'days') d
  where d->>'date'=pg_temp.today()::text),720,'daily evidence includes taskless internal minutes');
select is((select sum((i->>'amount')::numeric) from jsonb_array_elements(private.finance_provisional_labor_values(
  private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21)))->'provisionalDailyAllocations') i),
  trunc(1000::numeric*180/((pg_temp.month_start(1)-pg_temp.month_start())*360),2),
  'daily project cost leaves the internal half of overtime at studio level');
select is((select sum((i->>'amount')::numeric) from jsonb_array_elements(private.finance_provisional_labor_values(
  private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21)))->'provisionalDailyAllocations') i),
  (private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'proposedAllocations'->0->>'amount')::numeric,
  'dated provisional values equal the finalization proposal after an internal-work correction');
select ok(exists(select 1 from jsonb_array_elements(public.prepare_finance_automatic_labor(pg_temp.pid(1))) c
  where c->>'obligationId'=pg_temp.pid(21)::text),'corrected internal work is rediscovered for automatic refresh');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
select public.save_daily_work_log(pg_temp.today(),jsonb_build_array(
  jsonb_build_object('activity_kind','task','task_id',pg_temp.pid(40),'minutes',120),
  jsonb_build_object('activity_kind','internal','internal_activity_type','team_walkthrough','minutes',120)));
reset role;
select is((select sum((i->>'amount')::numeric) from jsonb_array_elements(private.finance_provisional_labor_values(
  private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21)))->'provisionalDailyAllocations') i),
  trunc(1000::numeric*120/((pg_temp.month_start(1)-pg_temp.month_start())*360),2),
  'an under-capacity report attributes only reported project work without redistributing unused salary');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
select public.save_daily_work_log(pg_temp.today(),jsonb_build_array(
  jsonb_build_object('activity_kind','internal','internal_activity_type','team_walkthrough','minutes',360)));
reset role;
select is(jsonb_array_length(private.finance_provisional_labor_values(private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21)))->'provisionalDailyAllocations'),
  0,'an internal-only corrected report attributes no project labor');
rollback to internal_daily;

select set_config('test.foreign_open_digest',private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(23))->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.pid(1),pg_temp.pid(23),current_setting('test.foreign_open_digest'),
  jsonb_build_object('rate','1.500','source','manual','effectiveDate',pg_temp.today()),pg_temp.pid(111),false)$$,
  'open foreign payroll stores a provisional valuation at the current as-of date');
reset role;
select is((select snapshot->'provisionalFx'->>'effectiveDate' from public.finance_labor_calculations where studio_id=pg_temp.pid(1)
  and obligation_id=pg_temp.pid(23) order by created_at desc limit 1),pg_temp.today()::text,
  'open provisional FX is dated at the current as-of date, not the future service-period end');
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(23)),0::bigint,
  'open foreign provisional valuation does not recognize payroll expense');
select set_config('test.capacity_preview',public.preview_finance_labor_activation(pg_temp.pid(1),jsonb_build_object(
  'effectiveFrom',pg_temp.today()-1,'employeeId',pg_temp.pid(11),'historicalCapacityConfirmed',true,'dailyMinutes',240,
  'weekdays',jsonb_build_array(1,2,3,4,5,6,7)))->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select lives_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(110),jsonb_build_object(
  'effectiveFrom',pg_temp.today()-1,'employeeId',pg_temp.pid(11),'historicalCapacityConfirmed',true,'dailyMinutes',240,
  'weekdays',jsonb_build_array(1,2,3,4,5,6,7),'previewDigest',current_setting('test.capacity_preview')))$$,
  'a previewed employee capacity change is recorded');
reset role;
select is((select effective_from from public.finance_labor_capacity_revisions where studio_id=pg_temp.pid(1) and employee_id=pg_temp.pid(11)
  order by effective_from desc limit 1),pg_temp.today()-1,'employee capacity changes take effect on their selected date');
select is((private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->>'expectedMinutes')::integer,
  (pg_temp.today()-1-pg_temp.month_start())*360+(pg_temp.month_start(1)-(pg_temp.today()-1))*240,
  'a dated capacity change recalculates capacity from its effective date across the full-period denominator');

-- A contextual activation change is preview-bound and makes previously
-- preactivation logs eligible without shortening the monthly denominator.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select throws_like($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(103),jsonb_build_object(
  'effectiveFrom',pg_temp.today()-4,'historicalCapacityConfirmed',true,'dailyMinutes',360,'weekdays',jsonb_build_array(1,2,3,4,5,6,7),
  'internalProjectId',pg_temp.pid(32),'internalDesignationConfirmed',true,'changeActivation',true))$$,
  '%finance_preview_required%','a backdated activation change requires a current preview digest');
select set_config('test.provisional_activation_preview',public.preview_finance_labor_activation(pg_temp.pid(1),jsonb_build_object(
  'effectiveFrom',pg_temp.today()-4,'historicalCapacityConfirmed',true,'dailyMinutes',360,'weekdays',jsonb_build_array(1,2,3,4,5,6,7),
  'internalProjectId',pg_temp.pid(32),'internalDesignationConfirmed',true,'changeActivation',true))->>'digest',true);
select lives_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(104),jsonb_build_object(
  'effectiveFrom',pg_temp.today()-4,'historicalCapacityConfirmed',true,'dailyMinutes',360,'weekdays',jsonb_build_array(1,2,3,4,5,6,7),
  'internalProjectId',pg_temp.pid(32),'internalDesignationConfirmed',true,'changeActivation',true,
  'previewDigest',current_setting('test.provisional_activation_preview')))$$,'a matching activation preview permits the requested date change');
reset role;
select ok((private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'missingDates') ? (pg_temp.today()-3)::text,
  'a missing work report after activation remains visible');
select ok(not ((private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'missingDates') ? (pg_temp.today()-2)::text),
  'approved leave is not a missing report');
select set_config('test.cost_before_worklog',private.finance_provisional_labor_values(private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21)))::text,true);
select ok((select (d->>'amount')::numeric>0 from jsonb_array_elements(current_setting('test.cost_before_worklog')::jsonb->'provisionalDailyRemainders') d
  where d->>'date'=(pg_temp.today()-3)::text) and abs(
  (select (d->>'amount')::numeric from jsonb_array_elements(current_setting('test.cost_before_worklog')::jsonb->'provisionalDailyRemainders') d where d->>'date'=(pg_temp.today()-3)::text)
  -(select (d->>'amount')::numeric from jsonb_array_elements(current_setting('test.cost_before_worklog')::jsonb->'provisionalDailyRemainders') d where d->>'date'=(pg_temp.today()-2)::text))<=0.01,
  'missing Worklog and approved leave both retain studio salary with cumulative minor-unit rounding');
select is((private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->>'completedDays')::integer,2,
  'a zero-hour completed day counts while approved leave is excluded');
-- Completing a previously missing day changes the proposal but still does not
-- write recognized costs.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
select lives_ok($$select public.save_daily_work_log(pg_temp.today()-3,jsonb_build_array(
  jsonb_build_object('activity_kind','task','task_id',pg_temp.pid(40),'minutes',120)))$$,
  'a backdated correction can complete the missing live-period report');
reset role;
select set_config('test.provisional_corrected_digest',private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->>'digest',true);
select ok(not ((private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'missingDates') ? (pg_temp.today()-3)::text),
  'corrected work log removes the missing-date exception');
select is((select sum((d->>'amount')::numeric) from jsonb_array_elements(current_setting('test.cost_before_worklog')::jsonb->'provisionalDailyRemainders') d)
    +(select sum((d->>'amount')::numeric) from jsonb_array_elements(current_setting('test.cost_before_worklog')::jsonb->'provisionalDailyAllocations') d),
  (select sum((d->>'amount')::numeric) from jsonb_array_elements(private.finance_provisional_labor_values(private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21)))->'provisionalDailyRemainders') d)
    +(select sum((d->>'amount')::numeric) from jsonb_array_elements(private.finance_provisional_labor_values(private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21)))->'provisionalDailyAllocations') d),
  'submitting a missing elapsed day reallocates cost without increasing total studio labor');
select is(((private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'proposedAllocations'->0->>'amount')::numeric),
  trunc(1000::numeric*(private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->'shares'->>pg_temp.pid(30)::text)::numeric
    /(private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(21))->>'expectedMinutes')::numeric,2),
  'a retroactive report correction adds exactly its capped project share to the provisional value');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.pid(1),pg_temp.pid(21),current_setting('test.provisional_corrected_digest'),null,pg_temp.pid(105),false)$$,
  'a corrected live period recalculates its provisional estimate');
reset role;
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(21)),0::bigint,
  'recalculation and backdated work corrections remain outside the studio P&L');

-- Finalize a closed period, then move activation earlier. Reprocessing proposes
-- a protected correction while preserving the recognized expense and revisions.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select set_config('test.closed_activation_preview',public.preview_finance_labor_activation(pg_temp.pid(1),jsonb_build_object(
  'effectiveFrom',pg_temp.month_start(-2)+5,'capacityFrom',pg_temp.month_start(-2),'dailyMinutes',360,'weekdays',jsonb_build_array(1,2,3,4,5,6,7),
  'internalProjectId',pg_temp.pid(32),'internalDesignationConfirmed',true,'changeActivation',true))->>'digest',true);
select lives_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(106),jsonb_build_object(
  'effectiveFrom',pg_temp.month_start(-2)+5,'capacityFrom',pg_temp.month_start(-2),'dailyMinutes',360,'weekdays',jsonb_build_array(1,2,3,4,5,6,7),
  'internalProjectId',pg_temp.pid(32),'internalDesignationConfirmed',true,'changeActivation',true,
  'previewDigest',current_setting('test.closed_activation_preview')))$$,'preview activates the closed test period');
reset role;
select set_config('test.foreign_closed_digest',private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(24))->>'digest',true);
insert into public.finance_labor_calculations(studio_id,obligation_id,digest,status,snapshot,created_by,initiated_by)
select pg_temp.pid(1),pg_temp.pid(24),basis->>'digest','provisional',basis||jsonb_build_object('proposalFx',fx,'provisionalFx',fx),pg_temp.pid(10),'automatic'
from (select private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(24)) basis,
  jsonb_build_object('rate','1.500','source','manual','effectiveDate',pg_temp.today()) fx) seeded;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.pid(1),pg_temp.pid(24),current_setting('test.foreign_closed_digest'),
  jsonb_build_object('rate','1.234','source','manual','effectiveDate',pg_temp.month_start(-1)-1),pg_temp.pid(112),false)$$,
  'closed foreign payroll values with the service-period-end historical FX quote');
reset role;
select is((select fx_rate from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(24)),1.234::numeric,
  'closed recognition ignores the prior provisional FX rate');
select is((select fx_effective_date from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(24)),
  pg_temp.month_start(-1)-1,'closed recognition uses the service-period end as its FX date');
-- The first closed month retains its complete denominator but only attributes
-- a completed day after activation, including taskless internal work in the cap.
insert into public.work_log_entries(id,studio_id,user_id,work_date,activity_kind,task_id,internal_activity_type,minutes) values
(pg_temp.pid(56),pg_temp.pid(1),pg_temp.pid(11),pg_temp.month_start(-2)+6,'task',pg_temp.pid(40),null,360),
(pg_temp.pid(57),pg_temp.pid(1),pg_temp.pid(11),pg_temp.month_start(-2)+6,'internal',null,'team_walkthrough',360);
insert into public.work_log_days(studio_id,user_id,work_date) values(pg_temp.pid(1),pg_temp.pid(11),pg_temp.month_start(-2)+6);
select set_config('test.closed_pending', (select p::text from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.pid(1))->'automaticPeriods') p
  where p->>'obligationId'=pg_temp.pid(22)::text),true);
select is(current_setting('test.closed_pending')::jsonb->>'status','pending','displaying closed provisional cost preserves the worker status');
select is((current_setting('test.closed_pending')::jsonb->>'provisionalRemainder')::numeric
  +(select coalesce(sum((a->>'amount')::numeric),0) from jsonb_array_elements(current_setting('test.closed_pending')::jsonb->'provisionalAllocations') a),
  1000::numeric,'closed pending payroll preserves all supported salary before recognition');
select is((select sum((a->>'amount')::numeric) from jsonb_array_elements(current_setting('test.closed_pending')::jsonb->'provisionalDailyAllocations') a),
  trunc(1000::numeric*180/((pg_temp.month_start(-1)-pg_temp.month_start(-2))*360),2),
  'closed provisional project shares reuse actual Worklog and the internal-work denominator');
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22)),0::bigint,
  'reading a closed provisional cost creates no recognition entries');
savepoint recognition_boundary;
update public.finance_settings set recognition_start_month=pg_temp.month_start(-1) where studio_id=pg_temp.pid(1);
select ok((select p->'provisionalRemainder' is null from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.pid(1))->'automaticPeriods') p
  where p->>'obligationId'=pg_temp.pid(22)::text),'closed provisional costs cannot bypass the recognition boundary');
rollback to recognition_boundary;
select set_config('test.closed_digest',private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(22))->>'digest',true);
insert into public.finance_labor_calculations(studio_id,obligation_id,digest,status,snapshot,created_by,initiated_by)
select pg_temp.pid(1),pg_temp.pid(22),basis->>'digest','provisional',basis||private.finance_provisional_labor_values(basis),pg_temp.pid(10),'automatic'
from (select private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(22)) basis) seeded;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.pid(1),pg_temp.pid(22),
  current_setting('test.closed_digest'),null,pg_temp.pid(107),false)$$,
  'closed service-period payroll still follows the guarded recognition path');
reset role;
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22)),1000::numeric,
  'closed payroll creates exactly its eligible recognized cost');
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22)),1::bigint,
  'closing a seeded provisional period recognizes the monthly cost exactly once');
select is((select p->>'status' from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.pid(1))->'automaticPeriods') p
  where p->>'obligationId'=pg_temp.pid(22)::text),'applied','closed reporting replaces provisional status with recognized attribution');
select ok((select p->'provisionalAllocations' is null from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.pid(1))->'automaticPeriods') p
  where p->>'obligationId'=pg_temp.pid(22)::text),'closed periods no longer present provisional project amounts');
select is((select sum(a.amount) from public.finance_current_labor_allocations a join public.finance_recognition_entries e on e.id=a.entry_id
  where e.studio_id=pg_temp.pid(1) and e.obligation_id=pg_temp.pid(22)),
  trunc(1000::numeric*180/((pg_temp.month_start(-1)-pg_temp.month_start(-2))*360),2),
  'partial first-month finalization allocates only eligible project work against the whole month');
select set_config('test.finalized_digest',private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(22))->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.pid(1),pg_temp.pid(22),
  current_setting('test.finalized_digest'),null,pg_temp.pid(115),false)$$,
  'reprocessing closed payroll is idempotent');
reset role;
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22)),1::bigint,
  'a finalization retry does not recognize payroll twice');
select is((select count(*) from public.finance_labor_allocation_revisions r join public.finance_recognition_entries e on e.id=r.entry_id
  where e.studio_id=pg_temp.pid(1) and e.obligation_id=pg_temp.pid(22)),1::bigint,
  'a finalization retry creates no duplicate allocation revision');
savepoint partial_recognition;
insert into public.finance_payroll_cost_revisions(studio_id,obligation_id,component,revision,status,amount,reason,created_by)
values(pg_temp.pid(1),pg_temp.pid(22),'employer_cost',1,'fixed',200,'Confirmed additional historical employer cost',pg_temp.pid(10));
select set_config('test.partial_period',(select p::text from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.pid(1))->'automaticPeriods') p
  where p->>'obligationId'=pg_temp.pid(22)::text),true);
select is((current_setting('test.partial_period')::jsonb->'source'->>'knownCost')::numeric,1200::numeric,'closed source includes newly known employer cost once');
select is((current_setting('test.partial_period')::jsonb->>'provisionalRemainder')::numeric
  +(select coalesce(sum((a->>'amount')::numeric),0) from jsonb_array_elements(current_setting('test.partial_period')::jsonb->'provisionalAllocations') a),
  200::numeric,'partial recognition leaves only the unrecognized native delta provisional');
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22)),1000::numeric,
  'reading the unrecognized delta does not change recognized financial records');
set local role authenticated;
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.pid(1),pg_temp.pid(22),current_setting('test.partial_period')::jsonb->>'digest',null,pg_temp.pid(116),false)$$,
  'normal processing recognizes the remaining employer cost');
reset role;
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22)),1200::numeric,
  'recognized plus previously provisional salary is conserved after finalization');
select ok((select p->'provisionalAllocations' is null from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.pid(1))->'automaticPeriods') p
  where p->>'obligationId'=pg_temp.pid(22)::text),'final recognition removes the remaining provisional projection');
rollback to partial_recognition;
insert into public.finance_report_coverage(studio_id,project_id,month,reviewed_through,revenue_reviewed,direct_costs_reviewed,
  labor_reviewed,overhead_reviewed,revision,reason,created_by)
values(pg_temp.pid(1),pg_temp.pid(30),pg_temp.month_start(-2),pg_temp.month_start(-1)-1,true,true,true,true,1,'Activation preview protection',pg_temp.pid(10));
select set_config('test.earlier_activation_preview',public.preview_finance_labor_activation(pg_temp.pid(1),jsonb_build_object(
  'effectiveFrom',pg_temp.month_start(-2),'historicalCapacityConfirmed',true,'dailyMinutes',360,'weekdays',jsonb_build_array(1,2,3,4,5,6,7),
  'internalProjectId',pg_temp.pid(32),'internalDesignationConfirmed',true,'changeActivation',true))::text,true);
select set_config('test.earlier_activation_digest',current_setting('test.earlier_activation_preview')::jsonb->>'digest',true);
select is((select (p->>'knownCost')::numeric from jsonb_array_elements(current_setting('test.earlier_activation_preview')::jsonb->'periods') p
  where p->>'periodStart'=pg_temp.month_start(-2)::text and p->>'employeeId'=pg_temp.pid(11)::text and p->>'currency'='UAH' limit 1),
  1000::numeric,'activation preview shows the known payroll source amount');
select is((select (p->>'recognizedCost')::numeric from jsonb_array_elements(current_setting('test.earlier_activation_preview')::jsonb->'periods') p
  where p->>'periodStart'=pg_temp.month_start(-2)::text and p->>'employeeId'=pg_temp.pid(11)::text and p->>'currency'='UAH' limit 1),
  1000::numeric,'activation preview shows previously recognized payroll expense');
select ok((select (p->>'protected')::boolean from jsonb_array_elements(current_setting('test.earlier_activation_preview')::jsonb->'periods') p
  where p->>'periodStart'=pg_temp.month_start(-2)::text and p->>'employeeId'=pg_temp.pid(11)::text and p->>'currency'='UAH' limit 1),
  'activation preview marks reviewed history as protected');
select ok(not (select (p->>'manual')::boolean from jsonb_array_elements(current_setting('test.earlier_activation_preview')::jsonb->'periods') p
  where p->>'periodStart'=pg_temp.month_start(-2)::text and p->>'employeeId'=pg_temp.pid(11)::text and p->>'currency'='UAH' limit 1),
  'activation preview distinguishes automatically owned history from manual pools');
select ok((select (p->>'completedDays')::integer>0 from jsonb_array_elements(current_setting('test.earlier_activation_preview')::jsonb->'periods') p
  where p->>'periodStart'=pg_temp.month_start(-2)::text and p->>'employeeId'=pg_temp.pid(11)::text and p->>'currency'='UAH' limit 1),
  'activation preview includes actual completed reporting coverage');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select lives_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(108),jsonb_build_object(
  'effectiveFrom',pg_temp.month_start(-2),'historicalCapacityConfirmed',true,'dailyMinutes',360,'weekdays',jsonb_build_array(1,2,3,4,5,6,7),
  'internalProjectId',pg_temp.pid(32),'internalDesignationConfirmed',true,'changeActivation',true,
  'previewDigest',current_setting('test.earlier_activation_digest')))$$,'a previewed earlier activation is auditable');
reset role;
select set_config('test.closed_changed_digest',private.finance_automatic_labor_basis(pg_temp.pid(1),pg_temp.pid(22))->>'digest',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select lives_ok($$select public.process_finance_automatic_labor(pg_temp.pid(1),pg_temp.pid(22),
  current_setting('test.closed_changed_digest'),null,pg_temp.pid(109),false)$$,
  'a changed closed attribution is queued for protected review');
reset role;
select is((select status from public.finance_labor_calculations where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22) order by created_at desc limit 1),
  'pending_review','activation changes do not silently overwrite closed attribution history');
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22)),1000::numeric,
  'protected activation correction leaves existing studio expense unchanged');

-- A preview cannot be applied after ownership, review or schedule evidence changes.
savepoint preview_state;
-- Seed the manual owner before preview so a later amount-only revision must
-- invalidate it even though recognized cost and ownership flags are unchanged.
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select private.save_finance_labor_allocation_core(pg_temp.pid(1),pg_temp.pid(116),
  (select id from public.finance_labor_cost_pools where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22)),
  jsonb_build_object('revision',(select allocation_revision from public.finance_labor_cost_pools where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22)),
    'reason','Existing manual history','items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.pid(30),'amount','5.00'))),
  pg_temp.pid(10),'manual_management');
select set_config('test.preview_input',jsonb_build_object('effectiveFrom',pg_temp.month_start(-2),'historicalCapacityConfirmed',true,'dailyMinutes',360,
  'weekdays',jsonb_build_array(1,2,3,4,5,6,7),'internalProjectId',pg_temp.pid(32),'changeActivation',true)::text,true);
select set_config('test.preview_digest',public.preview_finance_labor_activation(pg_temp.pid(1),current_setting('test.preview_input')::jsonb)->>'digest',true);
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
-- Model pre-existing manual history; the public RPC forbids taking over an automatic pool.
select private.save_finance_labor_allocation_core(pg_temp.pid(1),pg_temp.pid(113),
  (select id from public.finance_labor_cost_pools where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22)),
  jsonb_build_object('revision',(select allocation_revision from public.finance_labor_cost_pools where studio_id=pg_temp.pid(1) and obligation_id=pg_temp.pid(22)),
    'reason','Manual history after preview','items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.pid(30),'amount','10.00'))),
  pg_temp.pid(10),'manual_management');
set local role authenticated;
select throws_like($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(114),
  current_setting('test.preview_input')::jsonb||jsonb_build_object('previewDigest',current_setting('test.preview_digest')))$$,
  '%finance_preview_required%','manual allocation changed after preview requires a new historical preview');
reset role;
rollback to preview_state;
select set_config('test.preview_input',jsonb_build_object('effectiveFrom',pg_temp.month_start(-2),'historicalCapacityConfirmed',true,'dailyMinutes',360,
  'weekdays',jsonb_build_array(1,2,3,4,5,6,7),'internalProjectId',pg_temp.pid(32),'changeActivation',true)::text,true);
select set_config('test.preview_digest',public.preview_finance_labor_activation(pg_temp.pid(1),current_setting('test.preview_input')::jsonb)->>'digest',true);
insert into public.studio_days_off(studio_id,date,name,created_by) values(pg_temp.pid(1),pg_temp.today(),'Changed capacity evidence',pg_temp.pid(10));
select isnt(public.preview_finance_labor_activation(pg_temp.pid(1),current_setting('test.preview_input')::jsonb)->>'digest',
  current_setting('test.preview_digest'),'a changed studio day off invalidates historical capacity preview');
rollback to preview_state;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select lives_ok($$select public.preview_finance_labor_activation(pg_temp.pid(1),jsonb_build_object(
  'effectiveFrom',pg_temp.month_start(-4),'historicalCapacityConfirmed',true,'dailyMinutes',360,'weekdays',jsonb_build_array(1,2,3,4,5,6,7)))$$,
  'historical capacity preview is independent of the recognition posting boundary');
reset role;

-- Employees cannot read provisional payroll values or activation history.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
select is((select count(*) from public.finance_labor_calculations),0::bigint,'employees cannot read provisional calculation snapshots');
select is((select count(*) from public.finance_labor_activation_revisions),0::bigint,'employees cannot read activation audit history');
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select ok((select count(*)>0 from public.finance_labor_calculations where status='provisional'),'finance administrators can inspect provisional history');
select * from finish();
rollback;
