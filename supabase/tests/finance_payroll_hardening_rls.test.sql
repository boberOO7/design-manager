begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('69000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Payroll A'),(pg_temp.fid(2),'Payroll B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','payroll-'||n||'@test','{}','{}',now(),now() from generate_series(10,15)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Payroll tester '||n,'payroll-'||n||'@test',case when n in (11,15) then 'employee' else 'admin' end,n<>13 from generate_series(10,15)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=12 then 2 else 1 end),pg_temp.fid(n),case when n in (11,15) then 'employee' else 'admin' end,n<>14 from generate_series(10,15)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'UAH','2026-01-01',pg_temp.fid(10)),(pg_temp.fid(2),'UAH','2026-01-01',pg_temp.fid(12));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values(pg_temp.fid(20),pg_temp.fid(1),'Payroll bank','UAH',10000,pg_temp.fid(10));
create function pg_temp.cat(key text,studio integer default 1) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(studio) and default_key=key$$;
create function pg_temp.result(n integer) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.schedule(n integer,patch jsonb default '{}') returns uuid language sql as $$
 select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('kind','payroll','employeeId',pg_temp.fid(11),'revision',0,'name','Employee salary','amount','1000','currency','UAH','categoryId',pg_temp.cat('salary'),'basis','gross','employeePayout','800','employeeDeductions','200','employerCostStatus','unknown','intervalMonths',1,'payoutDay',31,'paymentMonthOffset',1,'effectiveFrom','2026-01-01','commitment','agreed','certainty','fixed','reason','Agreement')||patch)$$;
create function pg_temp.generate(n integer,schedule integer default 100,first date default '2026-01-01',last date default '2026-02-01') returns uuid language sql as $$
 select public.generate_finance_obligations(pg_temp.fid(1),pg_temp.fid(n),pg_temp.result(schedule),first,last)$$;
create function pg_temp.item(component text,period date default '2026-01-01',schedule integer default 100) returns uuid language sql as $$
 select l.expected_item_id from public.finance_obligation_items l join public.finance_obligations o on o.id=l.obligation_id where o.schedule_id=pg_temp.result(schedule) and o.period_start=period and l.component=$1$$;
create function pg_temp.edit_item(n integer,item uuid,patch jsonb default '{}') returns uuid language sql as $$
 select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('id',i.id,'version',i.version,'direction',i.direction,'amount',i.amount,'currency',i.currency,'categoryId',i.category_id,'description',i.description,'dueDate',i.due_date,'expectedDate',i.expected_payment_date,'commitment',i.commitment,'certainty',i.certainty,'established',i.is_established)||patch) from public.finance_expected_items i where i.id=item$$;
create function pg_temp.month(n integer) returns date language sql stable as $$select (date_trunc('month',now() at time zone 'Europe/Kyiv')+make_interval(months=>n))::date$$;
create function pg_temp.obligation(n integer,period date) returns uuid language sql as $$select id from public.finance_obligations where studio_id=pg_temp.fid(1) and schedule_id=pg_temp.result(n) and period_start=period$$;
create function pg_temp.archive(n integer,key text,archived boolean) returns uuid language sql as $$select public.save_finance_category(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('id',id,'name',name,'direction',direction,'nature',nature,'archived',archived)) from public.finance_categories where id=pg_temp.cat(key)$$;
create function pg_temp.complete(n integer,component text,status text,amount text,revision integer default 0) returns uuid language sql as $$select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('obligationId',pg_temp.obligation(100,pg_temp.month(-1)),'component',component,'status',status,'amount',amount,'revision',revision,'reason','Documented payroll cost'))$$;
-- Execute each order explicitly, regardless of generated schedule UUIDs.
create function pg_temp.maintain(old_last boolean) returns void language plpgsql security definer as $$
declare n integer;
begin
  foreach n in array case when old_last then array[200,100] else array[100,200] end loop
    perform private.reconcile_finance_schedule_occurrences(pg_temp.fid(1),pg_temp.result(n),pg_temp.month(-1),pg_temp.month(11),pg_temp.fid(10));
  end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.finalize_finance_setup(pg_temp.fid(1));
select pg_temp.schedule(100,jsonb_build_object('basis','net','employeePayout','1000','employeeDeductions','','effectiveFrom',pg_temp.month(-1)));
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(110),pg_temp.item('payout',pg_temp.month(-1)),jsonb_build_object('kind','outgoing','date',(now() at time zone 'Europe/Kyiv')::date,'amount','1000','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('salary')),1000);
reset role;
create temp table settled_before as select to_jsonb(i) as row from public.finance_expected_items i where id=pg_temp.item('payout',pg_temp.month(-1));
create temp table ledger_before as select to_jsonb(m) as row from public.finance_movements m where studio_id=pg_temp.fid(1);
create temp table future_before as select id,period_start from public.finance_obligations where studio_id=pg_temp.fid(1) and period_start>=pg_temp.month(1);
grant select on settled_before,ledger_before,future_before to authenticated;
set local role authenticated;
select lives_ok($$select public.remove_studio_member(pg_temp.fid(11))$$,'old payroll stops when employee removed');
select lives_ok($$select public.restore_studio_member(pg_temp.fid(11))$$,'employee restored');
select pg_temp.schedule(200,jsonb_build_object('basis','net','amount','1200','employeePayout','1200','employeeDeductions','150','employerCost','50','employerCostStatus','estimated','effectiveFrom',pg_temp.month(1)));
select is((select count(*) from future_before f join public.finance_obligations o on o.id=f.id where o.schedule_id=pg_temp.result(200)),11::bigint,'replacement explicitly adopts stable future employee/month identities');
select lives_ok($$select pg_temp.maintain(false)$$,'stopped predecessor processed first');
select lives_ok($$select pg_temp.maintain(true)$$,'stopped predecessor processed last');
select is((select count(*) from public.finance_obligations o join public.finance_obligation_items l on l.obligation_id=o.id join public.finance_expected_items i on i.id=l.expected_item_id where o.schedule_id=pg_temp.result(200) and l.component='payout' and l.managed_active and i.commitment='agreed' and i.amount=1200),11::bigint,'both orders retain all replacement payouts');
select lives_ok(format('select public.ensure_finance_schedule_occurrences(%L,%L)',pg_temp.fid(1),h),'automatic maintenance horizon '||h) from unnest(array['3','6','year','12','3','6','year','12']) h;
select is((select count(*) from public.finance_obligations where studio_id=pg_temp.fid(1)),13::bigint,'repeated horizons introduce no duplicate payroll months');
select is((select to_jsonb(i) from public.finance_expected_items i where id=pg_temp.item('payout',pg_temp.month(-1))),(select row from settled_before),'settled historical payout remains byte-for-byte unchanged');
select is((select count(*) from public.finance_payroll_calendar where studio_id=pg_temp.fid(1)),13::bigint,'Calendar projection loads all original and replacement payouts after maintenance');
select throws_like($$select pg_temp.archive(300,'employer_costs',true)$$,'%finance_category_schedule_required%','active replacement remittance dependency rejects archival');
select throws_like($$select pg_temp.archive(301,'salary',true)$$,'%finance_category_schedule_required%','active salary category dependency rejects archival');
select lives_ok($$select pg_temp.archive(302,'employer_costs',false)$$,'category restoration remains allowed');
select lives_ok($$select pg_temp.archive(303,'employee_bonus',true)$$,'unrelated category can be archived');
select lives_ok($$select pg_temp.archive(304,'employee_bonus',false)$$,'unrelated category restored');
-- Historical unknown components have independent revisions, even with settled payout.
select is((select count(*) from public.finance_payroll_unknown_costs where obligation_id=pg_temp.obligation(100,pg_temp.month(-1)) and status='unknown'),2::bigint,'unknown is never inferred as zero');
select lives_ok($$select pg_temp.complete(400,'deductions','fixed','0')$$,'explicit zero completes historical unknown remittances');
select lives_ok($$select pg_temp.complete(400,'deductions','fixed','0')$$,'completion retries are idempotent');
select throws_like($$select pg_temp.complete(400,'deductions','fixed','1')$$,'%finance_request_conflict%','changed completion retry conflicts');
select is((select count(*) from public.finance_obligation_items where obligation_id=pg_temp.obligation(100,pg_temp.month(-1)) and component='deductions'),0::bigint,'zero creates no dummy expected payment');
select lives_ok($$select pg_temp.complete(401,'employer_cost','estimated','125')$$,'historical estimated cost creates separate expectation');
select lives_ok($$select pg_temp.complete(402,'employer_cost','fixed','140',1)$$,'audited correction of unsettled estimate');
select throws_like($$select pg_temp.complete(403,'employer_cost','fixed','150',1)$$,'%finance_version_conflict%','stale cost revision rejected');
select throws_like($$select pg_temp.complete(403,'employer_cost','fixed','140.001',2)$$,'%finance_input_invalid%','currency precision enforced');
select throws_like($$select pg_temp.edit_item(404,pg_temp.item('employer_cost',pg_temp.month(-1)),'{"amount":"150"}')$$,'%finance_payroll_cost_locked%','global editor cannot bypass cost completion audit');
select lives_ok($$select pg_temp.complete(405,'employer_cost','unknown','',2)$$,'explicit return to unknown cancels unsettled estimate');
select is((select commitment from public.finance_expected_items where id=pg_temp.item('employer_cost',pg_temp.month(-1))),'cancelled','unknown is excluded from numeric expectations');
select lives_ok($$select pg_temp.complete(406,'employer_cost','fixed','140',3)$$,'known correction reuses existing component');
select is((select count(*) from public.finance_obligation_items where obligation_id=pg_temp.obligation(100,pg_temp.month(-1)) and component='employer_cost'),1::bigint,'correction never duplicates component');
select lives_ok($$select public.ensure_finance_schedule_occurrences(pg_temp.fid(1),'12')$$,'maintenance preserves completed history');
select is((select amount from public.finance_expected_items where id=pg_temp.item('employer_cost',pg_temp.month(-1))),140::numeric,'historical completion survives maintenance');
select is((select count(*) from jsonb_array_elements(public.calculate_finance_forecast(pg_temp.fid(1),'12')->'issues') i where i->>'id'=pg_temp.obligation(100,pg_temp.month(-1))::text),0::bigint,'completed historical costs clear unknown forecast diagnostic');
select is((select to_jsonb(i) from public.finance_expected_items i where id=pg_temp.item('payout',pg_temp.month(-1))),(select row from settled_before),'cost completion does not rewrite settled salary');
select is((select to_jsonb(m) from public.finance_movements m where studio_id=pg_temp.fid(1)),(select row from ledger_before),'cost completion creates no cash and rewrites no movement');
select is((select count(*) from public.finance_payroll_cost_revisions where studio_id=pg_temp.fid(1)),5::bigint,'all completion and correction facts are retained');
select is((select count(*) from public.finance_payroll_cost_revisions where created_by=pg_temp.fid(10)),5::bigint,'audit actor derived from verified caller');
select is((select employee_deductions from public.finance_schedule_terms where schedule_id=pg_temp.result(100)),null::numeric,'old salary agreement remains unknown and immutable');
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(410),pg_temp.item('employer_cost',pg_temp.month(-1)),jsonb_build_object('kind','outgoing','date',(now() at time zone 'Europe/Kyiv')::date,'amount','140','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('employer_costs')),140);
select throws_like($$select pg_temp.complete(411,'employer_cost','fixed','141',4)$$,'%finance_payroll_cost_locked%','settled historical cost is protected');
select throws_like($$select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(412),jsonb_build_object('obligationId',pg_temp.obligation(200,pg_temp.month(1)),'component','deductions','revision',0,'status','fixed','amount','160','reason','Attempt'))$$,'%finance_payroll_cost_locked%','known agreement components cannot be rewritten by completion');
-- Future-only recurring dependency outside the current horizon.
select pg_temp.schedule(500,jsonb_build_object('kind','recurring','employeeId','','basis','','employeePayout','','employeeDeductions','','categoryId',pg_temp.cat('employee_bonus'),'effectiveFrom',pg_temp.month(18)));
select throws_like($$select pg_temp.archive(501,'employee_bonus',true)$$,'%finance_category_schedule_required%','future-only category dependency beyond horizon rejects archival');
select lives_ok($$select public.generate_finance_obligations(pg_temp.fid(1),pg_temp.fid(502),pg_temp.result(200),pg_temp.month(12),pg_temp.month(14))$$,'rolling into next horizon creates replacement occurrences');
select lives_ok($$select pg_temp.maintain(true)$$,'old schedule cannot cancel materialized rollover months');
select is((select count(*) from public.finance_payroll_calendar c join public.finance_obligation_items l on l.expected_item_id=c.expected_item_id join public.finance_obligations o on o.id=l.obligation_id where o.schedule_id=pg_temp.result(200) and o.period_start>=pg_temp.month(12)),3::bigint,'Calendar loads replacement rollover reminders');
select lives_ok($$select public.calculate_finance_forecast(pg_temp.fid(1),'12')$$,'Forecast loads after rollover');
-- Reproduce a legacy archived dependency and verify explicit restoration/recovery.
reset role;
alter table public.finance_categories disable trigger finance_category_schedule_dependency;
update public.finance_categories set archived_at=now() where id=pg_temp.cat('employer_costs');
alter table public.finance_categories enable trigger finance_category_schedule_dependency;
set local role authenticated;
select throws_like($$select pg_temp.schedule(510,jsonb_build_object('employeeId',pg_temp.fid(10),'effectiveFrom',pg_temp.month(18),'employerCostStatus','fixed','employerCost','10'))$$,'%finance_payroll_cost_category_required%','new future payroll fails early with actionable category recovery error');
select lives_ok($$select pg_temp.archive(511,'employer_costs',false)$$,'admin restores legacy archived dependency');
select lives_ok($$select public.generate_finance_obligations(pg_temp.fid(1),pg_temp.fid(512),pg_temp.result(200),pg_temp.month(15),pg_temp.month(15))$$,'rollover generation recovers after category restoration');
select lives_ok($$select public.ensure_finance_schedule_occurrences(pg_temp.fid(1),'12')$$,'automatic maintenance recovers after category restoration');
select ok((select count(*)>0 from public.finance_payroll_calendar),'Calendar query usable after recovery');
-- Isolate a payroll-only future dependency, with no active payroll in this studio.
reset role;
insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values(pg_temp.fid(2),'Future payroll bank','UAH',0,pg_temp.fid(12));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select public.finalize_finance_setup(pg_temp.fid(2));
select public.save_finance_schedule(pg_temp.fid(2),pg_temp.fid(520),jsonb_build_object('kind','payroll','employeeId',pg_temp.fid(12),'revision',0,'name','Future payroll','amount','1000','currency','UAH','categoryId',pg_temp.cat('salary',2),'basis','net','employeePayout','1000','employeeDeductions','0','employerCost','25','employerCostStatus','fixed','intervalMonths',1,'payoutDay',1,'effectiveFrom',pg_temp.month(18),'commitment','agreed','certainty','fixed','reason','Future agreement'));
select is((select count(*) from public.finance_obligations where studio_id=pg_temp.fid(2)),0::bigint,'future payroll dependency exists without materialized occurrences');
select throws_like($$select public.save_finance_category(pg_temp.fid(2),pg_temp.fid(521),jsonb_build_object('id',id,'name',name,'direction',direction,'nature',nature,'archived',true)) from public.finance_categories where id=pg_temp.cat('employer_costs',2)$$,'%finance_category_schedule_required%','future-only payroll employer category cannot be archived');
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
-- Completion freezes an earned future occurrence independently of later UI flags.
select pg_temp.schedule(700,jsonb_build_object('employeeId',pg_temp.fid(10),'basis','net','employeePayout','1000','employeeDeductions','','effectiveFrom',pg_temp.month(2)));
select pg_temp.edit_item(701,pg_temp.item('payout',pg_temp.month(3),700),'{"established":true}');
select lives_ok($$select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(702),jsonb_build_object('obligationId',pg_temp.obligation(700,pg_temp.month(3)),'component','deductions','status','fixed','amount','10','revision',0,'reason','Earned period remittance'))$$,'earned future payroll permits explicit unknown-cost completion');
select pg_temp.edit_item(703,pg_temp.item('payout',pg_temp.month(3),700),'{"established":false}');
select throws_like($$select pg_temp.schedule(704,jsonb_build_object('id',pg_temp.result(700),'revision',1,'employeeId',pg_temp.fid(10),'basis','net','employeePayout','1100','amount','1100','employeeDeductions','','effectiveFrom',pg_temp.month(3)))$$,'%finance_schedule_effective_date%','clearing earned flag cannot amend across audited completion history');
select lives_ok($$select public.ensure_finance_schedule_occurrences(pg_temp.fid(1),'12')$$,'maintenance preserves completed future occurrence after earned flag cleared');
select is((select amount from public.finance_expected_items where id=pg_temp.item('deductions',pg_temp.month(3),700)),10::numeric,'future completion remains stable');
select throws_like($$insert into public.finance_payroll_cost_revisions(studio_id,obligation_id,component,revision,status,amount,reason,created_by) values(pg_temp.fid(1),pg_temp.obligation(100,pg_temp.month(-1)),'deductions',99,'fixed',0,'Bypass',pg_temp.fid(10))$$,'%permission denied%','admin direct insert cannot bypass completion RPC');
select throws_like($$select pg_temp.complete(610,'deductions','fixed','1',null)$$,'%finance_version_conflict%','null revision cannot bypass optimistic concurrency');
select throws_like($$select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(611),jsonb_build_object('obligationId',pg_temp.obligation(100,pg_temp.month(-1)),'component','deductions','status','fixed','amount','0','revision',1,'reason',' '))$$,'%finance_input_invalid%','completion requires a reason at database boundary');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select is((select count(*) from public.finance_payroll_cost_revisions),0::bigint,'employee cannot read payroll cost audit');
select is((select count(*) from public.finance_payroll_unknown_costs),0::bigint,'employee cannot read payroll unknown costs');
select throws_like($$select pg_temp.complete(600,'deductions','fixed','0',1)$$,'%finance_admin_required%','employee cannot complete costs');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select throws_like($$select pg_temp.complete(601,'deductions','fixed','0',1)$$,'%finance_admin_required%','foreign admin cannot complete costs');
reset role;
set local role anon;
select throws_like($$select public.complete_finance_payroll_cost(pg_temp.fid(1),pg_temp.fid(612),'{}')$$,'%permission denied%','anonymous callers cannot execute completion');
reset role;
select throws_like($$update public.finance_payroll_cost_revisions set reason='rewrite' where studio_id=pg_temp.fid(1)$$,'%finance_history_immutable%','privileged updates cannot erase completion audit');
select * from finish();
rollback;
