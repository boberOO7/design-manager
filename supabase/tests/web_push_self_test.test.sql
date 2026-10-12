begin;
select no_plan();
insert into public.studios(id,name) values ('75000000-0000-0000-0000-000000000001','Push self-test');
insert into auth.users(id,email) values
  ('75000000-0000-0000-0000-000000000010','push-test-a@example.test'),
  ('75000000-0000-0000-0000-000000000011','push-test-b@example.test');
insert into public.profiles(id,email,full_name,system_role) values
  ('75000000-0000-0000-0000-000000000010','push-test-a@example.test','Push test A','employee'),
  ('75000000-0000-0000-0000-000000000011','push-test-b@example.test','Push test B','employee');
insert into public.studio_members(studio_id,user_id,system_role) values
  ('75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000010','employee'),
  ('75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000011','employee');
insert into auth.sessions(id,user_id) values
  ('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010'),
  ('75000000-0000-0000-0000-000000000021','75000000-0000-0000-0000-000000000010'),
  ('75000000-0000-0000-0000-000000000022','75000000-0000-0000-0000-000000000011');

select set_config('request.jwt.claims','{"sub":"75000000-0000-0000-0000-000000000010","session_id":"75000000-0000-0000-0000-000000000020","role":"authenticated"}',true);
set local role authenticated;
select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/test-a',repeat('B',87),repeat('C',22),repeat('D',87));
select throws_like($$select public.claim_web_push_test('https://fcm.googleapis.com/fcm/send/missing')$$,'%web_push_subscription_missing%','missing subscription cannot request a send');
select is(public.claim_web_push_test('https://fcm.googleapis.com/fcm/send/test-a'),(select id from public.web_push_subscriptions limit 1),'claims only the current owned device');
select throws_like($$select public.claim_web_push_test('https://fcm.googleapis.com/fcm/send/test-a')$$,'%web_push_test_rate_limited%','repeat requests are limited');
select throws_like($$select * from private.web_push_test_limits$$,'%permission denied%','caller cannot change the limiter');

select set_config('request.jwt.claims','{"sub":"75000000-0000-0000-0000-000000000010","session_id":"75000000-0000-0000-0000-000000000021","role":"authenticated"}',true);
select throws_like($$select public.claim_web_push_test('https://fcm.googleapis.com/fcm/send/test-a')$$,'%web_push_subscription_missing%','another session cannot claim this device');
select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/test-a2',repeat('B',87),repeat('C',22),repeat('D',87));
select throws_like($$select public.claim_web_push_test('https://fcm.googleapis.com/fcm/send/test-a2')$$,'%web_push_test_rate_limited%','another device cannot bypass the per-user limit');
delete from public.web_push_subscriptions where endpoint='https://fcm.googleapis.com/fcm/send/test-a2';
select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/test-a2',repeat('B',87),repeat('C',22),repeat('D',87));
select throws_like($$select public.claim_web_push_test('https://fcm.googleapis.com/fcm/send/test-a2')$$,'%web_push_test_rate_limited%','replacing the subscription cannot reset the limiter');

select set_config('request.jwt.claims','{"sub":"75000000-0000-0000-0000-000000000011","session_id":"75000000-0000-0000-0000-000000000022","role":"authenticated"}',true);
select throws_like($$select public.claim_web_push_test('https://fcm.googleapis.com/fcm/send/test-a')$$,'%web_push_subscription_missing%','foreign recipients cannot be claimed');
select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/test-b',repeat('B',87),repeat('C',22),repeat('D',87));
select lives_ok($$select public.claim_web_push_test('https://fcm.googleapis.com/fcm/send/test-b')$$,'another user has an independent allowance');
select set_config('request.jwt.claims','{"sub":"75000000-0000-0000-0000-000000000011","session_id":"75000000-0000-0000-0000-000000000020","role":"authenticated"}',true);
select throws_like($$select public.claim_web_push_test('https://fcm.googleapis.com/fcm/send/test-b')$$,'%active_session_required%','forged session ownership is rejected');

set local role anon;
select throws_like($$select public.claim_web_push_test('https://fcm.googleapis.com/fcm/send/test-a')$$,'%permission denied%','anonymous callers cannot claim tests');
set local role service_role;
select throws_like($$select public.claim_web_push_test('https://fcm.googleapis.com/fcm/send/test-a')$$,'%permission denied%','privileged calls cannot bypass caller-bound checks');
set local role postgres;
update private.web_push_test_limits set requested_at=now()-interval '61 seconds' where user_id='75000000-0000-0000-0000-000000000010';
select set_config('request.jwt.claims','{"sub":"75000000-0000-0000-0000-000000000010","session_id":"75000000-0000-0000-0000-000000000021","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select public.claim_web_push_test('https://fcm.googleapis.com/fcm/send/test-a2')$$,'a new allowance is available after the cooldown');
set local role postgres;
select is((select count(*)::integer from public.web_push_deliveries d join public.web_push_subscriptions s on s.id=d.subscription_id where s.user_id in ('75000000-0000-0000-0000-000000000010','75000000-0000-0000-0000-000000000011')),0,'claiming a test does not create artificial notification jobs');
select * from finish();
rollback;
