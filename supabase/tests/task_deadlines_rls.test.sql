begin;

select plan(14);

insert into public.studios (id, name) values ('10000000-0000-0000-0000-000000000001', 'Deadline test studio');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('10000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'deadline-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'deadline-employee@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('10000000-0000-0000-0000-000000000010', 'Deadline admin', 'deadline-admin@example.test', 'admin'),
  ('10000000-0000-0000-0000-000000000011', 'Deadline employee', 'deadline-employee@example.test', 'employee');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000010', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 'employee');
insert into public.projects (id, studio_id, name, total_area_m2, start_date, created_by) values
  ('10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000001', 'Deadline test project', 1, current_date, '10000000-0000-0000-0000-000000000010');
insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at) values
  ('10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000010', 'designer', 0, current_date),
  ('10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000011', 'designer', 0, current_date);
insert into public.tasks (id, project_id, title, assignee_id, created_by) values
  ('10000000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000020', 'Existing deadline task', '10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000010');
insert into public.task_deadlines (task_id, target_status, due_date) values
  ('10000000-0000-0000-0000-000000000030', 'completed', '2030-01-01');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000010', true);
set local role authenticated;

select lives_ok(
  $$select public.create_task_with_checklist('{"project_id":"10000000-0000-0000-0000-000000000020","title":"Created deadline task","priority":"normal","assignee_id":"10000000-0000-0000-0000-000000000010","collaborator_ids":["10000000-0000-0000-0000-000000000011"],"stage":"stage_1","status":"todo","progress_weight":"2.5","deadlines":[{"target_status":"internal_review","due_date":"2030-02-01"},{"target_status":"review","due_date":"2030-02-03"},{"target_status":"completed","due_date":"2030-02-05"}]}'::jsonb, '[{"title":"First checklist item","weight":2},{"title":"Second checklist item","weight":3}]'::jsonb)$$,
  'an authenticated administrator can create a task with assignee, collaborators, deadlines, and checklist items'
);

select is(
  (select status from public.tasks where title = 'Created deadline task'),
  'todo',
  'authenticated task creation persists the canonical Todo status'
);

select is(
  (select count(*)::integer from public.task_collaborators as collaborator inner join public.tasks as task on task.id = collaborator.task_id where task.title = 'Created deadline task'),
  1,
  'authenticated task creation persists its collaborator'
);

select is(
  (select count(*)::integer from public.task_deadlines as deadline inner join public.tasks as task on task.id = deadline.task_id where task.title = 'Created deadline task'),
  3,
  'authenticated task creation persists every milestone deadline'
);

select is(
  (select count(*)::integer from public.task_checklist_items as item inner join public.tasks as task on task.id = item.task_id where task.title = 'Created deadline task'),
  2,
  'authenticated task creation persists every checklist item'
);

select lives_ok(
  $$select public.create_task_with_checklist('{"project_id":"10000000-0000-0000-0000-000000000020","title":"Created without optional relations","priority":"normal","assignee_id":"10000000-0000-0000-0000-000000000010","collaborator_ids":[],"stage":"stage_2","status":"todo","completed_area_m2":"10","deadlines":[]}'::jsonb, '[]'::jsonb)$$,
  'authenticated task creation accepts empty optional collaborators and deadlines'
);

select lives_ok(
  $$select public.update_task_details_with_collaborators('10000000-0000-0000-0000-000000000030', '{"title":"Existing deadline task","assignee_id":"10000000-0000-0000-0000-000000000010","priority":"normal","completed_area_m2":"","progress_weight":"1","stage":"stage_1"}'::jsonb, '{}'::uuid[])$$,
  'an old authenticated caller omitting p_deadlines still updates task details'
);

select is(
  (select due_date from public.task_deadlines where task_id = '10000000-0000-0000-0000-000000000030' and target_status = 'completed'),
  '2030-01-01'::date,
  'omitted p_deadlines preserves existing milestones'
);

select lives_ok(
  $$select public.update_task_details_with_collaborators('10000000-0000-0000-0000-000000000030', '{"title":"Existing deadline task","assignee_id":"10000000-0000-0000-0000-000000000010","priority":"normal","completed_area_m2":"","progress_weight":"1","stage":"stage_1"}'::jsonb, '{}'::uuid[], '[]'::jsonb)$$,
  'an explicit empty deadline array is accepted'
);

select is((select count(*)::integer from public.task_deadlines where task_id = '10000000-0000-0000-0000-000000000030'), 0, 'an explicit empty array clears milestones');

select lives_ok(
  $$select public.update_task_details_with_collaborators('10000000-0000-0000-0000-000000000030', '{"title":"Existing deadline task","assignee_id":"10000000-0000-0000-0000-000000000010","priority":"normal","completed_area_m2":"","progress_weight":"1","stage":"stage_1"}'::jsonb, '{}'::uuid[], '[{"target_status":"review","due_date":"2030-03-01"}]'::jsonb)$$,
  'an explicit deadline array is accepted'
);

select is((select due_date from public.task_deadlines where task_id = '10000000-0000-0000-0000-000000000030' and target_status = 'review'), '2030-03-01'::date, 'an explicit array replaces milestones');

set local role postgres;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000011', true);
set local role authenticated;

select throws_ok(
  $$select public.update_task_details_with_collaborators('10000000-0000-0000-0000-000000000030', '{"title":"Unauthorized update","assignee_id":"10000000-0000-0000-0000-000000000010","priority":"normal","completed_area_m2":"","progress_weight":"1","stage":"stage_1"}'::jsonb, '{}'::uuid[], '[{"target_status":"completed","due_date":"2030-04-01"}]'::jsonb)$$,
  'Only active studio administrators can edit task details',
  'unauthorized authenticated users cannot alter another task deadline'
);

select throws_like(
  $$select public.create_task_with_checklist('{"project_id":"10000000-0000-0000-0000-000000000020","title":"Unauthorized task","priority":"normal","assignee_id":"10000000-0000-0000-0000-000000000011","collaborator_ids":[],"stage":"stage_1","status":"todo","deadlines":[]}'::jsonb, '[]'::jsonb)$$,
  '%row-level security policy%',
  'unauthorized authenticated users cannot create tasks for projects they cannot edit'
);

select * from finish();
rollback;
