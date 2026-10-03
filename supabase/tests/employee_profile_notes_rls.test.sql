begin;
select no_plan();

insert into public.studios (id, name) values
  ('92000000-0000-0000-0000-000000000001', 'Employee notes studio A'),
  ('92000000-0000-0000-0000-000000000002', 'Employee notes studio B');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('92000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'notes-admin@example.test', '{}', '{}', now(), now()),
  ('92000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'notes-admin-two@example.test', '{}', '{}', now(), now()),
  ('92000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'notes-employee@example.test', '{}', '{}', now(), now()),
  ('92000000-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'notes-coworker@example.test', '{}', '{}', now(), now()),
  ('92000000-0000-0000-0000-000000000014', 'authenticated', 'authenticated', 'notes-foreign-admin@example.test', '{}', '{}', now(), now()),
  ('92000000-0000-0000-0000-000000000015', 'authenticated', 'authenticated', 'notes-inactive-profile-admin@example.test', '{}', '{}', now(), now()),
  ('92000000-0000-0000-0000-000000000016', 'authenticated', 'authenticated', 'notes-inactive-member-admin@example.test', '{}', '{}', now(), now()),
  ('92000000-0000-0000-0000-000000000017', 'authenticated', 'authenticated', 'notes-inactive-employee@example.test', '{}', '{}', now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('92000000-0000-0000-0000-000000000010', 'Notes admin', 'notes-admin@example.test', 'admin'),
  ('92000000-0000-0000-0000-000000000011', 'Notes admin two', 'notes-admin-two@example.test', 'admin'),
  ('92000000-0000-0000-0000-000000000012', 'Notes employee', 'notes-employee@example.test', 'employee'),
  ('92000000-0000-0000-0000-000000000013', 'Notes coworker', 'notes-coworker@example.test', 'employee'),
  ('92000000-0000-0000-0000-000000000014', 'Notes foreign admin', 'notes-foreign-admin@example.test', 'admin'),
  ('92000000-0000-0000-0000-000000000015', 'Notes inactive profile admin', 'notes-inactive-profile-admin@example.test', 'admin'),
  ('92000000-0000-0000-0000-000000000016', 'Notes inactive member admin', 'notes-inactive-member-admin@example.test', 'admin'),
  ('92000000-0000-0000-0000-000000000017', 'Notes inactive employee', 'notes-inactive-employee@example.test', 'employee');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000010', 'admin'),
  ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000011', 'admin'),
  ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000012', 'employee'),
  ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000013', 'employee'),
  ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000015', 'admin'),
  ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000016', 'admin'),
  ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000017', 'employee'),
  ('92000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000014', 'admin');

set local role postgres;
update public.profiles set is_active = false where id = '92000000-0000-0000-0000-000000000015';
update public.profiles set is_active = false where id = '92000000-0000-0000-0000-000000000017';
update public.studio_members set is_active = false where user_id = '92000000-0000-0000-0000-000000000016';
update public.studio_members set is_active = false where user_id = '92000000-0000-0000-0000-000000000017';

select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000012', '2024-02-01', 'First private note')$$,
  'active studio admin can add a note'
);
select lives_ok(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000012', '2024-02-01', 'Another note for the same month')$$,
  'multiple notes for an employee and month are allowed'
);
select lives_ok(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000017', '2024-03-01', 'Historical note after employee deactivation')$$,
  'inactive employees can retain profile note history'
);
select is((select count(*)::integer from public.employee_profile_notes where employee_id = '92000000-0000-0000-0000-000000000012' and review_month = '2024-02-01'), 2, 'same-month notes are both stored');
select is((select count(*)::integer from public.employee_profile_notes where employee_id = '92000000-0000-0000-0000-000000000012' and review_month <> date_trunc('month', created_at)::date), 2, 'review month remains independent from note creation date');
select is((select count(*)::integer from public.employee_profile_notes where employee_id = '92000000-0000-0000-0000-000000000017'), 1, 'note remains attached to the inactive employee');
select is((select count(*)::integer from public.employee_profile_notes where employee_id = '92000000-0000-0000-0000-000000000012' and author_id = (select auth.uid())), 2, 'author defaults to the authenticated admin');
select throws_like(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000012', '2024-02-02', 'Not first of month')$$,
  '%employee_profile_notes_review_month_check%',
  'review month must be the first of a month'
);
select throws_like(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000012', '2024-02-01', '   ')$$,
  '%employee_profile_notes_note_check%',
  'note text cannot be blank'
);
select throws_like(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note, author_id) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000012', '2024-02-01', 'Forged author', '92000000-0000-0000-0000-000000000011')$$,
  '%permission denied%',
  'insert grant prevents author spoofing'
);
select throws_like(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000014', '2024-02-01', 'Foreign studio employee')$$,
  '%employee_profile_notes_studio_id_employee_id_fkey%',
  'composite membership foreign key rejects an employee from another studio'
);
select throws_like(
  $$update public.employee_profile_notes set note = 'Changed' where employee_id = '92000000-0000-0000-0000-000000000012'$$,
  '%permission denied%',
  'authenticated admins cannot edit append-only notes'
);
select throws_like(
  $$delete from public.employee_profile_notes where employee_id = '92000000-0000-0000-0000-000000000012'$$,
  '%permission denied%',
  'authenticated admins cannot delete notes'
);

select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000011', true);
select is((select count(*)::integer from public.employee_profile_notes where employee_id = '92000000-0000-0000-0000-000000000012'), 2, 'second active studio admin can read all employee notes');
select lives_ok(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000012', '2024-04-01', 'Admin two note')$$,
  'second active studio admin can add a note'
);

select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000012', true);
select is((select count(*)::integer from public.employee_profile_notes), 0, 'employee subject cannot see private profile notes');
select throws_like(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000012', '2024-05-01', 'Employee insert')$$,
  '%row-level security%',
  'employee subject cannot insert notes'
);

select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000013', true);
select is((select count(*)::integer from public.employee_profile_notes), 0, 'coworker cannot see another employee notes');
select throws_like(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000012', '2024-05-01', 'Coworker insert')$$,
  '%row-level security%',
  'coworker cannot insert notes'
);

select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000014', true);
select is((select count(*)::integer from public.employee_profile_notes), 0, 'admin from another studio cannot see notes');
select throws_like(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000012', '2024-05-01', 'Foreign admin insert')$$,
  '%row-level security%',
  'admin from another studio cannot insert notes'
);

select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000015', true);
select is((select count(*)::integer from public.employee_profile_notes), 0, 'admin with inactive profile cannot see notes');
select throws_like(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000012', '2024-05-01', 'Inactive profile insert')$$,
  '%row-level security%',
  'admin with inactive profile cannot insert notes'
);

select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000016', true);
select is((select count(*)::integer from public.employee_profile_notes), 0, 'admin with inactive studio membership cannot see notes');
select throws_like(
  $$insert into public.employee_profile_notes (studio_id, employee_id, review_month, note) values ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000012', '2024-05-01', 'Inactive member insert')$$,
  '%row-level security%',
  'admin with inactive studio membership cannot insert notes'
);

select * from finish();
rollback;
