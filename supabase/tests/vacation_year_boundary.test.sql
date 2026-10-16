begin;
set search_path to public, extensions;
select no_plan();

insert into public.studios(id,name) values ('cb000000-0000-0000-0000-000000000001','Vacation year boundaries');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('cb000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'year-boundary-'||n||'@example.test','{}','{}',now(),now() from generate_series(10,17) n;
insert into public.profiles(id,full_name,email,system_role)
select id,'Year boundary member',email,case when id::text like '%000010' then 'admin' else 'employee' end
from auth.users where id::text like 'cb000000%';
insert into public.studio_members(studio_id,user_id,system_role,joined_at,vacation_opening_days,vacation_opening_date)
select 'cb000000-0000-0000-0000-000000000001',id,system_role,
 case right(id::text,2) when '12' then date '2025-01-01' when '13' then date '2024-02-29'
 when '14' then date '2020-07-15' when '15' then date '2020-01-01' when '16' then null when '17' then null else date '2025-07-15' end,
 case when right(id::text,2) in ('14','15','17') then 7 end,
 case right(id::text,2) when '14' then date '2025-10-15' when '15' then date '2026-01-01' when '17' then date '2025-10-15' end
from public.profiles where id::text like 'cb000000%';

create function pg_temp.today() returns date language sql as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.units(mode text,carry text,as_of date,annual integer default 24,cap integer default null,n integer default 11)
returns bigint language plpgsql as $$declare proposed private.studio_vacation_policies; begin
 proposed.annual_days:=annual; proposed.carry_rule:=carry; proposed.carry_cap_days:=cap;
 proposed.year_boundary:=mode; proposed.effective_at:=clock_timestamp();
 return private.calculate_vacation_balance_units('cb000000-0000-0000-0000-000000000001',
 ('cb000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,as_of,null,null,proposed);
end$$;
create function pg_temp.balance(as_of date default pg_temp.today()) returns integer language sql as $$
 select public.get_vacation_balance('cb000000-0000-0000-0000-000000000001','cb000000-0000-0000-0000-000000000011',as_of)$$;
create function pg_temp.propose(mode text,carry text default 'none') returns jsonb language sql as $$
 select public.preview_studio_vacation_policy_recalculation('cb000000-0000-0000-0000-000000000001',24,carry,null,mode)$$;
create function pg_temp.employee(preview jsonb) returns jsonb language sql as $$
 select e from jsonb_array_elements(preview->'employees') e where e->>'userId'='cb000000-0000-0000-0000-000000000011'$$;
create temp table previews(key text primary key,value jsonb);
grant all on previews to authenticated;

-- Pure balance replay: monthly accrual is unchanged; only annual boundaries move.
select is(pg_temp.units('employee','none','2026-01-01'),120::bigint,'employee work year does not expire on January 1');
select is(pg_temp.units('employee','none','2026-07-14'),264::bigint,'employee year earns only completed months before the anniversary');
select is(pg_temp.units('employee','none','2026-07-15'),0::bigint,'employee year expires unused days at its anniversary');
select is(pg_temp.units('calendar','carry_all','2025-07-14'),null::bigint,'no balance before midyear employment starts');
select is(pg_temp.units('calendar','carry_all','2025-08-14'),0::bigint,'midyear hire has no accrual before a completed month');
select is(pg_temp.units('calendar','carry_all','2025-08-15'),24::bigint,'midyear hire earns the first eligible month only');
select is(pg_temp.units('calendar','carry_all','2025-12-31'),120::bigint,'midyear hire earns five completed months, not a full annual award');
select is(pg_temp.units('calendar','carry_all','2026-01-01'),120::bigint,'enabled calendar carryover preserves earned days on January 1');
select is(pg_temp.units('calendar','none','2026-01-01'),0::bigint,'disabled calendar carryover expires on January 1');
select is(pg_temp.units('calendar','none','2026-01-15'),24::bigint,'monthly accrual continues on the original day after January 1');
select is(pg_temp.units('calendar','none','2026-07-15'),168::bigint,'calendar mode does not expire at the employee anniversary');
select is(pg_temp.units('calendar','carry_all','2026-07-15'),288::bigint,'calendar boundaries never duplicate monthly accrual');
select is(pg_temp.units('calendar','capped','2026-01-01',24,3),36::bigint,'calendar carryover respects the existing cap');
select is(pg_temp.units('calendar','capped','2026-01-15',24,3),60::bigint,'accrual resumes after capped carryover');
select is(pg_temp.units('calendar','carry_all','2026-01-01',25),125::bigint,'fractional entitlement retains exact twelfths across January 1');
select is(pg_temp.units('calendar','carry_all','2026-01-15',25),150::bigint,'fractional entitlement continues without rounding drift');
select is(pg_temp.units('calendar','none','2026-01-01',24,null,12),0::bigint,'coincident January 1 and employment anniversary reset once');
select is(pg_temp.units('calendar','carry_all','2026-01-01',25,null,12),300::bigint,'coincident boundaries accrue the twelfth month exactly once');
select is(pg_temp.units('employee','none','2025-02-28',24,null,13),0::bigint,'employee anniversary retains leap-day handling');
select is(pg_temp.units('calendar','none','2025-02-28',24,null,13),48::bigint,'calendar year accrues eligible leap-day monthly milestones after January 1');
select is(pg_temp.units('calendar','carry_all','2025-12-31',24,null,14),132::bigint,'opening balance plus later monthly accrual is preserved');
select is(pg_temp.units('calendar','none','2026-01-01',24,null,14),0::bigint,'opening balance participates in subsequent selected carryover');
select is(pg_temp.units('calendar','none','2026-01-01',24,null,15),84::bigint,'a January 1 opening balance is not immediately expired');
select is(pg_temp.units('calendar','carry_all','2025-12-31',24,null,17),132::bigint,'opening date safely supplies a missing employment-date baseline');
select is(pg_temp.units('calendar','carry_all','2026-05-01',24,null,16),null::bigint,'missing accrual dates remain unknown in calendar mode');
select is(pg_temp.units('employee','carry_all','2026-05-01',24,null,16),null::bigint,'missing accrual dates remain unknown in employee mode');

select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000010',true);
-- Effective-dated mode switches preserve carryover already applied under earlier rules.
insert into private.studio_vacation_policies(studio_id,effective_at,annual_days,carry_rule,year_boundary) values
 ('cb000000-0000-0000-0000-000000000001','2025-01-01T00:00:00+02',24,'none','calendar'),
 ('cb000000-0000-0000-0000-000000000001','2026-03-01T00:00:00+02',24,'none','employee');
select is(pg_temp.balance('2026-01-01'),0,'calendar expiration before a later mode switch stays applied');
select is(pg_temp.balance('2026-03-01'),4,'calendar-to-employee switch retains accrual since the earlier January reset');
select is(pg_temp.balance('2026-07-14'),12,'switching modes does not restore previously expired days');
select is(pg_temp.balance('2026-07-15'),0,'new employee mode applies at the next anniversary only');
delete from private.studio_vacation_policies where studio_id='cb000000-0000-0000-0000-000000000001';
insert into private.studio_vacation_policies(studio_id,effective_at,annual_days,carry_rule,year_boundary) values
 ('cb000000-0000-0000-0000-000000000001','2025-01-01T00:00:00+02',24,'none','employee'),
 ('cb000000-0000-0000-0000-000000000001','2026-03-01T00:00:00+02',24,'none','calendar');
select is(pg_temp.balance('2026-01-01'),10,'later calendar mode never replays an earlier January reset');
select is(pg_temp.balance('2026-07-15'),24,'employee-to-calendar switch skips the later employee anniversary');
select is(pg_temp.balance('2027-01-01'),0,'employee-to-calendar switch expires at its first future January boundary');
delete from private.studio_vacation_policies where studio_id='cb000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select is((select year_boundary from public.get_studio_vacation_policy('cb000000-0000-0000-0000-000000000001')),'employee','existing studios default to the employee work year');
insert into previews values ('before',jsonb_build_object('balance',pg_temp.balance()));
select public.save_studio_vacation_policy('cb000000-0000-0000-0000-000000000001',24,'none',null,'calendar');
select is(pg_temp.balance(),(select (value->>'balance')::integer from previews where key='before'),'future-only calendar save preserves already accrued balance');
select is(pg_temp.balance('2026-01-01'),10,'future-only calendar save does not retroactively introduce a January reset');
select is(pg_temp.balance(make_date(extract(year from pg_temp.today())::integer+1,1,1)),0,'future-only calendar change runs at the next January 1');
select is((select year_boundary from public.get_studio_vacation_policy('cb000000-0000-0000-0000-000000000001')),'calendar','selected boundary is returned by the settings API');
select public.save_studio_vacation_policy('cb000000-0000-0000-0000-000000000001',24,'none',null,'employee');
select is(pg_temp.balance(),(select (value->>'balance')::integer from previews where key='before'),'switching back future-only preserves accrued days');
select is(pg_temp.balance(make_date(extract(year from pg_temp.today())::integer+1,7,15)),0,'switching back expires at the next employee anniversary');
select ok(pg_temp.balance(make_date(extract(year from pg_temp.today())::integer+1,1,1))>0,'switching back ignores the upcoming January boundary');
select throws_like($$select public.save_studio_vacation_policy('cb000000-0000-0000-0000-000000000001',24,'none',null,'invalid')$$,'%Invalid vacation policy%','writer validates the year mode');
select throws_like($$select pg_temp.propose(null)$$,'%Invalid vacation policy%','preview rejects a missing year mode');
insert into previews values ('employee',pg_temp.propose('employee')),('calendar',pg_temp.propose('calendar'));
select isnt((select value->>'digest' from previews where key='employee'),(select value->>'digest' from previews where key='calendar'),'preview token binds the proposed year mode');
select throws_like($$select public.recalculate_studio_vacation_policy('cb000000-0000-0000-0000-000000000001',24,'none',null,(select value->>'digest' from previews where key='employee'),false,'calendar')$$,'%vacation_policy_preview_stale%','a preview for one mode cannot confirm another');
select lives_ok($$select public.recalculate_studio_vacation_policy('cb000000-0000-0000-0000-000000000001',24,'none',null,(select value->>'digest' from previews where key='calendar'),false,'calendar')$$,'calendar recalculation applies through the existing confirmation API');
select is(pg_temp.balance(),(select (pg_temp.employee(value)->>'after')::integer from previews where key='calendar'),'confirmed calendar recalculation matches the employee preview');
select is(pg_temp.balance('2026-01-01'),10,'historical balance queries before recalculation keep original policy behavior');
select lives_ok($$select public.recalculate_studio_vacation_policy('cb000000-0000-0000-0000-000000000001',24,'none',null,(select value->>'digest' from previews where key='calendar'),false,'calendar')$$,'retrying a calendar confirmation is idempotent');
set local role postgres;
select is(private.vacation_balance_units('cb000000-0000-0000-0000-000000000001','cb000000-0000-0000-0000-000000000011',pg_temp.today()),pg_temp.units('calendar','none',pg_temp.today()),'current balance uses the calendar replay calculation');
select is((select count(*) from private.studio_vacation_policies where studio_id='cb000000-0000-0000-0000-000000000001' and recalculates_existing),1::bigint,'calendar confirmation retries do not create duplicate policy versions');
set local role authenticated;
select public.save_studio_vacation_policy('cb000000-0000-0000-0000-000000000001',24,'carry_all',null,'employee');
insert into previews values ('after-replay',jsonb_build_object('balance',pg_temp.balance()));
select public.save_studio_vacation_policy('cb000000-0000-0000-0000-000000000001',24,'carry_all',null,'calendar');
select is(pg_temp.balance(),(select (value->>'balance')::integer from previews where key='after-replay'),'future-only boundary changes preserve an existing recalculation basis');
insert into previews values ('replay-employee',pg_temp.propose('employee'));
select lives_ok($$select public.recalculate_studio_vacation_policy('cb000000-0000-0000-0000-000000000001',24,'none',null,(select value->>'digest' from previews where key='replay-employee'),false,'employee')$$,'recalculation can switch back to employee work years');
select is(pg_temp.balance(),(select (pg_temp.employee(value)->>'after')::integer from previews where key='replay-employee'),'employee recalculation matches its preview');

-- A previously valid reservation crossing January 1 must be previewed and protected.
set local role postgres;
insert into public.studios(id,name) values ('cb000000-0000-0000-0000-000000000002','Calendar reservation boundary');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('cb000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'year-reservation-'||n||'@example.test','{}','{}',now(),now() from generate_series(20,21) n;
insert into public.profiles(id,full_name,email,system_role)
select id,'Calendar reservation member',email,case when id::text like '%000020' then 'admin' else 'employee' end
from auth.users where id in ('cb000000-0000-0000-0000-000000000020','cb000000-0000-0000-0000-000000000021');
insert into public.studio_members(studio_id,user_id,system_role,joined_at,vacation_opening_days,vacation_opening_date)
select 'cb000000-0000-0000-0000-000000000002',id,system_role,'2025-07-01',20,pg_temp.today()
from public.profiles where id in ('cb000000-0000-0000-0000-000000000020','cb000000-0000-0000-0000-000000000021');
create function pg_temp.january() returns date language sql as $$select make_date(extract(year from pg_temp.today())::integer+1,1,1)$$;
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000020',true);
set local role authenticated;
select public.save_studio_vacation_policy('cb000000-0000-0000-0000-000000000002',0,'carry_all',null,'employee');
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000021',true);
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day)
values ('cb000000-0000-0000-0000-000000000002','cb000000-0000-0000-0000-000000000021','vacation',pg_temp.january()-1,pg_temp.january()+1,true);
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000020',true);
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day)
values ('cb000000-0000-0000-0000-000000000002','cb000000-0000-0000-0000-000000000020','vacation',pg_temp.today()-1,pg_temp.today(),true);
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day)
values ('cb000000-0000-0000-0000-000000000002','cb000000-0000-0000-0000-000000000020','vacation',pg_temp.january()-1,pg_temp.january()+1,true);
insert into previews values ('spanning',public.preview_studio_vacation_policy_recalculation('cb000000-0000-0000-0000-000000000002',0,'none',null,'calendar'));
select is((select (e->>'after')::integer from previews,jsonb_array_elements(value->'employees') e where key='spanning' and e->>'userId'='cb000000-0000-0000-0000-000000000021'),19,'calendar preview reserves only the pre-January portion against the current year');
select is((select (e->>'minimumBalance')::integer from previews,jsonb_array_elements(value->'employees') e where key='spanning' and e->>'userId'='cb000000-0000-0000-0000-000000000021'),-2,'preview detects the reservation deficit after January expiration');
select is((select (e->>'shortfallDate')::date from previews,jsonb_array_elements(value->'employees') e where key='spanning' and e->>'userId'='cb000000-0000-0000-0000-000000000021'),pg_temp.january(),'preview checks the configured January boundary');
select throws_like($$select public.recalculate_studio_vacation_policy('cb000000-0000-0000-0000-000000000002',0,'none',null,(select value->>'digest' from previews where key='spanning'),false,'calendar')$$,'%vacation_policy_negative_confirmation_required%','calendar reservation deficits require explicit negative confirmation');
select lives_ok($$select public.recalculate_studio_vacation_policy('cb000000-0000-0000-0000-000000000002',0,'none',null,(select value->>'digest' from previews where key='spanning'),true,'calendar')$$,'calendar reservation deficits can be explicitly confirmed');
select is((select count(*) from public.time_off_requests where studio_id='cb000000-0000-0000-0000-000000000002' and status in ('pending','approved')),3::bigint,'mode recalculation preserves approved usage, approved reservations and pending reservations');
select is(public.get_vacation_balance('cb000000-0000-0000-0000-000000000002','cb000000-0000-0000-0000-000000000021',pg_temp.january()),-2,'confirmed future deficit matches its January preview');
select is(public.get_vacation_balance('cb000000-0000-0000-0000-000000000002','cb000000-0000-0000-0000-000000000020',pg_temp.today()),18,'imported opening balance deducts later usage and approved reservations once');
select is(public.get_vacation_balance('cb000000-0000-0000-0000-000000000002','cb000000-0000-0000-0000-000000000020',pg_temp.january()),-2,'approved future reservations remain deducted after the calendar reset');
select is(public.get_vacation_balance('cb000000-0000-0000-0000-000000000002','cb000000-0000-0000-0000-000000000021',(pg_temp.january()+interval '1 year')::date),-2,'confirmed deficits survive later January carryover boundaries');
-- Cancel the old pending request to test the new-request gate independently.
update public.time_off_requests set status='cancelled',cancelled_at=now() where user_id='cb000000-0000-0000-0000-000000000021';
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000021',true);
select is((select exceeds from public.project_vacation_request('cb000000-0000-0000-0000-000000000002','cb000000-0000-0000-0000-000000000021',pg_temp.january()-1,pg_temp.january()+1)),true,'request projection checks a spanning January deficit');
select throws_like($$insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day)
values ('cb000000-0000-0000-0000-000000000002','cb000000-0000-0000-0000-000000000021','vacation',pg_temp.january()-1,pg_temp.january()+1,true)$$,'%vacation_balance_exceeded%','actual insertion enforces the same calendar boundary as projection');
select throws_like($$select public.save_studio_vacation_policy('cb000000-0000-0000-0000-000000000002',24,'carry_all',null,'calendar')$$,'%Only active studio administrators%','employee cannot change the accounting mode');
select ok(not has_function_privilege('anon','public.recalculate_studio_vacation_policy(uuid,integer,text,integer,text,boolean,text)','execute'),'new recalculation contract remains inaccessible to anonymous users');
select * from finish();
rollback;
