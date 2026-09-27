begin;

select plan(15);

insert into public.studios (id, name) values ('9b000000-0000-0000-0000-000000000001', 'Backfill test studio');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('9b000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'backfill-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('9b000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'backfill-worker@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('9b000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'backfill-other@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, full_name, email, system_role, job_title, created_at, updated_at) values
  ('9b000000-0000-0000-0000-000000000010', 'Backfill admin', 'backfill-admin@example.test', 'admin', 'Architect', '2026-01-01', '2026-01-01'),
  ('9b000000-0000-0000-0000-000000000011', 'Backfill worker', 'backfill-worker@example.test', 'employee', 'Designer', '2026-01-01', '2026-01-01'),
  ('9b000000-0000-0000-0000-000000000012', 'Backfill other', 'backfill-other@example.test', 'employee', 'Designer', '2026-01-01', '2026-01-01');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('9b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000010', 'admin'),
  ('9b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000011', 'employee'),
  ('9b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000012', 'employee');
insert into public.projects (id, studio_id, name, total_area_m2, status, start_date, created_by)
values ('9b000000-0000-0000-0000-000000000020', '9b000000-0000-0000-0000-000000000001', 'Backfill project', 20, 'active', current_date, '9b000000-0000-0000-0000-000000000010');
insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at, created_at, updated_at) values
  ('9b000000-0000-0000-0000-000000000020', '9b000000-0000-0000-0000-000000000010', 'designer', 0, current_date, '2026-01-01', '2026-01-01'),
  ('9b000000-0000-0000-0000-000000000020', '9b000000-0000-0000-0000-000000000011', 'designer', 0, current_date, '2026-01-01', '2026-01-01'),
  ('9b000000-0000-0000-0000-000000000020', '9b000000-0000-0000-0000-000000000012', 'designer', 0, current_date, '2026-01-01', '2026-01-01');
insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('9b000000-0000-0000-0000-000000000030', '9b000000-0000-0000-0000-000000000020', 'stage_2', 'Audited completion', 'todo', '9b000000-0000-0000-0000-000000000011', '9b000000-0000-0000-0000-000000000010'),
  ('9b000000-0000-0000-0000-000000000031', '9b000000-0000-0000-0000-000000000020', 'stage_2', 'Reassigned later', 'todo', '9b000000-0000-0000-0000-000000000011', '9b000000-0000-0000-0000-000000000010'),
  ('9b000000-0000-0000-0000-000000000032', '9b000000-0000-0000-0000-000000000020', 'stage_2', 'Unassigned completion', 'todo', null, '9b000000-0000-0000-0000-000000000010'),
  ('9b000000-0000-0000-0000-000000000033', '9b000000-0000-0000-0000-000000000020', 'stage_2', 'Date corrected later', 'todo', '9b000000-0000-0000-0000-000000000011', '9b000000-0000-0000-0000-000000000010');
select set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-000000000010', true);
update public.tasks set status = 'completed' where project_id = '9b000000-0000-0000-0000-000000000020';
delete from public.productivity_attributions where task_id in (
  '9b000000-0000-0000-0000-000000000030', '9b000000-0000-0000-0000-000000000031', '9b000000-0000-0000-0000-000000000033'
);
update public.task_status_periods as period
set entered_at = activity.created_at
from public.project_activity as activity
where activity.entity_type = 'task' and activity.entity_id = period.task_id
  and activity.changes #>> '{status,to}' = 'completed'
  and period.status = 'completed' and period.exited_at is null
  and period.project_id = '9b000000-0000-0000-0000-000000000020';
update public.tasks set assignee_id = '9b000000-0000-0000-0000-000000000012' where id = '9b000000-0000-0000-0000-000000000031';
update public.tasks set completed_at = current_date - 1 where id = '9b000000-0000-0000-0000-000000000033';
-- Distinct audit times reproduce the historical rows (a single pgTAP transaction shares now()).
update public.project_activity set created_at = now() - interval '1 hour'
where project_id = '9b000000-0000-0000-0000-000000000020' and action_type = 'task_created';
update public.project_activity set created_at = now() + interval '1 hour'
where entity_id = '9b000000-0000-0000-0000-000000000031' and changes ? 'assignee_id';

select is(private.backfill_audited_zero_area_task_attributions(), 1, 'one audited row is backfilled');
select is((select count(*)::integer from public.productivity_attributions where task_id = '9b000000-0000-0000-0000-000000000030' and voided_at is null), 1, 'audited historical completion is restored once');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '9b000000-0000-0000-0000-000000000030' and voided_at is null), 0::numeric, 'backfill preserves zero square metres');
select is((select contributor_id from public.productivity_attributions where task_id = '9b000000-0000-0000-0000-000000000030' and voided_at is null), '9b000000-0000-0000-0000-000000000011'::uuid, 'backfill uses audited completion assignee');
select is((select contributor_job_title from public.productivity_attributions where task_id = '9b000000-0000-0000-0000-000000000030' and voided_at is null), 'Designer', 'backfill preserves unchanged contributor role');
select is((select count(*)::integer from public.productivity_attributions where task_id = '9b000000-0000-0000-0000-000000000031'), 0, 'post-completion reassignment is not guessed');
select is((select count(*)::integer from public.productivity_attributions where task_id = '9b000000-0000-0000-0000-000000000032'), 0, 'unassigned completion is not guessed');
select is((select count(*)::integer from public.productivity_attributions where task_id = '9b000000-0000-0000-0000-000000000033'), 0, 'later-edited completion history is left untouched');
select is(private.backfill_audited_zero_area_task_attributions(), 0, 'repeat backfill inserts nothing');
select is((select count(*)::integer from public.productivity_attributions where task_id = '9b000000-0000-0000-0000-000000000030' and voided_at is null), 1, 'rerunning the backfill is idempotent');
update public.tasks set status = 'todo' where id = '9b000000-0000-0000-0000-000000000030';
select is((select count(*)::integer from public.productivity_attributions where task_id = '9b000000-0000-0000-0000-000000000030' and voided_at is null), 0, 'reopening voids the backfilled row');
update public.tasks set status = 'completed' where id = '9b000000-0000-0000-0000-000000000030';
select is((select count(*)::integer from public.productivity_attributions where task_id = '9b000000-0000-0000-0000-000000000030' and voided_at is null), 1, 'recompletion makes one active row');
select is((select count(*)::integer from public.productivity_attributions where task_id = '9b000000-0000-0000-0000-000000000030'), 2, 'voided backfill remains historical');
select is(private.backfill_audited_zero_area_task_attributions(), 0, 'backfill does not recreate voided history');
select is((select count(*)::integer from public.productivity_attributions where task_id = '9b000000-0000-0000-0000-000000000030' and voided_at is null), 1, 'later rerun cannot duplicate recompletion');

select * from finish();
rollback;
