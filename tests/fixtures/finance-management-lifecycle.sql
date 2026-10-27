begin;
-- One isolated tenant; historical dates exist only in this rolled-back fixture.
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$
 select ('89000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$
 select (date_trunc('month',now() at time zone 'Europe/Kyiv')+make_interval(months=>n))::date
$$;
create function pg_temp.check(value boolean,label text) returns text language plpgsql as $$
 begin if value is distinct from true then raise exception 'FAILED: %',label;end if;return 'PASS: '||label;end
$$;
create function pg_temp.result(n integer) returns uuid language sql stable as $$
 select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)
$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'P&L lifecycle acceptance');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','pnl-'||n||'@example.test','{}','{}',now(),now() from generate_series(10,11) n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'P&L fixture '||n,'pnl-'||n||'@example.test',case when n=10 then 'admin' else 'employee' end,true from generate_series(10,11) n;
insert into public.studio_members(studio_id,user_id,system_role,is_active,joined_at)
select pg_temp.fid(1),pg_temp.fid(n),case when n=10 then 'admin' else 'employee' end,true,pg_temp.month(-2) from generate_series(10,11) n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.fid(1),'UAH',pg_temp.month(-1),pg_temp.fid(10));
insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by)
values(pg_temp.fid(1),'Fixture bank','UAH',0,pg_temp.fid(10));
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.finalize_finance_setup(pg_temp.fid(1));
update public.finance_settings set recognition_start_month=pg_temp.month(-1) where studio_id=pg_temp.fid(1);
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
values(pg_temp.fid(30),pg_temp.fid(1),'Client lifecycle',100,pg_temp.month(-1),pg_temp.fid(10),'active'),
 (pg_temp.fid(31),pg_temp.fid(1),'Internal lifecycle',0,pg_temp.month(-1),pg_temp.fid(10),'active');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
values(pg_temp.fid(30),pg_temp.fid(11),'designer',0,pg_temp.month(-2));
insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by)
values(pg_temp.fid(32),pg_temp.fid(30),'Client work','stage_1','in_progress','normal',pg_temp.fid(11),pg_temp.fid(10));
insert into public.finance_project_orders(id,studio_id,project_id,name,is_default,status,created_by,updated_by,confirmed_at)
values(pg_temp.fid(40),pg_temp.fid(1),pg_temp.fid(30),'Client order',true,'confirmed',pg_temp.fid(10),pg_temp.fid(10),now());
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(100),pg_temp.fid(30),jsonb_build_object(
 'orderId',pg_temp.fid(40),'stream','design','mode','design','revision',0,'amount','10000','currency','UAH','vatRate','20','priceBasis','net','reason','Signed services'));
select pg_temp.check(exists(select 1 from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.fid(1))->'months') m,
 jsonb_array_elements(m->'exceptions') issue where m->>'month'=pg_temp.month(-1)::text and issue->>'reason'='earning_configuration'),
 'a design contract without date bounds requires an earning plan before month approval');
select public.save_finance_earning_milestone(pg_temp.fid(1),pg_temp.fid(101),pg_temp.fid(30),pg_temp.fid(40),
 jsonb_build_object('revision',0,'title','Delivered contract package','netAmount','10000','condition','delivery'));
select public.fulfill_finance_earning_milestone(pg_temp.fid(1),pg_temp.fid(102),pg_temp.result(101),
 jsonb_build_object('intent','fulfill','revision',1,'kind','delivery','date',pg_temp.month()-1,'confirmed',true));
select pg_temp.check(exists(select 1 from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.fid(1))->'months') m
 where m->>'month'=pg_temp.month(-1)::text and m->'categories'->>'revenue'='automatic'),
 'a complete design earning plan contributes to automatic month coverage');
select pg_temp.check((select sum(amount)=10000 and sum(vat_amount)=2000 from public.finance_recognition_entries where studio_id=pg_temp.fid(1)),
 'contract delivery recognizes 10000 net revenue with separate 2000 VAT');
reset role;

insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
values(pg_temp.fid(50),pg_temp.fid(1),'payroll',pg_temp.fid(11),pg_temp.fid(10)),
 (pg_temp.fid(60),pg_temp.fid(1),'recurring',null,pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
 payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.fid(51),pg_temp.fid(1),pg_temp.fid(50),1,'Known payroll',3000,'UAH',
 (select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),1,1,1,pg_temp.month(-1),'agreed','fixed','net',3000,0,0,'fixed','Fixture salary',pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
 payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.fid(61),pg_temp.fid(1),pg_temp.fid(60),1,'Monthly studio service',600,'UAH',
 (select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='other_expense'),1,1,0,pg_temp.month(-1),'agreed','fixed','Fixture service',pg_temp.fid(10));
select private.reconcile_finance_schedule_occurrences(pg_temp.fid(1),pg_temp.fid(50),pg_temp.month(-1),pg_temp.month(),pg_temp.fid(10));
select private.reconcile_finance_schedule_occurrences(pg_temp.fid(1),pg_temp.fid(60),pg_temp.month(-1),pg_temp.month(-1),pg_temp.fid(10));
-- As in the focused expense tests, seed the historical policy solely for a closed-month lifecycle.
insert into public.finance_expense_service_policies(studio_id,schedule_id,revision,first_period,service_start,service_months,effective_from,policy,created_by)
values(pg_temp.fid(1),pg_temp.fid(60),1,pg_temp.month(-1),pg_temp.month(-1),1,pg_temp.month(-1),'service_days',pg_temp.fid(10));
select set_config('test.lifecycle_setup',jsonb_build_object(
 'effectiveFrom',pg_temp.month(-1),'historicalCapacityConfirmed',true,'dailyMinutes',480,'weekdays',jsonb_build_array(1,2,3,4,5,6,7),
 'internalProjectId',pg_temp.fid(31),'internalDesignationConfirmed',true,
 'payrollSourceDigest',private.finance_labor_source_review(pg_temp.fid(1))->>'digest',
 'payrollSourcesConfirmed',true,'payrollCashTermIds','[]'::jsonb)::text,true);
select public.configure_finance_labor_automation(pg_temp.fid(1),pg_temp.fid(110),current_setting('test.lifecycle_setup')::jsonb||jsonb_build_object(
 'previewDigest',public.preview_finance_labor_activation(pg_temp.fid(1),current_setting('test.lifecycle_setup')::jsonb)->>'digest'));
reset role;
-- Half of scheduled capacity is client work; unused capacity stays at studio level.
insert into public.work_log_entries(studio_id,user_id,work_date,activity_kind,task_id,minutes)
select pg_temp.fid(1),pg_temp.fid(11),d::date,'task',pg_temp.fid(32),240
from generate_series(pg_temp.month(-1)::timestamp,(now() at time zone 'Europe/Kyiv')::date-1,interval '1 day') d;
insert into public.work_log_days(studio_id,user_id,work_date)
select pg_temp.fid(1),pg_temp.fid(11),d::date
from generate_series(pg_temp.month(-1)::timestamp,(now() at time zone 'Europe/Kyiv')::date-1,interval '1 day') d;
do $$declare o record;begin
 for o in select id from public.finance_obligations where studio_id=pg_temp.fid(1) and kind='payroll' and period_start=pg_temp.month() loop
  perform public.process_finance_automatic_labor(pg_temp.fid(1),o.id,private.finance_automatic_labor_basis(pg_temp.fid(1),o.id)->>'digest');
 end loop;end$$;
select pg_temp.check(exists(select 1 from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.fid(1))->'automaticPeriods') p
 where p->>'status'='provisional' and jsonb_array_length(p->'provisionalDailyAllocations')>0),
 'open-month client labor is attributable and provisional without posting expense');
select pg_temp.check((select sum((d->>'amount')::numeric)=trunc(3000::numeric*((now() at time zone 'Europe/Kyiv')::date-pg_temp.month())/(pg_temp.month(1)-pg_temp.month()),2)
 from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.fid(1))->'automaticPeriods') p,
 jsonb_array_elements(coalesce(p->'provisionalDailyAllocations','[]')||coalesce(p->'provisionalDailyRemainders','[]')) d
 where p->>'status'='provisional'),
 'provisional studio P&L labor equals elapsed completed capacity, including the project and studio shares exactly once');
select pg_temp.check(not exists(select 1 from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and classification='labor'),
 'provisional labor does not enter the P&L ledger');
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(120),pg_temp.fid(30),jsonb_build_object('stream','expenses','source','manual','item',
 jsonb_build_object('direction','outgoing','amount','100','currency','UAH','categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='project_other_expense'),
 'description','Delivered client materials','commitment','agreed','certainty','fixed','established',true)));
select public.confirm_finance_expense_receipt(pg_temp.fid(1),pg_temp.fid(121),'expected',pg_temp.result(120),
 jsonb_build_object('date',pg_temp.month()-1,'version','1','confirmed',true));
select pg_temp.check(exists(select 1 from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.fid(1))->'months') m
 where m->>'month'=pg_temp.month(-1)::text and jsonb_array_length(m->'exceptions')>0),
 'month completeness exposes unprocessed labor and service accrual');
do $$declare o record;c jsonb;begin
 for o in select id from public.finance_obligations where studio_id=pg_temp.fid(1) and kind='payroll' and period_start=pg_temp.month(-1) loop
  perform public.process_finance_automatic_labor(pg_temp.fid(1),o.id,private.finance_automatic_labor_basis(pg_temp.fid(1),o.id)->>'digest');
 end loop;
 for c in select * from private.finance_expense_service_candidates(pg_temp.fid(1)) loop
  perform public.process_finance_automatic_expense(pg_temp.fid(1),(c->>'sourceId')::uuid,(c->>'month')::date,c->>'digest');
 end loop;end$$;
select pg_temp.check((select sum(case when classification='revenue' then amount else -amount end)=6300
 from public.finance_recognized_actuals where studio_id=pg_temp.fid(1) and recognized_on<pg_temp.month()),
 'closed-month P&L reconciles: 10000 revenue - 3000 labor - 600 overhead - 100 direct = 6300');
select pg_temp.check((select sum(a.amount)=1500 from public.finance_current_labor_allocations a
 join public.finance_recognition_entries e on e.id=a.entry_id where e.studio_id=pg_temp.fid(1)),
 '1500 client labor plus 1500 studio remainder equals the single 3000 payroll cost');
select pg_temp.check((select count(*)=1 from public.finance_recognition_entries where studio_id=pg_temp.fid(1) and expense_receipt_id is not null),
 'confirmed direct expense has one ledger source, excluding its payable and payment');
do $$declare m jsonb;begin
 select s into m from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.fid(1))->'months') s where s->>'month'=pg_temp.month(-1)::text;
 perform pg_temp.check(jsonb_array_length(m->'exceptions')=0,'completed sources have no month exceptions: '||(m->'exceptions')::text);
 perform public.confirm_finance_month(pg_temp.fid(1),pg_temp.fid(130),jsonb_build_object('month',pg_temp.month(-1),'digest',m->>'digest','revision',m->'revision','approved',true));
end$$;
select pg_temp.check(exists(select 1 from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.fid(1))->'months') m
 where m->>'month'=pg_temp.month(-1)::text and m->>'status'='confirmed'),
 'explicit external completeness approval confirms the closed month without closing its ongoing project');
select pg_temp.check(not exists(select 1 from private.finance_expense_service_candidates(pg_temp.fid(1))),
 'recognized recurring expense leaves no provisional delta to count again');
reset role;
rollback;
