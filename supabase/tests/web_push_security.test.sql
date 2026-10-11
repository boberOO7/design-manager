begin;
select no_plan();
-- pg_net work is transactional and will not leave this rolled-back fixture.
select private.configure_web_push_dispatch('https://push.example.test/api/push/dispatch', 'test-worker-secret');
insert into public.studios(id,name) values ('65000000-0000-0000-0000-000000000001','Push security');
insert into auth.users(id,email) values
  ('65000000-0000-0000-0000-000000000010','push-a@example.test'),
  ('65000000-0000-0000-0000-000000000011','push-b@example.test');
insert into public.profiles(id,email,full_name,system_role) values
  ('65000000-0000-0000-0000-000000000010','push-a@example.test','Push A','employee'),
  ('65000000-0000-0000-0000-000000000011','push-b@example.test','Push B','employee');
insert into public.studio_members(studio_id,user_id,system_role) values
  ('65000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000010','employee'),
  ('65000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000011','employee');
insert into auth.sessions(id,user_id) values
  ('65000000-0000-0000-0000-000000000020','65000000-0000-0000-0000-000000000010'),
  ('65000000-0000-0000-0000-000000000021','65000000-0000-0000-0000-000000000010'),
  ('65000000-0000-0000-0000-000000000022','65000000-0000-0000-0000-000000000011');

select set_config('request.jwt.claims','{"sub":"65000000-0000-0000-0000-000000000010","session_id":"65000000-0000-0000-0000-000000000020","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/device-a',repeat('B',87),repeat('C',22),repeat('D',87),'uk')$$,'register own session');
select lives_ok($$select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/device-a',repeat('B',87),repeat('C',22),repeat('D',87),'en')$$,'registration is idempotent');
select is((select count(*)::integer from public.web_push_subscriptions),1,'one row per endpoint');
select throws_like($$insert into public.web_push_subscriptions(user_id,session_id,endpoint,p256dh,auth,vapid_public_key) values ('65000000-0000-0000-0000-000000000011','65000000-0000-0000-0000-000000000022','https://fcm.googleapis.com/forged',repeat('B',87),repeat('C',22),repeat('D',87))$$,'%permission denied%','no direct recipient registration');
select throws_like($$update public.web_push_subscriptions set user_id='65000000-0000-0000-0000-000000000011'$$,'%permission denied%','ownership cannot be reassigned');
select throws_like($$select public.claim_web_push_deliveries()$$,'%permission denied%','browser cannot dispatch');
select throws_like($$select public.finish_web_push_delivery(gen_random_uuid(),gen_random_uuid(),201)$$,'%permission denied%','browser cannot acknowledge jobs');
select throws_like($$select public.complete_web_push_dispatch(gen_random_uuid(),true)$$,'%permission denied%','browser cannot acknowledge or initiate webhooks');
select throws_like($$select private.configure_web_push_dispatch('https://attacker.test/api/push/dispatch','attacker')$$,'%permission denied%','browser cannot change webhook credentials or URL');
select throws_like($$select * from private.web_push_dispatch_state$$,'%permission denied%','browser cannot access dispatch state');
select throws_like($$select public.register_web_push_subscription('https://127.0.0.1/private',repeat('B',87),repeat('C',22),repeat('D',87))$$,'%check constraint%','private network endpoint rejected');

select set_config('request.jwt.claims','{"sub":"65000000-0000-0000-0000-000000000010","session_id":"65000000-0000-0000-0000-000000000021","role":"authenticated"}',true);
select lives_ok($$select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/device-b',repeat('B',87),repeat('C',22),repeat('D',87))$$,'another device is supported');
select is((select count(*)::integer from public.web_push_subscriptions),2,'two devices are retained');

select set_config('request.jwt.claims','{"sub":"65000000-0000-0000-0000-000000000011","session_id":"65000000-0000-0000-0000-000000000022","role":"authenticated"}',true);
select is((select count(*)::integer from public.web_push_subscriptions),0,'another user cannot read capabilities');
select lives_ok($$delete from public.web_push_subscriptions$$,'other-user unsubscribe is a no-op');
select throws_like($$select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/device-a',repeat('B',87),repeat('C',22),repeat('D',87))$$,'%subscription_owner_mismatch%','endpoint cannot be taken over');
select set_config('request.jwt.claims','{"sub":"65000000-0000-0000-0000-000000000011","session_id":"65000000-0000-0000-0000-000000000020","role":"authenticated"}',true);
select throws_like($$select public.register_web_push_subscription('https://fcm.googleapis.com/forged-session',repeat('B',87),repeat('C',22),repeat('D',87))$$,'%active_session_required%','session must belong to actor');
set local role anon;
select throws_like($$select public.register_web_push_subscription('https://fcm.googleapis.com/anon',repeat('B',87),repeat('C',22),repeat('D',87))$$,'%permission denied%','anonymous registration rejected');

set local role postgres;
select is((select count(*)::integer from public.web_push_subscriptions),2,'foreign delete preserves both devices');
select private.create_notification('task_assigned','65000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000010','65000000-0000-0000-0000-000000000011','Private task','Private body','/my-tasks',null,null);
select is((select count(*)::integer from public.web_push_deliveries),2,'actual centralized notification queues one delivery per device');
create temporary table push_dispatch as select dispatch_id,request_id from private.web_push_dispatch_state;
grant select on push_dispatch to service_role;
select ok((select dispatch_id is not null and request_id is not null from push_dispatch),'notification insert automatically requests the dispatcher');
select is((select convert_from(body,'UTF8')::jsonb->>'dispatchId' from net.http_request_queue where id=(select request_id from push_dispatch)),(select dispatch_id::text from push_dispatch),'webhook body carries only the correlated dispatch ID');
select is((select headers->>'Authorization' from net.http_request_queue where id=(select request_id from push_dispatch)),'Bearer test-worker-secret','webhook uses the encrypted server credential');
select private.request_web_push_dispatch();
select is((select request_id from private.web_push_dispatch_state),(select request_id from push_dispatch),'in-flight requests are coalesced across subscriptions');
select ok(exists(select from cron.job where jobname='studioflow-web-push-retry' and command='select private.retry_web_push_dispatch();'),'watchdog contains no credential or endpoint');
select is((select count(*)::integer from public.notifications where read_at is null and studio_id='65000000-0000-0000-0000-000000000001'),1,'enqueue preserves history/read state');
set local role service_role;
create temporary table push_claims as select * from public.claim_web_push_deliveries();
select is((select count(*)::integer from push_claims),2,'worker claims both devices');
select is((select count(*)::integer from public.claim_web_push_deliveries()),0,'overlapping worker cannot claim leased jobs');
select public.finish_web_push_delivery(id,gen_random_uuid(),201) from push_claims;
set local role postgres;
select is((select count(*)::integer from public.web_push_deliveries where completed_at is not null),0,'stale lease cannot acknowledge');
set local role service_role;
select public.finish_web_push_delivery(id,lease_token,201) from push_claims where endpoint like '%device-a';
select public.finish_web_push_delivery(id,lease_token,503) from push_claims where endpoint like '%device-b';
set local role postgres;
select is((select count(*)::integer from public.web_push_deliveries where completed_at is not null),1,'accepted delivery completes once');
select ok((select next_attempt_at>now() from public.web_push_deliveries where last_status=503),'transient failure is retried later');
set local role service_role;
select public.complete_web_push_dispatch(gen_random_uuid(),false);
set local role postgres;
select is((select dispatch_id from private.web_push_dispatch_state),(select dispatch_id from push_dispatch),'stale webhook acknowledgement cannot overwrite current dispatch');
set local role service_role;
select public.complete_web_push_dispatch(dispatch_id,true) from push_dispatch;
set local role postgres;
select ok((select dispatch_id is null and wake_at is not null from private.web_push_dispatch_state),'provider failure arms a pending-work retry timer');
update public.web_push_deliveries set next_attempt_at=now() where completed_at is null;
select private.retry_web_push_dispatch();
select ok((select dispatch_id is not null from private.web_push_dispatch_state),'retry timer dispatches due work through the same webhook');
update private.web_push_dispatch_state set requested_at=clock_timestamp()-interval '71 seconds';
select private.retry_web_push_dispatch();
select ok((select dispatch_id is null and failures=1 and retry_after>now() and wake_at is not null from private.web_push_dispatch_state),'lost HTTP request schedules durable backoff');
update private.web_push_dispatch_state set retry_after=clock_timestamp()-interval '1 second';
select private.retry_web_push_dispatch();
select ok((select dispatch_id is not null from private.web_push_dispatch_state),'watchdog recovers lost/unlogged pg_net requests');
set local role service_role;
select public.finish_web_push_delivery(id,lease_token,410) from public.claim_web_push_deliveries();
set local role postgres;
select is((select count(*)::integer from public.web_push_subscriptions),1,'expired endpoint removed');
select private.request_web_push_dispatch();
select is((select count(*)::integer from cron.job where jobname='studioflow-web-push-retry'),0,'empty queue has no polling job');
select private.create_notification('task_assigned','65000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000010','65000000-0000-0000-0000-000000000011','Another task','Private body','/my-tasks',null,null);
update public.notifications set read_at=now() where studio_id='65000000-0000-0000-0000-000000000001' and read_at is null;
set local role service_role;
select is((select count(*)::integer from public.claim_web_push_deliveries()),0,'read notifications are skipped');
set local role postgres;
delete from auth.sessions where id='65000000-0000-0000-0000-000000000020';
select is((select count(*)::integer from public.web_push_subscriptions),0,'logout deletes session-bound subscription');
select is((select count(*)::integer from public.web_push_deliveries),0,'logout removes queued and completed delivery records');
select set_config('request.jwt.claims','{"sub":"65000000-0000-0000-0000-000000000010","session_id":"65000000-0000-0000-0000-000000000021","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/device-c',repeat('B',87),repeat('C',22),repeat('D',87))$$,'remaining session can opt in again');
set local role postgres;
update auth.sessions set not_after=now()-interval '1 minute' where id='65000000-0000-0000-0000-000000000021';
set local role authenticated;
select throws_like($$select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/expired-session',repeat('B',87),repeat('C',22),repeat('D',87))$$,'%active_session_required%','expired session cannot register');
set local role service_role;
select is((select count(*)::integer from public.claim_web_push_deliveries()),0,'expired sessions cannot dispatch');
set local role postgres;
select is((select count(*)::integer from public.web_push_subscriptions),0,'worker cleans time-expired sessions');
select * from finish();
rollback;
