begin;
select no_plan();
insert into public.studios(id,name) values ('6c000000-0000-0000-0000-000000000001','Balance test');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('6c000000-0000-0000-0000-000000000010','authenticated','authenticated','balance-admin@test','{}','{}',now(),now()),
       ('6c000000-0000-0000-0000-000000000011','authenticated','authenticated','balance-employee@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active)
values ('6c000000-0000-0000-0000-000000000010','Admin','balance-admin@test','admin',true),
       ('6c000000-0000-0000-0000-000000000011','Employee','balance-employee@test','employee',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active)
values ('6c000000-0000-0000-0000-000000000001','6c000000-0000-0000-0000-000000000010','admin',true),
       ('6c000000-0000-0000-0000-000000000001','6c000000-0000-0000-0000-000000000011','employee',true);
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('6c000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.save_finance_settings(pg_temp.fid(1),'UAH',pg_temp.today()-7);
select public.save_finance_account(pg_temp.fid(1),'Historical','UAH',100,p_request_id=>pg_temp.fid(100));
select public.finalize_finance_setup(pg_temp.fid(1));
select is((select recorded_balance from public.finance_account_balances where name='Historical'),100::numeric,'legacy cutover opening remains unchanged');
select is((select account_type from public.finance_accounts where name='Historical'),'other','existing account defaults to other without name inference');

create temporary table new_account as select public.create_finance_account_with_opening(pg_temp.fid(1),pg_temp.fid(101),
  jsonb_build_object('name','Later','accountType','bank','currency','UAH','openingBalance','50.25','date',pg_temp.today()-2,
    'submission',jsonb_build_object('name','Later','accountType','bank','currency','UAH','openingBalance','50.25','date',pg_temp.today()-2))) as id;
select is(public.create_finance_account_with_opening(pg_temp.fid(1),pg_temp.fid(101),
  jsonb_build_object('name','Later','accountType','bank','currency','UAH','openingBalance','50.25','date',pg_temp.today()-2,
    'submission',jsonb_build_object('name','Later','accountType','bank','currency','UAH','openingBalance','50.25','date',pg_temp.today()-2))),
  (select id from new_account),'lost create response returns the same account and opening');
select throws_like($$select public.create_finance_account_with_opening(pg_temp.fid(1),pg_temp.fid(101),
  jsonb_build_object('name','Changed','currency','UAH','openingBalance','50.25','date',pg_temp.today()-2))$$,
  '%finance_request_conflict%','changed create retry cannot rewrite opening');
select is((select opening_balance from public.finance_accounts where id=(select id from new_account)),0::numeric,'later opening does not rewrite historical column');
select is((select account_type from public.finance_accounts where id=(select id from new_account)),'bank','dated account creation stores classification only');
select is((select recorded_balance from public.finance_account_balances where id=(select id from new_account)),50.25::numeric,'dated opening enters account balance once');
select is((select financial_date from public.finance_movements where kind='account_opening' and studio_id=pg_temp.fid(1)),pg_temp.today()-2,'opening retains effective date');
select is((select (item->>'amount')::numeric from jsonb_array_elements(public.get_finance_overview(pg_temp.fid(1))->'history') item
  where item->>'date'=(pg_temp.today()-7)::text),100::numeric,'dated opening is absent before its effective date');

select is((select count(*) from public.finance_planning_actuals where studio_id=pg_temp.fid(1)),0::bigint,'opening is excluded from P&L and Cash Flow actuals');
select is((select count(*) from public.finance_payment_availability where studio_id=pg_temp.fid(1)),0::bigint,'opening cannot satisfy expected payments');
select is((select count(*) from public.finance_cash_effects where studio_id=pg_temp.fid(1)),1::bigint,'opening stays visible in dated balance history');
select throws_like($$select public.record_finance_account_balance(pg_temp.fid(1),pg_temp.fid(102),
  jsonb_build_object('kind','account_opening','accountId',(select id from new_account),'date',pg_temp.today(),
    'amount','1','note','','submission',jsonb_build_object('amount','1')))$$,
  '%finance_opening_unavailable%','account with an opening cannot receive a second one');

create temporary table empty_account as select public.create_finance_account_with_opening(pg_temp.fid(1),pg_temp.fid(103),
  jsonb_build_object('name','Empty','currency','UAH','openingBalance','0','date',pg_temp.today())) as id;
select is((select ledger_entry_count from public.finance_account_balances where id=(select id from empty_account)),0::bigint,'zero account has no ledger activity');
select public.save_finance_account(pg_temp.fid(1),'Empty','UAH',0,(select id from empty_account),p_account_type=>'cash');
select is((select account_type from public.finance_accounts where id=(select id from empty_account)),'cash','account type remains editable after finalization');
select is((select recorded_balance from public.finance_account_balances where id=(select id from empty_account)),0::numeric,'type edit does not change balance');
select throws_like($$select public.save_finance_account(pg_temp.fid(1),'Empty','UAH',0,(select id from empty_account),p_account_type=>'card')$$,
  '%finance_account_type_invalid%','a card is not an account type');
select public.record_finance_account_balance(pg_temp.fid(1),pg_temp.fid(104),
  jsonb_build_object('kind','account_opening','accountId',(select id from empty_account),'date',pg_temp.today()-1,
    'amount','20','note','','submission',jsonb_build_object('amount','20')));
select is((select recorded_balance from public.finance_account_balances where id=(select id from empty_account)),20::numeric,'forgotten opening can be added once');
select throws_like($$select public.record_finance_account_balance(pg_temp.fid(1),pg_temp.fid(105),
  jsonb_build_object('kind','account_opening','accountId',(select id from empty_account),'date',pg_temp.today(),
    'amount','1','note',''))$$,'%finance_opening_unavailable%','second late opening is blocked');

select public.record_finance_account_balance(pg_temp.fid(1),pg_temp.fid(106),
  jsonb_build_object('kind','balance_adjustment','accountId',(select id from empty_account),'date',pg_temp.today(),
    'amount','13.50','note','Counted cash','submission',jsonb_build_object('amount','13.50')));
select is((select recorded_balance from public.finance_account_balances where id=(select id from empty_account)),13.50::numeric,'adjustment stores difference and reaches actual balance');
select is((select amount from public.finance_movement_entries where movement_id=(select id from public.finance_movements where request_id=pg_temp.fid(106))),-6.50::numeric,'adjustment ledger entry is signed delta');
select is((select count(*) from public.finance_planning_actuals where studio_id=pg_temp.fid(1)),0::bigint,'adjustment stays outside P&L and Cash Flow actuals');
select throws_like($$select public.record_finance_account_balance(pg_temp.fid(1),pg_temp.fid(106),
  jsonb_build_object('kind','balance_adjustment','accountId',(select id from empty_account),'date',pg_temp.today(),
    'amount','14.00','note','Changed','submission',jsonb_build_object('amount','14.00')))$$,
  '%finance_request_conflict%','changed retry cannot replace an audited adjustment');

select is((select count(*) from public.finance_payment_availability where studio_id=pg_temp.fid(1)),0::bigint,'adjustment stays outside settlement');
create temporary table foreign_account as select public.create_finance_account_with_opening(pg_temp.fid(1),pg_temp.fid(109),
  jsonb_build_object('name','Dollars','currency','USD','openingBalance','10','date',pg_temp.today(),
    'fx',jsonb_build_object('rate','40','source','manual','effectiveDate',pg_temp.today()))) as id;
select is((select recorded_balance from public.finance_account_balances where id=(select id from foreign_account)),10::numeric,'foreign opening retains native currency');
select is((select reporting_amount from public.finance_movement_entries where movement_id=(select id from public.finance_movements where request_id=pg_temp.fid(109))),400::numeric,'foreign opening is valued once');
create temporary table balance_report as select public.get_finance_overview(pg_temp.fid(1),'6','confirmed',
  jsonb_build_array(jsonb_build_object('currency','USD','rate','40','source','manual','effectiveDate',pg_temp.today()))) as report;
select is((select (report->'forecast'->>'cashBase')::numeric from balance_report),563.75::numeric,'Forecast cash base includes each opening and adjustment once');
select is((select count(*) from balance_report,jsonb_array_elements(report->'flows')),0::bigint,'Cash Flow excludes balance stock changes');
select is((select (item->>'amount')::numeric from balance_report,jsonb_array_elements(report->'history') item order by item->>'date' desc limit 1),563.75::numeric,'historical cash includes dated stock changes once');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1) and kind in ('account_opening','balance_adjustment')),4::bigint,'each stock change is auditable');
select throws_like($$update public.finance_movement_entries set amount=1 where movement_id=(select id from public.finance_movements where request_id=pg_temp.fid(106))$$,
  '%permission denied%','caller cannot rewrite an adjustment');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select public.record_finance_account_balance(pg_temp.fid(1),pg_temp.fid(107),'{}')$$,
  '%finance_admin_required%','employee cannot post a balance entry');
set local role anon;
select throws_like($$select public.record_finance_account_balance(pg_temp.fid(1),pg_temp.fid(108),'{}')$$,
  '%permission denied%','anonymous balance posting is denied');
reset role;
select * from finish();
rollback;
