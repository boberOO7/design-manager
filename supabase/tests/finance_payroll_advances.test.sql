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

select pg_temp.salary(200,11,jsonb_build_object('currency','USD','ratePerM2','6','effectiveFrom',pg_temp.month(-1)));
select pg_temp.salary(201,13,jsonb_build_object('currency','USD','ratePerM2','6','effectiveFrom',pg_temp.month(-1)));
select pg_temp.salary(202,12,jsonb_build_object('payMethod','fixed','ratePerM2','','amount','2000','employeePayout','2000'));
select is((public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(13))->'current'->>'area')::numeric,0::numeric,'zero production month is valid');
select pg_temp.advance(203,13,'8000','40',current_date-1);
select is((select credit_amount from public.finance_payroll_cash where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(203))),200::numeric,'UAH 8000 at 40 fixes a USD 200 advance');
select is((select count(*) from public.finance_allocations where studio_id=pg_temp.fid(1)),0::bigint,'advance needs no fictitious zero salary allocation');
select pg_temp.advance(203,13,'8000','40',current_date-1);
select is((select count(*) from public.finance_payroll_cash where employee_id=pg_temp.fid(13)),1::bigint,'advance retry is idempotent');
select throws_like($$select pg_temp.advance(203,13,'8001','40',current_date-1)$$,'%finance_request_conflict%','changed retry cannot alter issued advance');
select pg_temp.confirm(204,13,'1000');
select is((pg_temp.preview(13)->>'advanceUsed')::numeric,200::numeric,'advance retains USD credit after rate changes');
select is((pg_temp.preview(13)->>'cashDue')::numeric,40000::numeric,'only remaining USD 800 converted at salary-date rate 50');
select is((pg_temp.preview(11)->>'advanceAvailable')::numeric,0::numeric,'another employee cannot consume this advance');
create temporary table salary_submission as select jsonb_build_object('accountId',pg_temp.fid(20),'date',current_date,'amount','40000','note','Salary payment','payrollFx',pg_temp.fx('50'),'digest',pg_temp.preview(13)->>'digest') input;
select pg_temp.pay(205,13,'40000');
select is((select settled_amount from public.finance_expected_balances where id=pg_temp.payout(13)),1000::numeric,'USD advance and new payment settle exactly USD 1000');
select is((select sum(payment_amount) from public.finance_allocations where expected_item_id=pg_temp.payout(13)),48000::numeric,'only actual UAH 8000 plus 40000 was paid');
select is((select settlement_rate from public.finance_allocations where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(203))),0.025::numeric,'advance allocation uses its original frozen rate');
select is((select credit_available from public.finance_payroll_credit_availability where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(203))),0::numeric,'used advance cannot be spent twice');
select is((select settlement_effective_date from public.finance_allocations where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(203))),current_date-1,'advance keeps its own payment date after salary-date FX changes');
select public.record_finance_payroll_payment(pg_temp.fid(1),pg_temp.fid(205),pg_temp.payout(13),(select input from salary_submission));
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),2::bigint,'salary retry creates no duplicate cash movement');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(13))->>'knownCost')::numeric,1000::numeric,'advances do not duplicate accrued salary expenses');

-- Advance larger than one month carries forward in its frozen currency.
select pg_temp.advance(206,11,'60000','40');
select pg_temp.confirm(207,11,'1000','{}',pg_temp.month(-1));
select pg_temp.confirm(208,11,'1000');
select pg_temp.pay(209,11,'0','50',pg_temp.month(-1));
select is((select credit_available from public.finance_payroll_credit_availability where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(206))),500::numeric,'unused USD 500 is retained for another month');
select is((pg_temp.preview(11,'60')->>'cashDue')::numeric,30000::numeric,'following salary deducts remaining USD 500 before conversion');
select pg_temp.pay(210,11,'10000','50');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.payout(11)),300::numeric,'partial cash payment plus credit leaves the correct USD balance');
select is((pg_temp.preview(11,'60')->>'cashDue')::numeric,18000::numeric,'unpaid USD balance uses the next actual payment rate');
select throws_like($$select pg_temp.pay(211,11,'24000','60')$$,'%finance_overallocation%','salary overpayment is not silently carried into another month');
select pg_temp.pay(211,11,'18000','60');
select pg_temp.advance(222,11,'6000','60');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.payout(11)),0::numeric,'last salary installment settles remaining USD');
select is((select credit_available from public.finance_payroll_credit_availability where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(222))),100::numeric,'explicit additional advance freezes USD credit at its payment-date rate');
select pg_temp.confirm(212,11,'900');
select is((select overpaid_amount from public.finance_expected_balances where id=pg_temp.payout(11)),100::numeric,'later accrual reduction shows overpayment without silently releasing paid salary');
select is((select credit_available from public.finance_payroll_credit_availability where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(222))),100::numeric,'accrual correction does not turn historical overpayment into automatic future credit');

-- Refunds and corrections keep employee ownership and conserve available credit.
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(213),jsonb_build_object('kind','refund','relatedMovementId',(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(222)),'accountId',pg_temp.fid(20),'date',current_date,'amount','3000'));
select is((select credit_available from public.finance_payroll_credit_availability where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(222))),50::numeric,'refund first reduces the unused USD advance');
select pg_temp.advance(214,13,'4000','40');
select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(215),(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(214)),jsonb_build_object('kind','outgoing','date',current_date,'accountId',pg_temp.fid(20),'amount','8000','categoryId',pg_temp.cat(),'description','Correct advance'));
select is((select credit_available from public.finance_payroll_credit_availability where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(214))),0::numeric,'corrected original advance is unavailable');
select is((select credit_available from public.finance_payroll_credit_availability where movement_id=(select replacement_movement_id from public.finance_movement_corrections where original_movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(214)))),200::numeric,'replacement advance retains employee and original same-day rate');

select throws_like($$select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(223),(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(215)),jsonb_build_object('kind','outgoing','date',current_date-1,'accountId',pg_temp.fid(20),'amount','4000','categoryId',pg_temp.cat(),'description','New advance date'))$$,'%finance_fx_required%','changed advance date requires its own FX quote');
select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(224),(select replacement_movement_id from public.finance_movement_corrections where original_movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(214))),jsonb_build_object('kind','outgoing','date',current_date-1,'accountId',pg_temp.fid(20),'amount','4000','categoryId',pg_temp.cat(),'description','New advance date','payrollFx',pg_temp.fx('50',current_date-1)));
select is((select credit_available from public.finance_payroll_credit_availability where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(224))),80::numeric,'changed-date correction uses the supplied dated rate');
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(225),jsonb_build_object('kind','refund','relatedMovementId',(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(203)),'accountId',pg_temp.fid(20),'date',current_date,'amount','4000'));
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.payout(13)),100::numeric,'refund of applied advance releases USD at its frozen original rate');
select is((select credit_available from public.finance_payroll_credit_availability where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(203))),0::numeric,'refunded advance cannot become available credit again');
select pg_temp.advance(216,12,'500');
select is((pg_temp.preview(12)->>'cashDue')::numeric,1500::numeric,'fixed UAH payroll uses the same advance workflow');
select pg_temp.pay(217,12,'1500');
select is((select settled_amount from public.finance_expected_balances where id=pg_temp.payout(12)),2000::numeric,'fixed UAH salary remains supported');

reset role;
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values(pg_temp.fid(21),pg_temp.fid(1),'USD bank','USD',0,pg_temp.fid(10));
set local role authenticated;
select pg_temp.confirm(226,13,'1200');
select throws_like($$select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(227),pg_temp.payout(13),jsonb_build_object('kind','outgoing','date',current_date,'amount','10','accountId',pg_temp.fid(21),'categoryId',pg_temp.cat(),'fx',pg_temp.fx('40')),10)$$,'%finance_payroll_uah_required%','USD piecework cannot bypass UAH cash requirement through generic payment RPC');
select throws_like($$select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(228),pg_temp.payout(11),(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(224)),1)$$,'%finance_allocation_incompatible%','advance cannot be matched outside its guarded employee settlement flow');
create temporary table old_payroll_preview as select pg_temp.preview(13) value;
select pg_temp.advance(229,13,'40','40');
select throws_like($$select pg_temp.pay(230,13,'0','50',pg_temp.month(),jsonb_build_object('digest',(select value->>'digest' from old_payroll_preview)))$$,'%finance_payroll_preview_stale%','a newly issued advance invalidates an otherwise valid salary preview');
select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(231),(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(205)),jsonb_build_object('kind','outgoing','date',current_date,'accountId',pg_temp.fid(20),'amount','50000','categoryId',pg_temp.cat(),'description','Correct actual salary'));
select is((select obligation_id from public.finance_payroll_cash where movement_id=(select result_id from public.finance_planning_requests where request_id=pg_temp.fid(231))),pg_temp.obligation(13),'corrected actual salary stays tied to its original work month');
select pg_temp.confirm(232,13,'500','{}',pg_temp.month(-1));
select is((pg_temp.preview(13,'50',pg_temp.month(-1))->>'advanceAvailable')::numeric,81::numeric,'another month can use explicit advances but cannot consume corrected ordinary salary cash');
select throws_like($$insert into public.finance_payroll_cash(studio_id,movement_id,employee_id,credit_currency,credit_amount,credit_rate,credit_source,created_by) values(pg_temp.fid(1),pg_temp.fid(999),pg_temp.fid(13),'USD',1,40,'manual',pg_temp.fid(10))$$,'%permission denied%','direct employee cash writes denied');
select throws_like($$update public.finance_payroll_cash set credit_amount=1 where studio_id=pg_temp.fid(1)$$,'%permission denied%','frozen advance amounts cannot be edited directly');
select throws_like($$select pg_temp.pay(218,11,'1','50',pg_temp.month(),jsonb_build_object('digest',repeat('0',32)))$$,'%finance_payroll_preview_stale%','stale salary or advance snapshot rejected');
select throws_like($$select pg_temp.advance(219,11,'1','0')$$,'%finance_fx_required%','zero FX rejected');
select throws_like($$select pg_temp.advance(220,11,'100','40',current_date+1)$$,'%finance_%','future cash posting rejected');
select throws_like($$select public.get_finance_payroll_cash(pg_temp.fid(2),pg_temp.schedule(11))$$,'%finance_admin_required%','cross-studio reads denied');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.fid(13)::text,true);
set local role authenticated;
select is((select count(*) from public.finance_payroll_cash),0::bigint,'employee cannot see salary cash records');
select throws_like($$select pg_temp.advance(221,13,'100')$$,'%finance_admin_required%','employee cannot issue advances');
select throws_like($$select pg_temp.preview(13)$$,'%finance_admin_required%','employee cannot preview payroll');
reset role;
select * from finish();
rollback;
