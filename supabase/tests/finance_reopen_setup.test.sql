begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('6d000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Reopen studio'),(pg_temp.fid(2),'Other studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','reopen-'||n||'@test','{}','{}',now(),now() from generate_series(10,12)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Reopen tester','reopen-'||n||'@test',case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active) values
(pg_temp.fid(1),pg_temp.fid(10),'admin',true),(pg_temp.fid(1),pg_temp.fid(11),'employee',true),(pg_temp.fid(2),pg_temp.fid(12),'admin',true);
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
values(pg_temp.fid(30),pg_temp.fid(1),'Keep project',100,pg_temp.today()-20,pg_temp.fid(10),'active');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
values(pg_temp.fid(30),pg_temp.fid(11),'designer',0,pg_temp.today()-20);
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.save_finance_settings(pg_temp.fid(1),'UAH',pg_temp.today()-7);
select public.save_finance_account(pg_temp.fid(1),'Dollars','USD',10,p_request_id=>pg_temp.fid(100));
select public.save_finance_account(pg_temp.fid(1),'Euros','EUR',0,p_request_id=>pg_temp.fid(101));
set local role postgres;
insert into public.finance_schedules(id,studio_id,kind,created_by) values(pg_temp.fid(40),pg_temp.fid(1),'recurring',pg_temp.fid(10));
set local role authenticated;
select public.value_finance_opening(pg_temp.fid(1),(select id from public.finance_accounts where name='Dollars'),
 jsonb_build_object('currency','USD','reportingCurrency','UAH','openingAmount','10','date',pg_temp.today()-7,
 'fx',jsonb_build_object('rate','40','source','manual','effectiveDate',pg_temp.today()-7)));
select public.finalize_finance_setup(pg_temp.fid(1));
select ok(public.can_reopen_finance_setup(pg_temp.fid(1)),'finalized Finance with only setup stock can reopen');
select lives_ok($$select public.reopen_finance_setup(pg_temp.fid(1))$$,'admin reopens history-free setup');
select is((select finalized_at from public.finance_settings where studio_id=pg_temp.fid(1)),null::timestamptz,'setup returns to draft');
select is((select finalized_by from public.finance_settings where studio_id=pg_temp.fid(1)),null::uuid,'finalizer is cleared');
select is((select opening_reporting_amount from public.finance_accounts where name='Dollars'),null::numeric,'old opening FX valuation is cleared');
select is((select recorded_balance from public.finance_account_balances where name='Dollars'),10::numeric,'native opening stock is retained once');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),0::bigint,'reopen creates no ledger entry');
select is((select count(*) from public.finance_schedules where id=pg_temp.fid(40)),1::bigint,'recurring schedule configuration survives reopening');
select is((select name from public.projects where id=pg_temp.fid(30)),'Keep project','project survives reopening');
select is((select count(*) from public.project_members where project_id=pg_temp.fid(30)),1::bigint,'employee assignment survives reopening');
select is((select count(*) from public.studio_members where studio_id=pg_temp.fid(1)),2::bigint,'studio membership survives reopening');
select public.save_finance_settings(pg_temp.fid(1),'EUR',pg_temp.today()-3);
select public.value_finance_opening(pg_temp.fid(1),(select id from public.finance_accounts where name='Dollars'),
 jsonb_build_object('currency','USD','reportingCurrency','EUR','openingAmount','10','date',pg_temp.today()-3,
 'fx',jsonb_build_object('rate','2','source','manual','effectiveDate',pg_temp.today()-3)));
select lives_ok($$select public.finalize_finance_setup(pg_temp.fid(1))$$,'changed start date and reporting currency can be finalized again');
select is((select opening_reporting_amount from public.finance_accounts where name='Dollars'),20::numeric,'new opening valuation replaces the old one');
select is((select recorded_balance from public.finance_account_balances where name='Dollars'),10::numeric,'re-finalization does not double-count opening stock');
select is((select count(*) from public.finance_planning_actuals where studio_id=pg_temp.fid(1)),0::bigint,'opening stock is not income or expense');
select public.record_finance_account_balance(pg_temp.fid(1),pg_temp.fid(102),
 jsonb_build_object('kind','account_opening','accountId',(select id from public.finance_accounts where name='Euros'),
 'date',pg_temp.today(),'amount','5','note',''));
select ok(not public.can_reopen_finance_setup(pg_temp.fid(1)),'dated account opening is substantive ledger history');
select throws_like($$select public.reopen_finance_setup(pg_temp.fid(1))$$,'%finance_reopen_history_exists%','ledger history blocks reopening');
select is((select finalized_at is not null from public.finance_settings where studio_id=pg_temp.fid(1)),true,'blocked reopen keeps setup finalized');
set local role postgres;
select throws_like($$update public.finance_settings set finalized_at=null,finalized_by=null where studio_id=pg_temp.fid(1)$$,'%finance_setup_finalized%','trigger blocks privileged reset when ledger history exists');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select public.reopen_finance_setup(pg_temp.fid(1))$$,'%finance_admin_required%','employee cannot reopen Finance');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select throws_like($$select public.reopen_finance_setup(pg_temp.fid(1))$$,'%finance_admin_required%','another studio cannot reopen Finance');
select public.save_finance_settings(pg_temp.fid(2),'UAH',pg_temp.today()-7);
select public.save_finance_account(pg_temp.fid(2),'Other cash','UAH',0,p_request_id=>pg_temp.fid(103));
select public.finalize_finance_setup(pg_temp.fid(2));
set local role postgres;
insert into public.finance_expected_items(studio_id,direction,amount,currency,category_id,commitment,certainty,created_by)
values(pg_temp.fid(2),'incoming',100,'UAH',
 (select id from public.finance_categories where studio_id=pg_temp.fid(2) and default_key='project_payments'),
 'agreed','fixed',pg_temp.fid(12));
set local role authenticated;
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(2)),0::bigint,'expectation has no ledger movement');
select ok(not public.can_reopen_finance_setup(pg_temp.fid(2)),'persisted financial commitment blocks reopening without cash movement');
select throws_like($$select public.reopen_finance_setup(pg_temp.fid(2))$$,'%finance_reopen_history_exists%','commitment cannot be discarded by reopening');
reset role;
select * from finish();
rollback;
