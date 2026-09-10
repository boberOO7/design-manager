begin;
select plan(6);

insert into public.studios (id, name) values ('92000000-0000-0000-0000-000000000001', 'Deadline history studio');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('92000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'history-admin@example.test', '{}', '{}', now(), now()),
  ('92000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'history-employee@example.test', '{}', '{}', now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('92000000-0000-0000-0000-000000000010', 'History admin', 'history-admin@example.test', 'admin'),
  ('92000000-0000-0000-0000-000000000011', 'History employee', 'history-employee@example.test', 'employee');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000010', 'admin'),
  ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000011', 'employee');
insert into public.projects (id, studio_id, name, total_area_m2, start_date, created_by) values
  ('92000000-0000-0000-0000-000000000020', '92000000-0000-0000-0000-000000000001', 'Deadline history project', 1, current_date, '92000000-0000-0000-0000-000000000010');
insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at) values
  ('92000000-0000-0000-0000-000000000020', '92000000-0000-0000-0000-000000000011', 'designer', 0, current_date);
insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('92000000-0000-0000-0000-000000000030', '92000000-0000-0000-0000-000000000020', 'stage_1', 'Deadline history task', 'in_progress', '92000000-0000-0000-0000-000000000011', '92000000-0000-0000-0000-000000000010');
insert into public.task_deadlines (task_id, target_status, due_date) values
  ('92000000-0000-0000-0000-000000000030', 'internal_review', current_date - 1),
  ('92000000-0000-0000-0000-000000000030', 'review', current_date + 1);

select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select lives_ok($$update public.tasks set status = 'internal_review' where id = '92000000-0000-0000-0000-000000000030'$$, 'employee reaches the overdue milestone');
select is((select due_date from public.task_deadline_completions where task_id = '92000000-0000-0000-0000-000000000030' and target_status = 'internal_review' and voided_at is null), current_date - 1, 'completion snapshots the deadline that was in force');
select ok((select completed_on > due_date from public.task_deadline_completions where task_id = '92000000-0000-0000-0000-000000000030' and target_status = 'internal_review' and voided_at is null), 'snapshot records the completion as late');

set local role postgres;
update public.task_deadlines set due_date = current_date + 10 where task_id = '92000000-0000-0000-0000-000000000030' and target_status = 'internal_review';
select is((select due_date from public.task_deadline_completions where task_id = '92000000-0000-0000-0000-000000000030' and target_status = 'internal_review' and voided_at is null), current_date - 1, 'later deadline edits do not rewrite the completion snapshot');

select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select lives_ok($$update public.tasks set status = 'in_progress' where id = '92000000-0000-0000-0000-000000000030'$$, 'employee reopens the milestone');
select is((select count(*)::integer from public.task_deadline_completions where task_id = '92000000-0000-0000-0000-000000000030' and target_status = 'internal_review' and voided_at is null), 0, 'reopen voids the active completion snapshot without deleting history');

select * from finish();
rollback;
