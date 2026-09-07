begin;

select plan(4);

insert into public.studios (id, name)
values ('20000000-0000-0000-0000-000000000001', 'Completed calendar project test studio');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('20000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'calendar-completed-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, full_name, email, system_role)
values ('20000000-0000-0000-0000-000000000010', 'Calendar completed admin', 'calendar-completed-admin@example.test', 'admin');

insert into public.studio_members (studio_id, user_id, system_role)
values ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000010', 'admin');

insert into public.projects (id, studio_id, name, total_area_m2, start_date, status, created_by)
values
  ('20000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000001', 'Completed project', 1, current_date, 'completed', '20000000-0000-0000-0000-000000000010'),
  ('20000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000001', 'Archived project', 1, current_date, 'archived', '20000000-0000-0000-0000-000000000010');

insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at)
values
  ('20000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000010', 'designer', 0, current_date),
  ('20000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000010', 'designer', 0, current_date);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000010', true);
set local role authenticated;

select lives_ok(
  $$select public.create_calendar_event_with_invites(
    p_studio_id => '20000000-0000-0000-0000-000000000001',
    p_project_id => '20000000-0000-0000-0000-000000000020',
    p_title => 'Completed project visit',
    p_description => null,
    p_event_type => 'site_visit',
    p_starts_at => '2030-01-01T09:00:00+02',
    p_ends_at => '2030-01-01T10:00:00+02',
    p_all_day => false,
    p_location => null,
    p_meeting_url => null,
    p_assignee_id => '20000000-0000-0000-0000-000000000010'
  )$$,
  'a calendar event can be created for a completed project'
);

select lives_ok(
  $$update public.calendar_events set description = 'Follow-up visit' where title = 'Completed project visit'$$,
  'a calendar event on a completed project remains editable'
);

select is(
  (select description from public.calendar_events where title = 'Completed project visit'),
  'Follow-up visit',
  'the completed-project event update is visible to its organizer'
);

select throws_like(
  $$select public.create_calendar_event_with_invites(
    p_studio_id => '20000000-0000-0000-0000-000000000001',
    p_project_id => '20000000-0000-0000-0000-000000000021',
    p_title => 'Archived project visit',
    p_description => null,
    p_event_type => 'site_visit',
    p_starts_at => '2030-01-01T11:00:00+02',
    p_ends_at => '2030-01-01T12:00:00+02',
    p_all_day => false,
    p_location => null,
    p_meeting_url => null,
    p_assignee_id => '20000000-0000-0000-0000-000000000010'
  )$$,
  '%Archived projects cannot receive calendar events%',
  'archived projects remain unavailable to calendar events'
);

select * from finish();
rollback;
