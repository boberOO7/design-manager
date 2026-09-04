begin;
select plan(18);

insert into public.studios(id, name) values
  ('41000000-0000-0000-0000-000000000001', 'Office A'),
  ('41000000-0000-0000-0000-000000000002', 'Office B');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('41000000-0000-0000-0000-000000000010','authenticated','authenticated','office-admin@test','{}','{}',now(),now()),
  ('41000000-0000-0000-0000-000000000011','authenticated','authenticated','office-assignee@test','{}','{}',now(),now()),
  ('41000000-0000-0000-0000-000000000012','authenticated','authenticated','office-other@test','{}','{}',now(),now()),
  ('41000000-0000-0000-0000-000000000013','authenticated','authenticated','office-outsider@test','{}','{}',now(),now());
insert into public.profiles(id, full_name, email, system_role) values
  ('41000000-0000-0000-0000-000000000010','Office Admin','office-admin@test','admin'),
  ('41000000-0000-0000-0000-000000000011','Office Assignee','office-assignee@test','employee'),
  ('41000000-0000-0000-0000-000000000012','Office Other','office-other@test','employee'),
  ('41000000-0000-0000-0000-000000000013','Office Outsider','office-outsider@test','employee');
insert into public.studio_members(studio_id,user_id,system_role) values
  ('41000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000010','admin'),
  ('41000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000011','employee'),
  ('41000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000012','employee'),
  ('41000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000013','employee');

select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select throws_ok($$select public.create_office_assignment('Water','Order water','41000000-0000-0000-0000-000000000011','normal',null)$$,'admin_required','employee cannot create an assignment');

set local role postgres;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$select public.create_office_assignment('Water','Order water','41000000-0000-0000-0000-000000000011','high','2030-01-01')$$,'admin creates assignment');
select is((select count(*)::integer from public.office_assignments),1,'admin sees studio assignment');
set local role postgres;
select is((select count(*)::integer from public.notifications where studio_id='41000000-0000-0000-0000-000000000001' and recipient_id='41000000-0000-0000-0000-000000000011' and notification_type='office_assignment_assigned'),1,'assignee receives one assignment notification');

select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select is((select count(*)::integer from public.office_assignments),1,'assignee sees assignment');
select lives_ok($$select public.transition_office_assignment((select id from public.office_assignments),'in_progress')$$,'assignee starts work');
select throws_ok($$select public.transition_office_assignment((select id from public.office_assignments),'cancelled')$$,'admin_required_to_cancel','assignee cannot cancel');
select lives_ok($$select public.transition_office_assignment((select id from public.office_assignments),'done')$$,'assignee completes assignment');
select is((select count(*)::integer from public.office_assignments where status='done'),1,'completed assignment remains visible to assignee');
select throws_like($$update public.office_assignments set priority='urgent'$$,'%permission denied%','direct assignment writes are unavailable');

set local role postgres;
select is((select count(*)::integer from public.notifications where studio_id='41000000-0000-0000-0000-000000000001' and recipient_id='41000000-0000-0000-0000-000000000010' and notification_type='office_assignment_status_changed'),2,'creator receives meaningful status updates');
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000012',true);
set local role authenticated;
select is((select count(*)::integer from public.office_assignments),0,'unassigned studio member cannot read assignment');

set local role postgres;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000013',true);
set local role authenticated;
select is((select count(*)::integer from public.office_assignments),0,'another studio cannot read assignment');

set local role postgres;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select throws_ok($$select public.manage_office_assignment((select id from public.office_assignments),'assigned','41000000-0000-0000-0000-000000000011','normal',null)$$,'invalid_office_assignment_transition','terminal assignment cannot be reopened');
select lives_ok($$select public.create_office_assignment('Coffee',null,'41000000-0000-0000-0000-000000000012','normal',null)$$,'admin creates another assignment');
select lives_ok($$select public.manage_office_assignment((select id from public.office_assignments where title='Coffee'),'cancelled','41000000-0000-0000-0000-000000000012','urgent',null)$$,'admin cancels assignment');
select is((select count(*)::integer from public.office_assignments where status in ('done','cancelled')),2,'terminal assignments remain in history');
select is((select count(*)::integer from public.office_assignments where studio_id='41000000-0000-0000-0000-000000000002'),0,'assignments remain isolated from projects and other studios');

select * from finish();
rollback;
