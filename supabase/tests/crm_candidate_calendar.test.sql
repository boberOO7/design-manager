begin;
select plan(26);

insert into public.studios(id, name) values
  ('55000000-0000-0000-0000-000000000001', 'Candidate calendar integration');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('55000000-0000-0000-0000-000000000010','authenticated','authenticated','crm-interview-admin@test','{}','{}',now(),now()),
  ('55000000-0000-0000-0000-000000000011','authenticated','authenticated','crm-interview-employee@test','{}','{}',now(),now());
insert into public.profiles(id, full_name, email, system_role) values
  ('55000000-0000-0000-0000-000000000010','Candidate Admin','crm-interview-admin@test','admin'),
  ('55000000-0000-0000-0000-000000000011','Candidate Employee','crm-interview-employee@test','employee');
insert into public.studio_members(studio_id,user_id,system_role) values
  ('55000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000010','admin'),
  ('55000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000011','employee');


insert into public.studios(id, name) values ('55000000-0000-0000-0000-000000000002','Other candidate studio');
insert into public.crm_candidates(id, studio_id, full_name) values
 ('55000000-0000-0000-0000-000000000020','55000000-0000-0000-0000-000000000001','Interview Candidate'),
 ('55000000-0000-0000-0000-000000000021','55000000-0000-0000-0000-000000000002','Other Candidate');
insert into public.crm_recruiting_cycles(id, studio_id, candidate_id, target_position, interview_at) values
 ('55000000-0000-0000-0000-000000000030','55000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000020','Designer','2026-11-15 09:00+00'),
 ('55000000-0000-0000-0000-000000000031','55000000-0000-0000-0000-000000000002','55000000-0000-0000-0000-000000000021','Designer',null);
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000010',true);
set local role authenticated;

select lives_ok($$ select public.create_calendar_event_with_invites(
 p_studio_id => '55000000-0000-0000-0000-000000000001', p_title => 'Candidate interview',
 p_event_type => 'interview', p_starts_at => '2026-11-16 09:00+00', p_ends_at => '2026-11-16 09:45+00', p_all_day => false,
 p_assignee_id => '55000000-0000-0000-0000-000000000010', p_recruiting_cycle_id => '55000000-0000-0000-0000-000000000030'
) $$,'calendar creates a linked interview atomically');
select set_config('test.interview_id',(select id::text from public.calendar_events where recruiting_cycle_id='55000000-0000-0000-0000-000000000030'),true);
select is((select interview_at from public.crm_recruiting_cycles where id='55000000-0000-0000-0000-000000000030'),'2026-11-16 09:00+00'::timestamptz,'calendar date appears in the candidate cycle');
select lives_ok($$ update public.crm_recruiting_cycles set interview_at='2026-11-17 12:00+00' where id='55000000-0000-0000-0000-000000000030' $$,'CRM reschedules the linked interview');
select is((select starts_at from public.calendar_events where id=current_setting('test.interview_id')::uuid),'2026-11-17 12:00+00'::timestamptz,'CRM date updates the calendar');
select is((select ends_at-starts_at from public.calendar_events where id=current_setting('test.interview_id')::uuid),interval '45 minutes','rescheduling preserves the explicitly chosen duration');
select lives_ok($$ update public.calendar_events set starts_at='2026-11-18 13:00+00', ends_at='2026-11-18 14:00+00' where id=current_setting('test.interview_id')::uuid $$,'calendar can reschedule the linked interview');
select is((select interview_at from public.crm_recruiting_cycles where id='55000000-0000-0000-0000-000000000030'),'2026-11-18 13:00+00'::timestamptz,'calendar reschedule updates CRM');
select throws_ok($$ select public.create_calendar_event_with_invites(
 p_studio_id => '55000000-0000-0000-0000-000000000001', p_title => 'Duplicate interview',
 p_event_type => 'interview', p_starts_at => '2026-11-19 09:00+00', p_ends_at => '2026-11-19 10:00+00', p_all_day => false,
 p_assignee_id => '55000000-0000-0000-0000-000000000010', p_recruiting_cycle_id => '55000000-0000-0000-0000-000000000030'
) $$,'23505',null,'a single CRM interview date cannot acquire duplicate live events');
select is((select count(*)::integer from public.calendar_events where title='Duplicate interview'),0,'failed linking leaves no orphan event');
select throws_like($$ update public.calendar_events set recruiting_cycle_id='55000000-0000-0000-0000-000000000031' where id=current_setting('test.interview_id')::uuid $$,'%interview_candidate_unavailable%','cross-studio candidate linking is rejected');
select throws_ok($$ update public.calendar_events set event_type='general', assignee_id=null where id=current_setting('test.interview_id')::uuid $$,'23514',null,'a candidate link is valid only on interviews');
select lives_ok($$ update public.calendar_events set cancelled_at=now() where id=current_setting('test.interview_id')::uuid $$,'calendar cancellation succeeds');
select is((select interview_at from public.crm_recruiting_cycles where id='55000000-0000-0000-0000-000000000030'),null::timestamptz,'cancellation removes the candidate interview date');
select lives_ok($$ select public.create_calendar_event_with_invites(
 p_studio_id => '55000000-0000-0000-0000-000000000001', p_title => 'Replacement interview',
 p_event_type => 'interview', p_starts_at => '2026-11-19 09:00+00', p_ends_at => '2026-11-19 10:00+00', p_all_day => false,
 p_assignee_id => '55000000-0000-0000-0000-000000000010', p_recruiting_cycle_id => '55000000-0000-0000-0000-000000000030'
) $$,'a cancelled interview can be replaced');
select set_config('test.interview_id',(select id::text from public.calendar_events where recruiting_cycle_id='55000000-0000-0000-0000-000000000030' and cancelled_at is null),true);
select lives_ok($$ update public.crm_recruiting_cycles set interview_at=null where id='55000000-0000-0000-0000-000000000030' $$,'CRM can remove an interview date');
select ok((select cancelled_at is not null from public.calendar_events where id=current_setting('test.interview_id')::uuid),'removing the CRM date cancels its calendar event');

set local role postgres;
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select is((select count(*)::integer from public.crm_recruiting_cycles),0,'employees cannot read candidate cycles');
select throws_like($$ select public.create_calendar_event_with_invites(
 p_studio_id => '55000000-0000-0000-0000-000000000001', p_title => 'Unauthorized interview',
 p_event_type => 'interview', p_starts_at => '2026-11-19 09:00+00', p_ends_at => '2026-11-19 10:00+00', p_all_day => false,
 p_assignee_id => '55000000-0000-0000-0000-000000000010', p_recruiting_cycle_id => '55000000-0000-0000-0000-000000000030'
) $$,'%admin_required%','employees cannot link candidates through the Calendar RPC');

set local role postgres;
select is(has_function_privilege('anon','public.create_calendar_event_with_invites(uuid,text,calendar_event_type,timestamptz,timestamptz,boolean,uuid,text,text,text,uuid[],jsonb,uuid,uuid,uuid[],text,uuid)','EXECUTE'),false,'anonymous callers have no create-event grant');
select is(has_function_privilege('authenticated','private.sync_calendar_candidate_interview()','EXECUTE'),false,'sync functions cannot be invoked as RPCs');
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select public.create_calendar_event_with_invites(
 p_studio_id => '55000000-0000-0000-0000-000000000001', p_title => 'Final interview',
 p_event_type => 'interview', p_starts_at => '2026-11-20 09:00+00', p_ends_at => '2026-11-20 10:00+00', p_all_day => false,
 p_assignee_id => '55000000-0000-0000-0000-000000000010', p_recruiting_cycle_id => '55000000-0000-0000-0000-000000000030'
);
select lives_ok($$ update public.calendar_events set recruiting_cycle_id=null where title='Final interview' $$,'an interview can be unlinked from a candidate');
select is((select interview_at from public.crm_recruiting_cycles where id='55000000-0000-0000-0000-000000000030'),null::timestamptz,'unlinking clears the former candidate date');
select is((select count(*)::integer from public.calendar_events where title='Final interview' and cancelled_at is null),1,'unlinking preserves the standalone event');

select throws_like($$ update public.calendar_events
 set cancelled_at=now(), recruiting_cycle_id='55000000-0000-0000-0000-000000000030'
 where title='Final interview' $$,'%Cancelling an event cannot change its candidate%','cancellation cannot silently attach a different candidate');
select lives_ok($$ update public.calendar_events set recruiting_cycle_id='55000000-0000-0000-0000-000000000030' where title='Final interview' $$,'standalone interview can be linked to a candidate');
select lives_ok($$ delete from public.crm_candidates where id='55000000-0000-0000-0000-000000000020' $$,'deleting a candidate removes its linked calendar events');
select * from finish();
rollback;
