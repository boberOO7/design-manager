begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as
$$select ('ac000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Proposal calculation');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values(pg_temp.fid(10),'authenticated','authenticated','proposal-calculation@test','{}','{}');
insert into public.profiles(id,full_name,email,system_role,is_active)
values(pg_temp.fid(10),'Calculation admin','proposal-calculation@test','admin',true);
insert into public.studio_members(studio_id,user_id,system_role) values(pg_temp.fid(1),pg_temp.fid(10),'admin');
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.fid(1),'USD','2026-09-01',pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
values(pg_temp.fid(20),pg_temp.fid(1),'Bank','USD',0,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
values(pg_temp.fid(30),pg_temp.fid(1),'336 Landscape',800,'2026-09-01',pg_temp.fid(10),'active');
create function pg_temp.plan(coefficient text default '0.15',fixed boolean default false,metadata boolean default true)
returns jsonb language sql as $$select jsonb_build_object(
  'revision',0,'pricingMethod',case when fixed then 'fixed' else 'area' end,
  'area',(800*coefficient::numeric)::text,'rate','40','amount',(800*coefficient::numeric*40)::text,
  'currency','USD','vatRate',null,'priceBasis',null,'reason','Saved client calculation',
  'known','[]'::jsonb,'items','[]'::jsonb,'allowUnscheduled',true,
  'areaCalculation',case when metadata and not fixed then jsonb_build_object('actualArea','800','coefficient',coefficient) end)$$;
create function pg_temp.source(order_id uuid) returns jsonb language sql as
$$select public.get_finance_proposal_source(pg_temp.fid(1),pg_temp.fid(30),order_id)$$;
create function pg_temp.save(source jsonb) returns uuid language sql security definer set search_path='' as $$
  select public.save_finance_project_proposal(pg_temp.fid(1),pg_temp.fid(30),pg_temp.fid(200),source,
    jsonb_build_object('projectTitle',source->>'projectTitle','clientName',source->>'clientName',
      'contact',source->>'contact','address',source->>'address','intro',''),
    'JVBERi1mcm96ZW4=',pg_temp.fid(10),(source->'order'->>'id')::uuid)
$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select public.save_project_work_direction(pg_temp.fid(30),'{"intent":"save","kind":"landscape","name":"Landscape","areaM2":800,"coefficient":0.15}',
  (select stage_configuration_version from public.projects where id=pg_temp.fid(30)));
create temporary table agreement as select public.create_finance_direction_order(pg_temp.fid(1),pg_temp.fid(100),pg_temp.fid(30),jsonb_build_object(
  'intent','create','name','Landscape calculation','confirm',false,
  'directionIds',jsonb_build_array((select id from public.project_work_directions where project_id=pg_temp.fid(30) and name='Landscape')),
  'plan',pg_temp.plan())) as id;
select is(pg_temp.source((select id from agreement))->'areaCalculation','{"actualArea":"800","coefficient":"0.15"}'::jsonb,'draft source freezes actual area and coefficient');
select is((pg_temp.source((select id from agreement))->>'area')::numeric,120::numeric,'effective area remains authoritative');
select is((pg_temp.source((select id from agreement))->>'clientRatePerM2')::numeric,40::numeric,'client tariff remains unchanged');
select is((pg_temp.source((select id from agreement))->>'gross')::numeric,4800::numeric,'total remains unchanged');
select pg_temp.save(pg_temp.source((select id from agreement)));
create temporary table frozen as select id,snapshot,pdf from public.finance_project_proposals where studio_id=pg_temp.fid(1);
select public.save_project_work_direction(pg_temp.fid(30),jsonb_build_object('intent','save',
  'id',(select id from public.project_work_directions where project_id=pg_temp.fid(30) and name='Landscape'),
  'kind','landscape','name','Landscape','areaM2',1000,'coefficient',0.3),
  (select stage_configuration_version from public.projects where id=pg_temp.fid(30)));
select is(pg_temp.source((select id from agreement))->'areaCalculation','{"actualArea":"800","coefficient":"0.15"}'::jsonb,'draft preview ignores later direction edits');
select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(101),pg_temp.fid(30),jsonb_build_object(
  'intent','confirm','orderId',(select id from agreement),'version',1));
select is(pg_temp.source((select id from agreement))->'areaCalculation','{"actualArea":"800","coefficient":"0.15"}'::jsonb,'confirmation copies the saved calculation into its financial revision');
select is((select area_calculation from public.finance_project_plan_revisions where studio_id=pg_temp.fid(1)),
  '{"actualArea":"800","coefficient":"0.15"}'::jsonb,'revision owns the immutable calculation');
select is((pg_temp.source((select id from agreement))->>'gross')::numeric,4800::numeric,'direction edits do not recalculate agreed totals');
select public.correct_finance_project_order_currency(pg_temp.fid(1),pg_temp.fid(102),pg_temp.fid(30),jsonb_build_object(
  'orderId',(select id from agreement),'termsId',(select id from public.finance_project_current_terms where studio_id=pg_temp.fid(1)),
  'version',(select version from public.finance_project_orders where id=(select id from agreement)),
  'currency','EUR','reason','Correct currency','confirmed',true,'known','[]'::jsonb));
select is(pg_temp.source((select id from agreement))->'areaCalculation','{"actualArea":"800","coefficient":"0.15"}'::jsonb,'currency amendment preserves calculation provenance');
select results_eq($$select id,snapshot,pdf from public.finance_project_proposals where studio_id=pg_temp.fid(1) order by id$$,
  $$select id,snapshot,pdf from frozen order by id$$,'stored PDF bytes and snapshots remain unchanged');
create temporary table compact as select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(103),pg_temp.fid(30),
  jsonb_build_object('intent','create','name','Coefficient one','plan',pg_temp.plan('1.00'))) as id;
select is(pg_temp.source((select id from compact))->'areaCalculation','{"actualArea":"800","coefficient":"1.00"}'::jsonb,'unit coefficient is retained for compact rendering');
create temporary table manual as select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(104),pg_temp.fid(30),
  jsonb_build_object('intent','create','name','Fixed price','plan',pg_temp.plan('0.15',true))) as id;
select is(pg_temp.source((select id from manual))->'areaCalculation','null'::jsonb,'manual fixed pricing has no coefficient context');
select is(pg_temp.source((select id from manual))->'clientRatePerM2','null'::jsonb,'manual pricing keeps the existing display');
create temporary table legacy as select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(105),pg_temp.fid(30),
  jsonb_build_object('intent','create','name','Legacy area','plan',pg_temp.plan('0.15',false,false)-'areaCalculation')) as id;
select is(pg_temp.source((select id from legacy))->'areaCalculation','null'::jsonb,'missing legacy context is never inferred from current directions');
select throws_like($$select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(106),pg_temp.fid(30),
  jsonb_build_object('intent','create','name','Invalid','plan',pg_temp.plan()||'{"areaCalculation":{"actualArea":"800","coefficient":"0.3"}}'))$$,
  '%finance_input_invalid%','mismatched draft calculation is rejected');
select throws_like($$select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(107),pg_temp.fid(30),
  jsonb_build_object('intent','create','name','Invalid fixed','plan',pg_temp.plan('0.15',true)||'{"areaCalculation":{"actualArea":"800","coefficient":"0.15"}}'))$$,
  '%finance_input_invalid%','fixed price cannot masquerade as coefficient pricing');
select throws_like($$select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(108),pg_temp.fid(30),
  pg_temp.plan()||jsonb_build_object('orderId',(select id from agreement),'revision',2,'currency','EUR',
  'areaCalculation',jsonb_build_object('actualArea','800','coefficient','0.3')))$$,
  '%finance_project_plan_area_calculation_check%','confirmed revision rejects inconsistent provenance');
select is((select count(*) from public.finance_project_plan_revisions where studio_id=pg_temp.fid(1)),2::bigint,'invalid metadata creates no financial revision');
select * from finish();
rollback;
