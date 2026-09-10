begin;

select plan(11);

insert into public.studios (id, name)
values ('91000000-0000-0000-0000-000000000001', 'Time-off privacy studio');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('91000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'time-off-admin@example.test', '{}', '{}', now(), now()),
  ('91000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'time-off-employee@example.test', '{}', '{}', now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('91000000-0000-0000-0000-000000000010', 'Time-off admin', 'time-off-admin@example.test', 'admin'),
  ('91000000-0000-0000-0000-000000000011', 'Time-off employee', 'time-off-employee@example.test', 'employee');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000010', 'admin'),
  ('91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000011', 'employee');

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select throws_like(
  $$insert into public.time_off_requests (studio_id, user_id, request_type, start_date, end_date, all_day, private_note) values ('91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000011', 'sick_leave', '2030-01-01', '2030-01-01', true, null)$$,
  '%reason is required%',
  'direct sick-leave writes require a reason'
);
select lives_ok(
  $$insert into public.time_off_requests (studio_id, user_id, request_type, start_date, end_date, all_day, private_note) values ('91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000011', 'sick_leave', '2030-01-01', '2030-01-01', true, 'Medical recovery')$$,
  'sick leave with a reason is accepted'
);

set local role postgres;
insert into public.notifications (studio_id, recipient_id, actor_id, notification_type, title, body, href, entity_type, entity_id, read_at)
select '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000011', 'time_off_request_submitted', 'Read time-off submission', 'This submission was already read.', '/calendar?requestId=' || id, 'time_off_request', id, now()
from public.time_off_requests
where user_id = '91000000-0000-0000-0000-000000000011' and start_date = '2030-01-01';
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok(
  $$select public.approve_time_off_request((select id from public.time_off_requests where user_id = '91000000-0000-0000-0000-000000000011' and start_date = '2030-01-01'))$$,
  'approval succeeds when a submission notification was already read'
);
select is((select status from public.time_off_requests where user_id = '91000000-0000-0000-0000-000000000011' and start_date = '2030-01-01'), 'approved', 'approval status is recorded normally');
select is((select count(*)::integer from public.notifications where title = 'Read time-off submission' and read_at is not null), 1, 'approval does not attempt to rewrite an already-read notification');

set local role postgres;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select lives_ok(
  $$insert into public.time_off_requests (studio_id, user_id, request_type, start_date, end_date, all_day, private_note) values ('91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000011', 'sick_leave', '2030-01-02', '2030-01-02', true, 'Medical follow-up')$$,
  'a second sick-leave request remains valid for rejection'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok(
  $$select public.reject_time_off_request((select id from public.time_off_requests where user_id = '91000000-0000-0000-0000-000000000011' and start_date = '2030-01-02'), 'Private admin review')$$,
  'an active admin can store a review note through the guarded review RPC'
);
select is((select note from public.time_off_request_reviews), 'Private admin review', 'admin can read the private review note');

set local role postgres;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select is((select count(*)::integer from public.time_off_request_reviews), 0, 'request author cannot read review notes through the Data API role');
select is((select count(*)::integer from public.time_off_requests where user_id = '91000000-0000-0000-0000-000000000011'), 2, 'request author still reads their requests without review data');

set local role postgres;
select hasnt_column('public', 'time_off_requests', 'review_note', 'the employee-readable request table no longer carries review notes');

select * from finish();
rollback;
