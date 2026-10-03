begin;
insert into public.studios(id,name) values ('7c000000-0000-0000-0000-000000000001','Stage order');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('7c000000-0000-0000-0000-000000000010','authenticated','authenticated','stage-order-admin@example.test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values
 ('7c000000-0000-0000-0000-000000000010','Stage order admin','stage-order-admin@example.test','admin');
insert into public.studio_members(studio_id,user_id,system_role) values
 ('7c000000-0000-0000-0000-000000000001','7c000000-0000-0000-0000-000000000010','admin');
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values
 ('7c000000-0000-0000-0000-000000000020','7c000000-0000-0000-0000-000000000001','Ordered rooms',100,'active',current_date,'7c000000-0000-0000-0000-000000000010');
insert into public.project_templates(id,studio_id,name,project_type,created_by) values
 ('7c000000-0000-0000-0000-000000000030','7c000000-0000-0000-0000-000000000001','Rooms','private','7c000000-0000-0000-0000-000000000010');
-- Insert out of order to prove the template's position, not insertion time, wins.
insert into public.project_template_tasks(template_id,stage,title,position) values
 ('7c000000-0000-0000-0000-000000000030','stage_1','Room 3',2),
 ('7c000000-0000-0000-0000-000000000030','stage_1','Room 1',0),
 ('7c000000-0000-0000-0000-000000000030','stage_1','Room 2',1);
select set_config('request.jwt.claim.sub','7c000000-0000-0000-0000-000000000010',true);
set local role authenticated;

do $test$
declare
  v_project_id constant uuid := '7c000000-0000-0000-0000-000000000020';
  template_id constant uuid := '7c000000-0000-0000-0000-000000000030';
  first_id uuid;
  second_id uuid;
  third_id uuid;
  copy_a constant uuid := '7c000000-0000-0000-0000-000000000041';
  copy_b constant uuid := '7c000000-0000-0000-0000-000000000042';
  titles text[];
begin
  perform public.apply_project_template_stage(v_project_id,template_id,'stage_1','stage_1',null);
  select array_agg(title order by stage_position) into titles from public.tasks where tasks.project_id=v_project_id and stage='stage_1';
  if titles is distinct from array['Room 1','Room 2','Room 3']::text[] then
    raise exception 'Template order was not preserved: %', titles;
  end if;
  select id into first_id from public.tasks where tasks.project_id=v_project_id and title='Room 1';
  select id into second_id from public.tasks where tasks.project_id=v_project_id and title='Room 2';
  select id into third_id from public.tasks where tasks.project_id=v_project_id and title='Room 3';
  perform public.save_stage_task_structure(v_project_id,'stage_1','[]',jsonb_build_array(
    jsonb_build_object('client_key',copy_a,'source_task_id',first_id,'title','Room 1 copy A','completed_area_m2',null,'checklist_template_id',null),
    jsonb_build_object('client_key',copy_b,'source_task_id',first_id,'title','Room 1 copy B','completed_area_m2',null,'checklist_template_id',null)
  ),'{}',array[first_id,copy_a,copy_b,second_id,third_id]);
  -- Same ordering query used by the Board after a reload.
  select array_agg(title order by stage_position) into titles from public.tasks where tasks.project_id=v_project_id and stage='stage_1';
  if titles is distinct from array['Room 1','Room 1 copy A','Room 1 copy B','Room 2','Room 3']::text[] then
    raise exception 'Saved stage order changed: %', titles;
  end if;
  if (select array_agg(stage_position order by stage_position) from public.tasks where tasks.project_id=v_project_id and stage='stage_1')
    is distinct from array[0,1,2,3,4]::integer[] then raise exception 'Stage positions are not dense'; end if;
end
$test$;
rollback;
