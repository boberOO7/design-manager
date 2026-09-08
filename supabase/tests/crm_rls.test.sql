begin;
select plan(32);

select is((select relrowsecurity from pg_class where oid = 'public.crm_leads'::regclass), true, 'lead RLS is enabled');
select is((select relrowsecurity from pg_class where oid = 'public.crm_candidates'::regclass), true, 'candidate RLS is enabled');
select is((select relrowsecurity from pg_class where oid = 'public.crm_recruiting_cycles'::regclass), true, 'cycle RLS is enabled');

insert into public.studios(id, name) values
  ('51000000-0000-0000-0000-000000000001', 'CRM A'),
  ('51000000-0000-0000-0000-000000000002', 'CRM B');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('51000000-0000-0000-0000-000000000010','authenticated','authenticated','crm-admin-a@test','{}','{}',now(),now()),
  ('51000000-0000-0000-0000-000000000011','authenticated','authenticated','crm-employee@test','{}','{}',now(),now()),
  ('51000000-0000-0000-0000-000000000012','authenticated','authenticated','crm-admin-b@test','{}','{}',now(),now());
insert into public.profiles(id, full_name, email, system_role) values
  ('51000000-0000-0000-0000-000000000010','CRM Admin A','crm-admin-a@test','admin'),
  ('51000000-0000-0000-0000-000000000011','CRM Employee','crm-employee@test','employee'),
  ('51000000-0000-0000-0000-000000000012','CRM Admin B','crm-admin-b@test','admin');
insert into public.studio_members(studio_id,user_id,system_role) values
  ('51000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000010','admin'),
  ('51000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000011','employee'),
  ('51000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000012','admin');

select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$insert into public.crm_leads(studio_id, client_name, first_contact_date, responsible_admin_id, expected_project_type, expected_project_type_custom, country_code, city, city_geonames_id, budget_amount, budget_currency) values ('51000000-0000-0000-0000-000000000001','Client One','2025-01-02','51000000-0000-0000-0000-000000000010','other','Cultural','UA','Kyiv',703448,100000,'UAH')$$, 'admin creates a lead with structured project metadata');
select is((select first_contact_date::text from public.crm_leads where client_name='Client One'),'2025-01-02','first contact is stored independently');
select is((select country_code from public.crm_leads where client_name='Client One'),'UA','lead country uses an ISO code');
select is((select city_geonames_id::text from public.crm_leads where client_name='Client One'),'703448','lead stores the selected GeoNames city id');
select is((select expected_project_type_custom from public.crm_leads where client_name='Client One'),'Cultural','lead preserves an Other project type label');
select is((select budget_amount::text || ' ' || budget_currency from public.crm_leads where client_name='Client One'),'100000.00 UAH','lead budget persists amount and currency independently');
select throws_ok($$insert into public.crm_leads(studio_id, client_name, first_contact_date, budget_amount, budget_currency) values ('51000000-0000-0000-0000-000000000001','Invalid budget','2025-01-02',0,'USD')$$,'23514',null,'invalid structured budgets are rejected');
select throws_ok($$insert into public.crm_leads(studio_id, client_name, first_contact_date, expected_project_type, expected_project_type_custom) values ('51000000-0000-0000-0000-000000000001','Invalid type','2025-01-02','private','Custom')$$,'23514',null,'custom project type is limited to Other');
select lives_ok($$select public.create_crm_candidate('Candidate One','candidate@test','','','','51000000-0000-0000-0000-000000000010','','Architect')$$,'admin creates candidate and first cycle atomically');
select is((select count(*)::integer from public.crm_recruiting_cycles),1,'candidate starts with one cycle');
select lives_ok($$update public.crm_recruiting_cycles set stage='decision', outcome='reserve', completed_at=now(), interview_notes='Strong first impression', test_task_result='Passed'$$,'admin completes the first cycle');
select lives_ok($$select public.start_crm_recruiting_cycle((select id from public.crm_candidates where full_name='Candidate One'),'Lead Architect')$$,'admin starts a later cycle');
select is((select count(*)::integer from public.crm_recruiting_cycles),2,'new cycle adds history instead of replacing it');
select is((select interview_notes from public.crm_recruiting_cycles where outcome='reserve'),'Strong first impression','previous interview notes remain unchanged');

set local role postgres;
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select is((select count(*)::integer from public.crm_leads),0,'employee cannot discover leads');
select is((select count(*)::integer from public.crm_candidates),0,'employee cannot discover candidates');
select is((select count(*)::integer from public.crm_recruiting_cycles),0,'employee cannot discover recruiting history');
select throws_like($$insert into public.crm_leads(studio_id, client_name, first_contact_date) values ('51000000-0000-0000-0000-000000000001','Hidden','2025-01-01')$$,'%row-level security%','employee cannot insert leads');
select throws_like($$select public.create_crm_candidate('Hidden Candidate','','','','',null,'','Designer')$$,'%admin_required%','employee cannot create candidates through RPC');

set local role postgres;
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000012',true);
set local role authenticated;
select is((select count(*)::integer from public.crm_leads),0,'other studio admin cannot see leads');
select is((select count(*)::integer from public.crm_candidates),0,'other studio admin cannot see candidates');

set local role postgres;
update public.profiles set is_active=false where id='51000000-0000-0000-0000-000000000010';
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select is((select count(*)::integer from public.crm_leads),0,'inactive admin profile cannot discover leads');
select is((select count(*)::integer from public.crm_candidates),0,'inactive admin profile cannot discover candidates');
select throws_like($$select public.create_crm_candidate('Inactive admin candidate','','','','',null,'','Designer')$$,'%admin_required%','inactive admin profile cannot use CRM RPCs');

set local role postgres;
update public.profiles set is_active=true where id='51000000-0000-0000-0000-000000000010';
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select throws_like($$insert into public.crm_leads(studio_id, client_name, first_contact_date, responsible_admin_id) values ('51000000-0000-0000-0000-000000000001','Bad owner','2025-01-01','51000000-0000-0000-0000-000000000011')$$,'%responsible_must_be_active_studio_admin%','responsible person must be an active admin');
select lives_ok($$update public.crm_leads set status='contacted' where client_name='Client One'$$,'admin updates lead status');
select is((select first_contact_date::text from public.crm_leads where client_name='Client One'),'2025-01-02','status changes preserve first contact');
select lives_ok($$delete from public.crm_leads where client_name='Client One'$$,'admin deletes a lead');
select is((select count(*)::integer from public.crm_leads),0,'deleted lead is gone');

select * from finish();
rollback;
