begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('7f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'FX context'),(pg_temp.fid(2),'Other studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','fx-context-'||n||'@test','{}','{}',now(),now() from generate_series(10,12)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'FX tester','fx-context-'||n||'@test',case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active) values
(pg_temp.fid(1),pg_temp.fid(10),'admin',true),(pg_temp.fid(1),pg_temp.fid(11),'employee',true),(pg_temp.fid(2),pg_temp.fid(12),'admin',true);
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'UAH',pg_temp.today()-30,pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'Base bank','UAH',1000,pg_temp.fid(10)),(pg_temp.fid(21),pg_temp.fid(1),'Foreign bank','USD',0,pg_temp.fid(10)),(pg_temp.fid(22),pg_temp.fid(1),'Zero bank','EUR',0,pg_temp.fid(10));
create function pg_temp.cat(key text) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key=key$$;
create function pg_temp.expected(n integer,patch jsonb default '{}') returns uuid language sql as $$select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('direction','incoming','amount','10','currency','UAH','categoryId',pg_temp.cat('other_income'),'description','FX item','dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),'commitment','agreed','certainty','fixed','established',true)||patch)$$;
-- Reproduce the old application's exact discovery from the complete report.
create function pg_temp.old_needed(report jsonb) returns jsonb language sql as $$
select coalesce(jsonb_agg(currency order by currency),'[]'::jsonb) from (
  select distinct currency from (
    select jsonb_array_elements_text(report->'requiredCurrencies') currency
    union all select i->>'currency' from jsonb_array_elements(report->'forecast'->'items') i where i->>'reportingAmount' is null
    union all select i->>'currency' from jsonb_array_elements(report->'forecast'->'issues') i where i->>'reason'='missing_fx'
  ) sources where currency<>report->'forecast'->>'currency'
) needed;
$$;
create function pg_temp.fx(currencies jsonb) returns jsonb language sql as $$select coalesce(jsonb_agg(jsonb_build_object('currency',c,'rate','40.1234567891','source','manual','effectiveDate',pg_temp.today()) order by c),'[]') from jsonb_array_elements_text(currencies)c$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.finalize_finance_setup(pg_temp.fid(1));
select is(public.get_finance_overview_fx_context(pg_temp.fid(1))->'requiredCurrencies','[]'::jsonb,'identity and zero-balance accounts need no provider');
select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(110),jsonb_build_object('kind','recurring','revision',0,'name','Base rent','amount','25','currency','UAH','categoryId',pg_temp.cat('rent'),'intervalMonths',1,'payoutDay',15,'paymentMonthOffset',0,'effectiveFrom',date_trunc('month',pg_temp.today())::date,'commitment','agreed','certainty','fixed','reason','No FX regression'));
create function pg_temp.versions() returns jsonb language sql stable as $$select jsonb_object_agg(id,version) from public.finance_expected_items where studio_id=pg_temp.fid(1)$$;
create function pg_temp.state() returns jsonb language sql stable as $$select jsonb_build_object(
 'items',(select jsonb_agg(to_jsonb(i) order by id) from public.finance_expected_items i where studio_id=pg_temp.fid(1)),
 'obligations',(select jsonb_agg(to_jsonb(o) order by id) from public.finance_obligations o where studio_id=pg_temp.fid(1)),
 'movements',(select jsonb_agg(to_jsonb(m) order by id) from public.finance_movements m where studio_id=pg_temp.fid(1)),
 'snapshots',(select jsonb_agg(to_jsonb(s) order by id) from public.finance_forecast_snapshots s where studio_id=pg_temp.fid(1)))$$;
create function pg_temp.check_no_fx(horizon text,scenario text,period text) returns setof text language plpgsql as $$
declare canonical jsonb;actual jsonb;context jsonb;state jsonb;versions jsonb;begin
 begin
   canonical:=public.get_finance_overview(pg_temp.fid(1),horizon,scenario,'[]',period);
   raise exception sqlstate 'PZ001' using message='rollback_reference';
 exception when sqlstate 'PZ001' then null;end;
 context:=public.prepare_finance_overview_fx_context(pg_temp.fid(1),horizon,scenario,period);
 return next is(context->'requiredCurrencies','[]'::jsonb,'no provider currencies in native fixture');
 state:=pg_temp.state();versions:=pg_temp.versions();
 actual:=public.get_finance_overview_after_refresh(pg_temp.fid(1),horizon,scenario,'[]',period);
 return next is(actual,canonical,'no-FX complete JSON and versions equal one canonical refresh');
 perform public.get_finance_overview_fx_context(pg_temp.fid(1),horizon,scenario,period);
 perform public.get_finance_overview_after_refresh(pg_temp.fid(1),horizon,scenario,'[]',period);
 return next is(pg_temp.state(),state,'no-FX discovery/report retries change no persisted data');
 return next is(pg_temp.versions(),versions,'no additional generated-item version changes');
end $$;
select pg_temp.check_no_fx(horizon,scenario,period) from unnest(array['3','6','year','12'])horizon cross join unnest(array['confirmed','planned'])scenario cross join unnest(array['month','3','year'])period;
select public.save_finance_forecast_snapshot(pg_temp.fid(1),pg_temp.fid(112),'Native historical snapshot','3','confirmed','[]');
select pg_temp.check_no_fx('3','confirmed','month');

-- Simulate missing coverage for a newly due foreign schedule using only this rollback fixture.
select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(111),jsonb_build_object('kind','recurring','revision',0,'name','Foreign rent','amount','25','currency','EUR','categoryId',pg_temp.cat('rent'),'intervalMonths',1,'payoutDay',15,'paymentMonthOffset',0,'effectiveFrom',date_trunc('month',pg_temp.today())::date,'commitment','agreed','certainty','fixed','reason','Coverage ordering'));
reset role;
set local session_replication_role=replica;
delete from public.finance_obligation_items where studio_id=pg_temp.fid(1) and obligation_id in (select id from public.finance_obligations where studio_id=pg_temp.fid(1) and schedule_id=(select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(111)));
delete from public.finance_expected_items where studio_id=pg_temp.fid(1) and currency='EUR';
delete from public.finance_obligations where studio_id=pg_temp.fid(1) and schedule_id=(select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(111));
set local session_replication_role=origin;
set local role authenticated;
select is(public.get_finance_overview_fx_context(pg_temp.fid(1),'3','confirmed','month')->'requiredCurrencies','[]'::jsonb,'read-only discovery does not generate missing coverage');
select is((select count(*) from public.finance_expected_items where studio_id=pg_temp.fid(1) and currency='EUR'),0::bigint,'discovery is non-mutating');
select is(public.prepare_finance_overview_fx_context(pg_temp.fid(1),'3','confirmed','month')->'requiredCurrencies','["EUR"]'::jsonb,'preparation refreshes before discovering the newly generated currency');
select is((select count(*) from public.finance_expected_items where studio_id=pg_temp.fid(1) and currency='EUR'),3::bigint,'only required foreign occurrences generated');
create function pg_temp.check_read_only() returns setof text language plpgsql as $$declare state jsonb;begin
 state:=pg_temp.state();
 perform public.get_finance_overview_after_refresh(pg_temp.fid(1),'3','confirmed',pg_temp.fx('["EUR"]'),'month');
 perform public.get_finance_overview_fx_context(pg_temp.fid(1),'3','confirmed','month');
 return next is(pg_temp.state(),state,'valued report and discovery mutate neither schedule data nor snapshots');
end $$;
select pg_temp.check_read_only();
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),0::bigint,'preparation/discovery/report create no cash movements');
set local transaction_read_only=on;
select is(public.get_finance_overview_fx_context(pg_temp.fid(1),'3','confirmed','month')->'requiredCurrencies','["EUR"]'::jsonb,'discovery works in an enforced read-only transaction');
select is((public.get_finance_overview_after_refresh(pg_temp.fid(1),'3','confirmed',pg_temp.fx('["EUR"]'),'month')->>'outgoingTotal')::numeric,1028.09::numeric,'valued reporting works in an enforced read-only transaction');
select * from finish();
rollback;
