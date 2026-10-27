begin;
select no_plan();
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$select ('7e100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',pg_temp.today())+make_interval(months=>n))::date$$;
insert into public.studios(id,name) values(pg_temp.pid(1),'Recurring expense source test');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.pid(10),'authenticated','authenticated','recurring-source-admin@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active) values(pg_temp.pid(10),'Recurring admin','recurring-source-admin@test','admin',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active) values(pg_temp.pid(1),pg_temp.pid(10),'admin',true);
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
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(100),pg_temp.input(100));
select is((select count(*) from public.finance_expense_service_policies where studio_id=pg_temp.pid(1)),1::bigint,'an eligible monthly schedule configures standard coverage without a confirmation checkbox');
select lives_ok($$select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(101),pg_temp.evidence(100))$$,'source evidence can be configured without activating recognition');
select is((select count(*) from private.finance_expense_service_candidates(pg_temp.pid(1))),0::bigint,'inactive recognition has no accrual candidates');
insert into public.finance_schedules(id,studio_id,kind,created_by) values(pg_temp.pid(310),pg_temp.pid(1),'recurring',pg_temp.pid(10));
insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.pid(1),pg_temp.pid(310),1,'Existing monthly service',310,'UAH',pg_temp.cat(),1,5,1,pg_temp.month(-1),'agreed','fixed','Existing source fixture',pg_temp.pid(10));
select ok(exists(select 1 from private.finance_expense_service_calculations(pg_temp.pid(1),true) c where c->'policy'->>'schedule_id'=pg_temp.pid(310)::text),
  'inactive existing monthly sources have read-only default calculations');
select public.prepare_finance_automatic_expenses(pg_temp.pid(1));
select is((select count(*) from public.finance_expense_service_policies where schedule_id=pg_temp.pid(310)),0::bigint,'inactive preparation does not materialize existing schedule policies');
select is((select count(*) from public.finance_recognition_entries where studio_id=pg_temp.pid(1)),0::bigint,'inactive preparation never posts source defaults');
update public.finance_settings set recognition_start_month=pg_temp.month() where studio_id=pg_temp.pid(1);
select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(101),pg_temp.evidence(100));
select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(101),pg_temp.evidence(100));
select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(102),pg_temp.evidence(100));
select is((select count(*) from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(100)),1::bigint,'retries and repeated confirmations reuse one policy');
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(110),pg_temp.input(110,1,1)||jsonb_build_object('expenseService',jsonb_build_object('confirmed',true)));
select is((select service_start from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(110)),pg_temp.month(),'following-month payment retains the original service month');
select is((select service_start from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(100)),pg_temp.month(),'same-month payment derives the same service month');
select ok((select min(i.due_date) from public.finance_expected_items i join public.finance_obligation_items l on l.expected_item_id=i.id join public.finance_obligations o on o.id=l.obligation_id where o.schedule_id=pg_temp.schedule(110))>=pg_temp.month(1),'following-month payment remains a separate future cash obligation');
select is((select min((c->>'to')::date) from private.finance_expense_service_candidates(pg_temp.pid(1)) c),pg_temp.today(),'recognition uses elapsed service days rather than cash due dates');
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(120),pg_temp.input(120,12)||jsonb_build_object('effectiveFrom',pg_temp.month(-1),
  'expenseService',jsonb_build_object('confirmed',true,'serviceStart',pg_temp.month(-1)+14)));
select is((select service_start from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(120)),pg_temp.month(-1)+14,
  'explicit contractual annual coverage overrides the schedule default');
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(130),pg_temp.input(130)||jsonb_build_object('expenseService',jsonb_build_object('confirmed',true,'serviceStart',pg_temp.today())));
select is((select service_start from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(130)),pg_temp.month(),'partial first month does not shift later service months');
select is((select effective_from from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(130)),pg_temp.today(),'partial first month retains the actual forward service boundary');
select is((select (c->>'amount')::numeric from private.finance_expense_service_candidates(pg_temp.pid(1)) c join public.finance_obligation_items l on l.expected_item_id=(c->>'sourceId')::uuid join public.finance_obligations o on o.id=l.obligation_id where o.schedule_id=pg_temp.schedule(130)),
  trunc(310::numeric*(pg_temp.today()-pg_temp.month()+1)/(pg_temp.month(1)-pg_temp.month()),2)-trunc(310::numeric*(pg_temp.today()-pg_temp.month())/(pg_temp.month(1)-pg_temp.month()),2),'partial-month proration retains exact native minor units');
do $$declare c jsonb;begin for c in select candidate from private.finance_expense_service_candidates(pg_temp.pid(1)) candidate where candidate->>'issue' is null loop
 perform public.process_finance_automatic_expense(pg_temp.pid(1),(c->>'sourceId')::uuid,(c->>'month')::date,c->>'digest');
 perform public.process_finance_automatic_expense(pg_temp.pid(1),(c->>'sourceId')::uuid,(c->>'month')::date,c->>'digest');
end loop;end $$;
select ok(not exists(select 1 from public.finance_recognition_entries where studio_id=pg_temp.pid(1) and recognized_on>pg_temp.today()),'no future service days are recognized');
select is((select count(*) from private.finance_expense_service_candidates(pg_temp.pid(1)) c where c->>'issue' is null),0::bigint,'repeated processing leaves no duplicate recognition');
create temp table history_before as select to_jsonb(r) snapshot from public.finance_recognition_entries r where studio_id=pg_temp.pid(1);
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(140),pg_temp.input(100)||jsonb_build_object('id',pg_temp.schedule(100),'revision',1,'amount','620','paymentMonthOffset',1,'effectiveFrom',pg_temp.month(1),'expenseService',jsonb_build_object('confirmed',true)));
select is((select count(*) from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(100)),1::bigint,'future-effective amount and payment revisions do not duplicate service policies');
select is((select service_start from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(100)),pg_temp.month(),'revision effective date never resets original service start');
select is((select count(*) from history_before h where not exists(select 1 from public.finance_recognition_entries r where to_jsonb(r)=h.snapshot)),0::bigint,'future revisions preserve immutable historical amounts and economic periods');
select is((select i.amount from public.finance_obligations o join public.finance_obligation_items l on l.obligation_id=o.id join public.finance_expected_items i on i.id=l.expected_item_id where o.schedule_id=pg_temp.schedule(100) and o.period_start=pg_temp.month(1)),620::numeric,'future service obligations use current versioned schedule amounts');
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(150),pg_temp.input(150)||jsonb_build_object('categoryId',pg_temp.cat('owner_distribution')));
select throws_ok($$select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(151),pg_temp.evidence(150))$$,'P0001','finance_input_invalid','owner withdrawals cannot become operating service expenses');
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(160),pg_temp.input(160)||jsonb_build_object('categoryId',pg_temp.cat('salary')));
select throws_ok($$select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(161),pg_temp.evidence(160))$$,'P0001','finance_input_invalid','payroll categories cannot become recurring operating expenses');
select lives_ok($$select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(190),pg_temp.input(190,12)||jsonb_build_object('expenseService',jsonb_build_object('confirmed',true)))$$,
  'P&L coverage is inferred for a stable annual service without a repeated question');
select is((select service_start from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(190)),pg_temp.month(),
  'an annual renewal starts at its original service period');
select is((select service_months from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(190)),12,
  'annual service covers twelve rolling months');
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(191),pg_temp.input(190,12,1)||jsonb_build_object('id',pg_temp.schedule(190),'revision',1,'amount','620','effectiveFrom',pg_temp.month(12)));
select is((select count(*) from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(190)),1::bigint,
  'annual amount and cash-timing revisions preserve the existing policy');
select is((select service_start from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(190)),pg_temp.month(),
  'a future revision date is never substituted for the original annual service start');
-- Changing a rolling annual service to calendar months needs an explicit non-overlapping start.
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(170),pg_temp.input(120)||jsonb_build_object('id',pg_temp.schedule(120),'revision',1,'effectiveFrom',pg_temp.month(11)));
select throws_ok($$select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(171),pg_temp.evidence(120)||jsonb_build_object('revision',2))$$,
  'P0001','finance_expense_history_protected','changed cadence cannot silently overlap previously confirmed annual coverage');
select lives_ok($$select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(171),pg_temp.evidence(120)||jsonb_build_object('revision',2,'serviceStart',pg_temp.month(11)+14))$$,
  'an explicit partial start resolves the coverage conflict without rewriting the annual policy');
select is((select count(*) from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(120)),2::bigint,'cadence clarification appends one future policy and retains the original');
select throws_ok($$select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(172),pg_temp.evidence(120))$$,
  'P0001','finance_version_conflict','source clarification rejects stale schedule revisions');
-- Trip settlement expectations cannot acquire a second expense policy.
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(180),pg_temp.input(180));
insert into public.finance_trips(id,studio_id,title,destination,starts_on,ends_on,created_by)
values(pg_temp.pid(181),pg_temp.pid(1),'Trip exclusion fixture','Kyiv',pg_temp.today(),pg_temp.today(),pg_temp.pid(10));
insert into public.finance_trip_travelers(studio_id,trip_id,employee_id,employee_name)
values(pg_temp.pid(1),pg_temp.pid(181),pg_temp.pid(10),'Recurring admin');
insert into public.finance_trip_balances(studio_id,trip_id,employee_id,currency,direction,expected_item_id)
select pg_temp.pid(1),pg_temp.pid(181),pg_temp.pid(10),'UAH','outgoing',i.expected_item_id
from public.finance_obligations o join public.finance_obligation_items i on i.obligation_id=o.id where o.schedule_id=pg_temp.schedule(180) and o.period_start=pg_temp.month();
select throws_ok($$select public.save_finance_expense_service_policy(pg_temp.pid(1),pg_temp.pid(182),pg_temp.evidence(180))$$,
  'P0001','finance_expense_source_owned','trip-covered obligations cannot acquire another service policy');
select ok(not exists(select 1 from private.finance_expense_service_candidates(pg_temp.pid(1)) c join public.finance_obligation_items i on i.expected_item_id=(c->>'sourceId')::uuid
  join public.finance_obligations o on o.id=i.obligation_id where o.schedule_id=pg_temp.schedule(180)),'trip sources never produce duplicate recurring expense candidates');
-- Creation/revision timestamps do not establish a partial contractual month.
select is((select coverage_from from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(100)),pg_temp.month(),
  'monthly default covers the original calendar service month, not its creation day');
select is((select effective_from from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(100)),pg_temp.month(),
  'creating a monthly source midmonth does not introduce artificial proration');
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(200),pg_temp.input(200)||jsonb_build_object('expenseService',jsonb_build_object('confirmed',true,'policy','manual')));
select is((select policy from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(200)),'manual','event-delivery source retains an explicit manual exception');
select ok(not exists(select 1 from private.finance_expense_service_candidates(pg_temp.pid(1)) c where c->'policy'->>'schedule_id'=pg_temp.schedule(200)::text),
  'event-delivery scheduling never proves delivery or generates service accrual');
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(201),pg_temp.input(200)||jsonb_build_object('id',pg_temp.schedule(200),'revision',1,'amount','400','effectiveFrom',pg_temp.month(1)));
select is((select count(*) from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(200)),1::bigint,'ordinary revisions preserve the explicit delivery exception');
-- Correct a salary-coded external supplier using a new future revision only.
insert into public.finance_categories(id,studio_id,name,direction,nature,project_expense_enabled)
values(pg_temp.pid(301),pg_temp.pid(1),'External accounting','outgoing','operating',false);
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(210),pg_temp.input(210)||jsonb_build_object('categoryId',pg_temp.cat('salary'),'name','External accounting provider'));
select is((select count(*) from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(210)),0::bigint,'ambiguous salary category is blocked rather than asserted to be employee payroll');
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(211),pg_temp.input(210)||jsonb_build_object('id',pg_temp.schedule(210),'revision',1,'categoryId',pg_temp.pid(301),'effectiveFrom',pg_temp.month(1)));
select is((select category_id from public.finance_schedule_terms where schedule_id=pg_temp.schedule(210) and revision=1),pg_temp.cat('salary'),'external category correction does not reclassify historical terms');
select is((select count(*) from public.finance_obligations where schedule_id=pg_temp.schedule(210) and period_start=pg_temp.month(1)),1::bigint,'category revision never duplicates the future cash obligation');
select is((select project_id from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(210)),null::uuid,'external accounting defaults to studio overhead without a project');
select is((select employee_id from public.finance_schedules where id=pg_temp.schedule(210)),null::uuid,'external service does not require an employee');
select is((select count(*) from public.finance_labor_automation where studio_id=pg_temp.pid(1)),0::bigint,'external service does not require payroll or Worklog setup');
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(212),pg_temp.input(212)||jsonb_build_object('categoryId',pg_temp.pid(301)));
select ok(exists(select 1 from jsonb_array_elements(public.get_finance_source_calculations(pg_temp.pid(1))) c where c->>'ownerId'=pg_temp.schedule(212)::text
  and c->>'classification'='overhead' and c->>'projectId' is null and c->>'amount' is not null and c->>'issue' is null),
  'external accounting is calculated as studio overhead without employee or Worklog records');
-- Derivation for existing sources is read-only; worker setup stays inactive.
select ok(exists(select 1 from private.finance_expense_service_calculations(pg_temp.pid(1),true) c where c->'policy'->>'schedule_id'=pg_temp.pid(310)::text and c->>'issue' is null),
  'existing monthly sources have derived calculations without a configuration write');
select is((select sum((c->>'amount')::numeric) from private.finance_expense_service_calculations(pg_temp.pid(1),true) c where c->'policy'->>'schedule_id'=pg_temp.pid(310)::text and (c->>'month')::date=pg_temp.month(-1)),310::numeric,
  'a closed calendar month receives the full configured monthly amount');
select is((select count(*) from public.finance_expense_service_policies where schedule_id=pg_temp.pid(310)),0::bigint,'read-only defaults do not persist service policies');
select public.prepare_finance_automatic_expenses(pg_temp.pid(1));
select is((select count(*) from public.finance_expense_service_policies where schedule_id=pg_temp.pid(310)),1::bigint,'eligible active worker materializes a real policy once before posting');
select is((select count(*) from public.finance_obligations where schedule_id=pg_temp.pid(310) and period_start<pg_temp.month()),0::bigint,'default policy preparation never backfills historical cash obligations');
select public.prepare_finance_automatic_expenses(pg_temp.pid(1));
select is((select count(*) from public.finance_expense_service_policies where schedule_id=pg_temp.pid(310)),1::bigint,'repeated preparation does not duplicate service policies');
-- Existing project evidence cannot silently become studio overhead.
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by)
values(pg_temp.pid(320),pg_temp.pid(1),'Service attribution fixture',1,'active',pg_temp.month(),pg_temp.pid(10));
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(213),pg_temp.input(213)||jsonb_build_object('categoryId',pg_temp.cat('project_services')));
insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream,source)
select pg_temp.pid(1),i.expected_item_id,pg_temp.pid(320),'expenses','manual' from public.finance_obligations o
join public.finance_obligation_items i on i.obligation_id=o.id where o.schedule_id=pg_temp.schedule(213) and o.period_start=pg_temp.month();
select ok(exists(select 1 from private.finance_expense_service_calculations(pg_temp.pid(1),true) c where c->'policy'->>'schedule_id'=pg_temp.schedule(213)::text and c->>'issue'='source_project'),
  'source project attribution conflict is surfaced instead of inferred overhead');
select ok(not exists(select 1 from private.finance_expense_service_candidates(pg_temp.pid(1)) c where c->'policy'->>'schedule_id'=pg_temp.schedule(213)::text and c->>'issue' is null),
  'project attribution conflict cannot be posted automatically');
-- A derived default must not take ownership of an already recognized manual source.
insert into public.finance_schedules(id,studio_id,kind,created_by) values(pg_temp.pid(311),pg_temp.pid(1),'recurring',pg_temp.pid(10));
insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.pid(1),pg_temp.pid(311),1,'Manual history fixture',310,'UAH',pg_temp.cat(),1,5,1,pg_temp.month(),'agreed','fixed','Manual history fixture',pg_temp.pid(10));
select private.reconcile_finance_schedule_occurrences(pg_temp.pid(1),pg_temp.pid(311),pg_temp.month(),pg_temp.month(),pg_temp.pid(10));
select private.post_finance_recognition_core(pg_temp.pid(1),jsonb_build_object('sourceKind','expected','sourceId',i.expected_item_id,'classification','overhead',
  'amount','10','date',pg_temp.today(),'periodStart',pg_temp.month(),'periodEnd',pg_temp.today(),'description','Explicit manual history','reason','Manual history fixture'),pg_temp.pid(10),null,null)
from public.finance_obligations o join public.finance_obligation_items i on i.obligation_id=o.id where o.schedule_id=pg_temp.pid(311);
select ok(exists(select 1 from private.finance_expense_service_calculations(pg_temp.pid(1),true) c where c->'policy'->>'schedule_id'=pg_temp.pid(311)::text and c->>'issue'='manual_history'),
  'derived default exposes historical manual recognition as an admin conflict');
select public.prepare_finance_automatic_expenses(pg_temp.pid(1));
select is((select count(*) from public.finance_expense_service_policies where schedule_id=pg_temp.pid(311)),0::bigint,
  'automatic preparation never takes ownership of protected manual history');
-- Existing annual sources infer rolling coverage read-only, across stable revisions.
insert into public.finance_schedules(id,studio_id,kind,created_by) values(pg_temp.pid(312),pg_temp.pid(1),'recurring',pg_temp.pid(10));
insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.pid(1),pg_temp.pid(312),1,'Existing annual subscription',365,'UAH',pg_temp.cat(),12,1,1,pg_temp.month(-13),'agreed','fixed','Annual source fixture',pg_temp.pid(10)),
(pg_temp.pid(1),pg_temp.pid(312),2,'Existing annual subscription',730,'UAH',pg_temp.cat(),12,1,0,pg_temp.month(11),'agreed','fixed','Future annual fixture',pg_temp.pid(10));
select is((private.finance_default_monthly_service(pg_temp.pid(1),pg_temp.pid(312))).service_start,pg_temp.month(-13),
  'existing annual defaults use the original period rather than a future revision or payout date');
select is((select sum((c->>'amount')::numeric) from private.finance_expense_service_calculations(pg_temp.pid(1),true) c
  where c->'policy'->>'schedule_id'=pg_temp.pid(312)::text and (c->>'month')::date=pg_temp.month(-1)),
  trunc(365::numeric*(pg_temp.month()-pg_temp.month(-1))/(pg_temp.month(11)-pg_temp.month(-1)),2),
  'annual coverage accrues the closed service month by exact elapsed service days');
select is((select count(*) from public.finance_expense_service_policies where schedule_id=pg_temp.pid(312)),0::bigint,
  'reading annual calculations never creates financial records or activates accounting');
select public.save_finance_recurring_schedule(pg_temp.pid(1),pg_temp.pid(220),pg_temp.input(220,12,1)||jsonb_build_object('expenseService',jsonb_build_object('confirmed',true,'policy','manual')));
select is((select policy from public.finance_expense_service_policies where schedule_id=pg_temp.schedule(220)),'manual',
  'an explicit annual event obligation never becomes continuous service');
select ok(not exists(select 1 from private.finance_expense_service_calculations(pg_temp.pid(1),true) c where c->'policy'->>'schedule_id'=pg_temp.schedule(220)::text),
  'annual event obligations do not accrue without delivery');
select * from finish();
rollback;
