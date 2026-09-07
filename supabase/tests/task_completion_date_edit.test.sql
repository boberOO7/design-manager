begin;

select plan(13);

insert into public.studios (id, name)
values ('50000000-0000-0000-0000-000000000001', 'Completion date test studio');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('50000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'completion-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('50000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'completion-employee@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, full_name, email, system_role) values
  ('50000000-0000-0000-0000-000000000010', 'Completion admin', 'completion-admin@example.test', 'admin'),
  ('50000000-0000-0000-0000-000000000011', 'Completion employee', 'completion-employee@example.test', 'employee');

insert into public.studio_members (studio_id, user_id, system_role) values
  ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000010', 'admin'),
  ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000011', 'employee');

insert into public.projects (id, studio_id, name, total_area_m2, status, start_date, created_by)
values ('50000000-0000-0000-0000-000000000020', '50000000-0000-0000-0000-000000000001', 'Completion project', 100, 'active', current_date, '50000000-0000-0000-0000-000000000010');

insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at) values
  ('50000000-0000-0000-0000-000000000020', '50000000-0000-0000-0000-000000000010', 'designer', 0, current_date),
  ('50000000-0000-0000-0000-000000000020', '50000000-0000-0000-0000-000000000011', 'designer', 0, current_date);

insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('50000000-0000-0000-0000-000000000030', '50000000-0000-0000-0000-000000000020', 'stage_1', 'Completed production', 'todo', '50000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000010'),
  ('50000000-0000-0000-0000-000000000031', '50000000-0000-0000-0000-000000000020', 'stage_4', 'Open operations', 'todo', '50000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000010');

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select lives_ok(
  $$update public.tasks set status = 'completed' where id = '50000000-0000-0000-0000-000000000030'$$,
  'normal completion remains available to the assignee'
);
select is(
  (select completed_at from public.tasks where id = '50000000-0000-0000-0000-000000000030'),
  current_date,
  'normal completion still records today automatically'
);
select is(
  (select completed_at from public.productivity_attributions where task_id = '50000000-0000-0000-0000-000000000030' and voided_at is null),
  current_date::timestamp at time zone 'Europe/Kyiv',
  'normal completion creates an attribution in the current period'
);
select throws_like(
  $$update public.tasks set completed_at = current_date - 30 where id = '50000000-0000-0000-0000-000000000030'$$,
  '%permission denied%',
  'employees cannot change the completion date directly'
);
select throws_like(
  $$select public.update_task_details_with_collaborators('50000000-0000-0000-0000-000000000030', '{"completed_at":"2025-02-14"}'::jsonb)$$,
  '%Only active studio administrators can edit task details%',
  'employees cannot use the completion-date path in the task-details RPC'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok(
  $$select public.update_task_details_with_collaborators('50000000-0000-0000-0000-000000000030', '{"title":"Completed production","assignee_id":"50000000-0000-0000-0000-000000000011","priority":"normal","completed_area_m2":"","progress_weight":"1","stage":"stage_1","completed_at":"2025-02-14"}'::jsonb, '{}'::uuid[], '[]'::jsonb)$$,
  'an administrator can backdate a completed task'
);
select is(
  (select completed_at from public.tasks where id = '50000000-0000-0000-0000-000000000030'),
  '2025-02-14'::date,
  'the corrected authoritative task date persists'
);
select is(
  (select completed_at from public.productivity_attributions where task_id = '50000000-0000-0000-0000-000000000030' and voided_at is null),
  '2025-02-14'::date::timestamp at time zone 'Europe/Kyiv',
  'the active attribution moves to the corrected Kyiv period'
);
select throws_like(
  $$select public.update_task_details_with_collaborators('50000000-0000-0000-0000-000000000030', jsonb_build_object('completed_at', current_date + 1))$$,
  '%Task completion date cannot be in the future%',
  'future completion dates are rejected'
);
select throws_like(
  $$select public.update_task_details_with_collaborators('50000000-0000-0000-0000-000000000031', jsonb_build_object('completed_at', current_date - 30))$$,
  '%Only completed tasks may have a completion date%',
  'open tasks cannot receive a manual completion date'
);
select is(
  (select count(*)::integer from public.project_activity where entity_id = '50000000-0000-0000-0000-000000000030' and changes -> 'completed_at' ->> 'to' = '2025-02-14'),
  1,
  'the manual correction is recorded in project activity history'
);
select lives_ok(
  $$update public.projects set status = 'completed' where id = '50000000-0000-0000-0000-000000000020'; select public.update_task_details_with_collaborators('50000000-0000-0000-0000-000000000030', '{"completed_at":"2025-02-13"}'::jsonb)$$,
  'an administrator can correct a Done task after its project is completed'
);
select is(
  (select completed_at from public.productivity_attributions where task_id = '50000000-0000-0000-0000-000000000030' and voided_at is null),
  '2025-02-13'::date::timestamp at time zone 'Europe/Kyiv',
  'the completed-project correction still moves the attribution period'
);

select * from finish();
rollback;
