begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('66000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Project expense studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.fid(10),'authenticated','authenticated','expense@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active) values(pg_temp.fid(10),'Expense admin','expense@test','admin',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active) values(pg_temp.fid(1),pg_temp.fid(10),'admin',true);
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'UAH','2026-09-01',pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'EUR cash','EUR',0,pg_temp.fid(10)),
(pg_temp.fid(21),pg_temp.fid(1),'USD cash','USD',0,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
values(pg_temp.fid(30),pg_temp.fid(1),'Expense project',100,'2026-09-01',pg_temp.fid(10),'active');
create function pg_temp.cat() returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='project_other_expense'$$;
create function pg_temp.customcat() returns uuid language sql as $$select result_id from public.finance_planning_requests where request_id=pg_temp.fid(106)$$;
create function pg_temp.item() returns uuid language sql as $$select result_id from public.finance_planning_requests where request_id=pg_temp.fid(100)$$;
create function pg_temp.movement(n integer) returns uuid language sql as $$select id from public.finance_movements where request_id=pg_temp.fid(n)$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select is((select count(*) from public.finance_categories where studio_id=pg_temp.fid(1) and project_expense_enabled),5::bigint,
  'five project expense defaults are seeded in the global Finance category model');
select lives_ok($$select public.save_finance_category(pg_temp.fid(1),pg_temp.fid(106),
  jsonb_build_object('name','Specialist service','direction','outgoing','nature','operating','archived',false,'projectExpenseEnabled',true))$$,
  'custom operating Finance category can be enabled for project expenses');
select is((select project_expense_enabled from public.finance_categories where id=pg_temp.customcat()),true,
  'custom category retains its project expense scope');
select lives_ok($$select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(100),pg_temp.fid(30),
  jsonb_build_object('stream','expenses','item',jsonb_build_object('direction','outgoing','amount','100','currency','USD',
  'categoryId',pg_temp.cat(),'description','Site measurement','expectedDate','2026-09-26','commitment','agreed','certainty','fixed','established',true)))$$,
  'project expense creates canonical outgoing expectation');
select is((select count(*) from public.finance_project_expected_balances where project_id=pg_temp.fid(30) and stream='expenses'),1::bigint,
  'expense appears in project Finance');
select is((select count(*) from public.finance_expected_balances where id=pg_temp.item() and direction='outgoing'),1::bigint,
  'same expense appears in global outgoing Finance');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),0::bigint,
  'planned expense creates no cash movement');
select throws_like($$select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(101),pg_temp.fid(30),
  jsonb_build_object('stream','expenses','item',jsonb_build_object('direction','incoming','amount','100','currency','USD',
  'categoryId',pg_temp.cat(),'description','Wrong direction','commitment','agreed','certainty','fixed')))$$,
  '%finance_project_expense_invalid%','expense cannot be saved as income');
select throws_like($$select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(103),pg_temp.fid(30),
  jsonb_build_object('stream','expenses','item',jsonb_build_object('direction','outgoing','amount','100','currency','USD',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='financing_out'),
  'description','Wrong category','commitment','agreed','certainty','fixed')))$$,
  '%finance_project_expense_invalid%','project expense requires an operating expense category');
select throws_like($$select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(104),
  jsonb_build_object('id',pg_temp.item(),'version',1,'direction','outgoing','amount','100','currency','USD',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='financing_out'),
  'description','Site measurement','expectedDate','2026-09-26','commitment','agreed','certainty','fixed','established',true))$$,
  '%finance_project_expense_invalid%','global Finance cannot reclassify a project cost as financing');
select throws_like($$select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(107),pg_temp.fid(30),
  jsonb_build_object('stream','expenses','item',jsonb_build_object('direction','outgoing','amount','10','currency','USD',
  'categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='other_expense'),
  'description','Unscoped cost','commitment','agreed','certainty','fixed')))$$,
  '%finance_project_expense_invalid%','unscoped global expense category is unavailable in Project Expenses');
select lives_ok($$select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(200),pg_temp.item(),
  jsonb_build_object('kind','outgoing','date','2026-09-26','accountId',pg_temp.fid(20),'amount','50','categoryId',pg_temp.cat(),
  'fx',jsonb_build_object('rate','43','source','nbu','effectiveDate','2026-09-26'),
  'settlementFx',jsonb_build_object('rate','1.2','source','nbu','effectiveDate','2026-09-26')))$$,
  'EUR cash pays part of USD project expense');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.item()),40::numeric,
  'USD obligation settles by saved cross rate');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(20)),-50::numeric,
  'cash balance stays in EUR');
select is((select payment_amount from public.finance_allocations where movement_id=pg_temp.movement(200) and amount>0),50::numeric,
  'allocation keeps actual EUR cash amount');
select is((select amount from public.finance_allocations where movement_id=pg_temp.movement(200) and amount>0),60::numeric,
  'allocation keeps USD obligation amount');
select is((select settlement_rate from public.finance_allocations where movement_id=pg_temp.movement(200) and amount>0),1.2::numeric,
  'settlement rate is stored');
select is((select settlement_effective_date::text from public.finance_allocations where movement_id=pg_temp.movement(200) and amount>0),'2026-09-26',
  'settlement effective date is stored');
select is((select amount from public.finance_movement_entries where movement_id=pg_temp.movement(200) and entry_role='primary'),-50::numeric,
  'immutable ledger entry supplies actual cash history');
select is((select fx_rate from public.finance_movement_entries where movement_id=pg_temp.movement(200) and entry_role='primary'),43::numeric,
  'reporting valuation is an independent historical snapshot');
select is((select sum(amount) from public.finance_planning_actuals where category_id=pg_temp.cat()),2150::numeric,
  'expense enters global actual reporting once');
select throws_like($$select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(102),pg_temp.fid(30),
  jsonb_build_object('stream','expenses','item',jsonb_build_object('id',pg_temp.item(),'version',1,'direction','outgoing',
  'amount','120','currency','USD','categoryId',pg_temp.cat(),'description','Site measurement','expectedDate','2026-09-26',
  'commitment','agreed','certainty','fixed','established',true)))$$,
  '%finance_project_settled_terms_locked%','paid amount cannot be rewritten');
select lives_ok($$select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(201),
  jsonb_build_object('kind','outgoing','date','2026-09-26','accountId',pg_temp.fid(21),'amount','40','categoryId',pg_temp.cat(),
  'fx',jsonb_build_object('rate','40','source','nbu','effectiveDate','2026-09-26')))$$,
  'existing USD cash movement is recorded separately');
select lives_ok($$select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(202),pg_temp.item(),pg_temp.movement(201),40)$$,
  'existing outgoing cash movement links to project expense');
select is((select payment_state from public.finance_expected_balances where id=pg_temp.item()),'settled','project expense is fully settled');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),2::bigint,
  'linking existing cash creates no duplicate ledger movement');
select is((select sum(amount) from public.finance_planning_actuals where category_id=pg_temp.cat()),3750::numeric,
  'global reporting counts each cash movement exactly once');
select lives_ok($$select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(105),pg_temp.fid(30),
  jsonb_build_object('stream','expenses','item',jsonb_build_object('direction','outgoing','amount','25','currency','UAH',
  'categoryId',pg_temp.customcat(),'description','','commitment','agreed','certainty','fixed')))$$,
  'project expense can use a custom scoped category with no description or date');
select is((select expected_payment_date from public.finance_expected_items where id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(105))),
  null::date,'optional expected date remains empty');
select * from finish();
rollback;
