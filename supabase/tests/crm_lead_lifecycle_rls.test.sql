begin;
select plan(28);

select is((select relrowsecurity from pg_class where oid = 'public.crm_lead_history'::regclass), true, 'lead history RLS is enabled');

insert into public.studios(id, name) values
  ('52000000-0000-0000-0000-000000000001', 'CRM lifecycle A'),
  ('52000000-0000-0000-0000-000000000002', 'CRM lifecycle B');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('52000000-0000-0000-0000-000000000010','authenticated','authenticated','crm-lifecycle-admin-a@test','{}','{}',now(),now()),
  ('52000000-0000-0000-0000-000000000011','authenticated','authenticated','crm-lifecycle-admin-a2@test','{}','{}',now(),now()),
  ('52000000-0000-0000-0000-000000000012','authenticated','authenticated','crm-lifecycle-employee@test','{}','{}',now(),now()),
  ('52000000-0000-0000-0000-000000000013','authenticated','authenticated','crm-lifecycle-admin-b@test','{}','{}',now(),now());
insert into public.profiles(id, full_name, email, system_role) values
  ('52000000-0000-0000-0000-000000000010','Lifecycle Admin A','crm-lifecycle-admin-a@test','admin'),
  ('52000000-0000-0000-0000-000000000011','Lifecycle Admin A2','crm-lifecycle-admin-a2@test','admin'),
  ('52000000-0000-0000-0000-000000000012','Lifecycle Employee','crm-lifecycle-employee@test','employee'),
  ('52000000-0000-0000-0000-000000000013','Lifecycle Admin B','crm-lifecycle-admin-b@test','admin');
insert into public.studio_members(studio_id,user_id,system_role) values
  ('52000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000010','admin'),
  ('52000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000011','admin'),
  ('52000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000012','employee'),
  ('52000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000013','admin');

select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$insert into public.crm_leads(id, studio_id, client_name, first_contact_date, next_contact_date, responsible_admin_id) values ('52000000-0000-0000-0000-000000000100','52000000-0000-0000-0000-000000000001','Vasyl','2026-09-09',current_date + 5,'52000000-0000-0000-0000-000000000010')$$, 'admin creates a lead with a follow-up');
select is((select count(*)::integer from public.crm_lead_history where lead_id='52000000-0000-0000-0000-000000000100'),1,'lead creation creates one history row');
select is((select actor_id from public.crm_lead_history where lead_id='52000000-0000-0000-0000-000000000100'),'52000000-0000-0000-0000-000000000010'::uuid,'creation history retains the actor');
select is((select count(*)::integer from public.notifications where entity_id='52000000-0000-0000-0000-000000000100' and notification_type='crm_lead_follow_up'),1,'lead has one reminder notification');
select is((select (created_at at time zone 'Europe/Kyiv')::date from public.notifications where entity_id='52000000-0000-0000-0000-000000000100'),current_date + 5,'reminder is scheduled for the contact date');

select lives_ok($$update public.crm_leads set status='contacted' where id='52000000-0000-0000-0000-000000000100'$$,'admin changes status directly');
select is((select count(*)::integer from public.crm_lead_history where lead_id='52000000-0000-0000-0000-000000000100'),2,'status change appends history');
select is((select previous_status::text || '>' || new_status::text from public.crm_lead_history where event_type='status_changed' and lead_id='52000000-0000-0000-0000-000000000100'),'new>contacted','status history retains both states');
select is((select actor_id from public.crm_lead_history where event_type='status_changed' and lead_id='52000000-0000-0000-0000-000000000100'),'52000000-0000-0000-0000-000000000010'::uuid,'status history retains the actor');
select lives_ok($$update public.crm_leads set company='Studio' where id='52000000-0000-0000-0000-000000000100'$$,'ordinary lead edits still save');
select is((select count(*)::integer from public.notifications where entity_id='52000000-0000-0000-0000-000000000100' and read_at is null),1,'unrelated repeated saves do not duplicate reminders');

select lives_ok($$update public.crm_leads set next_contact_date=current_date + 7 where id='52000000-0000-0000-0000-000000000100'$$,'changing the date reschedules the reminder');
select is((select count(*)::integer from public.notifications where entity_id='52000000-0000-0000-0000-000000000100' and read_at is null),1,'rescheduling keeps one pending reminder');
select is((select (created_at at time zone 'Europe/Kyiv')::date from public.notifications where entity_id='52000000-0000-0000-0000-000000000100'),current_date + 7,'rescheduled reminder uses the new date');
select lives_ok($$update public.crm_leads set responsible_admin_id='52000000-0000-0000-0000-000000000011' where id='52000000-0000-0000-0000-000000000100'$$,'changing responsible admin transfers the reminder');
set local role postgres;
select is((select recipient_id from public.notifications where entity_id='52000000-0000-0000-0000-000000000100'),'52000000-0000-0000-0000-000000000011'::uuid,'pending reminder belongs to the new responsible admin');
set local role authenticated;
select lives_ok($$update public.crm_leads set next_contact_date=null where id='52000000-0000-0000-0000-000000000100'$$,'clearing the date cancels the reminder');
select is((select count(*)::integer from public.notifications where entity_id='52000000-0000-0000-0000-000000000100'),0,'clearing removes the pending reminder');
select lives_ok($$update public.crm_leads set responsible_admin_id=null, next_contact_date=current_date + 8 where id='52000000-0000-0000-0000-000000000100'$$,'date remains valid without a responsible admin');
select is((select next_contact_date from public.crm_leads where id='52000000-0000-0000-0000-000000000100'),current_date + 8,'date is preserved without silently assigning an admin');
select is((select count(*)::integer from public.notifications where entity_id='52000000-0000-0000-0000-000000000100'),0,'no reminder is created without a responsible admin');

set local role postgres;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000012',true);
set local role authenticated;
select is((select count(*)::integer from public.crm_lead_history),0,'employee cannot discover lead history');
select throws_like($$insert into public.crm_lead_history(studio_id,lead_id,event_type,new_status) values ('52000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000100','created','new')$$,'%permission denied%','employee cannot forge lead history');

set local role postgres;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000013',true);
set local role authenticated;
select is((select count(*)::integer from public.crm_lead_history),0,'other studio admin cannot see lead history');

set local role postgres;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$update public.crm_leads set responsible_admin_id='52000000-0000-0000-0000-000000000010' where id='52000000-0000-0000-0000-000000000100'$$,'assigning an admin restores one reminder');
select lives_ok($$delete from public.crm_leads where id='52000000-0000-0000-0000-000000000100'$$,'admin deletes the lead');
select is((select count(*)::integer from public.notifications where entity_id='52000000-0000-0000-0000-000000000100'),0,'deleting the lead leaves no orphan reminder');

select * from finish();
rollback;
