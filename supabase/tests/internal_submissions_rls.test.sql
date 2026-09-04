begin;
select plan(19);

insert into public.studios(id, name) values
  ('40000000-0000-0000-0000-000000000001', 'Studio A'),
  ('40000000-0000-0000-0000-000000000002', 'Studio B');
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('40000000-0000-0000-0000-000000000010','authenticated','authenticated','admin@test','{}','{}',now(),now()),
  ('40000000-0000-0000-0000-000000000011','authenticated','authenticated','author@test','{}','{}',now(),now()),
  ('40000000-0000-0000-0000-000000000012','authenticated','authenticated','other@test','{}','{}',now(),now()),
  ('40000000-0000-0000-0000-000000000013','authenticated','authenticated','outsider@test','{}','{}',now(),now());
insert into public.profiles(id, full_name, email, system_role) values
  ('40000000-0000-0000-0000-000000000010','Admin','admin@test','admin'),
  ('40000000-0000-0000-0000-000000000011','Author','author@test','employee'),
  ('40000000-0000-0000-0000-000000000012','Other','other@test','employee'),
  ('40000000-0000-0000-0000-000000000013','Outsider','outsider@test','employee');
insert into public.studio_members(studio_id,user_id,system_role) values
  ('40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000010','admin'),
  ('40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000011','employee'),
  ('40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000012','employee'),
  ('40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000013','employee');

select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select lives_ok($$select public.create_submission('request','Mouse','Broken mouse',false)$$,'member creates request');
select lives_ok($$select public.create_submission('suggestion','Chairs','Buy better chairs',false)$$,'member creates suggestion');
select lives_ok($$select public.create_submission('complaint','Noise','Recurring noise',true)$$,'member creates anonymous complaint');
select is((select count(*)::integer from public.submissions where type='complaint'),0,'anonymous complaint is not visible to submitter');

set local role postgres;
select is((select count(*)::integer from public.submissions where type='complaint' and author_id is null and is_anonymous),1,'anonymous complaint stores no author');
select is((select count(*)::integer from public.notifications where entity_type='submission' and actor_id is null and notification_type='submission_created'),1,'anonymous complaint notification stores no actor');
select is((select count(*)::integer from public.notifications where entity_type='submission' and (metadata ? 'author' or metadata ? 'user_id' or metadata ? 'submitter')),0,'anonymous complaint notification metadata stores no identity key');
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000012',true);
set local role authenticated;
select is((select count(*)::integer from public.submissions where type='suggestion'),1,'suggestion visible to studio member');
select is((select count(*)::integer from public.submissions where type='request'),0,'request hidden from unrelated member');
select throws_ok($$select public.create_submission('request','Hidden','No',true)$$,'anonymous_complaints_only','anonymous request rejected');

set local role postgres;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select is((select count(*)::integer from public.submissions),3,'admin sees all studio submissions');
select lives_ok($$select public.manage_submission((select id from public.submissions where title='Mouse'),'accepted','40000000-0000-0000-0000-000000000012','high','2030-01-01','private note')$$,'admin manages request');
select is((select count(*)::integer from public.submission_admin_details where internal_note='private note'),1,'admin sees internal note');
select throws_ok($$select public.manage_submission((select id from public.submissions where title='Mouse'),'done',null,null,null,'')$$,'invalid_submission_transition','workflow rejects skipped state');
select throws_ok($$select public.manage_submission((select id from public.submissions where title='Noise'),'reviewing','40000000-0000-0000-0000-000000000012',null,null,'')$$,'complaints_do_not_expose_responsible_participants','complaint assignment cannot expand its private audience');

set local role postgres;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000012',true);
set local role authenticated;
select is((select count(*)::integer from public.submissions where type='request'),1,'assigned responsible member can view request');

set local role postgres;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000013',true);
set local role authenticated;
select is((select count(*)::integer from public.submissions),0,'member of another studio cannot view submissions');

set local role postgres;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select is((select count(*)::integer from public.submission_admin_details),0,'author cannot read internal note');
insert into public.submission_reactions(submission_id,studio_id,user_id) select id,studio_id,(select auth.uid()) from public.submissions where type='suggestion';
select throws_like($$insert into public.submission_reactions(submission_id,studio_id,user_id) select id,studio_id,(select auth.uid()) from public.submissions where type='suggestion'$$,'%duplicate key%','support is unique per member');

select * from finish();
rollback;
