begin;
select plan(23);
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$ select ('71000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid $$;

insert into public.studios(id,name) values(pg_temp.pid(1),'Visit participants'),(pg_temp.pid(2),'Other studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select pg_temp.pid(n),'authenticated','authenticated','visit-'||n||'@example.test','{}','{}' from generate_series(10,14) n;
insert into public.profiles(id,full_name,email,system_role)
select pg_temp.pid(n),'Visit person '||n,'visit-'||n||'@example.test',case when n in (10,14) then 'admin' else 'employee' end from generate_series(10,14) n;
insert into public.studio_members(studio_id,user_id,system_role)
select pg_temp.pid(case when n=14 then 2 else 1 end),pg_temp.pid(n),case when n in (10,14) then 'admin' else 'employee' end from generate_series(10,14) n;
insert into public.projects(id,studio_id,name,total_area_m2,start_date,status,created_by)
values(pg_temp.pid(20),pg_temp.pid(1),'Visit project',100,current_date,'active',pg_temp.pid(10)),(pg_temp.pid(21),pg_temp.pid(2),'Foreign project',100,current_date,'active',pg_temp.pid(14));
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
select pg_temp.pid(20),pg_temp.pid(n),'designer',0,current_date from generate_series(10,12) n;
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
values(pg_temp.pid(21),pg_temp.pid(14),'designer',0,current_date);

select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
set local role authenticated;
select lives_ok($$select public.create_calendar_event_with_invites(pg_temp.pid(1),'Multi visit','site_visit','2030-01-01T09:00+02','2030-01-01T10:00+02',false,p_project_id=>pg_temp.pid(20),p_participant_ids=>array[pg_temp.pid(11),pg_temp.pid(12),pg_temp.pid(11)])$$,'an admin creates a multi-person visit atomically');
select is((select count(*) from public.calendar_event_participants where event_id=(select id from public.calendar_events where title='Multi visit')),2::bigint,'duplicate participants are deduplicated');
select ok((select assignee_id is null from public.calendar_events where title='Multi visit'),'new visits have no arbitrary primary assignee');
select is((select count(*) from public.calendar_event_invites where event_id=(select id from public.calendar_events where title='Multi visit')),0::bigint,'participants do not receive RSVP invitations');
reset role;
select is((select count(*) from public.notifications where entity_id=(select id from public.calendar_events where title='Multi visit') and notification_type='calendar_event_assigned'),2::bigint,'each new visit participant receives an assignment notification');
set local role authenticated;
select lives_ok($$select public.replace_business_trip_participants((select id from public.calendar_events where title='Multi visit'),array[pg_temp.pid(12)])$$,'the existing guarded replacement supports visits');
select is((select array_agg(user_id) from public.calendar_event_participants where event_id=(select id from public.calendar_events where title='Multi visit')),array[pg_temp.pid(12)],'removing a participant persists the remaining set');
select lives_ok($$select public.replace_business_trip_participants((select id from public.calendar_events where title='Multi visit'),array[pg_temp.pid(12)])$$,'saving the same set succeeds');
reset role;
select is((select count(*) from public.notifications where entity_id=(select id from public.calendar_events where title='Multi visit') and notification_type='calendar_event_assigned'),2::bigint,'unchanged participants are not notified again');
set local role authenticated;
select throws_like($$select public.replace_business_trip_participants((select id from public.calendar_events where title='Multi visit'),'{}')$$,'%require at least one participant%','a visit cannot be saved without participants');
select throws_like($$select public.replace_business_trip_participants((select id from public.calendar_events where title='Multi visit'),array[pg_temp.pid(13)])$$,'%must be active project members%','non-project members are rejected');
select throws_like($$select public.replace_business_trip_participants((select id from public.calendar_events where title='Multi visit'),array[pg_temp.pid(14)])$$,'%must be active project members%','cross-studio participants are rejected');
select throws_like($$select public.create_calendar_event_with_invites(pg_temp.pid(1),'Invalid visit','site_visit','2030-01-01T09:00+02','2030-01-01T10:00+02',false,p_project_id=>pg_temp.pid(20),p_participant_ids=>array[pg_temp.pid(13)])$$,'%must be active project members%','invalid creation rejects the participant set');
select is((select count(*) from public.calendar_events where title='Invalid visit'),0::bigint,'invalid creation leaves no event row');
select lives_ok($$select public.create_calendar_event_with_invites(pg_temp.pid(1),'Legacy visit','site_visit','2030-01-01T09:00+02','2030-01-01T10:00+02',false,p_project_id=>pg_temp.pid(20),p_assignee_id=>pg_temp.pid(11))$$,'legacy single-assignee RPC callers remain compatible');
select is((select array_agg(user_id) from public.calendar_event_participants where event_id=(select id from public.calendar_events where title='Legacy visit')),array[pg_temp.pid(11)],'legacy input is stored as a participant');

select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
select throws_like($$select public.replace_business_trip_participants((select id from public.calendar_events where title='Multi visit'),array[pg_temp.pid(11)])$$,'%Project event not found%','a participant cannot manage another organizer''s event');
select lives_ok($$select public.create_calendar_event_with_invites(pg_temp.pid(1),'Employee visit','site_visit','2030-01-01T09:00+02','2030-01-01T10:00+02',false,p_project_id=>pg_temp.pid(20),p_participant_ids=>array[pg_temp.pid(12)])$$,'employees retain self-only creation');
select is((select array_agg(user_id) from public.calendar_event_participants where event_id=(select id from public.calendar_events where title='Employee visit')),array[pg_temp.pid(11)],'employee input cannot assign a coworker');
select throws_like($$insert into public.calendar_event_participants(event_id,user_id,assigned_by) select id,pg_temp.pid(12),pg_temp.pid(11) from public.calendar_events where title='Employee visit'$$,'%Employees may add only themselves%','direct participant writes preserve the employee restriction');
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select lives_ok($$select public.create_calendar_event_with_invites(pg_temp.pid(1),'Multi trip','business_trip','2030-01-01T09:00+02','2030-01-02T10:00+02',false,p_project_id=>pg_temp.pid(20),p_participant_ids=>array[pg_temp.pid(11),pg_temp.pid(12)])$$,'business trips retain multi-person creation');
select lives_ok($$select public.replace_business_trip_participants((select id from public.calendar_events where title='Multi trip'),array[pg_temp.pid(12)])$$,'business trips retain guarded participant removal');
select is((select array_agg(user_id) from public.calendar_event_participants where event_id=(select id from public.calendar_events where title='Multi trip')),array[pg_temp.pid(12)],'the business-trip participant set still reloads');
select * from finish();
rollback;
