begin;
create function pg_temp.assert_true(value boolean,label text) returns text language plpgsql as $$begin
 if value is distinct from true then raise exception 'FAILED: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.assert_equal(actual anyelement,expected anyelement,label text) returns text language plpgsql as $$begin
 if actual is distinct from expected then raise exception 'FAILED: % (actual %, expected %)',label,actual,expected;end if;return 'PASS: '||label;end$$;
create function pg_temp.expect_error(statement text,pattern text,label text) returns text language plpgsql as $$declare failure text;begin
 begin execute statement;exception when others then failure:=sqlerrm;end;
 if failure is null or failure not like pattern then raise exception 'FAILED: % (error %)',label,failure;end if;return 'PASS: '||label;end$$;
create function pg_temp.expect_success(statement text,label text) returns text language plpgsql as $$begin execute statement;return 'PASS: '||label;end$$;


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

select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(102),pg_temp.month());
-- Simulate missed insert-trigger work without changing any production source.
reset role;
alter table public.finance_trip_entries disable trigger finance_trip_recognition;
set local role authenticated;
select pg_temp.trip(300,30);
select pg_temp.post(301,'outgoing','100','UAH',20);
select pg_temp.trip_entry(302,pg_temp.result(300),jsonb_build_object('kind','expense','expenseType','other','amount','100',
  'currency','UAH','date',pg_temp.today(),'employeeId','','movementId',pg_temp.mid(301)));
select pg_temp.post(303,'refund','30','UAH',20,jsonb_build_object('relatedMovementId',pg_temp.mid(301)));
select pg_temp.post(304,'refund','20','UAH',20,jsonb_build_object('relatedMovementId',pg_temp.mid(301)));
select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(305),pg_temp.mid(304),pg_temp.today(),'Refund correction before recognition');
select pg_temp.post(306,'outgoing','80','UAH',20);
select pg_temp.trip_entry(307,pg_temp.result(300),jsonb_build_object('kind','expense','expenseType','other','amount','80',
  'currency','UAH','date',pg_temp.today(),'employeeId','','movementId',pg_temp.mid(306)));
select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(308),pg_temp.mid(306),pg_temp.today(),'Expense correction before recognition');
select pg_temp.trip_entry(309,pg_temp.result(300),jsonb_build_object('kind','expense','expenseType','other','amount','10',
  'currency','UAH','date',pg_temp.month()-1,'employeeId',pg_temp.fid(11)));
select pg_temp.post(313,'outgoing','60','UAH',20);
select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(314),jsonb_build_object('sourceKind','movement','sourceId',pg_temp.mid(313),
  'classification','overhead','amount','60','date',pg_temp.today(),'periodStart',pg_temp.today(),'periodEnd',pg_temp.today(),'description','Existing manually recognized expense','reason','Prior manual source'));
select pg_temp.expect_error($$select pg_temp.trip_entry(315,pg_temp.result(300),jsonb_build_object('kind','expense','expenseType','other','amount','60',
  'currency','UAH','date',pg_temp.today(),'employeeId','','movementId',pg_temp.mid(313)))$$,'%finance_recognized_cash_source_locked%','current trip cash matching retains duplicate-expense safeguards');
select pg_temp.trip(316,30);
-- Represent an old overlapping source directly in this rollback fixture; normal matching rejects it above.
reset role;
insert into public.finance_trip_entries(id,studio_id,trip_id,kind,expense_type,label,amount,currency,financial_date,movement_id,
  reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,created_by)
values(pg_temp.fid(315),pg_temp.fid(1),pg_temp.result(316),'expense','other','Legacy overlapping cost',60,'UAH',pg_temp.today(),pg_temp.mid(313),
  'UAH',60,1,'identity',pg_temp.today(),pg_temp.fid(10));
set local role authenticated;
select pg_temp.trip_entry(311,pg_temp.result(300),jsonb_build_object('kind','expense','expenseType','other','amount','25',
  'currency','UAH','date',pg_temp.today(),'employeeId',pg_temp.fid(11)));
select pg_temp.trip_entry(312,pg_temp.result(300),jsonb_build_object('reversesId',pg_temp.result(311),'note','Correct personal receipt before recognition'));
reset role;
alter table public.finance_trip_entries enable trigger finance_trip_recognition;
set local role authenticated;
select public.process_finance_pending_source(pg_temp.fid(1),'trip',pg_temp.result(302));
select public.process_finance_pending_source(pg_temp.fid(1),'trip',pg_temp.result(302));
select pg_temp.assert_equal((select sum(amount) from public.finance_recognized_actuals where trip_entry_id=pg_temp.result(302)),70::numeric,'missed expense replays refunds and reversed refunds exactly once');
select pg_temp.assert_equal((select count(*) from public.finance_recognition_entries where trip_entry_id=pg_temp.result(302) and kind='recognition'),1::bigint,'repeated missed-trip workers cannot duplicate costs');
select public.process_finance_pending_source(pg_temp.fid(1),'trip',pg_temp.result(307));
select pg_temp.assert_equal((select count(*) from public.finance_recognized_actuals where trip_entry_id=pg_temp.result(307)),0::bigint,'reconciling a reversed payment never restores an active expense');
select public.process_finance_pending_source(pg_temp.fid(1),'trip',pg_temp.result(311));
select pg_temp.assert_equal((select count(*) from public.finance_recognized_actuals where trip_entry_id=pg_temp.result(311)),0::bigint,'trip-entry reversal is replayed without restoring the cancelled cost');
select public.process_finance_pending_source(pg_temp.fid(1),'trip',pg_temp.fid(315));
select pg_temp.assert_equal((select count(*) from public.finance_recognition_entries where trip_entry_id=pg_temp.fid(315)),0::bigint,'manual recognition of linked cash blocks duplicate automatic trip costs');
select public.process_finance_pending_source(pg_temp.fid(1),'trip',pg_temp.result(309));
select pg_temp.assert_equal((select count(*) from public.finance_recognition_entries where trip_entry_id=pg_temp.result(309)),0::bigint,'worker never backdates an expense before recognition activation');
-- Discovery may race a period review; processing must recheck the safeguard.
reset role;
alter table public.finance_trip_entries disable trigger finance_trip_recognition;
set local role authenticated;
select pg_temp.trip_entry(310,pg_temp.result(300),jsonb_build_object('kind','expense','expenseType','other','amount','40',
  'currency','UAH','date',pg_temp.today(),'employeeId',pg_temp.fid(11)));
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.prepare_finance_automatic_expenses(pg_temp.fid(1))) c where c->>'sourceId'=pg_temp.result(310)::text),'unrecognized confirmed expense is discovered');
reset role;
alter table public.finance_trip_entries enable trigger finance_trip_recognition;
insert into public.finance_report_coverage(studio_id,project_id,month,reviewed_through,revenue_reviewed,direct_costs_reviewed,labor_reviewed,overhead_reviewed,revision,reason,created_by)
values(pg_temp.fid(1),pg_temp.fid(30),pg_temp.month(),pg_temp.today(),false,true,false,false,1,'Reviewed costs',pg_temp.fid(10));
set local role authenticated;
select public.process_finance_pending_source(pg_temp.fid(1),'trip',pg_temp.result(310));
select pg_temp.assert_equal((select count(*) from public.finance_recognition_entries where trip_entry_id=pg_temp.result(310)),0::bigint,'a newly reviewed period blocks a stale worker candidate');
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.prepare_finance_automatic_expenses(pg_temp.fid(1))) c where c->>'sourceId'=pg_temp.result(310)::text),'reviewed expenses remain manual exceptions');

-- Payroll evidence uses the existing category identity and immutable review audit.
reset role;
insert into public.finance_schedules(id,studio_id,kind,created_by) values
(pg_temp.fid(400),pg_temp.fid(1),'recurring',pg_temp.fid(10)),
(pg_temp.fid(410),pg_temp.fid(1),'recurring',pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.fid(401),pg_temp.fid(1),pg_temp.fid(400),1,'Employer payment',200,'UAH',pg_temp.category('employer_costs'),1,31,0,pg_temp.month(),
  'agreed','fixed','Payroll source fixture',pg_temp.fid(10)),
(pg_temp.fid(411),pg_temp.fid(1),pg_temp.fid(410),1,'Office subscription',50,'UAH',pg_temp.category('project_services'),1,31,0,pg_temp.month(),
  'agreed','fixed','Office source fixture',pg_temp.fid(10));
select pg_temp.assert_equal((private.finance_labor_source_review(pg_temp.fid(1))->>'reviewed')::boolean,false,'ambiguous employer payments require an admin payroll review');
select pg_temp.assert_equal(jsonb_array_length(private.finance_labor_source_review(pg_temp.fid(1))->'recurring'),1,'unrelated recurring sources are outside payroll review');
select set_config('test.review_digest',private.finance_labor_source_review(pg_temp.fid(1))->>'digest',true);
insert into public.finance_planning_requests(studio_id,request_id,payload,result_id,created_by)
values(pg_temp.fid(1),pg_temp.fid(420),jsonb_build_object('operation','labor_capacity','input',jsonb_build_object(
  'payrollSourceDigest',current_setting('test.review_digest'),'payrollSourcesConfirmed',true,'payrollCashTermIds',jsonb_build_array(pg_temp.fid(401)))),pg_temp.fid(420),pg_temp.fid(10));
select pg_temp.assert_equal((private.finance_labor_source_review(pg_temp.fid(1))->>'reviewed')::boolean,true,'existing audit records confirm the relevant source classification');
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.fid(412),pg_temp.fid(1),pg_temp.fid(410),2,'Updated subscription',75,'UAH',pg_temp.category('project_services'),1,15,0,pg_temp.month(1),
  'agreed','fixed','Unrelated revision',pg_temp.fid(10));
select pg_temp.assert_equal(private.finance_labor_source_review(pg_temp.fid(1))->>'digest',current_setting('test.review_digest'),'unrelated recurring amount and timing revisions preserve review');
update public.finance_schedules set stopped_from=pg_temp.month(2) where id=pg_temp.fid(410);
select pg_temp.assert_equal(private.finance_labor_source_review(pg_temp.fid(1))->>'digest',current_setting('test.review_digest'),'stopping an unrelated recurring schedule preserves review');
update public.finance_categories set name='Renamed contribution category' where studio_id=pg_temp.fid(1) and default_key='employer_costs';
select pg_temp.assert_equal(private.finance_labor_source_review(pg_temp.fid(1))->>'digest',current_setting('test.review_digest'),'category display names do not change payroll evidence');
set local role authenticated;
select public.ensure_finance_schedule_occurrences(pg_temp.fid(1),'12');
reset role;
select set_config('test.cash_item',(select i.expected_item_id::text from public.finance_obligation_items i join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
  where o.schedule_id=pg_temp.fid(400) and o.period_start=pg_temp.month()),true);
select pg_temp.assert_true(private.finance_labor_cash_expected(pg_temp.fid(1),current_setting('test.cash_item')::uuid),'cash-only payroll classification follows the canonical obligation source');
set local role authenticated;
select pg_temp.expect_error($$select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(430),jsonb_build_object('sourceKind','expected','sourceId',current_setting('test.cash_item'),
  'classification','overhead','amount','200','date',pg_temp.today(),'periodStart',pg_temp.month(),'periodEnd',pg_temp.today(),'description','Duplicate payroll expense','reason','Test'))$$,
  '%finance_payroll_cash_source%','cash-only payroll obligations cannot become duplicate expenses');
reset role;
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.fid(402),pg_temp.fid(1),pg_temp.fid(400),2,'Changed employer payment',250,'UAH',pg_temp.category('employer_costs'),1,31,0,pg_temp.month(1),
  'agreed','fixed','Relevant payroll evidence change',pg_temp.fid(10));
select pg_temp.assert_equal((private.finance_labor_source_review(pg_temp.fid(1))->>'reviewed')::boolean,false,'payroll-related source changes invalidate review');
select pg_temp.assert_true(private.finance_labor_cash_expected(pg_temp.fid(1),current_setting('test.cash_item')::uuid),'invalidated reviews retain cash-only obligations and duplicate protection');
select pg_temp.assert_equal(jsonb_array_length(private.finance_labor_source_review(pg_temp.fid(1))->'recurring'),2,'new revisions of payroll sources remain reviewable');
-- The migration compatibility bridge preserves a valid old review, never future changes.
insert into private.finance_labor_review_digest_aliases(studio_id,legacy_digest,payroll_digest)
values(pg_temp.fid(1),repeat('a',32),private.finance_labor_source_review(pg_temp.fid(1))->>'digest');
insert into public.finance_planning_requests(studio_id,request_id,payload,result_id,created_by)
values(pg_temp.fid(1),pg_temp.fid(421),jsonb_build_object('operation','labor_capacity','input',jsonb_build_object(
  'payrollSourceDigest',repeat('a',32),'payrollSourcesConfirmed',true,'payrollCashTermIds',jsonb_build_array(pg_temp.fid(401)))),pg_temp.fid(421),pg_temp.fid(10));
select pg_temp.assert_equal((private.finance_labor_source_review(pg_temp.fid(1))->>'reviewed')::boolean,true,'valid legacy review digests remain accepted after narrowing dependencies');
update public.finance_categories set name='Renamed unrelated category' where studio_id=pg_temp.fid(1) and default_key='project_services';
select pg_temp.assert_equal((private.finance_labor_source_review(pg_temp.fid(1))->>'reviewed')::boolean,true,'unrelated changes also preserve migrated reviews');
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.fid(403),pg_temp.fid(1),pg_temp.fid(400),3,'Reclassified payroll source',250,'UAH',pg_temp.category('project_services'),1,31,0,pg_temp.month(2),
  'agreed','fixed','Payroll classification change',pg_temp.fid(10));
select pg_temp.assert_equal((private.finance_labor_source_review(pg_temp.fid(1))->>'reviewed')::boolean,false,'changing a payroll source classification invalidates even migrated reviews');
select pg_temp.assert_equal(jsonb_array_length(private.finance_labor_source_review(pg_temp.fid(1))->'recurring'),3,'payroll-cash schedule revisions remain dependencies after a category change');
-- Service workers need no impersonated user; audit authorship comes from saved evidence.
select set_config('test.trip_source',pg_temp.result(310)::text,true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select public.process_finance_pending_source(pg_temp.fid(1),'trip',current_setting('test.trip_source')::uuid);
reset role;
select pg_temp.assert_equal((select count(*) from public.finance_recognition_entries where trip_entry_id=current_setting('test.trip_source')::uuid),0::bigint,'service workers cannot bypass reviewed-period safeguards');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select pg_temp.expect_error($$select public.process_finance_pending_source(pg_temp.fid(1),'trip',current_setting('test.trip_source')::uuid)$$,'%finance_admin_required%','employees cannot invoke privileged source reconciliation');
rollback;
