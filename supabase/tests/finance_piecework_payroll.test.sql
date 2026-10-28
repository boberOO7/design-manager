begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('9d000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
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
select pg_temp.salary(100,11);
select is((select amount from public.finance_schedule_terms where schedule_id=pg_temp.schedule(11)),null::numeric,'rate is not stored as a monthly amount');
select is((public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(11))->'current'->>'area')::numeric,17.345::numeric,'same active personally credited area, including stage shares and Kyiv month boundary');
select is((public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(11))->'current'->>'calculatedAmount')::numeric,1734.59::numeric,'multiply exact area and rate then round once');
select is((select certainty from public.finance_expected_items where id=pg_temp.payout(11)),'estimated','completed work initially creates an estimated payment');
select is((select count(*) from public.finance_obligation_items where obligation_id=pg_temp.obligation(11,pg_temp.month(1))),0::bigint,'future months have no zero or invented payments');
select ok(exists(select 1 from jsonb_array_elements(public.calculate_finance_forecast(pg_temp.fid(1))->'issues') i where i->>'reason'='piecework_unforecast'),'forecast explicitly identifies unforecast piecework pay');
select throws_like($$select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(101),pg_temp.payout(11),jsonb_build_object('kind','outgoing','date',current_date,'amount','100','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),100)$$,'%finance_payroll_confirmation_required%','payment cannot bypass payroll confirmation');
reset role;
update public.productivity_attributions set voided_at=now() where task_id=pg_temp.fid(41);
set constraints finance_piecework_attribution_refresh immediate;
set constraints finance_piecework_attribution_refresh deferred;
set local role authenticated;
select is((select amount from public.finance_expected_items where id=pg_temp.payout(11)),1234.56::numeric,'work changes refresh draft expected payroll without a page read');
reset role;
update public.productivity_attributions set voided_at=null where task_id=pg_temp.fid(41);
set constraints finance_piecework_attribution_refresh immediate;
set constraints finance_piecework_attribution_refresh deferred;
set local role authenticated;
select is((select amount from public.finance_expected_items where id=pg_temp.payout(11)),1734.59::numeric,'restored work refreshes the same expected payment');
create temporary table draft_versions as select version from public.finance_expected_items where id=pg_temp.payout(11);
select public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(11));
select public.ensure_finance_schedule_occurrences(pg_temp.fid(1));
select is((select version from public.finance_expected_items where id=pg_temp.payout(11)),(select version from draft_versions),'reads and unchanged maintenance preserve the draft payment version');
select pg_temp.confirm(102,11,'1800');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(11)),1800::numeric,'confirmed amount becomes the expected payout');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(11))->>'knownCost')::numeric,1800::numeric,'labor reports use the same confirmed monthly pay');
select is((select adjustment_amount from public.finance_payroll_earning_revisions where obligation_id=pg_temp.obligation(11)),65.41::numeric,'manual difference retained separately');
select pg_temp.confirm(102,11,'1800',jsonb_build_object('revision',0));
select is((select count(*) from public.finance_payroll_earning_revisions where obligation_id=pg_temp.obligation(11)),1::bigint,'identical request retry does not duplicate earnings');
select throws_like($$select pg_temp.confirm(102,11,'1801')$$,'%finance_request_conflict%','changed retry conflicts');
select throws_like($$select pg_temp.confirm(103,11,'1800',jsonb_build_object('revision',0))$$,'%finance_version_conflict%','stale version cannot overwrite monthly history');
select throws_like($$select pg_temp.confirm(103,11,'1800',jsonb_build_object('digest',repeat('0',32)))$$,'%finance_payroll_preview_stale%','stale source preview rejected');
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(104),pg_temp.payout(11),jsonb_build_object('kind','outgoing','date',(now() at time zone 'Europe/Kyiv')::date,'amount','1500','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),1500);
select pg_temp.confirm(105,11,'1200');
select is((select settled_amount from public.finance_expected_balances where id=pg_temp.payout(11)),1500::numeric,'lower accrual preserves paid allocations');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.payout(11)),0::numeric,'overpayment does not become a negative forecast payment');
select is((select overpaid_amount from public.finance_expected_balances where id=pg_temp.payout(11)),300::numeric,'overpayment is explicit');
select pg_temp.confirm(106,11,'0');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(11)),0::numeric,'paid salary can be explicitly corrected to zero');
select is((select overpaid_amount from public.finance_expected_balances where id=pg_temp.payout(11)),1500::numeric,'zero accrual retains the full overpayment');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(11))->>'knownCost')::numeric,0::numeric,'zero correction also changes the labor source');
select is((select count(*) from public.finance_allocations where expected_item_id=pg_temp.payout(11)),1::bigint,'corrections never rewrite allocation history');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),1::bigint,'corrections do not invent cash movements');
reset role;
update public.productivity_attributions set credited_area_m2=20 where task_id=pg_temp.fid(40) and voided_at is null;
set local role authenticated;
select ok((public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(11))->>'sourceChanged')::boolean,'later productivity change is visible');
select is((public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(11))->'confirmed'->'source'->>'area')::numeric,17.345::numeric,'confirmed productivity snapshot remains unchanged');
select public.ensure_finance_schedule_occurrences(pg_temp.fid(1));
select is((select amount from public.finance_expected_items where id=pg_temp.payout(11)),0::numeric,'maintenance preserves confirmed monthly corrections');
select pg_temp.confirm(107,11,'2500.13',jsonb_build_object('refreshSource',true));
select is((public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(11))->'confirmed'->'source'->>'area')::numeric,25::numeric,'updated work is applied only explicitly');
select pg_temp.salary(108,11,jsonb_build_object('id',pg_temp.schedule(11),'revision',1,'effectiveFrom',pg_temp.month(1),'ratePerM2','120'));
select is((select rate_per_m2 from public.finance_schedule_terms where id=(select terms_id from public.finance_obligations where id=pg_temp.obligation(11))),100.005::numeric,'next-month rate preserves confirmed old rate');
select is((select rate_per_m2 from public.finance_schedule_terms where id=(select terms_id from public.finance_obligations where id=pg_temp.obligation(11,pg_temp.month(1)))),120::numeric,'new rate applies from selected service month');
select pg_temp.salary(120,12,jsonb_build_object('payMethod','fixed','ratePerM2','','amount','2000','employeePayout','2000'));
select pg_temp.confirm(121,12,'2200');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(12)),2200::numeric,'same monthly correction supports fixed salary');
select pg_temp.salary(125,14);
reset role;
select set_config('request.jwt.claim.sub',pg_temp.fid(14)::text,true);
set local role authenticated;
update public.tasks set status='completed' where id=pg_temp.fid(50);
set constraints finance_piecework_attribution_refresh immediate;
set constraints finance_piecework_attribution_refresh deferred;
reset role;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select is((select amount from public.finance_expected_items where id=pg_temp.payout(14)),2000.10::numeric,'employee task completion refreshes earned payroll without requiring Finance access');
reset role;
update public.tasks set status='todo' where id=pg_temp.fid(50);
set constraints finance_piecework_attribution_refresh immediate;
set constraints finance_piecework_attribution_refresh deferred;
set local role authenticated;
select is((select commitment from public.finance_expected_items where id=pg_temp.payout(14)),'cancelled','reopening a task retires the unearned draft payout');
reset role;
update public.tasks set status='completed' where id=pg_temp.fid(50);
set constraints finance_piecework_attribution_refresh immediate;
set constraints finance_piecework_attribution_refresh deferred;
set local role authenticated;
select is((select amount from public.finance_expected_items where id=pg_temp.payout(14)),2000.10::numeric,'recompletion restores the earned draft without a duplicate payment');
reset role;
update public.projects set include_in_productivity=false where id=pg_temp.fid(32);
set constraints finance_piecework_project_refresh immediate;
set constraints finance_piecework_project_refresh deferred;
set local role authenticated;
select is((select commitment from public.finance_expected_items where id=pg_temp.payout(14)),'cancelled','project exclusion refreshes draft payroll even without attribution changes');
reset role;
update public.projects set include_in_productivity=true where id=pg_temp.fid(32);
set constraints finance_piecework_project_refresh immediate;
set constraints finance_piecework_project_refresh deferred;
set local role authenticated;
select is((select amount from public.finance_expected_items where id=pg_temp.payout(14)),2000.10::numeric,'restored project inclusion restores draft earnings');

reset role;
insert into public.tasks(id,project_id,stage,title,status,created_by) values(pg_temp.fid(52),pg_temp.fid(32),'stage_1','Additional stage work','todo',pg_temp.fid(10));
set constraints finance_piecework_attribution_refresh immediate;
set constraints finance_piecework_attribution_refresh deferred;
set local role authenticated;
select is((select amount from public.finance_expected_items where id=pg_temp.payout(14)),1000.05::numeric,'stage roster rebalance refreshes draft payroll');
select pg_temp.confirm(165,14,'1000.05');
reset role;
update public.projects set total_area_m2=300 where id=pg_temp.fid(32);
set constraints finance_piecework_attribution_refresh immediate;
set constraints finance_piecework_attribution_refresh deferred;
set local role authenticated;
select is((select amount from public.finance_expected_items where id=pg_temp.payout(14)),1000.05::numeric,'project area changes preserve confirmed payroll');
select ok((public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(14))->>'sourceChanged')::boolean,'project area change is visible for explicit payroll review');

select pg_temp.salary(126,14,jsonb_build_object('id',pg_temp.schedule(14),'revision',1,'effectiveFrom',pg_temp.month(1),'ratePerM2','150'));
select is((select count(*) from public.finance_schedule_terms where schedule_id=pg_temp.schedule(14)),2::bigint,'a new monthly rate preserves prior unconfirmed months');
select is((select rate_per_m2 from public.finance_schedule_terms where id=(select terms_id from public.finance_obligations where id=pg_temp.obligation(14))),100.005::numeric,'unconfirmed prior period retains its own rate');
select pg_temp.salary(127,14,jsonb_build_object('id',pg_temp.schedule(14),'revision',2,'effectiveFrom',pg_temp.month(1),'payMethod','fixed','ratePerM2','','amount','5000','employeePayout','5000'));
select is((select pay_method from public.finance_schedule_terms where id=(select terms_id from public.finance_obligations where id=pg_temp.obligation(14))),'per_m2','switching future pay method preserves earlier piecework terms');
select pg_temp.salary(128,15,jsonb_build_object('basis','gross','ratePerM2','100','employeeDeductions','200','employerCost','100','effectiveFrom',pg_temp.month(-1)));
select pg_temp.confirm(129,15,'1200','{}',pg_temp.month(-1));
select is((select amount from public.finance_expected_items where id=pg_temp.payout(15,pg_temp.month(-1))),1000::numeric,'gross earning derives employee payout using explicit deductions');
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(15,pg_temp.month(-1)))->>'knownCost')::numeric,1300::numeric,'gross salary and employer cost enter labor once');
select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(160),jsonb_build_object('obligationId',pg_temp.obligation(15,pg_temp.month(-1)),
 'version',private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(15,pg_temp.month(-1)))->>'version','reason','Recognize reviewed piecework pay'));
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.obligation(15,pg_temp.month(-1))),1300::numeric,'one payroll labor expense is recognized');
select throws_like($$select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(161),jsonb_build_object('obligationId',pg_temp.obligation(15,pg_temp.month(-1)),
 'version',private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(15,pg_temp.month(-1)))->>'version','reason','Duplicate recognition'))$$,'%finance_labor_no_remaining_cost%','no duplicate expense after recognition');
select pg_temp.confirm(162,15,'900','{}',pg_temp.month(-1));
select is((private.finance_labor_source(pg_temp.fid(1),pg_temp.obligation(15,pg_temp.month(-1)))->>'remainingCost')::numeric,(-300)::numeric,'recognized salary reduction becomes an explicit correction delta');
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.obligation(15,pg_temp.month(-1))),1300::numeric,'monthly correction does not rewrite recognized history');
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(163),(select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(160)),
 jsonb_build_object('operation','adjustment','amount','300','date',pg_temp.month()-1,'reason','Reviewed payroll reduction'));
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and obligation_id=pg_temp.obligation(15,pg_temp.month(-1))),1000::numeric,'existing recognition adjustment reconciles revised salary cost');
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(164),jsonb_build_object('kind','refund','date',(now() at time zone 'Europe/Kyiv')::date,'amount','200','accountId',pg_temp.fid(20),
 'relatedMovementId',(select id from public.finance_movements where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(104))));
select is((select settled_amount from public.finance_expected_balances where id=pg_temp.payout(11)),1300::numeric,'cash return updates payroll settlement through the existing signed allocation history');
select pg_temp.salary(170,10);
select pg_temp.salary(171,10,jsonb_build_object('id',pg_temp.schedule(10),'revision',1,'effectiveFrom',pg_temp.month(1),'ratePerM2','150'));
select pg_temp.salary(172,10,jsonb_build_object('id',pg_temp.schedule(10),'revision',2,'effectiveFrom',pg_temp.month(1),'ratePerM2','160'));
select is((select count(*) from public.finance_schedule_terms where schedule_id=pg_temp.schedule(10)),2::bigint,'editing a future draft rate preserves the earlier unconfirmed rate');
select is((select rate_per_m2 from public.finance_schedule_terms where id=(select terms_id from public.finance_obligations where id=pg_temp.obligation(10))),100.005::numeric,'earlier unconfirmed work month retains its rate');
select pg_temp.salary(130,13);
select pg_temp.confirm(131,13,'0');
select is(pg_temp.payout(13),null::uuid,'zero work does not create a zero payment');
select throws_like($$update public.finance_payroll_earning_revisions set final_amount=100 where studio_id=pg_temp.fid(1)$$,'%permission denied%','direct changes to earning history denied');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
set local role authenticated;
select is((select count(*) from public.finance_payroll_earning_revisions),0::bigint,'employees cannot read payroll history');
select throws_like($$select public.get_finance_payroll_period(pg_temp.fid(1),pg_temp.obligation(11))$$,'%finance_admin_required%','employees cannot preview payroll');
select throws_like($$select public.confirm_finance_payroll_earning(pg_temp.fid(1),pg_temp.fid(150),'{}')$$,'%finance_admin_required%','employees cannot confirm payroll');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.fid(16)::text,true);
set local role authenticated;
select is((select count(*) from public.finance_payroll_earning_revisions),0::bigint,'another studio cannot read payroll history');
select throws_like($$select public.confirm_finance_payroll_earning(pg_temp.fid(1),pg_temp.fid(150),'{}')$$,'%finance_admin_required%','another studio admin cannot confirm payroll');
reset role;
select * from finish();
rollback;
