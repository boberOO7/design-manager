begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('8e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kiev')::date$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',pg_temp.today())+make_interval(months=>n))::date$$;
create function pg_temp.result(n integer) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.mid(n integer) returns uuid language sql as $$select id from public.finance_movements where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.cat(key text) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key=key$$;
create function pg_temp.labor_version(obligation uuid) returns text language sql stable as $$
select s->>'version' from jsonb_array_elements(public.get_finance_labor_sources(pg_temp.fid(1)))s where s->>'obligationId'=obligation::text$$;
create function pg_temp.rec(n integer,source text,source_id uuid,amount text,classification text,project integer,patch jsonb default '{}') returns uuid language sql as $$
select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('sourceKind',source,'sourceId',source_id,
  'classification',classification,'projectId',pg_temp.fid(project)::text,'amount',amount,'date',pg_temp.today(),
  'periodStart',pg_temp.month(),'periodEnd',pg_temp.today(),'description','Integrity fixture','reason','Reporting digest')||patch)$$;
create function pg_temp.post(n integer,kind text,amount text,patch jsonb default '{}') returns uuid language sql as $$
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('kind',kind,'date',pg_temp.today(),'accountId',pg_temp.fid(20),
  'amount',amount,'categoryId',pg_temp.cat(case when kind='incoming' then 'project_payments' else 'project_services' end),
  'description','Integrity cash fixture')||patch)$$;
create function pg_temp.split(n integer,movement_id uuid,revision integer,items jsonb) returns uuid language sql as $$
select public.save_finance_project_cash_split(pg_temp.fid(1),pg_temp.fid(n),movement_id,
  jsonb_build_object('revision',revision,'items',items,'reason','Cash history fixture'))$$;

insert into public.studios(id,name) values(pg_temp.fid(1),'Integrity A'),(pg_temp.fid(2),'Integrity B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','integrity-'||n||'@test','{}','{}',now(),now() from generate_series(10,12)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Integrity tester','integrity-'||n||'@test',case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=12 then 2 else 1 end),pg_temp.fid(n),case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values
(pg_temp.fid(1),'UAH',pg_temp.month(-1),pg_temp.fid(10)),(pg_temp.fid(2),'UAH',pg_temp.month(-1),pg_temp.fid(12));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'UAH cash','UAH',0,pg_temp.fid(10)),(pg_temp.fid(21),pg_temp.fid(1),'USD cash','USD',0,pg_temp.fid(10)),
(pg_temp.fid(22),pg_temp.fid(2),'Foreign cash','UAH',0,pg_temp.fid(12));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values
(pg_temp.fid(30),pg_temp.fid(1),'Integrity Project',100,pg_temp.month(-1),pg_temp.fid(10),'active'),
(pg_temp.fid(33),pg_temp.fid(1),'Immediate FX Contra Project',100,pg_temp.month(-1),pg_temp.fid(10),'active'),
(pg_temp.fid(31),pg_temp.fid(2),'Foreign Project',100,pg_temp.month(-1),pg_temp.fid(12),'active');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.finalize_finance_setup(pg_temp.fid(1));
select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(40),pg_temp.month());
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select public.finalize_finance_setup(pg_temp.fid(2));
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);

-- New estimate fingerprints the economic cost state. FX-only completion is not an economic revision.
select is(jsonb_typeof((public.get_finance_project_reporting(pg_temp.fid(1))->'costStates')),'array','project report exposes per-project cost fingerprints');
reset role;
insert into public.finance_project_cost_estimates(studio_id,project_id,revision,currency,as_of,reporting_currency,reason,created_by)
values(pg_temp.fid(1),pg_temp.fid(30),1,'UAH',pg_temp.today(),'UAH','Legacy estimate before digest support',pg_temp.fid(10));
set local role authenticated;
select is((select count(*) from jsonb_array_elements(public.get_finance_project_reporting(pg_temp.fid(1))->'estimates')e
  where e->>'reason'='Legacy estimate before digest support' and e->'source_digest'='null'::jsonb),1::bigint,
  'legacy estimate remains explicitly unverified instead of receiving an inferred digest');
select public.save_finance_project_cost_estimate(pg_temp.fid(1),pg_temp.fid(50),pg_temp.fid(30),jsonb_build_object('revision',1,'currency','UAH',
  'date',pg_temp.today(),'directBudget','200','laborBudget','100','remainingDirect','80','remainingLabor','50','reason','Reviewed baseline'));
select is((select source_digest from public.finance_project_current_cost_estimates where project_id=pg_temp.fid(30)),
  (select s->>'digest' from jsonb_array_elements(public.get_finance_project_reporting(pg_temp.fid(1))->'costStates')s where s->>'projectId'=pg_temp.fid(30)::text),
  'estimate stores the exact current economic digest');
select public.save_finance_report_coverage(pg_temp.fid(1),pg_temp.fid(58),jsonb_build_object('projectId',pg_temp.fid(30),'month',pg_temp.month(),
  'through',pg_temp.today(),'revision',0,'revenue',true,'direct_costs',true,'labor',true,'overhead',true,'reason','Reviewed zero-cost baseline'));
select is((select direct_costs_reviewed from public.finance_current_report_coverage where studio_id=pg_temp.fid(1) and project_id=pg_temp.fid(30)),true,
  'reviewed direct-cost coverage starts current');
select pg_temp.post(60,'outgoing','25',jsonb_build_object('accountId',pg_temp.fid(21),'categoryId',pg_temp.cat('project_services')));
select pg_temp.rec(61,'movement',pg_temp.mid(60),'25','direct_cost',30);
select is((select (s->>'digest')<>(e.source_digest) from jsonb_array_elements(public.get_finance_project_reporting(pg_temp.fid(1))->'costStates')s
  cross join public.finance_project_current_cost_estimates e where e.project_id=pg_temp.fid(30) and s->>'projectId'=pg_temp.fid(30)::text),true,
  'new direct recognition makes the prior estimate stale without rewriting it');
select is((select row(direct_costs_reviewed,changed_since_review) from public.finance_current_report_coverage
  where studio_id=pg_temp.fid(1) and project_id=pg_temp.fid(30)),row(false,true),
  'later economic recognition invalidates the previously reviewed direct-cost coverage');
select public.save_finance_report_coverage(pg_temp.fid(1),pg_temp.fid(59),jsonb_build_object('projectId',pg_temp.fid(30),'month',pg_temp.month(),
  'through',pg_temp.today(),'revision',1,'revenue',true,'direct_costs',true,'labor',true,'overhead',true,'reason','Reviewed updated direct costs'));
select is((select row(direct_costs_reviewed,changed_since_review,revision) from public.finance_current_report_coverage
  where studio_id=pg_temp.fid(1) and project_id=pg_temp.fid(30)),row(true,false,2),
  'new coverage review restores the direct-cost completeness signal');
select is((select count(*) from public.finance_report_coverage where studio_id=pg_temp.fid(1) and project_id=pg_temp.fid(30)),2::bigint,
  'coverage correction appends a revision instead of rewriting the prior review');
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(90),pg_temp.fid(30),jsonb_build_object('stream','design','revision',0,
  'mode','design','amount','0.03','currency','USD','vatRate','20','priceBasis','net','reason','Small FX contra fixture'));
select pg_temp.rec(91,'project_terms',pg_temp.result(90),'0.03','revenue',30);
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(92),pg_temp.result(91),jsonb_build_object('operation','adjustment','amount','0.01','date',pg_temp.today(),'reason','First one-cent contra'));
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(93),pg_temp.result(91),jsonb_build_object('operation','adjustment','amount','0.01','date',pg_temp.today(),'reason','Second one-cent contra'));
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(94),pg_temp.result(91),jsonb_build_object('operation','adjustment','amount','0.01','date',pg_temp.today(),'reason','Final one-cent contra'));
select is((select row(sum(amount),sum(vat_amount),sum(gross_amount)) from public.finance_recognition_entries
  where related_entry_id=pg_temp.result(91) and kind='adjustment'),row(-0.03::numeric,-0.01::numeric,-0.04::numeric),
  'three partial net contra slices consume exact total VAT and gross residuals');
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(95),pg_temp.result(91),jsonb_build_object('operation','cancel','reason','Cancel the corrected source'));
select public.value_finance_recognition(pg_temp.fid(1),pg_temp.result(91),jsonb_build_object('rate','1.5','source','manual','effectiveDate',pg_temp.today()));
select is((select reporting_amount from public.finance_recognition_entries where id=pg_temp.result(91)),0.05::numeric,
  'deferred FX fill preserves the original rounded native valuation');
select is((select sum(reporting_amount) from public.finance_recognition_entries where related_entry_id=pg_temp.result(91) and kind='adjustment'),-0.05::numeric,
  'partial contra FX slices cumulatively conserve the original converted amount');
with recursive family(id) as (select pg_temp.result(91) union all
  select e.id from public.finance_recognition_entries e join family f on e.related_entry_id=f.id where e.studio_id=pg_temp.fid(1))
select is((select row(sum(e.amount),sum(e.vat_amount),sum(e.gross_amount),sum(e.reporting_amount)) from public.finance_recognition_entries e join family f on f.id=e.id),
  row(0::numeric,0::numeric,0::numeric,0::numeric),'technical cancellation reverses the entire corrected family exactly after FX completion');
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(300),pg_temp.fid(33),jsonb_build_object('stream','design','revision',0,
  'mode','design','amount','0.03','currency','USD','vatRate','20','priceBasis','net','reason','Already-valued contra fixture'));
select pg_temp.rec(301,'project_terms',pg_temp.result(300),'0.03','revenue',33,jsonb_build_object('fx',jsonb_build_object('rate','1.5','source','manual','effectiveDate',pg_temp.today())));
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(302),pg_temp.result(301),jsonb_build_object('operation','adjustment','amount','0.01','date',pg_temp.today(),'reason','First valued contra'));
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(303),pg_temp.result(301),jsonb_build_object('operation','adjustment','amount','0.01','date',pg_temp.today(),'reason','Second valued contra'));
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(304),pg_temp.result(301),jsonb_build_object('operation','adjustment','amount','0.01','date',pg_temp.today(),'reason','Final valued contra'));
select is((select row(sum(amount),sum(vat_amount),sum(gross_amount),sum(reporting_amount)) from public.finance_recognition_entries
  where related_entry_id=pg_temp.result(301) and kind='adjustment'),row(-0.03::numeric,-0.01::numeric,-0.04::numeric,-0.05::numeric),
  'already-valued contra slices cumulatively conserve Net, VAT, Gross, and the rounded FX snapshot');
select is((select count(*) from public.finance_project_cost_estimates where project_id=pg_temp.fid(30)),2::bigint,'economic updates preserve immutable historical estimates');
select pg_temp.post(62,'outgoing','10',jsonb_build_object('accountId',pg_temp.fid(21),'categoryId',pg_temp.cat('project_services')));
select pg_temp.rec(63,'movement',pg_temp.mid(62),'10','direct_cost',30);
select public.save_finance_project_cost_estimate(pg_temp.fid(1),pg_temp.fid(66),pg_temp.fid(30),jsonb_build_object('revision',2,'currency','UAH',
  'date',pg_temp.today(),'directBudget','200','laborBudget','100','remainingDirect','70','remainingLabor','50','reason','Updated direct cost review'));
select is((select source_digest from public.finance_project_current_cost_estimates where project_id=pg_temp.fid(30)),
  (select s->>'digest' from jsonb_array_elements(public.get_finance_project_reporting(pg_temp.fid(1))->'costStates')s where s->>'projectId'=pg_temp.fid(30)::text),
  'revised estimate captures a changed direct-cost digest');
select pg_temp.post(64,'outgoing','6',jsonb_build_object('accountId',pg_temp.fid(21),'categoryId',pg_temp.cat('project_services')));
select pg_temp.rec(65,'movement',pg_temp.mid(64),'6','direct_cost',30);
create function pg_temp.current_digest(project_id uuid) returns text language sql stable as $$
select s->>'digest' from jsonb_array_elements(public.get_finance_project_reporting(pg_temp.fid(1))->'costStates')s where s->>'projectId'=project_id::text$$;
create temp table integrity_digest_snapshot(digest text);
insert into integrity_digest_snapshot values(pg_temp.current_digest(pg_temp.fid(30)));
select public.value_finance_recognition(pg_temp.fid(1),pg_temp.result(65),jsonb_build_object('rate','40','source','manual','effectiveDate',pg_temp.today()));
select is(pg_temp.current_digest(pg_temp.fid(30)),(select digest from integrity_digest_snapshot),
  'completing historical FX alone leaves the economic source fingerprint unchanged');
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(67),pg_temp.result(61),jsonb_build_object('operation','adjustment',
  'amount','20','date',pg_temp.today(),'reason','Cost correction'));
select isnt(pg_temp.current_digest(pg_temp.fid(30)),(select digest from integrity_digest_snapshot),
  'an economic cost adjustment changes the source fingerprint');
select public.save_finance_report_coverage(pg_temp.fid(1),pg_temp.fid(96),jsonb_build_object('projectId',pg_temp.fid(30),'month',pg_temp.month(),
  'through',pg_temp.today(),'revision',2,'revenue',true,'direct_costs',true,'labor',true,'overhead',true,'reason','Fresh review before labor attribution'));

-- Receipt attribution audit history retains revisions and zero-net receipts, not just current balances.
select pg_temp.post(70,'incoming','20');
select pg_temp.split(71,pg_temp.mid(70),0,jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','20')));
select pg_temp.post(72,'refund','20',jsonb_build_object('relatedMovementId',pg_temp.mid(70),'projectRefundSplits',
  jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','20'))));
select is((select row(remaining,revision) from jsonb_to_recordset(public.get_finance_project_reporting(pg_temp.fid(1))->'receipts')
  as r(id uuid,remaining text,revision integer) where id=pg_temp.mid(70)),row('0'::text,1),'fully refunded source still reads as a zero-net receipt');
select is((select count(*) from jsonb_array_elements(public.get_finance_project_reporting(pg_temp.fid(1))->'cashHistory') h
  where h->>'movementId'=pg_temp.mid(70)::text),1::bigint,'cash history retains the receipt attribution revision after full refund');
select is((select h->>'actor' from jsonb_array_elements(public.get_finance_project_reporting(pg_temp.fid(1))->'cashHistory') h
  where h->>'movementId'=pg_temp.mid(70)::text),'Integrity tester','cash history identifies the reviewing actor');
select ok((select h ?& array['currency','description'] from jsonb_array_elements(public.get_finance_project_reporting(pg_temp.fid(1))->'cashHistory') h
  where h->>'movementId'=pg_temp.mid(70)::text),'cash history preserves the receipt unit and source description');
select pg_temp.post(73,'incoming','5');
select pg_temp.split(74,pg_temp.mid(73),0,'[]'::jsonb);
select is((select jsonb_array_length(h->'items') from jsonb_array_elements(public.get_finance_project_reporting(pg_temp.fid(1))->'cashHistory') h
  where h->>'movementId'=pg_temp.mid(73)::text),0,'empty cash attribution decisions remain auditable');

-- Missing FX in account cash or forecast obligations makes definitive risk metrics unknown until an explicit assumption values them.
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(75),jsonb_build_object('direction','outgoing','amount','5','currency','USD',
  'categoryId',pg_temp.cat('rent'),'description','Unvalued foreign obligation','dueDate',pg_temp.today()+3,'expectedDate',pg_temp.today()+3,
  'commitment','agreed','certainty','fixed','established',true));
create temp table integrity_fx_reports as
select public.calculate_finance_forecast(pg_temp.fid(1),'6','confirmed','[]'::jsonb) as unvalued,
  public.calculate_finance_forecast(pg_temp.fid(1),'6','confirmed',jsonb_build_array(jsonb_build_object('currency','USD','rate','40','source','manual','effectiveDate',pg_temp.today()))) as valued;
select is((select (unvalued->>'riskIncomplete')::boolean from integrity_fx_reports),true,
  'missing FX on a nonzero foreign account or expected obligation invalidates risk metrics');
select is((select unvalued->'lowPoint' from integrity_fx_reports),'null'::jsonb,'unknown exposure suppresses a misleading cash low point');
select is((select jsonb_array_length(unvalued->'daily') from integrity_fx_reports),0,'unknown exposure suppresses the daily solvency curve');
select ok((select exists(select 1 from jsonb_array_elements(unvalued->'issues')i where i->>'source'='expected' and i->>'reason'='missing_fx')
  and exists(select 1 from jsonb_array_elements(unvalued->'issues')i where i->>'source'='account' and i->>'reason'='missing_fx') from integrity_fx_reports),
  'the forecast identifies each unresolved expected and cash source');
select is((select (valued->>'riskIncomplete')::boolean from integrity_fx_reports),false,'an explicit dated FX assumption resolves the completeness gap');
select ok((select valued->'lowPoint'<>'null'::jsonb and jsonb_array_length(valued->'daily')>0 from integrity_fx_reports),
  'valued source data restores finite daily cash metrics');

-- Synthetic once/monthly/order rows are stable valid UUIDs across repeated projections.
reset role;
create temporary table integrity_scenario_inputs(input jsonb,assumptions jsonb);
create temporary table integrity_scenario_projection(report jsonb);
insert into integrity_scenario_inputs
select
  jsonb_build_object('version','2','asOf',pg_temp.today(),'through',pg_temp.today()+90,'digits',2,'currency','UAH','scenario','confirmed',
    'cutover',pg_temp.month(-1),'fx',jsonb_build_array(jsonb_build_object('currency','UAH','rate','1','source','identity','effectiveDate',pg_temp.today())),
    'expected','[]'::jsonb,'currencies',jsonb_build_array(jsonb_build_object('code','UAH','minorUnits',2)),
    'categories',jsonb_build_array(jsonb_build_object('id',pg_temp.cat('rent'),'name','Rent','nature','operating','direction','outgoing','archivedAt',null),
      jsonb_build_object('id',pg_temp.cat('project_payments'),'name','Project receipts','nature','operating','direction','incoming','archivedAt',null)),
    'accounts','[]'::jsonb,'actuals','[]'::jsonb,'budgets','[]'::jsonb,'diagnostics','[]'::jsonb),
  jsonb_build_array(
    jsonb_build_object('id',pg_temp.fid(100),'type','expense','categoryId',pg_temp.cat('rent'),'currency','UAH','description','One-time expense','amount','10','date',pg_temp.today()+1,'repeat','once'),
    jsonb_build_object('id',pg_temp.fid(101),'type','expense','categoryId',pg_temp.cat('rent'),'currency','UAH','description','Monthly expense','amount','5','date',pg_temp.today()+1,'endDate',pg_temp.today()+80,'repeat','monthly'),
    jsonb_build_object('id',pg_temp.fid(102),'type','order','categoryId',pg_temp.cat('project_payments'),'currency','UAH','description','Order receipts','payments',jsonb_build_array(
      jsonb_build_object('id',pg_temp.fid(103),'date',pg_temp.today()+5,'amount','20'),jsonb_build_object('id',pg_temp.fid(104),'date',pg_temp.today()+15,'amount','30'))))
  ;
insert into integrity_scenario_projection select private.project_finance_forecast_inputs(input,assumptions,'3') from integrity_scenario_inputs;
insert into integrity_scenario_projection select private.project_finance_forecast_inputs(input,assumptions,'3') from integrity_scenario_inputs;
select is((select count(*) from jsonb_array_elements((select report from integrity_scenario_projection limit 1)->'items')i where i->>'assumptionId'=pg_temp.fid(100)::text),1::bigint,
  'one-time expense produces one projected item');
select is((select count(*) from jsonb_array_elements((select report from integrity_scenario_projection limit 1)->'items')i where i->>'assumptionId'=pg_temp.fid(101)::text),3::bigint,
  'monthly expense produces a stable item for each occurrence');
select is((select count(*) from jsonb_array_elements((select report from integrity_scenario_projection limit 1)->'items')i where i->>'assumptionId'=pg_temp.fid(102)::text),2::bigint,
  'order assumption produces only its explicit payment rows');
select ok(not exists(select 1 from integrity_scenario_projection p,jsonb_array_elements(p.report->'items')i
  where i->>'assumptionId' in (pg_temp.fid(100)::text,pg_temp.fid(101)::text,pg_temp.fid(102)::text)
    and (i->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  'synthetic report item IDs satisfy the shared RFC UUID version and variant contract');
select is((select report from integrity_scenario_projection limit 1),(select report from integrity_scenario_projection offset 1 limit 1),
  'synthetic report item IDs remain deterministic for identical inputs');
set local role authenticated;

-- Labor allocation history retains prior and cleared versions, while current project digest follows only current allocations.
reset role;
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by) values(pg_temp.fid(80),pg_temp.fid(1),'payroll',pg_temp.fid(11),pg_temp.fid(10));
insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,
  payment_month_offset,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.fid(81),pg_temp.fid(1),pg_temp.fid(80),1,'Integrity payroll',40,'UAH',pg_temp.cat('salary'),1,1,0,pg_temp.month(),'agreed','fixed','net',40,0,0,'fixed','Integrity labor terms',pg_temp.fid(10));
set local role authenticated;
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(82),jsonb_build_object('direction','outgoing','amount','40','currency','UAH',
  'categoryId',pg_temp.cat('salary'),'description','Integrity payroll payout','dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),
  'commitment','agreed','certainty','fixed','established',true));
reset role;
insert into public.finance_obligations(id,studio_id,schedule_id,terms_id,kind,employee_id,employee_name,period_start,period_end,created_by)
values(pg_temp.fid(83),pg_temp.fid(1),pg_temp.fid(80),pg_temp.fid(81),'payroll',pg_temp.fid(11),'Integrity employee',pg_temp.month(),pg_temp.today(),pg_temp.fid(10));
insert into public.finance_obligation_items(studio_id,obligation_id,expected_item_id,component) values(pg_temp.fid(1),pg_temp.fid(83),pg_temp.result(82),'payout');
set local role authenticated;
select public.record_finance_labor_cost(pg_temp.fid(1),pg_temp.fid(84),jsonb_build_object('obligationId',pg_temp.fid(83),
  'version',pg_temp.labor_version(pg_temp.fid(83)),'reason','Recognize integrity payroll'));
select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(85),pg_temp.result(84),jsonb_build_object('revision',0,
  'items',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','40')),'reason','Allocate payroll'));
select is(jsonb_array_length(public.get_finance_labor_reporting(pg_temp.fid(1))->'allocationHistory'),1,'labor report includes allocation audit history');
select is((select row(labor_reviewed,changed_since_review) from public.finance_current_report_coverage
  where studio_id=pg_temp.fid(1) and project_id=pg_temp.fid(30)),row(false,true),
  'new payroll attribution invalidates the reviewed project labor coverage');
select is((select (s->>'digest')<>(e.source_digest) from jsonb_array_elements(public.get_finance_project_reporting(pg_temp.fid(1))->'costStates')s
  cross join public.finance_project_current_cost_estimates e where e.project_id=pg_temp.fid(30) and s->>'projectId'=pg_temp.fid(30)::text),true,
  'current labor allocation contributes to the project cost fingerprint');
select public.save_finance_labor_allocation(pg_temp.fid(1),pg_temp.fid(86),pg_temp.result(84),jsonb_build_object('revision',1,'items','[]'::jsonb,'reason','Clear project allocation'));
select is(jsonb_array_length(public.get_finance_labor_reporting(pg_temp.fid(1))->'allocationHistory'),2,'cleared labor allocation keeps both audit revisions');
select is((select jsonb_array_length(h->'items') from jsonb_array_elements(public.get_finance_labor_reporting(pg_temp.fid(1))->'allocationHistory') h
  where (h->>'revision')::integer=2),0,'cleared labor history records an empty replacement allocation');
select is((select row(labor_reviewed,changed_since_review) from public.finance_current_report_coverage
  where studio_id=pg_temp.fid(1) and project_id=pg_temp.fid(30)),row(false,true),
  'clearing a later allocation preserves the stale labor-coverage warning');

-- A client cannot alter estimate snapshots or append forged allocation audit facts.
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$insert into public.finance_project_cost_estimates(studio_id,project_id,revision,currency,as_of,reporting_currency,reason,created_by)
  values(pg_temp.fid(1),pg_temp.fid(30),9,'UAH',pg_temp.today(),'UAH','Forged',pg_temp.fid(11))$$,'%permission denied%','employees cannot forge estimate history');
select throws_like($$select public.get_finance_project_reporting(pg_temp.fid(1))$$,'%finance_admin_required%','employee cannot read project cost fingerprints');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select throws_like($$select public.get_finance_labor_reporting(pg_temp.fid(1))$$,'%finance_admin_required%','foreign studio admin cannot read labor allocation history');
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select throws_like($$update public.finance_project_cost_estimates set source_digest=null where project_id=pg_temp.fid(30)$$,'%permission denied%','admin cannot rewrite immutable estimate fingerprint');
select throws_like($$insert into public.finance_labor_allocation_revisions(studio_id,entry_id,revision,method,reason,created_by)
  values(pg_temp.fid(1),pg_temp.result(84),3,'manual_management','Forged',pg_temp.fid(10))$$,'%permission denied%','admin cannot forge labor allocation audit revisions');
select * from finish();
rollback;
