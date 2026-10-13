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
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(100),jsonb_build_object('kind','incoming','date',pg_temp.today()-1,'accountId',pg_temp.fid(21),'amount','123.45','categoryId',pg_temp.cat('other_income'),'fx',jsonb_build_object('rate','39','source','manual','effectiveDate',pg_temp.today()-1)));
select pg_temp.expected(101,jsonb_build_object('currency','EUR','dueDate',pg_temp.today()+500,'expectedDate',pg_temp.today()+500));
select pg_temp.expected(102,jsonb_build_object('currency','EUR','dueDate','','expectedDate',''));
select pg_temp.expected(103,jsonb_build_object('currency','EUR','dueDate',pg_temp.today()-1,'expectedDate',''));
select pg_temp.expected(104,jsonb_build_object('currency','EUR','direction','outgoing','categoryId',pg_temp.cat('other_expense'),'dueDate',pg_temp.today()-1,'expectedDate',''));
select pg_temp.expected(105,jsonb_build_object('currency','USD','direction','outgoing','categoryId',pg_temp.cat('other_expense'),'dueDate','','expectedDate',''));
select pg_temp.expected(106,jsonb_build_object('currency','GBP','commitment','tentative','established',false));
select pg_temp.expected(107,jsonb_build_object('currency','CHF','commitment','cancelled','established',false));
select pg_temp.expected(108,jsonb_build_object('currency','AUD','direction','outgoing','categoryId',pg_temp.cat('other_expense'),'dueDate',pg_temp.today()+500,'expectedDate',pg_temp.today()+500));
-- Automatic coverage must occur before discovery and must remain idempotent.
select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(110),jsonb_build_object('kind','recurring','revision',0,'name','Foreign rent','amount','25','currency','EUR','categoryId',pg_temp.cat('rent'),'intervalMonths',1,'payoutDay',15,'paymentMonthOffset',0,'effectiveFrom',date_trunc('month',pg_temp.today())::date,'commitment','agreed','certainty','fixed','reason','FX coverage'));

create function pg_temp.versions() returns jsonb language sql stable as $$select coalesce(jsonb_object_agg(id,version),'{}') from public.finance_expected_items where studio_id=pg_temp.fid(1)$$;
create function pg_temp.check_scope(horizon text,scenario text,period text) returns setof text language plpgsql as $$
declare initial jsonb;context jsonb;before_count bigint;old_report jsonb;canonical jsonb;new_report jsonb;versions jsonb;fx jsonb;
begin
 -- Compare legacy financial values and the canonical single-refresh report from identical sources.
 begin
   initial:=public.get_finance_overview(pg_temp.fid(1),horizon,scenario,'[]',period);
   fx:=pg_temp.fx(pg_temp.old_needed(initial));
   old_report:=public.get_finance_overview(pg_temp.fid(1),horizon,scenario,fx,period);
   raise exception sqlstate 'PZ001' using message='rollback_old_path';
 exception when sqlstate 'PZ001' then null;
 end;
 begin
   canonical:=public.get_finance_overview(pg_temp.fid(1),horizon,scenario,fx,period);
   raise exception sqlstate 'PZ001' using message='rollback_reference';
 exception when sqlstate 'PZ001' then null;
 end;
 context:=public.prepare_finance_overview_fx_context(pg_temp.fid(1),horizon,scenario,period);
 select count(*) into before_count from public.finance_obligations where studio_id=pg_temp.fid(1);
 versions:=pg_temp.versions();
 return next is(context->'requiredCurrencies',pg_temp.old_needed(initial),'same FX scope '||horizon||'/'||scenario||'/'||period);
 new_report:=public.get_finance_overview_after_refresh(pg_temp.fid(1),horizon,scenario,fx,period);
 return next is(new_report,canonical,'complete JSON equals canonical single refresh '||horizon||'/'||scenario||'/'||period);
 -- Legacy double maintenance changes item versions, never the financial fields compared here.
 return next is(jsonb_set(new_report,'{forecast,items}',(select jsonb_agg(i-'version' order by i->>'id') from jsonb_array_elements(new_report->'forecast'->'items')i)),
   jsonb_set(old_report,'{forecast,items}',(select jsonb_agg(i-'version' order by i->>'id') from jsonb_array_elements(old_report->'forecast'->'items')i)),
   'financial JSON equals legacy two-pass valuation');
 perform public.get_finance_overview_fx_context(pg_temp.fid(1),horizon,scenario,period);
 perform public.get_finance_overview_after_refresh(pg_temp.fid(1),horizon,scenario,fx,period);
 return next is(pg_temp.versions(),versions,'discovery/report/retry never advance item versions');
 return next is((select count(*) from public.finance_obligations where studio_id=pg_temp.fid(1)),before_count,'no duplicate schedule occurrences');
end $$;
select pg_temp.check_scope(horizon,scenario,period) from unnest(array['3','6','year','12'])horizon cross join unnest(array['confirmed','planned'])scenario cross join unnest(array['month','3','year'])period;
select is((select reporting_amount from public.finance_movement_entries where movement_id=(select id from public.finance_movements where request_id=pg_temp.fid(100))),'4814.55'::numeric,'stored historical manual valuation remains unchanged');
select throws_like($$select public.get_finance_overview_fx_context(pg_temp.fid(1),'bad')$$,'%finance_input_invalid%','invalid horizon denied');
select throws_like($$select public.get_finance_overview_fx_context(pg_temp.fid(1),'3','bad')$$,'%finance_input_invalid%','invalid scenario denied');
select throws_like($$select public.get_finance_overview_fx_context(pg_temp.fid(1),'3','confirmed','bad')$$,'%finance_input_invalid%','invalid period denied');
select throws_like($$select public.get_finance_overview_fx_context(pg_temp.fid(2))$$,'%finance_admin_required%','cross-tenant context denied');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select public.get_finance_overview_fx_context(pg_temp.fid(1))$$,'%finance_admin_required%','employee context denied');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select throws_like($$select public.get_finance_overview_fx_context(pg_temp.fid(1))$$,'%finance_admin_required%','other tenant admin denied');

select throws_like($$select public.prepare_finance_overview_fx_context(pg_temp.fid(1))$$,'%finance_admin_required%','other tenant denied preparation');
select throws_like($$select public.get_finance_overview_after_refresh(pg_temp.fid(1))$$,'%finance_admin_required%','other tenant denied read-only reporting');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select public.prepare_finance_overview_fx_context(pg_temp.fid(1))$$,'%finance_admin_required%','employee denied preparation');
select throws_like($$select public.get_finance_overview_after_refresh(pg_temp.fid(1))$$,'%finance_admin_required%','employee denied read-only reporting');
reset role;
select ok(not has_function_privilege('anon','public.get_finance_overview_fx_context(uuid,text,text,text)','execute'),'anonymous cannot execute context RPC');
select ok(not has_function_privilege('service_role','public.get_finance_overview_fx_context(uuid,text,text,text)','execute'),'context RPC uses caller permissions');
select ok(not has_function_privilege('anon','public.prepare_finance_overview_fx_context(uuid,text,text,text)','execute'),'anonymous cannot prepare');
select ok(not has_function_privilege('anon','public.get_finance_overview_after_refresh(uuid,text,text,jsonb,text)','execute'),'anonymous cannot report');
select ok(not has_function_privilege('service_role','public.prepare_finance_overview_fx_context(uuid,text,text,text)','execute'),'preparation retains caller permissions');
select ok(not has_function_privilege('service_role','public.get_finance_overview_after_refresh(uuid,text,text,jsonb,text)','execute'),'report retains caller permissions');
select * from finish();
rollback;
