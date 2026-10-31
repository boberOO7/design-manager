begin;
insert into public.studios(id,name) values('cb000000-0000-4000-8000-000000000001','Stage method defaults');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('cb000000-0000-4000-8000-000000000010','authenticated','authenticated','stage-methods@test.local','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role)
values('cb000000-0000-4000-8000-000000000010','Methods admin','stage-methods@test.local','admin');
insert into public.studio_members(studio_id,user_id,system_role)
values('cb000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000010','admin');
select set_config('request.jwt.claim.sub','cb000000-0000-4000-8000-000000000010',true);
set local role authenticated;
do $test$
declare
  studio uuid := 'cb000000-0000-4000-8000-000000000001';
  input jsonb := '{"studio_id":"cb000000-0000-4000-8000-000000000001","name":"Methods test","country_code":"UA","total_area_m2":120,"priority":"normal","start_date":"2026-10-31"}';
  task_list jsonb := '[{"stage":"stage_1","title":"Concept","priority":"normal"},{"stage":"stage_2","title":"Visual","priority":"normal"},{"stage":"stage_3","title":"Drawings","priority":"normal"}]';
  project uuid; templated uuid; template uuid; empty_template uuid; direction uuid; stage_key text; stage_config jsonb; v integer;
begin
  project := public.create_project_from_template(input);
  assert (select array_agg(progress_method order by display_order)=array['equal','area','equal','equal'] from public.project_task_stage_columns where project_id=project), 'Standard Interior defaults';
  assert (select kind='additional' from public.project_task_stage_columns where project_id=project and stage='stage_4'), 'Additional stage keeps its independent semantics';

  template := public.save_project_template(studio,'private','Deliberate methods',true,false,task_list,
    p_stage_progress_methods => '{"stage_1":"area","stage_2":"weighted","stage_3":"equal"}');
  templated := public.create_project_from_template(input,p_template_id=>template);
  assert (select array_agg(progress_method order by display_order)=array['area','weighted','equal','equal'] from public.project_task_stage_columns where project_id=templated), 'Explicit template methods override Interior defaults';

  empty_template := public.save_project_template(studio,'private','Unconfigured',true,false,'[]');
  v := 0;
  select stage_configuration_version into v from public.projects where id=project;
  direction := public.save_project_work_direction(project,
    jsonb_build_object('intent','save','kind','facade','name','Facade','areaM2',50,'coefficient',0.35,'templateId',template),v);
  assert (select array_agg(progress_method order by display_order)=array['area','weighted','equal'] from public.project_task_stage_columns where direction_id=direction), 'Mapped custom stage IDs inherit source template methods';
  select stage into stage_key from public.project_task_stage_columns where direction_id=direction order by display_order limit 1;

  update public.project_task_stage_columns set progress_method='weighted' where project_id=project and stage=stage_key;
  perform public.save_project_template(studio,'private','Changed methods',true,false,task_list,template,'{"stage_1":"equal","stage_2":"equal"}');
  assert (select progress_method='weighted' from public.project_task_stage_columns where project_id=project and stage=stage_key), 'Template edits never overwrite existing manual choices';
  perform public.apply_project_template_stage(project,template,'stage_1',stage_key);
  assert (select progress_method='weighted' from public.project_task_stage_columns where project_id=project and stage=stage_key), 'Adding template tasks preserves an existing stage method';
  -- An older caller omitting the new argument must preserve template settings too.
  perform public.save_project_template(studio,'private','Changed name',true,false,task_list,template);
  assert (select stage_progress_methods->>'stage_1'='equal' from public.project_templates where id=template), 'Omitted save settings are preserved';

  select stage_configuration_version into v from public.projects where id=project;
  select jsonb_agg(jsonb_build_object('stage',s.stage,'display_name','Renamed stage','is_enabled',true,
    'display_order',s.new_order,'kind',s.kind,'progress_weight',s.progress_weight,'direction_id',s.direction_id,'productivity_role',s.productivity_role))
    into stage_config from (select *,row_number() over(order by display_order desc)::integer new_order from public.project_task_stage_columns where project_id=project and deleted_at is null) s;
  stage_config := stage_config || jsonb_build_array(jsonb_build_object('stage','custom_cb000000-0000-4000-8000-000000000099',
    'display_name','Visualization','is_enabled',true,'display_order',jsonb_array_length(stage_config)+1,'kind','work','progress_weight',1));
  perform public.update_project_stage_configuration(project,stage_config,true,true,v,'{}'::uuid[]);
  assert (select progress_method='weighted' from public.project_task_stage_columns where project_id=project and stage=stage_key), 'Renaming and ordering do not change a manual method';
  assert (select progress_method='equal' from public.project_task_stage_columns where project_id=project and stage='custom_cb000000-0000-4000-8000-000000000099'), 'Arbitrary stages default to Equal regardless of their name';

  select stage_configuration_version into v from public.projects where id=project;
  direction := public.save_project_work_direction(project,
    jsonb_build_object('intent','save','kind','architecture','name','Architecture','areaM2',50,'coefficient',0.8,'templateId',empty_template),v);
  assert (select bool_and(progress_method='equal') from public.project_task_stage_columns where direction_id=direction), 'Unconfigured template stages default to Equal';

  perform public.save_studio_direction_preset(studio,'{"kind":"facade","coefficient":0.35,"recommendedMin":null,"recommendedMax":null,"templateId":null,"version":1,"stageProgressMethods":{"stage_1":"weighted","stage_2":"equal","stage_3":"area"}}');
  select stage_configuration_version into v from public.projects where id=project;
  direction := public.save_project_work_direction(project,'{"intent":"save","kind":"facade","name":"Other Facade","areaM2":50,"coefficient":0.35}',v);
  assert (select array_agg(progress_method order by display_order)=array['weighted','equal','area','equal'] from public.project_task_stage_columns where direction_id=direction), 'Other directions use persisted preset defaults without new hardcode';
  assert (select progress_method='weighted' from public.project_task_stage_columns where project_id=project and stage=stage_key), 'Preset changes preserve existing settings';
  begin
    perform public.save_project_template(studio,'private','Invalid',true,false,'[]',p_stage_progress_methods=>' {"stage_2":"auto"}');
    raise exception 'TEST: invalid method accepted';
  exception when others then
    if sqlerrm like 'TEST:%' then raise; end if;
  end;
end $test$;
reset role;
rollback;
