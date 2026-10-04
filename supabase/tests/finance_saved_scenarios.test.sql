begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('68000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month() returns date language sql stable as $$select date_trunc('month',pg_temp.today())::date$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Scenario A'),(pg_temp.fid(2),'Scenario B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','scenario-'||n||'@test','{}','{}',now(),now() from generate_series(10,12)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Scenario tester','scenario-'||n||'@test',case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=12 then 2 else 1 end),pg_temp.fid(n),case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values
(pg_temp.fid(1),'UAH',(pg_temp.month()-interval '1 month')::date,pg_temp.fid(10)),(pg_temp.fid(2),'UAH',pg_temp.month(),pg_temp.fid(12));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',1000,pg_temp.fid(10)),(pg_temp.fid(21),pg_temp.fid(2),'Bank B','UAH',200,pg_temp.fid(12));
insert into public.finance_forecast_snapshots(id,studio_id,name,forecast,created_by) values
(pg_temp.fid(90),pg_temp.fid(1),'Legacy snapshot','{}',pg_temp.fid(10));
create function pg_temp.cat(key text) returns uuid language sql stable as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key=key$$;
create function pg_temp.result(n integer) returns uuid language sql stable as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.scenario_id(scenario_name text) returns uuid language sql stable as $$select scenario_id from public.finance_current_scenarios where studio_id=pg_temp.fid(1) and name=scenario_name order by revision desc limit 1$$;
create function pg_temp.expected(n integer,patch jsonb default '{}') returns uuid language sql as $$
  select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('direction','incoming','amount','1000','currency','UAH','categoryId',pg_temp.cat('project_payments'),
    'description','Scenario receipt','dueDate',pg_temp.today()+20,'expectedDate',pg_temp.today()+20,'commitment','agreed','certainty','fixed')||patch)$$;
create function pg_temp.snapshot(n integer,name text default 'Base',fx jsonb default '[]') returns uuid language sql as $$
  select public.save_finance_forecast_snapshot(pg_temp.fid(1),pg_temp.fid(n),name,'6','confirmed',fx)$$;
create function pg_temp.save_scenario(req integer,scenario uuid,base uuid,revision integer,assumptions jsonb,name text default 'Scenario',extra jsonb default '{}') returns uuid language sql as $$
  select public.save_finance_forecast_scenario(pg_temp.fid(1),pg_temp.fid(req),scenario,
    jsonb_build_object('baseId',base,'revision',revision,'name',name,'reason','Test assumption','assumptions',assumptions)||extra)$$;
create function pg_temp.workspace(base uuid default null,horizon text default '6') returns jsonb language sql stable as $$select public.get_finance_scenario_workspace(pg_temp.fid(1),base,horizon)$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.finalize_finance_setup(pg_temp.fid(1));
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select lives_ok($$select public.finalize_finance_setup(pg_temp.fid(2))$$,'second studio setup can be finalized by its own owner');
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select pg_temp.expected(100,'{"amount":"1000"}');
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(101),pg_temp.result(100),
  jsonb_build_object('kind','incoming','date',pg_temp.today(),'amount','400','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('project_payments')),400);
select pg_temp.expected(102,jsonb_build_object('direction','outgoing','amount','2000','categoryId',pg_temp.cat('rent'),'description','Near-term expense','dueDate',pg_temp.today()+2,'expectedDate',pg_temp.today()+2));
select pg_temp.expected(103,jsonb_build_object('amount','200','currency','USD','description','Foreign receipt','dueDate',pg_temp.today()+10,'expectedDate',pg_temp.today()+10));
select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(104),jsonb_build_object('kind','recurring','revision',0,'name','Monthly rent','amount','100','currency','UAH','categoryId',pg_temp.cat('rent'),
  'intervalMonths',1,'payoutDay',31,'paymentMonthOffset',0,'effectiveFrom',pg_temp.month(),'commitment','agreed','certainty','fixed','reason','Lease'));
select public.generate_finance_obligations(pg_temp.fid(1),pg_temp.fid(105),pg_temp.result(104),pg_temp.month(),pg_temp.month());
select is((public.calculate_finance_forecast(pg_temp.fid(1),'6','confirmed',jsonb_build_array(jsonb_build_object('currency','USD','rate','40','source','manual','effectiveDate',pg_temp.today())))->'months'->0->>'closing')::numeric,7900::numeric,
  'late receipt leaves a positive month close after an earlier daily deficit');
select is((public.calculate_finance_forecast(pg_temp.fid(1),'6','confirmed',jsonb_build_array(jsonb_build_object('currency','USD','rate','40','source','manual','effectiveDate',pg_temp.today())))->>'firstDeficit'),(pg_temp.today()+2)::text,
  'legacy forecast still exposes the in-month low point date');
select pg_temp.snapshot(110,'Captured base',jsonb_build_array(jsonb_build_object('currency','USD','rate','40','source','manual','effectiveDate',pg_temp.today())));
select lives_ok($$select public.save_finance_forecast_snapshot(pg_temp.fid(1),pg_temp.fid(110),'Captured base','6','confirmed',jsonb_build_array(jsonb_build_object('currency','USD','rate','40','source','manual','effectiveDate',pg_temp.today())))$$,
  'snapshot save retry is idempotent');
create temporary table expectation_count_before_projection as select count(*) as n from public.finance_expected_items where studio_id=pg_temp.fid(1);
select is((select count(*) from public.finance_forecast_snapshots where studio_id=pg_temp.fid(1)),2::bigint,'snapshot retry adds no duplicate');
select is((select native_inputs->>'version' from public.finance_forecast_snapshots where id=pg_temp.result(110)),'2','new snapshot freezes native version two inputs');
select is((select (value->>'remaining_amount')::numeric from public.finance_forecast_snapshots s,jsonb_array_elements(s.native_inputs->'expected') where s.id=pg_temp.result(110) and value->>'id'=pg_temp.result(100)::text),600::numeric,
  'snapshot captures only remaining amount after partial settlement');
select is((select value->>'rate' from public.finance_forecast_snapshots s,jsonb_array_elements(s.native_inputs->'fx') where s.id=pg_temp.result(110) and value->>'currency'='USD'),'40',
  'snapshot freezes explicit FX assumptions');
select is((select (value->>'amount')::numeric from public.finance_forecast_snapshots s,jsonb_array_elements(s.native_inputs->'accounts') where s.id=pg_temp.result(110) and value->>'id'=pg_temp.fid(20)::text),1400::numeric,
  'snapshot freezes balances including actual receipt settlement');
reset role;
insert into public.finance_schedules(id,studio_id,kind,created_by) values(pg_temp.fid(160),pg_temp.fid(1),'recurring',pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,reason,created_by)
values(pg_temp.fid(161),pg_temp.fid(1),pg_temp.fid(160),1,'Unmaterialized utilities',80,'UAH',pg_temp.cat('utilities'),1,15,0,(pg_temp.month()-interval '1 month')::date,'agreed','fixed','Lease',pg_temp.fid(10));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
create temporary table capture_preview_obligations_before as select count(*) as n from public.finance_obligations where studio_id=pg_temp.fid(1);
select ok(exists(select 1 from jsonb_array_elements(public.get_finance_forecast_capture_preview(pg_temp.fid(1))->'issues') i
  where i->>'reason'='ungenerated_period' and i->>'id'=pg_temp.fid(160)::text),'capture preview reports a missing recurring period');
select is((select count(*) from public.finance_obligations where studio_id=pg_temp.fid(1)),(select n from capture_preview_obligations_before),
  'capture preview does not materialize its missing recurring period');
select pg_temp.save_scenario(120,null,pg_temp.result(110),0,'[]','Named baseline');
select is(pg_temp.save_scenario(120,null,pg_temp.result(110),0,'[]','Named baseline'),pg_temp.result(120),'saved scenario request retry returns its original revision');
select pg_temp.save_scenario(121,null,pg_temp.result(110),0,'[]','Named baseline comparison');
select is((select count(*) from public.finance_current_scenarios where studio_id=pg_temp.fid(1)),2::bigint,'same-base named comparisons are independent scenarios');
select is((select (scenario->'report'->'months'->0->>'closing')::numeric from jsonb_array_elements(pg_temp.workspace(pg_temp.result(110))->'scenarios') scenario where scenario->>'name'='Named baseline'),
  (select (s.forecast->'months'->0->>'closing')::numeric from public.finance_forecast_snapshots s where s.id=pg_temp.result(110)),
  'saved scenario reuses frozen baseline projection');
select is((select (i.value->>'amount')::numeric from jsonb_array_elements(pg_temp.workspace(pg_temp.result(110))->'scenarios') s(value),jsonb_array_elements(s.value->'report'->'items') i(value) where s.value->>'name'='Named baseline' and i.value->>'id'=pg_temp.result(100)::text),600::numeric,
  'scenario evaluation preserves partially settled remaining balance');
select is((select count(*) from jsonb_array_elements(pg_temp.workspace(pg_temp.result(110))->'scenarios') s(value),jsonb_array_elements(s.value->'report'->'items') i(value) where s.value->>'name'='Named baseline' and i.value->>'obligationKind'='recurring'),6::bigint,
  'each recurring obligation appears once in the base scenario projection');
select is((select (i.value->>'reportingAmount')::numeric from jsonb_array_elements(pg_temp.workspace(pg_temp.result(110))->'scenarios') s(value),jsonb_array_elements(s.value->'report'->'items') i(value) where s.value->>'name'='Named baseline' and i.value->>'id'=pg_temp.result(103)::text),8000::numeric,
  'scenario uses the captured foreign-currency rate');
create temporary table obligation_count_before_projection as select count(*) as n from public.finance_obligations where studio_id=pg_temp.fid(1);
select is((select count(*) from public.finance_expected_items where studio_id=pg_temp.fid(1)),(select n from expectation_count_before_projection),
  'snapshot and scenario projection do not create or alter expected source rows');
select lives_ok($$select public.get_finance_scenario_workspace(pg_temp.fid(1),pg_temp.result(110),'12')$$,'workspace supports the saved full-year projection horizon');
select ok(pg_temp.workspace(pg_temp.fid(90))->'baseline' is null or pg_temp.workspace(pg_temp.fid(90))->'baseline'='null'::jsonb,'legacy snapshot without native inputs is not reconstructed');

-- Assumptions are pure projection changes: delay an existing balance, add bounded monthly expenses and explicit order payments, and change only scenario FX.
select pg_temp.save_scenario(130,null,pg_temp.result(110),0,jsonb_build_array(
  jsonb_build_object('id',pg_temp.fid(131),'type','income_delay','itemId',pg_temp.result(100),'date',pg_temp.today()+25),
  jsonb_build_object('id',pg_temp.fid(132),'type','expense','categoryId',pg_temp.cat('rent'),'currency','UAH','description','Temporary monthly service','amount','100','date',pg_temp.today()+1,'endDate',pg_temp.today()+65,'repeat','monthly'),
  jsonb_build_object('id',pg_temp.fid(133),'type','order','categoryId',pg_temp.cat('project_payments'),'currency','UAH','description','Two order receipts','payments',jsonb_build_array(
    jsonb_build_object('id',pg_temp.fid(134),'date',pg_temp.today()+5,'amount','50'),jsonb_build_object('id',pg_temp.fid(135),'date',pg_temp.today()+15,'amount','75'))),
  jsonb_build_object('id',pg_temp.fid(136),'type','fx','currency','USD','rate','50')),'Downside with orders');
select is((select count(*) from jsonb_array_elements(pg_temp.workspace(pg_temp.result(110))->'scenarios') s(value),jsonb_array_elements(s.value->'report'->'items') i(value) where i.value->>'assumptionId'=pg_temp.fid(132)::text),3::bigint,
  'monthly expense creates one occurrence for each requested service month');
select is((select count(*) from jsonb_array_elements(pg_temp.workspace(pg_temp.result(110))->'scenarios') s(value),jsonb_array_elements(s.value->'report'->'items') i(value) where i.value->>'assumptionId'=pg_temp.fid(133)::text),2::bigint,
  'order projection contains only its explicit payment dates');
select is((select (i.value->>'reportingAmount')::numeric from jsonb_array_elements(pg_temp.workspace(pg_temp.result(110))->'scenarios') s(value),jsonb_array_elements(s.value->'report'->'items') i(value) where s.value->>'name'='Downside with orders' and i.value->>'id'=pg_temp.result(103)::text),10000::numeric,
  'scenario FX changes only its own projected valuation');
select is((select (i->>'reportingAmount')::numeric from public.finance_forecast_snapshots b,jsonb_array_elements(b.forecast->'items') i where b.id=pg_temp.result(110) and i->>'id'=pg_temp.result(103)::text),8000::numeric,
  'captured baseline FX remains unchanged after scenario valuation');
select is((select i.value->>'date' from jsonb_array_elements(pg_temp.workspace(pg_temp.result(110))->'scenarios') s(value),jsonb_array_elements(s.value->'report'->'items') i(value) where i.value->>'assumptionId'=pg_temp.fid(131)::text),(pg_temp.today()+25)::text,
  'income delay affects the scenario date without changing the source item');
select is((select (m->>'closing')::numeric from public.finance_forecast_snapshots b,jsonb_array_elements(b.forecast->'months') m where b.id=pg_temp.result(110) and m->>'month'=pg_temp.month()::text),7900::numeric,
  'stored monthly close remains stable after evaluating scenario assumptions');
select is((select count(*) from public.finance_expected_items where studio_id=pg_temp.fid(1)),(select n from expectation_count_before_projection),
  'projection assumptions never write into expected-item sources');
select is((select count(*) from public.finance_obligations where studio_id=pg_temp.fid(1)),(select n from obligation_count_before_projection),
  'scenario evaluation does not ensure or duplicate recurring obligations');

-- New source facts alter the live comparison; rebase previews identify them and require confirmation before creating a new revision.
select pg_temp.expected(140,jsonb_build_object('amount','300','description','Added after capture','expectedDate',pg_temp.today()+30,'dueDate',pg_temp.today()+30));
select ok((pg_temp.workspace()->>'sourceChanged')::boolean,'workspace detects live source facts newer than its frozen base');
select pg_temp.snapshot(141,'Revised base',jsonb_build_array(jsonb_build_object('currency','USD','rate','40','source','manual','effectiveDate',pg_temp.today())));
select ok(exists(select 1 from jsonb_array_elements(pg_temp.workspace(pg_temp.result(141))->'scenarios') s,
  jsonb_array_elements(s->'rebasePreview'->'changes') c where s->>'name'='Downside with orders' and c->>'status'='added' and c->>'label'='Added after capture'),
  'new base preview reports added source facts');
select throws_like($$select public.save_finance_forecast_scenario(pg_temp.fid(1),pg_temp.fid(142),pg_temp.scenario_id('Downside with orders'),jsonb_build_object('baseId',pg_temp.result(141),'revision',1,'name','Downside with orders','reason','Rebase','assumptions','[]'::jsonb))$$,
  '%finance_scenario_rebase_confirmation_required%','rebase requires explicit confirmation');
select pg_temp.save_scenario(143,pg_temp.scenario_id('Downside with orders'),pg_temp.result(141),1,(select assumptions from public.finance_current_scenarios where scenario_id=pg_temp.scenario_id('Downside with orders')),'Downside with orders','{"rebaseConfirmed":true}');
select is((select revision from public.finance_current_scenarios where scenario_id=pg_temp.scenario_id('Downside with orders')),2,'confirmed rebase creates an immutable next revision');

-- Optimistic revision and request idempotency.
select is(pg_temp.save_scenario(143,pg_temp.scenario_id('Downside with orders'),pg_temp.result(141),1,(select assumptions from public.finance_current_scenarios where scenario_id=pg_temp.scenario_id('Downside with orders')),'Downside with orders','{"rebaseConfirmed":true}'),pg_temp.result(143),'exact scenario retry returns original revision');
select throws_like($$select public.save_finance_forecast_scenario(pg_temp.fid(1),pg_temp.fid(143),pg_temp.scenario_id('Downside with orders'),jsonb_build_object('baseId',pg_temp.result(141),'revision',1,'name','Changed payload','reason','Rebase','assumptions','[]'::jsonb,'rebaseConfirmed',true))$$,
  '%finance_request_conflict%','changed payload cannot reuse a planning request id');
select throws_like($$select pg_temp.save_scenario(144,pg_temp.scenario_id('Downside with orders'),pg_temp.result(141),1,'[]','Downside with orders','{"rebaseConfirmed":true}')$$,'%finance_version_conflict%','stale scenario revision is rejected');
select lives_ok($$select pg_temp.save_scenario(145,pg_temp.scenario_id('Downside with orders'),pg_temp.result(141),2,(select assumptions from public.finance_current_scenarios where scenario_id=pg_temp.scenario_id('Downside with orders')),'Downside with orders')$$,'latest scenario revision can be updated against the same base');
select throws_like($$select public.save_finance_forecast_scenario(pg_temp.fid(1),pg_temp.fid(146),null,jsonb_build_object('baseId',pg_temp.fid(90),'revision',0,'name','Legacy-based','reason','Test','assumptions','[]'::jsonb))$$,
  '%finance_scenario_base_required%','scenario writer rejects a legacy base without native inputs');
select pg_temp.expected(147,jsonb_build_object('id',pg_temp.result(103),'version',1,'amount','250','currency','USD'));
select pg_temp.expected(148,jsonb_build_object('id',pg_temp.result(100),'version',1,'commitment','cancelled'));
select pg_temp.snapshot(149,'Latest changed sources',jsonb_build_array(jsonb_build_object('currency','USD','rate','40','source','manual','effectiveDate',pg_temp.today())));
select ok(exists(select 1 from jsonb_array_elements(pg_temp.workspace(pg_temp.result(149))->'scenarios') s,
  jsonb_array_elements(s->'rebasePreview'->'changes') c where s->>'name'='Downside with orders' and c->>'status'='changed' and c->>'id'=pg_temp.result(103)::text),
  'rebase preview reports a changed frozen source');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.workspace(pg_temp.result(149))->'scenarios') s,
  jsonb_array_elements(s->'rebasePreview'->'changes') c where s->>'name'='Downside with orders' and c->>'status'='missing' and c->>'id'=pg_temp.result(100)::text),
  'rebase preview reports a source removed from the latest base');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.workspace(pg_temp.result(149))->'scenarios') s,
  jsonb_array_elements(s->'rebasePreview'->'invalidItemIds') i where s->>'name'='Downside with orders' and i#>>'{}'=pg_temp.result(100)::text),
  'rebase preview identifies assumptions whose source is no longer available');
select throws_like($$select public.save_finance_forecast_scenario(pg_temp.fid(1),pg_temp.fid(150),pg_temp.scenario_id('Downside with orders'),jsonb_build_object('baseId',pg_temp.result(149),'revision',3,'name','Downside with orders','reason','Rebase','assumptions','[]'::jsonb))$$,
  '%finance_scenario_rebase_confirmation_required%','changed base continues to require confirmation');
select throws_like($$select public.save_finance_forecast_scenario(pg_temp.fid(1),pg_temp.fid(152),pg_temp.scenario_id('Downside with orders'),jsonb_build_object('baseId',pg_temp.result(149),'revision',3,'name','Downside with orders','reason','Rebase',
  'assumptions',(select assumptions from public.finance_current_scenarios where scenario_id=pg_temp.scenario_id('Downside with orders')),'rebaseConfirmed',true))$$,
  '%finance_scenario_source_missing%','confirmed rebase cannot silently preserve an assumption for a removed source');
select pg_temp.save_scenario(151,pg_temp.scenario_id('Downside with orders'),pg_temp.result(149),3,'[]','Downside with orders','{"rebaseConfirmed":true}');
select is((select revision from public.finance_current_scenarios where scenario_id=pg_temp.scenario_id('Downside with orders')),4,'explicit confirmation applies the previewed rebase as a new revision');

-- RLS and grants: direct writes and private projection calls remain inaccessible.
select throws_like($$insert into public.finance_forecast_scenarios(studio_id,created_by) values(pg_temp.fid(1),pg_temp.fid(10))$$,'%permission denied%','authenticated admin cannot forge scenario parent rows');
select throws_like($$insert into public.finance_forecast_scenario_revisions(studio_id,scenario_id,revision,name,base_snapshot_id,assumptions,reason,created_by) values(pg_temp.fid(1),pg_temp.fid(130),99,'Forged',pg_temp.result(110),'[]','Forged',pg_temp.fid(10))$$,'%permission denied%','authenticated admin cannot forge scenario history');
select throws_like($$select private.project_finance_forecast_inputs('{}','[]','6')$$,'%permission denied%','internal pure projector is not callable by clients');
select is((select count(*) from public.finance_current_scenarios where studio_id=pg_temp.fid(2)),0::bigint,'foreign studio scenarios are hidden');
select throws_like($$select public.get_finance_scenario_workspace(pg_temp.fid(2))$$,'%finance_admin_required%','foreign studio workspace denied');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select is((select count(*) from public.finance_forecast_scenarios),0::bigint,'employee cannot read scenario parent rows');
select is((select count(*) from public.finance_forecast_scenario_revisions),0::bigint,'employee cannot read scenario revisions');
select throws_like($$select public.get_finance_scenario_workspace(pg_temp.fid(1))$$,'%finance_admin_required%','employee workspace denied');
select throws_like($$select public.get_finance_forecast_capture_preview(pg_temp.fid(1))$$,'%finance_admin_required%','employee capture preview denied');
select throws_like($$select public.save_finance_forecast_scenario(pg_temp.fid(1),pg_temp.fid(150),null,'{}')$$,'%finance_admin_required%','employee scenario write denied');
set local role anon;
select throws_like($$select public.get_finance_scenario_workspace(pg_temp.fid(1))$$,'%permission denied%','anonymous scenario workspace denied');
reset role;
select throws_like($$update public.finance_forecast_scenario_revisions set reason='rewrite'$$,'%finance_history_immutable%','scenario revision history remains immutable');
select * from finish();
rollback;
