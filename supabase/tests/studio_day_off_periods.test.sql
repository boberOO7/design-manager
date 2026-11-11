begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.pid(n integer) returns uuid language sql immutable as
$$select ('80400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.pid(1),'Company period A'),(pg_temp.pid(2),'Company period B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select pg_temp.pid(n),'authenticated','authenticated','company-period-'||n||'@example.test','{}','{}' from generate_series(10,12)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.pid(n),'Period actor '||n,'company-period-'||n||'@example.test',case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active,joined_at) values
(pg_temp.pid(1),pg_temp.pid(10),'admin',true,'2020-01-01'),
(pg_temp.pid(1),pg_temp.pid(11),'employee',true,'2020-01-01'),
(pg_temp.pid(2),pg_temp.pid(12),'admin',true,'2020-01-01');

select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
set local role authenticated;
select lives_ok($$insert into public.studio_days_off(studio_id,date,end_date,name,created_by)
values(pg_temp.pid(1),'2027-01-05','2027-01-07','Company break',pg_temp.pid(10))$$,'admin creates one inclusive period');
select is((select count(*) from public.studio_days_off where date='2027-01-05' and studio_id=pg_temp.pid(1)),1::bigint,'a three-day period is one record');
select is((select end_date from public.studio_days_off where date='2027-01-05' and studio_id=pg_temp.pid(1)),'2027-01-07'::date,'inclusive end is persisted');
select lives_ok($$update public.studio_days_off set end_date='2027-01-07',name='Edited company break' where date='2027-01-05' and studio_id=pg_temp.pid(1)$$,'editing does not conflict with the same record');
select throws_ok($$insert into public.studio_days_off(studio_id,date,end_date,name,created_by)
values(pg_temp.pid(1),'2027-01-06','2027-01-09','Overlap',pg_temp.pid(10))$$,'23P01',null,'overlap is blocked even with a different start');
select throws_ok($$insert into public.studio_days_off(studio_id,date,end_date,name,created_by)
values(pg_temp.pid(1),'2027-01-07','2027-01-10','Inclusive boundary',pg_temp.pid(10))$$,'23P01',null,'the inclusive last day cannot overlap');
select lives_ok($$insert into public.studio_days_off(studio_id,date,name,created_by)
values(pg_temp.pid(1),'2027-01-08','Legacy single day',pg_temp.pid(10))$$,'legacy single-day inserts remain supported');
select is((select coalesce(end_date,date) from public.studio_days_off where date='2027-01-08' and studio_id=pg_temp.pid(1)),'2027-01-08'::date,'a legacy row covers its start only');
select throws_ok($$insert into public.studio_days_off(studio_id,date,end_date,name,created_by)
values(pg_temp.pid(1),'2027-01-12','2027-01-10','Reversed',pg_temp.pid(10))$$,'23514',null,'reversed periods are rejected');
select throws_ok($$insert into public.studio_days_off(studio_id,date,end_date,name,created_by) values
(pg_temp.pid(1),'2027-01-15','2027-01-15','Batch one',pg_temp.pid(10)),
(pg_temp.pid(1),'2027-01-06','2027-01-06','Batch conflict',pg_temp.pid(10))$$,'23P01',null,'a conflicting multi-date insert fails atomically');
select is((select count(*) from public.studio_days_off where date='2027-01-15'),0::bigint,'an atomic batch cannot leave some dates behind');
select throws_ok($$insert into public.studio_days_off(studio_id,date,end_date,name,created_by)
values(pg_temp.pid(2),'2027-01-05','2027-01-07','Foreign studio',pg_temp.pid(10))$$,'42501',null,'admin cannot create periods in another studio');
select lives_ok($$delete from public.studio_days_off where date='2027-01-08' and studio_id=pg_temp.pid(1)$$,'admin can remove one record');
reset role;

select set_config('request.jwt.claim.sub',pg_temp.pid(12)::text,true);
set local role authenticated;
select lives_ok($$insert into public.studio_days_off(studio_id,date,end_date,name,created_by)
values(pg_temp.pid(2),'2027-01-05','2027-01-07','Other studio break',pg_temp.pid(12))$$,'the same dates are allowed in another studio');
select is((select count(*) from public.studio_days_off where date='2027-01-05' and studio_id=pg_temp.pid(1)),0::bigint,'foreign periods are not visible');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
set local role authenticated;
select is((select count(*) from public.studio_days_off where date='2027-01-05' and studio_id=pg_temp.pid(1)),1::bigint,'an employee can read the complete company period');
select throws_ok($$insert into public.studio_days_off(studio_id,date,end_date,name,created_by)
values(pg_temp.pid(1),'2027-01-15','2027-01-17','Employee write',pg_temp.pid(11))$$,'42501',null,'employees cannot add periods');
with changed as (update public.studio_days_off set end_date='2027-01-10' where date='2027-01-05' and studio_id=pg_temp.pid(1) returning id) select is((select count(*) from changed),0::bigint,'employees cannot extend periods');
with removed as (delete from public.studio_days_off where date='2027-01-05' and studio_id=pg_temp.pid(1) returning id) select is((select count(*) from removed),0::bigint,'employees cannot delete periods');
reset role;

-- Exercise the live capacity helper: Jan 4-8 has five weekdays; Tue-Thu are off.
select is((private.finance_labor_period_basis(pg_temp.pid(1),
  jsonb_populate_record(null::public.finance_obligations,jsonb_build_object('id',pg_temp.pid(100),'employee_id',pg_temp.pid(11),'period_start','2027-01-04','period_end','2027-01-08')),
  jsonb_populate_record(null::public.finance_labor_automation,'{"starts_on":"2027-01-01"}'::jsonb),
  '{}'::jsonb,null,'UAH',null)->>'expectedMinutes')::integer,960,'Finance excludes the start, middle and inclusive end of a period');

select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
set local role authenticated;
select lives_ok($$delete from public.studio_days_off where date='2027-01-05' and studio_id=pg_temp.pid(1)$$,'a period is deleted as one record');
select is((select count(*) from public.studio_days_off where date='2027-01-05' and studio_id=pg_temp.pid(1)),0::bigint,'deleting a period removes its complete date coverage');
reset role;
select * from finish();
rollback;
