begin;

select plan(14);

insert into public.studios (id, name)
values ('82000000-0000-0000-0000-000000000001', 'Project completion date studio');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('82000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'project-completion-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('82000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'project-completion-employee@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, full_name, email, system_role) values
  ('82000000-0000-0000-0000-000000000010', 'Project completion admin', 'project-completion-admin@example.test', 'admin'),
  ('82000000-0000-0000-0000-000000000011', 'Project completion employee', 'project-completion-employee@example.test', 'employee');

insert into public.studio_members (studio_id, user_id, system_role) values
  ('82000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000010', 'admin'),
  ('82000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000011', 'employee');

insert into public.projects (id, studio_id, name, total_area_m2, status, start_date, created_by)
values ('82000000-0000-0000-0000-000000000020', '82000000-0000-0000-0000-000000000001', 'Historical project', 100, 'active', current_date, '82000000-0000-0000-0000-000000000010');

insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at) values
  ('82000000-0000-0000-0000-000000000020', '82000000-0000-0000-0000-000000000010', 'designer', 0, current_date),
  ('82000000-0000-0000-0000-000000000020', '82000000-0000-0000-0000-000000000011', 'designer', 0, current_date);

select set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select lives_ok(
  $$update public.projects set completed_at = current_date - 30 where id = '82000000-0000-0000-0000-000000000020'$$,
  'an employee cannot see a row eligible for a completion-date update'
);
select is(
  (select completed_at from public.projects where id = '82000000-0000-0000-0000-000000000020'),
  null::date,
  'the employee update does not change the project'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok(
  $$update public.projects set status = 'completed' where id = '82000000-0000-0000-0000-000000000020'$$,
  'normal project completion remains available'
);
select is(
  (select completed_at from public.projects where id = '82000000-0000-0000-0000-000000000020'),
  current_date,
  'normal completion still records today automatically'
);
select is(
  (select count(*)::integer from public.project_activity where project_id = '82000000-0000-0000-0000-000000000020' and action_type = 'project_lifecycle_changed'),
  1,
  'normal completion records one lifecycle event'
);
select lives_ok(
  $$update public.projects set completed_at = '2025-02-14' where id = '82000000-0000-0000-0000-000000000020'$$,
  'an administrator can backdate a completed project'
);
select is(
  (select completed_at from public.projects where id = '82000000-0000-0000-0000-000000000020'),
  '2025-02-14'::date,
  'the corrected authoritative project date persists'
);
select is(
  (select status from public.projects where id = '82000000-0000-0000-0000-000000000020'),
  'completed',
  'the date correction does not reopen the project'
);
select is(
  (select count(*)::integer from public.project_activity where project_id = '82000000-0000-0000-0000-000000000020' and action_type = 'project_lifecycle_changed'),
  1,
  'the correction does not replay project completion activity'
);
select is(
  (select count(*)::integer from public.productivity_attributions where project_id = '82000000-0000-0000-0000-000000000020'),
  0,
  'the correction does not recreate productivity records'
);
select throws_like(
  $$update public.projects set completed_at = current_date + 1 where id = '82000000-0000-0000-0000-000000000020'$$,
  '%Project completion date cannot be in the future%',
  'future completion dates are rejected'
);
select throws_like(
  $$update public.projects set name = 'Changed', completed_at = '2025-02-13' where id = '82000000-0000-0000-0000-000000000020'$$,
  '%Completed and archived project details are read-only%',
  'the correction path does not make completed metadata writable'
);
select is(
  (select name from public.projects where id = '82000000-0000-0000-0000-000000000020'),
  'Historical project',
  'rejected mixed edits leave project metadata unchanged'
);
select is(
  (select completed_at from public.projects where id = '82000000-0000-0000-0000-000000000020'),
  '2025-02-14'::date,
  'rejected edits leave the corrected completion date unchanged'
);

select * from finish();
rollback;
