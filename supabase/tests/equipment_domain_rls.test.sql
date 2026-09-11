begin;
select plan(36);

insert into public.studios(id, name) values
  ('47000000-0000-0000-0000-000000000001', 'Equipment Studio A'),
  ('47000000-0000-0000-0000-000000000002', 'Equipment Studio B');

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('47000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'equipment-admin-a@test', '{}', '{}', now(), now()),
  ('47000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'equipment-employee-a@test', '{}', '{}', now(), now()),
  ('47000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'equipment-inactive-a@test', '{}', '{}', now(), now()),
  ('47000000-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'equipment-admin-b@test', '{}', '{}', now(), now());

insert into public.profiles(id, full_name, email, system_role, is_active) values
  ('47000000-0000-0000-0000-000000000010', 'Equipment Admin A', 'equipment-admin-a@test', 'admin', true),
  ('47000000-0000-0000-0000-000000000011', 'Equipment Employee A', 'equipment-employee-a@test', 'employee', true),
  ('47000000-0000-0000-0000-000000000012', 'Equipment Inactive A', 'equipment-inactive-a@test', 'employee', false),
  ('47000000-0000-0000-0000-000000000013', 'Equipment Admin B', 'equipment-admin-b@test', 'admin', true);

insert into public.studio_members(studio_id, user_id, system_role, is_active) values
  ('47000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000010', 'admin', true),
  ('47000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000011', 'employee', true),
  ('47000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000012', 'employee', false),
  ('47000000-0000-0000-0000-000000000002', '47000000-0000-0000-0000-000000000013', 'admin', true);

select is(
  (select enum_range(null::public.equipment_type)::text),
  '{pc,laptop,monitor,mouse,keyboard,headphones,webcam,air_conditioner,printer,coffee_machine,other}',
  'all required equipment types are represented'
);
select is(
  (select enum_range(null::public.equipment_lifecycle_state)::text),
  '{active,spare,in_service,retired}',
  'all lifecycle states are represented'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.workstations'::regclass),
  'workstations has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.equipment'::regclass),
  'equipment has RLS enabled'
);

select set_config('request.jwt.claim.sub', '47000000-0000-0000-0000-000000000010', true);
set local role authenticated;

select lives_ok(
  $$insert into public.workstations(id, studio_id, number, name) values ('47000000-0000-0000-0000-000000000100', '47000000-0000-0000-0000-000000000001', 1, 'Desk 1')$$,
  'an admin can create an unassigned workstation'
);
select lives_ok(
  $$insert into public.workstations(id, studio_id, number, name, assigned_employee_id) values ('47000000-0000-0000-0000-000000000101', '47000000-0000-0000-0000-000000000001', 2, 'Desk 2', '47000000-0000-0000-0000-000000000011')$$,
  'a workstation stores at most one current employee in its nullable assignment column'
);
select throws_like(
  $$insert into public.workstations(studio_id, number, name, assigned_employee_id) values ('47000000-0000-0000-0000-000000000001', 3, 'Desk 3', '47000000-0000-0000-0000-000000000012')$$,
  '%assigned_employee_must_be_an_active_studio_member%',
  'an inactive member cannot be newly assigned'
);
select throws_like(
  $$insert into public.workstations(studio_id, number, name, assigned_employee_id) values ('47000000-0000-0000-0000-000000000001', 4, 'Desk 4', '47000000-0000-0000-0000-000000000013')$$,
  '%assigned_employee_must_be_an_active_studio_member%',
  'an employee from another studio cannot be assigned'
);
select throws_like(
  $$insert into public.workstations(studio_id, number) values ('47000000-0000-0000-0000-000000000001', 1)$$,
  '%duplicate key%',
  'workstation numbers are unique within a studio'
);
select throws_like(
  $$insert into public.workstations(studio_id, number, assigned_employee_id) values ('47000000-0000-0000-0000-000000000001', 5, '47000000-0000-0000-0000-000000000011')$$,
  '%duplicate key%',
  'an employee can be assigned to at most one workstation in a studio'
);

select lives_ok(
  $$insert into public.equipment(id, studio_id, equipment_type, lifecycle_state, display_name, manufacturer, model, asset_tag) values ('47000000-0000-0000-0000-000000000200', '47000000-0000-0000-0000-000000000001', 'printer', 'spare', 'Office printer', 'Brother', 'MFC-L8900', 'PRN-001')$$,
  'equipment can exist independently from a workstation'
);
select lives_ok(
  $$insert into public.equipment(id, studio_id, workstation_id, equipment_type, display_name, cpu, gpu, ram, storage, serial_number) values ('47000000-0000-0000-0000-000000000201', '47000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000100', 'pc', 'Render PC', 'Ryzen 9', 'RTX 5090', '128 GB', '4 TB NVMe', 'PC-001')$$,
  'PC specifications are optional structured fields on an attached item'
);
select lives_ok(
  $$update public.equipment set workstation_id = '47000000-0000-0000-0000-000000000101' where id = '47000000-0000-0000-0000-000000000201'$$,
  'equipment can move to another workstation without changing identity'
);
select is(
  (select id from public.equipment where workstation_id = '47000000-0000-0000-0000-000000000101'),
  '47000000-0000-0000-0000-000000000201'::uuid,
  'moving equipment preserves its identity'
);
select lives_ok(
  $$update public.equipment set workstation_id = null where id = '47000000-0000-0000-0000-000000000201'$$,
  'equipment can be detached'
);
select throws_like(
  $$insert into public.equipment(studio_id, equipment_type, display_name, cpu) values ('47000000-0000-0000-0000-000000000001', 'monitor', 'Display', 'not applicable')$$,
  '%equipment_computer_specs_match_type%',
  'computer specifications are restricted to PCs and laptops'
);
select lives_ok(
  $$update public.equipment set lifecycle_state = 'retired' where id = '47000000-0000-0000-0000-000000000200'$$,
  'equipment can be retired without deletion'
);
select is(
  (select count(*)::integer from public.equipment where id = '47000000-0000-0000-0000-000000000200' and lifecycle_state = 'retired'),
  1,
  'retired equipment remains persisted'
);

set local role postgres;
insert into public.workstations(id, studio_id, number, name) values
  ('47000000-0000-0000-0000-000000000102', '47000000-0000-0000-0000-000000000002', 1, 'Desk B');
select set_config('request.jwt.claim.sub', '47000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select throws_like(
  $$update public.equipment set workstation_id = '47000000-0000-0000-0000-000000000102' where id = '47000000-0000-0000-0000-000000000201'$$,
  '%violates foreign key constraint%',
  'equipment cannot be attached across studios'
);
select throws_like(
  $$update public.equipment set studio_id = '47000000-0000-0000-0000-000000000002' where id = '47000000-0000-0000-0000-000000000201'$$,
  '%equipment_studio_is_immutable%',
  'equipment cannot be moved across tenant ownership'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '47000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select is((select count(*)::integer from public.workstations), 0, 'employees cannot read workstations');
select is((select count(*)::integer from public.equipment), 0, 'employees cannot read equipment');
select throws_like(
  $$insert into public.workstations(studio_id, number, name) values ('47000000-0000-0000-0000-000000000001', 6, 'Employee desk')$$,
  '%row-level security policy%',
  'employees cannot insert workstations'
);
select throws_like(
  $$insert into public.equipment(studio_id, equipment_type, display_name) values ('47000000-0000-0000-0000-000000000001', 'mouse', 'Employee mouse')$$,
  '%row-level security policy%',
  'employees cannot insert equipment'
);
select lives_ok($$update public.workstations set name = 'Changed'$$, 'employee workstation updates expose no writable rows');
select lives_ok($$update public.equipment set lifecycle_state = 'retired'$$, 'employee equipment updates expose no writable rows');
select lives_ok($$delete from public.workstations$$, 'employee workstation deletes expose no writable rows');
select lives_ok($$delete from public.equipment$$, 'employee equipment deletes expose no writable rows');

set local role postgres;
select is((select count(*)::integer from public.workstations where studio_id = '47000000-0000-0000-0000-000000000001'), 2, 'employee delete did not remove any workstation');
select is((select count(*)::integer from public.equipment where studio_id = '47000000-0000-0000-0000-000000000001'), 2, 'employee delete did not remove any equipment');
select is((select count(*)::integer from public.workstations where name = 'Changed'), 0, 'employee update did not rename a workstation');
select is(
  (select count(*)::integer from public.equipment where lifecycle_state = 'retired'),
  1,
  'employee update did not retire additional equipment'
);
select set_config('request.jwt.claim.sub', '47000000-0000-0000-0000-000000000013', true);
set local role authenticated;
select is((select count(*)::integer from public.workstations), 1, 'another studio admin sees only their workstation');
select is((select count(*)::integer from public.equipment), 0, 'another studio admin cannot read equipment from the first studio');

set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select throws_like($$select * from public.workstations$$, '%permission denied%', 'anonymous users cannot read workstations');
select throws_like($$select * from public.equipment$$, '%permission denied%', 'anonymous users cannot read equipment');

select * from finish();
rollback;
