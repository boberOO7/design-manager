begin;
select plan(12);

insert into public.studios(id, name) values
('72100000-0000-0000-0000-000000000001', 'Optional creator studio'),
('72100000-0000-0000-0000-000000000002', 'Other Optional creator studio');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select ('72100000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'optional-creator-' || n || '@example.test', '{}', '{}'
from generate_series(10, 12) n;
insert into public.profiles(id, full_name, email, system_role)
select ('72100000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'RSVP person ' || n, 'optional-creator-' || n || '@example.test', case when n = 10 then 'admin' else 'employee' end
from generate_series(10, 12) n;
insert into public.studio_members(studio_id, user_id, system_role) values
('72100000-0000-0000-0000-000000000001', '72100000-0000-0000-0000-000000000010', 'admin'),
('72100000-0000-0000-0000-000000000001', '72100000-0000-0000-0000-000000000011', 'employee'),
('72100000-0000-0000-0000-000000000002', '72100000-0000-0000-0000-000000000012', 'employee');


select set_config('request.jwt.claim.sub', '72100000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok($$select public.create_calendar_event_with_invites(
  p_studio_id => '72100000-0000-0000-0000-000000000001', p_title => 'Optional creator presentation',
  p_event_type => 'presentation', p_starts_at => '2026-01-01T09:00+02', p_ends_at => '2026-01-01T10:00+02', p_all_day => false,
  p_attendee_ids => array['72100000-0000-0000-0000-000000000010'::uuid, '72100000-0000-0000-0000-000000000011'::uuid])$$,
  'a presentation can include its creator as an invitee');
select is((select invite.status::text from public.calendar_event_invites invite join public.calendar_events event on event.id = invite.event_id
  where event.title = 'Optional creator presentation' and invite.user_id = auth.uid()), 'pending', 'creator participation requires RSVP');
select lives_ok($$update public.calendar_event_invites set status = 'accepted'
  where event_id = (select id from public.calendar_events where title = 'Optional creator presentation') and user_id = auth.uid()$$,
  'the creator can confirm their own participation after the presentation has ended');
select ok((select invite.status = 'accepted' and invite.responded_at is not null from public.calendar_event_invites invite
  join public.calendar_events event on event.id = invite.event_id where event.title = 'Optional creator presentation' and invite.user_id = auth.uid()),
  'late acceptance records a response timestamp');
select lives_ok($$delete from public.calendar_event_invites
  where event_id = (select id from public.calendar_events where title = 'Optional creator presentation') and user_id = auth.uid()$$,
  'the creator can remove their own participation while retaining event management');
select is((select count(*) from public.calendar_event_invites invite join public.calendar_events event on event.id = invite.event_id
  where event.title = 'Optional creator presentation' and invite.user_id = auth.uid()), 0::bigint, 'removal persists');
select lives_ok($$select public.create_calendar_event_with_invites(
  p_studio_id => '72100000-0000-0000-0000-000000000001', p_title => 'Optional creator meeting',
  p_event_type => 'meeting', p_starts_at => '2030-01-01T09:00+02', p_ends_at => '2030-01-01T10:00+02', p_all_day => false,
  p_attendee_ids => array['72100000-0000-0000-0000-000000000010'::uuid])$$, 'meetings also allow self-invitation');
select is((select invite.status::text from public.calendar_event_invites invite join public.calendar_events event on event.id = invite.event_id
  where event.title = 'Optional creator meeting' and invite.user_id = auth.uid()), 'pending', 'meeting creator is an ordinary pending invitee');
select lives_ok($$select public.create_calendar_event_with_invites(
  p_studio_id => '72100000-0000-0000-0000-000000000001', p_title => 'Creator excluded',
  p_event_type => 'presentation', p_starts_at => '2030-01-01T09:00+02', p_ends_at => '2030-01-01T10:00+02', p_all_day => false,
  p_attendee_ids => array['72100000-0000-0000-0000-000000000011'::uuid])$$, 'the creator may create an event for others');
select is((select count(*) from public.calendar_event_invites invite join public.calendar_events event on event.id = invite.event_id
  where event.title = 'Creator excluded' and invite.user_id = auth.uid()), 0::bigint, 'the RPC does not re-add an omitted creator');
select throws_like($$select public.create_calendar_event_with_invites(
  p_studio_id => '72100000-0000-0000-0000-000000000001', p_title => 'Cross studio rejected',
  p_event_type => 'presentation', p_starts_at => '2030-01-01T09:00+02', p_ends_at => '2030-01-01T10:00+02', p_all_day => false,
  p_attendee_ids => array['72100000-0000-0000-0000-000000000012'::uuid])$$, '%Invitee must be an active studio member%',
  'self-invitation support does not bypass tenant boundaries');
select is((select count(*) from public.calendar_events where title = 'Cross studio rejected'), 0::bigint, 'invalid invitations roll back event creation atomically');
reset role;
select * from finish();
rollback;
