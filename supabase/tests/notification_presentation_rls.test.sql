begin;

select plan(10);

insert into public.studios (id, name) values
  ('64000000-0000-0000-0000-000000000001', 'Notification presentation studio');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('64000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'notifications-a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('64000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'notifications-b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('64000000-0000-0000-0000-000000000010', 'Notification user A', 'notifications-a@example.test', 'employee'),
  ('64000000-0000-0000-0000-000000000011', 'Notification user B', 'notifications-b@example.test', 'employee');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('64000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000010', 'employee'),
  ('64000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000011', 'employee');

select ok((select notification_popups_enabled from public.profiles where id = '64000000-0000-0000-0000-000000000010'), 'popup notifications default on');
select ok((select notification_sound_enabled from public.profiles where id = '64000000-0000-0000-0000-000000000010'), 'notification sound defaults on');

select set_config('request.jwt.claim.sub', '64000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok($$select public.update_my_profile_details(p_notification_popups_enabled => false, p_notification_sound_enabled => false)$$, 'a user can update their presentation preferences');
select isnt((select notification_popups_enabled from public.profiles where id = '64000000-0000-0000-0000-000000000010'), true, 'the popup preference is persisted');
select isnt((select notification_sound_enabled from public.profiles where id = '64000000-0000-0000-0000-000000000010'), true, 'the sound preference is persisted');
select ok((select notification_popups_enabled from public.profiles where id = '64000000-0000-0000-0000-000000000011'), 'another profile remains unchanged');
select lives_ok($$select public.update_my_profile_details(p_birth_date => date '2000-01-01')$$, 'older named-argument profile updates remain compatible');
select isnt((select notification_popups_enabled from public.profiles where id = '64000000-0000-0000-0000-000000000010'), true, 'an omitted popup preference is preserved');
select throws_like($$update public.profiles set notification_sound_enabled = true where id = '64000000-0000-0000-0000-000000000010'$$, '%permission denied%', 'direct profile preference updates remain unavailable');

set local role postgres;
select is((select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'), 1, 'notifications are published to Realtime once');

select * from finish();
rollback;
