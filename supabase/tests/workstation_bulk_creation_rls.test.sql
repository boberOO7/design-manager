begin;
select plan(8);

insert into public.studios(id, name) values
  ('49000000-0000-0000-0000-000000000001', 'Bulk workstation studio');

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('49000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'bulk-admin@test', '{}', '{}', now(), now()),
  ('49000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'bulk-employee@test', '{}', '{}', now(), now());

insert into public.profiles(id, full_name, email, system_role, is_active) values
  ('49000000-0000-0000-0000-000000000010', 'Bulk Admin', 'bulk-admin@test', 'admin', true),
  ('49000000-0000-0000-0000-000000000011', 'Bulk Employee', 'bulk-employee@test', 'employee', true);

insert into public.studio_members(studio_id, user_id, system_role, is_active) values
  ('49000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000010', 'admin', true),
  ('49000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000011', 'employee', true);

select set_config('request.jwt.claim.sub', '49000000-0000-0000-0000-000000000010', true);
set local role authenticated;

select lives_ok(
  $$select public.create_workstations('49000000-0000-0000-0000-000000000001', '[{"number":7,"name":null,"assigned_employee_id":null},{"number":8,"name":"Window desk","assigned_employee_id":"49000000-0000-0000-0000-000000000011"}]'::jsonb)$$,
  'an admin can atomically create numbered workstations with optional names and assignments'
);
select is((select count(*)::integer from public.workstations), 2, 'the complete requested batch is persisted');
select is((select name from public.workstations where number = 7), null::text, 'a workstation name remains optional');
select is((select name from public.workstations where number = 8), 'Window desk', 'a workstation name is stored separately from its number');
select throws_like(
  $$select public.create_workstations('49000000-0000-0000-0000-000000000001', '[{"number":9,"name":null,"assigned_employee_id":null},{"number":7,"name":null,"assigned_employee_id":null}]'::jsonb)$$,
  '%workstation_number_conflict%',
  'a conflicting number rejects the complete batch'
);
select is((select count(*)::integer from public.workstations), 2, 'a failed batch leaves no partial workstation behind');
select throws_like(
  $$select public.create_workstations('49000000-0000-0000-0000-000000000001', '[{"number":9,"name":null,"assigned_employee_id":"49000000-0000-0000-0000-000000000011"}]'::jsonb)$$,
  '%workstation_employee_unavailable%',
  'an employee already assigned to a workstation cannot be assigned again'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '49000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select throws_like(
  $$select public.create_workstations('49000000-0000-0000-0000-000000000001', '[{"number":9,"name":null,"assigned_employee_id":null}]'::jsonb)$$,
  '%workstation_create_forbidden%',
  'non-admins cannot use the bulk creation RPC'
);

select * from finish();
rollback;
