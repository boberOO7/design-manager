begin;
select no_plan();

-- A fixture-only view lets the service role inspect expected IDs without changing production grants.
create temporary view fixture_notifications as select * from public.notifications
where studio_id='66000000-0000-0000-0000-000000000001';
grant select on fixture_notifications to authenticated,service_role;

insert into public.studios(id,name) values
  ('66000000-0000-0000-0000-000000000001','Reminder lifecycle'),
  ('66000000-0000-0000-0000-000000000002','Other reminder studio');
insert into auth.users(id,email) values
  ('66000000-0000-0000-0000-000000000010','reminder-admin-a@test'),
  ('66000000-0000-0000-0000-000000000011','reminder-admin-b@test'),
  ('66000000-0000-0000-0000-000000000012','reminder-employee@test'),
  ('66000000-0000-0000-0000-000000000013','reminder-other-admin@test'),
  ('66000000-0000-0000-0000-000000000014','reminder-inactive@test');
insert into public.profiles(id,email,full_name,system_role,is_active) values
  ('66000000-0000-0000-0000-000000000010','reminder-admin-a@test','Reminder A','admin',true),
  ('66000000-0000-0000-0000-000000000011','reminder-admin-b@test','Reminder B','admin',true),
  ('66000000-0000-0000-0000-000000000012','reminder-employee@test','Reminder Employee','employee',true),
  ('66000000-0000-0000-0000-000000000013','reminder-other-admin@test','Reminder Other','admin',true),
  ('66000000-0000-0000-0000-000000000014','reminder-inactive@test','Reminder Inactive','admin',false);
insert into public.studio_members(studio_id,user_id,system_role) values
  ('66000000-0000-0000-0000-000000000001','66000000-0000-0000-0000-000000000010','admin'),
  ('66000000-0000-0000-0000-000000000001','66000000-0000-0000-0000-000000000011','admin'),
  ('66000000-0000-0000-0000-000000000001','66000000-0000-0000-0000-000000000012','employee'),
  ('66000000-0000-0000-0000-000000000002','66000000-0000-0000-0000-000000000013','admin'),
  ('66000000-0000-0000-0000-000000000001','66000000-0000-0000-0000-000000000014','admin');
insert into auth.sessions(id,user_id) values
  ('66000000-0000-0000-0000-000000000020','66000000-0000-0000-0000-000000000010'),
  ('66000000-0000-0000-0000-000000000021','66000000-0000-0000-0000-000000000011');
insert into public.web_push_subscriptions(user_id,session_id,endpoint,p256dh,auth,vapid_public_key)
select user_id,id,'https://fcm.googleapis.com/reminder-'||id,repeat('B',87),repeat('C',22),repeat('D',87)
from auth.sessions where id in ('66000000-0000-0000-0000-000000000020','66000000-0000-0000-0000-000000000021');

-- Keep generation counts independent of the restored local inventory; rollback restores it.
update public.equipment set recurring_maintenance_enabled=false,maintenance_interval_months=null,next_maintenance_due_date=null;
insert into public.equipment(id,studio_id,equipment_type,recurring_maintenance_enabled,maintenance_interval_months,next_maintenance_due_date)
values ('66000000-0000-0000-0000-000000000100','66000000-0000-0000-0000-000000000001','printer',true,6,(now() at time zone 'Europe/Kyiv')::date+10);
select is(public.generate_equipment_maintenance_notifications(),2,'unassigned maintenance falls back only to active same-studio admins');
select is(public.generate_equipment_maintenance_notifications(),0,'repeated generation does not duplicate reminders');
select is((select count(*)::int from public.web_push_deliveries d join fixture_notifications n on n.id=d.notification_id where n.entity_id='66000000-0000-0000-0000-000000000100'),2,'one queued delivery per recipient subscription');

select set_config('request.jwt.claim.sub','66000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select throws_like($$update public.equipment set maintenance_responsible_id='66000000-0000-0000-0000-000000000012' where id='66000000-0000-0000-0000-000000000100'$$,'%maintenance_responsible_must_be_an_active_studio_admin%','employees cannot be selected as responsible');
select throws_like($$update public.equipment set maintenance_responsible_id='66000000-0000-0000-0000-000000000013' where id='66000000-0000-0000-0000-000000000100'$$,'%maintenance_responsible_must_be_an_active_studio_admin%','other-studio administrators cannot be selected');
select throws_like($$update public.equipment set maintenance_responsible_id='66000000-0000-0000-0000-000000000014' where id='66000000-0000-0000-0000-000000000100'$$,'%maintenance_responsible_must_be_an_active_studio_admin%','inactive administrators cannot be selected');
select lives_ok($$update public.equipment set maintenance_responsible_id='66000000-0000-0000-0000-000000000010' where id='66000000-0000-0000-0000-000000000100'$$,'admin can assign separate maintenance responsibility');
set local role postgres;
select is((select count(*)::int from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000100'),0,'assignment cancels previous admin-fallback reminders');
select is((select count(*)::int from public.web_push_deliveries d join public.web_push_subscriptions s on s.id=d.subscription_id where s.user_id in ('66000000-0000-0000-0000-000000000010','66000000-0000-0000-0000-000000000011')),0,'assignment also cancels queued pushes');
select is(public.generate_equipment_maintenance_notifications(),1,'assigned maintenance generates only one reminder');
select is((select recipient_id from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000100'),'66000000-0000-0000-0000-000000000010'::uuid,'only the separate responsible administrator receives it');
create temporary table old_reminders as select id from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000100';
grant select on old_reminders to authenticated,service_role;
set local role service_role;
create temporary table leased_reminders as select * from public.claim_web_push_deliveries();
select is((select count(*)::int from leased_reminders where notification_id in (select id from old_reminders)),1,'assigned reminder can be claimed once');
select is((select count(*)::int from public.claim_web_push_deliveries() where notification_id in (select id from old_reminders)),0,'overlapping claim cannot duplicate a leased reminder');
set local role postgres;
update public.equipment set maintenance_responsible_id='66000000-0000-0000-0000-000000000011' where id='66000000-0000-0000-0000-000000000100';
set local role service_role;
select ok(not public.is_notification_deliverable((select id from old_reminders)),'a leased reminder fails the pre-send check after reassignment');
select public.finish_web_push_delivery(id,lease_token,503) from leased_reminders;
set local role postgres;
select is((select count(*)::int from public.web_push_deliveries where notification_id in (select id from old_reminders)),0,'late retry acknowledgement cannot resurrect a cancelled job');
select is(public.generate_equipment_maintenance_notifications(),1,'new responsible person gets a replacement reminder');
select is(public.generate_equipment_maintenance_notifications(),0,'replacement reminder is deduplicated');
select is((select recipient_id from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000100'),'66000000-0000-0000-0000-000000000011'::uuid,'no reminder remains for the previous assignee');

-- The browser uses the same check, but cannot probe other recipients' reminders.
set local role authenticated;
select ok(not public.is_notification_deliverable((select id from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000100')),'old assignee cannot validate a foreign reminder');
select set_config('request.jwt.claim.sub','66000000-0000-0000-0000-000000000011',true);
select ok(public.is_notification_deliverable((select id from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000100')),'current assignee can validate their unread reminder');
set local role postgres;
update public.notifications set read_at=now() where entity_id='66000000-0000-0000-0000-000000000100';
update public.equipment set next_maintenance_due_date=(now() at time zone 'Europe/Kyiv')::date-1 where id='66000000-0000-0000-0000-000000000100';
select is(public.generate_equipment_maintenance_notifications(),1,'overdue cycle targets the responsible administrator');
create temporary table completing_reminders as select id from fixture_notifications where read_at is null;
grant select on completing_reminders to service_role;
set local role service_role;
select public.finish_web_push_delivery(id,lease_token,503) from public.claim_web_push_deliveries();
set local role postgres;
select ok(exists(select from public.web_push_deliveries where notification_id in (select id from completing_reminders) and last_status=503 and completed_at is null),'completion scenario includes a failed push awaiting retry');
select set_config('request.jwt.claim.sub','66000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select public.start_equipment_service('66000000-0000-0000-0000-000000000100','regular_maintenance',(now() at time zone 'Europe/Kyiv')::date);
select public.complete_equipment_service((select id from public.equipment_service_events where equipment_id='66000000-0000-0000-0000-000000000100' and completed_on is null),(now() at time zone 'Europe/Kyiv')::date,'active');
set local role postgres;
select is((select count(*)::int from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000100' and read_at is null),0,'completion removes all unread reminders for the finished cycle');
select is((select count(*)::int from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000100' and read_at is not null),1,'read reminder history survives completion');
select is(public.generate_equipment_maintenance_notifications(),0,'completed cycle cannot generate further reminders');
set local role service_role;
select is((select count(*)::int from public.claim_web_push_deliveries() where notification_id in (select id from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000100')),0,'completed maintenance has no deliverable queued push');
select ok(not public.is_notification_deliverable((select id from completing_reminders)),'completed cycle also fails the final browser/pre-send check');
set local role postgres;
select is(public.generate_equipment_maintenance_notifications((select next_maintenance_due_date-30 from public.equipment where id='66000000-0000-0000-0000-000000000100')),1,'future recurring cycle can still produce its own reminder');
update public.equipment set recurring_maintenance_enabled=false,maintenance_interval_months=null,next_maintenance_due_date=null where id='66000000-0000-0000-0000-000000000100';
select is((select count(*)::int from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000100' and read_at is null),0,'disabling recurrence cancels pending reminders');
update public.equipment set recurring_maintenance_enabled=true,maintenance_interval_months=6,next_maintenance_due_date=(now() at time zone 'Europe/Kyiv')::date+10 where id='66000000-0000-0000-0000-000000000100';
select is(public.generate_equipment_maintenance_notifications(),1,'reenabled schedule generates once');
update public.equipment set lifecycle_state='retired' where id='66000000-0000-0000-0000-000000000100';
select is((select count(*)::int from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000100' and read_at is null),0,'retirement cancels pending reminders');
select is(public.generate_equipment_maintenance_notifications(),0,'retired maintenance cannot generate reminders');
update public.equipment set lifecycle_state='active' where id='66000000-0000-0000-0000-000000000100';
update public.studio_members set is_active=false where studio_id='66000000-0000-0000-0000-000000000001' and user_id='66000000-0000-0000-0000-000000000011';
select is(public.generate_equipment_maintenance_notifications(),0,'unavailable assigned administrator does not broadcast to other admins');
select ok((select maintenance_upcoming_notified_for is null from public.equipment where id='66000000-0000-0000-0000-000000000100'),'no-recipient run does not consume the reminder threshold');
update public.studio_members set is_active=true where studio_id='66000000-0000-0000-0000-000000000001' and user_id='66000000-0000-0000-0000-000000000011';
select is(public.generate_equipment_maintenance_notifications(),1,'restored assignee can receive the unconsumed threshold');
update public.equipment set maintenance_responsible_id=null where id='66000000-0000-0000-0000-000000000100';
select is(public.generate_equipment_maintenance_notifications(),2,'clearing responsibility restores admin fallback');

-- Simulate an old/stale queued row from before cancellation was implemented.
select private.create_notification('equipment_maintenance_overdue','66000000-0000-0000-0000-000000000001','66000000-0000-0000-0000-000000000010',null,'Old cycle','Old cycle','/office/equipment','equipment','66000000-0000-0000-0000-000000000100',jsonb_build_object('dueDate','2000-01-01'));
set local role service_role;
select is((select count(*)::int from public.claim_web_push_deliveries() c where c.notification_id in (select id from fixture_notifications where metadata->>'dueDate'='2000-01-01')),0,'claim rejects legacy stale cycles even without a mutation trigger');
set local role postgres;
select ok((select bool_and(d.completed_at is not null) from public.web_push_deliveries d join fixture_notifications n on n.id=d.notification_id where n.metadata->>'dueDate'='2000-01-01'),'stale queued work is retired rather than retried forever');

-- Legacy rows can retain the same due date despite a newer completed service.
insert into public.notifications(studio_id,recipient_id,notification_type,title,body,href,entity_type,entity_id,metadata,created_at)
select studio_id,'66000000-0000-0000-0000-000000000010','equipment_maintenance_upcoming','Legacy completed cycle','Legacy completed cycle','/office/equipment','equipment',id,jsonb_build_object('dueDate',next_maintenance_due_date),now()-interval '1 day'
from public.equipment where id='66000000-0000-0000-0000-000000000100';
set local role service_role;
select ok(not public.is_notification_deliverable((select id from fixture_notifications where title='Legacy completed cycle')),'a newer regular-maintenance completion invalidates even a matching legacy due date');
set local role postgres;

-- A backdated completion may calculate the same due date: it still ends the old cycle.
insert into public.equipment(id,studio_id,equipment_type,recurring_maintenance_enabled,maintenance_interval_months,next_maintenance_due_date,maintenance_responsible_id)
values ('66000000-0000-0000-0000-000000000101','66000000-0000-0000-0000-000000000001','printer',true,6,(now() at time zone 'Europe/Kyiv')::date+10,'66000000-0000-0000-0000-000000000010');
select is(public.generate_equipment_maintenance_notifications(),1,'backdated scenario has an outstanding reminder');
select set_config('request.jwt.claim.sub','66000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select public.start_equipment_service('66000000-0000-0000-0000-000000000101','regular_maintenance',(((now() at time zone 'Europe/Kyiv')::date+10)-interval '6 months')::date);
select public.complete_equipment_service((select id from public.equipment_service_events where equipment_id='66000000-0000-0000-0000-000000000101' and completed_on is null),(((now() at time zone 'Europe/Kyiv')::date+10)-interval '6 months')::date,'active');
set local role postgres;
select is((select next_maintenance_due_date from public.equipment where id='66000000-0000-0000-0000-000000000101'),(now() at time zone 'Europe/Kyiv')::date+10,'backdated completion intentionally leaves the due date unchanged');
select is((select count(*)::int from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000101' and read_at is null),0,'completion cancels the old reminder even when the date does not change');
select is(public.generate_equipment_maintenance_notifications(),1,'the new cycle can generate independently of the completed one');
select is(public.generate_equipment_maintenance_notifications(),0,'the new same-date cycle is still deduplicated');

-- CRM uses the same queue: its future created_at is the scheduled delivery time.
insert into public.crm_leads(id,studio_id,client_name,first_contact_date,next_contact_at,responsible_admin_id)
values ('66000000-0000-0000-0000-000000000200','66000000-0000-0000-0000-000000000001','Future follow-up',current_date,now()+interval '1 day','66000000-0000-0000-0000-000000000010');
select ok((select bool_and(d.next_attempt_at=n.created_at) from public.web_push_deliveries d join fixture_notifications n on n.id=d.notification_id where n.entity_id='66000000-0000-0000-0000-000000000200'),'future follow-up jobs are scheduled at the notification timestamp');
-- Even an old queue row with the wrong attempt time must not be claimed early.
update public.web_push_deliveries set next_attempt_at=now() where notification_id in (select id from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000200');
set local role service_role;
select is((select count(*)::int from public.claim_web_push_deliveries() c where c.notification_id in (select id from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000200')),0,'shared claim cannot deliver future follow-ups early');
select ok(not public.is_notification_deliverable((select id from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000200')),'browser/pre-send validation also rejects future reminders');
set local role postgres;
update public.crm_leads set next_contact_at=now()-interval '1 minute' where id='66000000-0000-0000-0000-000000000200';
set local timezone='Europe/Kyiv';
set local role service_role;
select ok(public.is_notification_deliverable((select id from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000200')),'CRM timestamp validation survives a connection timezone change');
select is((select count(*)::int from public.claim_web_push_deliveries() c where c.notification_id in (select id from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000200')),1,'shared queue delivers the current due CRM reminder');
set local role postgres;
update public.crm_leads set responsible_admin_id='66000000-0000-0000-0000-000000000011' where id='66000000-0000-0000-0000-000000000200';
select is((select count(*)::int from fixture_notifications where entity_id='66000000-0000-0000-0000-000000000200' and read_at is null),1,'CRM reassignment retains only its replacement reminder');
update public.crm_leads set status='invalid' where id='66000000-0000-0000-0000-000000000200';
select is((select count(*)::int from public.web_push_deliveries d join fixture_notifications n on n.id=d.notification_id where n.entity_id='66000000-0000-0000-0000-000000000200'),0,'CRM cancellation cascades to all pending delivery work');

set local role anon;
select throws_like($$select public.is_notification_deliverable(gen_random_uuid())$$,'%permission denied%','anonymous callers cannot validate notification identities');
select * from finish();
rollback;
