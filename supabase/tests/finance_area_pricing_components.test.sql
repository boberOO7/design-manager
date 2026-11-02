begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('bc000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Component pricing');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values(pg_temp.fid(10),'authenticated','authenticated','components@test','{}','{}');
insert into public.profiles(id,full_name,email,system_role,is_active) values(pg_temp.fid(10),'Component admin','components@test','admin',true);
insert into public.studio_members(studio_id,user_id,system_role) values(pg_temp.fid(1),pg_temp.fid(10),'admin');
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'USD','2026-09-01',pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values(pg_temp.fid(20),pg_temp.fid(1),'Bank','USD',0,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values(pg_temp.fid(30),pg_temp.fid(1),'336 Facade',200,'2026-09-01',pg_temp.fid(10),'active');
create function pg_temp.components(site text default '30') returns jsonb language sql as $$select jsonb_build_array(
  jsonb_build_object('name','Фасад','actualArea','200','coefficient','0.35'),jsonb_build_object('name','Прилегла територія','actualArea',site,'coefficient','0.10'))$$;
create function pg_temp.plan(site text default '30') returns jsonb language sql as $$select jsonb_build_object(
  'revision',0,'pricingMethod','area','area',(70+site::numeric*0.1)::text,'rate','40','amount',((70+site::numeric*0.1)*40)::text,
  'areaComponents',pg_temp.components(site),'currency','USD','vatRate',null,'priceBasis',null,'reason','Component calculation','known','[]'::jsonb,'items',jsonb_build_array(
    jsonb_build_object('id','','draftKey',pg_temp.fid(400),'name','Advance','amount',((70+site::numeric*0.1)*20)::text,'percentage','50'),
    jsonb_build_object('id','','draftKey',pg_temp.fid(401),'name','Final','amount',((70+site::numeric*0.1)*20)::text,'percentage','50')))$$;
create function pg_temp.source(order_id uuid) returns jsonb language sql as $$select public.get_finance_proposal_source(pg_temp.fid(1),pg_temp.fid(30),order_id)$$;
create function pg_temp.save(source jsonb) returns uuid language sql security definer set search_path='' as $$
  select public.save_finance_project_proposal(pg_temp.fid(1),pg_temp.fid(30),pg_temp.fid(200),source,jsonb_build_object(
    'projectTitle',source->>'projectTitle','clientName',source->>'clientName','contact',source->>'contact','address',source->>'address','intro',''),
    'JVBERi1mcm96ZW4=',pg_temp.fid(10),(source->'order'->>'id')::uuid)$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
create temporary table production_before as select id,area_m2,complexity_coefficient from public.project_work_directions where project_id=pg_temp.fid(30);
create temporary table agreement as select public.create_finance_direction_order(pg_temp.fid(1),pg_temp.fid(100),pg_temp.fid(30),jsonb_build_object(
  'intent','create','name','Facade with site','directionIds',jsonb_build_array((select id from production_before)),'plan',pg_temp.plan(),'confirm',false)) as id;
select is(pg_temp.source((select id from agreement))->'areaComponents',pg_temp.components(),'draft source freezes every named component');
select is((pg_temp.source((select id from agreement))->>'area')::numeric,73::numeric,'calculated areas add up to 73 m²');
select is((pg_temp.source((select id from agreement))->>'gross')::numeric,2920::numeric,'shared tariff gives 2920 USD');
select is((pg_temp.source((select id from agreement))->>'componentRatePerM2')::numeric,40::numeric,'PDF source carries the original shared tariff');
select is((select count(*) from public.finance_project_terms where studio_id=pg_temp.fid(1)),0::bigint,'draft components create no agreement or payments');
select pg_temp.save(pg_temp.source((select id from agreement)));
create temporary table frozen as select id,snapshot,pdf from public.finance_project_proposals where studio_id=pg_temp.fid(1);
select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(101),pg_temp.fid(30),jsonb_build_object(
  'intent','saveDraft','orderId',(select id from agreement),'version',1,'plan',pg_temp.plan('40')));
select is((pg_temp.source((select id from agreement))->>'gross')::numeric,2960::numeric,'editing a draft recalculates its current value');
select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(102),pg_temp.fid(30),jsonb_build_object('intent','confirm','orderId',(select id from agreement),'version',2));
select is((select area_components from public.finance_project_plan_revisions where studio_id=pg_temp.fid(1)),pg_temp.components('40'),'confirmation freezes components in its financial revision');
select is((select sum(amount) from public.finance_project_plan_items where studio_id=pg_temp.fid(1)),2960::numeric,'canonical schedule retains the existing amount allocation');
select results_eq($$select id,area_m2,complexity_coefficient from public.project_work_directions where project_id=pg_temp.fid(30) order by id$$,$$select * from production_before order by id$$,'commercial components do not change productivity area/coefficient');
select is((select total_area_m2 from public.projects where id=pg_temp.fid(30)),200::numeric,'commercial components do not change project production area');
select public.save_project_work_direction(pg_temp.fid(30),jsonb_build_object('intent','save','id',(select id from production_before),
  'name','Updated production','areaM2',900,'coefficient',0.7),(select stage_configuration_version from public.projects where id=pg_temp.fid(30)));
select is(pg_temp.source((select id from agreement))->'areaComponents',pg_temp.components('40'),'current direction edits cannot rewrite financial component history');
create temporary table revision_input as select pg_temp.plan()||jsonb_build_object('orderId',(select id from agreement),'revision',1,
  'known',(select jsonb_agg(jsonb_build_object('id',id,'version',version,'protected',has_settlement_history) order by id) from public.finance_project_plan_items where studio_id=pg_temp.fid(1)),
  'items',(select jsonb_agg(jsonb_build_object('id',id,'name',description,'amount','1460','percentage','50') order by description) from public.finance_project_plan_items where studio_id=pg_temp.fid(1))) as input;
select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(103),pg_temp.fid(30),(select input from revision_input));
select is((select count(*) from public.finance_project_plan_revisions where studio_id=pg_temp.fid(1)),2::bigint,'editing appends a financial revision');
select is((select r.area_components from public.finance_project_plan_revisions r join public.finance_project_terms t on t.id=r.terms_id where t.studio_id=pg_temp.fid(1) and t.revision=1),pg_temp.components('40'),'earlier financial revision retains all original component inputs');
select is(pg_temp.source((select id from agreement))->'areaComponents',pg_temp.components(),'current proposal uses the selected current financial revision');
select is((select count(*) from public.finance_project_plan_items where studio_id=pg_temp.fid(1)),2::bigint,'revision does not create additional payment rows');
select results_eq($$select id,snapshot,pdf from public.finance_project_proposals where studio_id=pg_temp.fid(1) order by id$$,$$select * from frozen order by id$$,'draft edits and financial revisions preserve saved proposal bytes and snapshots');
select public.correct_finance_project_order_currency(pg_temp.fid(1),pg_temp.fid(104),pg_temp.fid(30),jsonb_build_object(
  'orderId',(select id from agreement),'termsId',(select id from public.finance_project_current_terms where studio_id=pg_temp.fid(1)),
  'version',(select version from public.finance_project_orders where id=(select id from agreement)),
  'currency','EUR','reason','Correct currency','confirmed',true,'known',(select jsonb_agg(jsonb_build_object('id',id,'version',version) order by id) from public.finance_project_plan_items where studio_id=pg_temp.fid(1))));
select is(pg_temp.source((select id from agreement))->'areaComponents',pg_temp.components(),'currency correction copies component provenance');
select is((pg_temp.source((select id from agreement))->>'gross')::numeric,2920::numeric,'currency correction keeps native amounts unchanged');
create temporary table taxed as select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(105),pg_temp.fid(30),jsonb_build_object(
  'intent','create','name','VAT discount','plan',pg_temp.plan()||jsonb_build_object('discountType','percentage','discountValue','10','vatRate','20','priceBasis','net','items',jsonb_build_array(
    jsonb_build_object('draftKey',pg_temp.fid(402),'name','Advance','amount','1314','percentage','50'),jsonb_build_object('draftKey',pg_temp.fid(403),'name','Final','amount','1314','percentage','50'))))) as id;
select is((pg_temp.source((select id from taxed))->>'gross')::numeric,3153.60::numeric,'discount then VAT use the unchanged canonical rules');
select is((pg_temp.source((select id from taxed))->'rows'->0->>'gross')::numeric,1576.80::numeric,'VAT schedule keeps exact allocated client amounts');
create temporary table single as select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(106),pg_temp.fid(30),jsonb_build_object(
  'intent','create','name','Single component','plan',pg_temp.plan()||jsonb_build_object('area','70','amount','2800','allowUnscheduled',true,'items','[]'::jsonb,'areaComponents',jsonb_build_array(pg_temp.components()->0)))) as id;
select is((pg_temp.source((select id from single))->>'gross')::numeric,2800::numeric,'a single explicit component remains compatible');
select throws_like($$select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(110),pg_temp.fid(30),jsonb_build_object('intent','create','name','Invalid','plan',pg_temp.plan()||'{"area":"74","amount":"2960","allowUnscheduled":true}'))$$,'%finance_input_invalid%','mismatched aggregate area is rejected');
select throws_like($$select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(111),pg_temp.fid(30),jsonb_build_object('intent','create','name','Invalid','plan',pg_temp.plan()||'{"areaComponents":[]}'))$$,'%finance_input_invalid%','empty components are rejected');
select throws_like($$select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(112),pg_temp.fid(30),jsonb_build_object('intent','create','name','Invalid','plan',pg_temp.plan()||'{"areaComponents":[{"name":"","actualArea":"200","coefficient":"0.35"}]}'))$$,'%finance_input_invalid%','unnamed components are rejected at SQL boundary');
select throws_like($$select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(113),pg_temp.fid(30),jsonb_build_object('intent','create','name','Invalid','plan',pg_temp.plan()||'{"pricingMethod":"fixed"}'))$$,'%finance_input_invalid%','fixed manual prices cannot carry a misleading component calculation');
select throws_like($$select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(114),pg_temp.fid(30),jsonb_build_object('intent','create','name','Invalid','plan',pg_temp.plan()||'{"areaComponents":[{"name":"A","actualArea":"-1","coefficient":"0.35"}]}'))$$,'%finance_input_invalid%','negative numeric inputs are rejected before casting');
select throws_like($$select public.save_finance_project_order(pg_temp.fid(1),pg_temp.fid(115),pg_temp.fid(30),jsonb_build_object('intent','create','name','Invalid','plan',pg_temp.plan()||'{"amount":"2921","allowUnscheduled":true}'))$$,'%finance_amount_invalid%','amount must equal the aggregate area times the shared rate');
reset role;
select throws_like($$update public.finance_project_plan_revisions set area_components=pg_temp.components('90') where studio_id=pg_temp.fid(1)$$,'%finance_history_immutable%','even privileged callers cannot rewrite component history');
select ok(not has_function_privilege('authenticated','private.finance_area_components_area(jsonb)','EXECUTE'),'internal validation exposes no new RPC to clients');
select * from finish();
rollback;
