begin;

select plan(22);

select ok(
  has_function_privilege('authenticated', 'public.apply_project_template_stage(uuid, uuid, text, text)', 'execute'),
  'authenticated callers can apply a project template stage'
);
select ok(
  not has_function_privilege('anon', 'public.apply_project_template_stage(uuid, uuid, text, text)', 'execute'),
  'anonymous callers cannot apply a project template stage'
);
select ok(
  not has_function_privilege('authenticated', 'private.copy_project_template_stage_tasks(uuid, uuid, text, text, uuid)', 'execute'),
  'the shared template task copy helper remains private'
);

insert into public.studios (id, name) values
  ('76000000-0000-0000-0000-000000000001', 'Template stage studio A'),
  ('76000000-0000-0000-0000-000000000002', 'Template stage studio B');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('76000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'template-stage-admin-a@example.test', '{}', '{}', now(), now()),
  ('76000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'template-stage-employee@example.test', '{}', '{}', now(), now()),
  ('76000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'template-stage-admin-b@example.test', '{}', '{}', now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('76000000-0000-0000-0000-000000000010', 'Template stage admin A', 'template-stage-admin-a@example.test', 'admin'),
  ('76000000-0000-0000-0000-000000000011', 'Template stage employee', 'template-stage-employee@example.test', 'employee'),
  ('76000000-0000-0000-0000-000000000012', 'Template stage admin B', 'template-stage-admin-b@example.test', 'admin');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('76000000-0000-0000-0000-000000000001', '76000000-0000-0000-0000-000000000010', 'admin'),
  ('76000000-0000-0000-0000-000000000001', '76000000-0000-0000-0000-000000000011', 'employee'),
  ('76000000-0000-0000-0000-000000000002', '76000000-0000-0000-0000-000000000012', 'admin');
insert into public.projects (id, studio_id, name, project_type, total_area_m2, status, start_date, completed_at, created_by) values
  ('76000000-0000-0000-0000-000000000020', '76000000-0000-0000-0000-000000000001', 'Existing empty-first project', 'private', 100, 'active', current_date, null, '76000000-0000-0000-0000-000000000010'),
  ('76000000-0000-0000-0000-000000000021', '76000000-0000-0000-0000-000000000001', 'Completed project', 'private', 50, 'completed', current_date, current_date, '76000000-0000-0000-0000-000000000010');
insert into public.tasks (id, project_id, title, status, created_by, stage) values
  ('76000000-0000-0000-0000-000000000030', '76000000-0000-0000-0000-000000000020', 'Existing destination task', 'todo', '76000000-0000-0000-0000-000000000010', 'stage_1'),
  ('76000000-0000-0000-0000-000000000031', '76000000-0000-0000-0000-000000000020', 'Unrelated stage task', 'todo', '76000000-0000-0000-0000-000000000010', 'stage_3');
insert into public.project_templates (id, studio_id, project_type, name, is_active, is_default, created_by) values
  ('76000000-0000-0000-0000-000000000040', '76000000-0000-0000-0000-000000000001', 'private', 'Active source template', true, true, '76000000-0000-0000-0000-000000000010'),
  ('76000000-0000-0000-0000-000000000041', '76000000-0000-0000-0000-000000000001', 'private', 'Inactive source template', false, false, '76000000-0000-0000-0000-000000000010'),
  ('76000000-0000-0000-0000-000000000042', '76000000-0000-0000-0000-000000000002', 'private', 'Other studio template', true, true, '76000000-0000-0000-0000-000000000012');
insert into public.project_template_tasks (id, template_id, stage, title, priority, position) values
  ('76000000-0000-0000-0000-000000000050', '76000000-0000-0000-0000-000000000040', 'stage_1', 'Template one', 'urgent', 0),
  ('76000000-0000-0000-0000-000000000051', '76000000-0000-0000-0000-000000000040', 'stage_2', 'Template two A', 'high', 0),
  ('76000000-0000-0000-0000-000000000052', '76000000-0000-0000-0000-000000000040', 'stage_2', 'Template two B', 'low', 1),
  ('76000000-0000-0000-0000-000000000053', '76000000-0000-0000-0000-000000000040', 'stage_3', 'Template three', 'normal', 0),
  ('76000000-0000-0000-0000-000000000054', '76000000-0000-0000-0000-000000000041', 'stage_1', 'Inactive task', 'normal', 0),
  ('76000000-0000-0000-0000-000000000055', '76000000-0000-0000-0000-000000000042', 'stage_1', 'Other studio task', 'normal', 0);

select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000010', true);
set local role authenticated;

select is(
  public.apply_project_template_stage(
    '76000000-0000-0000-0000-000000000020',
    '76000000-0000-0000-0000-000000000040',
    'stage_1',
    'stage_4'
  ),
  1,
  'a template stage can populate an empty destination stage'
);
select is(
  (select count(*)::integer from public.tasks where project_id = '76000000-0000-0000-0000-000000000020' and stage = 'stage_4' and title = 'Template one'),
  1,
  'the copied task keeps its source title and receives the destination identity'
);
select is(
  public.apply_project_template_stage(
    '76000000-0000-0000-0000-000000000020',
    '76000000-0000-0000-0000-000000000040',
    'stage_2',
    'stage_1'
  ),
  2,
  'a different source stage can be mapped into an existing destination stage'
);
select is(
  (select count(*)::integer from public.tasks where id = '76000000-0000-0000-0000-000000000030'),
  1,
  'the existing destination-stage task remains untouched'
);
select is(
  (select count(*)::integer from public.tasks where id = '76000000-0000-0000-0000-000000000031' and stage = 'stage_3'),
  1,
  'an unrelated project stage remains untouched'
);
select is(
  (select count(*)::integer from public.tasks where project_id = '76000000-0000-0000-0000-000000000020' and title in ('Template two A', 'Template two B') and stage = 'stage_1' and status = 'todo' and priority = 'normal' and assignee_id is null and created_by = '76000000-0000-0000-0000-000000000010'),
  2,
  'copied tasks keep the full-template defaults and normalized priority'
);
select is(
  (select count(*)::integer from public.tasks where project_id = '76000000-0000-0000-0000-000000000020' and title in ('Template two A', 'Template two B') and stage = 'stage_2'),
  0,
  'the source stage does not overwrite the chosen destination stage'
);
select is(
  public.apply_project_template_stage(
    '76000000-0000-0000-0000-000000000020',
    '76000000-0000-0000-0000-000000000040',
    'stage_2',
    'stage_1'
  ),
  2,
  'reapplying appends instead of replacing or deduplicating by title'
);
select is(
  (select count(*)::integer from public.tasks where project_id = '76000000-0000-0000-0000-000000000020' and title in ('Template two A', 'Template two B') and stage = 'stage_1'),
  4,
  'reapplication preserves every existing and previously copied task'
);
select lives_ok($$
  select public.create_project_from_template(
    '{"studio_id":"76000000-0000-0000-0000-000000000001","name":"Full template regression","project_type":"private","country_code":"UA","total_area_m2":80,"priority":"normal","start_date":"2026-09-16"}'::jsonb,
    '[]'::jsonb,
    '76000000-0000-0000-0000-000000000040'
  )
$$, 'full-template project creation still succeeds through the shared copy helper');
select is(
  (select count(*)::integer from public.tasks where project_id = (select id from public.projects where name = 'Full template regression')),
  4,
  'full-template creation still copies every template task'
);
select is(
  (select count(*)::integer from public.tasks where project_id = (select id from public.projects where name = 'Full template regression') and ((title = 'Template one' and stage = 'stage_1') or (title in ('Template two A', 'Template two B') and stage = 'stage_2') or (title = 'Template three' and stage = 'stage_3'))),
  4,
  'full-template creation preserves each source stage mapping'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select throws_like(
  $$select public.apply_project_template_stage('76000000-0000-0000-0000-000000000020', '76000000-0000-0000-0000-000000000040', 'stage_1', 'stage_2')$$,
  '%administrators%',
  'an employee cannot apply a project template stage'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000012', true);
set local role authenticated;
select throws_like(
  $$select public.apply_project_template_stage('76000000-0000-0000-0000-000000000020', '76000000-0000-0000-0000-000000000042', 'stage_1', 'stage_2')$$,
  '%administrators%',
  'an administrator from another studio cannot change the project'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select throws_like(
  $$select public.apply_project_template_stage('76000000-0000-0000-0000-000000000020', '76000000-0000-0000-0000-000000000042', 'stage_1', 'stage_2')$$,
  '%this studio%',
  'a template from another studio cannot be applied'
);
select throws_like(
  $$select public.apply_project_template_stage('76000000-0000-0000-0000-000000000020', '76000000-0000-0000-0000-000000000041', 'stage_1', 'stage_2')$$,
  '%active project template%',
  'an inactive template cannot be applied'
);
select throws_like(
  $$select public.apply_project_template_stage('76000000-0000-0000-0000-000000000020', '76000000-0000-0000-0000-000000000040', 'stage_4', 'stage_2')$$,
  '%has no tasks%',
  'an empty source stage is rejected without changing the project'
);
select throws_like(
  $$select public.apply_project_template_stage('76000000-0000-0000-0000-000000000021', '76000000-0000-0000-0000-000000000040', 'stage_1', 'stage_1')$$,
  '%read-only%',
  'completed production stages remain read-only'
);
select is(
  public.apply_project_template_stage(
    '76000000-0000-0000-0000-000000000021',
    '76000000-0000-0000-0000-000000000040',
    'stage_1',
    'stage_4'
  ),
  1,
  'completed projects still accept template tasks in writable Stage 4'
);

select * from finish();
rollback;
