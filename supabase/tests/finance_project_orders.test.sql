begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('69000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Project Finance A'),(pg_temp.fid(2),'Project Finance B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','order-'||n||'@test','{}','{}',now(),now() from generate_series(10,14)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Planning tester','order-'||n||'@test',case when n=11 then 'employee' else 'admin' end,n<>13 from generate_series(10,14)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=12 then 2 else 1 end),pg_temp.fid(n),case when n=11 then 'employee' else 'admin' end,n<>14 from generate_series(10,14)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.fid(1),'UAH','2026-09-01',pg_temp.fid(10)),(pg_temp.fid(2),'UAH','2026-09-01',pg_temp.fid(12));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',1000,pg_temp.fid(10)),(pg_temp.fid(21),pg_temp.fid(1),'Dollar','USD',0,pg_temp.fid(10));
create function pg_temp.cat(key text,studio integer default 1) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(studio) and default_key=key$$;
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values
(pg_temp.fid(30),pg_temp.fid(1),'Project A',100,'2026-09-01',pg_temp.fid(10),'active'),
(pg_temp.fid(31),pg_temp.fid(2),'Project B',100,'2026-09-01',pg_temp.fid(12),'active');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values(pg_temp.fid(30),pg_temp.fid(11),'designer',0,'2026-09-01');
insert into public.contractor_categories(id,studio_id,name,color_key) values(pg_temp.fid(40),pg_temp.fid(1),'Builders','blue'),(pg_temp.fid(41),pg_temp.fid(2),'Builders','blue');
insert into public.contractors(id,category_id,name,created_by) values(pg_temp.fid(42),pg_temp.fid(40),'Builder A',pg_temp.fid(10)),(pg_temp.fid(43),pg_temp.fid(41),'Builder B',pg_temp.fid(12));
create function pg_temp.result(n integer) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.terms(n integer,patch jsonb default '{}',project integer default 30) returns uuid language sql as $$
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(project),jsonb_build_object('stream','design','revision',0,'mode','design','amount','500','currency','UAH','reason','Agreement')||patch)$$;
create function pg_temp.item(n integer,patch jsonb default '{}',context jsonb default '{}',project integer default 30) returns uuid language sql as $$
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(project),jsonb_build_object('stream','design','item',jsonb_build_object('direction','incoming','amount','100','currency','UAH','categoryId',pg_temp.cat('project_payments'),
  'description','Advance','dueDate','2026-09-01','expectedDate','2026-10-01','commitment','agreed','certainty','fixed','established',true)||patch)||context)$$;
create function pg_temp.months(n integer,first_month date default '2026-09-01',last_month date default '2026-11-01') returns uuid language sql as $$select public.generate_finance_supervision_months(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(30),first_month,last_month)$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));

create function pg_temp.order_id(label text) returns uuid language sql as $$select id from public.finance_project_orders where studio_id=pg_temp.fid(1) and project_id=pg_temp.fid(30) and name=label$$;
create function pg_temp.draft(patch jsonb default '{}') returns jsonb language sql as $$select jsonb_build_object(
  'revision',0,'pricingMethod','fixed','amount','1000','currency','UAH','reason','Facade commission','known','[]'::jsonb,'allowUnscheduled',false,
  'vatRate','20','priceBasis','net','items',jsonb_build_array(
    jsonb_build_object('draftKey',pg_temp.fid(900),'name','Facade advance','amount','500','dueDate','2026-09-20','clientNote','Client note','percentage','50'),
    jsonb_build_object('draftKey',pg_temp.fid(901),'name','Facade final','amount','500','dueDate','2026-10-20','percentage','50')))||patch$$;
create function pg_temp.order_write(n integer,intent text,label text,patch jsonb default '{}') returns uuid language sql as $$
select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(30),jsonb_build_object('intent',intent,'name',label,'orderId',pg_temp.order_id(label),
  'version',(select version from public.finance_project_orders where id=pg_temp.order_id(label)))||patch)$$;
create function pg_temp.snapshot(p_order_name text) returns jsonb language sql as $$select jsonb_build_object('orderId',pg_temp.order_id(p_order_name),
  'planRevisionId',(select id from public.finance_project_current_terms where order_id=pg_temp.order_id(p_order_name)),
  'items',coalesce((select jsonb_agg(jsonb_build_object('itemId',id,'version',version,'remaining',remaining_amount::text) order by id)
    from public.finance_project_expected_balances where order_id=pg_temp.order_id(p_order_name) and commitment<>'cancelled' and remaining_amount>0),'[]'::jsonb))$$;
create function pg_temp.item_id(label text) returns uuid language sql as $$select id from public.finance_project_expected_balances where studio_id=pg_temp.fid(1) and description=label$$;
create function pg_temp.pay(n integer,allocations jsonb) returns uuid language sql as $$select public.record_finance_project_payment(
  pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(30),pg_temp.item_id('Interior advance'),jsonb_build_object('kind','incoming','date','2026-09-20',
  'amount','1200','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('project_payments')),allocations,pg_temp.snapshot('Основне замовлення'))$$;

select lives_ok($$select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(100),pg_temp.fid(30),jsonb_build_object(
  'revision',0,'pricingMethod','fixed','amount','1000','currency','UAH','reason','Interior agreement','allowUnscheduled',false,'known','[]'::jsonb,
  'items',jsonb_build_array(jsonb_build_object('name','Interior advance','amount','500','dueDate','2026-09-20'),
    jsonb_build_object('name','Interior final','amount','500','dueDate','2026-10-20'))))$$,'legacy plan establishes confirmed default order');
select is((select count(*) from public.finance_project_orders where status='confirmed'),1::bigint,'one confirmed default commercial identity');
create temporary table interior_before as select * from public.finance_expected_items where id in(select id from public.finance_project_plan_items);
select lives_ok($$select pg_temp.order_write(101,'create','Фасад',jsonb_build_object('plan',pg_temp.draft()))$$,'additional order saved only as draft');
select is((select count(*) from public.finance_project_terms),1::bigint,'draft creates no agreement');
select is((select count(*) from public.finance_project_plan_items),2::bigint,'draft creates no expected payment');
select is((select contract_amount from public.finance_project_totals where stream='design'),1000::numeric,'draft excluded from totals');
select throws_like($$select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(102),pg_temp.fid(30),jsonb_build_object(
  'orderId',pg_temp.order_id('Фасад'),'stream','design','mode','design','revision',0,'amount','1000','currency','UAH','reason','Bypass draft'))$$,
  '%finance_project_order_unconfirmed%','ordinary agreement writer cannot publish a draft');
select throws_like($$select pg_temp.order_write(103,'saveDraft','Фасад',jsonb_build_object('version',0,'plan',pg_temp.draft()))$$,
  '%finance_version_conflict%','stale draft edit rejected');
select throws_like($$select pg_temp.order_write(103,'saveDraft','Фасад',jsonb_build_object('plan',pg_temp.draft('{"amount":"999"}')))$$,
  '%finance_project_over_scheduled%','draft validation reuses contractual ceiling');
select lives_ok($$select pg_temp.order_write(104,'saveDraft','Фасад',jsonb_build_object('plan',pg_temp.draft()))$$,'valid draft edit increments version');
select lives_ok($$select pg_temp.order_write(105,'confirm','Фасад')$$,'confirmation materializes terms and schedule atomically');
select lives_ok($$select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(105),pg_temp.fid(30),
  (select payload->'input' from public.finance_planning_requests where request_id=pg_temp.fid(105)))$$,'lost-response confirmation retry is idempotent');
select is((select count(*) from public.finance_project_terms),2::bigint,'one terms revision per confirmed order');
select is((select count(*) from public.finance_project_plan_items),4::bigint,'independent canonical schedule');
select is((select contract_amount from public.finance_project_order_totals where order_id=pg_temp.order_id('Фасад')),1200::numeric,'order retains VAT-inclusive native value');
select is((select contract_amount from public.finance_project_totals where stream='design'),2200::numeric,'same-currency project value sums both orders once');
select results_eq($$select * from public.finance_expected_items where id in(select id from interior_before) order by id$$,
  $$select * from interior_before order by id$$,'additional order preserves every initial payment field');
select throws_like($$select pg_temp.order_write(106,'discard','Фасад')$$,'%finance_project_order_history_locked%','confirmed order cannot return to draft or disappear');
select throws_like($$select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(107),pg_temp.fid(30),jsonb_build_object('stream','design','orderId',pg_temp.order_id('Фасад'),
  'item',jsonb_build_object('id',pg_temp.item_id('Interior advance'),'version',1,'direction','incoming','amount','500','currency','UAH','categoryId',pg_temp.cat('project_payments'),
  'description','Moved payment','commitment','agreed','certainty','fixed','established',true)))$$,'%finance_project_invalid%','payment ownership cannot be reassigned between orders');
select throws_like($$select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(108),pg_temp.fid(31),pg_temp.draft()||jsonb_build_object('orderId',pg_temp.order_id('Фасад')))$$,
  '%finance_project_invalid%','foreign-project order writer rejected');

-- Commercial amendments and optimistic schedule state remain isolated.
select lives_ok($$select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(109),pg_temp.fid(30),pg_temp.draft()||jsonb_build_object(
  'orderId',pg_temp.order_id('Фасад'),'revision',1,'amount','1100','allowUnscheduled',true,
  'known',(select jsonb_agg(jsonb_build_object('id',id,'version',version,'protected',has_settlement_history) order by id)
    from public.finance_project_plan_items where order_id=pg_temp.order_id('Фасад')),
  'items',(select jsonb_agg(jsonb_build_object('id',id,'name',description,'amount','500','dueDate',due_date,'percentage','50') order by due_date)
    from public.finance_project_plan_items where order_id=pg_temp.order_id('Фасад'))))$$,'additional order amendment checks only its own schedule');
select is((select revision from public.finance_project_current_terms where order_id=pg_temp.order_id('Фасад')),2,'additional order revisions advance independently');
select is((select revision from public.finance_project_current_terms where order_id=pg_temp.order_id('Основне замовлення')),1,'initial order revision remains unchanged');
select results_eq($$select * from public.finance_expected_items where id in(select id from interior_before) order by id$$,
  $$select * from interior_before order by id$$,'another order amendment preserves initial payment fields and percentages');
select is((select unscheduled_amount from public.finance_project_order_totals where order_id=pg_temp.order_id('Фасад')),120::numeric,'unscheduled amendment remainder belongs to one order');

-- A malicious forward-allocation payload cannot silently pay another order.
select throws_like($$select pg_temp.pay(110,jsonb_build_array(jsonb_build_object('itemId',pg_temp.item_id('Interior advance'),'amount','500'),
  jsonb_build_object('itemId',pg_temp.item_id('Facade advance'),'amount','600')))$$,'%finance_allocation_incompatible%','automatic batch cannot spill into another order');
select is((select count(*) from public.finance_movements where request_id=pg_temp.fid(110)),0::bigint,'invalid spill rolls back the entire receipt');
select lives_ok($$select pg_temp.pay(111,jsonb_build_array(jsonb_build_object('itemId',pg_temp.item_id('Interior advance'),'amount','500'),
  jsonb_build_object('itemId',pg_temp.item_id('Interior final'),'amount','500')))$$,'automatic forward allocation remains in originating order');
select is((select settled_amount from public.finance_expected_balances where id=pg_temp.item_id('Facade advance')),0::numeric,'other order stays unpaid');
select is((select order_id from public.finance_project_payment_context where movement_id=(select id from public.finance_movements where request_id=pg_temp.fid(111))),
  pg_temp.order_id('Основне замовлення'),'unapplied excess retains order context');
select lives_ok($$select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(112),pg_temp.item_id('Facade advance'),
  (select id from public.finance_movements where request_id=pg_temp.fid(111)),200)$$,'explicit same-currency matching can allocate excess to another order');
select is((select settled_amount from public.finance_expected_balances where id=pg_temp.item_id('Facade advance')),200::numeric,'explicit cross-order amount recorded once');
select lives_ok($$select public.close_finance_expected_remainder(pg_temp.fid(1),pg_temp.fid(113),pg_temp.item_id('Facade advance'),
  '2026-09-21','client_agreement','',400)$$,'order remainder closure keeps existing non-cash boundary');
select is((select closed_amount from public.finance_project_order_totals where order_id=pg_temp.order_id('Фасад')),400::numeric,'closure attributed only to its order');
select is((select count(*) from public.finance_movements),1::bigint,'remainder closure creates no cash');
select lives_ok($$select public.reverse_finance_settlement_adjustment(pg_temp.fid(1),pg_temp.fid(114),
  (select id from public.finance_settlement_adjustments where expected_item_id=pg_temp.item_id('Facade advance')),'2026-09-22','Reopen agreed balance')$$,'closure reversal preserves order ownership');
select lives_ok($$select public.cancel_finance_project_expectation(pg_temp.fid(1),pg_temp.fid(115),jsonb_build_object(
  'itemId',pg_temp.item_id('Facade advance'),'orderId',pg_temp.order_id('Фасад'),'version',(select version from public.finance_expected_items where id=pg_temp.item_id('Facade advance')),
  'settledAmount','200','retainSettlement',true,'reason','Retain accepted facade work'))$$,'retained cancellation follows original order');
select is((select count(*) from public.finance_project_items where stream='design' and order_id=pg_temp.order_id('Фасад')),3::bigint,'replacement retained payment belongs to same order');

select lives_ok($$select pg_temp.order_write(120,'create','Draft only')$$,'unpriced draft can be created');
select throws_like($$select pg_temp.order_write(121,'confirm','Draft only')$$,'%finance_input_invalid%','unpriced confirmation fails safely');
select is((select status from public.finance_project_orders where id=pg_temp.order_id('Draft only')),'draft','failed confirmation leaves parent draft');
select lives_ok($$select pg_temp.order_write(122,'discard','Draft only')$$,'draft can be discarded without canonical writes');
select is((select count(*) from public.finance_project_order_totals),2::bigint,'discarded order excluded from totals');
select lives_ok($$select pg_temp.order_write(124,'create','Schedule later',jsonb_build_object('plan',pg_temp.draft(jsonb_build_object(
  'currency','USD','amount','100','vatRate',null,'priceBasis',null,'items','[]'::jsonb,'allowUnscheduled',true))))$$,'valid commercial draft supports schedule later');
select lives_ok($$select pg_temp.order_write(125,'confirm','Schedule later')$$,'order can confirm without an expected payment schedule');
select is((select payment_count from public.finance_project_order_totals where order_id=pg_temp.order_id('Schedule later')),0::bigint,'empty schedule projected accurately');
select is((select has_payment_history from public.finance_project_order_totals where order_id=pg_temp.order_id('Schedule later')),false,'unscheduled order has no historical currency lock');
select lives_ok($$select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(126),pg_temp.fid(30),jsonb_build_object('stream','design','orderId',pg_temp.order_id('Schedule later'),
  'item',jsonb_build_object('direction','incoming','amount','100','currency','USD','categoryId',pg_temp.cat('project_payments'),
  'description','Later schedule payment','commitment','agreed','certainty','fixed','established',false)))$$,'confirmed unscheduled order accepts later payment schedule');
select lives_ok($$select public.cancel_finance_project_expectation(pg_temp.fid(1),pg_temp.fid(127),jsonb_build_object('itemId',pg_temp.item_id('Later schedule payment'),
  'orderId',pg_temp.order_id('Schedule later'),'version',(select version from public.finance_expected_items where id=pg_temp.item_id('Later schedule payment')),
  'settledAmount','0','reason','Schedule withdrawn'))$$,'all payment rows can become canceled history');
select is((select payment_count from public.finance_project_order_totals where order_id=pg_temp.order_id('Schedule later')),0::bigint,'canceled history excluded from active count');
select is((select has_payment_history from public.finance_project_order_totals where order_id=pg_temp.order_id('Schedule later')),true,'canceled history keeps historical currency lock');
select throws_like($$select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(128),pg_temp.fid(30),jsonb_build_object(
  'orderId',pg_temp.order_id('Schedule later'),'stream','design','mode','design','revision',1,'amount','100','currency','EUR','reason','Change old currency'))$$,
  '%finance_project_currency_locked%','fully canceled schedule cannot rewrite order currency');

select throws_like($$update public.finance_project_orders set status='confirmed'$$,'%permission denied%','order table is read-only outside guarded RPC');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select is((select count(*) from public.finance_project_orders),0::bigint,'employee cannot read commercial orders');
select throws_like($$select pg_temp.order_write(130,'create','Not authorized')$$,'%finance_admin_required%','employee cannot mutate orders');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select is((select count(*) from public.finance_project_orders),0::bigint,'other studio cannot read order context');
select * from finish();
rollback;
