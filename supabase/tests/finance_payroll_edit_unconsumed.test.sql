begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('7d000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',now() at time zone 'Europe/Kyiv')+make_interval(months=>n))::date$$;
create function pg_temp.cat() returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'$$;
create function pg_temp.result(n integer) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.salary(n integer,employee integer,patch jsonb default '{}') returns uuid language sql as $$
 select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object(
 'kind','payroll','employeeId',pg_temp.fid(employee),'revision',0,'name','Base salary',
 'amount','1','currency','UAH','categoryId',pg_temp.cat(),'basis','net','employeePayout','1',
 'employeeDeductions','0','employerCost','0','employerCostStatus','fixed',
 'intervalMonths',1,'payoutDay',15,'paymentMonthOffset',0,'effectiveFrom',pg_temp.month(),
 'commitment','agreed','certainty','fixed','reason','Salary agreement')||patch)$$;
create function pg_temp.payout(employee integer,period date) returns uuid language sql as $$
 select l.expected_item_id from public.finance_obligation_items l
 join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id
 where o.studio_id=pg_temp.fid(1) and o.employee_id=pg_temp.fid(employee)
   and o.period_start=period and l.component='payout' and l.managed_active$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Payroll editing');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','payroll-edit-'||n||'@test','{}','{}',now(),now() from generate_series(10,14)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Payroll person '||n,'payroll-edit-'||n||'@test',case when n=10 then 'admin' else 'employee' end,true from generate_series(10,14)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(1),pg_temp.fid(n),case when n=10 then 'admin' else 'employee' end,true from generate_series(10,14)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.fid(1),'UAH',pg_temp.month(-2),pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
values(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',100000,pg_temp.fid(10));
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select pg_temp.salary(100,11);
select is((select count(*) from public.finance_obligations where schedule_id=pg_temp.result(100))>0,true,'salary setup immediately generates unpaid obligations');
select ok((select editable and removable from public.get_finance_payroll_editability(pg_temp.fid(1)) where schedule_id=pg_temp.result(100)),'generated unpaid obligations do not consume a term');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(11,pg_temp.month())),1::numeric,'initial projection reflects 1 UAH');
select pg_temp.salary(101,11,jsonb_build_object('id',pg_temp.result(100),'revision',1,'amount','15000','employeePayout','15000','payoutDay',20));
select is((select count(*) from public.finance_schedule_terms where schedule_id=pg_temp.result(100)),1::bigint,'unused salary is edited in place');
select is((select amount from public.finance_schedule_terms where schedule_id=pg_temp.result(100)),15000::numeric,'salary becomes 15,000 UAH');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(11,pg_temp.month())),15000::numeric,'unpaid current projection is refreshed');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(11,pg_temp.month(2))),15000::numeric,'unpaid future projection is refreshed');
select is((select due_date from public.finance_expected_items where id=pg_temp.payout(11,pg_temp.month())),least(pg_temp.month()+19,pg_temp.month(1)-1),'payment timing is refreshed');
select pg_temp.salary(102,11,jsonb_build_object('id',pg_temp.result(100),'revision',1,'amount','15000','employeePayout','15000','effectiveFrom',pg_temp.month(1)));
select is((select commitment from public.finance_expected_items where id=pg_temp.payout(11,pg_temp.month())),null::text,'moved start retires the old active payout link');
select is((select count(*) from public.finance_expected_items i join public.finance_obligation_items l on l.studio_id=i.studio_id and l.expected_item_id=i.id
 join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id
 where o.schedule_id=pg_temp.result(100) and o.period_start=pg_temp.month() and i.commitment='cancelled'),1::bigint,'earlier unpaid payout is cancelled');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(11,pg_temp.month(1))),15000::numeric,'new start has the corrected amount');
select lives_ok($$select public.remove_unconsumed_finance_payroll(pg_temp.fid(1),pg_temp.fid(103),pg_temp.result(100),1)$$,'unused compensation can be removed');
select is((select count(*) from public.get_finance_payroll_editability(pg_temp.fid(1)) where schedule_id=pg_temp.result(100)),0::bigint,'removed compensation is no longer active');
select is((select count(*) from public.finance_obligation_items l join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id
 where o.schedule_id=pg_temp.result(100) and l.managed_active),0::bigint,'removed compensation leaves no active generated payouts');
select is((select count(*) from public.finance_expected_balances i join public.finance_obligation_items l on l.studio_id=i.studio_id and l.expected_item_id=i.id
 join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id
 where o.schedule_id=pg_temp.result(100) and i.commitment<>'cancelled'),0::bigint,'removed projections no longer enter forecast');
select pg_temp.salary(104,11,jsonb_build_object('amount','20000','employeePayout','20000','effectiveFrom',pg_temp.month(1)));
select ok(pg_temp.result(104)<>pg_temp.result(100),'employee can receive a new compensation configuration');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(11,pg_temp.month(1))),20000::numeric,'recreated compensation owns the unpaid month');
select pg_temp.salary(200,12,jsonb_build_object('amount','1000','employeePayout','1000'));
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(201),pg_temp.payout(12,pg_temp.month()),
 jsonb_build_object('kind','outgoing','date',(now() at time zone 'Europe/Kyiv')::date,'amount','1000','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),1000);
select ok((select not editable and not removable from public.get_finance_payroll_editability(pg_temp.fid(1)) where schedule_id=pg_temp.result(200)),'paid salary is consumed');
select throws_like($$select public.remove_unconsumed_finance_payroll(pg_temp.fid(1),pg_temp.fid(202),pg_temp.result(200),1)$$,'%finance_payroll_consumed%','paid compensation cannot be removed');
select pg_temp.salary(203,12,jsonb_build_object('id',pg_temp.result(200),'revision',1,'amount','1500','employeePayout','1500','effectiveFrom',pg_temp.month(1)));
select is((select count(*) from public.finance_schedule_terms where schedule_id=pg_temp.result(200)),2::bigint,'paid term requires a new revision');
select is((select amount from public.finance_schedule_terms where schedule_id=pg_temp.result(200) and revision=1),1000::numeric,'paid old term is unchanged');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(12,pg_temp.month())),1000::numeric,'paid payroll expectation is unchanged');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(12,pg_temp.month(1))),1500::numeric,'new revision affects next unpaid period');
select is((select sum(amount) from public.finance_planning_actuals where studio_id=pg_temp.fid(1) and category_id=pg_temp.cat()),1000::numeric,'historical payroll actual stays unchanged');
select pg_temp.salary(400,14,jsonb_build_object('amount','2500','employeePayout','2500'));
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(401),jsonb_build_object(
  'id',i.id,'version',i.version,'direction',i.direction,'amount',i.amount,'currency',i.currency,
  'categoryId',i.category_id,'description',i.description,'dueDate',i.due_date,'expectedDate',i.expected_payment_date,
  'commitment',i.commitment,'certainty',i.certainty,'established',true))
from public.finance_expected_items i where i.id=pg_temp.payout(14,pg_temp.month());
select ok((select not editable and not removable from public.get_finance_payroll_editability(pg_temp.fid(1)) where schedule_id=pg_temp.result(400)),'earned but unpaid payroll is historical');
select throws_like($$select public.remove_unconsumed_finance_payroll(pg_temp.fid(1),pg_temp.fid(402),pg_temp.result(400),1)$$,'%finance_payroll_consumed%','earned payroll cannot be removed');
select pg_temp.salary(300,13,jsonb_build_object('effectiveFrom',pg_temp.month(18)));
select public.generate_finance_obligations(pg_temp.fid(1),pg_temp.fid(301),pg_temp.result(300),pg_temp.month(18),pg_temp.month(19));
select is((select amount from public.finance_expected_items where id=pg_temp.payout(13,pg_temp.month(18))),1::numeric,'manual future obligation starts unpaid');
select pg_temp.salary(302,13,jsonb_build_object('id',pg_temp.result(300),'revision',1,'amount','15000','employeePayout','15000','effectiveFrom',pg_temp.month(19)));
select is((select count(*) from public.finance_obligation_items l join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id where o.schedule_id=pg_temp.result(300) and o.period_start=pg_temp.month(18) and l.managed_active),0::bigint,'moving a future start cancels a manually generated unpaid obligation');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(13,pg_temp.month(19))),15000::numeric,'manual future obligation follows the direct edit');
select lives_ok($$select public.remove_unconsumed_finance_payroll(pg_temp.fid(1),pg_temp.fid(303),pg_temp.result(300),1)$$,'far future unpaid compensation can be removed');
select is((select count(*) from public.finance_obligation_items l join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id where o.schedule_id=pg_temp.result(300) and l.managed_active),0::bigint,'removal cancels manually generated future obligations');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select * from public.get_finance_payroll_editability(pg_temp.fid(1))$$,'%finance_admin_required%','only finance admins can inspect payroll editability');
reset role;
select * from finish();
rollback;
