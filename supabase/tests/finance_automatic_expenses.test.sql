begin;
select no_plan();
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$select ('7d000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month_start(delta integer default 0) returns date language sql stable as $$
  select (date_trunc('month',pg_temp.today()::timestamp)+make_interval(months=>delta))::date
$$;
-- Setup changes use the same explicit read-only preview as the application.
create function pg_temp.previewed_capacity(input jsonb) returns jsonb language sql stable as $$
  select input||jsonb_build_object('previewDigest',public.preview_finance_labor_activation(pg_temp.pid(1),input-'previewDigest')->>'digest')
$$;

insert into public.studios(id,name) values(pg_temp.pid(1),'Operating expenses test');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.pid(10),'authenticated','authenticated','operating-expense-admin@test','{}','{}',now(),now()),
      (pg_temp.pid(11),'authenticated','authenticated','operating-expense-employee@test','{}','{}',now(),now()),
      (pg_temp.pid(12),'authenticated','authenticated','operating-expense-foreign-employee@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active) values
(pg_temp.pid(10),'Provisional admin','operating-expense-admin@test','admin',true),
(pg_temp.pid(11),'Provisional employee','operating-expense-employee@test','employee',true),
(pg_temp.pid(12),'Foreign employee','operating-expense-foreign-employee@test','employee',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active,joined_at) values
(pg_temp.pid(1),pg_temp.pid(10),'admin',true,pg_temp.month_start(-3)),
(pg_temp.pid(1),pg_temp.pid(11),'employee',true,pg_temp.month_start(-3)),
(pg_temp.pid(1),pg_temp.pid(12),'employee',true,pg_temp.month_start(-3));
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.pid(1),'UAH',pg_temp.month_start(-3),pg_temp.pid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
values(pg_temp.pid(20),pg_temp.pid(1),'Test cash','UAH',0,pg_temp.pid(10));
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values
(pg_temp.pid(30),pg_temp.pid(1),'Client A',10,'active',pg_temp.month_start(-3),pg_temp.pid(10)),
(pg_temp.pid(31),pg_temp.pid(1),'Client B',10,'active',pg_temp.month_start(-3),pg_temp.pid(10)),
(pg_temp.pid(32),pg_temp.pid(1),'Internal',0,'active',pg_temp.month_start(-3),pg_temp.pid(10));
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values
(pg_temp.pid(30),pg_temp.pid(11),'designer',0,pg_temp.month_start(-3)),
(pg_temp.pid(31),pg_temp.pid(11),'designer',0,pg_temp.month_start(-3)),
(pg_temp.pid(32),pg_temp.pid(11),'designer',0,pg_temp.month_start(-3));
insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by) values
(pg_temp.pid(40),pg_temp.pid(30),'Client A work','stage_1','in_progress','normal',pg_temp.pid(11),pg_temp.pid(10)),
(pg_temp.pid(41),pg_temp.pid(31),'Client B work','stage_1','in_progress','normal',pg_temp.pid(11),pg_temp.pid(10)),
(pg_temp.pid(42),pg_temp.pid(32),'Internal work','stage_1','in_progress','normal',pg_temp.pid(11),pg_temp.pid(10));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select public.finalize_finance_setup(pg_temp.pid(1));
reset role;
update public.finance_settings set recognition_start_month=pg_temp.month_start(-3) where studio_id=pg_temp.pid(1);



-- Test-only historical boundary; production configuration stays forward-only.
update public.finance_settings set recognition_start_month=pg_temp.month_start(-24) where studio_id=pg_temp.pid(1);
create function pg_temp.cat() returns uuid language sql stable as $$select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='other_expense'$$;
create function pg_temp.item(request integer) returns uuid language sql stable as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.pid(1) and request_id=pg_temp.pid(request)$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select public.save_finance_project_item(pg_temp.pid(1),pg_temp.pid(100),pg_temp.pid(30),jsonb_build_object('stream','expenses','source','manual','item',
  jsonb_build_object('direction','outgoing','amount','120.01','currency','UAH','categoryId',(select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='project_other_expense'),
    'description','Actual product','commitment','agreed','certainty','fixed','established',true,'vatRate','20','priceBasis','gross')));
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1)),0::bigint,'invoice/payable creation alone does not recognize expense');
select throws_ok($$select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(101),'expected',pg_temp.item(100),jsonb_build_object('date',pg_temp.today(),'version','1'))$$,
  'P0001','finance_input_invalid','receipt confirmation must be explicit');
select throws_ok($$select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(101),'expected',pg_temp.item(100),jsonb_build_object('date',pg_temp.today()+1,'version','1','confirmed',true))$$,
  'P0001','finance_input_invalid','future receipt is not an incurred expense');
select throws_ok($$select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(101),'expected',pg_temp.item(100),jsonb_build_object('date',pg_temp.today(),'version','0','confirmed',true))$$,
  'P0001','finance_version_conflict','receipt is tied to the reviewed source version');
select lives_ok($$select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(101),'expected',pg_temp.item(100),jsonb_build_object('date',pg_temp.today(),'version','1','confirmed',true))$$,
  'a confirmed actual receipt posts through the existing recognition core');
select lives_ok($$select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(101),'expected',pg_temp.item(100),jsonb_build_object('date',pg_temp.today(),'version','1','confirmed',true))$$,
  'lost-response receipt retries do not duplicate costs');
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=pg_temp.item(100)),1::bigint,'one receipt owns one original expense');
select is((select project_id from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=pg_temp.item(100)),pg_temp.pid(30),'receipt preserves project attribution');
select is((select amount from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=pg_temp.item(100)),
  (select net_amount from public.finance_expected_items where id=pg_temp.item(100)),'receipt recognizes canonical net expense');
select is((select vat_amount from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=pg_temp.item(100)),
  (select vat_amount from public.finance_expected_items where id=pg_temp.item(100)),'receipt retains source VAT');
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_recognition_sources(pg_temp.pid(1))) source where source->>'sourceId'=pg_temp.item(100)::text),'receipt-owned source is excluded from another recognition path');
select throws_ok($$select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(102),'expected',pg_temp.item(100),jsonb_build_object('date',pg_temp.today()-1,'version','1','confirmed',true))$$,
  'P0001','finance_request_conflict','a duplicate receipt cannot silently change the economic date');
select public.save_finance_expected_item(pg_temp.pid(1),pg_temp.pid(110),jsonb_build_object('direction','outgoing','amount','10.01','currency','USD','categoryId',pg_temp.cat(),
  'description','Foreign actual service','commitment','agreed','certainty','fixed','established',false));
select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(111),'expected',pg_temp.item(110),jsonb_build_object('date',pg_temp.today(),'version','1','confirmed',true));
select is((select reporting_amount from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=pg_temp.item(110)),null::numeric,'missing historical FX is unavailable, not zero');
select ok(exists(select 1 from jsonb_array_elements(public.get_finance_expense_automation_reporting(pg_temp.pid(1))->'missingFx') fx where fx->>'sourceId'=pg_temp.item(110)::text),'missing expense FX is actionable');
reset role;
insert into public.finance_schedules(id,studio_id,kind,created_by) values(pg_temp.pid(200),pg_temp.pid(1),'recurring',pg_temp.pid(10)),(pg_temp.pid(210),pg_temp.pid(1),'recurring',pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.pid(201),pg_temp.pid(1),pg_temp.pid(200),1,'Annual subscription',1000.01,'UAH',pg_temp.cat(),12,1,0,pg_temp.month_start(-13),'agreed','fixed','Service period test',pg_temp.pid(10)),
(pg_temp.pid(211),pg_temp.pid(1),pg_temp.pid(210),1,'Monthly rent',100,'UAH',pg_temp.cat(),1,1,0,pg_temp.month_start(),'agreed','fixed','Current service test',pg_temp.pid(10));
select private.reconcile_finance_schedule_occurrences(pg_temp.pid(1),pg_temp.pid(200),pg_temp.month_start(-13),pg_temp.month_start(-13),pg_temp.pid(10));
select private.reconcile_finance_schedule_occurrences(pg_temp.pid(1),pg_temp.pid(210),pg_temp.month_start(),pg_temp.month_start(),pg_temp.pid(10));
select set_config('test.annual_item',(select i.expected_item_id::text from public.finance_obligation_items i join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id where o.studio_id=pg_temp.pid(1) and o.schedule_id=pg_temp.pid(200) and o.period_start=pg_temp.month_start(-13)),true);
select set_config('test.monthly_item',(select i.expected_item_id::text from public.finance_obligation_items i join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id where o.studio_id=pg_temp.pid(1) and o.schedule_id=pg_temp.pid(210) and o.period_start=pg_temp.month_start()),true);
set local role authenticated;
select throws_ok($$select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(220),'expected',current_setting('test.annual_item')::uuid,jsonb_build_object('date',pg_temp.today(),'version','1','confirmed',true))$$,
  'P0001','finance_expense_service_period_required','recurring payment never substitutes for service-period configuration');
select is(jsonb_array_length(public.get_finance_expense_automation_reporting(pg_temp.pid(1))->'candidates'),0,'unconfigured schedules do not infer incurred expenses');
select lives_ok($$select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(221),jsonb_build_object('scheduleId',pg_temp.pid(210),'firstPeriod',pg_temp.month_start(),
  'serviceStart',pg_temp.month_start(),'serviceMonths',1,'effectiveFrom',pg_temp.today(),'policy','service_days','confirmed',true))$$,'admin explicitly configures future-only service accrual once');
select throws_ok($$select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(222),jsonb_build_object('scheduleId',pg_temp.pid(200),'firstPeriod',pg_temp.month_start(-13),
  'serviceStart',pg_temp.month_start(-13)+14,'serviceMonths',12,'effectiveFrom',pg_temp.month_start(-13),'policy','service_days','confirmed',true))$$,
  'P0001','finance_input_invalid','configuration never automatically backfills a historical effective date');
reset role;
-- Historical policy is seeded solely to verify full annual conservation across partial calendar months.
insert into public.finance_expense_service_policies(studio_id,schedule_id,revision,first_period,service_start,service_months,effective_from,policy,created_by)
values(pg_temp.pid(1),pg_temp.pid(200),1,pg_temp.month_start(-13),pg_temp.month_start(-13)+14,12,pg_temp.month_start(-13)+14,'service_days',pg_temp.pid(10));
select is((select count(*) from private.finance_expense_service_candidates(pg_temp.pid(1)) c where c->>'sourceId'=current_setting('test.annual_item')),13::bigint,'annual service starting midmonth splits into thirteen calendar-month slices');
select is((select sum((c->>'amount')::numeric) from private.finance_expense_service_candidates(pg_temp.pid(1)) c where c->>'sourceId'=current_setting('test.annual_item')),1000.01::numeric,'annual service-month rounding conserves every native minor unit');
do $$declare c jsonb;begin for c in select * from private.finance_expense_service_candidates(pg_temp.pid(1)) loop
  perform public.process_finance_automatic_expense(pg_temp.pid(1),(c->>'sourceId')::uuid,(c->>'month')::date,c->>'digest');
end loop;end $$;
reset role;
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=current_setting('test.annual_item')::uuid),1000.01::numeric,'automatic annual recognition totals the canonical source cost exactly');
select is((select min(recognized_on) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=current_setting('test.monthly_item')::uuid),pg_temp.today(),'forward activation recognizes no earlier services');
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=current_setting('test.monthly_item')::uuid),
  trunc(100::numeric*extract(day from pg_temp.today())/extract(day from (pg_temp.month_start(1)-1)),2)-trunc(100::numeric*(extract(day from pg_temp.today())-1)/extract(day from (pg_temp.month_start(1)-1)),2),
  'current-month expense accrues only incurred service days, excluding future service');
select is((select count(*) from private.finance_expense_service_candidates(pg_temp.pid(1))),0::bigint,'successful processing leaves no duplicate candidates');


insert into public.finance_schedules(id,studio_id,kind,created_by) values(pg_temp.pid(240),pg_temp.pid(1),'recurring',pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.pid(241),pg_temp.pid(1),pg_temp.pid(240),1,'Quarterly project service',100.01,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='project_other_expense'),3,1,0,pg_temp.month_start(-5),'agreed','fixed','Quarterly fixture',pg_temp.pid(10));
select private.reconcile_finance_schedule_occurrences(pg_temp.pid(1),pg_temp.pid(240),pg_temp.month_start(-5),pg_temp.month_start(-5),pg_temp.pid(10));
select set_config('test.quarterly_item',(select i.expected_item_id::text from public.finance_obligation_items i join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id where o.studio_id=pg_temp.pid(1) and o.schedule_id=pg_temp.pid(240) and o.period_start=pg_temp.month_start(-5)),true);
insert into public.finance_expense_service_policies(studio_id,schedule_id,revision,first_period,service_start,service_months,effective_from,policy,project_id,created_by)
values(pg_temp.pid(1),pg_temp.pid(240),1,pg_temp.month_start(-5),pg_temp.month_start(-5)+14,3,pg_temp.month_start(-5)+14,'period_end',pg_temp.pid(30),pg_temp.pid(10));
select is((select count(*) from private.finance_expense_service_candidates(pg_temp.pid(1)) c where c->>'sourceId'=current_setting('test.quarterly_item')),1::bigint,'quarterly completion policy has one economic recognition date');
insert into public.finance_report_coverage(studio_id,project_id,month,reviewed_through,revenue_reviewed,direct_costs_reviewed,labor_reviewed,overhead_reviewed,revision,reason,created_by)
values(pg_temp.pid(1),pg_temp.pid(30),pg_temp.month_start(-2),pg_temp.month_start(-1)-1,false,true,false,false,1,'Reviewed quarterly costs',pg_temp.pid(10));
select set_config('test.quarterly_candidate',(select c::text from private.finance_expense_service_candidates(pg_temp.pid(1)) c where c->>'sourceId'=current_setting('test.quarterly_item')),true);
select is(current_setting('test.quarterly_candidate')::jsonb->>'issue','history_protected','reviewed costs remain protected from automatic source backfill');
set local role authenticated;
select throws_ok($$select public.process_finance_automatic_expense(pg_temp.pid(1),current_setting('test.quarterly_item')::uuid,
  (current_setting('test.quarterly_candidate')::jsonb->>'month')::date,current_setting('test.quarterly_candidate')::jsonb->>'digest')$$,
  'P0001','finance_expense_history_protected','automatic processing cannot overwrite a reviewed period');
select lives_ok($$select public.process_finance_automatic_expense(pg_temp.pid(1),current_setting('test.quarterly_item')::uuid,
  (current_setting('test.quarterly_candidate')::jsonb->>'month')::date,current_setting('test.quarterly_candidate')::jsonb->>'digest',null,true)$$,
  'admin approval is bound to the exact protected period and amount');
reset role;
select is((select project_id from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=current_setting('test.quarterly_item')::uuid),pg_temp.pid(30),'recurring expense preserves explicitly configured project attribution');
select is((select recognized_on from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=current_setting('test.quarterly_item')::uuid),pg_temp.month_start(-2)+13,'completion policy uses actual configured service end, not the payment date');
select public.adjust_finance_recognition(pg_temp.pid(1),pg_temp.pid(290),(select id from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=current_setting('test.quarterly_item')::uuid),jsonb_build_object('operation','cancel','reason','Explicit quarterly cost correction'));
select is((select c->>'issue' from private.finance_expense_service_candidates(pg_temp.pid(1)) c where c->>'sourceId'=current_setting('test.quarterly_item')),'source_corrected','manual correction retains source ownership and stops automatic restoration');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select set_config('test.movement',public.record_finance_movement(pg_temp.pid(1),pg_temp.pid(300),jsonb_build_object('kind','outgoing','nature','operating','date',pg_temp.today()-2,
  'accountId',pg_temp.pid(20),'amount','75','categoryId',pg_temp.cat(),'description','Payment before actual receipt'))::text,true);
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and movement_id=current_setting('test.movement')::uuid),0::bigint,'cash posting alone is not evidence of service receipt');
select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(301),'movement',current_setting('test.movement')::uuid,
  jsonb_build_object('date',pg_temp.today(),'version',current_setting('test.movement'),'confirmed',true));
select is((select recognized_on from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and movement_id=current_setting('test.movement')::uuid),pg_temp.today(),'standalone expense uses actual receipt date independently of cash date');
reset role;
insert into public.finance_schedules(id,studio_id,kind,created_by) values(pg_temp.pid(230),pg_temp.pid(1),'recurring',pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.pid(231),pg_temp.pid(1),pg_temp.pid(230),1,'Payroll-covered employer remittance',200,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='employer_costs'),1,1,0,pg_temp.month_start(),'agreed','fixed','Payroll source test',pg_temp.pid(10));
select private.reconcile_finance_schedule_occurrences(pg_temp.pid(1),pg_temp.pid(230),pg_temp.month_start(),pg_temp.month_start(),pg_temp.pid(10));
select set_config('test.payroll_item',(select i.expected_item_id::text from public.finance_obligation_items i join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id where o.studio_id=pg_temp.pid(1) and o.schedule_id=pg_temp.pid(230) and o.period_start=pg_temp.month_start()),true);
select set_config('test.payroll_review',private.finance_labor_source_review(pg_temp.pid(1))->>'digest',true);
set local role authenticated;
select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(302),pg_temp.previewed_capacity(jsonb_build_object('effectiveFrom',pg_temp.today(),'historicalCapacityConfirmed',true,'dailyMinutes',360,'weekdays',jsonb_build_array(1,2,3,4,5),
  'internalProjectId',pg_temp.pid(32),'internalDesignationConfirmed',true,'payrollSourceDigest',current_setting('test.payroll_review'),'payrollSourcesConfirmed',true,'payrollCashTermIds',jsonb_build_array(pg_temp.pid(231)))));
select is(public.get_finance_expense_source(pg_temp.pid(1),'expected',current_setting('test.payroll_item')::uuid)->'source','null'::jsonb,'payroll-covered employer obligations are excluded from actual expense receipt');
select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(303),jsonb_build_object('scheduleId',pg_temp.pid(230),'firstPeriod',pg_temp.month_start(),
  'serviceStart',pg_temp.month_start(),'serviceMonths',1,'effectiveFrom',pg_temp.today(),'policy','service_days','confirmed',true));
reset role;
select ok(not exists(select 1 from private.finance_expense_service_candidates(pg_temp.pid(1)) c where c->>'sourceId'=current_setting('test.payroll_item')),'a service policy cannot double-recognize a payroll cash source');
-- Cron executes with its service role, retaining the administrator who configured the policy.
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
select lives_ok($$select public.prepare_finance_automatic_expenses(pg_temp.pid(1))$$,'the durable worker can reconcile and discover configured sources without an impersonated admin');
select lives_ok($$select public.process_finance_automatic_expense(pg_temp.pid(1),(c->>'sourceId')::uuid,(c->>'month')::date,c->>'digest')
  from jsonb_array_elements(public.prepare_finance_automatic_expenses(pg_temp.pid(1))) c where c->>'action'='recognize' limit 1$$,
  'scheduled recognition uses the persisted policy author without an authenticated user identity');
select lives_ok($$select public.value_finance_automatic_expense(pg_temp.pid(1),(select (v->>'sourceId')::uuid from jsonb_array_elements(public.prepare_finance_automatic_expenses(pg_temp.pid(1))) v where v->>'action'='value' limit 1),
  jsonb_build_object('rate','40','source','manual','effectiveDate',pg_temp.today()))$$,'missing expense valuation is retryable through the existing historical-FX core');
reset role;
select is((select reporting_amount from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=pg_temp.item(110)),400.40::numeric,'later expense valuation fills the missing amount using the original economic date');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
set local role authenticated;
select throws_ok($$select public.value_finance_automatic_expense(pg_temp.pid(1),(select id from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=pg_temp.item(110)),
  jsonb_build_object('rate','41','source','manual','effectiveDate',pg_temp.today()))$$,'P0001','finance_valuation_locked','automatic expense valuation cannot restate a frozen historical rate');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
set local role authenticated;
select throws_ok($$select public.get_finance_expense_automation_reporting(pg_temp.pid(1))$$,'P0001','finance_admin_required','employees cannot read expense setup or financial sources');
select throws_ok($$select public.prepare_finance_automatic_expenses(pg_temp.pid(1))$$,'P0001','finance_admin_required','employees cannot run financial maintenance');
reset role;
select * from finish();
rollback;
