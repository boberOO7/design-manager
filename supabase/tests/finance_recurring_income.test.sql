begin;
select no_plan();
create function pg_temp.i(n integer) returns uuid language sql immutable as $$select ('7e110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',now() at time zone 'Europe/Kyiv')+make_interval(months=>n))::date$$;
insert into public.studios(id,name) values(pg_temp.i(1),'Recurring income test'),(pg_temp.i(2),'Other income studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.i(10),'authenticated','authenticated','recurring-income-admin@test','{}','{}',now(),now()),
(pg_temp.i(11),'authenticated','authenticated','recurring-income-employee@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active) values
(pg_temp.i(10),'Income admin','recurring-income-admin@test','admin',true),(pg_temp.i(11),'Employee','recurring-income-employee@test','employee',true);
insert into public.studio_members(studio_id,user_id,system_role) values(pg_temp.i(1),pg_temp.i(10),'admin'),(pg_temp.i(1),pg_temp.i(11),'employee');
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values
(pg_temp.i(1),'UAH',pg_temp.month(-3),pg_temp.i(10)),(pg_temp.i(2),'UAH',pg_temp.month(-3),pg_temp.i(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.i(20),pg_temp.i(1),'Income bank','UAH',100,pg_temp.i(10)),
(pg_temp.i(21),pg_temp.i(2),'Foreign bank','UAH',0,pg_temp.i(10)),
(pg_temp.i(22),pg_temp.i(1),'USD bank','USD',0,pg_temp.i(10)),
(pg_temp.i(23),pg_temp.i(1),'Archived bank','UAH',0,pg_temp.i(10));
update public.finance_accounts set archived_at=now() where id=pg_temp.i(23);
select set_config('request.jwt.claim.sub',pg_temp.i(10)::text,true);
select public.finalize_finance_setup(pg_temp.i(1));
create function pg_temp.cat(key text default 'other_income') returns uuid language sql stable as $$select id from public.finance_categories where studio_id=pg_temp.i(1) and default_key=key$$;
create function pg_temp.input(patch jsonb default '{}') returns jsonb language sql stable as $$select jsonb_build_object(
  'kind','recurring','direction','incoming','name','Other activity income','amount','250.50','currency','UAH','categoryId',pg_temp.cat(),
  'accountId',pg_temp.i(20),'intervalMonths',1,'payoutDay',31,'paymentMonthOffset',0,'effectiveFrom',pg_temp.month(-2),
  'commitment','agreed','certainty','fixed','reason','Income rule test','revision',0)||patch$$;
create function pg_temp.schedule(n integer default 100) returns uuid language sql stable as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.i(1) and request_id=pg_temp.i(n)$$;
create function pg_temp.item(offset_months integer default 0,n integer default 100) returns uuid language sql stable as $$
  select l.expected_item_id from public.finance_obligations o join public.finance_obligation_items l on l.studio_id=o.studio_id and l.obligation_id=o.id
  where o.studio_id=pg_temp.i(1) and o.schedule_id=pg_temp.schedule(n) and o.period_start=pg_temp.month(offset_months)$$;
create function pg_temp.receive(request integer,amount text default '250.50') returns uuid language sql as $$
  select public.record_finance_expected_payment(pg_temp.i(1),pg_temp.i(request),pg_temp.item(-1),jsonb_build_object(
    'kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount',amount,'accountId',pg_temp.i(20),'categoryId',pg_temp.cat()),amount::numeric)$$;
create function pg_temp.forecast() returns jsonb language sql security definer as $$select private.capture_finance_forecast_inputs(pg_temp.i(1),'3','confirmed','[]')$$;
set local role authenticated;
select lives_ok($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(100),pg_temp.input())$$,'create recurring income through the shared guarded RPC');
select lives_ok($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(100),pg_temp.input())$$,'creation replay is idempotent');
select is((select count(*) from public.finance_schedules where studio_id=pg_temp.i(1)),1::bigint,'one rule per creation request');
select is((select account_id from public.finance_schedule_terms where studio_id=pg_temp.i(1)),pg_temp.i(20),'rule snapshots the receiving account');
select is((select direction from public.finance_expected_items where id=pg_temp.item(-1)),'incoming','generated item is income');
select ok(exists(select 1 from public.finance_expected_balances where id=pg_temp.item(-2) and due_state='overdue' and remaining_amount=250.50),'missed older receipts are materialized and visible as overdue');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.i(20)),100::numeric,'expectations do not affect cash balance');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.i(1)),0::bigint,'generation never posts a movement');
select is((select count(*) from public.finance_expense_service_policies where studio_id=pg_temp.i(1)),0::bigint,'income never creates an expense service policy');
select lives_ok($$select public.ensure_finance_schedule_occurrences(pg_temp.i(1),'12')$$,'repeated generation remains safe');
select is((select count(*) from public.finance_obligations where studio_id=pg_temp.i(1)),(select count(distinct period_start) from public.finance_obligations where studio_id=pg_temp.i(1)),'each rule period remains unique');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.forecast()->'expected') e
  where e->>'id'=pg_temp.item(1)::text and e->>'direction'='incoming' and e->>'remaining_amount'='250.50'),'forecast captures upcoming income separately from cash');
select lives_ok($$select pg_temp.receive(120,'100')$$,'partial receipt uses normal movement and allocation');
select lives_ok($$select pg_temp.receive(120,'100')$$,'receipt replay creates no duplicate cash');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.i(20)),200::numeric,'partial receipt increases actual balance once');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.item(-1)),150.50::numeric,'only the remaining income stays expected');
select lives_ok($$select pg_temp.receive(121,'150.50')$$,'confirm the remaining receipt');
select throws_like($$select pg_temp.receive(122,'250.50')$$,'%finance_overallocation%','a new request cannot post the receipt again');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.i(20)),350.50::numeric,'failed duplicate rolls back its cash movement');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.i(1)),2::bigint,'only the two actual partial receipts exist');
reset role;
create temp table income_history as select to_jsonb(i) as item,to_jsonb(o) as obligation,to_jsonb(t) as terms
from public.finance_expected_items i join public.finance_obligation_items l on l.studio_id=i.studio_id and l.expected_item_id=i.id
join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id
join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id where i.id=pg_temp.item(-1);
grant select on income_history to authenticated;
set local role authenticated;
select lives_ok($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(130),pg_temp.input(jsonb_build_object(
  'id',pg_temp.schedule(),'revision',1,'effectiveFrom',pg_temp.month(1),'isPaused',true)))$$,'pause as a future immutable revision');
select is((select commitment from public.finance_expected_items where id=pg_temp.item(1)),'cancelled','pause cancels only future system projections');
select ok(exists(select 1 from public.finance_expected_balances where id=pg_temp.item(-2) and commitment='agreed' and remaining_amount=250.50),'pause keeps overdue receipts outstanding');
select is((select count(*) from jsonb_array_elements(pg_temp.forecast()->'expected') e where e->>'schedule_id'=pg_temp.schedule()::text and (e->>'period_start')::date>=pg_temp.month(1)),0::bigint,'paused periods do not enter the forecast');
select is((select count(*) from jsonb_array_elements(pg_temp.forecast()->'diagnostics') e where e->>'id'=pg_temp.schedule()::text),0::bigint,'paused periods do not create missing-coverage diagnostics');
select lives_ok($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(131),pg_temp.input(jsonb_build_object(
  'id',pg_temp.schedule(),'revision',2,'effectiveFrom',pg_temp.month(3),'amount','300','isPaused',false,'accountId',pg_temp.i(22))))$$,'resume with a new amount and account snapshot');
select is((select commitment from public.finance_expected_items where id=pg_temp.item(2)),'cancelled','resuming does not fill the paused gap');
select is((select amount from public.finance_expected_items where id=pg_temp.item(3)),300::numeric,'resumed future receipts use new terms');
select is((select to_jsonb(i) from public.finance_expected_items i where id=pg_temp.item(-1)),(select item from income_history),'settled receipt stays byte-for-byte unchanged');
select is((select to_jsonb(t) from public.finance_schedule_terms t where studio_id=pg_temp.i(1) and schedule_id=pg_temp.schedule() and revision=1),(select terms from income_history),'original rule revision stays byte-for-byte unchanged');
select is((select to_jsonb(o) from public.finance_obligations o where studio_id=pg_temp.i(1) and schedule_id=pg_temp.schedule() and period_start=pg_temp.month(-1)),(select obligation from income_history),'settled occurrence preserves original term/account identity');
select throws_like($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(140),pg_temp.input(' {"accountId":""}'))$$,'%finance_account_invalid%','income requires an account');
select throws_like($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(140),pg_temp.input(jsonb_build_object('accountId',pg_temp.i(21))))$$,'%finance_account_invalid%','foreign tenant account denied');
select throws_like($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(140),pg_temp.input(jsonb_build_object('accountId',pg_temp.i(23))))$$,'%finance_account_invalid%','archived account denied');
select throws_like($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(140),pg_temp.input('{"amount":"1.001"}'))$$,'%finance_amount_invalid%','currency minor units enforced');
select throws_like($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(140),pg_temp.input('{"expenseService":{"confirmed":true}}'))$$,'%finance_input_invalid%','income cannot be configured as an expense accrual');
select throws_like($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(140),pg_temp.input(jsonb_build_object('id',pg_temp.schedule(),'revision',3,'effectiveFrom',pg_temp.month(4),'categoryId',pg_temp.cat('rent'),'direction','outgoing','accountId','')))$$,'%finance_category_invalid%','revision cannot reverse the operation direction');
select lives_ok($$select public.stop_finance_schedule(pg_temp.i(1),pg_temp.i(150),pg_temp.schedule(),pg_temp.month(4))$$,'permanently end income through the existing stop RPC');
select is((select commitment from public.finance_expected_items where id=pg_temp.item(4)),'cancelled','end cancels subsequent projections');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.i(20)),350.50::numeric,'editing, pausing and ending never change actual balance');
-- Fixed future years exercise short months independently of the test execution date.
select lives_ok($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(160),pg_temp.input('{"effectiveFrom":"2032-01-01","effectiveThrough":"2032-03-31"}'))$$,'create a bounded month-end rule');
select lives_ok($$select public.generate_finance_obligations(pg_temp.i(1),pg_temp.i(161),pg_temp.schedule(160),'2032-01-01','2032-04-01')$$,'generate leap-year months');
select is((select i.due_date from public.finance_expected_items i join public.finance_obligation_items l on l.expected_item_id=i.id and l.studio_id=i.studio_id join public.finance_obligations o on o.id=l.obligation_id and o.studio_id=l.studio_id where o.schedule_id=pg_temp.schedule(160) and o.period_start='2032-02-01'),'2032-02-29'::date,'31st clamps to leap February end');
select is((select count(*) from public.finance_obligations where schedule_id=pg_temp.schedule(160)),3::bigint,'optional end excludes later months');
select lives_ok($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(170),pg_temp.input('{"effectiveFrom":"2033-01-01","intervalMonths":3,"paymentMonthOffset":1}'))$$,'reuse quarterly cadence and month offset');
select lives_ok($$select public.generate_finance_obligations(pg_temp.i(1),pg_temp.i(171),pg_temp.schedule(170),'2033-01-01','2033-12-01')$$,'generate quarterly income');
select is((select count(*) from public.finance_obligations where schedule_id=pg_temp.schedule(170)),4::bigint,'quarterly rule has four unique occurrences');
select is((select i.due_date from public.finance_expected_items i join public.finance_obligation_items l on l.expected_item_id=i.id and l.studio_id=i.studio_id join public.finance_obligations o on o.id=l.obligation_id and o.studio_id=l.studio_id where o.schedule_id=pg_temp.schedule(170) and o.period_start='2033-01-01'),'2033-02-28'::date,'month offset clamps to non-leap February end');
select lives_ok($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(180),pg_temp.input('{"effectiveFrom":"2033-01-01","intervalMonths":12}'))$$,'reuse annual cadence');
select lives_ok($$select public.generate_finance_obligations(pg_temp.i(1),pg_temp.i(181),pg_temp.schedule(180),'2033-01-01','2033-12-01')$$,'generate annual income');
select is((select count(*) from public.finance_obligations where schedule_id=pg_temp.schedule(180)),1::bigint,'annual rule has one unique occurrence');
select lives_ok($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(185),pg_temp.input(jsonb_build_object('effectiveFrom',pg_temp.month(),'amount','400','accountId',pg_temp.i(22))))$$,'rule may target a receiving account in another currency');
select throws_like($$select public.record_finance_expected_payment(pg_temp.i(1),pg_temp.i(186),pg_temp.item(0,185),jsonb_build_object(
  'kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'accountId',pg_temp.i(22),'amount','10','categoryId',pg_temp.cat()))$$,'%finance_fx_required%','cross-currency receipt requires explicit FX');
select lives_ok($$select public.record_finance_expected_payment(pg_temp.i(1),pg_temp.i(186),pg_temp.item(0,185),jsonb_build_object(
  'kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'accountId',pg_temp.i(22),'amount','10','categoryId',pg_temp.cat(),
  'fx',jsonb_build_object('rate','40','source','manual','effectiveDate',(now() at time zone 'Europe/Kyiv')::date),
  'settlementFx',jsonb_build_object('rate','40','source','manual','effectiveDate',(now() at time zone 'Europe/Kyiv')::date)))$$,'confirmed FX reuses normal cross-currency settlement');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.i(22)),10::numeric,'receiving balance records native currency only');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.item(0,185)),0::numeric,'settlement converts income remaining amount exactly');
select set_config('request.jwt.claim.sub',pg_temp.i(11)::text,true);
select throws_like($$select public.save_finance_recurring_schedule(pg_temp.i(1),pg_temp.i(190),pg_temp.input())$$,'%finance_admin_required%','employees cannot create income rules');
select is((select count(*) from public.finance_schedule_terms where studio_id=pg_temp.i(1)),0::bigint,'employee cannot read rule amounts or receiving accounts');
select * from finish();
rollback;
