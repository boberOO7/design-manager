begin;
select no_plan();

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


insert into public.equipment(id, studio_id, equipment_type, display_name, manufacturer, model, cpu, gpu, ram, storage)
values ('47000000-0000-0000-0000-000000000200', '47000000-0000-0000-0000-000000000001', 'pc', 'Legacy PC', 'Custom label', 'Original model', 'intel core i7-4790k', 'GTX 1080ti', '32gb', 'unknown drive arrangement');
select is((select pc_configuration from public.equipment where id = '47000000-0000-0000-0000-000000000200'), null::jsonb, 'legacy records need no invented structured interpretation');
select set_config('request.jwt.claim.sub', '47000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok($$update public.equipment set pc_configuration = '{"processor":{"manufacturer":"AMD","family":"Ryzen 7","model":"7800X3D"},"graphics":{"mode":"integrated"},"memory":{"capacityGb":64,"generation":"DDR5","moduleCount":2},"drives":[{"type":"nvme_ssd","capacity":1,"unit":"TB"},{"type":"sata_ssd","capacity":2,"unit":"TB"}]}' where id = '47000000-0000-0000-0000-000000000200'$$, 'admin can atomically store structured configuration and multiple drives');
select is((select jsonb_array_length(pc_configuration->'drives') from public.equipment where id = '47000000-0000-0000-0000-000000000200'), 2, 'multiple drives belong to the same PC');
select is((select concat_ws('|', manufacturer, model, cpu, gpu, ram, storage) from public.equipment where id = '47000000-0000-0000-0000-000000000200'), 'Custom label|Original model|intel core i7-4790k|GTX 1080ti|32gb|unknown drive arrangement', 'all previous identification and unparsed text remain verbatim');
select throws_like($$update public.equipment set equipment_type = 'laptop' where id = '47000000-0000-0000-0000-000000000200'$$, '%equipment_type_is_immutable%', 'saved equipment type cannot be changed');
select throws_like($$update public.equipment set pc_configuration = 'null' where id = '47000000-0000-0000-0000-000000000200'$$, '%equipment_pc_configuration_shape%', 'JSON null cannot bypass the document shape');
select throws_like($$update public.equipment set pc_configuration = '{}' where id = '47000000-0000-0000-0000-000000000200'$$, '%equipment_pc_configuration_shape%', 'malformed documents are rejected');
select throws_like($$update public.equipment set pc_configuration = jsonb_set(pc_configuration, '{processor,family}', '"Core i7"') where id = '47000000-0000-0000-0000-000000000200'$$, '%equipment_pc_configuration_shape%', 'CPU families must match manufacturer');
select throws_like($$update public.equipment set pc_configuration = jsonb_set(pc_configuration, '{graphics}', '{"mode":"discrete","details":{"vendor":"Intel","family":"GeForce RTX","model":null,"vramGb":12}}') where id = '47000000-0000-0000-0000-000000000200'$$, '%equipment_pc_configuration_shape%', 'GPU families must match vendor');
select throws_like($$update public.equipment set pc_configuration = jsonb_set(pc_configuration, '{graphics,details}', '{}') where id = '47000000-0000-0000-0000-000000000200'$$, '%equipment_pc_configuration_shape%', 'integrated mode cannot retain discrete details');
select throws_like($$update public.equipment set pc_configuration = jsonb_set(pc_configuration, '{drives,0,capacity}', '0') where id = '47000000-0000-0000-0000-000000000200'$$, '%equipment_pc_configuration_shape%', 'drive capacity must be positive');
select throws_like($$update public.equipment set pc_configuration = jsonb_set(pc_configuration, '{memory,moduleCount}', '1.5') where id = '47000000-0000-0000-0000-000000000200'$$, '%equipment_pc_configuration_shape%', 'module counts must be integers');
select lives_ok($$update public.equipment set pc_configuration = jsonb_set(pc_configuration, '{drives}', (pc_configuration->'drives') - 0) where id = '47000000-0000-0000-0000-000000000200'$$, 'admin can remove a drive inline without deleting the PC');
select is((select pc_configuration#>>'{drives,0,type}' from public.equipment where id = '47000000-0000-0000-0000-000000000200'), 'sata_ssd', 'remaining drive retains its data and order');

set local role postgres;
select set_config('request.jwt.claim.sub', '47000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select is((select count(*)::integer from public.equipment), 0, 'employees cannot read PC configurations');
with changed as (update public.equipment set pc_configuration = null returning id) select is((select count(*)::integer from changed), 0, 'employees cannot erase PC configurations');
select throws_like($$insert into public.equipment(studio_id,equipment_type,display_name) values ('47000000-0000-0000-0000-000000000001','pc','Forbidden')$$, '%row-level security%', 'employees cannot create equipment');
set local role postgres;
select set_config('request.jwt.claim.sub', '47000000-0000-0000-0000-000000000013', true);
set local role authenticated;
select is((select count(*)::integer from public.equipment), 0, 'another tenant admin cannot read the PC');
with changed as (update public.equipment set pc_configuration = null returning id) select is((select count(*)::integer from changed), 0, 'another tenant admin cannot change the PC');
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select throws_like($$select pc_configuration from public.equipment$$, '%permission denied%', 'anonymous access remains denied');
select * from finish();
rollback;
