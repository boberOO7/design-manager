begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('6e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.day(offset_days integer default 0) returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date+offset_days$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Balance cutover'),(pg_temp.fid(2),'Other studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','cutover-'||n||'@test','{}','{}',now(),now() from generate_series(10,12)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Cutover tester','cutover-'||n||'@test',case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active) values
(pg_temp.fid(1),pg_temp.fid(10),'admin',true),(pg_temp.fid(1),pg_temp.fid(11),'employee',true),(pg_temp.fid(2),pg_temp.fid(12),'admin',true);
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'UAH',pg_temp.day(-10),pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',100,pg_temp.fid(10)),(pg_temp.fid(21),pg_temp.fid(1),'Archived dollars','USD',2,pg_temp.fid(10));
create function pg_temp.cat(key text) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key=key$$;
create function pg_temp.post(request integer,kind text,day date,amount text,patch jsonb default '{}') returns uuid language sql as $$
 select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(request),jsonb_build_object(
 'kind',kind,'nature','operating','date',day,'amount',amount,'accountId',pg_temp.fid(20),'category','Actual',
 'categoryId',pg_temp.cat(case when kind='outgoing' then 'other_expense' else 'other_income' end))||patch);
$$;
create function pg_temp.change_input(day date,bank text,dollars text,later text) returns jsonb language sql as $$
 select jsonb_build_object('date',day,'previousDate',s.cutover_date,'settingsUpdatedAt',s.updated_at,'reportingCurrency',s.base_currency,'confirmed',true,
 'accounts',(select jsonb_agg(jsonb_build_object('accountId',a.id,'currency',a.currency,'updatedAt',a.updated_at,
 'amount',case a.id when pg_temp.fid(20) then bank when pg_temp.fid(21) then dollars else later end,
 'fx',case when a.currency='USD' then jsonb_build_object('rate','40','source','manual','effectiveDate',day) end) order by case a.id when pg_temp.fid(20) then 0 when pg_temp.fid(21) then 1 else 2 end)
 from public.finance_accounts a where a.studio_id=s.studio_id))
 from public.finance_settings s where s.studio_id=pg_temp.fid(1);
$$;
create function pg_temp.report() returns jsonb language sql as $$select public.get_finance_overview(pg_temp.fid(1),'3','confirmed',jsonb_build_array(jsonb_build_object('currency','USD','rate','40','source','manual','effectiveDate',pg_temp.day())),'3')$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.value_finance_opening(pg_temp.fid(1),pg_temp.fid(21),jsonb_build_object('currency','USD','reportingCurrency','UAH','openingAmount','2','date',pg_temp.day(-10),'fx',jsonb_build_object('rate','40','source','manual','effectiveDate',pg_temp.day(-10))));
select public.finalize_finance_setup(pg_temp.fid(1));
select public.set_finance_account_archived(pg_temp.fid(1),pg_temp.fid(21),true);
create temporary table later as select public.create_finance_account_with_opening(pg_temp.fid(1),pg_temp.fid(100),jsonb_build_object('name','Later cash','currency','UAH','openingBalance','50','date',pg_temp.day(-9))) as id;
select lives_ok($$select pg_temp.post(101,'incoming',pg_temp.day(-11),'25')$$,'pre-cutover actual is accepted');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(20)),100::numeric,'pre-cutover actual does not change balance');
select is((select amount from public.finance_planning_actuals where studio_id=pg_temp.fid(1) and financial_date=pg_temp.day(-11)),25::numeric,'pre-cutover actual remains in reporting on its own date');
select pg_temp.post(102,'incoming',pg_temp.day(-10),'10');
select pg_temp.post(103,'outgoing',pg_temp.day(-10),'3');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(20)),107::numeric,'actuals on cutover day affect balance normally');
select pg_temp.post(104,'transfer',pg_temp.day(-11),'5',jsonb_build_object('destinationId',(select id from later),'receivedAmount','5'));
select is((select recorded_balance from public.finance_account_balances where id=(select id from later)),50::numeric,'pre-cutover transfer does not affect destination balance');
select is((pg_temp.report()->'forecast'->>'cashBase')::numeric,237::numeric,'current and forecast cash use the same date-filtered balance including archived stock');
select is((pg_temp.report()->>'netFlow')::numeric,32::numeric,'historical report includes older actuals and excludes stock openings and transfers');
select is(pg_temp.report()->>'actualFrom',(date_trunc('month',pg_temp.day())-interval '2 months')::date::text,'reporting period is independent of cutover');
select is((pg_temp.report()->'history'->-1->>'amount')::numeric,237::numeric,'dated cash history excludes pre-cutover transactions');
select is((select amount from jsonb_to_recordset(pg_temp.report()->'history') h(date date,amount numeric) where date=pg_temp.day(-10)),187::numeric,'cutover opening plus same-day movements counted once');

select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(110),jsonb_build_object('direction','incoming','amount','17','currency','UAH','categoryId',pg_temp.cat('other_income'),'description','Old receivable','dueDate',pg_temp.day(-30),'expectedDate',pg_temp.day(2),'commitment','agreed','certainty','fixed','established',true));
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(111),jsonb_build_object('direction','outgoing','amount','9','currency','UAH','categoryId',pg_temp.cat('other_expense'),'description','Old payable','dueDate',pg_temp.day(-30),'commitment','agreed','certainty','fixed','established',true));
select is((pg_temp.report()->'forecast'->>'cashBase')::numeric,237::numeric,'unpaid old-origin expectations are not actual cash');
select is((pg_temp.report()->>'receivableTotal')::numeric,17::numeric,'pre-cutover receivable remains outstanding');
select is((select count(*) from jsonb_array_elements(pg_temp.report()->'forecast'->'items')),2::bigint,'old-origin unpaid receivable and payable remain in forecast');
select is((pg_temp.report()->>'netFlow')::numeric,32::numeric,'unpaid old-origin items never become historical actuals');

create temporary table earlier as select pg_temp.change_input(pg_temp.day(-12),'90','1','0') as input;
select lives_ok($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(120),(select input from earlier))$$,'cutover can move earlier after recorded financial movements');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(20)),117::numeric,'earlier cutover adds all newly included signed movements to confirmed opening');
select is((select recorded_balance from public.finance_account_balances where id=(select id from later)),55::numeric,'later dated opening and transfer are each counted once');
select is((pg_temp.report()->'forecast'->>'cashBase')::numeric,212::numeric,'forecast recalculates from the new native balances');
select is((select opening_reporting_amount from public.finance_accounts where id=pg_temp.fid(21)),40::numeric,'archived foreign opening is revalued atomically');
select is((select opening_fx_effective_date from public.finance_accounts where id=pg_temp.fid(21)),pg_temp.day(-12),'opening FX belongs to new cutover date');
select lives_ok($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(120),(select input from earlier))$$,'identical retry recovers without applying openings twice');
select throws_like($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(120),pg_temp.change_input(pg_temp.day(-12),'91','1','0'))$$,'%finance_request_conflict%','changed retry cannot rewrite openings');

select throws_like($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(121),jsonb_set(pg_temp.change_input(pg_temp.day(-5),'999','1.001','0'),'{accounts,2,amount}','"1000"'))$$,'%finance_balance_precision%','invalid later account rolls back the entire cutover');
select is((select cutover_date from public.finance_settings where studio_id=pg_temp.fid(1)),pg_temp.day(-12),'failed change rolls back cutover date');
select is((select opening_balance from public.finance_accounts where id=pg_temp.fid(20)),90::numeric,'failed change rolls back earlier account update');
select is((pg_temp.report()->'forecast'->>'cashBase')::numeric,212::numeric,'failed change leaves cash unchanged');
select throws_like($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(122),jsonb_set(pg_temp.change_input(pg_temp.day(-5),'200','3','40'),'{accounts}','[]'))$$,'%finance_setup_context_changed%','omitting accounts including archived ones is rejected');
select throws_like($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(123),jsonb_set(pg_temp.change_input(pg_temp.day(-5),'200','3','40'),'{accounts,1}',pg_temp.change_input(pg_temp.day(-5),'200','3','40')->'accounts'->0))$$,'%finance_setup_context_changed%','duplicate accounts cannot satisfy confirmation');
select throws_like($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(124),jsonb_set(pg_temp.change_input(pg_temp.day(-5),'200','3','40'),'{confirmed}','false'))$$,'%finance_input_invalid%','explicit opening confirmation is required');
select throws_like($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(125),pg_temp.change_input(pg_temp.day(1),'200','3','40'))$$,'%finance_cutover_future%','future date remains invalid for finalized setup');
select throws_like($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(126),jsonb_set(pg_temp.change_input(pg_temp.day(-5),'200','3','40'),'{previousDate}',to_jsonb(pg_temp.day(-10))))$$,'%finance_setup_context_changed%','stale cutover context is rejected');
select throws_like($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(127),jsonb_set(pg_temp.change_input(pg_temp.day(-5),'200','3','40'),'{accounts,1,fx,effectiveDate}',to_jsonb(pg_temp.day(-10))))$$,'%finance_opening_fx_invalid%','stale foreign opening valuation is rejected atomically');

select lives_ok($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(130),pg_temp.change_input(pg_temp.day(-5),'200','3','40'))$$,'cutover can also move later with confirmed openings');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(20)),200::numeric,'later cutover excludes previously balance-affecting actuals');
select is((select recorded_balance from public.finance_account_balances where id=(select id from later)),40::numeric,'pre-cutover ledger opening is absorbed into confirmed stock, never double-counted');
select is((pg_temp.report()->'forecast'->>'cashBase')::numeric,360::numeric,'forecast and current cash recalculate after later cutover');
select is((pg_temp.report()->'history'->-1->>'amount')::numeric,360::numeric,'dated cash history recalculates after later cutover');
select is((pg_temp.report()->>'netFlow')::numeric,32::numeric,'historical reporting remains unchanged after both date edits');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),5::bigint,'cutover changes neither delete nor rewrite historical movements');
select is((select ledger_entry_count from public.finance_account_balances where id=pg_temp.fid(20)),4::bigint,'lifetime entry count still protects late-opening eligibility');
select is((select count(*) from public.finance_planning_actuals where studio_id=pg_temp.fid(1)),3::bigint,'historical income and expenses survive date changes');
-- Company-paid trip expenses route through the same historical actual posting rule.
set local role postgres;
insert into public.finance_trips(id,studio_id,title,destination,starts_on,ends_on,created_by)
values(pg_temp.fid(30),pg_temp.fid(1),'Historical trip','Kyiv',pg_temp.day(-6),pg_temp.day(-6),pg_temp.fid(10));
set local role authenticated;
select lives_ok($$select public.record_finance_trip_entry(pg_temp.fid(1),pg_temp.fid(131),pg_temp.fid(30),jsonb_build_object(
'kind','expense','expenseType','travel','label','Travel','date',pg_temp.day(-6),'amount','7','currency','UAH','accountId',pg_temp.fid(20)))$$,'pre-cutover company-paid expense is accepted through trip posting');
select is((pg_temp.report()->'forecast'->>'cashBase')::numeric,360::numeric,'historical company-paid trip expense does not change current cash');
select is((pg_temp.report()->>'netFlow')::numeric,25::numeric,'historical company-paid trip expense participates in date-based reporting');
select throws_like($$select public.save_finance_settings(pg_temp.fid(1),'UAH',pg_temp.day(-4))$$,'%finance_setup_finalized%','ordinary settings RPC cannot bypass all-account confirmation');
select throws_like($$insert into private.finance_cutover_context values(pg_temp.fid(1))$$,'%permission denied%','authenticated users cannot unlock opening guards');
select set_config('studioflow.finance_cutover_context','on',true);
select throws_like($$select public.save_finance_account(pg_temp.fid(1),'Bank','UAH',999,pg_temp.fid(20))$$,'%finance_opening_locked%','caller-controlled settings cannot bypass opening guards');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(140),'{}')$$,'%finance_admin_required%','employee cannot change cutover');
select is((select count(*) from public.finance_account_balances where studio_id=pg_temp.fid(1)),0::bigint,'balance view preserves RLS');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select throws_like($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(141),'{}')$$,'%finance_admin_required%','another studio cannot change cutover');
set local role anon;
select throws_like($$select public.change_finance_cutover(pg_temp.fid(1),pg_temp.fid(142),'{}')$$,'%permission denied%','anonymous callers cannot execute cutover RPC');
reset role;
select is((select count(*) from private.finance_cutover_context),0::bigint,'success and failure leave no open guard context');
select throws_like($$update public.finance_movements set financial_date=pg_temp.day() where studio_id=pg_temp.fid(1)$$,'%finance_history_immutable%','historical dates remain immutable');
select * from finish();
rollback;
