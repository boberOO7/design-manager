begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
-- All fixture writes, pg_net requests and delivery claims roll back; no push is sent.
insert into public.studios(id,name) values
  ('67000000-0000-4000-8000-000000000001','Meta notification A'),
  ('67000000-0000-4000-8000-000000000002','Meta notification B');
insert into auth.users(id,email)
select ('67000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,'meta-notification-' || i || '@example.test'
from generate_series(10,15) i;
insert into public.profiles(id,email,full_name,system_role,is_active)
select ('67000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,'meta-notification-' || i || '@example.test',
  'Meta recipient ' || i,case when i=12 then 'employee' else 'admin' end,i<>14
from generate_series(10,15) i;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select case when i=15 then '67000000-0000-4000-8000-000000000002' else '67000000-0000-4000-8000-000000000001' end::uuid,
  ('67000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,case when i=12 then 'employee' else 'admin' end,i<>13
from generate_series(10,15) i;
insert into auth.sessions(id,user_id)
select ('67000000-0000-4000-8000-' || lpad((i+100)::text,12,'0'))::uuid,
  ('67000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid from generate_series(10,15) i;
insert into public.web_push_subscriptions(user_id,session_id,endpoint,p256dh,auth,vapid_public_key)
select ('67000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
  ('67000000-0000-4000-8000-' || lpad((i+100)::text,12,'0'))::uuid,
  'https://fcm.googleapis.com/fcm/send/meta-notifications-' || i,repeat('B',87),repeat('C',22),repeat('D',87)
from generate_series(10,15) i;
insert into public.meta_lead_forms(page_id,form_id,studio_id,sync_enabled)
values('670','789','67000000-0000-4000-8000-000000000001',true);

create function pg_temp.complete_meta_fixture(p_id text,p_source text default 'instagram',p_phone text default null)
returns uuid language plpgsql as $$
declare lease uuid;
begin
  select lease_token into strict lease from public.claim_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001',5,array[p_id]);
  update public.meta_lead_jobs set payload=jsonb_build_object('id',p_id),submitted_at='2026-10-12T10:00:00Z'
    where page_id='670' and leadgen_id=p_id;
  return public.complete_meta_lead_job('670',p_id,'67000000-0000-4000-8000-000000000001',lease,
    jsonb_build_object('client_name','Наталія','source',p_source,'phone',p_phone));
end;
$$;

set local role service_role;
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"101","form_id":"789","notify_admins":true}]');
select pg_temp.complete_meta_fixture('101','instagram','+380501234567');
set local role postgres;
select is((select count(*)::integer from public.notifications where studio_id='67000000-0000-4000-8000-000000000001' and notification_type='meta_lead_created'),2,'new webhook lead notifies both active administrators');
select is((select count(distinct recipient_id)::integer from public.notifications where studio_id='67000000-0000-4000-8000-000000000001'),2,'one notification per administrator');
select ok(not exists(select 1 from public.notifications where studio_id='67000000-0000-4000-8000-000000000001' and recipient_id not in ('67000000-0000-4000-8000-000000000010','67000000-0000-4000-8000-000000000011')),'employees, inactive memberships/profiles and other studios receive nothing');
select ok((select bool_and(n.href='/crm/leads?lead=' || n.entity_id and n.metadata->>'leadName'='Наталія' and n.metadata->>'source'='instagram' and n.actor_id is null and n.created_at<=now()) from public.notifications n where n.studio_id='67000000-0000-4000-8000-000000000001'),'notification contains actual name, attributed source and direct CRM destination immediately');
select is((select count(*)::integer from public.web_push_deliveries d join public.notifications n on n.id=d.notification_id where n.studio_id='67000000-0000-4000-8000-000000000001'),2,'existing central push trigger enqueues both subscribed administrators');
select ok((select bool_and(public.is_notification_deliverable(id)) from public.notifications where studio_id='67000000-0000-4000-8000-000000000001') is false,'unprivileged anonymous context cannot validate other recipients');

set local role service_role;
select is(public.complete_meta_lead_job('670','101','67000000-0000-4000-8000-000000000001',gen_random_uuid(),'{"client_name":"Duplicate"}'),null::uuid,'duplicate or stale completion creates nothing');
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"101","form_id":"789","notify_admins":true}]',true,true);
set local role postgres;
select is((select count(*)::integer from public.notifications where studio_id='67000000-0000-4000-8000-000000000001'),2,'redelivery and operator retry cannot repeat completed lead notifications');
update public.notifications set read_at=now() where studio_id='67000000-0000-4000-8000-000000000001' and recipient_id='67000000-0000-4000-8000-000000000010';
set local role service_role;
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"101","form_id":"789","notify_admins":true}]');
set local role postgres;
select is((select count(*)::integer from public.notifications where studio_id='67000000-0000-4000-8000-000000000001'),2,'read state does not reset event deduplication');

set local role service_role;
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"102","form_id":"789","notify_admins":true}]',true,true);
select pg_temp.complete_meta_fixture('102','facebook');
set local role postgres;
select is((select count(*)::integer from public.notifications where studio_id='67000000-0000-4000-8000-000000000001' and metadata->>'source'='facebook'),2,'selected UI import uses the same notification mechanism with Facebook source');

set local role service_role;
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"103","form_id":"789","notify_admins":true}]');
create temporary table meta_notification_claim as select * from public.claim_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001',5,array['103']);
select public.fail_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'graph_unavailable',true) from meta_notification_claim;
set local role postgres;
select is((select count(*)::integer from public.notifications where studio_id='67000000-0000-4000-8000-000000000001'),4,'failed attempt sends no notification');
select ok((select notify_admins and status='pending' from public.meta_lead_jobs where page_id='670' and leadgen_id='103'),'automatic retry preserves notification intent');
update public.meta_lead_jobs set available_at=now()-interval '1 second' where page_id='670' and leadgen_id='103';
set local role service_role;
select pg_temp.complete_meta_fixture('103');
set local role postgres;
select is((select count(*)::integer from public.notifications where studio_id='67000000-0000-4000-8000-000000000001'),6,'successful retry notifies once per administrator');

set local role service_role;
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"104","form_id":"789","notify_admins":false}]',false,true);
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"104","form_id":"789","notify_admins":true}]');
select pg_temp.complete_meta_fixture('104');
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"105","form_id":"789","notify_admins":true}]');
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"105","form_id":"789","notify_admins":false}]',true,true);
select pg_temp.complete_meta_fixture('105');
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"106","form_id":"789"}]');
select pg_temp.complete_meta_fixture('106');
set local role postgres;
select is((select count(*)::integer from public.notifications where studio_id='67000000-0000-4000-8000-000000000001'),6,'backfill, overlapping bulk work and older callers are silent even after redelivery');
select ok((select bool_and(not notify_admins) from public.meta_lead_jobs where page_id='670' and leadgen_id in ('104','105','106')),'quiet intent persists in completed inbox rows');

set local role service_role;
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"108","form_id":"789","notify_admins":true}]');
create temporary table meta_failed_claim as select * from public.claim_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001',5,array['108']);
update public.meta_lead_jobs set payload='{"id":"108"}',submitted_at='2026-10-12T10:00:00Z' where page_id='670' and leadgen_id='108';
select throws_ok($$select public.complete_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'{"client_name":""}') from meta_failed_claim$$,'23514',null,'failed CRM insert rolls back without a completion notification');
select public.fail_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'crm_write_failed',false) from meta_failed_claim;
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"108","form_id":"789","notify_admins":false}]',true,true);
select pg_temp.complete_meta_fixture('108');
set local role postgres;
select is((select count(*)::integer from public.notifications where studio_id='67000000-0000-4000-8000-000000000001'),6,'bulk repair of a failed job remains silent');

set local role service_role;
select public.enqueue_meta_lead_jobs('670','67000000-0000-4000-8000-000000000001','[{"leadgen_id":"107","form_id":"789","notify_admins":true}]');
select pg_temp.complete_meta_fixture('107','instagram','+380501234567');
set local role postgres;
select is((select status from public.meta_lead_jobs where page_id='670' and leadgen_id='107'),'skipped','phone duplicate is skipped');
select is((select count(*)::integer from public.notifications where studio_id='67000000-0000-4000-8000-000000000001'),6,'phone duplicate sends no notification');

insert into public.crm_leads(id,studio_id,client_name,first_contact_date,responsible_admin_id,next_contact_at)
values('67000000-0000-4000-8000-000000000200','67000000-0000-4000-8000-000000000001','Manual contact','2026-10-12','67000000-0000-4000-8000-000000000011',now()-interval '1 second');
select is((select count(*)::integer from public.notifications where entity_id='67000000-0000-4000-8000-000000000200' and notification_type='meta_lead_created'),0,'ordinary manual creation does not broadcast a Meta notification');
select is((select count(*)::integer from public.notifications where entity_id='67000000-0000-4000-8000-000000000200' and notification_type='crm_lead_follow_up'),1,'manual creation preserves the existing assigned follow-up reminder');

-- Current CRM access is required for both inbox reads and queued push delivery.
create temporary table meta_notification_ids as
select id,recipient_id,notification_type from public.notifications where studio_id='67000000-0000-4000-8000-000000000001';
grant select on meta_notification_ids to service_role;
set local role service_role;
select ok(public.is_notification_deliverable(id),'existing follow-up is deliverable to its active administrator') from meta_notification_ids where notification_type='crm_lead_follow_up';
set local role postgres;
update public.studio_members set system_role='employee' where user_id='67000000-0000-4000-8000-000000000011';
select set_config('request.jwt.claim.sub','67000000-0000-4000-8000-000000000011',true);
set local role authenticated;
select is((select count(*)::integer from public.notifications where studio_id='67000000-0000-4000-8000-000000000001'),0,'demoted administrator cannot read prior CRM notifications');
select is((select count(*)::integer from public.crm_leads where studio_id='67000000-0000-4000-8000-000000000001'),0,'notification authorization matches CRM authorization');
set local role service_role;
select ok(not public.is_notification_deliverable(id),'demoted administrator cannot receive queued push') from meta_notification_ids where recipient_id='67000000-0000-4000-8000-000000000011';
create temporary table meta_push_claims as select * from public.claim_web_push_deliveries();
select is((select count(*)::integer from meta_push_claims where user_id='67000000-0000-4000-8000-000000000011'),0,'push claim cancels jobs after loss of CRM access');
set local role postgres;
select set_config('request.jwt.claim.sub','67000000-0000-4000-8000-000000000010',true);
set local role authenticated;
select is((select count(*)::integer from public.notifications where studio_id='67000000-0000-4000-8000-000000000001'),3,'remaining administrator still sees their own history');
select is((select count(*)::integer from public.notifications where recipient_id='67000000-0000-4000-8000-000000000011'),0,'administrator cannot read another recipient notifications');
set local role postgres;
select * from finish();
rollback;
