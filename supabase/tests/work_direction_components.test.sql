begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('bd000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Direction component metrics');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) select pg_temp.fid(n),'authenticated','authenticated','direction-components-'||n||'@test','{}','{}' from generate_series(10,11)n;
insert into public.profiles(id,full_name,email,system_role,is_active) select pg_temp.fid(n),'Component designer','direction-components-'||n||'@test',case when n=10 then 'admin' else 'employee' end,true from generate_series(10,11)n;
insert into public.studio_members(studio_id,user_id,system_role) select pg_temp.fid(1),pg_temp.fid(n),case when n=10 then 'admin' else 'employee' end from generate_series(10,11)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'USD',current_date,pg_temp.fid(10));
insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values(pg_temp.fid(1),'Bank','USD',0,pg_temp.fid(10));
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values(pg_temp.fid(30),pg_temp.fid(1),'336 Facade scope',200,current_date,pg_temp.fid(10),'active');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) select pg_temp.fid(30),pg_temp.fid(n),'designer',0,current_date from generate_series(10,11)n;
insert into public.tasks(project_id,title,stage,status,created_by) values(pg_temp.fid(30),'Keep workspace open','stage_4','todo',pg_temp.fid(10));
create function pg_temp.components(area text default '30') returns jsonb language sql as $$select jsonb_build_array(jsonb_build_object('name','Прибудинкова територія','actualArea',area,'coefficient','0.10'))$$;
create function pg_temp.save_scope(area text default '30',include_components boolean default true) returns uuid language sql as $$
  select public.save_project_work_direction(pg_temp.fid(30),jsonb_build_object('intent','save','id',(select id from public.project_work_directions where project_id=pg_temp.fid(30) and name='Фасад'),
    'kind','facade','name','Фасад','areaM2',200,'coefficient',0.35)||case when include_components then jsonb_build_object('areaComponents',pg_temp.components(area)) else '{}'::jsonb end,
    (select stage_configuration_version from public.projects where id=pg_temp.fid(30)))$$;
create function pg_temp.task(n integer,role text) returns uuid language plpgsql as $$declare result uuid; begin
  result:=public.create_task_with_checklist(jsonb_build_object('project_id',pg_temp.fid(30),'title','Design component task '||n,'stage',
    (select stage from public.project_task_stage_columns where direction_id=(select id from public.project_work_directions where project_id=pg_temp.fid(30) and name='Фасад') and productivity_role=role),
    'priority','normal','assignee_id',pg_temp.fid(11)),'[]');return result;
end $$;
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select pg_temp.save_scope();
select is((select area_m2 from public.project_work_directions where name='Фасад'),200::numeric,'primary actual area remains the facade area');
select is((select complexity_coefficient from public.project_work_directions where name='Фасад'),0.35::numeric,'component coefficients are not replaced by an average');
select is((select equivalent_area_m2 from public.project_work_directions where name='Фасад'),73::numeric,'200 × 0.35 + 30 × 0.10 becomes one 73 m² production allowance');
select is((select area_components from public.project_work_directions where name='Фасад'),pg_temp.components(),'additional scope is persisted on the direction');
select pg_temp.save_scope('30',false);
select is((select equivalent_area_m2 from public.project_work_directions where name='Фасад'),73::numeric,'legacy metadata edits preserve attached scope when no component field is sent');
create temporary table tasks as select pg_temp.task(1,'initial') as initial,pg_temp.task(2,'final') as final;
select is((select area_m2 from public.get_direction_productivity_workload(array[pg_temp.fid(30)]) where task_id=(select initial from tasks)),14.6::numeric,'initial workload uses the existing 20% share of 73');
select is((select area_m2 from public.get_direction_productivity_workload(array[pg_temp.fid(30)]) where task_id=(select final from tasks)),58.4::numeric,'final workload uses the existing 80% share of 73');
create temporary table agreement as select public.create_finance_direction_order(pg_temp.fid(1),pg_temp.fid(100),pg_temp.fid(30),jsonb_build_object(
  'intent','create','name','Фасад','confirm',true,'directionIds',jsonb_build_array((select id from public.project_work_directions where name='Фасад')),
  'plan',jsonb_build_object('revision',0,'pricingMethod','area','area','73','rate','40','amount','2920','currency','USD','reason','Agreed scope','allowUnscheduled',true,'known','[]'::jsonb,'items','[]'::jsonb,
    'areaComponents',jsonb_build_array(jsonb_build_object('name','Фасад','actualArea','200','coefficient','0.35'))||pg_temp.components()))) as id;
create temporary table financial_before as select to_jsonb(r) as row from public.finance_project_plan_revisions r where studio_id=pg_temp.fid(1);
update public.tasks set status='completed' where id in ((select initial from tasks),(select final from tasks));
select is((select sum(credited_area_m2) from public.productivity_attributions where direction_id=(select id from public.project_work_directions where name='Фасад') and voided_at is null),73::numeric,'the designer earns 73 m² in total for the completed design work');
select is((select source_components from public.productivity_attributions where task_id=(select final from tasks)),pg_temp.components(),'completion snapshots the additional scope used for attribution');
create temporary table earned_before as select id,credited_area_m2,contributor_id,completed_at,source_components from public.productivity_attributions where studio_id=pg_temp.fid(1);
select pg_temp.save_scope('60');
select is((select equivalent_area_m2 from public.project_work_directions where name='Фасад'),76::numeric,'editing scope affects the future production allowance');
select results_eq($$select id,credited_area_m2,contributor_id,completed_at,source_components from public.productivity_attributions where studio_id=pg_temp.fid(1) order by id$$,$$select * from earned_before order by id$$,'earned area, owner, date and component snapshots remain unchanged');
select results_eq($$select to_jsonb(r) from public.finance_project_plan_revisions r where studio_id=pg_temp.fid(1)$$,$$select row from financial_before$$,'direction edits do not rewrite the agreed financial revision');
select is((public.get_finance_proposal_source(pg_temp.fid(1),pg_temp.fid(30),(select id from agreement))->>'gross')::numeric,2920::numeric,'proposal value still comes from its financial snapshot');
select is(public.get_finance_proposal_source(pg_temp.fid(1),pg_temp.fid(30),(select id from agreement))->'areaComponents'->1->>'actualArea','30','proposal scope remains the original financial scope');
update public.tasks set status='todo' where id=(select initial from tasks);
update public.tasks set status='completed' where id=(select initial from tasks);
select results_eq($$select id,credited_area_m2,contributor_id,completed_at,source_components from public.productivity_attributions where studio_id=pg_temp.fid(1) order by id$$,$$select * from earned_before order by id$$,'recompletion restores the original earned snapshot');
create temporary table additional_tasks as select pg_temp.task(3,'initial') as initial,pg_temp.task(4,'final') as final;
select is((select area_m2 from public.get_direction_productivity_workload(array[pg_temp.fid(30)]) where task_id=(select initial from additional_tasks)),0.6::numeric,'future initial work only receives the remaining allowance');
select is((select area_m2 from public.get_direction_productivity_workload(array[pg_temp.fid(30)]) where task_id=(select final from additional_tasks)),2.4::numeric,'future final work only receives the remaining allowance');
update public.tasks set status='completed' where id in ((select initial from additional_tasks),(select final from additional_tasks));
select is((select sum(credited_area_m2) from public.productivity_attributions where direction_id=(select id from public.project_work_directions where name='Фасад') and voided_at is null),76::numeric,'additional work cannot double count previously earned scope');
select throws_like($$select public.save_project_work_direction(pg_temp.fid(30),jsonb_build_object('intent','save','name','Invalid','areaM2',200,'coefficient',0.35,'areaComponents','[{"name":"Area","actualArea":"30","coefficient":"0"}]'::jsonb),(select stage_configuration_version from public.projects where id=pg_temp.fid(30)))$$,'%direction_invalid%','invalid component coefficients are rejected by SQL');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select is((select count(*) from public.productivity_attributions where studio_id=pg_temp.fid(1)),0::bigint,'earned-area ledger remains administrator-only');
select throws_like($$select pg_temp.save_scope()$$,'%direction_not_admin%','employees cannot change production scope');
reset role;
select is(private.work_direction_equivalent_area(1,1,'[{"name":"Precise","actualArea":"0.000001","coefficient":"0.333333"}]'),1.000000333333::numeric,'production scope retains input precision beyond four decimals');
select * from finish();
rollback;
