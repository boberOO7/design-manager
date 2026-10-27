begin;
select no_plan();
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$select ('7f300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month_start(delta integer default 0) returns date language sql stable as $$select (date_trunc('month',pg_temp.today())+make_interval(months=>delta))::date$$;
insert into public.studios(id,name) values(pg_temp.pid(1),'Provisional labor test');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.pid(10),'authenticated','authenticated','setup-cost-preview-admin@test','{}','{}',now(),now()),
      (pg_temp.pid(11),'authenticated','authenticated','setup-cost-preview-employee@test','{}','{}',now(),now()),
      (pg_temp.pid(12),'authenticated','authenticated','setup-cost-preview-foreign-employee@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active) values
(pg_temp.pid(10),'Provisional admin','setup-cost-preview-admin@test','admin',true),
(pg_temp.pid(11),'Provisional employee','setup-cost-preview-employee@test','employee',true),
(pg_temp.pid(12),'Foreign employee','setup-cost-preview-foreign-employee@test','employee',true);
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
-- Recognition remains inactive throughout this read-only calculation fixture.

-- Model imported memberships whose dated HR source predates Finance snapshots.
set local session_replication_role=replica;
delete from private.finance_labor_membership_events where studio_id=pg_temp.pid(1) and employee_id in (pg_temp.pid(11),pg_temp.pid(12));
update public.studio_members set joined_at=null where studio_id=pg_temp.pid(1) and user_id=pg_temp.pid(12);
set local session_replication_role=origin;
select ok(private.finance_labor_employed_on_day(pg_temp.pid(1),pg_temp.pid(11),pg_temp.month_start(-1)),'dated legacy membership is usable without a Finance snapshot');
select ok(not private.finance_labor_employed_on_day(pg_temp.pid(1),pg_temp.pid(11),pg_temp.month_start(-3)-1),'legacy fallback never extends before the recorded join date');
select ok(not private.finance_labor_employed_on_day(pg_temp.pid(1),pg_temp.pid(12),pg_temp.month_start(-1)),'unknown employment dates remain unavailable');
set local session_replication_role=replica;
update public.studio_members set joined_at=pg_temp.month_start(-3) where studio_id=pg_temp.pid(1) and user_id=pg_temp.pid(12);
set local session_replication_role=origin;
insert into private.finance_labor_membership_events(studio_id,employee_id,joined_on,removed_on,is_active,baseline,changed_at)
values(pg_temp.pid(1),pg_temp.pid(12),pg_temp.month_start(-3),pg_temp.month_start(-2),false,false,pg_temp.month_start(-2));
select ok(not private.finance_labor_employed_on_day(pg_temp.pid(1),pg_temp.pid(12),pg_temp.month_start(-1)),'recorded removal history wins over the current active flag');
select ok(not private.finance_labor_employed_on_day(pg_temp.pid(1),pg_temp.pid(12),pg_temp.month_start(-3)),'history gaps are not replaced with a current-membership guess');

insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by)
values(pg_temp.pid(80),pg_temp.pid(1),'payroll',pg_temp.pid(11),pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.pid(81),pg_temp.pid(1),pg_temp.pid(80),1,'Historical salary',3100,'UAH',
  (select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='salary'),1,31,0,pg_temp.month_start(-1),
  'agreed','fixed','net',3100,0,0,'fixed','Historical salary conditions',pg_temp.pid(10));
insert into public.work_log_days(studio_id,user_id,work_date) values(pg_temp.pid(1),pg_temp.pid(11),pg_temp.month_start(-1)+1);
insert into public.work_log_entries(studio_id,user_id,work_date,activity_kind,task_id,minutes)
values(pg_temp.pid(1),pg_temp.pid(11),pg_temp.month_start(-1)+1,'task',pg_temp.pid(40),480);
insert into public.studio_days_off(studio_id,date,name,created_by) values(pg_temp.pid(1),pg_temp.month_start(-1)+2,'Studio holiday',pg_temp.pid(10));
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
insert into public.time_off_requests(id,studio_id,user_id,request_type,start_date,end_date,all_day,private_note,status,reviewed_by,reviewed_at)
values(pg_temp.pid(50),pg_temp.pid(1),pg_temp.pid(11),'sick_leave',pg_temp.month_start(-1)+3,pg_temp.month_start(-1)+3,true,'Test approved leave','pending',null,null);
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
insert into public.time_off_request_approvals(request_id,admin_user_id) values(pg_temp.pid(50),pg_temp.pid(10));
update public.time_off_requests set status='approved',reviewed_by=pg_temp.pid(10),reviewed_at=now() where id=pg_temp.pid(50);
create function pg_temp.input() returns jsonb language sql stable as $$select jsonb_build_object(
  'effectiveFrom',pg_temp.month_start(-1),'capacityFrom',pg_temp.month_start(-1),
  'dailyMinutes',480,'weekdays',jsonb_build_array(1,2,3,4,5,6,7),
  'internalProjectId',pg_temp.pid(32),
  'payrollSourceDigest',private.finance_labor_source_review(pg_temp.pid(1))->>'digest',
  'payrollCashTermIds','[]'::jsonb)$$;
create function pg_temp.reviewed(input jsonb) returns jsonb language sql stable as $$select input||jsonb_build_object(
  'previewDigest',public.preview_finance_labor_activation(pg_temp.pid(1),input)->>'digest')$$;
create function pg_temp.preview(input jsonb) returns jsonb language sql stable as $$select p from jsonb_array_elements(
  public.preview_finance_labor_activation(pg_temp.pid(1),input)->'costPreview'->'periods') p where p->>'periodStart'=pg_temp.month_start(-1)::text$$;
create function pg_temp.recurring(n integer,category text default 'employer_costs') returns uuid language plpgsql as $$
declare result uuid;begin
  result:=public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(n),jsonb_build_object('kind','recurring','name','Employer remittance '||n,'amount','310','currency','UAH',
    'categoryId',(select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key=category),
    'intervalMonths',1,'payoutDay',5,'paymentMonthOffset',0,'effectiveFrom',pg_temp.month_start(),'commitment','agreed','certainty','fixed','reason','Test source','revision',0));
  return result;
end $$;
select set_config('test.before_automation',pg_temp.recurring(210)::text,true);
select ok(private.finance_recurring_payroll_review_required(pg_temp.pid(1),current_setting('test.before_automation')::uuid),'payroll review is required even before labor automation exists');
select is((public.get_finance_labor_reporting(pg_temp.pid(1))->>'studioDailyMinutes')::integer,480,'setup reuses the current operational workday without claiming history');
select is((select count(*) from public.finance_labor_capacity_revisions where studio_id=pg_temp.pid(1)),0::bigint,'loading setup creates no historical capacity');
select is((public.preview_finance_labor_activation(pg_temp.pid(1),pg_temp.input()-'capacityFrom')->>'capacityFrom')::date,pg_temp.month_start(-1),'legacy callers with an explicit schedule still date it from effectiveFrom');
select is((public.preview_finance_labor_activation(pg_temp.pid(1),pg_temp.input()-'capacityFrom'-'dailyMinutes'-'weekdays')->>'capacityFrom')::date,pg_temp.today(),'missing historical schedule data does not silently reuse current studio settings in the past');
select is(public.preview_finance_labor_activation(pg_temp.pid(1),jsonb_set(pg_temp.input(),'{weekdays}','[]'::jsonb))->'capacityProposal'->'weekdays','[]'::jsonb,'an explicit zero-working-day capacity exception remains valid');
select throws_ok($$select public.preview_finance_labor_activation(pg_temp.pid(1),jsonb_set(pg_temp.input(),'{weekdays}','[null]'::jsonb))$$,'P0001','finance_input_invalid','preview rejects a null weekday before it reaches the saved-capacity constraint');
select ok(not ((pg_temp.preview(pg_temp.input()-'internalProjectId')->'issues') ? 'internal_classification'),'tracked project time needs no legacy internal-project designation');
select is((pg_temp.preview(pg_temp.input())->>'expectedMinutes')::integer,(pg_temp.month_start()-pg_temp.month_start(-1)-1)*480,'cost preview reuses the studio holiday and proposed capacity');
select is((pg_temp.preview(pg_temp.input())->'allocations'->0->>'amount')::numeric,trunc(3100::numeric/(pg_temp.month_start()-pg_temp.month_start(-1)-1),2),'submitted project time gets the exact existing payroll/capacity allocation');
select is(jsonb_array_length(pg_temp.preview(pg_temp.input())->'missingDates'),pg_temp.month_start()-pg_temp.month_start(-1)-3,'approved leave is not reported as a missing Worklog');
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1)),0::bigint,'cost preview never posts financial entries');
select is((select count(*) from public.finance_labor_capacity_revisions where studio_id=pg_temp.pid(1)),0::bigint,'preview uses proposed capacity only in memory');
select throws_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(100),pg_temp.input())$$,'P0001','finance_preview_required','configuration requires the read-only preview');
select ok((public.preview_finance_labor_activation(pg_temp.pid(1),pg_temp.input())->>'historicalCapacityRequired')::boolean,'a visible historical capacity proposal is exposed without a duplicate confirmation checkbox');
select set_config('test.preview',public.preview_finance_labor_activation(pg_temp.pid(1),pg_temp.input())->>'digest',true);
insert into public.studio_days_off(studio_id,date,name,created_by) values(pg_temp.pid(1),pg_temp.month_start(-1)+4,'Late capacity evidence',pg_temp.pid(10));
select throws_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(100),pg_temp.input()||jsonb_build_object('previewDigest',current_setting('test.preview')))$$,'P0001','finance_preview_required','changed holiday evidence invalidates the preview');
select lives_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(100),pg_temp.reviewed(pg_temp.input()))$$,'previewed historical capacity saves without a redundant confirmation checkbox');
select is((select count(*) from public.finance_labor_capacity_revisions where studio_id=pg_temp.pid(1)),1::bigint,'only explicit setup creates a revision');
select is(public.preview_finance_labor_activation(pg_temp.pid(1),jsonb_build_object('effectiveFrom',pg_temp.today()))->'capacityProposal'->>'source','saved','omitted schedule fields reuse existing dated capacity');
select is((public.preview_finance_labor_activation(pg_temp.pid(1),jsonb_build_object('effectiveFrom',pg_temp.today()))->'capacityProposal'->>'dailyMinutes')::integer,480,'saved capacity retains its authoritative duration');
select set_config('test.saved_input',(select payload->'requestInput' from public.finance_planning_requests where studio_id=pg_temp.pid(1) and request_id=pg_temp.pid(100))::text,true);
select lives_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(100),current_setting('test.saved_input')::jsonb)$$,'lost-response retry retains the original configuration');
select is((select count(*) from public.finance_labor_capacity_revisions where studio_id=pg_temp.pid(1)),1::bigint,'configuration retry cannot duplicate capacity');
select is((select (p->'allocations'->0->>'amount')::numeric from jsonb_array_elements(public.get_finance_calculated_labor_reporting(pg_temp.pid(1))->'periods')p where p->>'periodStart'=pg_temp.month_start(-1)::text),
  (pg_temp.preview(pg_temp.input())->'allocations'->0->>'amount')::numeric,'persisted historical calculation matches the setup preview');
select is((select recognition_start_month from public.finance_settings where studio_id=pg_temp.pid(1)),null::date,'labor setup never enables financial posting');
select is((select count(*) from public.finance_obligations where studio_id=pg_temp.pid(1) and kind='payroll'),0::bigint,'historical preview and calculations do not generate payroll payables');
-- Employee-specific effective capacity wins over proposed studio defaults.
insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
values(pg_temp.pid(1),pg_temp.pid(11),pg_temp.month_start(-1),240,array[1,2,3,4,5,6,7],pg_temp.pid(10));
select is((pg_temp.preview(pg_temp.input()-'dailyMinutes'-'weekdays')->>'expectedMinutes')::integer,(pg_temp.month_start()-pg_temp.month_start(-1)-2)*240,'employee-specific historical schedule wins when no override is submitted');
select set_config('test.historical_cost',(select p->>'calculatedCost' from jsonb_array_elements(public.get_finance_calculated_labor_reporting(pg_temp.pid(1))->'periods')p where p->>'periodStart'=pg_temp.month_start(-1)::text),true);
select public.set_standard_workday_minutes(pg_temp.pid(1),360);
select is((select daily_minutes from public.finance_labor_capacity_revisions where studio_id=pg_temp.pid(1) and employee_id is null order by effective_from desc,created_at desc limit 1),360,'legacy administration changes reuse the existing dated Finance path');
select is((select p->>'calculatedCost' from jsonb_array_elements(public.get_finance_calculated_labor_reporting(pg_temp.pid(1))->'periods')p where p->>'periodStart'=pg_temp.month_start(-1)::text),current_setting('test.historical_cost'),'today’s legacy workday change leaves historical costs unchanged');
-- Relevant recurring sources require the same classification in calculations and posting.
select public.enable_finance_recognition(pg_temp.pid(1),pg_temp.pid(200));

select set_config('test.recurring',pg_temp.recurring(201)::text,true);
select public.prepare_finance_automatic_expenses(pg_temp.pid(1));
select ok(exists(select 1 from private.finance_expense_service_calculations(pg_temp.pid(1),true)c where c->>'issue'='payroll_source_review'),'calculated remittance is unknown before source review');
select ok(exists(select 1 from private.finance_expense_service_candidates(pg_temp.pid(1))c where c->>'issue'='payroll_source_review'),'posting uses the identical review gate');
select throws_ok($$select public.process_finance_automatic_expense(pg_temp.pid(1),(c->>'sourceId')::uuid,(c->>'month')::date,c->>'digest') from private.finance_expense_service_candidates(pg_temp.pid(1)) c where c->>'issue'='payroll_source_review' limit 1$$,'P0001','finance_expense_payroll_source_review','worker cannot post an unreviewed payroll-related service');
select set_config('test.rent',pg_temp.recurring(202,'rent')::text,true);
select public.prepare_finance_automatic_expenses(pg_temp.pid(1));
select ok(exists(select 1 from private.finance_expense_service_candidates(pg_temp.pid(1))c where c->'policy'->>'schedule_id'=current_setting('test.rent') and c->>'issue' is null),'unrelated recurring services do not depend on payroll review');
select set_config('test.reviewed_input',pg_temp.reviewed(pg_temp.input()||jsonb_build_object(
  'payrollSourceDigest',private.finance_labor_source_review(pg_temp.pid(1))->>'digest','payrollCashTermIds','[]'::jsonb))::text,true);
select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(203),current_setting('test.reviewed_input')::jsonb);
select public.process_finance_automatic_expense(pg_temp.pid(1),(c->>'sourceId')::uuid,(c->>'month')::date,c->>'digest') from private.finance_expense_service_candidates(pg_temp.pid(1)) c where c->'policy'->>'schedule_id'=current_setting('test.recurring');
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1)),1::bigint,'reviewed separate source posts once');
select public.prepare_finance_automatic_expenses(pg_temp.pid(1));
select is((select count(*) from private.finance_expense_service_candidates(pg_temp.pid(1))c where c->'policy'->>'schedule_id'=current_setting('test.recurring')),0::bigint,'recognized source is not offered for duplicate posting');
select ok(not exists(select 1 from private.finance_expense_service_calculations(pg_temp.pid(1),true)c where c->'policy'->>'schedule_id'=current_setting('test.recurring') and c->>'issue' is not null),'reviewed existing source retains its known calculation');
select set_config('test.recognition',(select jsonb_agg(to_jsonb(r) order by id)::text from public.finance_recognition_entries r where studio_id=pg_temp.pid(1)),true);
select pg_temp.recurring(204);
select ok(exists(select 1 from private.finance_expense_service_candidates(pg_temp.pid(1))c where c->'policy'->>'schedule_id'=current_setting('test.recurring') and c->>'issue'='payroll_source_review'),'new classification evidence blocks further conflicting recognition of an existing service');
select is((select jsonb_agg(to_jsonb(r) order by id)::text from public.finance_recognition_entries r where studio_id=pg_temp.pid(1)),current_setting('test.recognition'),'review invalidation preserves every existing posting byte for byte');
select throws_ok($$select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(205),pg_temp.reviewed(pg_temp.input()||jsonb_build_object(
  'payrollSourceDigest',private.finance_labor_source_review(pg_temp.pid(1))->>'digest',
  'payrollCashTermIds',(select jsonb_agg(id) from public.finance_schedule_terms where schedule_id=current_setting('test.recurring')::uuid))))$$,'P0001','finance_payroll_source_history_conflict','existing recognized expenses cannot silently become payroll cash');
select * from finish();
rollback;
