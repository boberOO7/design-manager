begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$ select ('63000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Ledger A'),(pg_temp.fid(2),'Ledger B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','ledger-'||n||'@test','{}','{}',now(),now() from generate_series(10,14)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Ledger tester','ledger-'||n||'@test',case when n=11 then 'employee' else 'admin' end,n<>13 from generate_series(10,14)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=12 then 2 else 1 end),pg_temp.fid(n),case when n=11 then 'employee' else 'admin' end,n<>14 from generate_series(10,14)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.fid(1),'UAH','2026-09-01',pg_temp.fid(10)),(pg_temp.fid(2),'UAH','2026-09-01',pg_temp.fid(12));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',1000,pg_temp.fid(10)),
(pg_temp.fid(21),pg_temp.fid(1),'Cash','UAH',0,pg_temp.fid(10)),
(pg_temp.fid(22),pg_temp.fid(1),'Dollars','USD',100,pg_temp.fid(10)),
(pg_temp.fid(23),pg_temp.fid(2),'Foreign','UAH',0,pg_temp.fid(12)),
(pg_temp.fid(24),pg_temp.fid(1),'Yen','JPY',0,pg_temp.fid(10));
create function pg_temp.input(patch jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_object('kind','incoming','nature','operating','date','2026-09-02','amount','100.25','accountId',pg_temp.fid(20),'category','Design','description','')||patch;
$$;
create function pg_temp.post(patch jsonb default '{}', request integer default 100) returns uuid language sql as $$
 select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(request),pg_temp.input(patch));
$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select throws_like($$select pg_temp.post()$$,'%finance_finalized_setup_required%','draft setup cannot post');
select public.finalize_finance_setup(pg_temp.fid(1));
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(20)),1000::numeric,'opening contributes to balance');
select is((select count(*) from public.finance_cash_effects),0::bigint,'opening never becomes a cash flow');
select lives_ok($$select pg_temp.post()$$,'admin creates incoming');
select is((select count(*) from public.finance_movements),1::bigint,'admin reads event');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(20)),1100.25::numeric,'incoming increases balance exactly');
select lives_ok($$select pg_temp.post()$$,'identical retry succeeds');
select is((select count(*) from public.finance_movements),1::bigint,'retry produces no duplicate');
select throws_like($$select pg_temp.post('{"amount":"101"}')$$,'%finance_request_conflict%','changed payload cannot reuse request');
select lives_ok($$select pg_temp.post('{"kind":"outgoing","amount":"30.25"}',101)$$,'outgoing recorded');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(20)),1070::numeric,'outgoing reduces balance');
select lives_ok($$select pg_temp.post('{"kind":"owner_withdrawal","amount":"20"}',102)$$,'owner withdrawal recorded');
select is((select nature from public.finance_cash_effects where amount=-20),'owner_distribution','owner distribution excluded from operating');
select lives_ok($$select pg_temp.post('{"kind":"incoming","nature":"financing","amount":"100"}',103)$$,'financing recorded independently from operating');
select lives_ok($$select pg_temp.post(jsonb_build_object('kind','transfer','amount','50','receivedAmount','50','destinationId',pg_temp.fid(21)),104)$$,'same-currency transfer is atomic');
select is((select sum(amount) from public.finance_cash_effects where kind='transfer'),0::numeric,'same-currency transfer nets to zero');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(21)),50::numeric,'transfer destination credited');
select lives_ok($$select pg_temp.post(jsonb_build_object('kind','transfer','accountId',pg_temp.fid(22),'amount','10','receivedAmount','410','destinationId',pg_temp.fid(21),'fee','1','fx',jsonb_build_object('rate','42','source','manual','effectiveDate','2026-09-02')),105)$$,'cross-currency transfer with explicit source fee');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(22)),89::numeric,'USD debited principal plus fee');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(21)),460::numeric,'actual UAH received is authoritative');
select is((select sum(reporting_amount) from public.finance_cash_effects where kind='transfer' and nature='transfer'),-10::numeric,'historical valuation difference retained as transfer, not operating');
select is((select sum(reporting_amount) from public.finance_cash_effects where entry_role='fee'),-42::numeric,'explicit fee alone is operating outflow');
select is((select count(*) from public.finance_movement_entries where movement_id=(select id from public.finance_movements where request_id=pg_temp.fid(105))),3::bigint,'one event has both legs and fee');
select throws_like($$select pg_temp.post('{"amount":"0"}',110)$$,'%finance_input_invalid%','zero rejected');
select throws_like($$select pg_temp.post('{"amount":"NaN"}',110)$$,'%finance_input_invalid%','NaN rejected');
select throws_like($$select pg_temp.post('{"amount":"Infinity"}',110)$$,'%finance_input_invalid%','infinity rejected');
select throws_like($$select pg_temp.post('{"amount":"1.001"}',110)$$,'%finance_amount_invalid%','currency precision rejected without rounding');
select throws_like($$select pg_temp.post('{"date":"2026-08-31"}',110)$$,'%finance_input_invalid%','before-cutover posting rejected');
select throws_like($$select pg_temp.post('{"date":"9999-01-01"}',110)$$,'%finance_input_invalid%','future actual rejected');
select throws_like($$select pg_temp.post('{"nature":"owner_distribution"}',110)$$,'%check constraint%','incoming cannot masquerade as owner withdrawal');
select throws_like($$select pg_temp.post(jsonb_build_object('accountId',pg_temp.fid(23)),110)$$,'%finance_account_unavailable%','foreign source rejected');
select throws_like($$select pg_temp.post(jsonb_build_object('kind','transfer','receivedAmount','100.25','destinationId',pg_temp.fid(23)),110)$$,'%finance_account_unavailable%','foreign destination rejected atomically');
select is((select count(*) from public.finance_movements where request_id=pg_temp.fid(110)),0::bigint,'failed transfer leaves no partial event');
select throws_like($$select pg_temp.post(jsonb_build_object('kind','transfer','receivedAmount','5','destinationId',pg_temp.fid(20)),110)$$,'%finance_transfer_invalid%','same account transfer rejected');
select throws_like($$select pg_temp.post(jsonb_build_object('kind','transfer','receivedAmount','5','destinationId',pg_temp.fid(21)),110)$$,'%finance_transfer_amount_mismatch%','same currency legs must match');
select throws_like($$select pg_temp.post(jsonb_build_object('accountId',pg_temp.fid(22)),110)$$,'%finance_fx_required%','missing historical FX never falls back');
select throws_like($$select pg_temp.post(jsonb_build_object('accountId',pg_temp.fid(22),'fx',jsonb_build_object('rate','42','source','nbu','effectiveDate','2026-09-03')),110)$$,'%finance_fx_required%','wrong effective date rejected');
select lives_ok($$select pg_temp.post(jsonb_build_object('accountId',pg_temp.fid(22),'fx',jsonb_build_object('rate','43','source','nbu','effectiveDate','2026-09-02')),106)$$,'dated NBU snapshot supported');
select is((select fx_rate from public.finance_movement_entries where movement_id=(select id from public.finance_movements where request_id=pg_temp.fid(105)) and entry_role='primary'),42::numeric,'later FX never changes old rate');
select public.set_finance_account_archived(pg_temp.fid(1),pg_temp.fid(22),true);
select is((select count(*) from public.finance_account_balances where id=pg_temp.fid(22)),1::bigint,'archived balances remain visible');
select throws_like($$select pg_temp.post(jsonb_build_object('accountId',pg_temp.fid(22)),110)$$,'%finance_account_unavailable%','archived account rejects normal activity');
select lives_ok($$select pg_temp.post(jsonb_build_object('accountId',pg_temp.fid(22),'fx',jsonb_build_object('rate','43','source','nbu','effectiveDate','2026-09-02')),106)$$,'retry after archival returns original event');
select lives_ok($$select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(120),(select id from public.finance_movements where request_id=pg_temp.fid(105)),'2026-09-03','Wrong transfer')$$,'explicit reversal permits archived original accounts');
select is((select sum(reporting_amount) from public.finance_cash_effects where entry_role='fee'),0::numeric,'reversal cancels original fee valuation');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(21)),50::numeric,'reversal cancels actual destination amount');
select is((select fx_rate from public.finance_movement_entries where movement_id=(select id from public.finance_movements where request_id=pg_temp.fid(120)) and entry_role='primary'),42::numeric,'reversal preserves original rate');
select lives_ok($$select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(120),(select id from public.finance_movements where request_id=pg_temp.fid(105)),'2026-09-03','Wrong transfer')$$,'reversal retry idempotent');
select throws_like($$select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(121),(select id from public.finance_movements where request_id=pg_temp.fid(105)),'2026-09-03','Again')$$,'%finance_already_reversed%','second reversal denied');
select lives_ok($$select pg_temp.post(jsonb_build_object('kind','refund','relatedMovementId',(select id from public.finance_movements where request_id=pg_temp.fid(101)),'amount','10'),130)$$,'partial actual refund linked to outgoing');
select is((select amount from public.finance_cash_effects where kind='refund'),10::numeric,'supplier refund increases cash');
select throws_like($$select pg_temp.post(jsonb_build_object('kind','refund','relatedMovementId',(select id from public.finance_movements where request_id=pg_temp.fid(101)),'amount','25'),131)$$,'%finance_refund_exceeds_original%','refunds cannot exceed original');
select throws_like($$select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(121),(select id from public.finance_movements where request_id=pg_temp.fid(101)),'2026-09-03','Correct')$$,'%finance_reverse_refunds_first%','linked refunds must be corrected first');
select throws_like($$update public.finance_movements set category='Rewrite'$$,'%permission denied%','admin direct update denied');
select throws_like($$delete from public.finance_movement_entries$$,'%permission denied%','admin direct delete denied');
select throws_like($$insert into public.finance_movements(studio_id) values(pg_temp.fid(1))$$,'%permission denied%','admin direct insert denied');
select throws_like($$select public.save_finance_settings(pg_temp.fid(1),'USD','2026-09-01')$$,'%finance_setup_finalized%','Phase 1 settings remain protected');

-- All surfaces and both mutation paths use the same strongest Finance predicate.
set local role postgres;
create function pg_temp.denied(actor integer) returns setof text language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',pg_temp.fid(actor)::text,true);
 return next is((select count(*) from public.finance_movements),0::bigint,'unauthorized event read: '||actor);
 return next is((select count(*) from public.finance_movement_entries),0::bigint,'unauthorized entries read: '||actor);
 return next is((select count(*) from public.finance_account_balances where studio_id=pg_temp.fid(1)),0::bigint,'unauthorized balance read: '||actor);
 return next is((select count(*) from public.finance_cash_effects),0::bigint,'unauthorized reporting read: '||actor);
 return next throws_like('select pg_temp.post()','%finance_admin_required%','unauthorized create: '||actor);
 return next throws_like('select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(140),pg_temp.fid(150),current_date,''x'')','%finance_admin_required%','unauthorized reversal: '||actor);
end; $$;
set local role authenticated;
select * from pg_temp.denied(11);
select * from pg_temp.denied(12);
select * from pg_temp.denied(13);
select * from pg_temp.denied(14);
set local role anon;
select throws_like($$select * from public.finance_movements$$,'%permission denied%','anon read denied');
select throws_like($$select pg_temp.post()$$,'%permission denied%','anon RPC denied');
set local role postgres;
select throws_like($$update public.finance_movements set description='Rewrite'$$,'%finance_history_immutable%','trigger rejects privileged rewrite');
select throws_like($$delete from public.finance_movement_entries$$,'%finance_history_immutable%','trigger rejects privileged delete');
select throws_like($$delete from public.finance_accounts where id=pg_temp.fid(20)$$,'%foreign key%','referenced accounts cannot be deleted');
select * from finish();
rollback;
