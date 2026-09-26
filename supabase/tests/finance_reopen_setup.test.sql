begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('6d000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Reopen studio'),(pg_temp.fid(2),'Planning studio'),(pg_temp.fid(3),'Payroll studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','reopen-'||n||'@test','{}','{}',now(),now() from generate_series(10,13)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Reopen tester','reopen-'||n||'@test',case when n=11 then 'employee' else 'admin' end,true from generate_series(10,13)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active) values
(pg_temp.fid(1),pg_temp.fid(10),'admin',true),(pg_temp.fid(1),pg_temp.fid(11),'employee',true),(pg_temp.fid(2),pg_temp.fid(12),'admin',true),(pg_temp.fid(3),pg_temp.fid(13),'admin',true);
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
values(pg_temp.fid(30),pg_temp.fid(1),'Keep project',100,pg_temp.today()-20,pg_temp.fid(10),'active'),
(pg_temp.fid(31),pg_temp.fid(2),'Planning project',100,pg_temp.today()-20,pg_temp.fid(12),'active');
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
select throws_like($$select public.save_finance_settings(pg_temp.fid(1),'UAH','2026-01-01')$$,'%finance_opening_cutover_locked%','non-zero opening cannot silently move to an earlier day');
select throws_like($$select public.save_finance_settings(pg_temp.fid(1),'EUR',pg_temp.today()-7)$$,'%finance_base_currency_locked%','old FX opening cannot silently move to a new reporting currency');
select is((select cutover_date from public.finance_settings where studio_id=pg_temp.fid(1)),pg_temp.today()-7,'rejected date edit preserves original effective day');
select public.save_finance_account(pg_temp.fid(1),'Dollars','USD',0,(select id from public.finance_accounts where name='Dollars'));
select public.save_finance_settings(pg_temp.fid(1),'UAH','2026-01-01');
select lives_ok($$select public.finalize_finance_setup(pg_temp.fid(1))$$,'earlier start date re-finalizes after opening stock is cleared');
select is((select cutover_date from public.finance_settings where studio_id=pg_temp.fid(1)),'2026-01-01'::date,'earlier cutover persists');
select is((select recorded_balance from public.finance_account_balances where name='Dollars'),0::numeric,'cleared opening stays zero after re-finalization');
select is((select count(*) from public.finance_planning_actuals where studio_id=pg_temp.fid(1)),0::bigint,'opening stock is not income or expense');
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(104),jsonb_build_object(
 'kind','incoming','nature','operating','date','2026-01-02','amount','5',
 'accountId',(select id from public.finance_accounts where name='Dollars'),
 'category','Income','description','Historical payment',
 'categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='other_income'),
 'fx',jsonb_build_object('rate','40','source','manual','effectiveDate','2026-01-02')));
select is((select amount from public.finance_planning_actuals where studio_id=pg_temp.fid(1) and financial_date='2026-01-02'),200::numeric,'historical actual is included in reporting after earlier cutover');
select public.record_finance_account_balance(pg_temp.fid(1),pg_temp.fid(102),
 jsonb_build_object('kind','account_opening','accountId',(select id from public.finance_accounts where name='Euros'),
 'date','2026-01-02','amount','5','note','',
 'fx',jsonb_build_object('rate','40','source','manual','effectiveDate','2026-01-02')));
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
insert into public.finance_budget_revisions(studio_id,year,category_id,revision,currency,months,reason,created_by)
values(pg_temp.fid(2),2026,(select id from public.finance_categories where studio_id=pg_temp.fid(2) and default_key='project_payments'),1,'UAH',array_fill(0::numeric,array[12]),'Plan',pg_temp.fid(12));
insert into public.finance_forecast_snapshots(studio_id,name,forecast,created_by)
values(pg_temp.fid(2),'Plan','{"currency":"UAH"}'::jsonb,pg_temp.fid(12));
insert into public.finance_project_terms(studio_id,project_id,stream,revision,mode,amount,currency,reason,created_by)
values(pg_temp.fid(2),pg_temp.fid(31),'design',1,'design',100,'UAH','Agreement',pg_temp.fid(12));
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.fid(3),'UAH',pg_temp.today()-7,pg_temp.fid(13));
insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by)
values(pg_temp.fid(3),'Payroll bank','UAH',0,pg_temp.fid(13));
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
values(pg_temp.fid(50),pg_temp.fid(3),'payroll',pg_temp.fid(13),pg_temp.fid(13));
insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.fid(3),pg_temp.fid(50),1,'Salary',100,'UAH',
 (select id from public.finance_categories where studio_id=pg_temp.fid(3) and default_key='salary'),
 1,15,'2026-01-01','agreed','fixed','net',100,0,0,'fixed','Agreement',pg_temp.fid(13));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(13)::text,true);
select public.finalize_finance_setup(pg_temp.fid(3));
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(2)),0::bigint,'expectation has no ledger movement');
select ok(public.can_reopen_finance_setup(pg_temp.fid(2)),'unsettled commitment and zero opening do not block');
select lives_ok($$select public.reopen_finance_setup(pg_temp.fid(2))$$,'planning-only setup reopens');
select throws_like($$select public.save_finance_settings(pg_temp.fid(2),'EUR',pg_temp.today()-7)$$,'%finance_base_currency_locked%','saved budgets and forecasts keep reporting currency locked');
select public.save_finance_settings(pg_temp.fid(2),'UAH','2026-01-01');
select lives_ok($$select public.finalize_finance_setup(pg_temp.fid(2))$$,'planning-only setup re-finalizes at earlier date');
select is((select count(*) from public.finance_expected_items where studio_id=pg_temp.fid(2)),1::bigint,'unsettled expectation survives');
select is((select count(*) from public.finance_budget_revisions where studio_id=pg_temp.fid(2)),1::bigint,'budget survives');
select is((select count(*) from public.finance_forecast_snapshots where studio_id=pg_temp.fid(2)),1::bigint,'forecast survives');
select is((select count(*) from public.finance_project_terms where studio_id=pg_temp.fid(2)),1::bigint,'project terms survive');
set local role postgres;
insert into public.finance_trips(id,studio_id,title,destination,starts_on,ends_on,created_by)
values(pg_temp.fid(60),pg_temp.fid(2),'Trip','Kyiv','2026-01-02','2026-01-03',pg_temp.fid(12));
insert into public.finance_trip_travelers(studio_id,trip_id,employee_id,employee_name)
values(pg_temp.fid(2),pg_temp.fid(60),pg_temp.fid(12),'Reopen tester');
insert into public.finance_trip_entries(studio_id,trip_id,kind,expense_type,amount,currency,financial_date,employee_id,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,created_by)
values(pg_temp.fid(2),pg_temp.fid(60),'expense','travel',20,'UAH','2026-01-02',pg_temp.fid(12),'UAH',20,1,'identity','2026-01-02',pg_temp.fid(12));
set local role authenticated;
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(2)),0::bigint,'employee-paid trip expense has no cash movement');
select ok(not public.can_reopen_finance_setup(pg_temp.fid(2)),'realized unpaid trip expense blocks reopening');
select throws_like($$select public.reopen_finance_setup(pg_temp.fid(2))$$,'%finance_reopen_history_exists%','realized expense retains historical result');
select set_config('request.jwt.claim.sub',pg_temp.fid(13)::text,true);
select ok(public.can_reopen_finance_setup(pg_temp.fid(3)),'unpaid payroll configuration does not block');
select lives_ok($$select public.reopen_finance_setup(pg_temp.fid(3))$$,'payroll-only setup reopens');
select public.save_finance_settings(pg_temp.fid(3),'UAH','2026-01-01');
select lives_ok($$select public.finalize_finance_setup(pg_temp.fid(3))$$,'payroll-only setup re-finalizes');
select is((select count(*) from public.finance_schedule_terms where studio_id=pg_temp.fid(3)),1::bigint,'payroll configuration survives');
reset role;
select * from finish();
rollback;
