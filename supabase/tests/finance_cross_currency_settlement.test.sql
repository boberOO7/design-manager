begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('65000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Cross currency studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.fid(10),'authenticated','authenticated','cross@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active) values(pg_temp.fid(10),'Cross admin','cross@test','admin',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active) values(pg_temp.fid(1),pg_temp.fid(10),'admin',true);
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'UAH','2026-09-01',pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'USD','USD',0,pg_temp.fid(10)),
(pg_temp.fid(21),pg_temp.fid(1),'EUR','EUR',0,pg_temp.fid(10)),
(pg_temp.fid(22),pg_temp.fid(1),'UAH','UAH',0,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values(pg_temp.fid(30),pg_temp.fid(1),'Cross currency project',100,'2026-09-01',pg_temp.fid(10),'active');
create function pg_temp.cat() returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='project_payments'$$;
create function pg_temp.item() returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(100)$$;
create function pg_temp.movement(request integer) returns uuid language sql as $$select id from public.finance_movements where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(request)$$;
create function pg_temp.post(request integer,account integer,cash numeric,report_rate numeric,settle_rate numeric) returns uuid language sql as $$
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(request),pg_temp.item(),
  jsonb_build_object('kind','incoming','date','2026-09-26','accountId',pg_temp.fid(account),'amount',cash::text,'categoryId',pg_temp.cat())
  || case when account=22 then '{}'::jsonb else jsonb_build_object('fx',jsonb_build_object('rate',report_rate::text,'source','nbu','effectiveDate','2026-09-26')) end
  || case when account=20 then '{}'::jsonb else jsonb_build_object('settlementFx',jsonb_build_object('rate',settle_rate::text,'source','nbu','effectiveDate','2026-09-26')) end
)$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(90),pg_temp.fid(30),jsonb_build_object('stream','design','revision',0,'mode','design','amount','1000','currency','USD','reason','Agreement'));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(100),pg_temp.fid(30),jsonb_build_object('stream','design','item',jsonb_build_object('direction','incoming','amount','1000','currency','USD','categoryId',pg_temp.cat(),'dueDate','2026-09-01','expectedDate','2026-09-26','commitment','agreed','certainty','fixed','established',true,'description','Project installment')));
select lives_ok($$select pg_temp.post(200,20,100,40,1)$$,'USD obligation paid into USD account');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.item()),900::numeric,'same currency decreases USD balance');
select lives_ok($$select pg_temp.post(201,21,660,43,1.2)$$,'USD obligation paid into EUR account');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.item()),108::numeric,'partial EUR payment settles converted USD amount');
select is((select collected_amount from public.finance_project_totals where project_id=pg_temp.fid(30)),892::numeric,'project totals count USD settlement rather than EUR cash');
select is((select payment_amount from public.finance_allocations where movement_id=pg_temp.movement(201) and amount>0),660::numeric,'EUR cash allocation remains in account currency');
select is((select amount from public.finance_allocations where movement_id=pg_temp.movement(201) and amount>0),792::numeric,'obligation allocation stores USD amount');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(21)),660::numeric,'EUR account balance uses EUR');
select is((select reporting_amount from public.finance_movement_entries where movement_id=pg_temp.movement(201) and entry_role='primary'),28380::numeric,'reporting uses separate EUR to UAH snapshot');
select is((select settlement_rate from public.finance_allocations where movement_id=pg_temp.movement(201) and amount>0),1.2::numeric,'settlement FX snapshot stored');
select lives_ok($$select pg_temp.post(202,22,4320,1,0.025)$$,'USD obligation paid into UAH account');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.item()),0::numeric,'UAH payment clears remaining USD obligation');
select is((select collected_amount from public.finance_project_totals where project_id=pg_temp.fid(30)),1000::numeric,'project collected total uses obligation currency once');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(22)),4320::numeric,'UAH account balance uses UAH');
select is((select sum(amount) from public.finance_planning_actuals where category_id=pg_temp.cat()),36700::numeric,'actual reporting includes each ledger movement exactly once');
select lives_ok($$select pg_temp.post(201,21,660,43,1.2)$$,'retry preserves the original payment and allocation');
select is((select count(*) from public.finance_allocations where movement_id=pg_temp.movement(201) and amount>0),1::bigint,'retry cannot double settle');
select is((select fx_rate from public.finance_movement_entries where movement_id=pg_temp.movement(201) and entry_role='primary'),43::numeric,'ledger reporting FX stays historical');
select is((select settlement_effective_date::text from public.finance_allocations where movement_id=pg_temp.movement(201) and amount>0),'2026-09-26','settlement date stays historical');
select lives_ok($$select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(203),jsonb_build_object('kind','refund','date','2026-09-26','accountId',pg_temp.fid(21),'amount','100','relatedMovementId',pg_temp.movement(201),'categoryId',pg_temp.cat(),'fx',jsonb_build_object('rate','43','source','nbu','effectiveDate','2026-09-26')))$$,'EUR refund releases matching USD settlement');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.item()),120::numeric,'refunded EUR reopens USD obligation at historical settlement rate');
select is((select collected_amount from public.finance_project_totals where project_id=pg_temp.fid(30)),880::numeric,'project total follows released USD settlement');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(21)),560::numeric,'EUR refund decreases only EUR cash');
select is((select sum(amount) from public.finance_planning_actuals where category_id=pg_temp.cat()),32400::numeric,'refund reduces actual reporting once');
select is((select settlement_rate from public.finance_allocations where movement_id=pg_temp.movement(201) and amount<0),1.2::numeric,'refund release retains original FX snapshot');
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(101),jsonb_build_object('direction','incoming','amount','10','currency','USD','categoryId',pg_temp.cat(),'dueDate','2026-09-01','expectedDate','2026-09-26','commitment','agreed','certainty','fixed','established',true,'description','Small installment'));
select lives_ok($$select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(204),(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(101)),jsonb_build_object('kind','incoming','date','2026-09-26','accountId',pg_temp.fid(21),'amount','10','categoryId',pg_temp.cat(),'fx',jsonb_build_object('rate','43','source','nbu','effectiveDate','2026-09-26'),'settlementFx',jsonb_build_object('rate','1.2','source','nbu','effectiveDate','2026-09-26')))$$,'cross-currency overpayment caps obligation settlement');
select is((select amount from public.finance_allocations where movement_id=pg_temp.movement(204) and amount>0),10::numeric,'capped settlement does not exceed obligation');
select is((select payment_amount from public.finance_allocations where movement_id=pg_temp.movement(204) and amount>0),8.34::numeric,'capped settlement reserves enough EUR cents');
select is((select unapplied_amount from public.finance_payment_availability where id=pg_temp.movement(204)),1.66::numeric,'EUR overpayment remains available in EUR');
select * from finish();
rollback;
