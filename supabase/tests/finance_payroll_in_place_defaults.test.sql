begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('6e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',now() at time zone 'Europe/Kyiv')+make_interval(months=>n))::date$$;
create function pg_temp.cat() returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'$$;
create function pg_temp.obligation(employee integer) returns uuid language sql stable as $$select id from public.finance_obligations where studio_id=pg_temp.fid(1) and employee_id=pg_temp.fid(employee) and period_start=pg_temp.month(-1)$$;
create function pg_temp.payout(employee integer) returns uuid language sql stable as $$select expected_item_id from public.finance_obligation_items where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.obligation(employee) and component='payout'$$;

insert into public.studios(id,name) values(pg_temp.fid(1),'In-place payroll zero correction');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','in-place-payroll-'||n||'@test','{}','{}',now(),now() from generate_series(10,16)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'In-place payroll '||n,'in-place-payroll-'||n||'@test',case when n=10 then 'admin' else 'employee' end,true from generate_series(10,16)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(1),pg_temp.fid(n),case when n=10 then 'admin' else 'employee' end,true from generate_series(10,16)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,recognition_start_month,created_by)
values(pg_temp.fid(1),'UAH',pg_temp.month(-1),pg_temp.month(-1),pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
values(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',100000,pg_temp.fid(10));
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
select pg_temp.fid(100+n),pg_temp.fid(1),'payroll',pg_temp.fid(n),pg_temp.fid(10) from generate_series(11,16)n;
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,
effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
select pg_temp.fid(200+n),pg_temp.fid(1),pg_temp.fid(100+n),1,'Salary',1000,'UAH',pg_temp.cat(),1,15,1,pg_temp.month(-1),
 'agreed','fixed',case when n=15 then 'gross' else 'net' end,case when n=15 then 800 else 1000 end,
 case when n=12 then 50 when n=14 then 100 when n=15 then 200 else null end,
 case when n=11 or n=14 or n=15 then null when n=12 then 75 when n=13 then 25 else 0 end,
 case when n=11 or n=14 or n=15 then 'unknown' when n=13 then 'estimated' else 'fixed' end,'Original salary',pg_temp.fid(10)
from generate_series(11,16)n;
update public.finance_schedules set stopped_from=pg_temp.month(1) where id=pg_temp.fid(116);
insert into public.finance_schedules(id,studio_id,kind,created_by) values(pg_temp.fid(150),pg_temp.fid(1),'recurring',pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,effective_from,
commitment,certainty,reason,created_by)
values(pg_temp.fid(250),pg_temp.fid(1),pg_temp.fid(150),1,'Rent',100,'UAH',
(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='rent'),1,15,pg_temp.month(-1),'agreed','fixed','Recurring has no payroll extras',pg_temp.fid(10));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.finalize_finance_setup(pg_temp.fid(1));
select public.ensure_finance_schedule_occurrences(pg_temp.fid(1),'12');
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(30),pg_temp.payout(11),
jsonb_build_object('kind','outgoing','date',(now() at time zone 'Europe/Kyiv')::date,'amount','1000','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),1000);
select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(31),jsonb_build_object('obligationId',pg_temp.obligation(11),
'version',(select s->>'version' from jsonb_array_elements(public.get_finance_labor_sources(pg_temp.fid(1)))s where s->>'obligationId'=pg_temp.obligation(11)::text),'reason','Recognize known salary'));
select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(32),jsonb_build_object('obligationId',pg_temp.obligation(14),
'component','employer_cost','revision',0,'status','unknown','amount','','reason','Explicitly unknown period cost'));
reset role;
savepoint explicit_unknown;
\set ON_ERROR_STOP off
\ir ../migrations/20261006205034_payroll_legacy_optional_costs_in_place.sql
\set correction_sqlstate :SQLSTATE
\set ON_ERROR_STOP on
rollback to explicit_unknown;
select is(:'correction_sqlstate'::text,'P0001'::text,'explicit unknown period cost prevents blanket correction');
select ok((select employer_cost is null from public.finance_schedule_terms where id=pg_temp.fid(214)),
'explicit unknown keeps its original term and existing completion path');
select is((select tgenabled::text from pg_trigger where tgrelid='public.finance_schedule_terms'::regclass and tgname='finance_payroll_term_edit_guard'),'O',
'aborted correction leaves the history guard enabled');
set local role authenticated;
select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(33),jsonb_build_object('obligationId',pg_temp.obligation(14),
'component','employer_cost','revision',1,'status','fixed','amount','0','reason','Confirm zero through existing workflow'));
reset role;
create temp table before_terms as select t.id,to_jsonb(t) as value from public.finance_schedule_terms t where studio_id=pg_temp.fid(1);
create temp table before_finance as select
 (select jsonb_agg(to_jsonb(o) order by id) from public.finance_obligations o where studio_id=pg_temp.fid(1)) as obligations,
 (select jsonb_agg(to_jsonb(e) order by id) from public.finance_expected_items e where studio_id=pg_temp.fid(1)) as expectations,
 (select jsonb_agg(to_jsonb(r) order by id) from public.finance_recognition_entries r where studio_id=pg_temp.fid(1)) as recognition,
 (select jsonb_agg(to_jsonb(m) order by id) from public.finance_movements m where studio_id=pg_temp.fid(1)) as cash,
 pg_get_functiondef('private.guard_finance_payroll_term_edit()'::regprocedure) as guard;
\ir ../migrations/20261006205034_payroll_legacy_optional_costs_in_place.sql
select is((select count(*) from public.finance_schedule_terms t join public.finance_schedules s on s.studio_id=t.studio_id and s.id=t.schedule_id
 where t.studio_id=pg_temp.fid(1) and s.kind='payroll' and (t.employee_deductions is null or t.employer_cost is null)),0::bigint,'all existing payroll blanks are corrected in place, including consumed and stopped terms');
select ok(not exists(select 1 from public.finance_schedule_terms t join before_terms b on b.id=t.id
 where to_jsonb(t)-array['employee_deductions','employer_cost','employer_cost_status'] is distinct from b.value-array['employee_deductions','employer_cost','employer_cost_status']),
'salary amount, payout dates, revision, basis and all other term fields are unchanged');
select is((select count(*) from public.finance_schedule_terms where studio_id=pg_temp.fid(1)),(select count(*) from before_terms),'no forward amendments are created');
select is((select to_jsonb(t) from public.finance_schedule_terms t where id=pg_temp.fid(212)),(select value from before_terms where id=pg_temp.fid(212)),'existing nonzero components are unchanged');
select is((select employer_cost_status from public.finance_schedule_terms where id=pg_temp.fid(211)),'fixed','blank employer cost becomes confirmed zero');
select is((select employer_cost_status from public.finance_schedule_terms where id=pg_temp.fid(213)),'estimated','known estimated employer cost remains estimated');
select is((select employee_deductions from public.finance_schedule_terms where id=pg_temp.fid(214)),100::numeric,'nonzero deductions survive employer zero completion');
select is((select amount-employee_payout-employee_deductions from public.finance_schedule_terms where id=pg_temp.fid(215)),0::numeric,'Gross formula is preserved');
select is((select to_jsonb(t) from public.finance_schedule_terms t where id=pg_temp.fid(250)),(select value from before_terms where id=pg_temp.fid(250)),'recurring terms retain their unrelated null payroll fields');
select is((select jsonb_agg(to_jsonb(o) order by id) from public.finance_obligations o where studio_id=pg_temp.fid(1)),(select obligations from before_finance),'all occurrences retain their original terms and dates');
select is((select jsonb_agg(to_jsonb(e) order by id) from public.finance_expected_items e where studio_id=pg_temp.fid(1)),(select expectations from before_finance),'expected payments are unchanged');
select is((select jsonb_agg(to_jsonb(r) order by id) from public.finance_recognition_entries r where studio_id=pg_temp.fid(1)),(select recognition from before_finance),'recognized amounts and original snapshots are unchanged');
select is((select jsonb_agg(to_jsonb(m) order by id) from public.finance_movements m where studio_id=pg_temp.fid(1)),(select cash from before_finance),'cash movements are unchanged');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(11)))->>'deductionsStatus','fixed','recognized payroll reads known-zero deductions');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(11)))->>'employerStatus','fixed','recognized payroll reads known-zero employer costs');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(11)))->>'remainingCost','0','known zero creates no additional amount to recognize');
select is(pg_get_functiondef('private.guard_finance_payroll_term_edit()'::regprocedure),(select guard from before_finance),'the normal history guard definition is unchanged');
select is((select tgenabled::text from pg_trigger where tgrelid='public.finance_schedule_terms'::regclass and tgname='finance_payroll_term_edit_guard'),'O','history guard is enabled after correction');
create temp table corrected_terms as select jsonb_agg(to_jsonb(t) order by id) as value from public.finance_schedule_terms t where studio_id=pg_temp.fid(1);
\ir ../migrations/20261006205034_payroll_legacy_optional_costs_in_place.sql
select is((select jsonb_agg(to_jsonb(t) order by id) from public.finance_schedule_terms t where studio_id=pg_temp.fid(1)),(select value from corrected_terms),'repeating the correction is idempotent');
set local role authenticated;
select set_config('studioflow.finance_payroll_draft_edit','on',true);
select throws_ok(format('update public.finance_schedule_terms set amount=1001,employee_payout=1001 where id=%L',pg_temp.fid(211)),
'42501','permission denied for table finance_schedule_terms','the browser admin role still cannot update terms directly');
reset role;
select throws_ok(format('update public.finance_schedule_terms set amount=1001,employee_payout=1001 where id=%L',pg_temp.fid(211)),
'P0001','finance_history_immutable','the normal RPC edit context still protects a consumed salary');
select * from finish();
rollback;
