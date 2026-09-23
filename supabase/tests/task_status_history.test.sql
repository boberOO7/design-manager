begin;
select plan(14);

insert into public.studios (id, name) values
  ('93000000-0000-0000-0000-000000000001', 'Task status history studio');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('93000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'status-history-admin@example.test', '{}', '{}', now(), now()),
  ('93000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'status-history-employee@example.test', '{}', '{}', now(), now()),
  ('93000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'status-history-outsider@example.test', '{}', '{}', now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('93000000-0000-0000-0000-000000000010', 'Status history admin', 'status-history-admin@example.test', 'admin'),
  ('93000000-0000-0000-0000-000000000011', 'Status history employee', 'status-history-employee@example.test', 'employee'),
  ('93000000-0000-0000-0000-000000000012', 'Status history outsider', 'status-history-outsider@example.test', 'employee');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('93000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000010', 'admin'),
  ('93000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000011', 'employee'),
  ('93000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000012', 'employee');
insert into public.projects (id, studio_id, name, total_area_m2, status, start_date, created_by) values
  ('93000000-0000-0000-0000-000000000020', '93000000-0000-0000-0000-000000000001', 'Task status history project', 0, 'active', current_date, '93000000-0000-0000-0000-000000000010');
insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at) values
  ('93000000-0000-0000-0000-000000000020', '93000000-0000-0000-0000-000000000011', 'designer', 0, current_date);
insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('93000000-0000-0000-0000-000000000030', '93000000-0000-0000-0000-000000000020', 'stage_1', 'History task', 'todo', '93000000-0000-0000-0000-000000000011', '93000000-0000-0000-0000-000000000010'),
  ('93000000-0000-0000-0000-000000000031', '93000000-0000-0000-0000-000000000020', 'stage_1', 'Legacy task', 'in_progress', '93000000-0000-0000-0000-000000000011', '93000000-0000-0000-0000-000000000010');

select is(
  (select count(*)::integer from public.task_status_periods where task_id = '93000000-0000-0000-0000-000000000030' and status = 'todo'),
  1,
  'new tasks start a todo period'
);

select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select lives_ok(
  $$update public.tasks set status = 'in_progress' where id = '93000000-0000-0000-0000-000000000030'$$,
  'todo to work succeeds'
);
select is(
  (select count(*)::integer from public.task_status_periods where task_id = '93000000-0000-0000-0000-000000000030' and status = 'in_progress' and exited_at is null),
  1,
  'todo to work starts an open work period'
);
select ok(
  (select exited_at is not null from public.task_status_periods where task_id = '93000000-0000-0000-0000-000000000030' and status = 'todo'),
  'todo remains as a closed historical period'
);

select lives_ok(
  $$update public.tasks set status = 'review' where id = '93000000-0000-0000-0000-000000000030'$$,
  'work to review succeeds'
);
select ok(
  (select exited_at = (select entered_at from public.task_status_periods where task_id = '93000000-0000-0000-0000-000000000030' and status = 'review')
   from public.task_status_periods where task_id = '93000000-0000-0000-0000-000000000030' and status = 'in_progress'),
  'review starts when the preserved work period ends'
);

select lives_ok(
  $$update public.tasks set status = 'in_progress' where id = '93000000-0000-0000-0000-000000000030'$$,
  'review to work succeeds'
);
select is(
  (select count(*)::integer from public.task_status_periods where task_id = '93000000-0000-0000-0000-000000000030' and status = 'in_progress'),
  2,
  're-entering work creates a second period'
);
select is(
  (select count(*)::integer from public.task_status_periods where task_id = '93000000-0000-0000-0000-000000000030' and exited_at is null),
  1,
  'only the current work period remains open'
);

create temporary table period_count_before_noop as
select count(*)::integer as value
from public.task_status_periods
where task_id = '93000000-0000-0000-0000-000000000030';
select lives_ok(
  $$update public.tasks set status = 'in_progress' where id = '93000000-0000-0000-0000-000000000030'$$,
  'a no-op status save succeeds'
);
select is(
  (select count(*)::integer from public.task_status_periods where task_id = '93000000-0000-0000-0000-000000000030'),
  (select value from period_count_before_noop),
  'a no-op status save creates no period'
);

set local role postgres;
delete from public.task_status_periods where task_id = '93000000-0000-0000-0000-000000000031';
select is(
  (select count(*)::integer from public.task_status_periods where task_id = '93000000-0000-0000-0000-000000000031'),
  0,
  'a legacy task without authoritative history has unknown current-status age'
);
select ok(
  not has_table_privilege('authenticated', 'public.task_status_periods', 'insert,update,delete'),
  'status periods are immutable through the Data API'
);

select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000012', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.task_status_periods where task_id = '93000000-0000-0000-0000-000000000030'),
  0,
  'a studio member outside the project cannot read task status history'
);

select * from finish();
rollback;
