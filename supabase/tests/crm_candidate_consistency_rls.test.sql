begin;
select plan(20);

insert into public.studios(id, name) values
  ('54000000-0000-0000-0000-000000000001', 'CRM candidate consistency');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('54000000-0000-0000-0000-000000000010','authenticated','authenticated','crm-candidate-admin@test','{}','{}',now(),now()),
  ('54000000-0000-0000-0000-000000000011','authenticated','authenticated','crm-candidate-employee@test','{}','{}',now(),now());
insert into public.profiles(id, full_name, email, system_role) values
  ('54000000-0000-0000-0000-000000000010','Candidate Admin','crm-candidate-admin@test','admin'),
  ('54000000-0000-0000-0000-000000000011','Candidate Employee','crm-candidate-employee@test','employee');
insert into public.studio_members(studio_id,user_id,system_role) values
  ('54000000-0000-0000-0000-000000000001','54000000-0000-0000-0000-000000000010','admin'),
  ('54000000-0000-0000-0000-000000000001','54000000-0000-0000-0000-000000000011','employee');

select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select throws_like($$
  select public.create_crm_candidate_with_cycle(
    'Hidden Candidate','','','','',null,'Designer','new',null,null,null,'',''
  )
$$,'%admin_required%','employee cannot create a Candidate through the atomic RPC');

set local role postgres;
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$
  select public.create_crm_candidate_with_cycle(
    'Candidate One','candidate@test','+380671234567','https://example.test/cv','referral',null,
    'Architect','interview_scheduled',null,'2026-09-15','2026-09-14 07:30+00','Strong','Passed'
  )
$$,'admin creates Candidate contact and full initial cycle atomically');
select set_config('test.crm_candidate_id',(select id::text from public.crm_candidates where full_name='Candidate One'),true);
select set_config('test.crm_cycle_id',(select id::text from public.crm_recruiting_cycles where candidate_id=current_setting('test.crm_candidate_id')::uuid),true);
select is((select count(*)::integer from public.crm_candidates),1,'one Candidate was created');
select is((select responsible_admin_id from public.crm_candidates where full_name='Candidate One'),null::uuid,'explicitly unassigned Candidate stays unassigned');
select is((select target_position from public.crm_recruiting_cycles),'Architect','initial cycle stores the target position');
select is((select interview_at from public.crm_recruiting_cycles),'2026-09-14 07:30+00'::timestamptz,'initial cycle stores the exact interview instant');

select throws_ok($$
  select public.create_crm_candidate_with_cycle(
    'Rolled Back','','','','',null,repeat('x',201),'new',null,null,null,'',''
  )
$$,'23514',null,'a cycle constraint failure aborts Candidate creation');
select is((select count(*)::integer from public.crm_candidates),1,'failed cycle creation leaves no partial Candidate');

select throws_like($$
  select public.update_crm_candidate_with_cycle(
    current_setting('test.crm_candidate_id')::uuid,
    '54000000-0000-0000-0000-000000000099','Changed','','','','',null,
    'Architect','new',null,null,null,'',''
  )
$$,'%recruiting_cycle_not_found%','update rejects a cycle that does not belong to the Candidate');
select is((select full_name from public.crm_candidates),'Candidate One','rejected update leaves Candidate contact unchanged');

select lives_ok($$
  select public.update_crm_candidate_with_cycle(
    current_setting('test.crm_candidate_id')::uuid,
    current_setting('test.crm_cycle_id')::uuid,
    'Candidate Renamed','renamed@test','+442012345678','https://example.test/new','partner',null,
    'Lead Architect','test_task','reserve','2026-09-20','2026-09-16 10:00+00','Excellent','Approved'
  )
$$,'admin updates Candidate and active cycle atomically');
select is((select full_name from public.crm_candidates),'Candidate Renamed','Candidate contact update persists');
select is((select stage::text || ':' || outcome::text from public.crm_recruiting_cycles),'decision:reserve','outcome forces the terminal decision stage');
select ok((select completed_at is not null from public.crm_recruiting_cycles),'first final outcome records completion time');

set local role postgres;
update public.crm_recruiting_cycles
set completed_at='2026-09-17 12:00+00'
where id=current_setting('test.crm_cycle_id')::uuid;
set local role authenticated;
select lives_ok($$
  select public.update_crm_candidate_with_cycle(
    current_setting('test.crm_candidate_id')::uuid, current_setting('test.crm_cycle_id')::uuid,
    'Candidate Renamed','renamed@test','','','',null,
    'Lead Architect','decision','reserve',null,null,'',''
  )
$$,'editing an already completed cycle succeeds');
select is((select completed_at from public.crm_recruiting_cycles),'2026-09-17 12:00+00'::timestamptz,'editing a final outcome preserves its original completion time');

set local role postgres;
select set_config('request.jwt.claim.sub','54000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select throws_like($$
  select public.update_crm_candidate_with_cycle(
    current_setting('test.crm_candidate_id')::uuid, current_setting('test.crm_cycle_id')::uuid,
    'Employee Edit','','','','',null,'Designer','new',null,null,null,'',''
  )
$$,'%admin_required%','employee cannot update Candidate and cycle through the atomic RPC');

set local role postgres;
select is((select full_name from public.crm_candidates where id=current_setting('test.crm_candidate_id')::uuid),'Candidate Renamed','unauthorized update leaves Candidate unchanged');
select is(has_function_privilege('anon', 'public.create_crm_candidate_with_cycle(text,text,text,text,text,text,text,recruiting_stage,text,text,text,text,text)', 'EXECUTE'),false,'anon has no create RPC grant');
select is(has_function_privilege('anon', 'public.update_crm_candidate_with_cycle(uuid,uuid,text,text,text,text,text,text,text,recruiting_stage,text,text,text,text,text)', 'EXECUTE'),false,'anon has no update RPC grant');

select * from finish();
rollback;
