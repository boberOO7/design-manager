begin;
select no_plan();
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$select ('7c000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month_start(delta integer default 0) returns date language sql stable as $$
  select (date_trunc('month',pg_temp.today()::timestamp)+make_interval(months=>delta))::date
$$;
-- Setup changes use the same explicit read-only preview as the application.
create function pg_temp.previewed_capacity(input jsonb) returns jsonb language sql stable as $$
  select input||jsonb_build_object('previewDigest',public.preview_finance_labor_activation(pg_temp.pid(1),input-'previewDigest')->>'digest')
$$;

insert into public.studios(id,name) values(pg_temp.pid(1),'Labor setup review test');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.pid(10),'authenticated','authenticated','labor-source-review-admin@test','{}','{}',now(),now()),
      (pg_temp.pid(11),'authenticated','authenticated','labor-source-review-employee@test','{}','{}',now(),now()),
      (pg_temp.pid(12),'authenticated','authenticated','labor-source-review-foreign-employee@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active) values
(pg_temp.pid(10),'Provisional admin','labor-source-review-admin@test','admin',true),
(pg_temp.pid(11),'Provisional employee','labor-source-review-employee@test','employee',true),
(pg_temp.pid(12),'Foreign employee','labor-source-review-foreign-employee@test','employee',true);
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


insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by) values
(pg_temp.pid(80),pg_temp.pid(1),'payroll',pg_temp.pid(11),pg_temp.pid(10)),
(pg_temp.pid(90),pg_temp.pid(1),'recurring',null,pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.pid(81),pg_temp.pid(1),pg_temp.pid(80),1,'Salary conditions',1000,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='salary'),1,31,0,pg_temp.month_start(-2),
  'agreed','fixed','net',1000,100,200,'fixed','Payroll fixture',pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.pid(91),pg_temp.pid(1),pg_temp.pid(90),1,'Independent employer payment',200,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='employer_costs'),1,31,0,pg_temp.month_start(-2),
  'agreed','fixed','Recurring fixture',pg_temp.pid(10));
select is((private.finance_labor_source_review(pg_temp.pid(1))->>'reviewed')::boolean,false,'independent recurring obligations require explicit payroll source review');
select is(jsonb_array_length(private.finance_labor_source_review(pg_temp.pid(1))->'recurring'),1,'source review lists the existing recurring terms without guessing overlap');
select is(private.finance_labor_source_review(pg_temp.pid(1))->'unresolvedTermIds',jsonb_build_array(pg_temp.pid(91)::text),'only the unclassified recurring term is unresolved');
select set_config('test.source_digest',private.finance_labor_source_review(pg_temp.pid(1))->>'digest',true);
select set_config('test.source_input',jsonb_build_object('effectiveFrom',pg_temp.today(),'dailyMinutes',360,
  'weekdays',jsonb_build_array(1,2,3,4,5,6,7),
  'payrollSourceDigest',current_setting('test.source_digest'),'payrollCashTermIds',jsonb_build_array(pg_temp.pid(91)))::text,true);
select set_config('test.source_input',pg_temp.previewed_capacity(current_setting('test.source_input')::jsonb)::text,true);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select throws_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(100),pg_temp.previewed_capacity(current_setting('test.source_input')::jsonb-'payrollSourceDigest'-'payrollCashTermIds'))$$,
  'P0001','finance_payroll_source_review_required','activation cannot skip unresolved source choices');
select throws_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(100),pg_temp.previewed_capacity(jsonb_set(current_setting('test.source_input')::jsonb,'{payrollSourceDigest}','"stale"')))$$,
  'P0001','finance_payroll_source_review_required','activation rejects a stale source review');
select throws_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(100),pg_temp.previewed_capacity(jsonb_set(current_setting('test.source_input')::jsonb,'{payrollCashTermIds}',jsonb_build_array(pg_temp.pid(999)))))$$,
  'P0001','finance_input_invalid','source classifications cannot reference another or nonexistent studio term');
select lives_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(100),current_setting('test.source_input')::jsonb)$$,'reviewed forward activation succeeds');
select lives_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(100),current_setting('test.source_input')::jsonb)$$,'configuration retries reuse the existing request');
select is(jsonb_array_length(public.get_finance_labor_reporting(pg_temp.pid(1))->'salaryConditions'),1,'setup exposes current Finance salary conditions');
select ok(public.get_finance_management_reporting(pg_temp.pid(1))->'labor' ? 'sourceReview','the management report read boundary includes the setup diagnostics');
select is(public.get_finance_labor_reporting(pg_temp.pid(1))->'salaryConditions'->0->>'employerCost','200','setup retains applicable employer cost');
select is((public.get_finance_labor_reporting(pg_temp.pid(1))->'sourceReview'->>'reviewed')::boolean,true,'successful source review is retained in the existing immutable audit');
select is((select internal_project_id from public.finance_labor_automation where studio_id=pg_temp.pid(1)),null::uuid,'initial setup needs no internal-project exclusion');
select is((public.get_finance_labor_reporting(pg_temp.pid(1))->'sourceReview'->'unresolvedTermIds'),'[]'::jsonb,'a saved source decision resolves the current terms without a confirmation checkbox');
select public.ensure_finance_schedule_occurrences(pg_temp.pid(1),'12');
reset role;
select set_config('test.cash_item',(select i.expected_item_id::text from public.finance_obligation_items i join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
  where o.studio_id=pg_temp.pid(1) and o.schedule_id=pg_temp.pid(90) and o.period_start=pg_temp.month_start()),true);
select ok(private.finance_labor_cash_expected(pg_temp.pid(1),current_setting('test.cash_item')::uuid),'cash-only classification follows the existing recurring obligation link');
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1)),0::bigint,'setup and source review do not post or backfill labor expenses');
set local role authenticated;
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_recognition_sources(pg_temp.pid(1))) s where s->>'sourceId'=current_setting('test.cash_item')),'cash-only payroll payment is not offered as another expense source');
select throws_ok($$select public.record_finance_recognition(pg_temp.pid(1),pg_temp.pid(101),jsonb_build_object('sourceKind','expected','sourceId',current_setting('test.cash_item'),
  'classification','overhead','amount','200','date',pg_temp.today(),'periodStart',pg_temp.month_start(),'periodEnd',pg_temp.today(),'description','Duplicate expense','reason','Test'))$$,
  'P0001','finance_payroll_cash_source','ordinary recognition cannot count a payroll-covered obligation twice');
reset role;
-- Project metadata is unrelated to payroll source review.
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values(pg_temp.pid(33),pg_temp.pid(1),'New client',10,'active',pg_temp.today(),pg_temp.pid(10));
select is((private.finance_labor_source_review(pg_temp.pid(1))->>'reviewed')::boolean,true,'unrelated project changes do not reopen payroll source review');
-- A new independent obligation invalidates the review without changing previous decisions.
insert into public.finance_schedules(id,studio_id,kind,created_by) values(pg_temp.pid(92),pg_temp.pid(1),'recurring',pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.pid(93),pg_temp.pid(1),pg_temp.pid(92),1,'Separate office cost',50,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='employer_costs'),1,31,0,pg_temp.month_start(),
  'agreed','fixed','New source fixture',pg_temp.pid(10));
select is((private.finance_labor_source_review(pg_temp.pid(1))->>'reviewed')::boolean,false,'new recurring source changes require another review');
select is(private.finance_labor_source_review(pg_temp.pid(1))->'classifiedTermIds',jsonb_build_array(pg_temp.pid(91)::text),'previous source evidence remains classified');
select is(private.finance_labor_source_review(pg_temp.pid(1))->'unresolvedTermIds',jsonb_build_array(pg_temp.pid(93)::text),'only the newly relevant source needs a decision');
set local session_replication_role=replica;
update public.finance_schedule_terms set name='Renamed employer payment' where studio_id=pg_temp.pid(1) and id=pg_temp.pid(91);
update public.finance_categories set name=name||' label' where studio_id=pg_temp.pid(1) and id=(select category_id from public.finance_schedule_history where studio_id=pg_temp.pid(1) and id=pg_temp.pid(91));
set local session_replication_role=origin;
select is(private.finance_labor_source_review(pg_temp.pid(1))->'unresolvedTermIds',jsonb_build_array(pg_temp.pid(93)::text),'cosmetic term and category labels do not reopen already reviewed evidence');
select ok(private.finance_labor_cash_expected(pg_temp.pid(1),current_setting('test.cash_item')::uuid),'new sources never unlock already classified payroll cash terms');
select ok(private.finance_automatic_labor_basis(pg_temp.pid(1),(select id from public.finance_obligations where studio_id=pg_temp.pid(1) and schedule_id=pg_temp.pid(80) and period_start=pg_temp.month_start()))->'issues' ? 'payroll_source_review',
  'unreviewed competing sources are actionable labor diagnostics');
select is(private.finance_provisional_labor_values(private.finance_automatic_labor_basis(pg_temp.pid(1),(select id from public.finance_obligations where studio_id=pg_temp.pid(1) and schedule_id=pg_temp.pid(80) and period_start=pg_temp.month_start())))->>'provisionalRemainder',
  null::text,'conflicting payroll sources stay unavailable rather than appearing as confirmed zero');
set local role authenticated;
select lives_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(100),current_setting('test.source_input')::jsonb)$$,'lost-response retry remains safe after source changes');
select throws_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(102),pg_temp.previewed_capacity(current_setting('test.source_input')::jsonb))$$,
  'P0001','finance_payroll_source_review_required','stale classification cannot enable new costing');
-- Complete source review preserves full payroll cost and allows truly separate expenses.
select set_config('test.current_input',jsonb_build_object('effectiveFrom',pg_temp.today(),'dailyMinutes',360,
  'weekdays',jsonb_build_array(1,2,3,4,5,6,7),
  'payrollSourceDigest',public.get_finance_labor_reporting(pg_temp.pid(1))->'sourceReview'->>'digest',
  'payrollCashTermIds',jsonb_build_array(pg_temp.pid(91)))::text,true);
select set_config('test.current_input',pg_temp.previewed_capacity(current_setting('test.current_input')::jsonb)::text,true);
select lives_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(103),current_setting('test.current_input')::jsonb)$$,'new sources can be reviewed without changing the activation boundary');
select is((select count(*) from public.finance_labor_capacity_revisions where studio_id=pg_temp.pid(1)),1::bigint,'a source-only review does not add a duplicate capacity revision');
select public.ensure_finance_schedule_occurrences(pg_temp.pid(1),'12');
reset role;
select is((private.finance_labor_source(pg_temp.pid(1),(select id from public.finance_obligations where studio_id=pg_temp.pid(1) and schedule_id=pg_temp.pid(80) and period_start=pg_temp.month_start()))->>'knownCost')::numeric,
  1300::numeric,'net payroll includes deductions and employer expenses once');
select set_config('test.separate_item',(select i.expected_item_id::text from public.finance_obligation_items i join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
  where o.studio_id=pg_temp.pid(1) and o.schedule_id=pg_temp.pid(92) and o.period_start=pg_temp.month_start()),true);
set local role authenticated;
select lives_ok($$select public.record_finance_recognition(pg_temp.pid(1),pg_temp.pid(104),jsonb_build_object('sourceKind','expected','sourceId',current_setting('test.separate_item'),
  'classification','overhead','amount','50','date',pg_temp.today(),'periodStart',pg_temp.month_start(),'periodEnd',pg_temp.today(),'description','Separate expense','reason','Test'))$$,
  'a reviewed separate expense remains eligible for ordinary recognition');
select throws_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(105),pg_temp.previewed_capacity(jsonb_set(current_setting('test.current_input')::jsonb,'{payrollCashTermIds}',jsonb_build_array(pg_temp.pid(91),pg_temp.pid(93)))))$$,
  'P0001','finance_payroll_source_history_conflict','existing recognized expenses cannot silently become payroll cash plans');
select public.adjust_finance_recognition(pg_temp.pid(1),pg_temp.pid(106),(select result_id from public.finance_planning_requests where studio_id=pg_temp.pid(1) and request_id=pg_temp.pid(104)),jsonb_build_object('operation','cancel','reason','Explicit source correction'));
select lives_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(105),pg_temp.previewed_capacity(jsonb_set(current_setting('test.current_input')::jsonb,'{payrollCashTermIds}',jsonb_build_array(pg_temp.pid(91),pg_temp.pid(93)))))$$,
  'an explicit append-only cancellation permits correcting the source classification');
reset role;
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.pid(94),pg_temp.pid(1),pg_temp.pid(92),2,'Future revision',60,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='employer_costs'),1,31,0,pg_temp.month_start(1),
  'agreed','fixed','Next source revision',pg_temp.pid(10));
select ok((private.finance_labor_source_review(pg_temp.pid(1))->'classifiedTermIds') ? pg_temp.pid(93)::text,'a new revision preserves the prior source classification despite its derived effective-through change');
select is(private.finance_labor_source_review(pg_temp.pid(1))->'unresolvedTermIds',jsonb_build_array(pg_temp.pid(94)::text),'only the new current source revision requires a decision');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
select throws_ok($$select public.get_finance_labor_reporting(pg_temp.pid(1))$$,'P0001','finance_admin_required','employees cannot inspect payroll setup');
reset role;
select * from finish();
rollback;
