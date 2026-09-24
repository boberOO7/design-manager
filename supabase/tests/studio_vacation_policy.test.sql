begin;
set search_path to public, extensions;
select plan(24);

insert into public.studios(id, name) values ('b9000000-0000-0000-0000-000000000001', 'Vacation policy test');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b9000000-0000-0000-0000-000000000010','authenticated','authenticated','policy-admin@example.test','{}','{}',now(),now()),
  ('b9000000-0000-0000-0000-000000000011','authenticated','authenticated','policy-employee@example.test','{}','{}',now(),now()),
  ('b9000000-0000-0000-0000-000000000012','authenticated','authenticated','policy-opening@example.test','{}','{}',now(),now());
insert into public.profiles(id, full_name, email, system_role) values
  ('b9000000-0000-0000-0000-000000000010','Policy admin','policy-admin@example.test','admin'),
  ('b9000000-0000-0000-0000-000000000011','Policy employee','policy-employee@example.test','employee'),
  ('b9000000-0000-0000-0000-000000000012','Policy opening','policy-opening@example.test','employee');
insert into public.studio_members(studio_id,user_id,system_role,joined_at,vacation_opening_days,vacation_opening_date) values
  ('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000010','admin','2026-01-01',null,null),
  ('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','employee','2026-01-01',null,null),
  ('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000012','employee','2026-01-01',7,'2026-04-15');

select set_config('request.jwt.claim.sub','b9000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select is((select annual_days from public.get_studio_vacation_policy('b9000000-0000-0000-0000-000000000001')),24,'studio defaults to 24 annual days');
select is((select carry_rule from public.get_studio_vacation_policy('b9000000-0000-0000-0000-000000000001')),'carry_all','studio defaults to carry all');
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2026-02-01'),2,'default monthly accrual is two full days');
set local role postgres;
insert into private.studio_vacation_policies(studio_id,effective_at,annual_days,carry_rule) values
  ('b9000000-0000-0000-0000-000000000001','2025-12-01T00:00:00Z',25,'carry_all');
set local role authenticated;
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2026-02-01'),2,'25 annual days accrue exact twelfths, exposing full days');
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2027-01-01'),25,'twelve months of 25 days have no rounding drift and carry all');
set local role postgres;
insert into private.studio_vacation_policies(studio_id,effective_at,annual_days,carry_rule) values
  ('b9000000-0000-0000-0000-000000000001','2026-07-15T00:00:00Z',30,'carry_all');
set local role authenticated;
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2026-07-01'),12,'a later policy does not rewrite earlier completed months');
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2026-08-01'),15,'new entitlement applies to the next completed month');
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2027-01-01'),27,'mixed rates remain precise at the anniversary');
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000012','2026-04-15'),7,'opening balance overrides all earlier history');
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000012','2026-05-15'),9,'opening balance accrues at its own monthly anniversary');
set local role postgres;
insert into private.studio_vacation_policies(studio_id,effective_at,annual_days,carry_rule,carry_cap_days) values
  ('b9000000-0000-0000-0000-000000000001','2026-12-01T00:00:00Z',30,'capped',5);
set local role authenticated;
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2027-01-01'),5,'capped carryover applies at employment anniversary');
set local role postgres;
insert into private.studio_vacation_policies(studio_id,effective_at,annual_days,carry_rule) values
  ('b9000000-0000-0000-0000-000000000001','2026-12-15T00:00:00Z',30,'none');
set local role authenticated;
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2027-01-01'),0,'no carryover drops unused days at anniversary');
set local role postgres;
select set_config('request.jwt.claim.sub','b9000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select is((select exceeds from public.project_vacation_request('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2026-12-31','2027-01-02')),true,'cross-anniversary request fails under no carryover');
select throws_like($$insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','vacation','2026-12-31','2027-01-02',true)$$,'%vacation_balance_exceeded%','database rejects a cross-anniversary request under no carryover');
set local role postgres;
insert into private.studio_vacation_policies(studio_id,effective_at,annual_days,carry_rule,carry_cap_days) values
  ('b9000000-0000-0000-0000-000000000001','2026-12-20T00:00:00Z',30,'capped',2);
set local role authenticated;
select is((select exceeds from public.project_vacation_request('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2026-12-31','2027-01-02')),false,'cross-anniversary request fits a two-day carry cap');
select is((select remaining from public.project_vacation_request('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2026-12-31','2027-01-02')),0,'projected remainder includes carryover at the anniversary');
select lives_ok($$insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','vacation','2026-12-31','2027-01-02',true)$$,'database accepts the same cross-anniversary request under a two-day cap');
select throws_like($$select public.save_studio_vacation_policy('b9000000-0000-0000-0000-000000000001',24,'carry_all',null)$$,'%Only active studio administrators%','employee cannot change studio policy');
set local role postgres;
select set_config('request.jwt.claim.sub','b9000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2026-08-01'),14,'one pending future day is reserved before the policy save');
select lives_ok($$select public.save_studio_vacation_policy('b9000000-0000-0000-0000-000000000001',26,'carry_all')$$,'admin saves a prospective policy without a cap');
select is((select annual_days from public.get_studio_vacation_policy('b9000000-0000-0000-0000-000000000001')),26,'saved studio policy is current');
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000011','2026-08-01'),14,'saving now leaves completed historical accrual unchanged');
select is(public.get_vacation_balance('b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000012','2026-04-15'),7,'saving policy leaves the opening balance effective date authoritative');
set local role postgres;
insert into public.studios(id,name) values ('b9000000-0000-0000-0000-000000000002','Future reservation test');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('b9000000-0000-0000-0000-000000000013','authenticated','authenticated','policy-future@example.test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values
('b9000000-0000-0000-0000-000000000013','Policy future','policy-future@example.test','employee');
insert into public.studio_members(studio_id,user_id,system_role,joined_at,vacation_opening_days,vacation_opening_date)
values ('b9000000-0000-0000-0000-000000000002','b9000000-0000-0000-0000-000000000013','employee','2026-01-01',20,'2026-09-24');
select set_config('request.jwt.claim.sub','b9000000-0000-0000-0000-000000000013',true);
set local role authenticated;
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day)
values ('b9000000-0000-0000-0000-000000000002','b9000000-0000-0000-0000-000000000013','vacation','2027-01-02','2027-01-21',true);
select throws_like($$insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day)
values ('b9000000-0000-0000-0000-000000000002','b9000000-0000-0000-0000-000000000013','vacation','2026-09-25','2026-10-04',true)$$,
'%vacation_balance_exceeded%','current vacation cannot consume days reserved after the next anniversary');
select * from finish();
rollback;
