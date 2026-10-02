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
  next_status text;
  previous_status text := 'todo';
  before_items jsonb;
  blocked boolean;
begin
  update public.tasks set status='in_progress' where id=v_task_id;
  select jsonb_agg(to_jsonb(item) order by item.id) into before_items
  from public.task_checklist_items item where item.task_id=v_task_id;
  foreach next_status in array array['internal_review','review','completed'] loop
    blocked := false;
    begin
      update public.tasks set status=next_status where id=v_task_id;
    exception when raise_exception then
      if sqlerrm='Complete every checklist item before moving this task to Internal Review or a later status' then blocked:=true; else raise; end if;
    end;
    if not blocked then raise exception 'Incomplete checklist reached %',next_status; end if;
    if (select status from public.tasks where id=v_task_id)<>'in_progress'
      or (select jsonb_agg(to_jsonb(item) order by item.id) from public.task_checklist_items item where item.task_id=v_task_id)
        is distinct from before_items then raise exception 'Rejected transition changed status or checklist'; end if;
  end loop;

  -- All boundary statuses remain available when there is no checklist.
  foreach next_status in array array['internal_review','review','completed'] loop
    update public.tasks set status=next_status where id=empty_id;
  end loop;

  update public.task_checklist_items set is_completed=true where task_id=v_task_id;
  select jsonb_agg(to_jsonb(item) order by item.id) into before_items
  from public.task_checklist_items item where item.task_id=v_task_id;
  foreach next_status in array array['internal_review','review','completed','in_progress'] loop
    update public.tasks set status=next_status where id=v_task_id;
    if (select jsonb_agg(to_jsonb(item) order by item.id) from public.task_checklist_items item where item.task_id=v_task_id)
      is distinct from before_items then raise exception 'Status % silently changed checklist state',next_status; end if;
  end loop;
  -- Returning to earlier work does not remember a past completion exemption.
  update public.task_checklist_items set is_completed=false where task_id=v_task_id;
  foreach next_status in array array['internal_review','review','completed'] loop
    blocked:=false;
    begin
      update public.tasks set status=next_status where id=v_task_id;
    exception when raise_exception then
      if sqlerrm='Complete every checklist item before moving this task to Internal Review or a later status' then blocked:=true; else raise; end if;
    end;
    if not blocked then raise exception 'Reopened incomplete checklist reached %',next_status; end if;
  end loop;

  -- Every batch path uses the same trigger, with no partial updates.
  foreach next_status in array array['internal_review','review','completed'] loop
    blocked:=false;
    begin
      perform public.bulk_move_project_tasks(project_id,'stage_1',array['todo'],next_status,array[batch_id,batch_empty_id]);
    exception when raise_exception then
      if sqlerrm='Complete every checklist item before moving this task to Internal Review or a later status' then blocked:=true; else raise; end if;
    end;
    if not blocked then raise exception 'Bulk move bypassed guard for %',next_status; end if;
    if (select count(*) from public.tasks where id in (batch_id,batch_empty_id) and status='todo')<>2 then
      raise exception 'Rejected batch was not atomic'; end if;
  end loop;
  update public.task_checklist_items set is_completed=true where task_id=batch_id;
  foreach next_status in array array['internal_review','review','completed'] loop
    perform public.bulk_move_project_tasks(project_id,'stage_1',array[previous_status],next_status,array[batch_id,batch_empty_id]);
    previous_status:=next_status;
  end loop;
end
$test$;
rollback;
