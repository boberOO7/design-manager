begin;
select no_plan();
insert into public.studios(id, name) values
 ('6b000000-0000-0000-0000-000000000001','Finance A'),
 ('6b000000-0000-0000-0000-000000000002','Finance B');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('6b000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, 'authenticated', 'authenticated', 'finance-' || n || '@test', '{}', '{}', now(), now()
from generate_series(10,14) n;
insert into public.profiles(id, full_name, email, system_role, is_active)
select id, 'Finance tester', email, case when email='finance-11@test' then 'employee' else 'admin' end, email<>'finance-13@test'
from auth.users where id between '6b000000-0000-0000-0000-000000000010' and '6b000000-0000-0000-0000-000000000014';
insert into public.studio_members(studio_id,user_id,system_role,is_active) values
 ('6b000000-0000-0000-0000-000000000001','6b000000-0000-0000-0000-000000000010','admin',true),
 ('6b000000-0000-0000-0000-000000000001','6b000000-0000-0000-0000-000000000011','employee',true),
 ('6b000000-0000-0000-0000-000000000002','6b000000-0000-0000-0000-000000000012','admin',true),
 ('6b000000-0000-0000-0000-000000000001','6b000000-0000-0000-0000-000000000013','admin',true),
 ('6b000000-0000-0000-0000-000000000001','6b000000-0000-0000-0000-000000000014','admin',false);
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('6b000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.account(n integer,name text default 'Bank',currency text default 'UAH',amount numeric default 100) returns uuid language sql as $$select public.save_finance_account(pg_temp.fid(1),name,currency,amount,p_request_id=>pg_temp.fid(n))$$;
create function pg_temp.result(n integer) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select lives_ok($$select public.save_finance_settings(pg_temp.fid(1),'UAH',pg_temp.today()+1)$$,'future cutover allowed in draft');
select lives_ok($$select pg_temp.account(100)$$,'account creation requires a request identity');
select is(pg_temp.account(100),pg_temp.result(100),'lost response retry returns original identity');
select is((select count(*) from public.finance_accounts),1::bigint,'retry does not duplicate account');
select is((select sum(opening_balance) from public.finance_accounts),100::numeric,'opening applied exactly once');
select throws_like($$select pg_temp.account(100,'Changed')$$,'%finance_request_conflict%','changed retry cannot mutate original account');
select throws_like($$select pg_temp.account(100,'Bank','UAH',101)$$,'%finance_request_conflict%','changed opening conflicts');
select throws_like($$select public.save_finance_account(pg_temp.fid(1),'Bank','UAH',100)$$,'%finance_request_required%','legacy create cannot bypass retry safety');
select lives_ok($$select pg_temp.account(101)$$,'new identity allows legitimate identical account');
select isnt(pg_temp.result(101),pg_temp.result(100),'distinct intended creates have distinct identities');
select is((select sum(opening_balance) from public.finance_accounts),200::numeric,'each distinct account contributes one opening');
select throws_like($$select public.finalize_finance_setup(pg_temp.fid(1))$$,'%finance_cutover_future%','future cutover cannot finalize');
select is((select finalized_at from public.finance_settings where studio_id=pg_temp.fid(1)),null::timestamptz,'rejected finalization leaves draft intact');
select is((select cutover_date from public.finance_settings where studio_id=pg_temp.fid(1)),pg_temp.today()+1,'future date not silently rewritten');
select throws_like($$select public.get_finance_overview(pg_temp.fid(1))$$,'%finance_finalized_setup_required%','premature opening cash cannot reach Overview');
set local timezone='Pacific/Kiritimati';
select throws_like($$select public.finalize_finance_setup(pg_temp.fid(1))$$,'%finance_cutover_future%','business date independent of session timezone');
set local role postgres;
select throws_like($$update public.finance_settings set finalized_at=now(),finalized_by=pg_temp.fid(10) where studio_id=pg_temp.fid(1)$$,'%finance_cutover_future%','privileged direct finalization cannot bypass cutover');
select throws_like($$insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by,finalized_at,finalized_by) values(pg_temp.fid(2),'UAH',pg_temp.today()+1,pg_temp.fid(12),now(),pg_temp.fid(12))$$,'%finance_cutover_future%','direct insert cannot create future-finalized setup');
set local role authenticated;
select public.save_finance_settings(pg_temp.fid(1),'UAH',pg_temp.today());
select pg_temp.account(102,'Dollars','USD',50);
select is(pg_temp.account(102,'Dollars','USD',50),pg_temp.result(102),'foreign opening create retry returns original');
select is((select count(*) from public.finance_accounts where currency='USD'),1::bigint,'foreign opening appears only once');
select throws_like($$select public.finalize_finance_setup(pg_temp.fid(1))$$,'%finance_opening_fx_required%','opening FX completion still required');
select public.value_finance_opening(pg_temp.fid(1),pg_temp.result(102),jsonb_build_object('currency','USD','reportingCurrency','UAH','openingAmount','50','date',pg_temp.today(),'fx',jsonb_build_object('rate','40','source','manual','effectiveDate',pg_temp.today())));
create temporary table valued_account as select * from public.finance_accounts where id=pg_temp.result(102);
select pg_temp.account(102,'Dollars','USD',50);
select results_eq('select * from public.finance_accounts where id=pg_temp.result(102)','select * from valued_account','retry does not clear completed opening FX or actor/time');
select lives_ok($$select public.finalize_finance_setup(pg_temp.fid(1))$$,'cutover today can finalize regardless of session timezone');
select is((public.get_finance_overview(pg_temp.fid(1),'6','confirmed',jsonb_build_array(jsonb_build_object('currency','USD','rate','40','source','manual','effectiveDate',pg_temp.today())))->'forecast'->>'cashBase')::numeric,2200::numeric,'Overview counts each opening once');
select is((select count(*) from public.finance_movements),0::bigint,'opening creation and retries never manufacture transactions');
select is(pg_temp.account(102,'Dollars','USD',50),pg_temp.result(102),'lost create response recoverable after finalization despite nonzero opening');
select public.set_finance_account_archived(pg_temp.fid(1),pg_temp.result(102),true);
select is(pg_temp.account(102,'Dollars','USD',50),pg_temp.result(102),'retry of archived account returns original without restoring it');
select ok((select archived_at is not null from public.finance_accounts where id=pg_temp.result(102)),'retry preserves archival');
select lives_ok($$select pg_temp.account(103,'Later','UAH',0)$$,'intentional account after finalization starts at zero');
select throws_like($$select pg_temp.account(104)$$,'%finance_new_account_zero_opening%','new identity cannot add nonzero finalized opening');
select throws_like($$select public.save_finance_settings(pg_temp.fid(1),'UAH',pg_temp.today()+1)$$,'%finance_setup_finalized%','valid finalized cutover remains immutable');
select public.set_finance_account_archived(pg_temp.fid(1),pg_temp.result(102),false);
select is((select opening_reporting_amount from public.finance_accounts where id=pg_temp.result(102)),2000::numeric,'archival and retries preserve frozen FX valuation');
select throws_like($$update public.finance_planning_requests set payload='{}'$$,'%permission denied%','caller cannot rewrite dedup audit');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select throws_like($$select pg_temp.account(100)$$,'%finance_admin_required%','foreign admin cannot recover another studio request');
select is((select count(*) from public.finance_planning_requests),0::bigint,'request audit tenant-isolated');
select public.save_finance_settings(pg_temp.fid(2),'UAH',pg_temp.today());
select lives_ok($$select public.save_finance_account(pg_temp.fid(2),'Bank','UAH',100,p_request_id=>pg_temp.fid(100))$$,'request namespace scoped to studio');
select throws_like($$select public.save_finance_account(pg_temp.fid(2),'Stolen','UAH',100,pg_temp.result(100))$$,'%finance_request_required%','foreign request result not readable');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select pg_temp.account(100)$$,'%finance_admin_required%','employee cannot create or recover account');
select set_config('request.jwt.claim.sub',pg_temp.fid(13)::text,true);
select throws_like($$select pg_temp.account(100)$$,'%finance_admin_required%','inactive profile cannot recover account');
select set_config('request.jwt.claim.sub',pg_temp.fid(14)::text,true);
select throws_like($$select pg_temp.account(100)$$,'%finance_admin_required%','inactive membership cannot create account');
set local role anon;
select throws_like($$select pg_temp.account(100)$$,'%permission denied%','anonymous create execution denied');
reset role;
select * from finish();
rollback;
