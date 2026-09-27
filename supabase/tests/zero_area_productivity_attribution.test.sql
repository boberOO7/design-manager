begin;

select plan(18);

insert into public.studios (id, name) values ('9a000000-0000-0000-0000-000000000001', 'Zero area productivity studio');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('9a000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'zero-area-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('9a000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'zero-area-employee@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('9a000000-0000-0000-0000-000000000010', 'Zero area admin', 'zero-area-admin@example.test', 'admin'),
  ('9a000000-0000-0000-0000-000000000011', 'Zero area employee', 'zero-area-employee@example.test', 'employee');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000010', 'admin'),
  ('9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000011', 'employee');
insert into public.projects (id, studio_id, name, total_area_m2, status, start_date, created_by)
values ('9a000000-0000-0000-0000-000000000020', '9a000000-0000-0000-0000-000000000001', '20 m2 project', 20, 'active', current_date, '9a000000-0000-0000-0000-000000000010');
insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at) values
  ('9a000000-0000-0000-0000-000000000020', '9a000000-0000-0000-0000-000000000010', 'designer', 0, current_date),
  ('9a000000-0000-0000-0000-000000000020', '9a000000-0000-0000-0000-000000000011', 'designer', 0, current_date);
insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('9a000000-0000-0000-0000-000000000030', '9a000000-0000-0000-0000-000000000020', 'stage_1', 'First Stage 1 task', 'todo', '9a000000-0000-0000-0000-000000000010', '9a000000-0000-0000-0000-000000000010');

select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok($$update public.tasks set status = 'completed' where id = '9a000000-0000-0000-0000-000000000030'$$, 'first task completes');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '9a000000-0000-0000-0000-000000000030' and voided_at is null), 4::numeric, 'first task initially receives the Stage 1 budget');
select is((select allocated_productivity_m2 from public.project_stage_productivity_budgets where project_id = '9a000000-0000-0000-0000-000000000020' and stage = 'stage_1'), 4::numeric, 'Stage 1 budget is exhausted');

set local role postgres;
insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('9a000000-0000-0000-0000-000000000031', '9a000000-0000-0000-0000-000000000020', 'stage_1', 'Later Stage 1 task', 'todo', '9a000000-0000-0000-0000-000000000011', '9a000000-0000-0000-0000-000000000010');
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select lives_ok($$update public.tasks set status = 'completed' where id = '9a000000-0000-0000-0000-000000000031'$$, 'later task completes');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '9a000000-0000-0000-0000-000000000030' and voided_at is null), 2::numeric, 'earlier task rebalances to half the stage budget');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '9a000000-0000-0000-0000-000000000031' and voided_at is null), 2::numeric, 'later task receives half the stage budget');
select is((select count(*)::integer from public.productivity_attributions where task_id = '9a000000-0000-0000-0000-000000000031' and voided_at is null), 1, 'later task contributes one completed-task row');
select is((select sum(credited_area_m2) from public.productivity_attributions where project_id = '9a000000-0000-0000-0000-000000000020' and task_stage = 'stage_1' and voided_at is null), 4::numeric, 'Stage 1 total remains within its budget');
select lives_ok($$update public.tasks set status = 'todo' where id = '9a000000-0000-0000-0000-000000000031'$$, 'later task reopens');
select is((select count(*)::integer from public.productivity_attributions where task_id = '9a000000-0000-0000-0000-000000000031' and voided_at is null), 0, 'reopen removes the active task count');
select lives_ok($$update public.tasks set status = 'completed' where id = '9a000000-0000-0000-0000-000000000031'$$, 'later task recompletes');
select is((select count(*)::integer from public.productivity_attributions where task_id = '9a000000-0000-0000-0000-000000000031' and voided_at is null), 1, 'recompletion restores exactly one active task count');
select is((select count(*)::integer from public.productivity_attributions where task_id = '9a000000-0000-0000-0000-000000000031'), 2, 'voided history remains alongside the new attribution');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '9a000000-0000-0000-0000-000000000031' and voided_at is null), 2::numeric, 'recompletion uses the current stage share');
select is((select allocated_productivity_m2 from public.project_stage_productivity_budgets where project_id = '9a000000-0000-0000-0000-000000000020' and stage = 'stage_1'), 4::numeric, 'recompletion does not increase the stage budget');

set local role postgres;
insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('9a000000-0000-0000-0000-000000000032', '9a000000-0000-0000-0000-000000000020', 'stage_2', 'Unassigned task', 'todo', null, '9a000000-0000-0000-0000-000000000010');
update public.tasks set status = 'completed' where id = '9a000000-0000-0000-0000-000000000032';
select is((select count(*)::integer from public.productivity_attributions where task_id = '9a000000-0000-0000-0000-000000000032'), 0, 'unassigned zero-area completion stays unattributed');

insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('9a000000-0000-0000-0000-000000000033', '9a000000-0000-0000-0000-000000000020', 'stage_2', 'Assigned zero-area task', 'todo', '9a000000-0000-0000-0000-000000000011', '9a000000-0000-0000-0000-000000000010'),
  ('9a000000-0000-0000-0000-000000000034', '9a000000-0000-0000-0000-000000000020', 'stage_2', 'Ineligible zero-area task', 'todo', '9a000000-0000-0000-0000-000000000011', '9a000000-0000-0000-0000-000000000010');
update public.tasks set status = 'completed' where id = '9a000000-0000-0000-0000-000000000033';
select is((select credited_area_m2 from public.productivity_attributions where task_id = '9a000000-0000-0000-0000-000000000033' and voided_at is null), 0::numeric, 'eligible assigned Stage 2 task with no area also counts');
update public.profiles set is_active = false where id = '9a000000-0000-0000-0000-000000000011';
update public.tasks set status = 'completed' where id = '9a000000-0000-0000-0000-000000000034';
select is((select count(*)::integer from public.productivity_attributions where task_id = '9a000000-0000-0000-0000-000000000034'), 0, 'ineligible assigned zero-area completion stays unattributed');

select * from finish();
rollback;
