begin;

select plan(18);

insert into public.studios (id, name) values ('40000000-0000-0000-0000-000000000001', 'Stage four test studio');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('40000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'stage-four-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('40000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'stage-four-employee@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('40000000-0000-0000-0000-000000000010', 'Stage four admin', 'stage-four-admin@example.test', 'admin'),
  ('40000000-0000-0000-0000-000000000011', 'Stage four employee', 'stage-four-employee@example.test', 'employee');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000010', 'admin'),
  ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000011', 'employee');
insert into public.projects (id, studio_id, name, total_area_m2, status, start_date, created_by)
values ('40000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000001', 'Stage four project', 100, 'active', current_date, '40000000-0000-0000-0000-000000000010');
insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at) values
  ('40000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000010', 'designer', 0, current_date),
  ('40000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000011', 'designer', 0, current_date);
insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by, completed_at) values
  ('40000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000020', 'stage_1', 'Finished production', 'completed', '40000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000010', current_date),
  ('40000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000020', 'stage_4', 'Open operations', 'todo', '40000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000010', null);

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok($$update public.projects set status = 'completed' where id = '40000000-0000-0000-0000-000000000020'$$, 'open Stage 4 work does not block project completion');
select is((select status from public.projects where id = '40000000-0000-0000-0000-000000000020'), 'completed', 'the project remains completed');
select lives_ok(
  $$select public.create_task_with_checklist('{"project_id":"40000000-0000-0000-0000-000000000020","title":"Created after completion","priority":"normal","assignee_id":"40000000-0000-0000-0000-000000000011","collaborator_ids":[],"stage":"stage_4","deadlines":[]}'::jsonb, '[]'::jsonb)$$,
  'an administrator can create Stage 4 work after completion'
);
select throws_like(
  $$select public.create_task_with_checklist('{"project_id":"40000000-0000-0000-0000-000000000020","title":"Blocked production","priority":"normal","assignee_id":"40000000-0000-0000-0000-000000000010","collaborator_ids":[],"stage":"stage_3","deadlines":[]}'::jsonb, '[]'::jsonb)$$,
  '%row-level security policy%', 'production task creation stays blocked after completion'
);
select lives_ok(
  $$select public.update_task_details_with_collaborators('40000000-0000-0000-0000-000000000031', '{"title":"Edited operations","assignee_id":"40000000-0000-0000-0000-000000000011","priority":"high","completed_area_m2":"","progress_weight":"1","stage":"stage_4"}'::jsonb, '{}'::uuid[], '[]'::jsonb)$$,
  'Stage 4 details and assignment remain editable after completion'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select lives_ok($$update public.tasks set status = 'in_progress' where id = '40000000-0000-0000-0000-000000000031'$$, 'the assignee can progress Stage 4 work');
select lives_ok($$update public.tasks set status = 'completed' where id = '40000000-0000-0000-0000-000000000031'$$, 'the assignee can complete Stage 4 work');
select is((select status from public.projects where id = '40000000-0000-0000-0000-000000000020'), 'completed', 'Stage 4 completion does not reopen the project');
select is((select productivity_area_m2 from public.tasks where id = '40000000-0000-0000-0000-000000000031'), null::numeric, 'Stage 4 stores no productivity-area snapshot');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '40000000-0000-0000-0000-000000000031' and voided_at is null), 0::numeric, 'Stage 4 contributes exactly zero square metres');
select is((select task_stage from public.productivity_attributions where task_id = '40000000-0000-0000-0000-000000000031' and voided_at is null), 'stage_4', 'the task-count event snapshots stage identity, not area');
select is((select count(*)::integer from public.productivity_attributions where task_id = '40000000-0000-0000-0000-000000000031' and source_type = 'task' and voided_at is null), 1, 'Stage 4 contributes one completed-task count row');
select lives_ok($$update public.tasks set status = 'todo' where id = '40000000-0000-0000-0000-000000000031'$$, 'the assignee can reopen Stage 4 work');
select is((select count(*)::integer from public.productivity_attributions where task_id = '40000000-0000-0000-0000-000000000031' and source_type = 'task' and voided_at is null), 0, 'reopening voids the active completed-task count');
select lives_ok($$update public.tasks set status = 'completed' where id = '40000000-0000-0000-0000-000000000031'$$, 'the assignee can complete reopened Stage 4 work again');

set local role postgres;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000010', true);
set local role authenticated;
update public.tasks set status = 'todo' where id = '40000000-0000-0000-0000-000000000030';
select is(
  (select status from public.tasks where id = '40000000-0000-0000-0000-000000000030'),
  'completed', 'completed production tasks remain protected'
);
select lives_ok(
  $$update public.projects set status = 'archived', archived_at = current_date where id = '40000000-0000-0000-0000-000000000020'$$,
  'the established archive transition remains available'
);
update public.tasks set status = 'todo' where id = '40000000-0000-0000-0000-000000000031';
select is(
  (select status from public.tasks where id = '40000000-0000-0000-0000-000000000031'),
  'completed', 'archived Stage 4 tasks remain read-only'
);

select * from finish();
rollback;
