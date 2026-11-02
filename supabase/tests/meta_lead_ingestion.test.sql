begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.studios(id, name) values
  ('53000000-0000-4000-8000-000000000001', 'Meta A'),
  ('53000000-0000-4000-8000-000000000002', 'Meta B');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('53000000-0000-4000-8000-000000000011','authenticated','authenticated','meta-a@test','{}','{}',now(),now()),
  ('53000000-0000-4000-8000-000000000012','authenticated','authenticated','meta-b@test','{}','{}',now(),now());
insert into public.profiles(id, full_name, email, system_role) values
  ('53000000-0000-4000-8000-000000000011','Meta Admin A','meta-a@test','admin'),
  ('53000000-0000-4000-8000-000000000012','Meta Admin B','meta-b@test','admin');
insert into public.studio_members(studio_id,user_id,system_role) values
  ('53000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000011','admin'),
  ('53000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000012','admin');

select ok((select relrowsecurity from pg_class where oid='public.meta_lead_jobs'::regclass), 'private inbox has RLS');
select ok(not has_table_privilege('anon','public.meta_lead_jobs','SELECT'), 'anonymous cannot read answers');
select ok(not has_table_privilege('authenticated','public.meta_lead_jobs','INSERT'), 'browser cannot inject events');
select ok(not has_function_privilege('authenticated','public.complete_meta_lead_job(text,text,uuid,uuid,jsonb)','EXECUTE'), 'browser cannot invoke privileged CRM completion');
select ok(not has_function_privilege('anon','public.enqueue_meta_lead_jobs(text,uuid,jsonb,boolean,boolean)','EXECUTE'), 'anonymous cannot enqueue');

insert into public.meta_lead_forms(page_id,form_id,studio_id,sync_enabled) values('123','789','53000000-0000-4000-8000-000000000001',true);

set local role service_role;
select is(public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"456","form_id":"789"},{"leadgen_id":"456"}]'),1,'batch duplicate creates one persistent job');
select is(public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"456"}]'),0,'webhook/backfill redelivery is idempotent');
select throws_ok($$select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000002','[{"leadgen_id":"456"}]')$$,'P0001','meta_page_studio_mismatch','existing job cannot move to another studio');
select is((select count(*)::integer from public.claim_meta_lead_jobs('123','53000000-0000-4000-8000-000000000002')),0,'wrong studio cannot claim');
select is((select count(*)::integer from public.claim_meta_lead_jobs('999','53000000-0000-4000-8000-000000000001')),0,'wrong page cannot claim');
create temp table meta_claims as select * from public.claim_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001');
select is((select count(*)::integer from meta_claims),1,'worker claims pending job');
select is((select count(*)::integer from public.claim_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001')),0,'second worker cannot claim a live lease');
select public.fail_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'graph_unavailable',true) from meta_claims;
select ok((select status='pending' and available_at>now() and last_error='graph_unavailable' from public.meta_lead_jobs where page_id='123' and leadgen_id='456'),'transient error schedules backoff');
select is((select count(*)::integer from public.claim_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001')),0,'backoff prevents early retry');
update public.meta_lead_jobs set available_at=now()-interval '1 second' where page_id='123' and leadgen_id='456';
delete from meta_claims;
insert into meta_claims select * from public.claim_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001');
select is((select attempts from meta_claims),2,'retry increments attempts');
update public.meta_lead_jobs set locked_at=now()-interval '6 minutes' where page_id='123' and leadgen_id='456';
create temp table meta_recovered as select * from public.claim_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001');
select is((select count(*)::integer from meta_recovered),1,'worker recovers crashed job');
select isnt((select lease_token from meta_recovered),(select lease_token from meta_claims),'recovery replaces the lease');
select public.fail_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'stale_error',false) from meta_claims;
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='456'),'processing','stale worker cannot fail recovered job');
select is(public.complete_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'{"client_name":"Stale"}'),null::uuid,'stale worker cannot create CRM lead') from meta_claims;
update public.meta_lead_jobs set payload='{"id":"456","field_data":[{"name":"extra","values":["answer"]}]}',
  submitted_at='2026-10-30T23:30:00Z' where page_id='123' and leadgen_id='456';
select is(public.complete_meta_lead_job(page_id,leadgen_id,'53000000-0000-4000-8000-000000000002',lease_token,'{"client_name":"Wrong tenant"}'),null::uuid,'completion cannot override job studio') from meta_recovered;
select throws_ok($$select public.complete_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'{"client_name":""}') from meta_recovered$$,'23514',null,'CRM constraints also reject missing names at the atomic write boundary');
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='456'),'processing','failed CRM write does not complete the job');
select lives_ok($$select public.complete_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'{"client_name":"Meta Contact","phone":"+380501234567","source":"Meta Lead Ads"}') from meta_recovered$$,'leased import creates lead');
select is(public.complete_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'{"client_name":"Duplicate"}'),null::uuid,'completion cannot run twice') from meta_recovered;
set local role postgres;
select is((select count(*)::integer from public.crm_leads where studio_id='53000000-0000-4000-8000-000000000001'),1,'exactly one CRM lead after duplicate completion');
select is((select status::text from public.crm_leads where client_name='Meta Contact'),'new','import starts in existing new status');
select is((select first_contact_date::text from public.crm_leads where client_name='Meta Contact'),'2026-10-31','first contact is submission date in Kyiv, not import date');
select ok((select responsible_admin_id is null from public.crm_leads where client_name='Meta Contact'),'no invented assignee');
select ok((select payload#>>'{field_data,0,values,0}'='answer' from public.meta_lead_jobs where page_id='123' and leadgen_id='456'),'additional answers are retained');
select is((select count(*)::integer from public.crm_lead_history where studio_id='53000000-0000-4000-8000-000000000001'),1,'existing history trigger remains active');
set local role service_role;
select is(public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"456"}]',true),0,'repeatable backfill preserves completed lead');

select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"457","form_id":"789"},{"leadgen_id":"458","form_id":"789"}]');
delete from meta_claims;
insert into meta_claims select * from public.claim_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001');
update public.meta_lead_jobs set payload=jsonb_build_object('id',leadgen_id), submitted_at='2026-10-31T10:00:00Z'
  where page_id='123' and leadgen_id='457';
select public.complete_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'{"client_name":"Second Inquiry","phone":"+380501234567"}') from meta_claims where leadgen_id='457';
set local role postgres;
select is((select count(*)::integer from public.crm_leads where phone='+380501234567' and studio_id='53000000-0000-4000-8000-000000000001'),1,'phone-matched submissions do not create another CRM lead');
set local role service_role;
select public.fail_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'missing_client_name',false) from meta_claims where leadgen_id='458';
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='458'),'failed','missing required data is held for repair');
select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"458"}]');
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='458'),'failed','webhook duplicate does not reset failed jobs');
select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"458"}]',true,true);
select ok((select status='pending' and attempts=0 from public.meta_lead_jobs where page_id='123' and leadgen_id='458'),'operator backfill explicitly retries repaired jobs');
delete from meta_claims;
insert into meta_claims select * from public.claim_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001');
update public.meta_lead_jobs set attempts=8 where page_id='123' and leadgen_id='458';
select public.fail_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'graph_unavailable',true) from meta_claims;
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='458'),'failed','exhausted retries remain inspectable');

set local role postgres;
select set_config('request.jwt.claim.sub','53000000-0000-4000-8000-000000000011',true);
set local role authenticated;
select is((select count(*)::integer from public.crm_leads where client_name in ('Meta Contact','Second Inquiry')),1,'own studio admins see imported leads in existing CRM');
select throws_ok($$select * from public.meta_lead_jobs$$,'42501',null,'browser cannot read raw Meta payloads');
select set_config('request.jwt.claim.sub','53000000-0000-4000-8000-000000000012',true);
select is((select count(*)::integer from public.crm_leads where client_name in ('Meta Contact','Second Inquiry')),0,'other studio admins cannot read imported leads');
select set_config('request.jwt.claim.sub','53000000-0000-4000-8000-000000000011',true);
select lives_ok($$delete from public.crm_leads where client_name='Meta Contact'$$,'normal CRM deletion remains possible');
set local role service_role;
select is(public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"456"}]',true),0,'redelivery does not recreate intentionally deleted CRM lead');
select ok((select status='completed' and crm_lead_id is null from public.meta_lead_jobs where page_id='123' and leadgen_id='456'),'deduplication survives CRM deletion');

select * from finish();
rollback;
