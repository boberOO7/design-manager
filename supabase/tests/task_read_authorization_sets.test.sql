begin;
select no_plan();

insert into public.studios (id, name) values
  ('ab100000-0000-0000-0000-000000000001', 'Task read authorization'),
  ('ab100000-0000-0000-0000-000000000002', 'Other task studio');
insert into auth.users (id, aud, role, email) select
  ('ab100000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', 'task-read-' || n || '@example.test'
from generate_series(10, 16) n;
insert into public.profiles (id, full_name, email, system_role)
select id, 'Task read actor', email, case when email in ('task-read-10@example.test', 'task-read-15@example.test') then 'admin' else 'employee' end
from auth.users where id between 'ab100000-0000-0000-0000-000000000010' and 'ab100000-0000-0000-0000-000000000016';
insert into public.studio_members (studio_id, user_id, system_role)
select case when email = 'task-read-15@example.test' then 'ab100000-0000-0000-0000-000000000002' else 'ab100000-0000-0000-0000-000000000001' end::uuid,
  id, system_role from public.profiles
where id between 'ab100000-0000-0000-0000-000000000010' and 'ab100000-0000-0000-0000-000000000016';
insert into public.projects (id, studio_id, name, status, start_date, total_area_m2, created_by)
select ('ab100000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  case when n = 24 then 'ab100000-0000-0000-0000-000000000002' else 'ab100000-0000-0000-0000-000000000001' end::uuid,
  'Task read project ' || n, 'active', current_date, 0,
  case when n = 24 then 'ab100000-0000-0000-0000-000000000015' else 'ab100000-0000-0000-0000-000000000010' end::uuid
from generate_series(20, 24) n;
insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at)
select id, created_by, 'designer', 0, current_date from public.projects
where id between 'ab100000-0000-0000-0000-000000000020' and 'ab100000-0000-0000-0000-000000000024';
insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at)
select 'ab100000-0000-0000-0000-000000000020',
  ('ab100000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'designer', 0, current_date
from unnest(array[11, 13, 14, 16]) n;
insert into public.tasks (id, project_id, stage, title, status, created_by)
select ('ab100000-0000-0000-0000-' || lpad((n + 10)::text, 12, '0'))::uuid,
  id, 'stage_1', 'Task read fixture', 'todo', created_by
from public.projects cross join lateral (select right(id::text, 2)::integer as n) number
where id between 'ab100000-0000-0000-0000-000000000020' and 'ab100000-0000-0000-0000-000000000024';
insert into public.task_checklist_items (task_id, title, weight, position)
select id, 'Task read checklist', 1, 0 from public.tasks
where id between 'ab100000-0000-0000-0000-000000000030' and 'ab100000-0000-0000-0000-000000000034';
insert into public.task_deadlines (task_id, target_status, due_date)
select id, 'review', current_date + 5 from public.tasks
where id between 'ab100000-0000-0000-0000-000000000030' and 'ab100000-0000-0000-0000-000000000034';
insert into public.task_collaborators (task_id, user_id)
select id, created_by from public.tasks
where id between 'ab100000-0000-0000-0000-000000000030' and 'ab100000-0000-0000-0000-000000000034';
insert into public.task_collaborators (task_id, user_id)
values ('ab100000-0000-0000-0000-000000000030', 'ab100000-0000-0000-0000-000000000014');
insert into public.task_schedules (task_id, project_id, stage, sort_order, expected_workdays, baseline_start, baseline_due, current_start, current_due)
select id, project_id, stage, 0, 1, current_date, current_date, current_date, current_date from public.tasks
where id between 'ab100000-0000-0000-0000-000000000030' and 'ab100000-0000-0000-0000-000000000034';
update public.projects set status = 'paused' where id = 'ab100000-0000-0000-0000-000000000021';
update public.projects set status = 'archived', archived_at = now() where id = 'ab100000-0000-0000-0000-000000000022';
update public.studio_members set is_active = false where user_id = 'ab100000-0000-0000-0000-000000000013';
update public.project_members set is_active = false where user_id = 'ab100000-0000-0000-0000-000000000014';
update public.profiles set is_active = false where id = 'ab100000-0000-0000-0000-000000000016';

-- Store fixture row keys before assuming caller roles; compare every read surface.
create temporary table task_read_surfaces (relation_name text, key_expression text, project_expression text);
insert into task_read_surfaces values
  ('projects', 'id::text', 'id'), ('tasks', 'id::text', 'project_id'),
  ('task_status_periods', 'id::text', 'project_id'), ('task_schedules', 'task_id::text', 'project_id'),
  ('task_checklist_items', 'id::text', '(select project_id from public.tasks where id = task_id)'),
  ('task_deadlines', 'id::text', '(select project_id from public.tasks where id = task_id)'),
  ('task_collaborators', 'task_id::text || ''/'' || user_id::text', '(select project_id from public.tasks where id = task_id)'),
  ('project_members', 'project_id::text || ''/'' || user_id::text', 'project_id'),
  ('project_task_stage_columns', 'project_id::text || ''/'' || stage', 'project_id');
create temporary table expected_task_read_rows (relation_name text, project_id uuid, row_key text);
do $$ declare surface record; begin
  for surface in select * from task_read_surfaces loop
    execute format('insert into expected_task_read_rows select %L, %s, %s from public.%I',
      surface.relation_name, surface.project_expression, surface.key_expression, surface.relation_name);
  end loop;
end $$;
grant select on task_read_surfaces, expected_task_read_rows to authenticated;
create function pg_temp.check_task_reads(expected_projects uuid[], actor_label text)
returns setof text language plpgsql security invoker as $$
declare surface record; begin
  return next results_eq('select private.accessible_project_ids() order by 1',
    format('select unnest(%L::uuid[]) order by 1', expected_projects), actor_label || ': authorized project set');
  return next results_eq('select private.accessible_project_ids() order by 1',
    $query$select project_id from expected_task_read_rows where relation_name = 'projects' and private.can_access_project(project_id) order by 1$query$,
    actor_label || ': set rule equals canonical project permission');
  for surface in select * from task_read_surfaces loop
    return next results_eq(format('select %s from public.%I order by 1', surface.key_expression, surface.relation_name),
      format('select row_key from expected_task_read_rows where relation_name = %L and project_id = any(%L::uuid[]) order by 1', surface.relation_name, expected_projects),
      actor_label || ': ' || surface.relation_name || ' rows');
  end loop;
end $$;

set local request.jwt.claim.sub = 'ab100000-0000-0000-0000-000000000010';
set local role authenticated;
select * from pg_temp.check_task_reads(array['ab100000-0000-0000-0000-000000000020', 'ab100000-0000-0000-0000-000000000021', 'ab100000-0000-0000-0000-000000000022', 'ab100000-0000-0000-0000-000000000023']::uuid[], 'studio admin, including paused and archived');
select lives_ok($$insert into public.task_deadlines(task_id,target_status,due_date) values ('ab100000-0000-0000-0000-000000000030','completed',current_date+7)$$, 'admin retains deadline insert');
select throws_ok($$update public.task_deadlines set due_date=current_date+6 where task_id='ab100000-0000-0000-0000-000000000030' and target_status='review'$$, '42501', null, 'direct deadline update remains unavailable to caller admin');
select lives_ok($$insert into public.task_collaborators(task_id,user_id) values ('ab100000-0000-0000-0000-000000000030','ab100000-0000-0000-0000-000000000011')$$, 'admin retains collaborator insert');
select lives_ok($$delete from public.task_collaborators where task_id='ab100000-0000-0000-0000-000000000030' and user_id='ab100000-0000-0000-0000-000000000011'$$, 'admin retains collaborator delete');
select throws_ok($$select productivity_area_m2 from public.tasks$$, '42501', null, 'caller admin cannot read private task accounting snapshots');
-- Remove the extra write fixture so subsequent role comparisons use identical rows.
set local role postgres;
delete from public.task_deadlines where task_id='ab100000-0000-0000-0000-000000000030' and target_status='completed';

set local request.jwt.claim.sub = 'ab100000-0000-0000-0000-000000000011';
set local role authenticated;
select * from pg_temp.check_task_reads(array['ab100000-0000-0000-0000-000000000020']::uuid[], 'active project employee');
select throws_ok($$insert into public.task_deadlines(task_id,target_status,due_date) values ('ab100000-0000-0000-0000-000000000030','completed',current_date+7)$$, '42501', null, 'employee cannot insert deadlines');
select throws_ok($$insert into public.task_collaborators(task_id,user_id) values ('ab100000-0000-0000-0000-000000000030','ab100000-0000-0000-0000-000000000011')$$, '42501', null, 'employee cannot insert collaborators');
select throws_ok($$update public.task_deadlines set due_date=current_date+8 where task_id='ab100000-0000-0000-0000-000000000030'$$, '42501', null, 'employee cannot update deadlines');
with changed as (delete from public.task_collaborators where task_id='ab100000-0000-0000-0000-000000000030' returning task_id)
select is((select count(*)::integer from changed), 0, 'employee cannot delete collaborators');
select throws_ok($$select productivity_area_m2 from public.tasks$$, '42501', null, 'employee cannot read private task accounting snapshots');

set local request.jwt.claim.sub = 'ab100000-0000-0000-0000-000000000012';
select * from pg_temp.check_task_reads('{}', 'same-studio non-project employee');
set local request.jwt.claim.sub = 'ab100000-0000-0000-0000-000000000013';
select * from pg_temp.check_task_reads('{}', 'removed studio member with retained project membership');
set local request.jwt.claim.sub = 'ab100000-0000-0000-0000-000000000014';
select * from pg_temp.check_task_reads('{}', 'inactive project member');
set local request.jwt.claim.sub = 'ab100000-0000-0000-0000-000000000015';
select * from pg_temp.check_task_reads(array['ab100000-0000-0000-0000-000000000024']::uuid[], 'other studio admin');
set local request.jwt.claim.sub = 'ab100000-0000-0000-0000-000000000016';
-- Preserve can_access_project exactly; active-profile gating remains in the app.
select * from pg_temp.check_task_reads(array['ab100000-0000-0000-0000-000000000020']::uuid[], 'inactive profile with unchanged membership grant');
set local request.jwt.claim.sub = '';
select * from pg_temp.check_task_reads('{}', 'missing authenticated identity');

set local role postgres;
update public.project_members set is_active=false where user_id='ab100000-0000-0000-0000-000000000011';
set local request.jwt.claim.sub = 'ab100000-0000-0000-0000-000000000011';
set local role authenticated;
select * from pg_temp.check_task_reads('{}', 'project revocation takes effect on the next statement');
set local role postgres;
select ok(not has_function_privilege('anon', 'private.accessible_project_ids()', 'execute'), 'anonymous callers cannot execute the private authorization helper');
select ok(not has_table_privilege('authenticated', 'public.task_deadlines', 'delete'), 'deadline delete grant remains revoked');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.projects'::regclass, 'public.tasks'::regclass, 'public.task_status_periods'::regclass, 'public.task_schedules'::regclass, 'public.task_checklist_items'::regclass, 'public.task_deadlines'::regclass, 'public.task_collaborators'::regclass, 'public.project_members'::regclass, 'public.project_task_stage_columns'::regclass)), 'all task read surfaces retain RLS');
select * from finish();
rollback;
