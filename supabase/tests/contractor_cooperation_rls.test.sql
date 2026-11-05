begin;
select no_plan();

insert into public.studios(id,name) values
('72000000-0000-4000-8000-000000000001','Contractors A'),
('72000000-0000-4000-8000-000000000002','Contractors B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('72000000-0000-4000-8000-000000000010','authenticated','authenticated','contractor-admin@test','{}','{}'),
('72000000-0000-4000-8000-000000000011','authenticated','authenticated','contractor-employee@test','{}','{}'),
('72000000-0000-4000-8000-000000000012','authenticated','authenticated','contractor-outsider@test','{}','{}');
insert into public.profiles(id,full_name,email,system_role,is_active) values
('72000000-0000-4000-8000-000000000010','Admin','contractor-admin@test','admin',true),
('72000000-0000-4000-8000-000000000011','Employee','contractor-employee@test','employee',true),
('72000000-0000-4000-8000-000000000012','Other admin','contractor-outsider@test','admin',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active) values
('72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000010','admin',true),
('72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000011','employee',true),
('72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000012','admin',true);
insert into public.contractor_categories(id,studio_id,name,color_key) values
('72000000-0000-4000-8000-000000000020','72000000-0000-4000-8000-000000000001','Category A','blue'),
('72000000-0000-4000-8000-000000000021','72000000-0000-4000-8000-000000000002','Category B','blue');
insert into public.contractors(id,category_id,name,created_by) values
('72000000-0000-4000-8000-000000000030','72000000-0000-4000-8000-000000000020','Verified contact','72000000-0000-4000-8000-000000000010'),
('72000000-0000-4000-8000-000000000032','72000000-0000-4000-8000-000000000021','Other studio','72000000-0000-4000-8000-000000000012');
select is((select cooperation_status::text || ':' || is_recommended from public.contractors where id='72000000-0000-4000-8000-000000000030'),'verified:false','omitted fields preserve verified defaults');

select set_config('request.jwt.claim.sub','72000000-0000-4000-8000-000000000010',true);
set local role authenticated;
select lives_ok($$insert into public.contractors(category_id,name,created_by,cooperation_status) values ('72000000-0000-4000-8000-000000000020','Prospective secret','72000000-0000-4000-8000-000000000010','prospective')$$,'admin can create a prospective contact');
select set_config('test.prospective_id',(select id::text from public.contractors where name='Prospective secret'),true);
select is((select count(*)::integer from public.contractors),2,'admin sees both statuses in their studio only');
select throws_like($$update public.contractors set cooperation_status='unknown' where id='72000000-0000-4000-8000-000000000030'$$,'%invalid input value%','unknown status is rejected');
select throws_like($$update public.contractors set is_recommended=true where id=current_setting('test.prospective_id')::uuid$$,'%contractors_recommendation_requires_verified%','prospective contact cannot be recommended directly');
select lives_ok($$update public.contractors set is_recommended=true where id='72000000-0000-4000-8000-000000000030'$$,'admin can recommend a verified contact');
select is((select is_recommended from public.contractors where id='72000000-0000-4000-8000-000000000030'),true,'recommendation persists');
select throws_like($$update public.contractors set name='',cooperation_status='prospective' where id='72000000-0000-4000-8000-000000000030'$$,'%check constraint%','failed edit rejects the entire status transition');
select is((select cooperation_status::text || ':' || is_recommended from public.contractors where id='72000000-0000-4000-8000-000000000030'),'verified:true','failed transition preserves status and recommendation');
with changed as (
  update public.contractors set cooperation_status='prospective'
  where id='72000000-0000-4000-8000-000000000030'
  returning cooperation_status::text || ':' || is_recommended as state
) select is((select state from changed),'prospective:false','single UPDATE returns the atomic recommendation reset');
update public.contractors set cooperation_status='verified' where id='72000000-0000-4000-8000-000000000030';
select is((select is_recommended from public.contractors where id='72000000-0000-4000-8000-000000000030'),false,'verification does not restore the old recommendation');
update public.contractors set is_recommended=true where id='72000000-0000-4000-8000-000000000030';
select lives_ok($$update public.contractors set is_recommended=false where id='72000000-0000-4000-8000-000000000030'$$,'admin can remove recommendation');
update public.contractors set is_recommended=true where id='72000000-0000-4000-8000-000000000030';

select set_config('request.jwt.claim.sub','72000000-0000-4000-8000-000000000011',true);
select is((select count(*)::integer from public.contractors),1,'employee sees verified rows only');
select is((select count(*)::integer from public.contractors where name ilike '%secret%'),0,'search cannot expose prospective names');
select is((select count(*)::integer from public.contractors where id=current_setting('test.prospective_id')::uuid),0,'known ID cannot expose a prospective contact');
select is((select is_recommended from public.contractors where id='72000000-0000-4000-8000-000000000030'),true,'employee can read recommendation');
select lives_ok($$update public.contractors set description='Member edit' where id='72000000-0000-4000-8000-000000000030'$$,'employee retains ordinary editing');
update public.contractors set description='Bulk member edit';
set local role postgres;
select is((select description from public.contractors where id=current_setting('test.prospective_id')::uuid),null::text,'UPDATE without WHERE cannot change hidden prospective contacts');
set local role authenticated;
select throws_ok($$update public.contractors set cooperation_status='prospective' where id='72000000-0000-4000-8000-000000000030'$$,'42501','contractor_cooperation_admin_required','employee cannot change status through direct SQL');
select throws_ok($$update public.contractors set is_recommended=false where id='72000000-0000-4000-8000-000000000030'$$,'42501','contractor_cooperation_admin_required','employee cannot remove recommendation');
with changed as (update public.contractors set name='Leaked' where id=current_setting('test.prospective_id')::uuid returning id)
select is((select count(*)::integer from changed),0,'employee cannot modify prospective rows');
select throws_ok($$insert into public.contractors(category_id,name,created_by,cooperation_status) values ('72000000-0000-4000-8000-000000000020','Forged potential','72000000-0000-4000-8000-000000000011','prospective')$$,'42501','contractor_cooperation_admin_required','employee cannot create prospective contacts');
select throws_ok($$insert into public.contractors(category_id,name,created_by,is_recommended) values ('72000000-0000-4000-8000-000000000020','Forged recommendation','72000000-0000-4000-8000-000000000011',true)$$,'42501','contractor_cooperation_admin_required','employee cannot create a recommended contact');
select lives_ok($$insert into public.contractors(category_id,name,created_by) values ('72000000-0000-4000-8000-000000000020','Member contact','72000000-0000-4000-8000-000000000011')$$,'employee retains verified contact creation');
select throws_like($$insert into public.contractors(category_id,name,created_by) values ('72000000-0000-4000-8000-000000000021','Cross tenant','72000000-0000-4000-8000-000000000011')$$,'%row-level security%','employee cannot insert in another studio');
set local role postgres;
update public.studio_members set is_active=false where user_id='72000000-0000-4000-8000-000000000011';
set local role authenticated;
select is((select count(*)::integer from public.contractors),0,'inactive member cannot read contacts');

select set_config('request.jwt.claim.sub','72000000-0000-4000-8000-000000000012',true);
select is((select count(*)::integer from public.contractors),1,'other studio admin sees only own contacts');
with changed as (update public.contractors set is_recommended=true where id='72000000-0000-4000-8000-000000000030' returning id)
select is((select count(*)::integer from changed),0,'other studio admin cannot recommend our contact');
with changed as (delete from public.contractors where id=current_setting('test.prospective_id')::uuid returning id)
select is((select count(*)::integer from changed),0,'other studio admin cannot delete prospective contact');
delete from public.contractors;
set local role postgres;
select is((select count(*)::integer from public.contractors where id=current_setting('test.prospective_id')::uuid),1,'DELETE without WHERE cannot delete another studio prospective contact');
set local role authenticated;

select set_config('request.jwt.claim.sub','72000000-0000-4000-8000-000000000010',true);
set local role postgres;
update public.profiles set is_active=false where id='72000000-0000-4000-8000-000000000010';
set local role authenticated;
select is((select count(*)::integer from public.contractors),0,'inactive admin profile cannot read any contacts');
set local role anon;
select throws_like($$select * from public.contractors$$,'%permission denied%','anonymous users cannot read contacts');
select throws_like($$update public.contractors set is_recommended=true$$,'%permission denied%','anonymous users cannot recommend contacts');
select * from finish();
rollback;
