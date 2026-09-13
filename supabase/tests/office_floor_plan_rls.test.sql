begin;
select plan(16);

insert into public.studios(id, name) values
  ('69000000-0000-0000-0000-000000000001', 'Floor plan A'),
  ('69000000-0000-0000-0000-000000000002', 'Floor plan B');

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('69000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'floor-admin-a@test', '{}', '{}'),
  ('69000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'floor-employee-a@test', '{}', '{}'),
  ('69000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'floor-admin-b@test', '{}', '{}');

insert into public.profiles(id, full_name, email, system_role, is_active) values
  ('69000000-0000-0000-0000-000000000010', 'Floor Admin A', 'floor-admin-a@test', 'admin', true),
  ('69000000-0000-0000-0000-000000000011', 'Floor Employee A', 'floor-employee-a@test', 'employee', true),
  ('69000000-0000-0000-0000-000000000012', 'Floor Admin B', 'floor-admin-b@test', 'admin', true);

insert into public.studio_members(studio_id, user_id, system_role, is_active) values
  ('69000000-0000-0000-0000-000000000001', '69000000-0000-0000-0000-000000000010', 'admin', true),
  ('69000000-0000-0000-0000-000000000001', '69000000-0000-0000-0000-000000000011', 'employee', true),
  ('69000000-0000-0000-0000-000000000002', '69000000-0000-0000-0000-000000000012', 'admin', true);

insert into public.workstations(id, studio_id, number, workstation_type) values
  ('69000000-0000-0000-0000-000000000100', '69000000-0000-0000-0000-000000000001', 1, 'office'),
  ('69000000-0000-0000-0000-000000000101', '69000000-0000-0000-0000-000000000001', 2, 'remote'),
  ('69000000-0000-0000-0000-000000000102', '69000000-0000-0000-0000-000000000002', 1, 'office');

insert into public.equipment(id, studio_id, equipment_type, display_name) values
  ('69000000-0000-0000-0000-000000000200', '69000000-0000-0000-0000-000000000001', 'printer', 'Printer'),
  ('69000000-0000-0000-0000-000000000201', '69000000-0000-0000-0000-000000000001', 'mouse', 'Mouse'),
  ('69000000-0000-0000-0000-000000000202', '69000000-0000-0000-0000-000000000002', 'coffee_machine', 'Coffee B');

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.office_floor_plan_placements'::regclass),
  'floor-plan placements have RLS enabled'
);

select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000010', true);
set local role authenticated;

select is(
  public.save_office_floor_plan_layout(
    '69000000-0000-0000-0000-000000000001',
    '[{"entity_type":"workstation","entity_id":"69000000-0000-0000-0000-000000000100","floor":1,"x":0.25,"y":0.3},{"entity_type":"equipment","entity_id":"69000000-0000-0000-0000-000000000200","floor":2,"x":0.7,"y":0.8}]'
  ),
  2,
  'an admin atomically saves office workstations and locatable equipment'
);
select is((select count(*)::integer from public.office_floor_plan_placements), 2, 'the saved layout is readable');
select is((select floor::integer from public.office_floor_plan_placements where equipment_id is not null), 2, 'placements retain their floor');
select is((select x from public.office_floor_plan_placements where workstation_id is not null), 0.25::double precision, 'placements retain normalized coordinates');
select throws_ok(
  $$select public.save_office_floor_plan_layout('69000000-0000-0000-0000-000000000001', '[{"entity_type":"workstation","entity_id":"69000000-0000-0000-0000-000000000101","floor":1,"x":0.2,"y":0.2}]')$$,
  '23503',
  'invalid_office_floor_plan_entity',
  'remote workstations cannot be placed'
);
select throws_ok(
  $$select public.save_office_floor_plan_layout('69000000-0000-0000-0000-000000000001', '[{"entity_type":"equipment","entity_id":"69000000-0000-0000-0000-000000000201","floor":1,"x":0.2,"y":0.2}]')$$,
  '23503',
  'invalid_office_floor_plan_entity',
  'small peripherals cannot be placed individually'
);
select throws_ok(
  $$select public.save_office_floor_plan_layout('69000000-0000-0000-0000-000000000001', '[{"entity_type":"workstation","entity_id":"69000000-0000-0000-0000-000000000100","floor":1,"x":1.2,"y":0.2}]')$$,
  '22023',
  'invalid_office_floor_plan_layout',
  'coordinates must stay in the normalized floor-plan coordinate system'
);
select throws_ok(
  $$select public.save_office_floor_plan_layout('69000000-0000-0000-0000-000000000001', '[{"entity_type":"equipment","entity_id":"69000000-0000-0000-0000-000000000202","floor":1,"x":0.2,"y":0.2}]')$$,
  '23503',
  'invalid_office_floor_plan_entity',
  'entities cannot be placed across studios'
);
select is((select count(*)::integer from public.office_floor_plan_placements), 2, 'a rejected snapshot leaves the prior layout intact');
select is(public.save_office_floor_plan_layout('69000000-0000-0000-0000-000000000001', '[]'), 0, 'an empty snapshot removes every placement');
select is((select count(*)::integer from public.workstations where studio_id = '69000000-0000-0000-0000-000000000001'), 2, 'removing placements does not delete workstations');
select is((select count(*)::integer from public.equipment where studio_id = '69000000-0000-0000-0000-000000000001'), 2, 'removing placements does not delete equipment');

set local role postgres;
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select is((select count(*)::integer from public.office_floor_plan_placements), 0, 'employees cannot read floor-plan placements');
select throws_ok(
  $$select public.save_office_floor_plan_layout('69000000-0000-0000-0000-000000000001', '[]')$$,
  '42501',
  'office_floor_plan_forbidden',
  'employees cannot save floor-plan placements'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000012', true);
set local role authenticated;
select throws_ok(
  $$select public.save_office_floor_plan_layout('69000000-0000-0000-0000-000000000001', '[]')$$,
  '42501',
  'office_floor_plan_forbidden',
  'another studio admin cannot replace the layout'
);

select * from finish();
rollback;
