begin;

select plan(5);

insert into public.studios (id, name)
values ('21000000-0000-0000-0000-000000000001', 'General event self-invite test studio');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('21000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'calendar-self-invite@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, full_name, email, system_role)
values ('21000000-0000-0000-0000-000000000010', 'General event organizer', 'calendar-self-invite@example.test', 'admin');

insert into public.studio_members (studio_id, user_id, system_role)
values ('21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000010', 'admin');

select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000010', true);
set local role authenticated;

select lives_ok(
  $$select public.create_calendar_event_with_invites(
    p_studio_id => '21000000-0000-0000-0000-000000000001',
    p_project_id => null,
    p_title => 'Self-participating event',
    p_description => null,
    p_event_type => 'general',
    p_starts_at => '2030-02-01T09:00:00+02',
    p_ends_at => '2030-02-01T10:00:00+02',
    p_all_day => false,
    p_location => null,
    p_meeting_url => null,
    p_attendee_ids => array['21000000-0000-0000-0000-000000000010']::uuid[]
  )$$,
  'a generic event can be created with its organizer as an invitee'
);

select is(
  (select count(*)::integer from public.calendar_event_invites invite join public.calendar_events event on event.id = invite.event_id where event.title = 'Self-participating event' and invite.user_id = '21000000-0000-0000-0000-000000000010'),
  1,
  'the organizer invitation is persisted'
);

select is(
  (select profile.full_name from public.calendar_event_invites invite join public.calendar_events event on event.id = invite.event_id join public.profiles profile on profile.id = invite.user_id where event.title = 'Self-participating event'),
  'General event organizer',
  'the persisted invite resolves to the organizer profile shown on reload'
);

select lives_ok(
  $$delete from public.calendar_event_invites where event_id = (select id from public.calendar_events where title = 'Self-participating event') and user_id = '21000000-0000-0000-0000-000000000010'$$,
  'the organizer can remove themselves from the generic event'
);

do $$
begin
  perform public.create_calendar_event_with_invites(
    p_studio_id => '21000000-0000-0000-0000-000000000001',
    p_project_id => null,
    p_title => 'Organizer-only meeting',
    p_description => null,
    p_event_type => 'meeting',
    p_starts_at => '2030-02-01T11:00:00+02',
    p_ends_at => '2030-02-01T12:00:00+02',
    p_all_day => false,
    p_location => 'Studio',
    p_meeting_url => null
  );
end;
$$;

select throws_like(
  $$insert into public.calendar_event_invites (event_id, user_id, invited_by)
    select id, '21000000-0000-0000-0000-000000000010', '21000000-0000-0000-0000-000000000010'
    from public.calendar_events
    where title = 'Organizer-only meeting'$$,
  '%Invalid calendar invitation%',
  'other event types still reject the organizer as an invitee'
);

select * from finish();
rollback;
