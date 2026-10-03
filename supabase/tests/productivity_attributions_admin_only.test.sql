begin;
set search_path to public, extensions;
select plan(19);

insert into public.studios(id, name) values
  ('c9100000-0000-0000-0000-000000000001', 'Attribution privacy test A'),
  ('c9100000-0000-0000-0000-000000000002', 'Attribution privacy test B');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('c9100000-0000-0000-0000-000000000010','authenticated','authenticated','attribution-admin@example.test','{}','{}',now(),now()),
  ('c9100000-0000-0000-0000-000000000011','authenticated','authenticated','attribution-employee@example.test','{}','{}',now(),now()),
  ('c9100000-0000-0000-0000-000000000012','authenticated','authenticated','attribution-foreign-admin@example.test','{}','{}',now(),now()),
  ('c9100000-0000-0000-0000-000000000013','authenticated','authenticated','attribution-inactive-admin@example.test','{}','{}',now(),now()),
  ('c9100000-0000-0000-0000-000000000014','authenticated','authenticated','attribution-role-spoof@example.test','{}','{"system_role":"admin","role":"admin"}',now(),now());
insert into public.profiles(id, full_name, email, system_role) values
  ('c9100000-0000-0000-0000-000000000010','Attribution admin','attribution-admin@example.test','admin'),
  ('c9100000-0000-0000-0000-000000000011','Attribution employee','attribution-employee@example.test','employee'),
  ('c9100000-0000-0000-0000-000000000012','Attribution foreign admin','attribution-foreign-admin@example.test','admin'),
  ('c9100000-0000-0000-0000-000000000013','Attribution inactive admin','attribution-inactive-admin@example.test','admin'),
  ('c9100000-0000-0000-0000-000000000014','Attribution spoofed admin','attribution-role-spoof@example.test','admin');
insert into public.studio_members(studio_id,user_id,system_role,is_active,joined_at) values
  ('c9100000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000010','admin',true,'2026-01-01'),
  ('c9100000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000011','employee',true,'2026-01-01'),
  ('c9100000-0000-0000-0000-000000000002','c9100000-0000-0000-0000-000000000012','admin',true,'2026-01-01'),
  ('c9100000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000013','admin',false,'2026-01-01'),
  ('c9100000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000014','employee',true,'2026-01-01');
insert into public.projects(id, studio_id, created_by, name, project_type, country_code, start_date, total_area_m2) values
  ('c9100000-0000-0000-0000-000000000099','c9100000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000010','Private metrics A','private','UA','2026-01-01',100),
  ('c9100000-0000-0000-0000-000000000199','c9100000-0000-0000-0000-000000000002','c9100000-0000-0000-0000-000000000012','Private metrics B','private','UA','2026-01-01',200);
insert into public.project_members(project_id, user_id, project_role, assigned_area_m2, assigned_at) values
  ('c9100000-0000-0000-0000-000000000099','c9100000-0000-0000-0000-000000000011','other',0,'2026-01-01'),
  ('c9100000-0000-0000-0000-000000000099','c9100000-0000-0000-0000-000000000014','other',0,'2026-01-01');
insert into public.project_stage_productivity_budgets(project_id, stage, project_area_m2, productivity_budget_m2, allocated_productivity_m2) values
  ('c9100000-0000-0000-0000-000000000099','stage_1',100,20,10),
  ('c9100000-0000-0000-0000-000000000199','stage_1',200,40,20)
on conflict (project_id, stage) do update set allocated_productivity_m2 = excluded.allocated_productivity_m2;
insert into public.tasks(id, project_id, title, stage, status, assignee_id, created_by, completed_area_m2, productivity_area_m2, completed_at) values
  ('c9100000-0000-0000-0000-000000000098','c9100000-0000-0000-0000-000000000099','Private snapshot task','stage_2','completed','c9100000-0000-0000-0000-000000000011','c9100000-0000-0000-0000-000000000010',42,42,'2026-09-01');
insert into public.productivity_attributions(
  studio_id, project_id, task_id, contributor_id, source_type, credited_area_m2,
  contributor_name, contributor_job_title
) values (
  'c9100000-0000-0000-0000-000000000001',
  'c9100000-0000-0000-0000-000000000099',
  'c9100000-0000-0000-0000-000000000098',
  'c9100000-0000-0000-0000-000000000011',
  'task', 42, 'Attribution employee', 'Architect'
), (
  'c9100000-0000-0000-0000-000000000002',
  'c9100000-0000-0000-0000-000000000199',
  'c9100000-0000-0000-0000-000000000198',
  'c9100000-0000-0000-0000-000000000012',
  'task', 84, 'Foreign attribution admin', 'Architect'
);

select set_config('request.jwt.claim.sub','c9100000-0000-0000-0000-000000000011',true);
set local role authenticated;
select is((select count(*)::integer from public.productivity_attributions),0,'employees cannot read credited area attributions');
select is((select count(*)::integer from public.project_stage_productivity_budgets),0,'project members cannot read credited stage budgets');
select throws_ok('select productivity_area_m2 from public.tasks','42501','permission denied for table tasks','employees cannot select task productivity snapshots');
select is((select count(*)::integer from public.tasks where id = 'c9100000-0000-0000-0000-000000000098'),1,'employee can still read the permitted task');
select is((select completed_area_m2 from public.tasks where id = 'c9100000-0000-0000-0000-000000000098'),42::numeric,'normal task production area remains readable');
set local role postgres;
select set_config('request.jwt.claim.sub','c9100000-0000-0000-0000-000000000010',true);
set local role authenticated;
select is((select count(*)::integer from public.productivity_attributions),1,'active admins can read credited area attributions');
select is((select count(*)::integer from public.project_stage_productivity_budgets where stage = 'stage_1'),1,'active admins can read their credited stage budget');
select throws_ok('select productivity_area_m2 from public.tasks','42501','permission denied for table tasks','authenticated task reads do not expose accounting snapshots even for admins');
set local role postgres;
update public.profiles set is_active = false where id = 'c9100000-0000-0000-0000-000000000010';
set local role authenticated;
select is((select count(*)::integer from public.productivity_attributions),0,'disabled admin profiles cannot read credited attribution rows');
select is((select count(*)::integer from public.project_stage_productivity_budgets),0,'disabled admin profiles cannot read credited stage budgets');
set local role postgres;
update public.profiles set is_active = true where id = 'c9100000-0000-0000-0000-000000000010';
set local role postgres;
select set_config('request.jwt.claim.sub','c9100000-0000-0000-0000-000000000012',true);
set local role authenticated;
select is((select count(*)::integer from public.productivity_attributions where studio_id = 'c9100000-0000-0000-0000-000000000001'),0,'admins cannot read another studio attribution rows');
select is((select count(*)::integer from public.project_stage_productivity_budgets where project_id = 'c9100000-0000-0000-0000-000000000099'),0,'admins cannot read another studio credited stage budgets');
select is((select count(*)::integer from public.productivity_attributions where studio_id = 'c9100000-0000-0000-0000-000000000002'),1,'foreign admin can read only their own studio attribution rows');
select is((select count(*)::integer from public.project_stage_productivity_budgets where project_id = 'c9100000-0000-0000-0000-000000000199' and stage = 'stage_1'),1,'foreign admin reads only their own studio credited stage budget');
set local role postgres;
select set_config('request.jwt.claim.sub','c9100000-0000-0000-0000-000000000013',true);
set local role authenticated;
select is((select count(*)::integer from public.productivity_attributions),0,'inactive studio admins cannot read credited area attributions');
select is((select count(*)::integer from public.project_stage_productivity_budgets),0,'inactive admins cannot read credited stage budgets');
set local role postgres;
select set_config('request.jwt.claim.sub','c9100000-0000-0000-0000-000000000014',true);
set local role authenticated;
select is((select count(*)::integer from public.productivity_attributions),0,'profile role and user metadata cannot promote an employee to admin');
select is((select count(*)::integer from public.project_stage_productivity_budgets),0,'profile and metadata cannot grant credited stage budget access');

set local role service_role;
select is((select task.productivity_area_m2 from public.tasks task
  join public.projects project on project.id = task.project_id
  where task.id = 'c9100000-0000-0000-0000-000000000098'
    and project.studio_id = 'c9100000-0000-0000-0000-000000000001'),42::numeric,
  'trusted server can read the explicitly scoped accounting snapshot');
set local role postgres;

select * from finish();
rollback;
