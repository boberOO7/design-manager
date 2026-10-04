begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('7c000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',pg_temp.today())+make_interval(months=>n))::date$$;
create function pg_temp.result(n integer,studio integer default 1) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(studio) and request_id=pg_temp.fid(n)$$;
create function pg_temp.mid(n integer) returns uuid language sql as $$select id from public.finance_movements where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.trip_recognition(n integer) returns uuid language sql as $$select id from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and trip_entry_id=pg_temp.result(n) and kind='recognition'$$;
create function pg_temp.trip(n integer,project integer default 30) returns uuid language sql as $$
select public.save_finance_trip(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('title','Recognition trip '||n,'destination','Kyiv',
  'startsOn',pg_temp.today(),'endsOn',pg_temp.today(),'status','planned','projectId',case when project is null then '' else pg_temp.fid(project)::text end,
  'travelers',jsonb_build_array(pg_temp.fid(10),pg_temp.fid(11))))$$;
create function pg_temp.trip_entry(n integer,trip_id uuid,input jsonb) returns uuid language sql as $$
select public.record_finance_trip_entry(pg_temp.fid(1),pg_temp.fid(n),trip_id,input)$$;
create function pg_temp.category(key text,studio integer default 1) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(studio) and default_key=key$$;
create function pg_temp.post(n integer,kind text,amount text,currency text,account integer,patch jsonb default '{}') returns uuid language sql as $$
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('kind',kind,'date',pg_temp.today(),'accountId',pg_temp.fid(account),
  'amount',amount,'categoryId',pg_temp.category(case when kind='incoming' then 'other_income' else 'project_services' end),'fx',patch->'fx')||patch)$$;
create function pg_temp.balance(trip_id uuid,direction text,employee integer default 11,code text default 'UAH') returns uuid language sql as $$
select b.expected_item_id from public.finance_trip_balances b where b.studio_id=pg_temp.fid(1) and b.trip_id=$1 and b.employee_id=pg_temp.fid($3) and b.currency=$4 and b.direction=$2$$;
create function pg_temp.generic_expected(n integer,source_id uuid,amount text,classification text default 'overhead') returns uuid language sql as $$
select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('sourceKind','expected','sourceId',source_id,
  'classification',classification,'projectId',null,'amount',amount,'date',pg_temp.today(),'periodStart',pg_temp.month(),'periodEnd',pg_temp.today(),
  'description','Trip duplicate attempt','reason','Should remain excluded from generic recognition'))$$;

insert into public.studios(id,name) values(pg_temp.fid(1),'Trip recognition A'),(pg_temp.fid(2),'Trip recognition B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','trip-rec-'||n||'@test','{}','{}',now(),now() from generate_series(10,12)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Trip recognition tester','trip-rec-'||n||'@test',case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=12 then 2 else 1 end),pg_temp.fid(n),case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values
(pg_temp.fid(1),'UAH',pg_temp.month(-1),pg_temp.fid(10)),(pg_temp.fid(2),'UAH',pg_temp.month(-1),pg_temp.fid(12));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'UAH account','UAH',0,pg_temp.fid(10)),(pg_temp.fid(21),pg_temp.fid(1),'USD account','USD',0,pg_temp.fid(10)),
(pg_temp.fid(22),pg_temp.fid(2),'Other studio account','UAH',0,pg_temp.fid(12));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values
(pg_temp.fid(30),pg_temp.fid(1),'Trip project',100,pg_temp.month(-1),pg_temp.fid(10),'active'),
(pg_temp.fid(31),pg_temp.fid(2),'Other project',100,pg_temp.month(-1),pg_temp.fid(12),'active');
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select public.finalize_finance_setup(pg_temp.fid(2));
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);

-- A current expense posted before activation is not backfilled; an admin can confirm it explicitly.
select pg_temp.trip(100,null);
select pg_temp.trip_entry(101,pg_temp.result(100),jsonb_build_object('kind','expense','expenseType','meals','label','Personal travel','amount','800',
  'currency','UAH','date',pg_temp.today(),'employeeId',pg_temp.fid(11)));
select is((select count(*) from public.finance_recognition_entries where source_kind='trip'),0::bigint,'trip expenses remain unrecognized while management recognition is inactive');
select lives_ok($$select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(102),pg_temp.month())$$,'admin activates recognition for the current P&L month');
select is((select count(*) from public.finance_recognition_entries where source_kind='trip'),0::bigint,'activation does not backfill an earlier trip expense');
select is(jsonb_array_length(public.get_finance_trip_recognition_sources(pg_temp.fid(1))),1,'existing expense appears in the explicit confirmation source list');
select lives_ok($$select public.confirm_finance_trip_recognition(pg_temp.fid(1),pg_temp.fid(103),pg_temp.result(101),'Confirm current trip receipt')$$,
  'admin can confirm a current-period existing trip expense');
select is((select row(source_kind,classification,amount) from public.finance_recognition_entries where id=pg_temp.result(103)),
  row('trip'::text,'overhead'::text,800::numeric),'manual confirmation creates one overhead cost for a personal receipt');
select is((select count(*) from public.finance_recognition_entries where trip_entry_id=pg_temp.result(101) and kind='recognition'),1::bigint,
  'trip entry receives only one recognition');
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_recognition_sources(pg_temp.fid(1))) s
  where s->>'sourceId'=pg_temp.balance(pg_temp.result(100),'outgoing')::text),'trip reimbursement is excluded from generic expense sources');
select throws_like($$select pg_temp.generic_expected(104,pg_temp.balance(pg_temp.result(100),'outgoing'),'800')$$,
  '%finance_recognition_source_invalid%','generic recognition cannot duplicate a trip reimbursement');

-- Advances, plans, reimbursements, and returns affect settlement cash but add no expense/revenue facts.
select pg_temp.trip_entry(105,pg_temp.result(100),jsonb_build_object('kind','advance','expenseType','other','amount','1000','currency','UAH',
  'date',pg_temp.today(),'accountId',pg_temp.fid(20),'employeeId',pg_temp.fid(11)));
select is((select sum(amount) from public.finance_recognized_actuals where source_kind='trip' and trip_entry_id=pg_temp.result(101)),800::numeric,
  'advance does not create another expense');
select public.save_finance_trip(pg_temp.fid(1),pg_temp.fid(106),jsonb_build_object('id',pg_temp.result(100),'version',1,'title','Recognition trip 100',
  'destination','Kyiv','startsOn',pg_temp.today(),'endsOn',pg_temp.today(),'status','completed','projectId','','travelers',jsonb_build_array(pg_temp.fid(10),pg_temp.fid(11))));
select is((select amount from public.finance_expected_items where id=pg_temp.balance(pg_temp.result(100),'incoming')),200::numeric,'unused advance creates only a 200 return balance');
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_recognition_sources(pg_temp.fid(1))) s
  where s->>'sourceId'=pg_temp.balance(pg_temp.result(100),'incoming')::text),'advance return is excluded from generic revenue sources');
select throws_like($$select pg_temp.generic_expected(107,pg_temp.balance(pg_temp.result(100),'incoming'),'200','revenue')$$,
  '%finance_recognition_source_invalid%','generic recognition cannot duplicate an advance return as income');
select pg_temp.post(108,'incoming','200','UAH',20);
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(109),pg_temp.balance(pg_temp.result(100),'incoming'),pg_temp.mid(108),200);
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.balance(pg_temp.result(100),'incoming')),0::numeric,
  'the unused advance return is fully settled');
select is((select sum(amount) from public.finance_recognized_actuals where source_kind='trip' and trip_entry_id=pg_temp.result(101)),800::numeric,
  'return settlement leaves the recognized expense at 800');
select is((select count(*) from public.finance_recognition_entries where source_kind='trip' and kind='recognition'),1::bigint,
  'advance and return do not add trip recognition entries');

-- Later employee receipts are recognized once; plan cash and reimbursement settlement do not duplicate them.
select pg_temp.trip(120,null);
select pg_temp.trip_entry(121,pg_temp.result(120),jsonb_build_object('kind','plan','expenseType','meals','amount','300','currency','UAH',
  'date',pg_temp.today(),'employeeId','','expectedDate',pg_temp.today()));
select is((select count(*) from public.finance_recognition_entries where trip_entry_id=pg_temp.result(121)),0::bigint,'trip plans are never recognized as expenses');
select pg_temp.trip_entry(122,pg_temp.result(120),jsonb_build_object('kind','expense','expenseType','meals','label','Employee receipt','amount','250',
  'currency','UAH','date',pg_temp.today(),'employeeId',pg_temp.fid(11)));
select is((select row(amount,classification) from public.finance_recognition_entries where trip_entry_id=pg_temp.result(122) and kind='recognition'),
  row(250::numeric,'overhead'::text),'current admin-posted personal receipt is automatically recognized as overhead');
select is((select count(*) from public.finance_recognition_entries where trip_entry_id=pg_temp.result(122) and kind='recognition'),1::bigint,
  'automatic trip recognition is idempotently one per expense');
select public.save_finance_trip(pg_temp.fid(1),pg_temp.fid(123),jsonb_build_object('id',pg_temp.result(120),'version',1,'title','Recognition trip 120',
  'destination','Kyiv','startsOn',pg_temp.today(),'endsOn',pg_temp.today(),'status','completed','projectId','','travelers',jsonb_build_array(pg_temp.fid(10),pg_temp.fid(11))));
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_recognition_sources(pg_temp.fid(1))) s
  where s->>'sourceId'=pg_temp.balance(pg_temp.result(120),'outgoing')::text),'employee compensation is excluded from generic expense sources');
select throws_like($$select pg_temp.generic_expected(124,pg_temp.balance(pg_temp.result(120),'outgoing'),'250')$$,
  '%finance_recognition_source_invalid%','generic recognition cannot duplicate trip compensation expense');
select pg_temp.post(125,'outgoing','250','UAH',20);
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(126),pg_temp.balance(pg_temp.result(120),'outgoing'),pg_temp.mid(125),250);
select is((select sum(amount) from public.finance_recognized_actuals where source_kind='trip' and trip_entry_id=pg_temp.result(122)),250::numeric,
  'compensation settles cash without a second economic expense');
select is((select count(*) from public.finance_recognition_entries where source_kind='trip' and trip_entry_id=pg_temp.result(122) and kind='recognition'),1::bigint,
  'compensation leaves one recognized employee receipt');

-- A studio-paid actual linked to cash is recognized as a trip cost and hidden from generic movement sources.
select pg_temp.trip(140,30);
select pg_temp.post(141,'outgoing','400','UAH',20);
select pg_temp.trip_entry(142,pg_temp.result(140),jsonb_build_object('kind','expense','expenseType','travel','label','Studio lodging','amount','400',
  'currency','UAH','date',pg_temp.today(),'employeeId','','movementId',pg_temp.mid(141)));
select is((select row(source_kind,classification,amount) from public.finance_recognition_entries where trip_entry_id=pg_temp.result(142) and kind='recognition'),
  row('trip'::text,'direct_cost'::text,400::numeric),'studio cash expense automatically owns one direct-cost fact');
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_recognition_sources(pg_temp.fid(1))) s
  where s->>'sourceId'=pg_temp.mid(141)::text),'trip-matched cash movement is excluded from generic sources');
select throws_like($$select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(143),jsonb_build_object('sourceKind','movement',
  'sourceId',pg_temp.mid(141),'classification','overhead','projectId',null,'amount','400','date',pg_temp.today(),'periodStart',pg_temp.month(),
  'periodEnd',pg_temp.today(),'description','Duplicate studio trip cost','reason','No generic duplicate'))$$,
  '%finance_recognition_source_invalid%','generic movement recognition cannot duplicate studio-paid trip expense');

-- Refunds use the original USD principal and FX snapshot, with cumulative exact rounding.
select pg_temp.trip(150,null);
select pg_temp.post(151,'outgoing','3','USD',21,jsonb_build_object('fx',jsonb_build_object('rate','40.123456','source','manual','effectiveDate',pg_temp.today())));
select pg_temp.trip_entry(152,pg_temp.result(150),jsonb_build_object('kind','expense','expenseType','other','label','Foreign trip expense','amount','3',
  'currency','USD','date',pg_temp.today(),'employeeId','','movementId',pg_temp.mid(151)));
select is((select reporting_amount from public.finance_recognition_entries where trip_entry_id=pg_temp.result(152) and kind='recognition'),120.37::numeric,
  'original trip recognition freezes its own reporting FX');
select pg_temp.post(153,'refund','1','USD',21,jsonb_build_object('relatedMovementId',pg_temp.mid(151),'fx',jsonb_build_object('rate','50','source','manual','effectiveDate',pg_temp.today())));
select pg_temp.post(154,'refund','1','USD',21,jsonb_build_object('relatedMovementId',pg_temp.mid(151),'fx',jsonb_build_object('rate','60','source','manual','effectiveDate',pg_temp.today())));
select pg_temp.post(155,'refund','1','USD',21,jsonb_build_object('relatedMovementId',pg_temp.mid(151),'fx',jsonb_build_object('rate','70','source','manual','effectiveDate',pg_temp.today())));
select is((select row(sum(amount),sum(reporting_amount)) from public.finance_recognition_entries
  where trip_entry_id=pg_temp.result(152) and kind='adjustment'),row((-3)::numeric,(-120.37)::numeric),
  'partial refund slices conserve the original native principal and reporting total');
select is((select fx_rate from public.finance_recognition_entries where trip_effect_movement_id=pg_temp.mid(153) and kind='adjustment'),40.123456::numeric,
  'refund recognition retains the original expense FX despite a different cash refund rate');
select is((select source_snapshot->'cashFx'->>'fx_rate' from public.finance_recognition_entries where trip_effect_movement_id=pg_temp.mid(153) and kind='adjustment'),
  '50','refund fact retains its separate cash FX snapshot');
select is((select array_agg(-reporting_amount order by -reporting_amount) from public.finance_recognition_entries
  where trip_entry_id=pg_temp.result(152) and kind='adjustment'),array[40.12,40.12,40.13]::numeric[],
  'cumulative refund rounding assigns the final residual exactly');
select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(156),pg_temp.mid(154),pg_temp.today(),'Refund was duplicated');
select is((select row(sum(amount),sum(reporting_amount)) from public.finance_recognized_actuals
  where trip_entry_id=pg_temp.result(152)),row(1::numeric,40.13::numeric),
  'reversing a refund restores only its original-rate share');

-- A native-only trip fact can receive valuation later, and subsequent refund slices inherit that snapshot.
select pg_temp.trip(180,null);
select pg_temp.post(181,'outgoing','3','USD',21);
select pg_temp.trip_entry(182,pg_temp.result(180),jsonb_build_object('kind','expense','expenseType','other','label','Unvalued trip receipt','amount','3',
  'currency','USD','date',pg_temp.today(),'employeeId','','movementId',pg_temp.mid(181)));
select is((select row(reporting_amount,fx_rate) from public.finance_recognition_entries where id=pg_temp.trip_recognition(182)),
  row(null::numeric,null::numeric),'native trip cost is recognized while reporting FX is unresolved');
select pg_temp.post(183,'refund','1','USD',21,jsonb_build_object('relatedMovementId',pg_temp.mid(181),
  'fx',jsonb_build_object('rate','50','source','manual','effectiveDate',pg_temp.today())));
select pg_temp.post(184,'refund','1','USD',21,jsonb_build_object('relatedMovementId',pg_temp.mid(181),
  'fx',jsonb_build_object('rate','60','source','manual','effectiveDate',pg_temp.today())));
select pg_temp.post(185,'refund','1','USD',21,jsonb_build_object('relatedMovementId',pg_temp.mid(181),
  'fx',jsonb_build_object('rate','70','source','manual','effectiveDate',pg_temp.today())));
select is((select count(*) from public.finance_recognition_entries where trip_entry_id=pg_temp.result(182) and kind='adjustment'
  and reporting_amount is null),3::bigint,'unresolved native refund slices remain available for later source valuation');
select public.value_finance_recognition(pg_temp.fid(1),pg_temp.trip_recognition(182),jsonb_build_object('rate','40.123456','source','manual','effectiveDate',pg_temp.today()));
select is((select row(reporting_amount,fx_rate) from public.finance_recognition_entries where id=pg_temp.trip_recognition(182)),
  row(120.37::numeric,40.123456::numeric),'admin can complete the original trip source valuation once');
select is((select array_agg(-reporting_amount order by -reporting_amount) from public.finance_recognition_entries
  where trip_entry_id=pg_temp.result(182) and kind='adjustment'),array[40.12,40.12,40.13]::numeric[],
  'deferred FX completion allocates refunds by cumulative original-source rounding');
select is((select row(sum(amount),sum(reporting_amount)) from public.finance_recognized_actuals where trip_entry_id=pg_temp.result(182)),
  row(0::numeric,0::numeric),'three fully refunded slices conserve the completed source valuation');
select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(186),pg_temp.mid(184),pg_temp.today(),'Refund reversed after FX completion');
select is((select row(sum(amount),sum(reporting_amount)) from public.finance_recognized_actuals where trip_entry_id=pg_temp.result(182)),
  row(1::numeric,40.13::numeric),'refund reversal restores its exact share of the completed trip valuation');

-- Technical movement correction cancels the old fact and recognizes its replacement once.
select pg_temp.trip(160,30);
select pg_temp.post(161,'outgoing','100','UAH',20);
select pg_temp.trip_entry(162,pg_temp.result(160),jsonb_build_object('kind','expense','expenseType','other','label','Corrected lodging','amount','100',
  'currency','UAH','date',pg_temp.today(),'employeeId','','movementId',pg_temp.mid(161)));
select lives_ok($$select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(163),pg_temp.mid(161),jsonb_build_object('kind','outgoing',
  'date',pg_temp.today(),'accountId',pg_temp.fid(20),'amount','120','categoryId',pg_temp.category('project_services')))$$,
  'studio cash correction replaces the linked trip expense');
select is((select row(count(*),sum(amount)) from public.finance_recognized_actuals where trip_entry_id in
  (select id from public.finance_trip_entries where trip_id=pg_temp.result(160))),row(1::bigint,120::numeric),
  'technical reversal and replacement leave exactly one active trip cost');
select is((select count(*) from public.finance_recognition_entries where trip_entry_id=pg_temp.result(162) and kind='recognition'),1::bigint,
  'original trip expense retains its immutable recognized fact');
select ok((select count(*) from public.finance_trip_entries where trip_id=pg_temp.result(160))>1,'trip retains original and replacement expense snapshots');

-- Calendar metadata stays owned by its existing linked event.
reset role;
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
values(pg_temp.fid(30),pg_temp.fid(10),'manager',0,pg_temp.today()),(pg_temp.fid(30),pg_temp.fid(11),'designer',100,pg_temp.today());
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.create_calendar_event_with_invites(pg_temp.fid(1),'Calendar linked trip','business_trip',
  (pg_temp.today()::text||'T00:00:00+03')::timestamptz,((pg_temp.today()+1)::text||'T00:00:00+03')::timestamptz,true,
  p_project_id=>pg_temp.fid(30),p_participant_ids=>array[pg_temp.fid(10),pg_temp.fid(11)]);
create temporary table calendar_before as select id,title,project_id,starts_at,ends_at,all_day,cancelled_at from public.calendar_events where title='Calendar linked trip';
create function pg_temp.calendar_trip() returns uuid language sql as $$select id from public.finance_trips where studio_id=pg_temp.fid(1) and calendar_source_id=(select id from public.calendar_events where title='Calendar linked trip')$$;
select pg_temp.trip_entry(170,pg_temp.calendar_trip(),jsonb_build_object('kind','expense','expenseType','meals','amount','30','currency','UAH','date',pg_temp.today(),'employeeId',pg_temp.fid(11)));
select is((select row(id,title,project_id,starts_at,ends_at,all_day,cancelled_at) from public.calendar_events where title='Calendar linked trip'),
  (select row(id,title,project_id,starts_at,ends_at,all_day,cancelled_at) from calendar_before),'trip accounting does not alter linked Calendar event metadata');

-- Payroll schedule history can expose a closed missing service period without creating an obligation.
reset role;
-- Move only this rollback fixture's recognition window back one month so the period is closed.
update public.finance_settings set recognition_start_month=pg_temp.month(-1) where studio_id=pg_temp.fid(1);
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
values(pg_temp.fid(190),pg_temp.fid(1),'payroll',pg_temp.fid(11),pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,employer_cost_status,reason,created_by)
values(pg_temp.fid(191),pg_temp.fid(1),pg_temp.fid(190),1,'Missing closed payroll period',1000,'UAH',pg_temp.category('salary'),1,1,0,
  pg_temp.month(-1),'agreed','fixed','unknown','History-only diagnostic fixture',pg_temp.fid(10));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select is(jsonb_array_length(public.get_finance_labor_reporting(pg_temp.fid(1))->'missingPeriods'),1,
  'a closed payroll service period with no obligation remains a technical missing-source gap');
select is(public.get_finance_labor_reporting(pg_temp.fid(1))->'missingPeriods'->0->>'scheduleId',pg_temp.fid(190)::text,
  'the missing-period diagnostic identifies its schedule history source');
select public.save_finance_report_coverage(pg_temp.fid(1),pg_temp.fid(192),jsonb_build_object('projectId',null,'month',pg_temp.month(-1),
  'through',(pg_temp.month(-1)+interval '1 month - 1 day')::date,'revision',0,'revenue',true,'direct_costs',true,'labor',true,'overhead',true,
  'reason','Review exists, but no payroll obligation was materialized'));
select is(jsonb_array_length(public.get_finance_labor_reporting(pg_temp.fid(1))->'missingPeriods'),1,
  'marking labor reviewed does not erase the technical missing-period gap');
select is((select count(*) from public.finance_obligations where studio_id=pg_temp.fid(1) and schedule_id=pg_temp.fid(190)),0::bigint,
  'diagnosing a missing payroll period does not materialize an obligation');

-- Admin-only read/export boundary and direct writes remain guarded.
select throws_like($$select * from public.get_finance_trip_recognition_sources(pg_temp.fid(2))$$,'%finance_admin_required%','foreign-studio admin cannot export trip recognition sources');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select is((select count(*) from public.finance_recognition_entries),0::bigint,'employee cannot read trip recognition facts');
select is((select count(*) from public.finance_trip_entries),0::bigint,'employee cannot read trip receipts');
select throws_like($$select * from public.get_finance_trip_recognition_sources(pg_temp.fid(1))$$,'%finance_admin_required%','employee cannot export trip recognition sources');
select throws_like($$select public.confirm_finance_trip_recognition(pg_temp.fid(1),pg_temp.fid(180),pg_temp.result(142),'Denied')$$,
  '%finance_admin_required%','employee cannot confirm trip recognition');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select is((select count(*) from public.finance_recognition_entries),0::bigint,'foreign studio admin cannot read trip recognition facts');
select throws_like($$select * from public.get_finance_trip_recognition_sources(pg_temp.fid(1))$$,'%finance_admin_required%','foreign admin cannot export another studio sources');
select throws_like($$select public.confirm_finance_trip_recognition(pg_temp.fid(1),pg_temp.fid(181),pg_temp.result(142),'Denied')$$,
  '%finance_admin_required%','foreign admin cannot confirm another studio trip');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select throws_like($$insert into public.finance_recognition_entries(studio_id,classification,source_kind,trip_entry_id,category_id,source_snapshot,
  period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,reason,created_by)
  values(pg_temp.fid(1),'direct_cost','trip',pg_temp.result(152),pg_temp.category('project_services'),jsonb_build_object('source','direct'),pg_temp.today(),
    pg_temp.today(),pg_temp.today(),'Direct','USD',1,0,1,'UAH','Direct',pg_temp.fid(10))$$,'%permission denied%','authenticated admin cannot forge trip recognition rows');
select * from finish();
rollback;
