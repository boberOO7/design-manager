begin;

select no_plan();

insert into public.studios (id, name)
values ('84000000-0000-0000-0000-000000000001', 'Project actual-start-backfill date studio');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('84000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'project-actual-start-backfill-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('84000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'project-actual-start-backfill-employee@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, full_name, email, system_role) values
  ('84000000-0000-0000-0000-000000000010', 'Project actual-start-backfill admin', 'project-actual-start-backfill-admin@example.test', 'admin'),
  ('84000000-0000-0000-0000-000000000011', 'Project actual-start-backfill employee', 'project-actual-start-backfill-employee@example.test', 'employee');

insert into public.studio_members (studio_id, user_id, system_role) values
  ('84000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000010', 'admin'),
  ('84000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000011', 'employee');

-- Explicit legacy fixtures, including ambiguous and contradictory states.
insert into public.projects (studio_id, name, total_area_m2, status, start_date, started_at, completed_at, archived_at, created_by)
select '84000000-0000-0000-0000-000000000001', name, 100, status,
  (now() at time zone 'Europe/Kyiv')::date + planned_offset,
  (now() at time zone 'Europe/Kyiv')::date + actual_offset,
  (now() at time zone 'Europe/Kyiv')::date + completion_offset,
  case when status='archived' then (now() at time zone 'Europe/Kyiv')::date else null end,
  '84000000-0000-0000-0000-000000000010'
from (values
  ('Active valid', 'active', -100, null::integer, null::integer),
  ('Paused valid', 'paused', -60, null, null),
  ('Completed valid', 'completed', -40, null, -10),
  ('Same-day valid', 'completed', -10, null, -10),
  ('Archived completed valid', 'archived', -70, null, -20),
  ('Planned', 'planned', -100, null, null),
  ('Archived ambiguous', 'archived', -100, null, null),
  ('Missing planned start', 'active', null, null, null),
  ('Future planned start', 'active', 1, null, null),
  ('Contradictory completion', 'completed', -5, null, -10),
  ('Missing completion', 'completed', -40, null, null),
  ('Future completion', 'completed', -40, null, 1),
  ('Previously corrected', 'active', -100, -1000, null),
  ('Active with completion', 'active', -100, null, -10)
) as fixtures(name,status,planned_offset,actual_offset,completion_offset);

create temp table backfill_before as
select id, to_jsonb(project) as row_data from public.projects as project
where studio_id='84000000-0000-0000-0000-000000000001';

-- Exercise the actual migration, then roll back all fixture/backfill writes.
\ir ../migrations/20261005200141_backfill_project_actual_start.sql

select is((select count(*)::integer from public.projects where studio_id='84000000-0000-0000-0000-000000000001' and started_at=start_date),5,'only five defensible missing actual starts are copied');
select is((select count(*)::integer from public.projects where studio_id='84000000-0000-0000-0000-000000000001' and started_at is null),8,'planned, ambiguous, missing, future and contradictory histories remain unknown');
select is((select started_at from public.projects where studio_id='84000000-0000-0000-0000-000000000001' and name='Previously corrected'),(now() at time zone 'Europe/Kyiv')::date-1000,'an existing admin correction is preserved');
select is((select completed_at-started_at from public.projects where studio_id='84000000-0000-0000-0000-000000000001' and name='Completed valid'),30,'backfilled completion has a 30-day duration');
select is((select (now() at time zone 'Europe/Kyiv')::date-started_at from public.projects where studio_id='84000000-0000-0000-0000-000000000001' and name='Active valid'),100,'backfilled active project has a 100-day age');
select is((select completed_at-started_at from public.projects where studio_id='84000000-0000-0000-0000-000000000001' and name='Same-day valid'),0,'same-day actual dates remain valid');
select is((select count(*)::integer from public.projects where started_at>completed_at),0,'no invalid start-after-completion dates are introduced');
select ok(not exists(select 1 from public.projects as project join backfill_before using(id) where to_jsonb(project)-array['started_at','updated_at'] <> row_data-array['started_at','updated_at']),'planned fields, lifecycle and completion history remain unchanged');
select is((select count(*)::integer from public.project_activity where studio_id='84000000-0000-0000-0000-000000000001' and action_type='project_lifecycle_changed'),0,'no lifecycle transition is replayed');
select is((select count(*)::integer from public.project_activity where studio_id='84000000-0000-0000-0000-000000000001' and actor_id is null and changes ? 'started_at'),5,'copied dates are recorded as system corrections');
select is((select tgenabled::text from pg_trigger where tgrelid='public.projects'::regclass and tgname='validate_project_lifecycle_transition_before_update'),'O','the lifecycle guard is reenabled');
select throws_like($$update public.projects set started_at=(now() at time zone 'Europe/Kyiv')::date-101 where studio_id='84000000-0000-0000-0000-000000000001' and name='Active valid'$$,'%Only administrators may edit project actual start dates%','the backfill leaves normal admin-only edits enforced');

\ir ../migrations/20261005200141_backfill_project_actual_start.sql
select is((select count(*)::integer from public.project_activity where studio_id='84000000-0000-0000-0000-000000000001' and changes ? 'started_at'),5,'a second run neither overwrites starts nor repeats correction activity');
select * from finish();
rollback;
