begin;
set search_path to public, extensions;
select plan(25);

insert into public.studios(id, name) values ('a9000000-0000-0000-0000-000000000001', 'Vacation balance test');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a9000000-0000-0000-0000-000000000010','authenticated','authenticated','vac-admin-1@example.test','{}','{}',now(),now()),
  ('a9000000-0000-0000-0000-000000000011','authenticated','authenticated','vac-admin-2@example.test','{}','{}',now(),now()),
  ('a9000000-0000-0000-0000-000000000012','authenticated','authenticated','vac-employee-a@example.test','{}','{}',now(),now()),
  ('a9000000-0000-0000-0000-000000000013','authenticated','authenticated','vac-employee-b@example.test','{}','{}',now(),now());
insert into public.profiles(id, full_name, email, system_role) values
  ('a9000000-0000-0000-0000-000000000010','Vacation admin one','vac-admin-1@example.test','admin'),
  ('a9000000-0000-0000-0000-000000000011','Vacation admin two','vac-admin-2@example.test','admin'),
  ('a9000000-0000-0000-0000-000000000012','Vacation employee A','vac-employee-a@example.test','employee'),
  ('a9000000-0000-0000-0000-000000000013','Vacation employee B','vac-employee-b@example.test','employee');
insert into public.studio_members(studio_id, user_id, system_role, joined_at) values
  ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000010','admin','2020-01-01'),
  ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000011','admin','2020-01-01'),
  ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','employee','2026-01-31'),
  ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000013','employee','2020-01-01');

select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000012',true);
set local role authenticated;
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-02-27'),0,'no accrual before a completed month');
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-02-28'),2,'month-end anniversary accrues two days');
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-03-31'),4,'second completed month accrues without year reset');
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-09-30'),16,'accrual carries into a later month');
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-10-31'),18,'future completed month is available for future vacation');
select throws_like($$select public.set_vacation_opening_balance('a9000000-0000-0000-0000-000000000013',7,'2026-01-01')$$,'%Only an active studio administrator%','employee cannot set a baseline');
select throws_like($$select public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000013','2026-01-01')$$,'%Vacation balance is unavailable%','employee cannot read a coworker balance');

set local role postgres;
select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000010',true);
set local role authenticated;
set local role postgres;
update public.studio_members set joined_at = null where user_id='a9000000-0000-0000-0000-000000000013';
set local role authenticated;
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000013','2026-01-01'),null::integer,'missing employment start and opening balance is unknown, not zero');
set local role postgres;
update public.studio_members set joined_at = '2020-01-01' where user_id='a9000000-0000-0000-0000-000000000013';
set local role authenticated;
select throws_like($$insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000013','vacation','2025-12-01','2025-12-05',true)$$,'%Time-off requests must belong to the authenticated user%','self-service admin cannot create another employee request');
set local role postgres;
select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000013',true);
set local role authenticated;
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000013','vacation','2025-12-01','2025-12-05',true);
set local role postgres;
select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$select public.set_vacation_opening_balance('a9000000-0000-0000-0000-000000000013',7,'2026-01-01')$$,'admin sets an opening balance');
select lives_ok($$select public.set_vacation_opening_balance('a9000000-0000-0000-0000-000000000010',5,'2026-01-01')$$,'administrator can set their own opening balance');
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000013','2026-01-01'),7,'opening balance excludes earlier vacation history');
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000013','2026-02-01'),9,'accrual resumes from opening date');
set local role postgres;
update public.studio_members set joined_at = null where user_id='a9000000-0000-0000-0000-000000000013';
set local role authenticated;
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000013','2026-02-01'),9,'opening date anchors accrual when legacy start date is absent');
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000013','2027-01-01'),31,'unused opening days and accrual carry across calendar years');

set local role postgres;
select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000012',true);
set local role authenticated;
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','vacation','2026-10-31','2026-11-14',true);
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-10-31'),3,'pending request reserves inclusive calendar days');
select throws_like($$insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','vacation','2026-11-20','2026-11-23',true)$$,'%vacation_balance_exceeded%','a request exceeding available balance is rejected');

set local role postgres;
select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select public.reject_time_off_request((select id from public.time_off_requests where user_id='a9000000-0000-0000-0000-000000000012' and start_date='2026-10-31'));
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-10-31'),18,'rejection restores the reservation');

set local role postgres;
select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000012',true);
set local role authenticated;
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','vacation','2026-10-31','2026-11-14',true);
set local role postgres;
select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select public.approve_time_off_request((select id from public.time_off_requests where user_id='a9000000-0000-0000-0000-000000000012' and start_date='2026-10-31' and status='pending'));
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-10-31'),3,'first approval keeps the request reserved');
set local role postgres;
select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select public.approve_time_off_request((select id from public.time_off_requests where user_id='a9000000-0000-0000-0000-000000000012' and start_date='2026-10-31' and status='pending'));
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-10-31'),3,'approved request remains reserved');
update public.time_off_requests set status='cancelled',cancelled_at=now() where user_id='a9000000-0000-0000-0000-000000000012' and start_date='2026-10-31' and status='approved';
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-10-31'),18,'cancelling approved vacation restores days');
set local role postgres;
select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000012',true);
set local role authenticated;
select lives_ok($$insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','vacation','2026-10-31','2026-11-16',true)$$,'future request may use accrual not yet earned today');
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-10-31'),1,'future projected remainder matches enforced balance');
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day) values ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','vacation','2026-11-20','2026-11-20',true);
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-10-31'),0,'pending single-day vacation reserves its day');
update public.time_off_requests set status='cancelled',cancelled_at=now() where user_id='a9000000-0000-0000-0000-000000000012' and start_date='2026-11-20' and status='pending';
select is(public.get_vacation_balance('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000012','2026-10-31'),1,'cancelling pending vacation restores its day');
select * from finish();
rollback;
