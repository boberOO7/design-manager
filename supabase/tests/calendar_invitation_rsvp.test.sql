begin;
select plan(11);

insert into public.studios(id, name) values
('72000000-0000-0000-0000-000000000001', 'RSVP studio'),
('72000000-0000-0000-0000-000000000002', 'Other RSVP studio');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select ('72000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'rsvp-' || n || '@example.test', '{}', '{}'
from generate_series(10, 12) n;
insert into public.profiles(id, full_name, email, system_role)
select ('72000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'RSVP person ' || n, 'rsvp-' || n || '@example.test', case when n = 10 then 'admin' else 'employee' end
from generate_series(10, 12) n;
insert into public.studio_members(studio_id, user_id, system_role) values
('72000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000010', 'admin'),
('72000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000011', 'employee'),
('72000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000012', 'employee');

select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000010', true);
-- Seed deterministic IDs as the local test owner; caller column grants omit id.
insert into public.calendar_events(id, studio_id, title, event_type, starts_at, ends_at, all_day, created_by, organizer_id)
values ('72000000-0000-0000-0000-000000000020', '72000000-0000-0000-0000-000000000001', 'RSVP event', 'general',
        '2030-01-01T09:00+02', '2030-01-01T10:00+02', false, '72000000-0000-0000-0000-000000000010', '72000000-0000-0000-0000-000000000010');
insert into public.calendar_event_invites(event_id, user_id, invited_by)
values ('72000000-0000-0000-0000-000000000020', '72000000-0000-0000-0000-000000000011', '72000000-0000-0000-0000-000000000010');

select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select lives_ok($$update public.calendar_event_invites set status = 'accepted', responded_at = now()
  where event_id = '72000000-0000-0000-0000-000000000020' and user_id = auth.uid() and status <> 'accepted'$$,
  'the invitee can accept their pending invitation');
select ok((select status = 'accepted' and responded_at is not null from public.calendar_event_invites
  where event_id = '72000000-0000-0000-0000-000000000020'), 'accepted RSVP has a response timestamp');
with updated as (
  update public.calendar_event_invites set status = 'accepted', responded_at = now()
  where event_id = '72000000-0000-0000-0000-000000000020' and user_id = auth.uid() and status <> 'accepted'
  returning event_id
)
select is((select count(*) from updated), 0::bigint, 'same-status route update returns zero rows');
select is((select count(*) from public.calendar_event_invites invite
  join public.calendar_events event on event.id = invite.event_id
  where invite.event_id = '72000000-0000-0000-0000-000000000020' and invite.user_id = auth.uid()
    and invite.status = 'accepted' and event.cancelled_at is null
    and event.studio_id = '72000000-0000-0000-0000-000000000001'), 1::bigint,
  'the invitee can verify the saved RSVP through the RLS-visible fallback');
select throws_like($$update public.calendar_event_invites set status = 'accepted', responded_at = now()
  where event_id = '72000000-0000-0000-0000-000000000020'$$, '%Only the invited user may change their RSVP%',
  'the unchanged-status database guard stays enforced');
select lives_ok($$update public.calendar_event_invites set status = 'declined', responded_at = now()
  where event_id = '72000000-0000-0000-0000-000000000020' and user_id = auth.uid() and status <> 'declined'$$,
  'the invitee can change an accepted response to declined');

select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000010', true);
with updated as (
  update public.calendar_event_invites set status = 'accepted', responded_at = now()
  where event_id = '72000000-0000-0000-0000-000000000020' returning event_id
)
select is((select count(*) from updated), 0::bigint, 'even the organizer cannot respond on the invitee''s behalf');
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000012', true);
select is((select count(*) from public.calendar_event_invites where event_id = '72000000-0000-0000-0000-000000000020'),
  0::bigint, 'another studio cannot read the invitation for an idempotent response');

select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000010', true);
update public.calendar_events set cancelled_at = now() where id = '72000000-0000-0000-0000-000000000020';
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000011', true);
select throws_like($$update public.calendar_event_invites set status = 'accepted', responded_at = now()
  where event_id = '72000000-0000-0000-0000-000000000020' and user_id = auth.uid() and status <> 'accepted'$$,
  '%Event invitations are unavailable%', 'cancelled events reject changed RSVP');
select is((select count(*) from public.calendar_event_invites invite
  join public.calendar_events event on event.id = invite.event_id
  where invite.event_id = '72000000-0000-0000-0000-000000000020' and invite.user_id = auth.uid()
    and invite.status = 'declined' and event.cancelled_at is null), 0::bigint,
  'a saved same-status RSVP does not make a cancelled event available');
reset role;
update public.studio_members set is_active = false where user_id = '72000000-0000-0000-0000-000000000011';
set local role authenticated;
select is((select count(*) from public.calendar_event_invites where event_id = '72000000-0000-0000-0000-000000000020'),
  0::bigint, 'an inactive studio member cannot read the fallback invitation');

select * from finish();
rollback;
