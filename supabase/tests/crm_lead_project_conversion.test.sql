begin;
select plan(15);

insert into public.studios(id, name) values
  ('53000000-0000-0000-0000-000000000001', 'CRM conversion A'),
  ('53000000-0000-0000-0000-000000000002', 'CRM conversion B');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('53000000-0000-0000-0000-000000000010','authenticated','authenticated','crm-convert-admin-a@test','{}','{}',now(),now()),
  ('53000000-0000-0000-0000-000000000011','authenticated','authenticated','crm-convert-employee@test','{}','{}',now(),now()),
  ('53000000-0000-0000-0000-000000000012','authenticated','authenticated','crm-convert-admin-b@test','{}','{}',now(),now());
insert into public.profiles(id, full_name, email, system_role) values
  ('53000000-0000-0000-0000-000000000010','Conversion Admin A','crm-convert-admin-a@test','admin'),
  ('53000000-0000-0000-0000-000000000011','Conversion Employee','crm-convert-employee@test','employee'),
  ('53000000-0000-0000-0000-000000000012','Conversion Admin B','crm-convert-admin-b@test','admin');
insert into public.studio_members(studio_id,user_id,system_role) values
  ('53000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000010','admin'),
  ('53000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000011','employee'),
  ('53000000-0000-0000-0000-000000000002','53000000-0000-0000-0000-000000000012','admin');

set local role postgres;
insert into public.crm_leads(id, studio_id, client_name, first_contact_date, status) values
  ('53000000-0000-0000-0000-000000000100','53000000-0000-0000-0000-000000000001','Vasyl','2026-09-09','discussion'),
  ('53000000-0000-0000-0000-000000000101','53000000-0000-0000-0000-000000000001','Lost Client','2026-09-09','lost');

select set_config('request.jwt.claim.sub','53000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$
  select public.create_project_from_template(
    '{"studio_id":"53000000-0000-0000-0000-000000000001","source_lead_id":"53000000-0000-0000-0000-000000000100","name":"Vasyl Residence","project_type":"private","country_code":"UA","city":"Kyiv","client_name":"Vasyl","description":"Apartment interior","total_area_m2":120,"priority":"normal","start_date":"2026-09-10"}'::jsonb,
    '[]'::jsonb,
    null
  )
$$, 'studio admin converts a non-lost Lead through the normal Project creation RPC');
select is((select status::text from public.crm_leads where id='53000000-0000-0000-0000-000000000100'),'won','conversion marks the Lead won');
select ok((select project_id is not null from public.crm_leads where id='53000000-0000-0000-0000-000000000100'),'conversion links the created Project');
select is((select client_name from public.projects where id=(select project_id from public.crm_leads where id='53000000-0000-0000-0000-000000000100')),'Vasyl','prefilled client data reaches the Project');
select is((select count(*)::integer from public.crm_lead_history where lead_id='53000000-0000-0000-0000-000000000100' and event_type='status_changed' and previous_status='discussion' and new_status='won'),1,'normal status history records conversion to won');
select is((select count(*)::integer from public.crm_lead_history where lead_id='53000000-0000-0000-0000-000000000100' and event_type='project_linked' and project_id is not null),1,'conversion records the Project link');
select is((select actor_id from public.crm_lead_history where lead_id='53000000-0000-0000-0000-000000000100' and event_type='project_linked'),'53000000-0000-0000-0000-000000000010'::uuid,'link history retains the actor');
select throws_like($$
  select public.create_project_from_template(
    '{"studio_id":"53000000-0000-0000-0000-000000000001","source_lead_id":"53000000-0000-0000-0000-000000000100","name":"Duplicate","country_code":"UA","total_area_m2":1,"priority":"normal","start_date":"2026-09-10"}'::jsonb,
    '[]'::jsonb,
    null
  )
$$,'%already linked%','a Lead cannot be converted twice');
select is((select count(*)::integer from public.projects where studio_id='53000000-0000-0000-0000-000000000001'),1,'duplicate conversion leaves no extra Project');
select throws_like($$
  select public.create_project_from_template(
    '{"studio_id":"53000000-0000-0000-0000-000000000001","source_lead_id":"53000000-0000-0000-0000-000000000101","name":"Lost","country_code":"UA","total_area_m2":1,"priority":"normal","start_date":"2026-09-10"}'::jsonb,
    '[]'::jsonb,
    null
  )
$$,'%lost lead%','a lost Lead cannot be converted');
select is((select project_id from public.crm_leads where id='53000000-0000-0000-0000-000000000101'),null::uuid,'failed conversion leaves the lost Lead unlinked');

set local role postgres;
select set_config('request.jwt.claim.sub','53000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select throws_like($$
  select public.create_project_from_template(
    '{"studio_id":"53000000-0000-0000-0000-000000000001","name":"Unauthorized","country_code":"UA","total_area_m2":1,"priority":"normal","start_date":"2026-09-10"}'::jsonb,
    '[]'::jsonb,
    null
  )
$$,'%administrators%','employee cannot create or convert a Project');

set local role postgres;
select set_config('request.jwt.claim.sub','53000000-0000-0000-0000-000000000012',true);
set local role authenticated;
select throws_like($$
  select public.create_project_from_template(
    '{"studio_id":"53000000-0000-0000-0000-000000000001","source_lead_id":"53000000-0000-0000-0000-000000000101","name":"Cross studio","country_code":"UA","total_area_m2":1,"priority":"normal","start_date":"2026-09-10"}'::jsonb,
    '[]'::jsonb,
    null
  )
$$,'%administrators%','other-studio admin cannot convert the Lead');

set local role postgres;
select throws_ok($$update public.crm_leads set project_id=(select project_id from public.crm_leads where id='53000000-0000-0000-0000-000000000100') where id='53000000-0000-0000-0000-000000000101'$$,'23505',null,'one Project cannot be linked to a second Lead');
select is((select count(*)::integer from public.crm_lead_history where event_type='project_linked'),1,'failed attempts do not append link history');

select * from finish();
rollback;
