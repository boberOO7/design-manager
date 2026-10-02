begin;
insert into public.studios(id, name) values
  ('7a000000-0000-0000-0000-000000000001', 'Checklist assignment'),
  ('7a000000-0000-0000-0000-000000000002', 'Other checklist studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('7a000000-0000-0000-0000-000000000010','authenticated','authenticated','checklist-assignment-admin@example.test','{}','{}',now(),now()),
  ('7a000000-0000-0000-0000-000000000011','authenticated','authenticated','checklist-assignment-employee@example.test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values
  ('7a000000-0000-0000-0000-000000000010','Checklist admin','checklist-assignment-admin@example.test','admin'),
  ('7a000000-0000-0000-0000-000000000011','Checklist employee','checklist-assignment-employee@example.test','employee');
insert into public.studio_members(studio_id,user_id,system_role) values
  ('7a000000-0000-0000-0000-000000000001','7a000000-0000-0000-0000-000000000010','admin'),
  ('7a000000-0000-0000-0000-000000000001','7a000000-0000-0000-0000-000000000011','employee');
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by)
values ('7a000000-0000-0000-0000-000000000020','7a000000-0000-0000-0000-000000000001','Checklist assignment project',0,'active',current_date,'7a000000-0000-0000-0000-000000000010');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values
  ('7a000000-0000-0000-0000-000000000020','7a000000-0000-0000-0000-000000000011','designer',0,current_date);
insert into public.checklist_templates(id,studio_id,name,created_by) values
  ('7a000000-0000-0000-0000-000000000050','7a000000-0000-0000-0000-000000000002','Foreign template','7a000000-0000-0000-0000-000000000010');
insert into public.tasks(id,project_id,stage,title,status,created_by)
values ('7a000000-0000-0000-0000-000000000030','7a000000-0000-0000-0000-000000000020','stage_4','Existing task','todo','7a000000-0000-0000-0000-000000000010');
select set_config('request.jwt.claim.sub','7a000000-0000-0000-0000-000000000010',true);
set local role authenticated;

do $test$
declare
  v_task_id uuid := '7a000000-0000-0000-0000-000000000030';
  template_a uuid;
  template_b uuid;
  new_task_id uuid;
  owned_task_id uuid;
  before_ids uuid[];
begin
  template_a := public.save_checklist_template('7a000000-0000-0000-0000-000000000001','Template A',
    '[{"title":"A first","weight":2},{"title":"A second","weight":3}]');
  template_b := public.save_checklist_template('7a000000-0000-0000-0000-000000000001','Template B',
    '[{"title":"B only","weight":4}]');
  insert into public.task_checklist_items(task_id,title,weight,position) values(v_task_id,'Legacy item',1,0);
  perform public.set_task_checklist_template(v_task_id,template_a);
  if (select checklist_template_id from public.tasks where id=v_task_id) is distinct from template_a
    or (select array_agg(title order by position) from public.task_checklist_items item where item.task_id=v_task_id)
      is distinct from array['A first','A second']::text[] then
    raise exception 'Assignment did not replace the legacy checklist and persist identity';
  end if;
  if (select array_agg(weight order by position) from public.task_checklist_items item where item.task_id=v_task_id)
    is distinct from array[2,3]::numeric[] then raise exception 'Assignment lost template weights'; end if;
  select array_agg(id order by position) into before_ids from public.task_checklist_items item where item.task_id=v_task_id;
  update public.task_checklist_items item set is_completed=true where item.task_id=v_task_id and position=0;
  perform public.set_task_checklist_template(v_task_id,template_a);
  if (select array_agg(id order by position) from public.task_checklist_items item where item.task_id=v_task_id)
    is distinct from before_ids then raise exception 'Selecting the assigned template reset item state'; end if;
  perform public.set_task_checklist_template(v_task_id,template_b);
  if (select checklist_template_id from public.tasks where id=v_task_id) is distinct from template_b
    or (select array_agg(title order by position) from public.task_checklist_items item where item.task_id=v_task_id)
      is distinct from array['B only']::text[]
    or exists(select 1 from public.task_checklist_items item where item.task_id=v_task_id and (is_completed or is_not_needed)) then
    raise exception 'Switching templates appended items or inherited completion';
  end if;
  begin
    perform public.set_task_checklist_template(v_task_id,'7a000000-0000-0000-0000-000000000050');
    raise exception 'Foreign template accepted';
  exception when raise_exception then
    if sqlerrm <> 'Choose an active checklist template from this studio' then raise; end if;
  end;
  if (select checklist_template_id from public.tasks where id=v_task_id) is distinct from template_b
    or (select count(*) from public.task_checklist_items item where item.task_id=v_task_id) <> 1 then
    raise exception 'Failed assignment changed existing state';
  end if;
  perform public.set_checklist_template_archived(template_a,true);
  begin
    perform public.set_task_checklist_template(v_task_id,template_a);
    raise exception 'Archived template accepted';
  exception when raise_exception then
    if sqlerrm <> 'Choose an active checklist template from this studio' then raise; end if;
  end;
  begin
    update public.tasks set checklist_template_id=null where id=v_task_id;
    raise exception 'Assignment column is directly writable';
  exception when insufficient_privilege then null;
  end;
  perform public.set_task_checklist_template(v_task_id,null);
  if (select checklist_template_id from public.tasks where id=v_task_id) is not null
    or exists(select 1 from public.task_checklist_items item where item.task_id=v_task_id) then
    raise exception 'No-template selection failed to clear assignment and checklist';
  end if;

  new_task_id := public.create_task_with_checklist(jsonb_build_object(
    'project_id','7a000000-0000-0000-0000-000000000020','title','Created with template',
    'priority','normal','stage','stage_4','checklist_template_id',template_b),
    '[{"title":"B only","weight":4}]');
  if (select checklist_template_id from public.tasks where id=new_task_id) is distinct from template_b
    or (select count(*) from public.task_checklist_items item where item.task_id=new_task_id) <> 1 then
    raise exception 'Task creation lost template assignment';
  end if;
  -- Same-template identity is retained when checklist items are explicitly edited.
  update public.task_checklist_items item set title='Edited snapshot' where item.task_id=new_task_id;
  if (select checklist_template_id from public.tasks where id=new_task_id) is distinct from template_b then
    raise exception 'Item editing lost assignment identity';
  end if;
  update public.tasks set status='in_progress' where id=new_task_id;
  update public.task_checklist_items item set is_completed=true where item.task_id=new_task_id;
  update public.tasks set status='internal_review' where id=new_task_id;
  begin
    perform public.set_task_checklist_template(new_task_id,null);
    raise exception 'Review task assignment was editable';
  exception when raise_exception then
    if sqlerrm <> 'Checklist editing is available only to task editors while the task is To do or In progress' then raise; end if;
  end;
  owned_task_id := public.create_task_with_checklist(jsonb_build_object(
    'project_id','7a000000-0000-0000-0000-000000000020','title','Employee task',
    'priority','normal','stage','stage_4','assignee_id','7a000000-0000-0000-0000-000000000011'));
  -- An employee without assignment cannot use the privileged atomic operation.
  perform set_config('request.jwt.claim.sub','7a000000-0000-0000-0000-000000000011',true);
  begin
    perform public.set_task_checklist_template(v_task_id,template_b);
    raise exception 'Unassigned employee changed the checklist';
  exception when raise_exception then
    if sqlerrm <> 'Checklist editing is available only to task editors while the task is To do or In progress' then raise; end if;
  end;
  perform public.set_task_checklist_template(owned_task_id,template_b);
  if (select checklist_template_id from public.tasks where id=owned_task_id) is distinct from template_b
    or (select count(*) from public.task_checklist_items item where item.task_id=owned_task_id)<>1 then
    raise exception 'Assigned employee could not apply a checklist template';
  end if;
end
$test$;
reset role;
set local role anon;
do $test$
begin
  begin
    perform public.set_task_checklist_template('7a000000-0000-0000-0000-000000000030',null);
    raise exception 'Anonymous assignment accepted';
  exception when insufficient_privilege then null;
  end;
end
$test$;
rollback;
