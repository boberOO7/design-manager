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
create function pg_temp.legacy_term(p_schedule uuid,p_revision integer,p_value numeric,p_starts date) returns void language sql as $$
 insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,
   interval_months,payout_day,payment_month_offset,effective_from,effective_through,
   commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
 select studio_id,schedule_id,p_revision,name,p_value,currency,category_id,interval_months,payout_day,
   payment_month_offset,p_starts,effective_through,commitment,certainty,basis,p_value,
   employee_deductions,employer_cost,employer_cost_status,'Unused test revision',created_by
 from public.finance_schedule_terms where schedule_id=p_schedule and revision=1;
$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Payroll editing');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','payroll-edit-'||n||'@test','{}','{}',now(),now() from generate_series(10,16)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Payroll person '||n,'payroll-edit-'||n||'@test',case when n=10 then 'admin' else 'employee' end,true from generate_series(10,16)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(1),pg_temp.fid(n),case when n=10 then 'admin' else 'employee' end,true from generate_series(10,16)n;
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
select is((select count(*) from public.get_finance_payroll_historical_terms(pg_temp.fid(1))),0::bigint,'unused compensation is excluded from immutable history');
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
select ok((select term_id from public.get_finance_payroll_historical_terms(pg_temp.fid(1)))=(select id from public.finance_schedule_terms where schedule_id=pg_temp.result(200) and revision=1),'paid compensation enters immutable history');
select throws_like($$select public.remove_unconsumed_finance_payroll(pg_temp.fid(1),pg_temp.fid(202),pg_temp.result(200),1)$$,'%finance_payroll_consumed%','paid compensation cannot be removed');
select pg_temp.salary(203,12,jsonb_build_object('id',pg_temp.result(200),'revision',1,'amount','1500','employeePayout','1500','effectiveFrom',pg_temp.month(1)));
select is((select count(*) from public.finance_schedule_terms where schedule_id=pg_temp.result(200)),2::bigint,'paid term requires a new revision');
select is((select count(*) from public.get_finance_payroll_historical_terms(pg_temp.fid(1))),1::bigint,'unpaid new revision is excluded from immutable history');
select is((select amount from public.finance_schedule_terms where schedule_id=pg_temp.result(200) and revision=1),1000::numeric,'paid old term is unchanged');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(12,pg_temp.month())),1000::numeric,'paid payroll expectation is unchanged');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(12,pg_temp.month(1))),1500::numeric,'new revision affects next unpaid period');
select is((select sum(amount) from public.finance_planning_actuals where studio_id=pg_temp.fid(1) and category_id=pg_temp.cat()),1000::numeric,'historical payroll actual stays unchanged');
select pg_temp.salary(204,12,jsonb_build_object('id',pg_temp.result(200),'revision',2,
  'amount','1600','employeePayout','1600','effectiveFrom',pg_temp.month(1)));
select is((select count(*) from public.finance_schedule_terms where schedule_id=pg_temp.result(200)),2::bigint,
  'later unused revision edits in place without rewriting paid history');
select is((select amount from public.finance_schedule_terms where schedule_id=pg_temp.result(200) and revision=1),1000::numeric,
  'paid compensation term remains immutable after a later draft edit');
select lives_ok($$select public.delete_unconsumed_finance_payroll_revision(
  pg_temp.fid(1),pg_temp.fid(205),pg_temp.result(200),2)$$,
  'unused change after paid payroll can be deleted');
select is((select count(*) from public.finance_schedule_terms where schedule_id=pg_temp.result(200)),1::bigint,
  'deleting the unused change keeps only the paid agreement');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(12,pg_temp.month(1))),1000::numeric,
  'unpaid future payout returns to the preceding agreement');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(12,pg_temp.month())),1000::numeric,
  'deleting a draft never changes paid payroll');
select throws_like($$select public.delete_unconsumed_finance_payroll_revision(
  pg_temp.fid(1),pg_temp.fid(206),pg_temp.result(200),1)$$,'%finance_payroll_consumed%',
  'the paid agreement cannot be deleted');
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
-- A payout is the effective boundary, including an overdue unpaid occurrence.
select pg_temp.salary(500,15,jsonb_build_object('effectiveFrom',pg_temp.month(-2),'payoutDay',23,'paymentMonthOffset',1));
select is((select due_date from public.finance_expected_items where id=pg_temp.payout(15,pg_temp.month(-2))),
  pg_temp.month(-1)+22,'initial overdue expectation uses the following-month payout date');
select pg_temp.salary(501,15,jsonb_build_object('id',pg_temp.result(500),'revision',1,
  'effectiveFrom',pg_temp.month(-2),'payoutDay',23,'paymentMonthOffset',1,
  'amount','20000','employeePayout','20000'));
select is((select count(*) from public.finance_schedule_history where schedule_id=pg_temp.result(500)),1::bigint,
  'editing an unconsumed 1 UAH salary leaves no fake revision');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(15,pg_temp.month(-2))),20000::numeric,
  'overdue unpaid payroll updates to 20,000 UAH');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(15,pg_temp.month(2))),20000::numeric,
  'future unpaid payroll follows the corrected configuration');
select pg_temp.salary(502,15,jsonb_build_object('id',pg_temp.result(500),'revision',1,
  'effectiveFrom',pg_temp.month(-1),'payoutDay',23,'paymentMonthOffset',1,
  'amount','20000','employeePayout','20000'));
select is((select effective_from from public.finance_schedule_terms where schedule_id=pg_temp.result(500)),pg_temp.month(-1),
  'September payout is backed by the previous service month, never September 1');
select is((select due_date from public.finance_expected_items where id=pg_temp.payout(15,pg_temp.month(-1))),
  pg_temp.month()+22,'effective payout boundary is the 23rd of September');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(15,pg_temp.month(-1))),20000::numeric,
  'September expected payout is 20,000 UAH');
-- Simulate two legacy setup revisions with no finalized payroll and collapse both on edit.
reset role;
select pg_temp.legacy_term(pg_temp.result(500),2,2,pg_temp.month());
select pg_temp.legacy_term(pg_temp.result(500),3,3,pg_temp.month(1));
set local role authenticated;
select pg_temp.salary(503,15,jsonb_build_object('id',pg_temp.result(500),'revision',3,
  'effectiveFrom',pg_temp.month(-1),'payoutDay',23,'paymentMonthOffset',1,
  'amount','20000','employeePayout','20000'));
select is((select count(*) from public.finance_schedule_history where schedule_id=pg_temp.result(500)),1::bigint,
  'multiple unused legacy revisions collapse to one current configuration');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(15,pg_temp.month(-1))),20000::numeric,
  'legacy collapse refreshes existing unpaid expectation');
-- The old September snapshot may still point at the first 1 UAH term.
select pg_temp.salary(600,16,jsonb_build_object('effectiveFrom',pg_temp.month(-2),
  'payoutDay',23,'paymentMonthOffset',1));
select is((select amount from public.finance_expected_items where id=pg_temp.payout(16,pg_temp.month(-1))),1::numeric,
  'legacy September expectation starts with the stale 1 UAH snapshot');
reset role;
select pg_temp.legacy_term(pg_temp.result(600),2,20000,pg_temp.month(-1));
set local role authenticated;
select pg_temp.salary(601,16,jsonb_build_object('id',pg_temp.result(600),'revision',2,
  'amount','20000','employeePayout','20000','effectiveFrom',pg_temp.month(-1),
  'payoutDay',23,'paymentMonthOffset',1));
select is((select count(*) from public.finance_schedule_history where schedule_id=pg_temp.result(600)),1::bigint,
  'obsolete unused 1 UAH agreement is removed');
select is((select amount from public.finance_expected_items where id=pg_temp.payout(16,pg_temp.month(-1))),20000::numeric,
  'stale September expected payout updates to 20,000 UAH');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select * from public.get_finance_payroll_editability(pg_temp.fid(1))$$,'%finance_admin_required%','only finance admins can inspect payroll editability');
select throws_like($$select public.delete_unconsumed_finance_payroll_revision(pg_temp.fid(1),pg_temp.fid(207),pg_temp.result(200),1)$$,'%finance_admin_required%','only finance admins can delete payroll revisions');
select throws_like($$select * from public.get_finance_payroll_historical_terms(pg_temp.fid(1))$$,'%finance_admin_required%','only finance admins can inspect payroll history');
reset role;
select * from finish();
rollback;
