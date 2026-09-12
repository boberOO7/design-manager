begin;
select plan(31);
insert into public.studios(id,name) values
('59000000-0000-0000-0000-000000000001','Inventory A'),
('59000000-0000-0000-0000-000000000002','Inventory B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('59000000-0000-0000-0000-000000000010','authenticated','authenticated','inventory-admin@test','{}','{}'),
('59000000-0000-0000-0000-000000000011','authenticated','authenticated','inventory-employee@test','{}','{}');
insert into public.profiles(id,full_name,email,system_role,is_active) values
('59000000-0000-0000-0000-000000000010','Admin','inventory-admin@test','admin',true),
('59000000-0000-0000-0000-000000000011','Employee','inventory-employee@test','employee',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active) values
('59000000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000010','admin',true),
('59000000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000011','employee',true);
select set_config('request.jwt.claim.sub','59000000-0000-0000-0000-000000000010',true);
set local role authenticated;
insert into public.equipment(studio_id,equipment_type,display_name,asset_tag) values
('59000000-0000-0000-0000-000000000001','pc','Legacy PC','pC-01');
insert into public.equipment(studio_id,equipment_type,display_name)
select '59000000-0000-0000-0000-000000000001', value, value::text
from unnest(enum_range(null::public.equipment_type)) value;
select is((select asset_tag from public.equipment where display_name='Legacy PC'),'PC-01','new explicit identifiers use the fixed uppercase type prefix');
select is((select asset_tag from public.equipment where display_name='pc'),'PC-02','generation skips a reserved code case-insensitively');
select results_eq($$select asset_tag from public.equipment where display_name <> 'Legacy PC' order by equipment_type$$,
$$values ('PC-02'),('LAP-01'),('MON-01'),('MOU-01'),('KBD-01'),('HEAD-01'),('CAM-01'),('AC-01'),('PRN-01'),('COF-01'),('EQ-01')$$,'every supported type has a prefix');
update public.equipment set notes='Keep identity',lifecycle_state='retired' where display_name='pc';
select is((select asset_tag from public.equipment where display_name='pc'),'PC-02','ordinary edits and retirement preserve identity');
select throws_ok($$update public.equipment set asset_tag=null where display_name='pc'$$,'23514','inventory_code_required','identifiers cannot be cleared');
select throws_ok($$update public.equipment set asset_tag='CUSTOM-PC' where display_name='pc'$$,'23514','inventory_code_format','inventory codes keep their type prefix and numeric suffix');
select lives_ok($$update public.equipment set asset_tag='PC-0009' where display_name='pc'$$,'admins can edit the numeric portion');
select is((select asset_tag from public.equipment where display_name='pc'),'PC-0009','manual numbering preserves leading zeroes');
select throws_like($$insert into public.equipment(studio_id,equipment_type,display_name,asset_tag) values ('59000000-0000-0000-0000-000000000001','pc','Reuse','pc-02')$$,'%duplicate key%','renamed codes stay reserved');
delete from public.equipment where display_name='pc';
select throws_like($$insert into public.equipment(studio_id,equipment_type,display_name,asset_tag) values ('59000000-0000-0000-0000-000000000001','pc','Reuse','pc-0009')$$,'%duplicate key%','deleted identifiers stay reserved');
insert into public.equipment(studio_id,equipment_type,display_name) values ('59000000-0000-0000-0000-000000000001','pc','Next PC');
select is((select asset_tag from public.equipment where display_name='Next PC'),'PC-03','automatic numbering never reuses renamed or deleted codes');
select throws_ok($$update public.equipment set equipment_type='other' where display_name='Next PC'$$,'23514','equipment_type_is_immutable','saved equipment type is immutable');
select is((select equipment_type::text || ':' || asset_tag from public.equipment where display_name='Next PC'),'pc:PC-03','a rejected type change preserves identity');
select lives_ok($$insert into public.equipment(studio_id,equipment_type,display_name) values ('59000000-0000-0000-0000-000000000001','printer',null)$$,'custom equipment name is optional');
select is((select count(*)::integer from public.equipment where equipment_type='printer' and display_name is null),1,'an omitted custom name remains null');
insert into public.equipment(studio_id,equipment_type,display_name)
select '59000000-0000-0000-0000-000000000001','mouse','Mouse '||value from generate_series(2,101) value;
select is((select asset_tag from public.equipment where display_name='Mouse 101'),'MOU-101','codes expand beyond two digits without truncation');
select throws_like($$select * from private.equipment_inventory_codes$$,'%permission denied%','admins cannot read the private reservation ledger');
select throws_like($$delete from private.equipment_inventory_counters$$,'%permission denied%','admins cannot reset counters');
select lives_ok($$select public.create_workstations('59000000-0000-0000-0000-000000000001','[{"number":1},{"number":2,"workstation_type":"remote"}]')$$,'the bulk RPC supports both workstation types');
select results_eq($$select workstation_type::text from public.workstations order by number$$,$$values ('office'),('remote')$$,'omitted type defaults to office');
select throws_like($$insert into public.workstations(studio_id,number,workstation_type) values ('59000000-0000-0000-0000-000000000001',2,'office')$$,'%duplicate key%','office and remote share the numbering model');
select lives_ok($$update public.workstations set workstation_type='remote' where number=1$$,'an admin can change workstation type');
select throws_like($$select public.create_workstations('59000000-0000-0000-0000-000000000001','[{"number":3,"workstation_type":"unknown"}]')$$,'%invalid input value%','invalid type is rejected atomically');
select is((select count(*)::integer from public.workstations),2,'failed batch leaves no workstation');
select throws_like($$insert into public.equipment(studio_id,equipment_type,display_name) values ('59000000-0000-0000-0000-000000000002','pc','Cross tenant')$$,'%row-level security%','admin cannot allocate codes for another studio');
set local role postgres;
insert into public.equipment(studio_id,equipment_type,display_name) values ('59000000-0000-0000-0000-000000000002','pc','Tenant B PC');
select is((select asset_tag from public.equipment where display_name='Tenant B PC'),'PC-01','each studio has an independent code namespace');
select set_config('request.jwt.claim.sub','59000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select is((select count(*)::integer from public.equipment),0,'employees cannot see inventory codes');
select throws_like($$insert into public.equipment(studio_id,equipment_type,display_name) values ('59000000-0000-0000-0000-000000000001','pc','Employee PC')$$,'%row-level security%','employees cannot allocate codes');
with changed as (update public.workstations set workstation_type='office' returning id) select is((select count(*)::integer from changed),0,'employees cannot change workstation type');
with changed as (update public.equipment set asset_tag='HACK' returning id) select is((select count(*)::integer from changed),0,'employees cannot rename inventory');
set local role anon;
select throws_like($$select * from public.equipment$$,'%permission denied%','anonymous users cannot read inventory');
select * from finish();
rollback;
