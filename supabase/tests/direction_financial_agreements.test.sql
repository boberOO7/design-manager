begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('da000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Direction agreements');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','direction-agreement-'||n||'@test','{}','{}',now(),now() from generate_series(10,11)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Agreement tester','direction-agreement-'||n||'@test',case when n=10 then 'admin' else 'employee' end,true from generate_series(10,11)n;
insert into public.studio_members(studio_id,user_id,system_role)
select pg_temp.fid(1),pg_temp.fid(n),case when n=10 then 'admin' else 'employee' end from generate_series(10,11)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'UAH','2026-09-01',pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'UAH','UAH',0,pg_temp.fid(10)),(pg_temp.fid(21),pg_temp.fid(1),'EUR','EUR',0,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values(pg_temp.fid(30),pg_temp.fid(1),'Direction finance',120,'2026-09-01',pg_temp.fid(10),'active');
create function pg_temp.cat() returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='project_payments'$$;
create function pg_temp.directions() returns uuid[] language sql as $$select array_agg(id order by is_default desc) from public.project_work_directions where project_id=pg_temp.fid(30)$$;
create function pg_temp.plan(code text default 'UAH') returns jsonb language sql as $$select jsonb_build_object(
  'revision',0,'pricingMethod','fixed','amount',case when code='UAH' then '1000' else '200' end,'currency',code,'reason','Client agreed terms','known','[]'::jsonb,'allowUnscheduled',false,
  'vatRate',case when code='UAH' then '20' else null end,'priceBasis',case when code='UAH' then 'net' else null end,'items',jsonb_build_array(
    jsonb_build_object('draftKey',pg_temp.fid(900),'name','Advance','amount',case when code='UAH' then '500' else '100' end,'dueDate','2026-09-20','expectedDate','2026-09-20'),
    jsonb_build_object('draftKey',pg_temp.fid(901),'name','Final','amount',case when code='UAH' then '500' else '100' end,'dueDate','2026-10-20','expectedDate','2026-10-20')))$$;
create function pg_temp.input(label text,ids uuid[],code text default 'UAH') returns jsonb language sql as $$select jsonb_build_object('intent','create','name',label,'directionIds',to_jsonb(ids),'plan',pg_temp.plan(code),'confirm',true)$$;
create function pg_temp.agree(n integer,label text,ids uuid[],code text default 'UAH') returns uuid language sql as $$select public.create_finance_direction_order(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(30),pg_temp.input(label,ids,code))$$;
create function pg_temp.order_id(label text) returns uuid language sql as $$select id from public.finance_project_orders where project_id=pg_temp.fid(30) and name=label$$;
create function pg_temp.item(label text) returns uuid language sql as $$select id from public.finance_project_expected_balances where order_id=pg_temp.order_id(label) order by schedule_position limit 1$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select public.save_project_work_direction(pg_temp.fid(30),'{"intent":"save","kind":"facade","name":"Facade","areaM2":300,"coefficient":0.3}',(select stage_configuration_version from public.projects where id=pg_temp.fid(30)));
select lives_ok($$select pg_temp.agree(100,'Interior',(pg_temp.directions())[1:1])$$,'complete terms confirm in one call');
select is((select status from public.finance_project_orders where id=pg_temp.order_id('Interior')),'confirmed','no intermediate draft remains');
select is((select count(*) from public.finance_project_terms),1::bigint,'one immutable terms revision');
select is((select count(*) from public.finance_project_plan_items),2::bigint,'canonical payment schedule materialized');
select is((select contract_gross_amount from public.finance_project_totals where currency='UAH'),1200::numeric,'VAT is retained in contract gross');
select is(pg_temp.agree(100,'Interior',(pg_temp.directions())[1:1]),pg_temp.order_id('Interior'),'lost-response retry returns same agreement');
select is((select count(*) from public.finance_project_orders),1::bigint,'retry creates no duplicate agreement');
select throws_like($$select pg_temp.agree(100,'Changed request',(pg_temp.directions())[1:1])$$,'%finance_request_conflict%','request cannot be reused with changed terms');
select lives_ok($$select pg_temp.agree(101,'Interior extra',(pg_temp.directions())[1:1])$$,'a direction can have multiple agreements');
select lives_ok($$select pg_temp.agree(102,'Shared package',pg_temp.directions())$$,'one agreement can cover multiple directions');
select is((select count(*) from public.finance_order_work_directions where order_id=pg_temp.order_id('Shared package')),2::bigint,'shared scope uses one commercial identity');
select is((select contract_gross_amount from public.finance_project_totals where currency='UAH'),3600::numeric,'multiple and shared agreements count once');
select lives_ok($$select pg_temp.agree(103,'Facade USD',(pg_temp.directions())[2:2],'USD')$$,'independent agreement currency remains supported');
select is((select contract_gross_amount from public.finance_project_totals where currency='USD'),200::numeric,'USD contract is not added to UAH');
select lives_ok($$select public.create_finance_direction_order(pg_temp.fid(1),pg_temp.fid(104),pg_temp.fid(30),pg_temp.input('Proposal draft',(pg_temp.directions())[2:2])||'{"confirm":false}')$$,'draft terms remain available for proposals');
select is((select count(*) from public.finance_project_terms),4::bigint,'draft creates no canonical terms or forecast payments');
select throws_like($$select public.create_finance_direction_order(pg_temp.fid(1),pg_temp.fid(105),pg_temp.fid(30),pg_temp.input('Invalid',pg_temp.directions())||jsonb_build_object('plan',pg_temp.plan()||'{"amount":"999"}'))$$,'%finance_project_over_scheduled%','invalid schedule rolls back the whole creation');
select is((select count(*) from public.finance_project_orders where name='Invalid'),0::bigint,'failure leaves no empty order');
select is((select count(*) from public.finance_planning_requests where request_id=pg_temp.fid(105)),0::bigint,'failed operation leaves no request result');
select lives_ok($$select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(200),pg_temp.item('Interior'),jsonb_build_object('kind','incoming','date','2026-09-26','amount','200','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()))$$,'partial payment uses the existing ledger');
select is((select settled_amount from public.finance_expected_balances where id=pg_temp.item('Interior')),200::numeric,'partial payment is matched once');
select lives_ok($$select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(201),jsonb_build_object('kind','refund','date','2026-09-26','amount','50','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat(),'relatedMovementId',(select id from public.finance_movements where request_id=pg_temp.fid(200))))$$,'refund keeps original settlement history');
select is((select collected_amount from public.finance_project_totals where currency='UAH'),150::numeric,'refund reduces consolidated matched payments once');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.item('Interior')),450::numeric,'refund reopens the original gross receivable');
select lives_ok($$select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(202),pg_temp.item('Facade USD'),jsonb_build_object('kind','incoming','date','2026-09-26','amount','40','accountId',pg_temp.fid(21),'categoryId',pg_temp.cat(),'fx',jsonb_build_object('rate','45','source','manual','effectiveDate','2026-09-26'),'settlementFx',jsonb_build_object('rate','1.25','source','manual','effectiveDate','2026-09-26')))$$,'EUR cash can settle a USD agreement');
select is((select collected_amount from public.finance_project_totals where currency='USD'),50::numeric,'matched amount uses contract currency');
select lives_ok($$select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(203),jsonb_build_object('kind','refund','date','2026-09-26','amount','10','accountId',pg_temp.fid(21),'categoryId',pg_temp.cat(),'relatedMovementId',(select id from public.finance_movements where request_id=pg_temp.fid(202)),'fx',jsonb_build_object('rate','45','source','manual','effectiveDate','2026-09-26')))$$,'cross-currency refund uses historical settlement FX');
select is((select collected_amount from public.finance_project_totals where currency='USD'),37.5::numeric,'refund releases only the historically matched USD value');
create temporary table before_relink as select * from public.finance_project_totals;
create temporary table terms_before_relink as select * from public.finance_project_terms;
select public.save_finance_order_directions(pg_temp.fid(30),pg_temp.order_id('Interior'),pg_temp.directions(),(select stage_configuration_version from public.projects where id=pg_temp.fid(30)));
select results_eq($$select * from public.finance_project_totals order by currency$$,$$select * from before_relink order by currency$$,'changing direction scope preserves every consolidated total');
select results_eq($$select * from public.finance_project_terms order by id$$,$$select * from terms_before_relink order by id$$,'direction scope does not rewrite any historical terms');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select pg_temp.agree(300,'Unauthorized',pg_temp.directions())$$,'%direction_not_admin%','employee cannot publish commercial terms');
select is((select count(*) from public.finance_project_orders),0::bigint,'finance remains administrator-only');
select * from finish();
rollback;
