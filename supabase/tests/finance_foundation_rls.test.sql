begin;
select no_plan();
insert into public.studios(id, name) values
 ('62000000-0000-0000-0000-000000000001','Finance A'),
 ('62000000-0000-0000-0000-000000000002','Finance B');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('62000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, 'authenticated', 'authenticated', 'finance-' || n || '@test', '{}', '{}', now(), now()
from generate_series(10,14) n;
insert into public.profiles(id, full_name, email, system_role, is_active)
select id, 'Finance tester', email, case when email='finance-11@test' then 'employee' else 'admin' end, email<>'finance-13@test'
from auth.users where id between '62000000-0000-0000-0000-000000000010' and '62000000-0000-0000-0000-000000000014';
insert into public.studio_members(studio_id,user_id,system_role,is_active) values
 ('62000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000010','admin',true),
 ('62000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000011','employee',true),
 ('62000000-0000-0000-0000-000000000002','62000000-0000-0000-0000-000000000012','admin',true),
 ('62000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000013','admin',true),
 ('62000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000014','admin',false);
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.finance_settings'::regclass,'public.finance_accounts'::regclass,'public.finance_currencies'::regclass)), 'all Finance tables enable RLS');
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$select public.save_finance_settings('62000000-0000-0000-0000-000000000001','UAH','2026-09-01')$$,'admin creates setup');
select is((select base_currency from public.finance_settings),'UAH','admin sees own setup');
select ok((select count(*) > 100 from public.finance_currencies),'catalog supports currencies beyond the legacy four');
select throws_like($$select public.save_finance_settings('62000000-0000-0000-0000-000000000001','ABC','2026-09-01')$$,'%foreign key%','unknown base currency rejected');
select throws_like($$select public.save_finance_settings('62000000-0000-0000-0000-000000000001','UAH','infinity')$$,'%check constraint%','infinite cutover rejected');
select throws_like($$select public.finalize_finance_setup('62000000-0000-0000-0000-000000000001')$$,'%finance_active_account_required%','cannot finalize without an active account');
select lives_ok($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Bank','UAH',1200.25,p_request_id=>gen_random_uuid())$$,'admin records precise opening balance');
select lives_ok($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Overdraft','USD',-55.50,p_request_id=>gen_random_uuid())$$,'negative opening balance allowed');
select lives_ok($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Yen','JPY',0,p_request_id=>gen_random_uuid())$$,'zero opening balance allowed');
select lives_ok($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Dinar','KWD',1.234,p_request_id=>gen_random_uuid())$$,'three-decimal currency preserved');
select lives_ok($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Unit','CLF',1.2345,p_request_id=>gen_random_uuid())$$,'four-decimal currency preserved');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Fractional yen','JPY',1.1,p_request_id=>gen_random_uuid())$$,'%finance_balance_precision%','fractional yen rejected without rounding');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Rounding','UAH',1.001,p_request_id=>gen_random_uuid())$$,'%finance_balance_precision%','excess cents rejected without rounding');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Invalid','ABC',0,p_request_id=>gen_random_uuid())$$,'%finance_currency_invalid%','unknown account currency rejected');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Invalid','USD','NaN',p_request_id=>gen_random_uuid())$$,'%check constraint%','NaN rejected');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Invalid','USD','Infinity',p_request_id=>gen_random_uuid())$$,'%check constraint%','Infinity rejected');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Invalid','USD',10000000000,p_request_id=>gen_random_uuid())$$,'%check constraint%','unsafe amount range rejected');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001',' ','USD',0,p_request_id=>gen_random_uuid())$$,'%check constraint%','blank name rejected');
select lives_ok($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Main bank','EUR',99.95,(select id from public.finance_accounts where name='Bank'))$$,'draft account currency and balance can be corrected');
select lives_ok($$select public.save_finance_settings('62000000-0000-0000-0000-000000000001','GBP','2026-08-01')$$,'draft reporting currency and date can be corrected');
select is((select opening_balance from public.finance_accounts where name='Main bank'),99.95::numeric,'changing reporting currency never converts an account balance');
select throws_like($$update public.finance_accounts set opening_balance=999$$,'%permission denied%','even admins cannot bypass account RPC');
select throws_like($$insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values ('62000000-0000-0000-0000-000000000002','USD','2026-09-01','62000000-0000-0000-0000-000000000010')$$,'%permission denied%','direct setup inserts denied');
select throws_like($$update public.finance_settings set base_currency='USD'$$,'%permission denied%','direct settings updates denied');
select throws_like($$delete from public.finance_accounts$$,'%permission denied%','accounts cannot be deleted');
select throws_like($$delete from public.finance_settings$$,'%permission denied%','setup cannot be deleted');
select throws_like($$update public.finance_currencies set minor_units=0$$,'%permission denied%','currency precision cannot be changed by a client');
select lives_ok($$select public.set_finance_account_archived('62000000-0000-0000-0000-000000000001',(select id from public.finance_accounts where name='Overdraft'),true)$$,'archive preserves an account with an opening balance');
select is((select opening_balance from public.finance_accounts where name='Overdraft' and archived_at is not null),-55.50::numeric,'archived opening balance remains readable');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Changed','USD',0,(select id from public.finance_accounts where name='Overdraft'))$$,'%finance_account_unavailable%','archived account must be restored before editing');
-- Explicit historical assumptions for this test fixture, separate from forecast FX.
select public.value_finance_opening(a.studio_id,a.id,jsonb_build_object('currency',a.currency,'reportingCurrency',s.base_currency,'openingAmount',a.opening_balance::text,'date',s.cutover_date,'fx',jsonb_build_object('rate','39','source','manual','effectiveDate',s.cutover_date)))
from public.finance_accounts a join public.finance_settings s on s.studio_id=a.studio_id where a.studio_id='62000000-0000-0000-0000-000000000001' and a.currency<>s.base_currency and a.opening_balance<>0;
select lives_ok($$select public.finalize_finance_setup('62000000-0000-0000-0000-000000000001')$$,'admin finalizes setup');
select lives_ok($$select public.finalize_finance_setup('62000000-0000-0000-0000-000000000001')$$,'finalization retry is idempotent');
select is((select finalized_by from public.finance_settings),'62000000-0000-0000-0000-000000000010'::uuid,'finalization records verified actor');
select throws_like($$select public.save_finance_settings('62000000-0000-0000-0000-000000000001','USD','2026-08-01')$$,'%finance_setup_finalized%','reporting currency locked');
select throws_like($$select public.save_finance_settings('62000000-0000-0000-0000-000000000001','GBP','2026-09-01')$$,'%finance_setup_finalized%','cutover locked');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Main bank','EUR',100,(select id from public.finance_accounts where name='Main bank'))$$,'%finance_opening_locked%','opening balance locked');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Main bank','USD',99.95,(select id from public.finance_accounts where name='Main bank'))$$,'%finance_opening_locked%','account currency locked');
select lives_ok($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Renamed bank','EUR',99.95,(select id from public.finance_accounts where name='Main bank'))$$,'name remains editable');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','New cash','USD',5,p_request_id=>gen_random_uuid())$$,'%finance_new_account_zero_opening%','new account cannot rewrite finalized openings');
select lives_ok($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','New cash','USD',0,p_request_id=>gen_random_uuid())$$,'new account after cutover starts at zero');
select lives_ok($$select public.set_finance_account_archived('62000000-0000-0000-0000-000000000001',(select id from public.finance_accounts where name='Overdraft'),false)$$,'restore after finalization');
select is((select opening_balance from public.finance_accounts where name='Overdraft' and archived_at is null),-55.50::numeric,'restoration preserves opening');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Overdraft','USD',0,(select id from public.finance_accounts where name='Overdraft'))$$,'%finance_opening_locked%','restore cannot unlock history');
select is((select count(*) from public.project_activity where studio_id='62000000-0000-0000-0000-000000000001'),0::bigint,'Finance does not leak into project activity');
select is((select count(*) from public.notifications where studio_id='62000000-0000-0000-0000-000000000001'),0::bigint,'Finance does not emit private amounts in notifications');

-- Cross-studio reads and guessed IDs must both fail.
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000012',true);
select is((select count(*) from public.finance_settings),0::bigint,'another studio cannot read setup');
select is((select count(*) from public.finance_accounts),0::bigint,'another studio cannot read accounts');
select throws_like($$select public.save_finance_settings('62000000-0000-0000-0000-000000000001','USD','2026-09-01')$$,'%finance_admin_required%','cross-studio setup RPC denied');
select throws_like($$select public.finalize_finance_setup('62000000-0000-0000-0000-000000000001')$$,'%finance_admin_required%','cross-studio finalization denied');
select lives_ok($$select public.save_finance_settings('62000000-0000-0000-0000-000000000002','USD','2026-09-01')$$,'other studio manages its own setup');
set local role postgres;
select set_config('finance.test_account_id',(select id::text from public.finance_accounts where studio_id='62000000-0000-0000-0000-000000000001' and name='Renamed bank'),true);
set local role authenticated;
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000002','Stolen','USD',0,current_setting('finance.test_account_id')::uuid)$$,'%finance_account_unavailable%','foreign account ID cannot be moved or edited');
select throws_like($$select public.set_finance_account_archived('62000000-0000-0000-0000-000000000002',current_setting('finance.test_account_id')::uuid,true)$$,'%finance_account_unavailable%','foreign account ID cannot be archived');

-- Employee, inactive profile, removed membership, and ambiguous membership.
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000011',true);
select is((select count(*) from public.finance_settings),0::bigint,'employee cannot read setup');
select is((select count(*) from public.finance_accounts),0::bigint,'employee cannot read accounts');
select is((select count(*) from public.finance_currencies),0::bigint,'employee cannot read Finance reference surface');
select throws_like($$select public.save_finance_settings('62000000-0000-0000-0000-000000000001','USD','2026-09-01')$$,'%finance_admin_required%','employee cannot mutate setup');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Unauthorized','USD',0,p_request_id=>gen_random_uuid())$$,'%finance_admin_required%','employee cannot create account');
select throws_like($$select public.set_finance_account_archived('62000000-0000-0000-0000-000000000001',current_setting('finance.test_account_id')::uuid,true)$$,'%finance_admin_required%','employee cannot archive');
select throws_like($$select public.finalize_finance_setup('62000000-0000-0000-0000-000000000001')$$,'%finance_admin_required%','employee cannot finalize');
select throws_like($$insert into public.finance_accounts(studio_id,name,currency,created_by) values ('62000000-0000-0000-0000-000000000001','Unauthorized','USD','62000000-0000-0000-0000-000000000011')$$,'%permission denied%','employee direct write denied');
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000013',true);
select is((select count(*) from public.finance_accounts),0::bigint,'inactive profile cannot read');
select throws_like($$select public.save_finance_settings('62000000-0000-0000-0000-000000000001','USD','2026-09-01')$$,'%finance_admin_required%','inactive profile cannot mutate');
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000014',true);
select is((select count(*) from public.finance_settings),0::bigint,'inactive membership cannot read');
select throws_like($$select public.save_finance_account('62000000-0000-0000-0000-000000000001','Unauthorized','USD',0,p_request_id=>gen_random_uuid())$$,'%finance_admin_required%','inactive membership cannot mutate');
set local role postgres;
select throws_like($$insert into public.studio_members(studio_id,user_id,system_role) values ('62000000-0000-0000-0000-000000000002','62000000-0000-0000-0000-000000000010','admin')$$,'%studio_members_one_active_studio_per_user%','existing uniqueness constraint prevents ambiguous active memberships');
set local role anon;
select throws_like($$select * from public.finance_accounts$$,'%permission denied%','anonymous account access denied');
select throws_like($$select * from public.finance_settings$$,'%permission denied%','anonymous settings access denied');
select throws_like($$select public.save_finance_settings('62000000-0000-0000-0000-000000000001','USD','2026-09-01')$$,'%permission denied%','anonymous RPC denied');
set local role postgres;
select throws_like($$update public.finance_settings set base_currency='USD' where studio_id='62000000-0000-0000-0000-000000000001'$$,'%finance_setup_finalized%','trigger protects finalized context from direct edits');
select throws_like($$update public.finance_accounts set studio_id='62000000-0000-0000-0000-000000000002' where id=current_setting('finance.test_account_id')::uuid$$,'%finance_identity_immutable%','trigger forbids tenant reassignment');
select throws_like($$delete from public.studios where id='62000000-0000-0000-0000-000000000001'$$,'%foreign key%','studio deletion cannot cascade away Finance history');
select * from finish();
rollback;
