begin;

select plan(9);

select ok(
  has_function_privilege('authenticated', 'private.is_project_progress_stage(text)', 'execute'),
  'authenticated callers can evaluate the project progress-stage predicate'
);
select ok(
  not has_function_privilege('anon', 'private.is_project_progress_stage(text)', 'execute'),
  'anonymous callers cannot execute the project progress-stage predicate'
);
select ok(
  not has_function_privilege('authenticated', 'private.is_active_project_task_assignee(uuid, uuid)', 'execute'),
  'the active-assignee membership helper remains private'
);

insert into public.studios (id, name)
values ('70000000-0000-0000-0000-000000000001', 'Bulk stage assignment test studio');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('70000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'bulk-stage-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('70000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'bulk-stage-assignee@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('70000000-0000-0000-0000-000000000010', 'Bulk stage admin', 'bulk-stage-admin@example.test', 'admin'),
  ('70000000-0000-0000-0000-000000000011', 'Bulk stage assignee', 'bulk-stage-assignee@example.test', 'employee');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000010', 'admin'),
  ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000011', 'employee');
insert into public.projects (id, studio_id, name, total_area_m2, start_date, created_by)
values ('70000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000001', 'Bulk stage assignment test project', 1, current_date, '70000000-0000-0000-0000-000000000010');
insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at) values
  ('70000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000010', 'designer', 0, current_date),
  ('70000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000011', 'designer', 0, current_date);
insert into public.tasks (id, project_id, title, status, assignee_id, created_by, stage) values
  ('70000000-0000-0000-0000-000000000030', '70000000-0000-0000-0000-000000000020', 'Stage task one', 'todo', '70000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000010', 'stage_1'),
  ('70000000-0000-0000-0000-000000000031', '70000000-0000-0000-0000-000000000020', 'Stage task two', 'todo', '70000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000010', 'stage_1'),
  ('70000000-0000-0000-0000-000000000032', '70000000-0000-0000-0000-000000000020', 'Cancelled stage task', 'cancelled', '70000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000010', 'stage_1'),
  ('70000000-0000-0000-0000-000000000033', '70000000-0000-0000-0000-000000000020', 'Other stage task', 'todo', '70000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000010', 'stage_2');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000010', true);
set local role authenticated;

select lives_ok(
  $$select public.bulk_assign_project_stage_tasks('70000000-0000-0000-0000-000000000020', 'stage_1', '70000000-0000-0000-0000-000000000011', 'all')$$,
  'an active studio administrator can bulk assign every eligible task in a stage'
);
select is(
  (select count(*)::integer from public.tasks where id in ('70000000-0000-0000-0000-000000000030', '70000000-0000-0000-0000-000000000031') and assignee_id = '70000000-0000-0000-0000-000000000011'),
  2,
  'every eligible task in the stage is assigned'
);
select is(
  (select assignee_id from public.tasks where id = '70000000-0000-0000-0000-000000000032'),
  '70000000-0000-0000-0000-000000000010'::uuid,
  'cancelled tasks remain unchanged'
);
select is(
  (select assignee_id from public.tasks where id = '70000000-0000-0000-0000-000000000033'),
  '70000000-0000-0000-0000-000000000010'::uuid,
  'tasks in other stages remain unchanged'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000011', true);
set local role authenticated;

select throws_ok(
  $$select public.bulk_assign_project_stage_tasks('70000000-0000-0000-0000-000000000020', 'stage_1', '70000000-0000-0000-0000-000000000010', 'all')$$,
  'Only active studio administrators can assign project tasks',
  'an employee cannot bulk assign a project stage'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000010', true);
set local role authenticated;

select lives_ok(
  $$update public.tasks set assignee_id = '70000000-0000-0000-0000-000000000010' where id = '70000000-0000-0000-0000-000000000030'$$,
  'the existing single-task assignment path remains available to an administrator'
);

select * from finish();
rollback;
