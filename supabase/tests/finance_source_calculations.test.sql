begin;
select no_plan();
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$select ('7e200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',pg_temp.today())+make_interval(months=>n))::date$$;
-- Setup changes use the same explicit read-only preview as the application.
create function pg_temp.previewed_capacity(input jsonb) returns jsonb language sql stable as $$
  select input||jsonb_build_object('previewDigest',public.preview_finance_labor_activation(pg_temp.pid(1),input-'previewDigest')->>'digest')
$$;

insert into public.studios(id,name) values(pg_temp.pid(1),'Recurring expense source test');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.pid(10),'authenticated','authenticated','financial-source-admin@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active) values(pg_temp.pid(10),'Recurring admin','financial-source-admin@test','admin',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active,joined_at) values(pg_temp.pid(1),pg_temp.pid(10),'admin',true,pg_temp.month(-6));
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.pid(1),'UAH',pg_temp.month(-2),pg_temp.pid(10));
insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values(pg_temp.pid(1),'Test bank','UAH',0,pg_temp.pid(10));
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select public.finalize_finance_setup(pg_temp.pid(1));
create function pg_temp.cat(key text default 'rent') returns uuid language sql stable as $$select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key=key$$;
create function pg_temp.input(n integer,months integer default 1,offset_months integer default 0) returns jsonb language sql stable as $$select jsonb_build_object(
  'kind','recurring','name','Service '||n,'amount','310','currency','UAH','categoryId',pg_temp.cat(),'intervalMonths',months,'payoutDay',5,
  'paymentMonthOffset',offset_months,'effectiveFrom',pg_temp.month(),'commitment','agreed','certainty','fixed','reason','Source workflow test','revision',0)$$;
create function pg_temp.schedule(n integer) returns uuid language sql stable as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.pid(1) and request_id=pg_temp.pid(n)$$;
create function pg_temp.evidence(n integer) returns jsonb language sql stable as $$select jsonb_build_object('mode','schedule','scheduleId',pg_temp.schedule(n),'revision',1,'confirmed',true)$$;

select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(100),pg_temp.input(100)||jsonb_build_object('effectiveFrom',pg_temp.month(-1),'paymentMonthOffset',1));
select lives_ok($$select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(101),pg_temp.evidence(100))$$,'continuous-service evidence can be configured before activation');
select is((select recognition_start_month from public.finance_settings where studio_id=pg_temp.pid(1)),null::date,'configuration never enables posting implicitly');
select is((select sum((c->>'amount')::numeric) from jsonb_array_elements(public.get_finance_source_calculations(pg_temp.pid(1))) c where c->>'date'=(pg_temp.month()-1)::text),310::numeric,'confirmed monthly service calculates its full prior service month despite following-month payment');
select is((select count(*) from private.finance_expense_service_candidates(pg_temp.pid(1))),0::bigint,'calculated services do not enter the inactive posting queue');
select public.save_finance_expected_item(pg_temp.pid(1),pg_temp.pid(110),jsonb_build_object('direction','outgoing','amount','75','currency','UAH','categoryId',pg_temp.cat(),'description','Confirmed actual service','commitment','agreed','certainty','fixed','established',false));
select lives_ok($$select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(111),'expected',pg_temp.schedule(110),jsonb_build_object('date',pg_temp.today()-1,'version','1','confirmed',true))$$,'actual receipt evidence can be saved without recognition');
select is((select (c->>'amount')::numeric from jsonb_array_elements(public.get_finance_source_calculations(pg_temp.pid(1))) c where c->>'id' like 'receipt:%'),75::numeric,'confirmed receipt contributes a read-only expense');
select public.save_finance_expected_item(pg_temp.pid(1),pg_temp.pid(112),jsonb_build_object('direction','outgoing','amount','75','currency','USD','categoryId',pg_temp.cat(),'description','Foreign confirmed actual service','commitment','agreed','certainty','fixed','established',false));
select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(113),'expected',pg_temp.schedule(112),jsonb_build_object('date',pg_temp.today()-1,'version','1','confirmed',true,'fx',jsonb_build_object('rate','39','source','manual','effectiveDate',pg_temp.today()-1)));
select is((select (c->>'reportingAmount')::numeric from jsonb_array_elements(public.get_finance_source_calculations(pg_temp.pid(1))) c where c->>'label'='Foreign confirmed actual service'),2925::numeric,'pre-activation receipt retains its explicitly confirmed historical FX');
select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(114),'expected',pg_temp.schedule(112),jsonb_build_object('date',pg_temp.today()-1,'version','1','confirmed',true,'fx',jsonb_build_object('rate','40','source','manual','effectiveDate',pg_temp.today()-1)));
select is((select (c->>'reportingAmount')::numeric from jsonb_array_elements(public.get_finance_source_calculations(pg_temp.pid(1))) c where c->>'label'='Foreign confirmed actual service'),2925::numeric,'repeated confirmation cannot silently replace source FX');
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values(pg_temp.pid(30),pg_temp.pid(1),'Source client',10,'active',pg_temp.month(-2),pg_temp.pid(10));
insert into public.finance_project_orders(id,studio_id,project_id,name,is_default,status,created_by,updated_by,confirmed_at)
values(pg_temp.pid(40),pg_temp.pid(1),pg_temp.pid(30),'Contract',true,'confirmed',pg_temp.pid(10),pg_temp.pid(10),now());
select public.save_finance_project_terms(pg_temp.pid(1),pg_temp.pid(120),pg_temp.pid(30),jsonb_build_object('orderId',pg_temp.pid(40),'stream','design','mode','design','revision',0,'amount','1000','currency','UAH','vatRate','20','priceBasis','net','reason','Contractual sources'));
select is((select count(*) from jsonb_array_elements(public.get_finance_source_calculations(pg_temp.pid(1))) c where c->>'classification'='revenue'),0::bigint,'a contract alone never establishes historical earned revenue');
select public.save_finance_earning_milestone(pg_temp.pid(1),pg_temp.pid(121),pg_temp.pid(30),pg_temp.pid(40),jsonb_build_object('title','Delivered work','netAmount','400','condition','delivery','revision',0));
select public.save_finance_earning_milestone(pg_temp.pid(1),pg_temp.pid(122),pg_temp.pid(30),pg_temp.pid(40),jsonb_build_object('title','Later acceptance','netAmount','600','condition','acceptance','revision',0));
select public.fulfill_finance_earning_milestone(pg_temp.pid(1),pg_temp.pid(123),pg_temp.schedule(121),jsonb_build_object('intent','fulfill','revision',1,'kind','delivery','date',pg_temp.today(),'confirmed',true));
select is((select (c->>'amount')::numeric from jsonb_array_elements(public.get_finance_source_calculations(pg_temp.pid(1))) c where c->>'classification'='revenue'),400::numeric,'confirmed contractual delivery supports unrecognized revenue before activation');
select public.save_finance_trip(pg_temp.pid(1),pg_temp.pid(130),jsonb_build_object('title','Actual trip','destination','Kyiv','startsOn',pg_temp.today(),'endsOn',pg_temp.today(),'status','planned','projectId',pg_temp.pid(30),'travelers',jsonb_build_array(pg_temp.pid(10))));
select public.record_finance_trip_entry(pg_temp.pid(1),pg_temp.pid(131),pg_temp.schedule(130),jsonb_build_object('kind','expense','expenseType','meals','label','Actual meal','amount','50','currency','UAH','date',pg_temp.today(),'employeeId',pg_temp.pid(10)));
select is((select (c->>'amount')::numeric from jsonb_array_elements(public.get_finance_source_calculations(pg_temp.pid(1))) c where c->>'id' like 'trip:%'),50::numeric,'confirmed trip actual is calculated without activation');
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by) values(pg_temp.pid(140),pg_temp.pid(1),'payroll',pg_temp.pid(10),pg_temp.pid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.pid(141),pg_temp.pid(1),pg_temp.pid(140),1,'Source salary',1000,'UAH',pg_temp.cat('salary'),1,5,1,pg_temp.month(-1),'agreed','fixed','gross',1000,0,0,'fixed','Source salary evidence',pg_temp.pid(10));
insert into public.finance_labor_capacity_revisions(studio_id,effective_from,daily_minutes,weekdays,created_by)
values(pg_temp.pid(1),pg_temp.month(-1),480,array[1,2,3,4,5,6,7],pg_temp.pid(10));
select is((select (c->>'calculatedCost')::numeric from jsonb_array_elements(public.get_finance_calculated_labor_reporting(pg_temp.pid(1))->'periods') c where c->>'periodStart'=pg_temp.month(-1)::text),1000::numeric,'dated historical salary cost stays known at studio level without project worklogs');
select ok((select (c->>'calculatedCost')::numeric>0 and (c->>'calculatedCost')::numeric<1000 from jsonb_array_elements(public.get_finance_calculated_labor_reporting(pg_temp.pid(1))->'periods') c where c->>'periodStart'=pg_temp.month()::text),'current salary accrues only elapsed capacity before activation');
select is((select count(*) from public.finance_obligations where schedule_id=pg_temp.pid(140)),0::bigint,'read-only salary calculation never generates missing cash obligations');
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1)),0::bigint,'all inactive source calculations leave the financial book unchanged');
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.pid(1))->'months') m where m->>'status'='confirmed'),'calculations and incomplete Worklog coverage never imply confirmation');
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(142),pg_temp.input(142)||jsonb_build_object('categoryId',pg_temp.cat('employer_costs')));
select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(143),pg_temp.evidence(142));
select ok(exists(select 1 from jsonb_array_elements(public.get_finance_source_calculations(pg_temp.pid(1))) c where c->>'ownerId'=pg_temp.schedule(142)::text and c->>'amount' is null and c->>'issue'='payroll_source_review'),'unresolved payroll remittance classification is unknown rather than a second payroll cost');
select ok(exists(select 1 from jsonb_array_elements(public.get_finance_expense_automation_reporting(pg_temp.pid(1))->'configurationIssues') i where i->>'scheduleId'=pg_temp.schedule(142)::text and i->>'issue'='payroll_source_review'),'source workflow surfaces the exact missing payroll classification before activation');
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values(pg_temp.pid(31),pg_temp.pid(1),'Internal operations',0,'active',pg_temp.month(-2),pg_temp.pid(10));
select is(public.preview_finance_labor_activation(pg_temp.pid(1),jsonb_build_object('effectiveFrom',pg_temp.today(),'dailyMinutes',480,'weekdays',jsonb_build_array(1,2,3,4,5))) ->>'recognitionStart',null::text,'capacity preview never invents an activation date before enablement');
select public.configure_finance_labor_automation(pg_temp.pid(1),pg_temp.pid(144),pg_temp.previewed_capacity(jsonb_build_object('effectiveFrom',pg_temp.today(),'historicalCapacityConfirmed',true,'dailyMinutes',480,'weekdays',jsonb_build_array(1,2,3,4,5,6,7),'internalProjectId',pg_temp.pid(31),'internalDesignationConfirmed',true,'payrollSourceDigest',private.finance_labor_source_review(pg_temp.pid(1))->>'digest','payrollSourcesConfirmed',true,'payrollCashTermIds',(select jsonb_agg(id) from public.finance_schedule_terms where schedule_id=pg_temp.schedule(142)))));
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_source_calculations(pg_temp.pid(1))) c where c->>'ownerId'=pg_temp.schedule(142)::text),'payroll-covered cash obligations are excluded from read-only operating costs too');
-- Independent completeness: an explicit closed-month review is not ledger enablement.
insert into public.finance_report_coverage(studio_id,month,reviewed_through,revenue_reviewed,direct_costs_reviewed,labor_reviewed,overhead_reviewed,revision,reason,created_by)
values(pg_temp.pid(1),pg_temp.month(-2),pg_temp.month(-1)-1,false,false,false,false,1,'Unreviewed source fixture',pg_temp.pid(10));
create function pg_temp.close_input(delta integer) returns jsonb language sql stable as $$
 select jsonb_build_object('month',pg_temp.month(delta),'digest',m->>'digest','revision',m->'revision','approved',true)
 from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.pid(1))->'months') m where m->>'month'=pg_temp.month(delta)::text
$$;
select lives_ok($$select public.confirm_finance_month(pg_temp.pid(1),pg_temp.pid(145),pg_temp.close_input(-2))$$,'an explicitly reviewed closed month can be confirmed independently of posting');
select is((select m->>'status' from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.pid(1))->'months') m where m->>'month'=pg_temp.month(-2)::text),'confirmed','only matching source evidence and explicit completeness approval produce confirmed results');
select throws_ok($$select public.confirm_finance_month(pg_temp.pid(1),pg_temp.pid(146),pg_temp.close_input(-1))$$,'P0001','finance_month_exceptions','known salary with incomplete historical work coverage cannot be finalized');
select lives_ok($$select public.enable_finance_recognition(pg_temp.pid(1),pg_temp.pid(150))$$,'posting enables without a user-supplied accounting date');
select lives_ok($$select public.enable_finance_recognition(pg_temp.pid(1),pg_temp.pid(150))$$,'enablement retries preserve the exact boundary');
select ok((select recognition_enabled_at is not null and (recognition_enabled_at at time zone 'Europe/Kyiv')::date=pg_temp.today() from public.finance_settings where studio_id=pg_temp.pid(1)),'mid-month enablement records its actual technical timestamp');
select is((select count(*) from private.finance_pending_source_candidates(pg_temp.pid(1))),0::bigint,'old same-day earning and trip events are not posted merely by enablement');
select ok((select private.finance_posting_eligible(studio_id,pg_temp.today(),recognition_enabled_at+interval '1 microsecond') and not private.finance_posting_eligible(studio_id,pg_temp.today(),recognition_enabled_at-interval '1 microsecond') and not private.finance_posting_eligible(studio_id,pg_temp.today()-1,recognition_enabled_at+interval '1 microsecond') from public.finance_settings where studio_id=pg_temp.pid(1)),'economic dates and source creation timestamps are checked independently');
select ok(not exists(select 1 from private.finance_expense_service_candidates(pg_temp.pid(1)) c where (c->>'from')::date<pg_temp.today()),'continuous-service posting starts at the mid-month boundary without retroactive accrual');
select public.fulfill_finance_earning_milestone(pg_temp.pid(1),pg_temp.pid(151),pg_temp.schedule(122),jsonb_build_object('intent','fulfill','revision',1,'kind','acceptance','date',pg_temp.today(),'confirmed',true));
select is((select sum(amount) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and classification='revenue'),600::numeric,'new eligible acceptance posts through the existing VAT/source recognition core');
select is((select sum(vat_amount) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and classification='revenue'),120::numeric,'new posting preserves canonical VAT');
select is((select sum((c->>'amount')::numeric) from jsonb_array_elements(public.get_finance_source_calculations(pg_temp.pid(1))) c where c->>'classification'='revenue'),400::numeric,'recognized events are removed from calculated revenue while historical evidence remains');
select public.fulfill_finance_earning_milestone(pg_temp.pid(1),pg_temp.pid(151),pg_temp.schedule(122),jsonb_build_object('intent','fulfill','revision',1,'kind','acceptance','date',pg_temp.today(),'confirmed',true));
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and classification='revenue'),1::bigint,'retry cannot double-recognize a calculated source');
select throws_ok($$update public.finance_settings set recognition_enabled_at=recognition_enabled_at-interval '1 day' where studio_id=pg_temp.pid(1)$$,'P0001','finance_activation_locked','technical enablement boundary cannot be moved to backfill history');
create temp table recognition_before_reenable as select to_jsonb(r) snapshot from public.finance_recognition_entries r where studio_id=pg_temp.pid(1);
create temp table enablement_before_retry as select recognition_enabled_at from public.finance_settings where studio_id=pg_temp.pid(1);
select public.enable_finance_recognition(pg_temp.pid(1),pg_temp.pid(152));
select is((select recognition_enabled_at from public.finance_settings where studio_id=pg_temp.pid(1)),(select recognition_enabled_at from enablement_before_retry),'a later enablement request preserves the original technical boundary');
select is((select count(*) from recognition_before_reenable h where not exists(select 1 from public.finance_recognition_entries r where to_jsonb(r)=h.snapshot)),0::bigint,'enablement preserves existing recognized economic dates, VAT, FX and amounts');
select * from finish();
rollback;
