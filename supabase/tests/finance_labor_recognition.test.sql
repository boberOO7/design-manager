begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('6b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',pg_temp.today())+make_interval(months=>n))::date$$;
create function pg_temp.result(n integer,studio integer default 1) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(studio) and request_id=pg_temp.fid(n)$$;
create function pg_temp.cat(key text,studio integer default 1) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(studio) and default_key=key$$;
create function pg_temp.schedule(n integer,employee integer,patch jsonb default '{}') returns uuid language sql as $$
select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('kind','payroll','employeeId',pg_temp.fid(employee),
  'revision',0,'name','Labor terms','amount','1000','currency','UAH','categoryId',pg_temp.cat('salary'),'basis','net',
  'employeePayout','1000','employeeDeductions','','employerCostStatus','unknown','intervalMonths',1,'payoutDay',1,
  'paymentMonthOffset',0,'effectiveFrom',pg_temp.month(),'commitment','agreed','certainty','fixed','reason','Labor attribution terms')||patch)$$;
create function pg_temp.labor_source(obligation uuid) returns jsonb language sql stable as $$
select s from jsonb_array_elements(public.get_finance_labor_sources(pg_temp.fid(1))) s where s->>'obligationId'=obligation::text$$;
create function pg_temp.labor_version(obligation uuid) returns text language sql stable as $$select pg_temp.labor_source(obligation)->>'version'$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Labor attribution A'),(pg_temp.fid(2),'Labor attribution B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','labor-'||n||'@test','{}','{}',now(),now() from generate_series(10,17)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Labor tester '||n,'labor-'||n||'@test',case when n in (10,13) then 'admin' else 'employee' end,true from generate_series(10,17)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=13 then 2 else 1 end),pg_temp.fid(n),case when n in (10,13) then 'admin' else 'employee' end,true from generate_series(10,17)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values
(pg_temp.fid(1),'UAH',pg_temp.month(-1),pg_temp.fid(10)),(pg_temp.fid(2),'UAH',pg_temp.month(-1),pg_temp.fid(13));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'UAH cash','UAH',0,pg_temp.fid(10)),(pg_temp.fid(21),pg_temp.fid(1),'USD cash','USD',0,pg_temp.fid(10)),
(pg_temp.fid(22),pg_temp.fid(2),'Other studio cash','UAH',0,pg_temp.fid(13));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values
(pg_temp.fid(30),pg_temp.fid(1),'Labor project A',100,pg_temp.month(-1),pg_temp.fid(10),'active'),
(pg_temp.fid(31),pg_temp.fid(1),'Labor project B',100,pg_temp.month(-1),pg_temp.fid(10),'active'),
(pg_temp.fid(32),pg_temp.fid(2),'Other studio project',100,pg_temp.month(-1),pg_temp.fid(13),'active');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.finalize_finance_setup(pg_temp.fid(1));
select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(50),pg_temp.month());
select set_config('request.jwt.claim.sub',pg_temp.fid(13)::text,true);
select public.finalize_finance_setup(pg_temp.fid(2));
select public.activate_finance_recognition(pg_temp.fid(2),pg_temp.fid(51),pg_temp.month());
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);

-- Gross payroll has deductions inside gross pay; only employer cost is added.
reset role;
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by) values
(pg_temp.fid(100),pg_temp.fid(1),'payroll',pg_temp.fid(11),pg_temp.fid(10)),
(pg_temp.fid(101),pg_temp.fid(1),'payroll',pg_temp.fid(12),pg_temp.fid(10)),
(pg_temp.fid(102),pg_temp.fid(1),'payroll',pg_temp.fid(14),pg_temp.fid(10)),
(pg_temp.fid(103),pg_temp.fid(1),'payroll',pg_temp.fid(15),pg_temp.fid(10)),
(pg_temp.fid(104),pg_temp.fid(1),'payroll',pg_temp.fid(16),pg_temp.fid(10)),
(pg_temp.fid(105),pg_temp.fid(1),'payroll',pg_temp.fid(17),pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by) values
(pg_temp.fid(400),pg_temp.fid(1),pg_temp.fid(100),1,'Gross payroll',1200,'UAH',pg_temp.cat('salary'),1,1,0,pg_temp.month(),'agreed','fixed','gross',900,300,100,'fixed','Gross terms',pg_temp.fid(10)),
(pg_temp.fid(401),pg_temp.fid(1),pg_temp.fid(101),1,'Net payroll',1000,'UAH',pg_temp.cat('salary'),1,1,0,pg_temp.month(),'agreed','fixed','net',1000,null,null,'unknown','Net terms',pg_temp.fid(10)),
(pg_temp.fid(402),pg_temp.fid(1),pg_temp.fid(102),1,'USD payroll',500,'USD',pg_temp.cat('salary'),1,1,0,pg_temp.month(),'agreed','fixed','net',500,0,0,'fixed','USD terms',pg_temp.fid(10)),
(pg_temp.fid(403),pg_temp.fid(1),pg_temp.fid(103),1,'Cancelled payout payroll',700,'UAH',pg_temp.cat('salary'),1,1,0,pg_temp.month(),'agreed','fixed','net',700,0,0,'fixed','Cancelled payout terms',pg_temp.fid(10)),
(pg_temp.fid(404),pg_temp.fid(1),pg_temp.fid(104),1,'Estimated payout payroll',800,'UAH',pg_temp.cat('salary'),1,1,0,pg_temp.month(),'agreed','fixed','net',800,0,0,'fixed','Estimated payout terms',pg_temp.fid(10)),
(pg_temp.fid(405),pg_temp.fid(1),pg_temp.fid(105),1,'Missing payout payroll',900,'UAH',pg_temp.cat('salary'),1,1,0,pg_temp.month(),'agreed','fixed','net',900,0,0,'fixed','Missing payout terms',pg_temp.fid(10));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(110),jsonb_build_object('direction','outgoing','amount','900','currency','UAH',
  'categoryId',pg_temp.cat('salary'),'description','Gross payroll payout','dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),
  'commitment','agreed','certainty','fixed','established',true));
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(111),jsonb_build_object('direction','outgoing','amount','1000','currency','UAH',
  'categoryId',pg_temp.cat('salary'),'description','Net payroll payout','dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),
  'commitment','agreed','certainty','fixed','established',true));
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(112),jsonb_build_object('direction','outgoing','amount','500','currency','USD',
  'categoryId',pg_temp.cat('salary'),'description','USD payroll payout','dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),
  'commitment','agreed','certainty','fixed','established',true));
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(113),jsonb_build_object('direction','outgoing','amount','700','currency','UAH',
  'categoryId',pg_temp.cat('salary'),'description','Cancelled payroll payout','dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),
  'commitment','cancelled','certainty','fixed','established',false));
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(114),jsonb_build_object('direction','outgoing','amount','800','currency','UAH',
  'categoryId',pg_temp.cat('salary'),'description','Estimated payroll payout','dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),
  'commitment','agreed','certainty','estimated','established',false));
reset role;
-- Closed service periods are valid rows for this test; the live schema does not require month end.
insert into public.finance_obligations(id,studio_id,schedule_id,terms_id,kind,employee_id,employee_name,period_start,period_end,created_by) values
(pg_temp.fid(300),pg_temp.fid(1),pg_temp.fid(100),pg_temp.fid(400),'payroll',pg_temp.fid(11),'Labor tester 11',pg_temp.month(),pg_temp.today(),pg_temp.fid(10)),
(pg_temp.fid(301),pg_temp.fid(1),pg_temp.fid(101),pg_temp.fid(401),'payroll',pg_temp.fid(12),'Labor tester 12',pg_temp.month(),pg_temp.today(),pg_temp.fid(10)),
(pg_temp.fid(302),pg_temp.fid(1),pg_temp.fid(102),pg_temp.fid(402),'payroll',pg_temp.fid(14),'Labor tester 14',pg_temp.month(),pg_temp.today(),pg_temp.fid(10)),
(pg_temp.fid(303),pg_temp.fid(1),pg_temp.fid(103),pg_temp.fid(403),'payroll',pg_temp.fid(15),'Labor tester 15',pg_temp.month(),pg_temp.today(),pg_temp.fid(10)),
(pg_temp.fid(304),pg_temp.fid(1),pg_temp.fid(104),pg_temp.fid(404),'payroll',pg_temp.fid(16),'Labor tester 16',pg_temp.month(),pg_temp.today(),pg_temp.fid(10)),
(pg_temp.fid(305),pg_temp.fid(1),pg_temp.fid(105),pg_temp.fid(405),'payroll',pg_temp.fid(17),'Labor tester 17',pg_temp.month(),pg_temp.today(),pg_temp.fid(10));
insert into public.finance_obligation_items(studio_id,obligation_id,expected_item_id,component) values
(pg_temp.fid(1),pg_temp.fid(300),pg_temp.result(110),'payout'),
(pg_temp.fid(1),pg_temp.fid(301),pg_temp.result(111),'payout'),
(pg_temp.fid(1),pg_temp.fid(302),pg_temp.result(112),'payout'),
(pg_temp.fid(1),pg_temp.fid(303),pg_temp.result(113),'payout'),
(pg_temp.fid(1),pg_temp.fid(304),pg_temp.result(114),'payout');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);

select is((pg_temp.labor_source(pg_temp.fid(300))->>'canConfirm')::boolean,true,'current service period ending today is confirmable');
select is(coalesce((pg_temp.labor_source(pg_temp.fid(303))->>'canConfirm')::boolean,false),false,'cancelled payroll payout is not confirmable');
select is(coalesce((pg_temp.labor_source(pg_temp.fid(304))->>'canConfirm')::boolean,false),false,'estimated payroll payout is not confirmable');
select is(coalesce((pg_temp.labor_source(pg_temp.fid(305))->>'canConfirm')::boolean,false),false,'payroll without a payout is not confirmable');
select throws_like($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(226),jsonb_build_object('obligationId',pg_temp.fid(303),
  'version',pg_temp.labor_version(pg_temp.fid(303)),'reason','Cancelled payout'))$$,'%finance_input_invalid%','cancelled payout labor confirmation is denied');
select throws_like($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(227),jsonb_build_object('obligationId',pg_temp.fid(304),
  'version',pg_temp.labor_version(pg_temp.fid(304)),'reason','Estimated payout'))$$,'%finance_input_invalid%','estimated payout labor confirmation is denied');
select throws_like($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(228),jsonb_build_object('obligationId',pg_temp.fid(305),
  'version',pg_temp.labor_version(pg_temp.fid(305)),'reason','Missing payout'))$$,'%finance_input_invalid%','labor confirmation requires a payroll payout');
select is((pg_temp.labor_source(pg_temp.fid(300))->>'knownCost')::numeric,1300::numeric,'gross cost adds employer cost without counting deductions twice');
select is((pg_temp.labor_source(pg_temp.fid(301))->>'knownCost')::numeric,1000::numeric,'net payroll starts with known payout only');
select is(pg_temp.labor_source(pg_temp.fid(301))->>'deductionsStatus','unknown','unknown deductions remain explicitly unknown');
select is(pg_temp.labor_source(pg_temp.fid(301))->>'employerStatus','unknown','unknown employer cost remains explicitly unknown');

-- Estimated parts remain disclosed but do not enter confirmed known cost.
select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(130),jsonb_build_object('obligationId',pg_temp.fid(301),
  'component','deductions','status','estimated','amount','50','revision',0,'reason','Estimate withheld tax'));
select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(131),jsonb_build_object('obligationId',pg_temp.fid(301),
  'component','employer_cost','status','estimated','amount','20','revision',0,'reason','Estimate employer cost'));
select is((pg_temp.labor_source(pg_temp.fid(301))->>'knownCost')::numeric,1000::numeric,'estimated components do not inflate known cost');
select is(pg_temp.labor_source(pg_temp.fid(301))->>'deductionsStatus','estimated','estimate status remains visible');
select is(pg_temp.labor_source(pg_temp.fid(301))->>'employerStatus','estimated','employer estimate status remains visible');

-- Later fixed revisions contribute only the new remaining delta after recognition.
select lives_ok($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(200),jsonb_build_object('obligationId',pg_temp.fid(300),
  'version',pg_temp.labor_version(pg_temp.fid(300)),'reason','Confirm gross payroll'))$$,'gross payroll period is recognized');
select is((select row(amount,reporting_amount,classification,source_kind,obligation_id) from public.finance_recognition_entries where id=pg_temp.result(200)),
  row(1300::numeric,1300::numeric,'labor'::text,'labor'::text,pg_temp.fid(300)),'one studio labor cost records the exact gross-known amount');
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(224),jsonb_build_object('id',pg_temp.result(110),
  'version',(select version from public.finance_expected_items where id=pg_temp.result(110)),'direction','outgoing','amount','900','currency','UAH',
  'categoryId',pg_temp.cat('salary'),'description','Gross payroll payout','dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),
  'commitment','agreed','certainty','fixed','established',false));
select throws_like($$select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(233),jsonb_build_object('id',pg_temp.result(110),
  'version',(select version from public.finance_expected_items where id=pg_temp.result(110)),'direction','outgoing','amount','900','currency','UAH',
  'categoryId',pg_temp.cat('salary'),'description','Gross payroll payout','dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),
  'commitment','cancelled','certainty','fixed','established',false))$$,'%finance_payroll_consumed%','a booked payroll payout cannot later be cancelled');
select ok(exists(select 1 from public.get_finance_payroll_historical_terms(pg_temp.fid(1)) where term_id=pg_temp.fid(400)),
  'recognized payroll terms remain historical after the payout earned flag is cleared');
select throws_like($$select public.delete_unconsumed_finance_payroll_revision(pg_temp.fid(1),pg_temp.fid(225),pg_temp.fid(100),1)$$,
  '%finance_payroll_consumed%','clearing earned does not make recognized payroll terms editable');
select lives_ok($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(201),jsonb_build_object('obligationId',pg_temp.fid(301),
  'version',pg_temp.labor_version(pg_temp.fid(301)),'reason','Confirm known payroll parts'))$$,'net payroll cost is recognized after component revisions');
select is((select amount from public.finance_recognition_entries where id=pg_temp.result(201)),1000::numeric,'first confirmation consumes only known cost');
select lives_ok($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(234),pg_temp.result(201),jsonb_build_object('revision',0,
  'items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','1000')),'reason','Initial payroll allocation'))$$,
  'initial payroll cost can be attributed before later cost completion');
select lives_ok($$select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(132),jsonb_build_object('obligationId',pg_temp.fid(301),
  'component','deductions','status','fixed','amount','80','revision',1,'reason','Confirmed deductions'))$$,'new deductions revision updates known payroll cost');
select lives_ok($$select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(133),jsonb_build_object('obligationId',pg_temp.fid(301),
  'component','employer_cost','status','fixed','amount','20','revision',1,'reason','Confirmed employer cost'))$$,'new employer revision updates known payroll cost');
select is((pg_temp.labor_source(pg_temp.fid(301))->>'knownCost')::numeric,1100::numeric,'latest fixed revisions form the complete current cost');
select is((pg_temp.labor_source(pg_temp.fid(301))->>'remainingCost')::numeric,100::numeric,'newer fixed revisions expose only their net delta');
select lives_ok($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(201),(select payload->'input' from public.finance_planning_requests
  where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(201)))$$,'same request retry returns its original entry');
select throws_like($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(201),jsonb_build_object('obligationId',pg_temp.fid(301),
  'version',pg_temp.labor_version(pg_temp.fid(301)),'reason','Changed request'))$$,'%finance_request_conflict%','changed recognition retry is rejected');
select lives_ok($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(202),jsonb_build_object('obligationId',pg_temp.fid(301),
  'version',pg_temp.labor_version(pg_temp.fid(301)),'reason','Confirm latest payroll delta'))$$,'later recognition consumes only the remaining delta');
select is((select amount from public.finance_recognition_entries where id=pg_temp.result(202)),100::numeric,'second confirmation posts only revised cost delta');
select is((select sum(amount) from public.finance_current_labor_allocations where entry_id=pg_temp.result(201)),1000::numeric,
  'later known cost leaves the earlier payroll pool allocation unchanged');
select is((pg_temp.labor_source(pg_temp.fid(301))->>'remainingCost')::numeric,0::numeric,'latest revision is fully consumed');
select throws_like($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(203),jsonb_build_object('obligationId',pg_temp.fid(301),
  'version','stale','reason','Stale source'))$$,'%finance_version_conflict%','stale labor source snapshot is rejected');

-- Bonus is its own source kind and uses only its confirmed bonus expectation.
select public.create_finance_employee_bonus(pg_temp.fid(1),pg_temp.fid(120),jsonb_build_object('employeeId',pg_temp.fid(11),
  'periodStart',pg_temp.month(),'periodEnd',pg_temp.today(),'amount','250','currency','UAH','description','Project completion bonus','dueDate',pg_temp.today()));
select is((pg_temp.labor_source(pg_temp.result(120))->>'knownCost')::numeric,250::numeric,'agreed fixed bonus is a distinct known labor source');
select is(pg_temp.labor_source(pg_temp.result(120))->>'kind','bonus','bonus source classification is preserved');
select lives_ok($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(204),jsonb_build_object('obligationId',pg_temp.result(120),
  'version',pg_temp.labor_version(pg_temp.result(120)),'reason','Confirm bonus'))$$,'bonus can be confirmed as labor');
select is((select amount from public.finance_recognition_entries where id=pg_temp.result(204)),250::numeric,'bonus contributes only its exact expected amount');

-- Native foreign-currency labor can be recognized unresolved, but cannot be allocated as reporting value.
select is((pg_temp.labor_source(pg_temp.fid(302))->>'currency'),'USD','foreign labor preserves its native currency');
select lives_ok($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(205),jsonb_build_object('obligationId',pg_temp.fid(302),
  'version',pg_temp.labor_version(pg_temp.fid(302)),'reason','Confirm USD payroll'))$$,'missing foreign FX does not block native recognition');
select is((select reporting_amount from public.finance_recognition_entries where id=pg_temp.result(205)),null::numeric,'missing FX stays unresolved');
select throws_like($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(206),pg_temp.result(205),jsonb_build_object('revision',0,
  'items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','10')),'reason','Unvalued allocation'))$$,'%finance_fx_required%','unvalued labor cannot be split in reporting currency');
select lives_ok($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(231),pg_temp.result(205),jsonb_build_object('revision',0,
  'items','[]'::jsonb,'reason','Keep unallocated'))$$,'unvalued labor accepts an empty project allocation');
select lives_ok($$select public.reconcile_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(232),jsonb_build_object('obligationId',pg_temp.fid(302),
  'version',pg_temp.labor_version(pg_temp.fid(302)),'reason','Reconfirm USD labor','items','[]'::jsonb))$$,
  'unvalued native-currency labor can be reconciled with no project split');
select is((select row(amount,reporting_amount) from public.finance_recognition_entries where id=pg_temp.result(232)),
  row(500::numeric,null::numeric),'reconciled USD payroll keeps its native cost while FX stays unresolved');
select is((select count(*) from public.finance_current_labor_allocations where entry_id=pg_temp.result(232)),0::bigint,
  'reconciled unresolved FX has no fabricated project allocation');

-- Allocation revisions validate rounding, project uniqueness, capacity, version, and retries.
select throws_like($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(210),pg_temp.result(200),jsonb_build_object('revision',0,
  'items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','10.001')),'reason','Wrong precision'))$$,'%finance_input_invalid%','allocation uses reporting-currency minor units');
select throws_like($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(211),pg_temp.result(200),jsonb_build_object('revision',0,
  'items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','10'),jsonb_build_object('projectId',pg_temp.fid(30),'amount','20')),'reason','Duplicate'))$$,'%finance_input_invalid%','project may appear once per revision');
select throws_like($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(212),pg_temp.result(200),jsonb_build_object('revision',0,
  'items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','700'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','601')),'reason','Over cap'))$$,'%finance_labor_overallocated%','allocation cannot exceed reporting cost pool');
select lives_ok($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(213),pg_temp.result(200),jsonb_build_object('revision',0,
  'items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','700'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','600')),'reason','Initial allocation'))$$,'valid split is saved');
select lives_ok($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(213),pg_temp.result(200),jsonb_build_object('revision',0,
  'items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','700'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','600')),'reason','Initial allocation'))$$,'allocation retry is idempotent');
select throws_like($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(213),pg_temp.result(200),jsonb_build_object('revision',0,
  'items','[]'::jsonb,'reason','Changed'))$$,'%finance_request_conflict%','changed allocation retry conflicts');
select throws_like($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(214),pg_temp.result(200),jsonb_build_object('revision',0,
  'items','[]'::jsonb,'reason','Stale'))$$,'%finance_version_conflict%','stale allocation revision rejected');
select is((select count(*) from public.finance_labor_allocation_revisions where entry_id=pg_temp.result(200)),1::bigint,'invalid allocations are atomic');
select lives_ok($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(215),pg_temp.result(200),jsonb_build_object('revision',1,
  'items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','800'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','500')),'reason','Revised split'))$$,'new allocation revision supersedes the prior snapshot');
select is((select sum(amount) from public.finance_current_labor_allocations where entry_id=pg_temp.result(200)),1300::numeric,'current project shares reconcile to labor cost');
select is((select count(*) from public.finance_labor_allocation_revisions where entry_id=pg_temp.result(200)),2::bigint,'prior manual allocation is retained');
select is((select sum(amount) from public.finance_recognized_actuals where classification='labor' and obligation_id=pg_temp.fid(300)),1300::numeric,
  'project attribution does not change the studio labor P&L amount');

-- Reconciliation failure must roll back its cancel-and-replace work; valid replacement preserves studio P&L.
select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(217),pg_temp.result(202),jsonb_build_object('revision',0,
  'items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(31),'amount','100')),'reason','Latest delta split'));
create temporary table labor_before_reconcile as
select (select count(*) from public.finance_recognized_actuals where obligation_id=pg_temp.fid(301)) as active_entries,
  (select sum(amount) from public.finance_recognized_actuals where obligation_id=pg_temp.fid(301)) as active_amount,
  (select count(*) from public.finance_labor_allocation_revisions r join public.finance_recognition_entries e on e.id=r.entry_id where e.obligation_id=pg_temp.fid(301)) as allocations;
select throws_like($$select public.reconcile_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(218),jsonb_build_object('obligationId',pg_temp.fid(301),
  'version',pg_temp.labor_version(pg_temp.fid(301)),'reason','Bad replacement','items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','2000'))))$$,
  '%finance_labor_overallocated%','failed reconciliation rejects an over-cap replacement');
select is(
  (select row((select count(*) from public.finance_recognized_actuals where obligation_id=pg_temp.fid(301)),
    (select sum(amount) from public.finance_recognized_actuals where obligation_id=pg_temp.fid(301)),
    (select count(*) from public.finance_labor_allocation_revisions r join public.finance_recognition_entries e on e.id=r.entry_id where e.obligation_id=pg_temp.fid(301)))),
  (select row(active_entries,active_amount,allocations) from pg_temp.labor_before_reconcile),
  'failed reconciliation leaves old recognized cost and allocations intact');
select lives_ok($$select public.reconcile_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(219),jsonb_build_object('obligationId',pg_temp.fid(301),
  'version',pg_temp.labor_version(pg_temp.fid(301)),'reason','Replace payroll attribution','items',jsonb_build_array(
    jsonb_build_object('projectId',pg_temp.fid(30),'amount','600'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','500'))))$$,
  'valid reconciliation atomically replaces the labor snapshot');
select is((select sum(amount) from public.finance_recognized_actuals where obligation_id=pg_temp.fid(301)),1100::numeric,'reconciliation preserves total studio P&L');
select is((select sum(a.amount) from public.finance_current_labor_allocations a join public.finance_labor_cost_pools p on p.id=a.entry_id where p.obligation_id=pg_temp.fid(301)),
  1100::numeric,'replacement allocations exactly cover the recognized known labor');

-- Future service can be scheduled but cannot be confirmed before it closes.
select public.create_finance_employee_bonus(pg_temp.fid(1),pg_temp.fid(220),jsonb_build_object('employeeId',pg_temp.fid(11),
  'periodStart',pg_temp.month(1),'periodEnd',pg_temp.month(1)+14,'amount','100','currency','UAH','description','Future bonus','dueDate',pg_temp.month(1)+14));
select throws_like($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(221),jsonb_build_object('obligationId',pg_temp.result(220),
  'version','future','reason','Too early'))$$,'%finance_input_invalid%','future service period cannot be confirmed early');

-- Attribution and labor confirmation stay behind the finance-admin boundary.
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select is((select count(*) from public.finance_recognition_entries),0::bigint,'employee cannot read recognition history');
select is((select count(*) from public.finance_labor_allocation_items),0::bigint,'employee cannot read project allocation detail');
select throws_like($$select public.get_finance_labor_sources(pg_temp.fid(1))$$,'%finance_admin_required%','employee cannot inspect labor sources');
select throws_like($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(222),jsonb_build_object('obligationId',pg_temp.fid(300),
  'version','x','reason','Denied'))$$,'%finance_admin_required%','employee cannot confirm labor');
select set_config('request.jwt.claim.sub',pg_temp.fid(13)::text,true);
select is((select count(*) from public.finance_recognition_entries),0::bigint,'foreign studio admin cannot read labor history');
select throws_like($$select public.get_finance_labor_sources(pg_temp.fid(1))$$,'%finance_admin_required%','foreign studio admin cannot inspect labor sources');
select throws_like($$select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(223),pg_temp.result(200),jsonb_build_object('revision',2,
  'items','[]'::jsonb,'reason','Denied'))$$,'%finance_admin_required%','foreign studio admin cannot allocate labor');

select * from finish();
rollback;
