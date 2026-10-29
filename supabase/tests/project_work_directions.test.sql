begin;
set local search_path=public,extensions;
insert into public.studios(id,name) values('c9000000-0000-4000-8000-000000000001','Directions test'),('c9000000-0000-4000-8000-000000000002','Other directions studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',id||'@directions.test','{}','{}',now(),now() from unnest(array['c9000000-0000-4000-8000-000000000010'::uuid,'c9000000-0000-4000-8000-000000000011'::uuid,'c9000000-0000-4000-8000-000000000012'::uuid]) id;
insert into public.profiles(id,full_name,email,system_role)
select id,'Directions member',id||'@directions.test',case when id='c9000000-0000-4000-8000-000000000011' then 'employee' else 'admin' end
from unnest(array['c9000000-0000-4000-8000-000000000010'::uuid,'c9000000-0000-4000-8000-000000000011'::uuid,'c9000000-0000-4000-8000-000000000012'::uuid]) id;
insert into public.studio_members(studio_id,user_id,system_role) values
('c9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000010','admin'),
('c9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000011','employee'),
('c9000000-0000-4000-8000-000000000002','c9000000-0000-4000-8000-000000000012','admin');
select set_config('request.jwt.claim.sub','c9000000-0000-4000-8000-000000000010',true);
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values
('c9000000-0000-4000-8000-000000000020','c9000000-0000-4000-8000-000000000001','Directions project',100,'active',current_date-30,'c9000000-0000-4000-8000-000000000010'),
('c9000000-0000-4000-8000-000000000021','c9000000-0000-4000-8000-000000000002','Other project',200,'active',current_date,'c9000000-0000-4000-8000-000000000012');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values
('c9000000-0000-4000-8000-000000000020','c9000000-0000-4000-8000-000000000010','designer',0,current_date),
('c9000000-0000-4000-8000-000000000020','c9000000-0000-4000-8000-000000000011','designer',0,current_date);
insert into public.tasks(project_id,stage,title,status,created_by) values('c9000000-0000-4000-8000-000000000020','stage_4','Keep workspace writable','todo','c9000000-0000-4000-8000-000000000010');
insert into public.tasks(id,project_id,stage,title,status,assignee_id,completed_area_m2,created_by) values
('c9000000-0000-4000-8000-000000000030','c9000000-0000-4000-8000-000000000020','stage_1','Initial A','todo','c9000000-0000-4000-8000-000000000010',null,'c9000000-0000-4000-8000-000000000010'),
('c9000000-0000-4000-8000-000000000031','c9000000-0000-4000-8000-000000000020','stage_1','Initial B','todo','c9000000-0000-4000-8000-000000000010',null,'c9000000-0000-4000-8000-000000000010'),
('c9000000-0000-4000-8000-000000000032','c9000000-0000-4000-8000-000000000020','stage_3','Final','todo','c9000000-0000-4000-8000-000000000010',null,'c9000000-0000-4000-8000-000000000010'),
('c9000000-0000-4000-8000-000000000033','c9000000-0000-4000-8000-000000000020','stage_2','Visualization','todo','c9000000-0000-4000-8000-000000000010',30,'c9000000-0000-4000-8000-000000000010');
update public.tasks set status='completed' where id='c9000000-0000-4000-8000-000000000030';
update public.tasks set completed_at=current_date-40 where id='c9000000-0000-4000-8000-000000000030';
set local role authenticated;
do $test$
declare
  project constant uuid:='c9000000-0000-4000-8000-000000000020';
  admin constant uuid:='c9000000-0000-4000-8000-000000000010';
  first_task constant uuid:='c9000000-0000-4000-8000-000000000030';
  direction uuid; facade uuid; empty_direction uuid; initial_stage text; final_stage text; visualization_stage text;
  another_initial text:='custom_c9000000-0000-4000-8000-000000000050';
  a uuid; b uuid; c uuid; d uuid; history jsonb; payload jsonb; v integer; previous_date timestamptz; previous_id uuid;
begin
  select id into direction from public.project_work_directions where project_id=project and is_default;
  assert direction is not null,'new projects automatically own one direction';
  assert (select count(*)=4 from public.project_task_stage_columns where project_id=project and direction_id=direction),'existing stage identities belong to default direction';
  update public.tasks set status='completed' where id in (first_task,'c9000000-0000-4000-8000-000000000031','c9000000-0000-4000-8000-000000000032','c9000000-0000-4000-8000-000000000033');
  assert (select sum(credited_area_m2)=100 from public.productivity_attributions where project_id=project and productivity_role in ('initial','final') and voided_at is null),'interior design keeps the 20/80 total';
  assert (select credited_area_m2=30 from public.productivity_attributions where task_id='c9000000-0000-4000-8000-000000000033' and voided_at is null),'interior visualization keeps independent credit';
  select jsonb_agg(to_jsonb(x) order by id) into history from public.productivity_attributions x where project_id=project;
  select stage_configuration_version into v from public.projects where id=project;
  perform public.save_project_work_direction(project,jsonb_build_object('intent','save','id',direction,'name','Interior','areaM2',200,'coefficient',2),v);
  assert (select total_area_m2=200 from public.projects where id=project),'single-direction area stays coherent with the existing project editor';
  assert history=(select jsonb_agg(to_jsonb(x) order by id) from public.productivity_attributions x where project_id=project),'scope and coefficient edits never rewrite historical credit';
  insert into public.tasks(project_id,stage,title,status,created_by,assignee_id) values(project,'stage_1','New scope','todo',admin,admin) returning id into a;
  update public.tasks set status='completed' where id=a;
  assert (select credited_area_m2=60 from public.productivity_attributions where task_id=a and voided_at is null),'only the unearned initial balance is available';
  select completed_at,id into previous_date,previous_id from public.productivity_attributions where task_id=first_task and voided_at is null;
  update public.tasks set status='todo' where id=first_task;
  assert (select count(*)=0 from public.productivity_attributions where task_id=first_task and voided_at is null),'reopening removes active credit';
  update public.tasks set assignee_id='c9000000-0000-4000-8000-000000000011' where id=first_task;
  update public.tasks set status='completed' where id=first_task;
  assert (select id=previous_id and completed_at=previous_date and contributor_id=admin and credited_area_m2=10 from public.productivity_attributions where task_id=first_task and voided_at is null),'recompletion retains the earned person, area and month';
  assert (select count(*)=1 from public.productivity_attributions where task_id=first_task),'recompletion does not append duplicate credit';
  assert (select completed_at=(previous_date at time zone 'Europe/Kyiv')::date from public.tasks where id=first_task),'task and ledger retain the same earned month';
  select stage_configuration_version into v from public.projects where id=project;
  facade:=public.save_project_work_direction(project,'{"intent":"save","name":"Facade","areaM2":300,"coefficient":0.3}',v);
  assert (select count(*)=4 from public.project_task_stage_columns where direction_id=facade),'a direction gets its own stages';
  select stage into initial_stage from public.project_task_stage_columns where direction_id=facade and productivity_role='initial';
  select stage into final_stage from public.project_task_stage_columns where direction_id=facade and productivity_role='final';
  select stage into visualization_stage from public.project_task_stage_columns where direction_id=facade and productivity_role='visualization';
  select jsonb_agg(jsonb_build_object('stage',s.stage,'display_name',coalesce(s.display_name,s.stage),'is_enabled',s.is_enabled,'display_order',s.display_order,'kind',s.kind,'progress_weight',s.progress_weight,'direction_id',s.direction_id,'productivity_role',s.productivity_role) order by s.display_order) into payload
    from public.project_task_stage_columns s where s.project_id=project and s.deleted_at is null;
  payload:=payload||jsonb_build_array(jsonb_build_object('stage',another_initial,'display_name','Extra concept','is_enabled',true,'display_order',9,'kind','work','progress_weight',1,'direction_id',facade,'productivity_role','initial'));
  select stage_configuration_version into v from public.projects where id=project;
  perform public.update_project_stage_configuration(project,payload,true,true,v,'{}');
  a:=public.create_task_with_checklist(jsonb_build_object('project_id',project,'title','Facade concept A','stage',initial_stage,'priority','normal','assignee_id',admin),'[]');
  b:=public.create_task_with_checklist(jsonb_build_object('project_id',project,'title','Facade concept B','stage',another_initial,'priority','normal','assignee_id',admin),'[]');
  c:=public.create_task_with_checklist(jsonb_build_object('project_id',project,'title','Facade final','stage',final_stage,'priority','normal','assignee_id',admin),'[]');
  d:=public.create_task_with_checklist(jsonb_build_object('project_id',project,'title','Facade visualization','stage',visualization_stage,'priority','normal','assignee_id',admin,'completed_area_m2',30),'[]');
  update public.tasks set status='completed' where id in (a,b,c,d);
  assert (select sum(credited_area_m2)=18 from public.productivity_attributions where direction_id=facade and productivity_role='initial' and voided_at is null),'two concept stages share one allowance without duplication';
  assert (select credited_area_m2=72 from public.productivity_attributions where task_id=c and voided_at is null),'facade final uses its own equivalent area';
  assert (select credited_area_m2=9 and source_coefficient=0.3 from public.productivity_attributions where task_id=d and voided_at is null),'visualization snapshots task area times its direction factor';
  begin
    update public.tasks set stage=initial_stage where id=first_task;
    raise exception 'earned work moved to another direction';
  exception when raise_exception then if sqlerrm<>'direction_earned_scope_locked' then raise; end if; end;
  select stage_configuration_version into v from public.projects where id=project;
  begin
    perform public.save_project_work_direction(project,jsonb_build_object('intent','save','id',facade,'name','Facade','areaM2',300,'coefficient',0),v);
    raise exception 'zero coefficient accepted';
  exception when raise_exception then if sqlerrm<>'direction_invalid' then raise; end if; end;
  begin
    perform public.save_project_work_direction(project,'{"intent":"save","name":"Stale","areaM2":1,"coefficient":1}',v-1);
    raise exception 'stale write accepted';
  exception when raise_exception then if sqlerrm<>'direction_version_conflict' then raise; end if; end;
  empty_direction:=public.save_project_work_direction(project,'{"intent":"save","name":"Empty","areaM2":1,"coefficient":12.5}',v);
  assert (select complexity_coefficient=12.5 from public.project_work_directions where id=empty_direction),'coefficients have no type-based cap';
  select stage_configuration_version into v from public.projects where id=project;
  perform public.save_project_work_direction(project,jsonb_build_object('intent','remove','id',empty_direction),v);
  assert not exists(select 1 from public.project_work_directions where id=empty_direction),'empty directions can be removed';
  perform set_config('request.jwt.claim.sub','c9000000-0000-4000-8000-000000000011',true);
  assert (select count(*)=2 from public.project_work_directions where project_id=project),'assigned employees see directions';
  begin
    perform public.save_project_work_direction(project,'{"intent":"save","name":"Unauthorized","areaM2":1,"coefficient":1}',v);
    raise exception 'employee write accepted';
  exception when raise_exception then if sqlerrm<>'direction_not_admin' then raise; end if; end;
  perform set_config('request.jwt.claim.sub','c9000000-0000-4000-8000-000000000012',true);
  assert not exists(select 1 from public.project_work_directions where project_id=project),'another studio cannot read directions';
  begin
    perform public.save_project_work_direction(project,'{"intent":"save","name":"Foreign","areaM2":1,"coefficient":1}',v);
    raise exception 'foreign studio write accepted';
  exception when raise_exception then if sqlerrm<>'direction_not_admin' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',admin::text,true);
  delete from public.tasks where id=first_task;
  assert (select credited_area_m2=10 from public.productivity_attributions where task_id=first_task and voided_at is null),'deleting a task preserves its earned history';
  perform set_config('request.jwt.claim.sub','c9000000-0000-4000-8000-000000000012',true);
end $test$;
reset role;
do $identity$
begin
  begin
    insert into public.tasks(id,project_id,title,stage,status,created_by) values('c9000000-0000-4000-8000-000000000030','c9000000-0000-4000-8000-000000000021','Reused historical UUID','stage_1','todo','c9000000-0000-4000-8000-000000000012');
    raise exception 'historical UUID reused in another tenant';
  exception when raise_exception then if sqlerrm<>'Task identity is unavailable' then raise; end if; end;
end $identity$;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('c9000000-0000-4000-8000-000000000001','UAH',current_date,'c9000000-0000-4000-8000-000000000010');
insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values('c9000000-0000-4000-8000-000000000001','Test bank','UAH',0,'c9000000-0000-4000-8000-000000000010');
insert into public.project_templates(id,studio_id,project_type,name,is_active,is_default,created_by) values
('c9000000-0000-4000-8000-000000000060','c9000000-0000-4000-8000-000000000001','private','Direction template',true,false,'c9000000-0000-4000-8000-000000000010');
insert into public.project_template_tasks(template_id,stage,title,priority,position) values
('c9000000-0000-4000-8000-000000000060','stage_1','Template concept','normal',0),
('c9000000-0000-4000-8000-000000000060','stage_3','Template drawings','normal',0);
select set_config('request.jwt.claim.sub','c9000000-0000-4000-8000-000000000010',true);
set local role authenticated;
do $finance$
declare
  project constant uuid:='c9000000-0000-4000-8000-000000000020'; studio constant uuid:='c9000000-0000-4000-8000-000000000001';
  interior uuid; facade uuid; landscaping uuid; first_order uuid; second_order uuid; milestone uuid; v integer; history jsonb; plan jsonb; scope jsonb; initial_stage text;
begin
  perform public.finalize_finance_setup(studio);
  select id into interior from public.project_work_directions where project_id=project and is_default;
  select id into facade from public.project_work_directions where project_id=project and name='Facade';
  select jsonb_agg(to_jsonb(x) order by id) into history from public.productivity_attributions x where project_id=project;
  plan:='{"revision":0,"pricingMethod":"fixed","amount":"1000","currency":"UAH","reason":"Agreement","known":[],"allowUnscheduled":false,"items":[{"draftKey":"c9000000-0000-4000-8000-000000000070","name":"Advance","amount":"1000","dueDate":"2026-10-29"}]}';
  first_order:=public.create_finance_direction_order(studio,'c9000000-0000-4000-8000-000000000071',project,jsonb_build_object('intent','create','name','Interior contract','directionIds',jsonb_build_array(interior),'plan',plan));
  perform public.save_finance_project_order(studio,gen_random_uuid(),project,jsonb_build_object('intent','confirm','orderId',first_order,'version',1));
  second_order:=public.create_finance_direction_order(studio,gen_random_uuid(),project,jsonb_build_object('intent','create','name','Facade contract','directionIds',jsonb_build_array(facade),'plan',plan));
  perform public.save_finance_project_order(studio,gen_random_uuid(),project,jsonb_build_object('intent','confirm','orderId',second_order,'version',1));
  assert (select count(*)=1 from public.finance_order_work_directions where order_id=second_order and direction_id=facade),'new order is atomically linked to the chosen direction';
  select stage_configuration_version into v from public.projects where id=project;
  perform public.save_finance_order_directions(project,first_order,array[interior,facade],v);
  assert (select count(*)=2 from public.finance_order_work_directions where order_id=first_order),'one order can cover several directions';
  assert (select count(*)=2 from public.finance_order_work_directions where direction_id=facade),'one direction can have several orders';
  assert (select contract_amount=2000 from public.finance_project_totals where project_id=project and stream='design' and currency='UAH'),'shared links never multiply contractual totals';
  assert (select collected_amount=0 from public.finance_project_totals where project_id=project and stream='design' and currency='UAH'),'linking work does not create cash';
  assert history=(select jsonb_agg(to_jsonb(x) order by id) from public.productivity_attributions x where project_id=project),'commercial operations never create or change production credit';
  select stage_configuration_version into v from public.projects where id=project;
  begin
    perform public.save_finance_order_directions(project,second_order,array[(select id from public.project_work_directions where project_id='c9000000-0000-4000-8000-000000000021')],v);
    raise exception 'foreign direction linked';
  exception when raise_exception then if sqlerrm<>'direction_invalid' then raise; end if; end;
  select stage into initial_stage from public.project_task_stage_columns where direction_id=facade and productivity_role='initial' order by display_order limit 1;
  milestone:=public.save_finance_earning_milestone(studio,gen_random_uuid(),project,second_order,jsonb_build_object('title','Facade delivery','stage',initial_stage,'percentage','50','condition','delivery','revision',0));
  begin
    perform public.save_finance_order_directions(project,second_order,array[interior],v);
    raise exception 'milestone lost its direction';
  exception when raise_exception then if sqlerrm<>'direction_has_milestones' then raise; end if; end;
  begin
    perform public.save_finance_earning_milestone(studio,gen_random_uuid(),project,second_order,'{"title":"Wrong delivery","stage":"stage_1","percentage":"1","condition":"delivery","revision":0}');
    raise exception 'milestone used another direction';
  exception when raise_exception then if sqlerrm<>'direction_milestone_scope' then raise; end if; end;
  select stage_configuration_version into v from public.projects where id=project;
  landscaping:=public.save_project_work_direction(project,jsonb_build_object('intent','save','name','Landscaping','areaM2',800,'coefficient',0.1,'templateId','c9000000-0000-4000-8000-000000000060','startDate',current_date),v);
  assert (select count(*)=2 from public.tasks t join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage where s.direction_id=landscaping),'templates populate only their new direction';
  assert (select count(*)=2 from public.project_task_stage_columns where direction_id=landscaping),'empty template lanes do not hold back direction progress';
  assert (select count(*)=2 from public.get_direction_productivity_workload(array[project]) w join public.tasks t on t.id=w.task_id join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage where s.direction_id=landscaping and w.area_m2>0),'workload includes custom stages and direction coefficients';
  scope:=public.get_project_stage_configuration(project);
  assert jsonb_array_length(scope->'directions')=3,'one snapshot returns every direction';
  assert (scope->>'stageOnePercent')::numeric=20,'studio shares stay available for all direction roles';
  perform set_config('request.jwt.claim.sub','c9000000-0000-4000-8000-000000000011',true);
  assert not exists(select 1 from public.finance_order_work_directions where project_id=project),'employees cannot read commercial associations';
  begin
    perform public.save_finance_order_directions(project,first_order,array[interior],v);
    raise exception 'employee linked a commercial order';
  exception when raise_exception then if sqlerrm<>'direction_not_admin' then raise; end if; end;
end $finance$;
reset role;
select set_config('request.jwt.claim.sub','c9000000-0000-4000-8000-000000000010',true);
do $areas$
declare landscaping uuid; facade uuid; source_stage text;
begin
  select id into landscaping from public.project_work_directions where project_id='c9000000-0000-4000-8000-000000000020' and name='Landscaping';
  select id into facade from public.project_work_directions where project_id='c9000000-0000-4000-8000-000000000020' and name='Facade';
  select stage into source_stage from public.project_task_stage_columns where direction_id=landscaping and productivity_role='initial';
  update public.project_task_stage_columns set progress_method='area' where direction_id=landscaping and stage=source_stage;
  update public.tasks set completed_area_m2=500 where project_id='c9000000-0000-4000-8000-000000000020' and stage=source_stage;
  begin
    update public.project_work_directions set area_m2=400 where id=landscaping;
    raise exception 'direction shrank below allocated task area';
  exception when raise_exception then if sqlerrm<>'direction_area_allocated' then raise; end if; end;
  begin
    update public.project_task_stage_columns set direction_id=facade where project_id='c9000000-0000-4000-8000-000000000020' and stage=source_stage;
    raise exception 'stage moved into an undersized direction';
  exception when raise_exception then if sqlerrm<>'Task area allocation cannot exceed the direction design-scope area' then raise; end if; end;
  assert (select area_m2=800 from public.project_work_directions where id=landscaping),'failed area edits preserve scope';
end $areas$;
set local role authenticated;
do $workspaces$
declare
  project constant uuid:='c9000000-0000-4000-8000-000000000020';
  studio constant uuid:='c9000000-0000-4000-8000-000000000001';
  admin constant uuid:='c9000000-0000-4000-8000-000000000010';
  direction uuid; stage_key text; task_id uuid; v integer; history jsonb; new_project uuid;
begin
  select jsonb_agg(to_jsonb(a) order by id) into history from public.productivity_attributions a where project_id=project;
  assert (select count(*)=6 from public.studio_direction_presets where studio_id=studio),'new studios receive six editable presets';
  assert (select coefficient=0.35 and recommended_min=0.25 and recommended_max=0.60 from public.studio_direction_presets where studio_id=studio and kind='facade'),'facade starts with the supplied studio guide';
  perform public.save_studio_direction_preset(studio,'{"kind":"facade","coefficient":0.3,"recommendedMin":0.2,"recommendedMax":0.8,"templateId":"c9000000-0000-4000-8000-000000000060","version":1}');
  assert (select coefficient=0.3 and recommended_min=0.2 from public.studio_direction_presets where studio_id=studio and kind='facade'),'studio owns editable coefficient guidance';
  begin
    perform public.save_studio_direction_preset(studio,'{"kind":"facade","coefficient":1,"recommendedMin":null,"recommendedMax":null,"templateId":null,"version":0}');
    raise exception 'preset concurrency was lost';
  exception when raise_exception then if sqlerrm<>'direction_version_conflict' then raise; end if; end;
  begin
    perform public.save_studio_direction_preset(studio,'{"kind":"custom","coefficient":1,"recommendedMin":2,"recommendedMax":1,"templateId":null,"version":0}');
    raise exception 'reversed guidance accepted';
  exception when raise_exception then if sqlerrm<>'direction_invalid' then raise; end if; end;
  perform public.save_studio_direction_preset(studio,'{"kind":"interior","coefficient":1.2,"recommendedMin":null,"recommendedMax":null,"templateId":null,"version":1}');
  new_project:=public.create_project_from_template(jsonb_build_object('studio_id',studio,'name','Preset Interior','project_type','commercial','country_code','UA','total_area_m2',80,'priority','normal','start_date',current_date), '[]', 'c9000000-0000-4000-8000-000000000060');
  assert (select kind='interior' and area_m2=80 and complexity_coefficient=1.2 and name is null from public.project_work_directions where project_id=new_project),'new Interior uses entered area and current studio defaults';
  assert (select count(*)=2 from public.tasks where project_id=new_project),'task template selection is independent of object type';
  select stage_configuration_version into v from public.projects where id=project;
  direction:=public.save_project_work_direction(project,'{"intent":"save","kind":"architecture","name":"Architecture workspace","areaM2":100,"coefficient":12.5}',v);
  assert (select status='planned' and kind='architecture' and complexity_coefficient=12.5 from public.project_work_directions where id=direction),'direction kind never limits an exact coefficient';
  select stage_configuration_version into v from public.projects where id=project;
  perform public.set_project_work_direction_status(project,direction,'active',v);
  select stage_configuration_version into v from public.projects where id=project;
  perform public.set_project_work_direction_status(project,direction,'paused',v);
  select stage_configuration_version into v from public.projects where id=project;
  perform public.set_project_work_direction_status(project,direction,'planned',v);
  select stage into stage_key from public.project_task_stage_columns where direction_id=direction and productivity_role='initial';
  insert into public.tasks(project_id,stage,title,status,created_by,assignee_id) values(project,stage_key,'Independent task','todo',admin,admin) returning id into task_id;
  update public.tasks set status='in_progress' where id=task_id;
  assert (select status='active' from public.project_work_directions where id=direction),'work starts only its own direction';
  select stage_configuration_version into v from public.projects where id=project;
  begin
    perform public.set_project_work_direction_status(project,direction,'completed',v);
    raise exception 'direction closed with open production';
  exception when raise_exception then if sqlerrm<>'direction_open_tasks' then raise; end if; end;
  update public.tasks set status='completed' where id=task_id;
  perform public.set_project_work_direction_status(project,direction,'completed',v);
  assert (select status='active' from public.projects where id=project),'direction completion never completes its parent project';
  begin
    update public.tasks set title='Changed closed direction' where id=task_id;
    raise exception 'closed direction remained writable';
  exception when raise_exception then if sqlerrm<>'direction_completed_read_only' then raise; end if; end;
  begin
    insert into public.tasks(project_id,stage,title,status,created_by) values(project,stage_key,'New closed work','todo',admin);
    raise exception 'closed direction accepted new work';
  exception when raise_exception then if sqlerrm<>'direction_completed_read_only' then raise; end if; end;
  select stage_configuration_version into v from public.projects where id=project;
  perform public.set_project_work_direction_status(project,direction,'active',v);
  select stage_configuration_version into v from public.projects where id=project;
  perform public.save_project_work_direction(project,jsonb_build_object('intent','save','id',direction,'kind','architecture','name','Architecture','useDefaultName',true,'areaM2',100,'coefficient',12.5),v);
  assert (select name is null and kind='architecture' from public.project_work_directions where id=direction),'ordinary edits retain localized standard titles instead of freezing the current language';
  assert history=(select jsonb_agg(to_jsonb(a) order by id) from public.productivity_attributions a where a.project_id=project and a.id in(select (entry->>'id')::uuid from jsonb_array_elements(history) entry)), 'presets and lifecycle preserve historical values, owners and reporting dates';
  perform set_config('request.jwt.claim.sub','c9000000-0000-4000-8000-000000000011',true);
  assert not exists(select 1 from public.studio_direction_presets where studio_id=studio),'employees cannot read studio productivity defaults';
  begin
    perform public.set_project_work_direction_status(project,direction,'paused',v);
    raise exception 'employee changed a direction lifecycle';
  exception when raise_exception then if sqlerrm<>'direction_not_admin' then raise; end if; end;
  begin
    perform public.save_studio_direction_preset(studio,'{"kind":"custom","coefficient":1,"recommendedMin":null,"recommendedMax":null,"templateId":null,"version":0}');
    raise exception 'employee changed a studio preset';
  exception when raise_exception then if sqlerrm<>'direction_not_admin' then raise; end if; end;
end $workspaces$;
reset role;
select 'project_work_directions: production, finance, snapshots, lifecycle and preset checks passed' as result;
rollback;
