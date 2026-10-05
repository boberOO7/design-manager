begin;

select no_plan();

insert into public.studios (id, name)
values ('83000000-0000-0000-0000-000000000001', 'Project actual-start date studio');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('83000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'project-actual-start-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('83000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'project-actual-start-employee@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, full_name, email, system_role) values
  ('83000000-0000-0000-0000-000000000010', 'Project actual-start admin', 'project-actual-start-admin@example.test', 'admin'),
  ('83000000-0000-0000-0000-000000000011', 'Project actual-start employee', 'project-actual-start-employee@example.test', 'employee');

insert into public.studio_members (studio_id, user_id, system_role) values
  ('83000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000010', 'admin'),
  ('83000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000011', 'employee');

insert into public.projects (id, studio_id, name, total_area_m2, status, created_by) values
  ('83000000-0000-0000-0000-000000000020', '83000000-0000-0000-0000-000000000001', 'Start fixture', 100, 'planned', '83000000-0000-0000-0000-000000000010'),
  ('83000000-0000-0000-0000-000000000021', '83000000-0000-0000-0000-000000000001', 'Legacy fixture', 100, 'active', '83000000-0000-0000-0000-000000000010'),
  ('83000000-0000-0000-0000-000000000022', '83000000-0000-0000-0000-000000000001', 'Employee activation fixture', 100, 'planned', '83000000-0000-0000-0000-000000000010');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
select id,'83000000-0000-0000-0000-000000000011','designer',0,current_date from public.projects where studio_id='83000000-0000-0000-0000-000000000001';
insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by)
values ('83000000-0000-0000-0000-000000000030','83000000-0000-0000-0000-000000000022','Activation task','stage_1','todo','normal','83000000-0000-0000-0000-000000000011','83000000-0000-0000-0000-000000000010');

select is((select started_at from public.projects where id='83000000-0000-0000-0000-000000000021'),null::date,'legacy starts remain unknown');
select is((select start_date from public.projects where id='83000000-0000-0000-0000-000000000020'),null::date,'planned start may be unset');
select set_config('request.jwt.claim.sub','83000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$update public.projects set status='active' where id='83000000-0000-0000-0000-000000000020'$$,'start action succeeds without an actual start');
select is((select started_at from public.projects where id='83000000-0000-0000-0000-000000000020'),(now() at time zone 'Europe/Kyiv')::date,'start records the actual Kyiv date');
select lives_ok($$update public.projects set started_at='2020-01-01' where id='83000000-0000-0000-0000-000000000020'$$,'admin corrects actual start');
select lives_ok($$update public.projects set start_date=current_date+10 where id='83000000-0000-0000-0000-000000000020'$$,'planned start remains independent');
select is((select started_at from public.projects where id='83000000-0000-0000-0000-000000000020'),'2020-01-01'::date,'planned changes preserve actual start');
update public.projects set status='paused' where id='83000000-0000-0000-0000-000000000020';
update public.projects set status='planned' where id='83000000-0000-0000-0000-000000000020';
select lives_ok($$update public.projects set status='active' where id='83000000-0000-0000-0000-000000000020'$$,'start action succeeds with an existing actual start');
select is((select started_at from public.projects where id='83000000-0000-0000-0000-000000000020'),'2020-01-01'::date,'start preserves the existing actual start');
select throws_like($$update public.projects set started_at=current_date+1 where id='83000000-0000-0000-0000-000000000020'$$,'%actual start date cannot be in the future%','future actual starts rejected');
update public.projects set status='completed' where id='83000000-0000-0000-0000-000000000020';
select is((select completed_at from public.projects where id='83000000-0000-0000-0000-000000000020'),current_date,'completion still records today');
select lives_ok($$update public.projects set completed_at='2025-03-12' where id='83000000-0000-0000-0000-000000000020'$$,'completion remains admin editable');
select lives_ok($$update public.projects set started_at='2019-01-01' where id='83000000-0000-0000-0000-000000000020'$$,'completed project permits historical start correction');
select throws_like($$update public.projects set started_at='2025-03-13' where id='83000000-0000-0000-0000-000000000020'$$,'%projects_actual_date_order%','start after completion rejected');
select throws_like($$update public.projects set completed_at='2018-12-31' where id='83000000-0000-0000-0000-000000000020'$$,'%projects_actual_date_order%','completion before start rejected');
select is((select count(*)::integer from public.project_activity where project_id='83000000-0000-0000-0000-000000000020' and action_type='project_lifecycle_changed'),5,'corrections do not replay lifecycle events');
select ok(exists(select 1 from public.project_activity where project_id='83000000-0000-0000-0000-000000000020' and action_type='project_updated' and changes->'started_at'->>'to'='2019-01-01'),'historical corrections are audited');
update public.projects set status='archived',archived_at=current_date where id='83000000-0000-0000-0000-000000000020';
select lives_ok($$update public.projects set started_at='2018-01-01' where id='83000000-0000-0000-0000-000000000020'$$,'admin can correct an archived historical start');
select is((select completed_at from public.projects where id='83000000-0000-0000-0000-000000000020'),'2025-03-12'::date,'archive/start correction preserves completion');
select throws_like($$update public.projects set completed_at='2025-03-10' where id='83000000-0000-0000-0000-000000000020'$$,'%Archived projects are read-only%','archived completion permissions remain unchanged');

reset role;
select set_config('request.jwt.claim.sub','83000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select lives_ok($$update public.projects set started_at='2020-01-01' where id='83000000-0000-0000-0000-000000000021'$$,'employee update is filtered by RLS');
select is((select started_at from public.projects where id='83000000-0000-0000-0000-000000000021'),null::date,'employee cannot change historical start');
select lives_ok($$update public.tasks set status='in_progress' where id='83000000-0000-0000-0000-000000000030'$$,'employee task progress still activates the project');
select is((select started_at from public.projects where id='83000000-0000-0000-0000-000000000022'),(now() at time zone 'Europe/Kyiv')::date,'task-driven start records actual date');
reset role;
select set_config('request.jwt.claim.sub','83000000-0000-0000-0000-000000000010',true);
set local role authenticated;
-- A session date ahead of Kyiv must not change either lifecycle date.
set local time zone 'Pacific/Kiritimati';
update public.projects set status='completed' where id='83000000-0000-0000-0000-000000000021';
select is((select completed_at from public.projects where id='83000000-0000-0000-0000-000000000021'),(now() at time zone 'Europe/Kyiv')::date,'completion uses the same Kyiv day as actual start regardless of session timezone');
select * from finish();
rollback;
