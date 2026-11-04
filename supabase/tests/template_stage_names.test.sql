begin;
insert into public.studios(id,name) values('cd000000-0000-4000-8000-000000000001','Template stage names');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('cd000000-0000-4000-8000-000000000010','authenticated','authenticated','stage-names@test.local','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role)
values('cd000000-0000-4000-8000-000000000010','Methods admin','stage-names@test.local','admin');
insert into public.studio_members(studio_id,user_id,system_role)
values('cd000000-0000-4000-8000-000000000001','cd000000-0000-4000-8000-000000000010','admin');
select set_config('request.jwt.claim.sub','cd000000-0000-4000-8000-000000000010',true);
set local role authenticated;
do $test$
declare
  studio uuid := 'cd000000-0000-4000-8000-000000000001';
  input jsonb := '{"studio_id":"cd000000-0000-4000-8000-000000000001","name":"Names test","country_code":"UA","total_area_m2":120,"priority":"normal","start_date":"2026-11-04"}';
  tasks jsonb := '[{"stage":"stage_1","title":"Concept task","priority":"normal"},{"stage":"stage_4","title":"Support task","priority":"normal"}]';
  template uuid; project uuid; newer uuid; direction uuid; v integer; original_names jsonb;
begin
  template := public.save_project_template(studio,'private','Named stages',true,false,tasks,
    p_stage_names => '{"stage_1":" Concept ","stage_2":"Visual","stage_4":"Site support"}');
  assert (select stage_names='{"stage_1":"Concept","stage_2":"Visual","stage_4":"Site support"}'::jsonb
    from public.project_templates where id=template), 'Names are saved and trimmed';
  project := public.create_project_from_template(input,p_template_id=>template);
  assert (select display_name='Concept' from public.project_task_stage_columns where project_id=project and stage='stage_1'), 'Primary stages inherit template labels';
  assert (select display_name='Site support' and kind='additional' from public.project_task_stage_columns where project_id=project and stage='stage_4'), 'A renamed additional stage preserves its kind';
  assert (select display_name is null from public.project_task_stage_columns where project_id=project and stage='stage_3'), 'Unspecified labels retain localized defaults';

  perform public.save_project_template(studio,'private','Changed names',true,false,tasks,template,p_stage_names=>'{"stage_1":"Planning"}');
  assert (select display_name='Concept' from public.project_task_stage_columns where project_id=project and stage='stage_1'), 'Renaming a template does not rename existing project stages';
  newer := public.create_project_from_template(input,p_template_id=>template);
  assert (select display_name='Planning' from public.project_task_stage_columns where project_id=newer and stage='stage_1'), 'Later projects use the current saved names';
  perform public.save_project_template(studio,'private','Older caller',true,false,tasks,template);
  assert (select stage_names='{"stage_1":"Planning"}'::jsonb from public.project_templates where id=template), 'Older callers preserve existing names';

  select stage_configuration_version into v from public.projects where id=project;
  direction := public.save_project_work_direction(project,jsonb_build_object('intent','save','kind','facade','name','Facade',
    'areaM2',50,'coefficient',0.35,'templateId',template,'stageNames',jsonb_build_object('stage_1','Default first','stage_4','Additional stage')),v);
  assert (select display_name='Planning' from public.project_task_stage_columns where direction_id=direction and kind='work'), 'Custom stage identities inherit template labels ahead of generic defaults';
  assert (select display_name='Additional stage' from public.project_task_stage_columns where direction_id=direction and kind='additional'), 'Missing custom labels use localized application defaults';
  select jsonb_object_agg(stage,display_name) into original_names from public.project_task_stage_columns where project_id=project;
  perform public.apply_project_template_stage(project,template,'stage_1','stage_1');
  assert (select jsonb_object_agg(stage,display_name)=original_names from public.project_task_stage_columns where project_id=project), 'Appending template tasks preserves destination names';

  assert not private.valid_template_stage_names('{"stage_1":" "}'), 'Blank names are invalid';
  assert not private.valid_template_stage_names('{"custom_key":"Name"}'), 'Unknown keys are invalid';
  assert not private.valid_template_stage_names('{"stage_1":42}'), 'Non-string names are invalid';
  assert not private.valid_template_stage_names(jsonb_build_object('stage_1',repeat('x',81))), 'Existing project label length limit applies';
  begin
    perform public.save_project_template(studio,'private','Invalid names',true,false,tasks,p_stage_names=>'{"stage_4":""}');
    raise exception 'TEST: invalid names accepted';
  exception when others then
    if sqlerrm like 'TEST:%' then raise; end if;
  end;
  perform public.save_project_template(studio,'private','Reset names',true,false,tasks,template,p_stage_names=>'{}');
  assert (select stage_names='{}'::jsonb from public.project_templates where id=template), 'Names can be reset to defaults';

  -- The same guarded RPC still requires active studio-admin authority.
  perform set_config('request.jwt.claim.sub','cd000000-0000-4000-8000-000000000099',true);
  begin
    perform public.save_project_template(studio,'private','Unauthorized',true,false,tasks,template,p_stage_names=>'{"stage_1":"Forged"}');
    raise exception 'TEST: unauthorized rename accepted';
  exception when others then
    if sqlerrm like 'TEST:%' then raise; end if;
  end;
end $test$;
reset role;
rollback;
