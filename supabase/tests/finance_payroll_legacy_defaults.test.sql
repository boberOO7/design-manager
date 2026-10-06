begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('6d000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',now() at time zone 'Europe/Kyiv')+make_interval(months=>n))::date$$;
create function pg_temp.cat() returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'$$;
create function pg_temp.terms(employee integer) returns jsonb language sql stable as $$
select to_jsonb(t) from public.finance_schedule_terms t join public.finance_schedules s on s.studio_id=t.studio_id and s.id=t.schedule_id
where s.studio_id=pg_temp.fid(1) and s.employee_id=pg_temp.fid(employee) order by t.revision desc limit 1$$;
create function pg_temp.obligation(employee integer,period date) returns uuid language sql stable as $$
select id from public.finance_obligations where studio_id=pg_temp.fid(1) and employee_id=pg_temp.fid(employee) and period_start=period$$;
create function pg_temp.payout(employee integer,period date) returns uuid language sql stable as $$
select expected_item_id from public.finance_obligation_items where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.obligation(employee,period) and component='payout' and managed_active$$;

insert into public.studios(id,name) values(pg_temp.fid(1),'Legacy payroll defaults');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','legacy-payroll-'||n||'@test','{}','{}',now(),now() from generate_series(10,19)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Legacy payroll '||n,'legacy-payroll-'||n||'@test',case when n=10 then 'admin' else 'employee' end,true from generate_series(10,19)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(1),pg_temp.fid(n),case when n=10 then 'admin' else 'employee' end,true from generate_series(10,19)n;
-- Simulate a studio that already activated management accounting last month.
insert into public.finance_settings(studio_id,base_currency,cutover_date,recognition_start_month,created_by)
values(pg_temp.fid(1),'UAH',pg_temp.month(-1),pg_temp.month(-1),pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',100000,pg_temp.fid(10));
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
select pg_temp.fid(100+n),pg_temp.fid(1),'payroll',pg_temp.fid(n),pg_temp.fid(10) from generate_series(11,18)n where n<>13;
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,
  effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
select pg_temp.fid(200+n),pg_temp.fid(1),pg_temp.fid(100+n),1,'Salary',1000,'UAH',pg_temp.cat(),1,15,1,pg_temp.month(-1),
  'agreed','fixed','net',1000,case when n=14 then 50 else null end,case when n=15 then null when n=14 then 75 else 0 end,
  case when n=15 then 'unknown' else 'fixed' end,'Legacy blank deduction',pg_temp.fid(10)
from generate_series(11,18)n where n<>13;
update public.finance_schedules set stopped_from=pg_temp.month(1) where id=pg_temp.fid(116);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.finalize_finance_setup(pg_temp.fid(1));
select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(31),jsonb_build_object('kind','payroll','employeeId',pg_temp.fid(13),
  'revision',0,'name','Intentional unknown','amount','1000','currency','UAH','categoryId',pg_temp.cat(),'basis','net','employeePayout','1000',
  'employeeDeductionsUnknown','true','employerCost','0','employerCostStatus','fixed','intervalMonths',1,'payoutDay',15,'paymentMonthOffset',1,
  'effectiveFrom',pg_temp.month(-1),'commitment','agreed','certainty','fixed','reason','Clarify later'));
select public.ensure_finance_schedule_occurrences(pg_temp.fid(1),'12');
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(32),pg_temp.payout(12,pg_temp.month(-1)),
  jsonb_build_object('kind','outgoing','date',(now() at time zone 'Europe/Kyiv')::date,'amount','1000','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),1000);
select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(33),jsonb_build_object('obligationId',pg_temp.obligation(12,pg_temp.month(-1)),
  'version',(select s->>'version' from jsonb_array_elements(public.get_finance_labor_sources(pg_temp.fid(1))) s where s->>'obligationId'=pg_temp.obligation(12,pg_temp.month(-1))::text),'reason','Confirm known salary'));
select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(34),jsonb_build_object('obligationId',pg_temp.obligation(17,pg_temp.month(-1)),
  'component','deductions','revision',0,'status','unknown','amount','','reason','Intentional historical unknown'));
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(35),pg_temp.payout(18,pg_temp.month(2)),
  jsonb_build_object('kind','outgoing','date',(now() at time zone 'Europe/Kyiv')::date,'amount','100','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),100);
-- A discarded zero revision must not erase the restored agreement's explicit unknown.
select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(36),jsonb_build_object('kind','payroll','employeeId',pg_temp.fid(19),
  'revision',0,'name','Restored unknown','amount','1000','currency','UAH','categoryId',pg_temp.cat(),'basis','net','employeePayout','1000',
  'employeeDeductionsUnknown','true','employerCost','0','employerCostStatus','fixed','intervalMonths',1,'payoutDay',15,'paymentMonthOffset',1,
  'effectiveFrom',pg_temp.month(-1),'commitment','agreed','certainty','fixed','reason','Intentional unknown'));
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(37),pg_temp.payout(19,pg_temp.month(-1)),
  jsonb_build_object('kind','outgoing','date',(now() at time zone 'Europe/Kyiv')::date,'amount','1000','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),1000);
select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(38),jsonb_build_object('id',pg_temp.terms(19)->>'schedule_id','kind','payroll','employeeId',pg_temp.fid(19),
  'revision',1,'name','Zero revision','amount','1000','currency','UAH','categoryId',pg_temp.cat(),'basis','net','employeePayout','1000',
  'employeeDeductions','0','employerCost','0','employerCostStatus','fixed','intervalMonths',1,'payoutDay',15,'paymentMonthOffset',1,
  'effectiveFrom',pg_temp.month(1),'commitment','agreed','certainty','fixed','reason','Later discarded'));
select public.delete_unconsumed_finance_payroll_revision(pg_temp.fid(1),pg_temp.fid(39),(pg_temp.terms(19)->>'schedule_id')::uuid,2);
reset role;
create temp table original_history as
select (select to_jsonb(t) from public.finance_schedule_terms t where id=pg_temp.fid(212)) as paid_terms,
  (select jsonb_agg(to_jsonb(e) order by id) from public.finance_recognition_entries e where studio_id=pg_temp.fid(1)) as recognition,
  (select jsonb_agg(to_jsonb(r) order by id) from public.finance_payroll_cost_revisions r where studio_id=pg_temp.fid(1)) as cost_revisions,
  (select jsonb_agg(to_jsonb(m) order by id) from public.finance_movements m where studio_id=pg_temp.fid(1)) as cash;
\ir ../migrations/20261006152334_payroll_legacy_blank_deductions_zero.sql
select is((pg_temp.terms(11)->>'employee_deductions')::numeric,0::numeric,'legacy blank deductions become zero without editing each salary');
select is((pg_temp.terms(11)->>'revision')::integer,1,'unused legacy term is normalized in place');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(11,pg_temp.month())))->>'deductionsStatus','fixed','current labor model treats legacy zero as complete');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(11,pg_temp.month())))->>'knownCost','1000','legacy zero leaves salary cost unchanged');
select is((pg_temp.terms(13)->>'employee_deductions')::numeric,0::numeric,'one-time normalization includes existing explicit unknown deductions');
select is((pg_temp.terms(19)->>'employee_deductions')::numeric,0::numeric,'restored blank deductions also default to zero');
select is((pg_temp.terms(19)->>'revision')::integer,2,'restored consumed agreement receives zero defaults in a forward revision');
select is((pg_temp.terms(14)->>'employee_deductions')::numeric,50::numeric,'existing nonzero deduction remains unchanged');
select is((pg_temp.terms(14)->>'employer_cost')::numeric,75::numeric,'known employer contribution remains unchanged');
select is((pg_temp.terms(15)->>'employee_deductions')::numeric,0::numeric,'deductions default independently of employer intent');
select is((pg_temp.terms(15)->>'employer_cost')::numeric,0::numeric,'existing blank employer cost defaults to zero');
select is(pg_temp.terms(15)->>'employer_cost_status','fixed','zero employer cost is complete');
select is(pg_temp.terms(16)->>'employee_deductions',null::text,'stopped payroll history is not normalized');
select is((pg_temp.terms(12)->>'revision')::integer,2,'consumed salary receives a forward revision');
select is((pg_temp.terms(12)->>'effective_from')::date,pg_temp.month(1),'consumed salary defaults start next service month');
select is((pg_temp.terms(12)->>'employee_deductions')::numeric,0::numeric,'future consumed-salary configuration has known zero');
select is((select to_jsonb(t) from public.finance_schedule_terms t where id=pg_temp.fid(212)),(select paid_terms from original_history),'paid salary terms are byte-for-byte unchanged');
select is((select terms_id from public.finance_obligations where id=pg_temp.obligation(12,pg_temp.month(-1))),pg_temp.fid(212),'paid occurrence retains historical terms');
select is((select terms_id from public.finance_obligations where id=pg_temp.obligation(12,pg_temp.month(1))),(pg_temp.terms(12)->>'id')::uuid,'future unpaid occurrence uses zero-default terms');
select is((pg_temp.terms(17)->>'employee_deductions')::numeric,0::numeric,'historical cost revision only permits future term defaults');
select is((pg_temp.terms(18)->>'effective_from')::date,pg_temp.month(3),'a partially paid future occurrence remains protected');
select is((select jsonb_agg(to_jsonb(e) order by id) from public.finance_recognition_entries e where studio_id=pg_temp.fid(1)),(select recognition from original_history),'recognition entries and snapshots remain unchanged');
select is((select jsonb_agg(to_jsonb(r) order by id) from public.finance_payroll_cost_revisions r where studio_id=pg_temp.fid(1)
  and id in (select (e->>'id')::uuid from original_history h cross join lateral jsonb_array_elements(h.cost_revisions) e)),
  (select cost_revisions from original_history),'original historical cost revisions remain unchanged');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(12,pg_temp.month(-1))))->>'deductionsStatus','fixed','recognized legacy period has known zero deductions');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(12,pg_temp.month()))) ->>'deductionsStatus','fixed','current unrecognized occurrence of a consumed term has known zero deductions');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(12,pg_temp.month(-1))))->>'remainingCost','0','zero completion does not add recognized cost');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(17,pg_temp.month(-1))))->>'deductionsStatus','fixed','old unknown completion receives a new zero fact');
select is((select count(*) from public.finance_payroll_cost_revisions where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.obligation(17,pg_temp.month(-1)) and component='deductions'),2::bigint,'old unknown fact is retained alongside the zero completion');
select is((select jsonb_agg(to_jsonb(m) order by id) from public.finance_movements m where studio_id=pg_temp.fid(1)),(select cash from original_history),'cash movements remain unchanged');
create temp table normalized as select jsonb_agg(to_jsonb(t) order by id) as value from public.finance_schedule_terms t where studio_id=pg_temp.fid(1);
\ir ../migrations/20261006152334_payroll_legacy_blank_deductions_zero.sql
select is((select jsonb_agg(to_jsonb(t) order by id) from public.finance_schedule_terms t where studio_id=pg_temp.fid(1)),(select value from normalized),'repeating the compatibility normalization is idempotent');
-- The one-time compatibility pass does not change the explicit choice available
-- to an administrator on later saves.
set local role authenticated;
select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(40),jsonb_build_object('id',pg_temp.terms(13)->>'schedule_id',
  'kind','payroll','employeeId',pg_temp.fid(13),'revision',1,'name','Intentional later unknown','amount','1000',
  'currency','UAH','categoryId',pg_temp.cat(),'basis','net','employeePayout','1000','employeeDeductionsUnknown','true',
  'employerCost','','employerCostStatus','unknown','intervalMonths',1,'payoutDay',15,'paymentMonthOffset',1,'effectiveFrom',pg_temp.month(-1),
  'commitment','agreed','certainty','fixed','reason','Explicit later choice'));
select is(pg_temp.terms(13)->>'employee_deductions',null::text,'later intentional unknown deductions stay supported');
select is(pg_temp.terms(13)->>'employer_cost_status','unknown','later intentional unknown employer cost stays supported');
reset role;
select * from finish();
rollback;
