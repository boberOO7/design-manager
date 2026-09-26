begin;

insert into public.studios(id,name) values ('79000000-0000-0000-0000-000000000001','Review checklist guard');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('79000000-0000-0000-0000-000000000010','authenticated','authenticated','review-checklist-admin@example.test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role)
values ('79000000-0000-0000-0000-000000000010','Review checklist admin','review-checklist-admin@example.test','admin');
insert into public.studio_members(studio_id,user_id,system_role)
values ('79000000-0000-0000-0000-000000000001','79000000-0000-0000-0000-000000000010','admin');
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by)
values ('79000000-0000-0000-0000-000000000020','79000000-0000-0000-0000-000000000001','Review checklist project',0,'active',current_date,'79000000-0000-0000-0000-000000000010');
insert into public.tasks(id,project_id,stage,title,status,created_by) values
  ('79000000-0000-0000-0000-000000000030','79000000-0000-0000-0000-000000000020','stage_1','Checklist task','todo','79000000-0000-0000-0000-000000000010'),
  ('79000000-0000-0000-0000-000000000031','79000000-0000-0000-0000-000000000020','stage_1','No checklist task','todo','79000000-0000-0000-0000-000000000010'),
  ('79000000-0000-0000-0000-000000000032','79000000-0000-0000-0000-000000000020','stage_1','Batch checklist task','todo','79000000-0000-0000-0000-000000000010'),
  ('79000000-0000-0000-0000-000000000033','79000000-0000-0000-0000-000000000020','stage_1','Batch empty task','todo','79000000-0000-0000-0000-000000000010');
select set_config('request.jwt.claim.sub','79000000-0000-0000-0000-000000000010',true);
set local role authenticated;
insert into public.task_checklist_items(task_id,title,weight,position) values
  ('79000000-0000-0000-0000-000000000030','Finish work',1,0),
  ('79000000-0000-0000-0000-000000000032','Finish batch work',1,0);

do $test$
declare
  v_task_id uuid := '79000000-0000-0000-0000-000000000030';
  batch_id uuid := '79000000-0000-0000-0000-000000000032';
  empty_id uuid := '79000000-0000-0000-0000-000000000031';
  batch_empty_id uuid := '79000000-0000-0000-0000-000000000033';
  project_id uuid := '79000000-0000-0000-0000-000000000020';
  blocked boolean;
begin
  -- Earlier work status is unchanged, including an incomplete checklist.
  update public.tasks set status='in_progress' where id=v_task_id;
  if (select status from public.tasks where id=v_task_id)<>'in_progress' then raise exception 'Earlier work status was blocked'; end if;

  blocked:=false;
  begin
    update public.tasks set status='internal_review' where id=v_task_id;
  exception when raise_exception then
    if sqlerrm='Complete every checklist item before moving this task to Internal Review or Done' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'Incomplete checklist reached Internal Review'; end if;
  blocked:=false;
  begin
    update public.tasks set status='completed' where id=v_task_id;
  exception when raise_exception then
    if sqlerrm='Complete every checklist item before moving this task to Internal Review or Done' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'Incomplete checklist reached Done'; end if;
  if (select status from public.tasks where id=v_task_id)<>'in_progress' then raise exception 'Rejected transition changed task status'; end if;

  -- Empty checklists keep their previous transition behavior.
  update public.tasks set status='internal_review' where id=empty_id;
  update public.tasks set status='completed' where id=empty_id;
  if (select status from public.tasks where id=empty_id)<>'completed' then raise exception 'No-checklist task was blocked'; end if;

  update public.task_checklist_items set is_completed=true where task_id=v_task_id;
  update public.tasks set status='internal_review' where id=v_task_id;
  update public.tasks set status='completed' where id=v_task_id;
  if (select status from public.tasks where id=v_task_id)<>'completed' then raise exception 'Resolved checklist did not reach review and Done'; end if;

  -- Bulk changes pass through the same task trigger and remain atomic.
  blocked:=false;
  begin
    perform public.bulk_move_project_tasks(project_id,'stage_1',array['todo'],'internal_review',array[batch_id,batch_empty_id]);
  exception when raise_exception then
    if sqlerrm='Complete every checklist item before moving this task to Internal Review or Done' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'Bulk move bypassed checklist guard'; end if;
  if (select count(*) from public.tasks where id in (batch_id,batch_empty_id) and status='todo')<>2 then raise exception 'Rejected batch was not atomic'; end if;
  update public.task_checklist_items set is_completed=true where task_id=batch_id;
  perform public.bulk_move_project_tasks(project_id,'stage_1',array['todo'],'internal_review',array[batch_id,batch_empty_id]);
  if (select count(*) from public.tasks where id in (batch_id,batch_empty_id) and status='internal_review')<>2 then raise exception 'Resolved batch was blocked'; end if;
end
$test$;

rollback;
