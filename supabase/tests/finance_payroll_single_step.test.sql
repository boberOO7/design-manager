begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('9e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',now() at time zone 'Europe/Kyiv')+make_interval(months=>n))::date$$;
create function pg_temp.cat() returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'$$;
create function pg_temp.schedule(employee integer) returns uuid language sql as $$select id from public.finance_schedules where studio_id=pg_temp.fid(1) and employee_id=pg_temp.fid(employee) and stopped_from is null$$;
create function pg_temp.obligation(employee integer,period date default pg_temp.month()) returns uuid language sql as $$select id from public.finance_obligations where studio_id=pg_temp.fid(1) and employee_id=pg_temp.fid(employee) and period_start=period and kind='payroll'$$;
create function pg_temp.payout(employee integer,period date default pg_temp.month()) returns uuid language sql as $$select expected_item_id from public.finance_obligation_items where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.obligation(employee,period) and component='payout'$$;
create function pg_temp.salary(n integer,employee integer,patch jsonb default '{}') returns uuid language sql as $$
 select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object(
 'kind','payroll','employeeId',pg_temp.fid(employee),'revision',0,'name','Piecework payroll','payMethod','per_m2','ratePerM2','100.005',
 'amount','','currency','UAH','categoryId',pg_temp.cat(),'basis','net','employeePayout','',
 'employeeDeductions','0','employerCost','0','employerCostStatus','fixed','intervalMonths',1,'payoutDay',10,
 'paymentMonthOffset',1,'effectiveFrom',pg_temp.month(),'commitment','agreed','certainty','fixed','reason','Salary agreement')||patch)$$;
create function pg_temp.confirm(n integer,employee integer,value text,patch jsonb default '{}',period date default pg_temp.month()) returns uuid language sql as $$
 select public.confirm_finance_payroll_earning(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object(
 'obligationId',pg_temp.obligation(employee,period),'revision',coalesce((select max(revision) from public.finance_payroll_earning_revisions where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.obligation(employee,period)),0),
 'digest',public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(employee,period))->'current'->>'digest',
 'finalAmount',value,'reason','Reviewed payroll','refreshSource',false)||patch)$$;

insert into public.studios(id,name) values(pg_temp.fid(1),'Piecework payroll'),(pg_temp.fid(2),'Other studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','piecework-'||n||'@test','{}','{}',now(),now() from generate_series(10,16)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Payroll person '||n,'piecework-'||n||'@test',case when n in (10,16) then 'admin' else 'employee' end,true from generate_series(10,16)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=16 then 2 else 1 end),pg_temp.fid(n),case when n in (10,16) then 'admin' else 'employee' end,true from generate_series(10,16)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by,recognition_start_month,recognition_enabled_at) values(pg_temp.fid(1),'UAH',pg_temp.month(-2),pg_temp.fid(10),pg_temp.month(-2),pg_temp.month(-2)::timestamp at time zone 'Europe/Kyiv');
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',100000,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by)
values(pg_temp.fid(30),pg_temp.fid(1),'Paid work',100,'active',pg_temp.month(-1),pg_temp.fid(10)),
 (pg_temp.fid(31),pg_temp.fid(1),'Excluded work',100,'active',pg_temp.month(-1),pg_temp.fid(10));
update public.projects set include_in_productivity=false where id=pg_temp.fid(31);
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by)
values(pg_temp.fid(32),pg_temp.fid(1),'Stage work',100,'active',pg_temp.month(),pg_temp.fid(10));
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values(pg_temp.fid(32),pg_temp.fid(14),'designer',0,pg_temp.month());
insert into public.tasks(id,project_id,stage,title,status,assignee_id,created_by) values
 (pg_temp.fid(50),pg_temp.fid(32),'stage_1','Credited stage work','todo',pg_temp.fid(14),pg_temp.fid(10)),
 (pg_temp.fid(51),pg_temp.fid(32),'stage_2','Keep project active','todo',null,pg_temp.fid(10));

insert into public.productivity_attributions(studio_id,project_id,task_id,contributor_id,source_type,task_stage,credited_area_m2,completed_at,voided_at,contributor_name,contributor_job_title) values
 (pg_temp.fid(1),pg_temp.fid(30),pg_temp.fid(40),pg_temp.fid(11),'task','stage_2',12.345,pg_temp.month()::timestamp at time zone 'Europe/Kyiv',null,'Employee','Designer'),
 (pg_temp.fid(1),pg_temp.fid(30),pg_temp.fid(41),pg_temp.fid(11),'task','stage_1',5,pg_temp.month()::timestamp at time zone 'Europe/Kyiv',null,'Employee','Designer'),
 (pg_temp.fid(1),pg_temp.fid(31),pg_temp.fid(42),pg_temp.fid(11),'task','stage_2',100,pg_temp.month()::timestamp at time zone 'Europe/Kyiv',null,'Employee','Designer'),
 (pg_temp.fid(1),pg_temp.fid(30),pg_temp.fid(43),pg_temp.fid(11),'task','stage_2',100,pg_temp.month()::timestamp at time zone 'Europe/Kyiv',now(),'Employee','Designer'),
 (pg_temp.fid(1),pg_temp.fid(30),pg_temp.fid(44),pg_temp.fid(12),'task','stage_2',100,pg_temp.month()::timestamp at time zone 'Europe/Kyiv',null,'Other employee','Designer'),
 (pg_temp.fid(1),pg_temp.fid(30),pg_temp.fid(45),pg_temp.fid(11),'task','stage_2',10,pg_temp.month()::timestamp at time zone 'Europe/Kyiv'-interval '1 second',null,'Employee','Designer');
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
create function pg_temp.fx(rate text,day date default current_date) returns jsonb language sql as $$select jsonb_build_object('rate',rate,'source','manual','effectiveDate',day)$$;
create function pg_temp.advance(n integer,employee integer,amount text,rate text default '40',day date default current_date) returns uuid language sql as $$
select public.record_finance_payroll_advance(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('scheduleId',pg_temp.schedule(employee),'currency',case when employee=12 then 'UAH' else 'USD' end,'accountId',pg_temp.fid(20),'date',day,'amount',amount,'note','Advance','payrollFx',pg_temp.fx(rate,day)))$$;
create function pg_temp.preview(employee integer,rate text default '50',period date default pg_temp.month()) returns jsonb language sql as $$
select public.get_finance_payroll_payment(pg_temp.fid(1),pg_temp.payout(employee,period),current_date,pg_temp.fx(rate))$$;
create function pg_temp.pay(n integer,employee integer,amount text,rate text default '50',period date default pg_temp.month(),patch jsonb default '{}') returns uuid language sql as $$
select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(n),pg_temp.payout(employee,period),jsonb_build_object('accountId',pg_temp.fid(20),'date',current_date,'amount',amount,'note','Salary payment','payrollFx',pg_temp.fx(rate),'digest',pg_temp.preview(employee,rate,period)->>'digest')||patch)$$;

-- Single-step salary payment: all failures roll back confirmation too.
select pg_temp.salary(300,11,jsonb_build_object('currency','USD','ratePerM2','6'));
create temporary table atomic_submission as select jsonb_build_object(
 'accountId',pg_temp.fid(20),'date',current_date,'amount',pg_temp.preview(11)->>'cashDue',
 'note','Salary payment','payrollFx',pg_temp.fx('50'),'digest',pg_temp.preview(11)->>'digest',
 'earningDigest',public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(11))->'current'->>'digest',
 'earningReason','Agreed with payment') input;
select throws_like($$select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(301),pg_temp.payout(11),
 (select input||jsonb_build_object('digest',repeat('0',32)) from atomic_submission))$$,'%finance_payroll_preview_stale%','stale payment quote rejected before confirmation');
select throws_like($$select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(301),pg_temp.payout(11),
 (select input||jsonb_build_object('earningDigest',repeat('0',32)) from atomic_submission))$$,'%finance_payroll_preview_stale%','stale work calculation rejected');
select throws_like($$select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(301),pg_temp.payout(11),
 (select input||jsonb_build_object('accountId',pg_temp.fid(999)) from atomic_submission))$$,'%finance_input_invalid%','invalid account fails after nested confirmation');
select is((select count(*) from public.finance_payroll_earning_revisions where obligation_id=pg_temp.obligation(11)),0::bigint,'failed cash payment rolls back the earning revision');
select is((select count(*) from public.finance_planning_requests where payload->>'operation' in ('payroll_earning','payroll_payment')),0::bigint,'failed cash payment rolls back both request records');
select throws_like($$select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(301),pg_temp.payout(11),
 (select input||jsonb_build_object('amount',(input->>'amount')::numeric+1) from atomic_submission))$$,'%finance_overallocation%','overpayment cannot confirm and pay');
select is((select count(*) from public.finance_payroll_earning_revisions where obligation_id=pg_temp.obligation(11)),0::bigint,'overpayment also rolls back confirmation');
select throws_like($$select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(301),pg_temp.payout(11),
 (select input||jsonb_build_object('date',(now() at time zone 'Europe/Kyiv')::date+1) from atomic_submission))$$,'%finance_input_invalid%','future Kyiv payment date rejected');
select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(301),pg_temp.payout(11),(select input from atomic_submission));
select is((select count(*) from public.finance_payroll_earning_revisions where obligation_id=pg_temp.obligation(11)),1::bigint,'one earning revision created together with payment');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),1::bigint,'one cash movement created');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.payout(11)),0::numeric,'fresh confirmation digest permits full salary settlement');
select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(301),pg_temp.payout(11),(select input from atomic_submission));
select is((select count(*) from public.finance_payroll_earning_revisions where obligation_id=pg_temp.obligation(11)),1::bigint,'retry does not repeat confirmation');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),1::bigint,'retry does not repeat payment');
select throws_like($$select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(301),pg_temp.payout(11),
 (select input||jsonb_build_object('amount','1') from atomic_submission))$$,'%finance_request_conflict%','changed retry cannot reuse the same payment request');
select set_config('request.jwt.claim.sub',pg_temp.fid(16)::text,true);
select throws_like($$select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(303),pg_temp.payout(11),(select input from atomic_submission))$$,'%finance_admin_required%','another studio admin cannot pay this studio salary');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(303),pg_temp.payout(11),(select input from atomic_submission))$$,'%finance_admin_required%','employee cannot approve or pay salary');
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);

-- The same operation supports UAH earnings covered entirely by an advance.
select pg_temp.salary(304,12);
select pg_temp.advance(305,12,'20000','1');
select pg_temp.pay(306,12,'0','1',pg_temp.month(),jsonb_build_object(
 'earningDigest',public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(12))->'current'->>'digest',
 'earningReason','Apply advance to calculated salary'));
select is((select count(*) from public.finance_payroll_earning_revisions where obligation_id=pg_temp.obligation(12)),1::bigint,'credit-only payment confirms UAH earnings');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.payout(12)),0::numeric,'credit-only payment settles salary');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),2::bigint,'credit-only payment creates no additional cash movement');
-- New work must not silently change the money shown in the payment preview.
reset role;
insert into public.productivity_attributions(studio_id,project_id,task_id,contributor_id,source_type,task_stage,credited_area_m2,completed_at,contributor_name,contributor_job_title)
values(pg_temp.fid(1),pg_temp.fid(30),pg_temp.fid(60),pg_temp.fid(13),'task','stage_2',2,pg_temp.month()::timestamp at time zone 'Europe/Kyiv','Employee','Designer');
set local role authenticated;
select pg_temp.salary(307,13,jsonb_build_object('currency','USD','ratePerM2','6'));
reset role;
update public.productivity_attributions set credited_area_m2=3 where task_id=pg_temp.fid(60);
set local role authenticated;
select throws_like($$select pg_temp.pay(308,13,'200','50',pg_temp.month(),jsonb_build_object(
 'earningDigest',public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(13))->'current'->>'digest',
 'earningReason','Salary payment'))$$,'%finance_payroll_preview_stale%','post-confirmation financial changes roll back instead of silently repricing the payment');
select is((select count(*) from public.finance_payroll_earning_revisions where obligation_id=pg_temp.obligation(13)),0::bigint,'changed preview leaves no earning revision');
select is((select amount from public.finance_expected_balances where id=pg_temp.payout(13)),12::numeric,'changed preview leaves the original expected amount');
reset role;
update public.productivity_attributions set credited_area_m2=2 where task_id=pg_temp.fid(60);
set local role authenticated;
select pg_temp.pay(310,13,'200','50',pg_temp.month(),jsonb_build_object(
 'earningDigest',public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(13))->'current'->>'digest',
 'earningReason','Salary payment'));
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.payout(13)),8::numeric,'single-step partial payment leaves the correct USD balance');
select pg_temp.pay(311,13,'400');
select is((select count(*) from public.finance_payroll_earning_revisions where obligation_id=pg_temp.obligation(13)),1::bigint,'later instalment uses the confirmed earning without another revision');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.payout(13)),0::numeric,'later instalment settles remaining salary');
-- A USD cash payment also confirms piecework atomically, with no settlement quote.
reset role;
insert into public.finance_accounts(id,studio_id,name,currency,account_type,opening_balance,created_by)
values(pg_temp.fid(21),pg_temp.fid(1),'USD cash','USD','cash',0,pg_temp.fid(10));
insert into public.productivity_attributions(studio_id,project_id,task_id,contributor_id,source_type,task_stage,credited_area_m2,completed_at,contributor_name,contributor_job_title)
values(pg_temp.fid(1),pg_temp.fid(30),pg_temp.fid(61),pg_temp.fid(15),'task','stage_2',10,pg_temp.month()::timestamp at time zone 'Europe/Kyiv','Employee','Designer');
set local role authenticated;
select pg_temp.salary(320,15,jsonb_build_object('currency','USD','ratePerM2','6'));
create temporary table usd_submission as select jsonb_build_object(
 'accountId',pg_temp.fid(21),'date',current_date,'amount','60','note','USD cash salary',
 'payrollFx',jsonb_build_object('paymentCurrency','USD'),
 'digest',public.get_finance_payroll_payment(pg_temp.fid(1),pg_temp.payout(15),current_date,jsonb_build_object('paymentCurrency','USD'))->>'digest',
 'earningDigest',public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(15))->'current'->>'digest',
 'earningReason','Paid in USD cash') input;
select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(321),pg_temp.payout(15),(select input from usd_submission));
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.payout(15)),0::numeric,'USD cash settles newly confirmed USD piecework');
select is((select count(*) from public.finance_payroll_earning_revisions where obligation_id=pg_temp.obligation(15)),1::bigint,'USD payment confirms the reviewed work once');
select is((select currency from public.finance_movement_entries where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(321)) and entry_role='primary'),'USD','cash ledger records USD');
select is((select amount from public.finance_movement_entries where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(321)) and entry_role='primary'),(-60)::numeric,'USD 60 is debited from USD cash');
select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(321),pg_temp.payout(15),(select input from usd_submission));
select is((select count(*) from public.finance_payroll_earning_revisions where obligation_id=pg_temp.obligation(15)),1::bigint,'USD retry retains one earning revision');
select is((select count(*) from public.finance_payroll_cash where obligation_id=pg_temp.obligation(15)),1::bigint,'USD retry retains one payment');
select * from finish();
rollback;
