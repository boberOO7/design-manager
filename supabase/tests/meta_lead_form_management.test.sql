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

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('53000000-0000-4000-8000-000000000013','authenticated','authenticated','meta-employee@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values('53000000-0000-4000-8000-000000000013','Meta employee','meta-employee@test','employee');
insert into public.studio_members(studio_id,user_id,system_role) values('53000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000013','employee');
select ok((select relrowsecurity from pg_class where oid='public.meta_lead_forms'::regclass),'form policies use RLS');
select ok(not has_column_privilege('authenticated','public.meta_lead_forms','studio_id','UPDATE'),'browser cannot move policies across studios');
select ok(not has_column_privilege('authenticated','public.meta_lead_forms','name','UPDATE'),'browser cannot overwrite provider metadata');
select ok(not has_table_privilege('authenticated','public.meta_lead_forms','INSERT'),'browser cannot invent forms');
select ok(not has_table_privilege('anon','public.meta_lead_forms','SELECT'),'anonymous cannot see forms');
select ok(not has_function_privilege('authenticated','public.get_meta_lead_management_summary(text,uuid)','EXECUTE'),'privileged aggregates unavailable directly to browser');
set local role service_role;
select public.register_meta_lead_forms('123','53000000-0000-4000-8000-000000000001','[{"id":"10","name":"Fixture","status":"ACTIVE","leads_count":11},{"id":"20"}]');
select ok((select not sync_enabled from public.meta_lead_forms where page_id='123' and form_id='10'),'discovered forms start disabled');
select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"1","form_id":"10"},{"leadgen_id":"2","form_id":"999"}]');
select is((select count(*)::integer from public.meta_lead_jobs where page_id='123' and status='blocked'),2,'disabled and unknown webhooks are durably blocked');
select is((select count(*)::integer from public.claim_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001')),0,'worker cannot claim disabled or unknown forms');
select throws_ok($$select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"3","form_id":"10"}]',true,true)$$,'P0001','meta_form_not_enabled','manual UI/CLI import rejects disabled forms');
select throws_ok($$select public.register_meta_lead_forms('123','53000000-0000-4000-8000-000000000002','[{"id":"10"}]')$$,'P0001','meta_page_studio_mismatch','registration cannot reassign ownership');
set local role postgres;
select set_config('request.jwt.claim.sub','53000000-0000-4000-8000-000000000012',true);
set local role authenticated;
select is((select count(*)::integer from public.meta_lead_forms where page_id='123'),0,'other studio admin cannot read forms');
update public.meta_lead_forms set sync_enabled=true where page_id='123';
select throws_ok($$select public.set_meta_lead_exclusion('123','53000000-0000-4000-8000-000000000001','10','4',true)$$,'P0001','crm_admin_required','other studio cannot exclude leads');
select set_config('request.jwt.claim.sub','53000000-0000-4000-8000-000000000013',true);
select is((select count(*)::integer from public.meta_lead_forms where page_id='123'),0,'employee cannot read policies');
update public.meta_lead_forms set sync_enabled=true where page_id='123';
select throws_ok($$select public.set_meta_lead_exclusion('123','53000000-0000-4000-8000-000000000001','10','4',true)$$,'P0001','crm_admin_required','employee cannot exclude leads');
select set_config('request.jwt.claim.sub','53000000-0000-4000-8000-000000000011',true);
select is((select count(*)::integer from public.meta_lead_forms where sync_enabled),0,'unauthorized updates made no changes');
select lives_ok($$update public.meta_lead_forms set sync_enabled=true where page_id='123' and form_id='10'$$,'own admin can enable form');
set local role service_role;
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='1'),'blocked','enable alone does not release historical jobs');
select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"1","form_id":"10"}]');
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='1'),'blocked','duplicate delivery after enabling cannot release backlog');
select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"1","form_id":"10"},{"leadgen_id":"3","form_id":"10"}]',true,true);
create temp table management_claims as select * from public.claim_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001',5,array['1']);
select is((select count(*)::integer from management_claims),1,'manual worker claims selected ID only');
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='3'),'pending','unselected ID remains untouched');
set local role postgres;
set local role authenticated;
update public.meta_lead_forms set sync_enabled=false where page_id='123' and form_id='10';
set local role service_role;
select ok((select status='blocked' and lease_token is null from public.meta_lead_jobs where page_id='123' and leadgen_id='1'),'disabling invalidates in-flight lease');
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='3'),'blocked','disabling blocks already queued jobs');
select is(public.complete_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'{"client_name":"Must not import"}'),null::uuid,'previous worker cannot complete disabled form') from management_claims;
select public.register_meta_lead_forms('123','53000000-0000-4000-8000-000000000001','[{"id":"10","name":"Refreshed"}]');
select ok((select not sync_enabled from public.meta_lead_forms where page_id='123' and form_id='10'),'metadata refresh preserves administrator policy');
set local role postgres;
set local role authenticated;
select lives_ok($$select public.set_meta_lead_exclusion('123','53000000-0000-4000-8000-000000000001','10','1',true)$$,'own admin may explicitly exclude lead');
update public.meta_lead_forms set sync_enabled=true where page_id='123' and form_id='10';
set local role service_role;
select ok((select status='skipped' and payload is null and submitted_at is null and ad_id is null from public.meta_lead_jobs where page_id='123' and leadgen_id='1'),'exclusion retains minimal ID/state without answer payload');
select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"1","form_id":"10"}]',true,true);
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='1'),'skipped','explicit UI/CLI retry preserves exclusion');
select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"1","form_id":"10"}]');
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='1'),'skipped','webhook preserves exclusion');
set local role postgres;
set local role authenticated;
select public.set_meta_lead_exclusion('123','53000000-0000-4000-8000-000000000001','10','1',false);
set local role service_role;
select is((select status from public.meta_lead_jobs where page_id='123' and leadgen_id='1'),'blocked','restoring exclusion still needs explicit import');
select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"1","form_id":"10"}]',true,true);
delete from management_claims;
insert into management_claims select * from public.claim_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001',5,array['1']);
update public.meta_lead_jobs set payload='{"id":"1"}',submitted_at='2026-10-18T11:00:00Z' where page_id='123' and leadgen_id='1';
select lives_ok($$select public.complete_meta_lead_job(page_id,leadgen_id,studio_id,lease_token,'{"client_name":"Fixture contact"}') from management_claims$$,'explicit restored import uses existing atomic CRM mechanism');
select is((select get_meta_lead_management_summary->>'enabledForms' from public.get_meta_lead_management_summary('123','53000000-0000-4000-8000-000000000001')),'1','diagnostics report enabled count');
select ok((public.get_meta_lead_management_summary('123','53000000-0000-4000-8000-000000000001')->>'lastSuccess') is not null,'completion records known success time');
set local role postgres;
select is((select count(*)::integer from public.crm_leads where studio_id='53000000-0000-4000-8000-000000000001'),1,'all blocked/excluded paths produced no unintended CRM leads');
delete from public.crm_leads where studio_id='53000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.set_meta_lead_exclusion('123','53000000-0000-4000-8000-000000000001','10','1',false),false,'exclusion controls cannot restore deleted completed lead');
set local role service_role;
select public.enqueue_meta_lead_jobs('123','53000000-0000-4000-8000-000000000001','[{"leadgen_id":"1","form_id":"10"}]',true,true);
select ok((select status='completed' and crm_lead_id is null from public.meta_lead_jobs where page_id='123' and leadgen_id='1'),'deleted CRM lead tombstone survives policy and manual import');
select * from finish();
rollback;
