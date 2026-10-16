begin;
set search_path to public, extensions;
select no_plan();

-- Relative month starts keep completed-month and anniversary assertions deterministic.
create function pg_temp.today() returns date language sql as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.baseline() returns date language sql as $$select (date_trunc('month',pg_temp.today())-interval '16 months')::date$$;
insert into public.studios(id,name) values
 ('ba000000-0000-0000-0000-000000000001','Recalculation'),
 ('ba000000-0000-0000-0000-000000000002','Other tenant');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('ba000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'recalculation-'||n||'@example.test','{}','{}',now(),now() from generate_series(10,16) n;
insert into public.profiles(id,full_name,email,system_role)
select id,'Member '||email,email,case when id::text like '%000010' then 'admin' else 'employee' end
from auth.users where id::text like 'ba000000%';
insert into public.studio_members(studio_id,user_id,system_role,joined_at,vacation_opening_days,vacation_opening_date)
select 'ba000000-0000-0000-0000-000000000001',id,system_role,
 case when id::text like '%000014' then null else pg_temp.baseline() end,
 case when id::text like '%000013' then 7 end,
 case when id::text like '%000013' then (date_trunc('month',pg_temp.today())-interval '2 months')::date end
from public.profiles where id::text like 'ba000000%';
update public.studio_members set is_active=false where user_id='ba000000-0000-0000-0000-000000000016';

create temp table previews(key text primary key,value jsonb);
grant all on previews to authenticated;
create function pg_temp.propose(annual integer,carry text default 'carry_all',cap integer default null)
returns jsonb language sql as $$select public.preview_studio_vacation_policy_recalculation('ba000000-0000-0000-0000-000000000001',annual,carry,cap)$$;
create function pg_temp.employee(preview jsonb, n integer default 11) returns jsonb language sql as $$
 select e from jsonb_array_elements(preview->'employees') e where e->>'userId'='ba000000-0000-0000-0000-'||lpad(n::text,12,'0')$$;
create function pg_temp.balance(n integer default 11, as_of date default pg_temp.today()) returns integer language sql as $$
 select public.get_vacation_balance('ba000000-0000-0000-0000-000000000001',('ba000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,as_of)$$;
create function pg_temp.apply(annual integer,carry text default 'carry_all',cap integer default null,confirm_negative boolean default false)
returns void language plpgsql as $$declare preview jsonb; begin
 preview:=pg_temp.propose(annual,carry,cap);
 perform public.recalculate_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',annual,carry,cap,preview->>'digest',confirm_negative);
end$$;

select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-000000000013',true);
set local role authenticated;
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day)
values ('ba000000-0000-0000-0000-000000000001','ba000000-0000-0000-0000-000000000013','vacation',pg_temp.baseline(),pg_temp.baseline()+4,true);
select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-000000000010',true);
select is(pg_temp.balance(),32,'sixteen completed months originally accrue 32 days');
select public.save_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',12,'carry_all');
select is(pg_temp.balance(),32,'future-only saving preserves the accrued balance');
select is(pg_temp.balance(11,(date_trunc('month',pg_temp.today())+interval '1 month')::date),33,'future-only rate applies at the next monthly milestone');
select is((pg_temp.employee(pg_temp.propose(12))->>'after')::integer,16,'recalculation replays all sixteen months under the new entitlement');
select is(pg_temp.balance(),32,'preview is read-only');
select is((pg_temp.employee(pg_temp.propose(24))->>'after')::integer,32,'recalculation does not cap accumulated days at annual entitlement');
select is((pg_temp.employee(pg_temp.propose(12,'none'))->>'after')::integer,4,'no carryover expires unused days at the employment anniversary');
select is((pg_temp.employee(pg_temp.propose(12,'capped',5))->>'after')::integer,9,'capped carryover adds post-anniversary accrual');
select is((pg_temp.employee(pg_temp.propose(12,'capped',0))->>'after')::integer,4,'zero carryover cap is supported');
select is((pg_temp.employee(pg_temp.propose(12),13)->>'after')::integer,9,'opening baseline is preserved and accrual starts from its effective date');
select is((pg_temp.employee(pg_temp.propose(12),13)->>'reservedDays')::integer,0,'usage before an imported opening baseline is not deducted a second time');
select is(pg_temp.employee(pg_temp.propose(12),14)->'after','null'::jsonb,'missing employment and opening dates remain unknown');
select is(jsonb_array_length(pg_temp.propose(12)->'employees'),6,'preview excludes inactive memberships');
select is(pg_temp.propose(12)->>'digest',pg_temp.propose(12)->>'digest','identical source state yields a deterministic preview token');
select throws_like($$select pg_temp.propose(12,'capped')$$,'%Invalid vacation policy%','a cap is required for capped carryover');
select throws_like($$select pg_temp.propose(12,null)$$,'%Invalid vacation policy%','null carryover is rejected');
select throws_like($$select public.save_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',12,null)$$,'%Invalid vacation policy%','future-only validation also rejects null carryover');
select throws_like($$select public.recalculate_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',12,'carry_all')$$,'%vacation_policy_preview_stale%','recalculation cannot bypass a preview');
insert into previews values ('first',pg_temp.propose(12));
select lives_ok($$select public.recalculate_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',12,'carry_all',null,(select value->>'digest' from previews where key='first'))$$,'confirmed preview applies');
select is(pg_temp.balance(),16,'canonical balance reflects replayed policy');
select is(pg_temp.balance(11,pg_temp.today()-1),32,'historical dates before recalculation retain their original calculation');
select lives_ok($$select public.recalculate_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',12,'carry_all',null,(select value->>'digest' from previews where key='first'))$$,'retrying an applied token succeeds without duplication');
select lives_ok($$select pg_temp.apply(12)$$,'fresh confirmation of an already-current replay is also a no-op');
set local role postgres;
select is((select count(*) from private.studio_vacation_policies where studio_id='ba000000-0000-0000-0000-000000000001' and recalculates_existing),1::bigint,'both retry forms retain one replay version');
set local role authenticated;
select public.save_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',36,'carry_all');
select is(pg_temp.balance(),16,'a subsequent future-only edit preserves replayed accrual');
select is(pg_temp.balance(11,(date_trunc('month',pg_temp.today())+interval '1 month')::date),19,'future accrual after replay uses the subsequent prospective policy');
select lives_ok($$select pg_temp.apply(25)$$,'non-divisible annual entitlement can be replayed');
select is(pg_temp.balance(),33,'exact twelfths round only at presentation');
set local role postgres;
select is(private.vacation_balance_units('ba000000-0000-0000-0000-000000000001','ba000000-0000-0000-0000-000000000011',pg_temp.today()),400::bigint,'sixteen accruals of 25 retain all 400 twelfths');
set local role authenticated;
select lives_ok($$select pg_temp.apply(24)$$,'another replay replaces the calculation basis, without compounding old accrual');
select is(pg_temp.balance(),32,'repeated different policies never double-count earned days');

-- Active admin creates their own approved usage; employee creates a pending reservation.
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day)
values ('ba000000-0000-0000-0000-000000000001','ba000000-0000-0000-0000-000000000010','vacation',pg_temp.today()-10,pg_temp.today()-6,true);
select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-000000000012',true);
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day)
values ('ba000000-0000-0000-0000-000000000001','ba000000-0000-0000-0000-000000000012','vacation',pg_temp.today()+1,pg_temp.today()+3,true);
select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-000000000010',true);
select is((pg_temp.employee(pg_temp.propose(0),10)->>'usedDays')::integer,5,'preview shows approved usage');
select is((pg_temp.employee(pg_temp.propose(0),10)->>'after')::integer,-5,'reduced entitlement deducts approved usage without clamping');
select is((pg_temp.employee(pg_temp.propose(0),12)->>'reservedDays')::integer,3,'preview shows pending reservations');
select is((pg_temp.employee(pg_temp.propose(0),12)->>'after')::integer,-3,'pending reservations reduce the recalculated balance');
select is((pg_temp.propose(0)->>'hasShortfall')::boolean,true,'preview flags reduced entitlement shortfalls');
insert into previews values ('negative',pg_temp.propose(0));
select throws_like($$select public.recalculate_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',0,'carry_all',null,(select value->>'digest' from previews where key='negative'))$$,'%vacation_policy_negative_confirmation_required%','negative balances require separate explicit confirmation');
select is(pg_temp.balance(10),27,'rejected negative confirmation leaves the existing balance intact');
select lives_ok($$select public.recalculate_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',0,'carry_all',null,(select value->>'digest' from previews where key='negative'),true)$$,'explicit confirmation permits deficits');
select is(pg_temp.balance(10),-5,'confirmed used-leave deficit is visible');
select is(pg_temp.balance(12),-3,'confirmed reserved-leave deficit is visible');
select is((select count(*) from public.time_off_requests where studio_id='ba000000-0000-0000-0000-000000000001' and status in ('pending','approved')),3::bigint,'recalculation preserves all historical and current leave records and their statuses');
select lives_ok($$select pg_temp.apply(0,'none',null,true)$$,'carryover reduction can be explicitly confirmed');
select is(pg_temp.balance(10,(pg_temp.baseline()+interval '24 months')::date),-5,'no-carryover anniversary does not silently forgive a confirmed used-leave deficit');
select lives_ok($$select pg_temp.apply(0,'capped',2,true)$$,'capped carryover also supports explicit negative balances');
select is(pg_temp.balance(12,(pg_temp.baseline()+interval '24 months')::date),-3,'capped carryover retains a confirmed reservation deficit');
select lives_ok($$select pg_temp.apply(24)$$,'restoring entitlement replays actual history rather than retaining obsolete deficits');
select is(pg_temp.balance(10),27,'restored entitlement still deducts used vacation');
select is(pg_temp.balance(12),29,'restored entitlement still deducts pending vacation');

-- Approved future leave reserves days just like pending leave.
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day)
values ('ba000000-0000-0000-0000-000000000001','ba000000-0000-0000-0000-000000000010','vacation',pg_temp.today()+20,pg_temp.today()+21,true);
select is((pg_temp.employee(pg_temp.propose(0),10)->>'reservedDays')::integer,2,'approved future leave remains reserved');
select is((pg_temp.employee(pg_temp.propose(0),10)->>'after')::integer,-7,'approved past usage and future reservations are both deducted exactly once');

-- Leave entirely in a future work year can be insolvent despite a nonnegative current balance.
select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-000000000011',true);
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day)
values ('ba000000-0000-0000-0000-000000000001','ba000000-0000-0000-0000-000000000011','vacation',
 (pg_temp.baseline()+interval '24 months')::date+1,(pg_temp.baseline()+interval '24 months')::date+2,true);
select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-000000000010',true);
select is((pg_temp.employee(pg_temp.propose(0,'none'))->>'after')::integer,0,'current balance can be zero before a future work-year reservation');
select is((pg_temp.employee(pg_temp.propose(0,'none'))->>'minimumBalance')::integer,-2,'preview detects a shortfall in an entirely future work year');

-- A spanning reservation must also be evaluated after its anniversary boundary.
select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-000000000015',true);
insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day)
values ('ba000000-0000-0000-0000-000000000001','ba000000-0000-0000-0000-000000000015','vacation',
 (pg_temp.baseline()+interval '24 months')::date-1,(pg_temp.baseline()+interval '24 months')::date+2,true);
select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-000000000010',true);
select is((pg_temp.employee(pg_temp.propose(0,'none'),15)->>'after')::integer,-1,'future days in the current work year are already reserved');
select is((pg_temp.employee(pg_temp.propose(0,'none'),15)->>'minimumBalance')::integer,-4,'preview checks request starts and cross-anniversary future shortfalls');
select is((pg_temp.employee(pg_temp.propose(0,'none'),15)->>'shortfallDate')::date,(pg_temp.baseline()+interval '24 months')::date,'cross-anniversary deficit is dated at its actual checkpoint');

-- Tokens bind source changes even when visible rounded balances are identical.
insert into previews values ('stale',pg_temp.propose(12));
select public.set_vacation_opening_balance('ba000000-0000-0000-0000-000000000013',8,(date_trunc('month',pg_temp.today())-interval '2 months')::date);
select throws_like($$select public.recalculate_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',12,'carry_all',null,(select value->>'digest' from previews where key='stale'))$$,'%vacation_policy_preview_stale%','opening-balance changes invalidate a preview');
update previews set value=pg_temp.propose(12) where key='stale';
update public.time_off_requests set status='cancelled',cancelled_at=now() where user_id='ba000000-0000-0000-0000-000000000012';
select throws_like($$select public.recalculate_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',12,'carry_all',null,(select value->>'digest' from previews where key='stale'))$$,'%vacation_policy_preview_stale%','reservation changes invalidate a preview');
select is(pg_temp.balance(12),32,'cancellation restores days after recalculation');
update previews set value=pg_temp.propose(12) where key='stale';
select public.save_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',18,'carry_all');
select throws_like($$select public.recalculate_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',12,'carry_all',null,(select value->>'digest' from previews where key='stale'))$$,'%vacation_policy_preview_stale%','concurrent policy changes invalidate a preview');
select throws_like($$select public.preview_studio_vacation_policy_recalculation('ba000000-0000-0000-0000-000000000002',12,'carry_all')$$,'%vacation_policy_admin_required%','admin cannot preview another tenant');
select throws_like($$select public.recalculate_studio_vacation_policy('ba000000-0000-0000-0000-000000000002',12,'carry_all',null,'irrelevant',true)$$,'%vacation_policy_admin_required%','admin cannot recalculate another tenant');
select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-000000000011',true);
select throws_like($$select pg_temp.propose(12)$$,'%vacation_policy_admin_required%','employee cannot preview coworkers');
select throws_like($$select pg_temp.apply(12)$$,'%vacation_policy_admin_required%','employee cannot recalculate');
select throws_like($$select public.save_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',12,'carry_all')$$,'%Only active studio administrators%','employee cannot save a future-only policy');
set local role postgres;
update public.profiles set is_active=false where id='ba000000-0000-0000-0000-000000000010';
select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select throws_like($$select pg_temp.propose(12)$$,'%vacation_policy_admin_required%','deactivated admin cannot preview');
select throws_like($$select public.recalculate_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',12,'carry_all',null,'irrelevant',true)$$,'%vacation_policy_admin_required%','deactivated admin cannot recalculate');
select throws_like($$select public.save_studio_vacation_policy('ba000000-0000-0000-0000-000000000001',12,'carry_all')$$,'%Only active studio administrators%','deactivated admin cannot save a future-only policy');
select ok(not has_function_privilege('anon','public.recalculate_studio_vacation_policy(uuid,integer,text,integer,text,boolean,text)','execute'),'anonymous role cannot execute recalculation');
select ok(not has_function_privilege('authenticated','private.calculate_vacation_balance_units(uuid,uuid,date,date,date,private.studio_vacation_policies)','execute'),'authenticated role cannot bypass guarded balance APIs');
select * from finish();
rollback;
