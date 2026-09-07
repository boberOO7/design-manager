begin;

select plan(10);

insert into public.studios (id, name) values ('20000000-0000-0000-0000-000000000001', 'Selected bulk test studio');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('20000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'bulk-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'bulk-assignee@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'bulk-employee@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('20000000-0000-0000-0000-000000000010', 'Bulk admin', 'bulk-admin@example.test', 'admin'),
  ('20000000-0000-0000-0000-000000000011', 'Bulk assignee', 'bulk-assignee@example.test', 'employee'),
  ('20000000-0000-0000-0000-000000000012', 'Bulk employee', 'bulk-employee@example.test', 'employee');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000010', 'admin'),
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000011', 'employee'),
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000012', 'employee');
insert into public.projects (id, studio_id, name, total_area_m2, start_date, created_by) values
  ('20000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000001', 'Selected bulk test project', 1, current_date, '20000000-0000-0000-0000-000000000010');
insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at) values
  ('20000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000010', 'designer', 0, current_date),
  ('20000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000011', 'designer', 0, current_date),
  ('20000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000012', 'designer', 0, current_date);
insert into public.tasks (id, project_id, title, assignee_id, created_by, stage) values
  ('20000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000020', 'Selected one', '20000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'stage_1'),
  ('20000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000020', 'Selected two', '20000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'stage_1'),
  ('20000000-0000-0000-0000-000000000032', '20000000-0000-0000-0000-000000000020', 'Excluded', '20000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'stage_1'),
  ('20000000-0000-0000-0000-000000000033', '20000000-0000-0000-0000-000000000020', 'Other stage', '20000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'stage_2');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000010', true);
set local role authenticated;

select lives_ok(
  $$select public.bulk_assign_selected_project_tasks('20000000-0000-0000-0000-000000000020', 'stage_1', '20000000-0000-0000-0000-000000000011', array['20000000-0000-0000-0000-000000000030','20000000-0000-0000-0000-000000000031']::uuid[])$$,
  'an active administrator can assign an exact task selection'
);
select is((select count(*)::integer from public.tasks where id in ('20000000-0000-0000-0000-000000000030','20000000-0000-0000-0000-000000000031') and assignee_id = '20000000-0000-0000-0000-000000000011'), 2, 'every selected task is assigned');
select is((select assignee_id from public.tasks where id = '20000000-0000-0000-0000-000000000032'), '20000000-0000-0000-0000-000000000010'::uuid, 'an unselected task remains unchanged');

insert into public.task_deadlines (task_id, target_status, due_date) values
  ('20000000-0000-0000-0000-000000000030', 'completed', '2031-12-31');
select lives_ok(
  $$select public.bulk_set_project_task_deadline('20000000-0000-0000-0000-000000000020', 'stage_1', array['20000000-0000-0000-0000-000000000030','20000000-0000-0000-0000-000000000031']::uuid[], 'review', '2031-06-15')$$,
  'an active administrator can set one milestone deadline on an exact selection'
);
select is((select count(*)::integer from public.task_deadlines where task_id in ('20000000-0000-0000-0000-000000000030','20000000-0000-0000-0000-000000000031') and target_status = 'review' and due_date = '2031-06-15'), 2, 'the deadline is applied to every selected task');
select is((select due_date from public.task_deadlines where task_id = '20000000-0000-0000-0000-000000000030' and target_status = 'completed'), '2031-12-31'::date, 'other milestone deadlines are preserved');
select is((select count(*)::integer from public.task_deadlines where task_id = '20000000-0000-0000-0000-000000000032'), 0, 'an unselected task receives no deadline');

select throws_ok(
  $$select public.bulk_set_project_task_deadline('20000000-0000-0000-0000-000000000020', 'stage_1', array['20000000-0000-0000-0000-000000000030','20000000-0000-0000-0000-000000000033']::uuid[], 'review', '2032-01-01')$$,
  'Every selected task must still be available in this project stage',
  'a mixed-stage deadline batch is rejected atomically'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000012', true);
set local role authenticated;

select throws_ok(
  $$select public.bulk_assign_selected_project_tasks('20000000-0000-0000-0000-000000000020', 'stage_1', '20000000-0000-0000-0000-000000000011', array['20000000-0000-0000-0000-000000000032']::uuid[])$$,
  'Only active studio administrators can assign project tasks',
  'an employee cannot bulk assign selected tasks'
);
select throws_ok(
  $$select public.bulk_set_project_task_deadline('20000000-0000-0000-0000-000000000020', 'stage_1', array['20000000-0000-0000-0000-000000000032']::uuid[], 'review', '2032-01-01')$$,
  'Only active studio administrators can edit task deadlines',
  'an employee cannot bulk edit selected task deadlines'
);

select * from finish();
rollback;
