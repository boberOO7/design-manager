begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into public.studios(id,name) values
  ('66000000-0000-4000-8000-000000000001','SPACE fixture A'),
  ('66000000-0000-4000-8000-000000000002','SPACE fixture B');
insert into public.space_design_integration_keys(key_id,studio_id,requests_per_minute) values
  ('sd-test-a','66000000-0000-4000-8000-000000000001',1000),
  ('sd-test-b','66000000-0000-4000-8000-000000000002',1000);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('66000000-0000-4000-8000-000000000011','authenticated','authenticated','sd-a@test','{}','{}',now(),now()),
  ('66000000-0000-4000-8000-000000000012','authenticated','authenticated','sd-b@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values
  ('66000000-0000-4000-8000-000000000011','SD Admin A','sd-a@test','admin'),
  ('66000000-0000-4000-8000-000000000012','SD Admin B','sd-b@test','admin');
insert into public.studio_members(studio_id,user_id,system_role) values
  ('66000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000011','admin'),
  ('66000000-0000-4000-8000-000000000002','66000000-0000-4000-8000-000000000012','admin');

create function pg_temp.sd_id(i integer) returns uuid language sql immutable as $$
  select ('66000000-0000-4000-9000-'||lpad(i::text,12,'0'))::uuid;
$$;
create function pg_temp.sd_accept(i integer,p_phone text default '+380501234567',p_email text default null,p_key text default 'sd-test-a',p_studio uuid default '66000000-0000-4000-8000-000000000001',p_hash text default repeat('a',64))
returns text language sql as $$
  select public.accept_space_design_lead(p_key,p_studio,pg_temp.sd_id(i),p_hash,
    jsonb_build_object('schema_version',1,'submission_id',pg_temp.sd_id(i),'submitted_at','2026-11-06T23:30:00Z',
      'form_id',3032,'form_location','footer','language','uk','page_url','https://space.example.test',
      'client_name','SD Fixture','phone',p_phone,'email',p_email));
$$;
create function pg_temp.sd_complete(i integer) returns text language sql as $$
  select public.complete_space_design_lead(studio_id,submission_id,lease_token)
    from public.space_design_lead_jobs where studio_id='66000000-0000-4000-8000-000000000001' and submission_id=pg_temp.sd_id(i);
$$;

select ok((select relrowsecurity from pg_class where oid='public.space_design_lead_jobs'::regclass),'inbox has RLS');
select ok((select relrowsecurity from pg_class where oid='public.space_design_integration_keys'::regclass),'key registry has RLS');
select ok(not has_table_privilege('anon','public.space_design_lead_jobs','SELECT'),'anonymous cannot read PII');
select ok(not has_table_privilege('authenticated','public.space_design_lead_jobs','INSERT'),'browser cannot inject inbox jobs');
select ok(not has_table_privilege('authenticated','public.space_design_integration_keys','UPDATE'),'browser cannot rebind keys');
select ok(not has_function_privilege('anon','public.accept_space_design_lead(text,uuid,uuid,text,jsonb)','EXECUTE'),'anonymous cannot enqueue directly');
select ok(not has_function_privilege('authenticated','public.complete_space_design_lead(uuid,uuid,uuid)','EXECUTE'),'browser cannot complete');
select ok(not has_function_privilege('authenticated','public.claim_space_design_leads(integer)','EXECUTE'),'browser cannot claim');
select ok(not has_function_privilege('authenticated','public.fail_space_design_lead(uuid,uuid,uuid)','EXECUTE'),'browser cannot fail jobs');
select ok(not has_function_privilege('service_role','private.dispatch_space_design_lead_worker()','EXECUTE'),'API cannot dispatch Vault scheduler');
select ok((select not active from cron.job where jobname='studioflow-space-design-leads-worker'),'new scheduler is inactive');
select is(private.space_design_phone_key('050 (123) 45-67',null),'380501234567','UA national phone maps to international');
select is(private.space_design_phone_key('00380 50 1234567',null),'380501234567','international 00 prefix removed');
select is(private.space_design_phone_key('+48 503-448-352',null),'48503448352','explicit foreign country retained');
select is(private.space_design_phone_key('503448352',null),'503448352','ambiguous bare nine digits get no guessed prefix');

set local role service_role;
select is(pg_temp.sd_accept(1),'accepted','first event durably accepted');
select is(pg_temp.sd_accept(1),'replayed','same event is idempotent');
select is(pg_temp.sd_accept(1,p_hash=>repeat('b',64)),'conflict','same event with changed payload digest conflicts');
select is(pg_temp.sd_accept(2,p_studio=>'66000000-0000-4000-8000-000000000002'),'unauthorized','key cannot choose another tenant');
select is(pg_temp.sd_accept(2,p_key=>'unknown'),'unauthorized','unregistered key rejected');
create temp table sd_claims as select * from public.claim_space_design_leads();
select is((select count(*)::integer from sd_claims),1,'worker claims only pending job');
select is((select count(*)::integer from public.claim_space_design_leads()),0,'live lease excludes another worker');
select is(public.fail_space_design_lead(studio_id,submission_id,lease_token),'retried','API failure schedules retry') from sd_claims;
select ok((select status='pending' and last_error='crm_write_failed' and available_at>now() and payload is not null
  from public.space_design_lead_jobs where submission_id=pg_temp.sd_id(1)),'backoff and original payload persist');
select is((select count(*)::integer from public.claim_space_design_leads()),0,'retry waits for backoff');
update public.space_design_lead_jobs set available_at=now()-interval '1 second' where submission_id=pg_temp.sd_id(1);
select count(*) from public.claim_space_design_leads();
select is(public.complete_space_design_lead(studio_id,submission_id,lease_token),'stale','old lease cannot complete') from sd_claims;
select is(public.fail_space_design_lead(studio_id,submission_id,lease_token),'stale','old lease cannot fail replacement') from sd_claims;
select is(public.complete_space_design_lead('66000000-0000-4000-8000-000000000002',submission_id,lease_token),'stale','completion cannot switch tenants')
  from public.space_design_lead_jobs where submission_id=pg_temp.sd_id(1);
select is(pg_temp.sd_complete(1),'created','atomic CRM lead created');
select is(pg_temp.sd_complete(1),'stale','completion cannot create twice');
select is(pg_temp.sd_accept(1),'replayed','redelivery after completion stays idempotent');
select ok((select payload is null and crm_lead_id is not null and completed_at is not null
  from public.space_design_lead_jobs where submission_id=pg_temp.sd_id(1)),'success keeps technical result and purges PII');

set local role postgres;
select is((select source from public.crm_leads where studio_id='66000000-0000-4000-8000-000000000001'),'SPACE DESIGN Website','exact source label');
select is((select status::text from public.crm_leads where studio_id='66000000-0000-4000-8000-000000000001'),'new','new lead status');
select is((select first_contact_date::text from public.crm_leads where studio_id='66000000-0000-4000-8000-000000000001'),'2026-11-07','existing Kyiv first-contact convention');
select is((select count(*)::integer from public.crm_lead_history where studio_id='66000000-0000-4000-8000-000000000001'),1,'existing lifecycle history remains active');
insert into public.crm_leads(studio_id,client_name,phone,email,first_contact_date) values
  ('66000000-0000-4000-8000-000000000001','Existing email fixture',null,' PERSON@Example.test ','2026-11-07');
set local role service_role;
select pg_temp.sd_accept(2,'050 (123) 45-67');
select pg_temp.sd_accept(3,null,'person@example.test');
select pg_temp.sd_accept(4,'+48503448352','person@example.test');
select pg_temp.sd_accept(5,'+380501234567',null,'sd-test-b','66000000-0000-4000-8000-000000000002');
select count(*) from public.claim_space_design_leads();
select is(pg_temp.sd_complete(2),'duplicate','normalized phone suppresses new submission');
select is(pg_temp.sd_complete(3),'duplicate','normalized email fallback when no phone');
select is(pg_temp.sd_complete(4),'created','phone-present event never falls back to email');
select is(public.complete_space_design_lead(studio_id,submission_id,lease_token),'created','same phone in another studio creates independently')
  from public.space_design_lead_jobs where submission_id=pg_temp.sd_id(5);
select ok((select payload is null and crm_lead_id is null from public.space_design_lead_jobs where submission_id=pg_temp.sd_id(3)),'duplicate diagnostic has no contact copy');

select pg_temp.sd_accept(6,'+380631234567');
select count(*) from public.claim_space_design_leads();
update public.space_design_lead_jobs set payload=jsonb_set(payload,'{client_name}','""') where submission_id=pg_temp.sd_id(6);
select throws_ok($$select pg_temp.sd_complete(6)$$,'23514',null,'CRM constraint failure rolls back atomic completion');
select ok((select status='processing' and crm_lead_id is null and payload is not null from public.space_design_lead_jobs where submission_id=pg_temp.sd_id(6)),'failure leaves recoverable inbox without phantom lead');
update public.space_design_lead_jobs set attempts=8 where submission_id=pg_temp.sd_id(6);
select is(public.fail_space_design_lead(studio_id,submission_id,lease_token),'failed','retry exhaustion records terminal failure')
  from public.space_design_lead_jobs where submission_id=pg_temp.sd_id(6);
select is(pg_temp.sd_accept(6,'+380631234567'),'replayed','redelivery does not reset failed job');
select pg_temp.sd_accept(7,'+380671234567');
select count(*) from public.claim_space_design_leads();
update public.space_design_lead_jobs set locked_at=now()-interval '6 minutes' where submission_id=pg_temp.sd_id(7);
select is((select count(*)::integer from public.claim_space_design_leads()),1,'expired lease recovers after crash');
update public.space_design_lead_jobs set locked_at=now()-interval '6 minutes',attempts=8 where submission_id=pg_temp.sd_id(7);
select is((select count(*)::integer from public.claim_space_design_leads()),0,'last expired lease is not retried forever');
select ok((select status='failed' and last_error='lease_exhausted' from public.space_design_lead_jobs where submission_id=pg_temp.sd_id(7)),'crash exhaustion records safe failure code');
update public.space_design_integration_keys set requests_per_minute=1,request_count=0,window_started_at=now() where key_id='sd-test-a';
select is(pg_temp.sd_accept(8),'accepted','first rate-window request allowed');
select is(pg_temp.sd_accept(9),'rate_limited','shared key limit enforced');
select is((select count(*)::integer from public.space_design_lead_jobs where submission_id=pg_temp.sd_id(9)),0,'throttled event is not acknowledged or persisted');
update public.space_design_integration_keys set window_started_at=now()-interval '61 seconds' where key_id='sd-test-a';
select is(pg_temp.sd_accept(9),'accepted','rate window expires');
update public.space_design_integration_keys set enabled=false where key_id='sd-test-a';
select is(pg_temp.sd_accept(10),'unauthorized','revoked key cannot accept');

set local role postgres;
select set_config('request.jwt.claim.sub','66000000-0000-4000-8000-000000000011',true);
set local role authenticated;
select is((select count(*)::integer from public.crm_leads where studio_id='66000000-0000-4000-8000-000000000001'),3,'own studio admins see created leads');
select is((select count(*)::integer from public.crm_leads where studio_id='66000000-0000-4000-8000-000000000002'),0,'other studio is isolated by CRM RLS');
select throws_ok($$select * from public.space_design_lead_jobs$$,'42501',null,'browser cannot read raw inbox');
select set_config('request.jwt.claim.sub','66000000-0000-4000-8000-000000000012',true);
select is((select count(*)::integer from public.crm_leads where studio_id='66000000-0000-4000-8000-000000000001'),0,'second studio admin cannot read first studio leads');
set local role postgres;
delete from public.crm_leads where id=(select crm_lead_id from public.space_design_lead_jobs where submission_id=pg_temp.sd_id(1));
select ok((select crm_lead_id is null and status='created' from public.space_design_lead_jobs where submission_id=pg_temp.sd_id(1)),'CRM deletion retains tombstone');
update public.space_design_integration_keys set enabled=true,requests_per_minute=1000 where key_id='sd-test-a';
set local role service_role;
select is(pg_temp.sd_accept(1),'replayed','deleted CRM lead cannot be resurrected by redelivery');
select * from finish();
rollback;
