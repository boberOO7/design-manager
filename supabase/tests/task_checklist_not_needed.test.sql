begin;

insert into public.studios (id, name) values ('78000000-0000-0000-0000-000000000001', 'Checklist resolution test');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('78000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'checklist-resolution-admin@example.test', '{}', '{}', now(), now());
insert into public.profiles (id, full_name, email, system_role)
values ('78000000-0000-0000-0000-000000000010', 'Checklist resolution admin', 'checklist-resolution-admin@example.test', 'admin');
insert into public.studio_members (studio_id, user_id, system_role)
values ('78000000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-000000000010', 'admin');
insert into public.projects (id, studio_id, name, project_type, total_area_m2, status, start_date, created_by)
values ('78000000-0000-0000-0000-000000000020', '78000000-0000-0000-0000-000000000001', 'Checklist resolution project', 'private', 80, 'active', current_date, '78000000-0000-0000-0000-000000000010');
insert into public.tasks (id, project_id, title, status, created_by, stage)
values ('78000000-0000-0000-0000-000000000030', '78000000-0000-0000-0000-000000000020', 'Checklist resolution task', 'in_progress', '78000000-0000-0000-0000-000000000010', 'stage_4');

select set_config('request.jwt.claim.sub', '78000000-0000-0000-0000-000000000010', true);
set local role authenticated;

do $test$
declare
  item_id uuid;
begin
  insert into public.task_checklist_items (task_id, title, weight, position)
  values ('78000000-0000-0000-0000-000000000030', 'Optional work', 1, 0)
  returning id into item_id;
  if (select is_completed or is_not_needed from public.task_checklist_items where id = item_id) then
    raise exception 'New items must start pending';
  end if;

  update public.task_checklist_items set is_not_needed = true where id = item_id;
  if (select is_completed or not is_not_needed from public.task_checklist_items where id = item_id) then
    raise exception 'Not-needed must remain distinct from completed';
  end if;
  begin
    update public.task_checklist_items set is_completed = true where id = item_id;
    raise exception 'The database accepted two resolved states on one item';
  exception when check_violation then null;
  end;

  update public.task_checklist_items set is_not_needed = false where id = item_id;
  if (select is_completed or is_not_needed from public.task_checklist_items where id = item_id) then
    raise exception 'Returning an item to pending failed';
  end if;
  update public.task_checklist_items set is_not_needed = true where id = item_id;

  update public.tasks set status = 'completed' where id = '78000000-0000-0000-0000-000000000030';
  if (select status from public.tasks where id = '78000000-0000-0000-0000-000000000030') <> 'completed' then
    raise exception 'A not-needed item blocked task completion';
  end if;
end
$test$;

rollback;
