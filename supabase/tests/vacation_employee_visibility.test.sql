begin;
set search_path to public, extensions;
select plan(14);

insert into public.studios(id, name) values ('c9000000-0000-0000-0000-000000000001', 'Vacation visibility test');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('c9000000-0000-0000-0000-000000000010','authenticated','authenticated','visibility-admin@example.test','{}','{}',now(),now()),
  ('c9000000-0000-0000-0000-000000000011','authenticated','authenticated','visibility-employee@example.test','{}','{}',now(),now());
insert into public.profiles(id, full_name, email, system_role) values
  ('c9000000-0000-0000-0000-000000000010','Visibility admin','visibility-admin@example.test','admin'),
  ('c9000000-0000-0000-0000-000000000011','Visibility employee','visibility-employee@example.test','employee');
insert into public.studio_members(studio_id,user_id,system_role,joined_at) values
  ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000010','admin','2026-01-01'),
  ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000011','employee','2026-01-01');

select set_config('request.jwt.claim.sub','c9000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select is((select vacation_visible_to_employees from public.studios where id = 'c9000000-0000-0000-0000-000000000001'),true,'vacation starts visible');
select lives_ok($$insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000011','vacation','2026-10-01','2026-10-01',true)$$,'employee can request vacation while visible');
select set_config('vacation_visibility.balance_before', public.get_vacation_balance('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000011','2026-10-01')::text, true);
select throws_like($$select public.set_vacation_employee_visibility('c9000000-0000-0000-0000-000000000001',false)$$,'%Only active studio administrators%','employee cannot toggle visibility');
set local role postgres;
select set_config('request.jwt.claim.sub','c9000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$select public.set_vacation_employee_visibility('c9000000-0000-0000-0000-000000000001',false)$$,'admin hides employee vacation balance');
select is((select vacation_visible_to_employees from public.studios where id = 'c9000000-0000-0000-0000-000000000001'),false,'visibility persists');
select lives_ok($$insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000010','vacation','2026-10-02','2026-10-02',true)$$,'admin vacation creation remains available');
set local role postgres;
select set_config('request.jwt.claim.sub','c9000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select is(public.get_vacation_balance('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000011','2026-10-01')::text,current_setting('vacation_visibility.balance_before'),'hiding leaves vacation balance unchanged');
select lives_ok($$insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000011','vacation','2026-10-02','2026-10-02',true)$$,'employee can still request vacation while balance is hidden');
select set_config('vacation_visibility.balance_after_request', public.get_vacation_balance('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000011','2026-10-01')::text, true);
select lives_ok($$insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day,private_note) values ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000011','sick_leave','2026-10-02','2026-10-02',true,'Ill')$$,'sick leave remains available');
select is((select count(*)::integer from public.time_off_requests where studio_id = 'c9000000-0000-0000-0000-000000000001' and user_id = 'c9000000-0000-0000-0000-000000000011' and request_type = 'vacation'),2,'existing and new employee vacation requests remain');
set local role postgres;
select set_config('request.jwt.claim.sub','c9000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$select public.set_vacation_employee_visibility('c9000000-0000-0000-0000-000000000001',true)$$,'admin re-enables vacation');
select is((select vacation_visible_to_employees from public.studios where id = 'c9000000-0000-0000-0000-000000000001'),true,'visibility restores');
set local role postgres;
select set_config('request.jwt.claim.sub','c9000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select is(public.get_vacation_balance('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000011','2026-10-01')::text,current_setting('vacation_visibility.balance_after_request'),'re-enabling leaves the current balance unchanged');
select lives_ok($$insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000011','vacation','2026-10-03','2026-10-03',true)$$,'employee can request vacation again');
select * from finish();
rollback;
