begin;
select no_plan();
select is((select sum((day->>'amount')::numeric) from jsonb_array_elements(private.finance_provisional_labor_values(jsonb_build_object(
  'source',jsonb_build_object('sourceReady',true,'knownCost','1000','recognizedCost','0','remainingCost','1000','basis','net','deductionsStatus','fixed','employerStatus','fixed'),
  'pools','[]'::jsonb,'manual',false,'issues',jsonb_build_array('missing_reports'),'reportingCurrency','UAH',
  'proposedAllocations',jsonb_build_array(jsonb_build_object('projectId','7e000000-0000-4000-8000-000000000030','amount','100')),'proposedRemainder','900',
  'shares',jsonb_build_object('7e000000-0000-4000-8000-000000000030',100),'expectedMinutes',1000,'accruedFrom','2026-10-02','asOf','2026-10-04',
  'days',jsonb_build_array(
    jsonb_build_object('date','2026-10-01','submitted',true,'employed',true,'scheduled',200,'absence',0,'entries','[]'::jsonb),
    jsonb_build_object('date','2026-10-02','submitted',true,'employed',true,'scheduled',200,'absence',0,'loggedMinutes',100,
      'entries',jsonb_build_array(jsonb_build_object('projectId','7e000000-0000-4000-8000-000000000030','minutes',100))),
    jsonb_build_object('date','2026-10-03','submitted',false,'employed',true,'scheduled',200,'absence',100,'entries','[]'::jsonb),
    jsonb_build_object('date','2026-10-04','submitted',false,'employed',true,'scheduled',200,'absence',0,'entries','[]'::jsonb),
    jsonb_build_object('date','2026-10-05','submitted',true,'employed',true,'scheduled',200,'absence',0,'entries','[]'::jsonb)
  )))->'provisionalDailyRemainders') day),500::numeric,'daily studio remainder preserves elapsed salary with missing Worklog, excluding future and pre-activation days');
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$select ('7e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.month_start(delta integer default 0) returns date language sql stable as $$
 select (date_trunc('month',now() at time zone 'Europe/Kyiv')+make_interval(months=>delta))::date
$$;
insert into public.studios(id,name) values(pg_temp.pid(1),'Month completeness test');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.pid(10),'authenticated','authenticated','month-admin@test','{}','{}',now(),now()),
(pg_temp.pid(11),'authenticated','authenticated','month-employee@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active) values
(pg_temp.pid(10),'Month admin','month-admin@test','admin',true),(pg_temp.pid(11),'Month employee','month-employee@test','employee',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active) values
(pg_temp.pid(1),pg_temp.pid(10),'admin',true),(pg_temp.pid(1),pg_temp.pid(11),'employee',true);
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.pid(1),'UAH',pg_temp.month_start(-3),pg_temp.pid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values(pg_temp.pid(20),pg_temp.pid(1),'Test bank','UAH',0,pg_temp.pid(10));
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values(pg_temp.pid(30),pg_temp.pid(1),'Ongoing project',10,'active',pg_temp.month_start(-3),pg_temp.pid(10));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select public.finalize_finance_setup(pg_temp.pid(1));
select is(jsonb_array_length(public.get_finance_management_reporting(pg_temp.pid(1))->'months'),1,'current completeness is inspectable independently of recognition');
reset role;
-- Historical boundary is confined to this rollback fixture.
update public.finance_settings set recognition_start_month=pg_temp.month_start(-2) where studio_id=pg_temp.pid(1);
create function pg_temp.month_state(delta integer) returns jsonb language sql stable as $$
 select m from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.pid(1))->'months') m where m->>'month'=pg_temp.month_start(delta)::text
$$;
create function pg_temp.close_input(delta integer) returns jsonb language sql stable as $$
 select jsonb_build_object('month',pg_temp.month_start(delta),'digest',pg_temp.month_state(delta)->>'digest','revision',(pg_temp.month_state(delta)->>'revision')::integer,'approved',true)
$$;
set local role authenticated;
select is(pg_temp.month_state(-1)->>'status','provisional','absence of transactions does not confirm a month');
select is(pg_temp.month_state(-1)->'categories'->>'labor','manual','absence of payroll is not an automatically verified zero');
select throws_ok($$select public.confirm_finance_month(pg_temp.pid(1),pg_temp.pid(101),pg_temp.close_input(-1)-'approved')$$,
 'P0001','finance_input_invalid','external completeness requires one explicit approval');
select throws_ok($$select public.confirm_finance_month(pg_temp.pid(1),pg_temp.pid(102),pg_temp.close_input(0))$$,
 'P0001','finance_input_invalid','current month cannot be finalized');
select throws_ok($$select public.confirm_finance_month(pg_temp.pid(1),pg_temp.pid(103),pg_temp.close_input(-1)||jsonb_build_object('digest',repeat('0',32)))$$,
 'P0001','finance_version_conflict','stale source boundary cannot be approved');
select set_config('test.close_input',pg_temp.close_input(-1)::text,true);
select lives_ok($$select public.confirm_finance_month(pg_temp.pid(1),pg_temp.pid(104),current_setting('test.close_input')::jsonb)$$,'explicitly reviewed empty month can be confirmed once');
select lives_ok($$select public.confirm_finance_month(pg_temp.pid(1),pg_temp.pid(104),current_setting('test.close_input')::jsonb)$$,'lost-response retries are idempotent');
select is((select count(*) from public.finance_month_confirmations where studio_id=pg_temp.pid(1)),1::bigint,'repeated approval appends no duplicate snapshot');
select is(pg_temp.month_state(-1)->>'status','confirmed','confirmed month is derived automatically from matching approved evidence');
select is((select bool_and(revenue_reviewed and direct_costs_reviewed and labor_reviewed and overhead_reviewed) from public.finance_current_report_coverage where studio_id=pg_temp.pid(1)),true,'one approval preserves existing history protection without four declarations');
select throws_ok($$select public.confirm_finance_month(pg_temp.pid(1),pg_temp.pid(105),current_setting('test.close_input')::jsonb)$$,
 'P0001','finance_version_conflict','a competing new request with the old revision is rejected');
select throws_ok($$select public.confirm_finance_month(pg_temp.pid(1),pg_temp.pid(106),pg_temp.close_input(-1)||jsonb_build_object('month',pg_temp.month_start(-3)))$$,
 'P0001','finance_version_conflict','a digest from another month cannot confirm historical coverage');

select public.save_finance_project_item(pg_temp.pid(1),pg_temp.pid(110),pg_temp.pid(30),jsonb_build_object('stream','expenses','source','manual','item',jsonb_build_object('direction','outgoing','amount','120','currency','USD',
 'categoryId',(select id from public.finance_categories where studio_id=pg_temp.pid(1) and default_key='project_other_expense'),
 'description','Late foreign service','commitment','agreed','certainty','fixed','established',true,'vatRate','20','priceBasis','gross')));
select set_config('test.item',(select result_id::text from public.finance_planning_requests where studio_id=pg_temp.pid(1) and request_id=pg_temp.pid(110)),true);
select throws_ok($$select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(111),'expected',current_setting('test.item')::uuid,
 jsonb_build_object('date',pg_temp.month_start(-1),'version','1','confirmed',true))$$,'P0001','finance_expense_history_protected','late expenses cannot silently change approved history');
select public.confirm_finance_expense_receipt(pg_temp.pid(1),pg_temp.pid(112),'expected',current_setting('test.item')::uuid,
 jsonb_build_object('date',pg_temp.month_start(-1),'version','1','confirmed',true,'approveReviewed',true));
select is(pg_temp.month_state(-1)->>'status','needs_review','explicit late source evidence invalidates current month status');
select is((pg_temp.month_state(-1)->>'changed')::boolean,true,'late evidence marks its affected snapshot stale');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.month_state(-1)->'exceptions') e where e->>'reason'='missing_fx'),'missing historical FX is an actionable exception');
select throws_ok($$select public.confirm_finance_month(pg_temp.pid(1),pg_temp.pid(113),pg_temp.close_input(-1))$$,
 'P0001','finance_month_exceptions','exceptions block closing even with external approval');
select set_config('test.entry',(select id::text from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and expected_item_id=current_setting('test.item')::uuid),true);
select is((select amount from public.finance_recognition_entries where id=current_setting('test.entry')::uuid),(select net_amount from public.finance_expected_items where id=current_setting('test.item')::uuid),'receipt keeps canonical source net rules');
select is((select vat_amount from public.finance_recognition_entries where id=current_setting('test.entry')::uuid),(select vat_amount from public.finance_expected_items where id=current_setting('test.item')::uuid),'receipt preserves canonical source VAT separately');
select public.value_finance_recognition(pg_temp.pid(1),current_setting('test.entry')::uuid,jsonb_build_object('rate','40','source','manual','effectiveDate',pg_temp.month_start(-1)));
select lives_ok($$select public.confirm_finance_month(pg_temp.pid(1),pg_temp.pid(114),pg_temp.close_input(-1))$$,'resolved exception permits a new explicit review revision');
select is(pg_temp.month_state(-1)->>'status','confirmed','updated evidence has a fresh confirmed snapshot');
select is(pg_temp.month_state(-1)->'categories'->>'direct_cost','automatic','confirmed receipt source completeness is derived without a category declaration');
select is((select status::text from public.projects where id=pg_temp.pid(30)),'active','closing never requires finishing the project');
select is((select count(*) from public.finance_month_confirmations where studio_id=pg_temp.pid(1)),2::bigint,'late correction retains both approval snapshots');
select is((select jsonb_array_length(snapshot->'facts'->'entries') from public.finance_month_confirmations where studio_id=pg_temp.pid(1) and revision=1),0,'the original approved zero snapshot is unchanged');
select is((select reporting_amount from public.finance_recognition_entries where id=current_setting('test.entry')::uuid),(select net_amount*40 from public.finance_expected_items where id=current_setting('test.item')::uuid),'closing retains historical FX valuation');
select public.adjust_finance_recognition(pg_temp.pid(1),pg_temp.pid(115),current_setting('test.entry')::uuid,jsonb_build_object('operation','cancel','reason','Service cancelled'));
select is(pg_temp.month_state(-1)->>'status','needs_review','append-only cancellation invalidates affected confirmation');
select is((select count(*) from public.finance_month_confirmations where studio_id=pg_temp.pid(1)),2::bigint,'cancellation cannot rewrite approvals');
select is(pg_temp.month_state(-2)->>'status','provisional','unrelated month is unaffected by later economic facts');
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
select is((select count(*) from public.finance_month_confirmations where studio_id=pg_temp.pid(1)),0::bigint,'employee cannot read month snapshots');
select throws_ok($$select public.get_finance_management_reporting(pg_temp.pid(1))$$,'P0001','finance_admin_required','employee cannot read monthly accounting');
select throws_ok($$select public.confirm_finance_month(pg_temp.pid(1),pg_temp.pid(116),'{}')$$,'P0001','finance_admin_required','employee cannot close month');
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
select throws_ok($$update public.finance_month_confirmations set source_digest=repeat('0',32) where studio_id=pg_temp.pid(1)$$,'42501',null,'snapshots have no direct update grant');
select throws_ok($$insert into public.finance_month_confirmations(studio_id,month,revision,source_digest,snapshot,coverage_id,created_by)
 select studio_id,month,3,source_digest,snapshot,coverage_id,created_by from public.finance_month_confirmations where studio_id=pg_temp.pid(1) limit 1$$,'42501',null,'direct writes cannot bypass source guards');
reset role;
select is(private.finance_month_evidence(pg_temp.pid(1),pg_temp.month_start(-2),jsonb_build_object('earnings',jsonb_build_object('milestones',jsonb_build_array(jsonb_build_object(
  'id',pg_temp.pid(200),'condition','acceptance','recognized',false,'events',jsonb_build_array(jsonb_build_object('id',pg_temp.pid(201),'kind','delivery','date',pg_temp.month_start(-2))))))))->>'digest',
  private.finance_month_evidence(pg_temp.pid(1),pg_temp.month_start(-2),jsonb_build_object('earnings',jsonb_build_object('milestones',jsonb_build_array(jsonb_build_object(
  'id',pg_temp.pid(200),'condition','acceptance','recognized',true,'earned','100','events',jsonb_build_array(
    jsonb_build_object('id',pg_temp.pid(201),'kind','delivery','date',pg_temp.month_start(-2)),jsonb_build_object('id',pg_temp.pid(202),'kind','acceptance','date',pg_temp.month_start(-1))))))))->>'digest',
  'later acceptance does not invalidate an earlier delivery-only month');
select * from finish();
rollback;
