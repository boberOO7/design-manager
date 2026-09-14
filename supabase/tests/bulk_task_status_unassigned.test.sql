begin;

select plan(11);

insert into public.studios (id, name)
values ('81000000-0000-0000-0000-000000000001', 'Bulk status semantics test studio');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('81000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'bulk-status-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('81000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'bulk-status-valid@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('81000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'bulk-status-inactive@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('81000000-0000-0000-0000-000000000010', 'Bulk status admin', 'bulk-status-admin@example.test', 'admin'),
  ('81000000-0000-0000-0000-000000000011', 'Bulk status valid member', 'bulk-status-valid@example.test', 'employee'),
  ('81000000-0000-0000-0000-000000000012', 'Bulk status inactive member', 'bulk-status-inactive@example.test', 'employee');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000010', 'admin'),
  ('81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000011', 'employee'),
  ('81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000012', 'employee');
insert into public.projects (id, studio_id, name, total_area_m2, status, start_date, created_by)
values ('81000000-0000-0000-0000-000000000020', '81000000-0000-0000-0000-000000000001', 'Bulk status semantics project', 100, 'active', current_date, '81000000-0000-0000-0000-000000000010');
insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at) values
  ('81000000-0000-0000-0000-000000000020', '81000000-0000-0000-0000-000000000010', 'designer', 0, current_date),
  ('81000000-0000-0000-0000-000000000020', '81000000-0000-0000-0000-000000000011', 'designer', 0, current_date),
  ('81000000-0000-0000-0000-000000000020', '81000000-0000-0000-0000-000000000012', 'designer', 0, current_date);
insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('81000000-0000-0000-0000-000000000030', '81000000-0000-0000-0000-000000000020', 'stage_1', 'Single unassigned', 'todo', null, '81000000-0000-0000-0000-000000000010'),
  ('81000000-0000-0000-0000-000000000031', '81000000-0000-0000-0000-000000000020', 'stage_1', 'Bulk one unassigned', 'todo', null, '81000000-0000-0000-0000-000000000010'),
  ('81000000-0000-0000-0000-000000000032', '81000000-0000-0000-0000-000000000020', 'stage_1', 'Bulk many unassigned one', 'todo', null, '81000000-0000-0000-0000-000000000010'),
  ('81000000-0000-0000-0000-000000000033', '81000000-0000-0000-0000-000000000020', 'stage_1', 'Bulk many unassigned two', 'todo', null, '81000000-0000-0000-0000-000000000010'),
  ('81000000-0000-0000-0000-000000000034', '81000000-0000-0000-0000-000000000020', 'stage_1', 'Bulk valid assigned', 'todo', '81000000-0000-0000-0000-000000000011', '81000000-0000-0000-0000-000000000010'),
  ('81000000-0000-0000-0000-000000000035', '81000000-0000-0000-0000-000000000020', 'stage_1', 'Bulk inactive assigned', 'todo', '81000000-0000-0000-0000-000000000012', '81000000-0000-0000-0000-000000000010'),
  ('81000000-0000-0000-0000-000000000036', '81000000-0000-0000-0000-000000000020', 'stage_3', 'Project completion blocker', 'todo', null, '81000000-0000-0000-0000-000000000010'),
  ('81000000-0000-0000-0000-000000000037', '81000000-0000-0000-0000-000000000020', 'stage_1', 'Mixed bulk unassigned', 'todo', null, '81000000-0000-0000-0000-000000000010'),
  ('81000000-0000-0000-0000-000000000038', '81000000-0000-0000-0000-000000000020', 'stage_1', 'Rejected mixed bulk unassigned', 'todo', null, '81000000-0000-0000-0000-000000000010');
update public.profiles set is_active = false where id = '81000000-0000-0000-0000-000000000012';

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000010', true);
set local role authenticated;

select lives_ok(
  $$update public.tasks set status = 'completed' where id = '81000000-0000-0000-0000-000000000030'$$,
  'single-task completion allows unassigned productivity-bearing work'
);
select is((select status from public.tasks where id = '81000000-0000-0000-0000-000000000030'), 'completed', 'single unassigned task is completed');

select lives_ok(
  $$select public.bulk_move_project_tasks('81000000-0000-0000-0000-000000000020', 'stage_1', array['todo'], 'completed', array['81000000-0000-0000-0000-000000000031']::uuid[])$$,
  'bulk completion allows one unassigned productivity-bearing task'
);
select is((select status from public.tasks where id = '81000000-0000-0000-0000-000000000031'), 'completed', 'one unassigned bulk task is completed');

select lives_ok(
  $$select public.bulk_move_project_tasks('81000000-0000-0000-0000-000000000020', 'stage_1', array['todo'], 'completed', array['81000000-0000-0000-0000-000000000032','81000000-0000-0000-0000-000000000033']::uuid[])$$,
  'bulk completion allows multiple unassigned productivity-bearing tasks'
);
select is((select count(*)::integer from public.tasks where id in ('81000000-0000-0000-0000-000000000032','81000000-0000-0000-0000-000000000033') and status = 'completed'), 2, 'every unassigned task in the batch is completed');

select lives_ok(
  $$select public.bulk_move_project_tasks('81000000-0000-0000-0000-000000000020', 'stage_1', array['todo'], 'completed', array['81000000-0000-0000-0000-000000000034','81000000-0000-0000-0000-000000000037']::uuid[])$$,
  'bulk completion allows an active assigned project member alongside an unassigned task'
);
select is((select count(*)::integer from public.tasks where id in ('81000000-0000-0000-0000-000000000034','81000000-0000-0000-0000-000000000037') and status = 'completed'), 2, 'the mixed valid and unassigned batch is completed');
select is((select count(*)::integer from public.productivity_attributions where task_id = '81000000-0000-0000-0000-000000000034' and voided_at is null), 1, 'valid assigned completion retains productivity attribution');

select throws_ok(
  $$select public.bulk_move_project_tasks('81000000-0000-0000-0000-000000000020', 'stage_1', array['todo'], 'completed', array['81000000-0000-0000-0000-000000000035','81000000-0000-0000-0000-000000000038']::uuid[])$$,
  'Productivity-bearing work must be assigned to an active project member before marking this batch complete',
  'bulk completion still rejects an assigned inactive project member'
);
select is((select count(*)::integer from public.tasks where id in ('81000000-0000-0000-0000-000000000035','81000000-0000-0000-0000-000000000038') and status = 'todo'), 2, 'the invalid mixed batch remains unchanged atomically');

select * from finish();
rollback;
