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

select is(private.crm_lead_phone_key('+380 (50) 123-45-67',null),'380501234567','international presentation punctuation is ignored');
select is(private.crm_lead_phone_key('00380 50 123 45 67',null),'380501234567','explicit international 00 prefix is equivalent');
select is(private.crm_lead_phone_key('0501234567','UA'),'380501234567','known Ukrainian national number uses canonical country semantics');
select is(private.crm_lead_phone_key('501234567','UA'),'380501234567','known Ukrainian local nine digits match existing normalization');
select is(private.crm_lead_phone_key('0501234567',null),'0501234567','unknown national country is not invented');
select is(private.crm_lead_phone_key('+48 503 448 352','UA'),'48503448352','foreign international phone remains foreign even on a UA CRM record');
select is(private.crm_lead_phone_key('   ',null),null::text,'empty phones have no matching key');
select is(private.crm_lead_phone_key('+380501234567 ext 1',null),null::text,'extensions are not silently stripped into a different contact');
select ok(not has_function_privilege('authenticated','public.find_meta_lead_phone_matches(uuid,jsonb)','EXECUTE'),'browser cannot bypass authenticated studio guard through phone lookup RPC');
select ok(not has_function_privilege('anon','public.find_meta_lead_phone_matches(uuid,jsonb)','EXECUTE'),'anonymous cannot query phone existence');
insert into public.crm_leads(studio_id,client_name,phone,country_code,first_contact_date) values
 ('53000000-0000-4000-8000-000000000001','Manual contact','+380 (50) 123-45-67','UA','2026-11-01'),
 ('53000000-0000-4000-8000-000000000002','Other studio contact','+48503448352',null,'2026-11-01');
insert into public.meta_lead_forms(page_id,form_id,studio_id,sync_enabled) values('123','789','53000000-0000-4000-8000-000000000001',true);
set local role service_role;
select is((select count(*)::integer from public.find_meta_lead_phone_matches('53000000-0000-4000-8000-000000000001','[{"id":"1","phone":"00380501234567"},{"id":"2","phone":"+48503448352"},{"id":"3","phone":null}]')),1,'preview lookup matches own studio only and never empty values');
select is((select leadgen_id from public.find_meta_lead_phone_matches('53000000-0000-4000-8000-000000000001','[{"id":"1","phone":"0501234567","country_code":"UA"}]')),'1','preview uses the same known-country mapping as completion');
select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"1","form_id":"789"},{"leadgen_id":"2","form_id":"789"},{"leadgen_id":"3","form_id":"789"},{"leadgen_id":"4","form_id":"789"}]',true,true);
create temp table phone_claims as select * from public.claim_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001');
update public.meta_lead_jobs set payload=jsonb_build_object('id',leadgen_id,'field_data','[{"name":"extra","values":["keep answer"]}]'::jsonb),submitted_at='2026-10-18T11:00:00Z' where page_id='123';
select is(public.complete_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'{"client_name":"Meta duplicate","phone":"+380501234567"}'),null::uuid,'manual lead phone prevents another Meta CRM record') from phone_claims where leadgen_id='1';
select ok((select status='skipped' and last_error='duplicate_phone' and lease_token is null and payload is not null from public.meta_lead_jobs where page_id='123' and leadgen_id='1'),'duplicate is terminally recorded with distinct reason and original answers');
select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"1","form_id":"789"}]',true,true);
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='1'),'skipped','webhook/manual/CLI retries cannot re-create phone-skipped job');
select ok(public.complete_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'{"client_name":"Different studio is safe","phone":"+48 503 448 352"}') is not null,'same phone in another studio does not block import') from phone_claims where leadgen_id='2';
select ok(public.complete_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'{"client_name":"No phone one"}') is not null,'no-phone lead is not a duplicate') from phone_claims where leadgen_id='3';
select ok(public.complete_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'{"client_name":"No phone two"}') is not null,'separate no-phone leads are independent') from phone_claims where leadgen_id='4';
set local role postgres;
select is((select count(*)::integer from public.crm_leads where studio_id='53000000-0000-4000-8000-000000000001'),4,'only unique phone and no-phone inquiries create CRM rows');
select is((select client_name from public.crm_leads where studio_id='53000000-0000-4000-8000-000000000001' and phone='+380 (50) 123-45-67'),'Manual contact','matching a phone never merges or overwrites an existing lead');
select set_config('request.jwt.claim.sub','53000000-0000-4000-8000-000000000011',true);
set local role authenticated;
select lives_ok($$insert into public.crm_leads(studio_id,client_name,phone,country_code,first_contact_date) values('53000000-0000-4000-8000-000000000001','Authenticated manual','+447700900123',null,'2026-11-01')$$,'existing authenticated manual creation and trigger/index permissions remain valid');
set local role postgres;
select * from finish();
rollback;
