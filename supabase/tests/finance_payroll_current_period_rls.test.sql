begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('7a000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',now() at time zone 'Europe/Kyiv')+make_interval(months=>n))::date$$;
create function pg_temp.cat(key text) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key=key$$;
create function pg_temp.result(n integer) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.item(employee integer,component text,period date) returns uuid language sql as $$
 select l.expected_item_id from public.finance_obligation_items l join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id
 where o.studio_id=pg_temp.fid(1) and o.employee_id=pg_temp.fid($1) and o.period_start=$3 and l.component=$2$$;
create function pg_temp.agreement(n integer,employee integer,patch jsonb default '{}') returns uuid language sql as $$
 select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('kind','payroll','employeeId',pg_temp.fid(employee),'revision',0,'name','Salary','amount','1000','currency','UAH','categoryId',pg_temp.cat('salary'),'basis','net','employeePayout','1000','employeeDeductions','0','intervalMonths',1,'payoutDay',15,'paymentMonthOffset',0,'effectiveFrom',pg_temp.month(),'commitment','agreed','certainty','fixed','reason','Agreement')||patch)$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Current payroll');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','current-payroll-'||n||'@test','{}','{}',now(),now() from generate_series(10,12)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Payroll person '||n,'current-payroll-'||n||'@test',case when n=10 then 'admin' else 'employee' end,true from generate_series(10,12)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(1),pg_temp.fid(n),case when n=10 then 'admin' else 'employee' end,true from generate_series(10,12)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'UAH',pg_temp.month(-1),pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',10000,pg_temp.fid(10));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.finalize_finance_setup(pg_temp.fid(1));
select lives_ok($$select pg_temp.agreement(100,11)$$,'new agreement accepts omitted employer contributions');
select is((select employer_cost from public.finance_schedule_terms where schedule_id=pg_temp.result(100)),0::numeric,'omitted contributions default to explicit zero');
select is((select employer_cost_status from public.finance_schedule_terms where schedule_id=pg_temp.result(100)),'fixed','zero is known, not unknown');
select is((select count(*) from jsonb_array_elements(public.calculate_finance_forecast(pg_temp.fid(1),'6')->'issues') i where i->>'reason'='unknown_employer_cost' and i->>'label'='Payroll person 11'),0::bigint,'default zero creates no missing-cost warning');
select lives_ok($$select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(101),jsonb_build_object('id',i.id,'version',i.version,'direction',i.direction,'amount',i.amount,'currency',i.currency,'categoryId',i.category_id,'description',i.description,'dueDate',i.due_date,'expectedDate',i.expected_payment_date,'commitment',i.commitment,'certainty',i.certainty,'established',true)) from public.finance_expected_items i where i.id=pg_temp.item(11,'payout',pg_temp.month())$$,'current payout may be earned without settlement');
select lives_ok($$select pg_temp.agreement(102,11,jsonb_build_object('id',pg_temp.result(100),'revision',1,'basis','gross','amount','1200','employeePayout','900','employeeDeductions','300','employerCost','100','employerCostStatus','fixed','payoutDay',20,'effectiveFrom',pg_temp.month()))$$,'one revision corrects unsettled current month');
select is((select amount from public.finance_expected_items where id=pg_temp.item(11,'payout',pg_temp.month())),900::numeric,'current payout follows revision');
select is((select is_established from public.finance_expected_items where id=pg_temp.item(11,'payout',pg_temp.month())),true,'earned state remains intact during correction');
select is((select amount from public.finance_expected_items where id=pg_temp.item(11,'deductions',pg_temp.month())),300::numeric,'current deduction created');
select is((select amount from public.finance_expected_items where id=pg_temp.item(11,'employer_cost',pg_temp.month())),100::numeric,'current employer cost created');
select is((select due_date from public.finance_expected_items where id=pg_temp.item(11,'payout',pg_temp.month())),least(pg_temp.month()+19,(pg_temp.month(1)-1)),'current payout timing corrected');
select is((select amount from public.finance_expected_items where id=pg_temp.item(11,'employer_cost',pg_temp.month(2))),100::numeric,'same revision updates generated future months');
select is((select due_date from public.finance_expected_items where id=pg_temp.item(11,'payout',pg_temp.month(2))),least(pg_temp.month(2)+19,(pg_temp.month(3)-1)),'future payout timing updates with agreement');
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(103),pg_temp.item(11,'payout',pg_temp.month()),jsonb_build_object('kind','outgoing','date',(now() at time zone 'Europe/Kyiv')::date,'amount','100','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('salary')),100);
select throws_like($$select pg_temp.agreement(104,11,jsonb_build_object('id',pg_temp.result(100),'revision',2,'effectiveFrom',pg_temp.month(),'basis','gross','amount','1300','employeePayout','1000','employeeDeductions','300'))$$,'%finance_schedule_effective_date%','partially settled current period cannot be rewritten');
select is((select amount from public.finance_expected_items where id=pg_temp.item(11,'payout',pg_temp.month())),900::numeric,'rejected amendment leaves current amount intact');
select lives_ok($$select pg_temp.agreement(105,11,jsonb_build_object('id',pg_temp.result(100),'revision',2,'effectiveFrom',pg_temp.month(1),'basis','gross','amount','1300','employeePayout','1000','employeeDeductions','300'))$$,'revision begins next eligible period');
select is((select amount from public.finance_expected_items where id=pg_temp.item(11,'payout',pg_temp.month())),900::numeric,'next-period revision preserves settled month');
select is((select amount from public.finance_expected_items where id=pg_temp.item(11,'payout',pg_temp.month(1))),1000::numeric,'next-period revision updates unpaid future');
select lives_ok($$select pg_temp.agreement(200,12,jsonb_build_object('employeeDeductions','','employerCostStatus','unknown'))$$,'explicit unknown remains available');
select is((select count(*) from jsonb_array_elements(public.calculate_finance_forecast(pg_temp.fid(1),'6')->'issues') i where i->>'source'='payroll' and i->>'id'=pg_temp.fid(12)::text),2::bigint,'payroll warning is one per employee and root cause');
select ok(exists(select 1 from jsonb_array_elements(public.calculate_finance_forecast(pg_temp.fid(1),'6')->'issues') i where i->>'id'=pg_temp.fid(12)::text and i->>'reason'='unknown_employer_cost'),'employer warning retained');
select ok(exists(select 1 from jsonb_array_elements(public.calculate_finance_forecast(pg_temp.fid(1),'6')->'issues') i where i->>'id'=pg_temp.fid(12)::text and i->>'reason'='unknown_deductions'),'deductions warning retained');
select lives_ok($$select pg_temp.agreement(203,12,jsonb_build_object('id',pg_temp.result(200),'revision',1,'effectiveFrom',pg_temp.month(),'amount','1050','employeePayout','1050','employeeDeductions',''))$$,'omitted cost fields retain an existing unknown agreement');
select is((select employer_cost_status from public.finance_schedule_terms where schedule_id=pg_temp.result(200) order by revision desc limit 1),'unknown','revision keeps deliberate unknown state');
select is((select employer_cost from public.finance_schedule_terms where schedule_id=pg_temp.result(200) order by revision desc limit 1),null::numeric,'revision does not infer zero for historical unknown');
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(201),pg_temp.item(12,'payout',pg_temp.month(1)),jsonb_build_object('kind','outgoing','date',(now() at time zone 'Europe/Kyiv')::date,'amount','100','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('salary')),100);
select lives_ok($$select pg_temp.agreement(202,12,jsonb_build_object('id',pg_temp.result(200),'revision',1,'effectiveFrom',pg_temp.month(),'amount','1100','employeePayout','1100','employeeDeductions','0','employerCost','0','employerCostStatus','fixed'))$$,'settled future month does not block unpaid current correction');
select is((select amount from public.finance_expected_items where id=pg_temp.item(12,'payout',pg_temp.month())),1100::numeric,'unpaid current month updates');
select is((select amount from public.finance_expected_items where id=pg_temp.item(12,'payout',pg_temp.month(1))),1050::numeric,'partially settled future month stays frozen');
select is((select amount from public.finance_expected_items where id=pg_temp.item(12,'payout',pg_temp.month(2))),1100::numeric,'later unpaid month receives correction');
select * from finish();
rollback;
