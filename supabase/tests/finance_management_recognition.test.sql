begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('68000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',pg_temp.today())+make_interval(months=>n))::date$$;
create function pg_temp.result(n integer,studio integer default 1) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(studio) and request_id=pg_temp.fid(n)$$;
create function pg_temp.movement(n integer) returns uuid language sql as $$select id from public.finance_movements where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.cat(key text,studio integer default 1) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(studio) and default_key=key$$;
create function pg_temp.rec(n integer,source_kind text,source_id uuid,amount text,classification text default 'revenue',project integer default 30,patch jsonb default '{}') returns uuid language sql as $$
select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('sourceKind',source_kind,'sourceId',source_id,
  'classification',classification,'projectId',case when project is null then null else pg_temp.fid(project)::text end,
  'amount',amount,'date',pg_temp.today(),'periodStart',pg_temp.month(0),'periodEnd',pg_temp.today(),
  'description','Management recognition','reason','Reviewed economic period')||patch)$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Recognition A'),(pg_temp.fid(2),'Recognition B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','recognition-'||n||'@test','{}','{}',now(),now() from generate_series(10,14)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Recognition tester','recognition-'||n||'@test',case when n=11 then 'employee' else 'admin' end,n<>13 from generate_series(10,14)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=12 then 2 else 1 end),pg_temp.fid(n),case when n=11 then 'employee' else 'admin' end,n<>14 from generate_series(10,14)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values
(pg_temp.fid(1),'UAH',pg_temp.month(-3),pg_temp.fid(10)),(pg_temp.fid(2),'UAH',pg_temp.month(-3),pg_temp.fid(12));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',1000,pg_temp.fid(10)),(pg_temp.fid(21),pg_temp.fid(1),'USD','USD',50,pg_temp.fid(10)),
(pg_temp.fid(22),pg_temp.fid(2),'Other studio bank','UAH',0,pg_temp.fid(12));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values
(pg_temp.fid(30),pg_temp.fid(1),'Recognition project',100,pg_temp.month(-3),pg_temp.fid(10),'active'),
(pg_temp.fid(32),pg_temp.fid(1),'VAT recognition project',100,pg_temp.month(-3),pg_temp.fid(10),'active'),
(pg_temp.fid(31),pg_temp.fid(2),'Other studio project',100,pg_temp.month(-3),pg_temp.fid(12),'active');
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.value_finance_opening(pg_temp.fid(1),pg_temp.fid(21),jsonb_build_object('currency','USD','reportingCurrency','UAH',
  'openingAmount','50','date',pg_temp.month(-3),'fx',jsonb_build_object('rate','40','source','manual','effectiveDate',pg_temp.month(-3))));
select public.finalize_finance_setup(pg_temp.fid(1));
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select public.finalize_finance_setup(pg_temp.fid(2));
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);

-- Activation is an independent reporting boundary. It does not move cash cutover or opening balances.
select is((select recognition_start_month from public.finance_settings where studio_id=pg_temp.fid(1)),null::date,'recognition starts inactive');
select is((select cutover_date from public.finance_settings where studio_id=pg_temp.fid(1)),pg_temp.month(-3),'cash cutover remains independently configured');
select is((select opening_balance from public.finance_accounts where id=pg_temp.fid(20)),1000::numeric,'opening balance is present before activation');
select throws_like($$select public.save_finance_report_coverage(pg_temp.fid(1),pg_temp.fid(79),jsonb_build_object('projectId',pg_temp.fid(30),
  'month',pg_temp.month(0),'through',pg_temp.today(),'revision',0,'revenue',true,'direct_costs',true,'labor',true,'overhead',true,'reason','Inactive'))$$,
  '%finance_input_invalid%','coverage cannot be recorded before recognition is activated');
select lives_ok($$select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(80),pg_temp.month(0))$$,'admin activates management recognition');
select is((select recognition_start_month from public.finance_settings where studio_id=pg_temp.fid(1)),pg_temp.month(0),'recognition start stored');
select is((select cutover_date from public.finance_settings where studio_id=pg_temp.fid(1)),pg_temp.month(-3),'activation leaves cash cutover unchanged');
select is((select opening_balance from public.finance_accounts where id=pg_temp.fid(20)),1000::numeric,'activation leaves opening cash unchanged');
select lives_ok($$select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(80),pg_temp.month(0))$$,'activation retry returns idempotently');
select throws_like($$select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(80),pg_temp.month(1))$$,'%finance_request_conflict%','changed activation retry is rejected');
select throws_like($$select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(81),pg_temp.month(1))$$,'%finance_recognition_start_locked%','start month cannot be changed');

-- Coverage revisions are explicit review snapshots scoped to the active report period.
select lives_ok($$select public.save_finance_report_coverage(pg_temp.fid(1),pg_temp.fid(82),jsonb_build_object('projectId',pg_temp.fid(30),
  'month',pg_temp.month(0),'through',pg_temp.today(),'revision',0,'revenue',true,'direct_costs',false,'labor',true,'overhead',false,'reason','Monthly review'))$$,
  'admin records first project coverage snapshot');
select is((select row(revision,reviewed_through,revenue_reviewed,direct_costs_reviewed,labor_reviewed,overhead_reviewed)
  from public.finance_current_report_coverage where studio_id=pg_temp.fid(1) and project_id=pg_temp.fid(30) and month=pg_temp.month(0)),
  row(1,pg_temp.today(),true,false,true,false),'current coverage view exposes the saved review');
select lives_ok($$select public.save_finance_report_coverage(pg_temp.fid(1),pg_temp.fid(82),jsonb_build_object('projectId',pg_temp.fid(30),
  'month',pg_temp.month(0),'through',pg_temp.today(),'revision',0,'revenue',true,'direct_costs',false,'labor',true,'overhead',false,'reason','Monthly review'))$$,
  'coverage request retry is idempotent');
select throws_like($$select public.save_finance_report_coverage(pg_temp.fid(1),pg_temp.fid(30),jsonb_build_object('projectId',pg_temp.fid(30),
  'month',pg_temp.month(0),'through',pg_temp.today(),'revision',0,'revenue',true,'direct_costs',true,'labor',true,'overhead',true,'reason','Stale review'))$$,
  '%finance_version_conflict%','coverage rejects a stale optimistic revision');

-- Agreement recognition uses discounted Net and records VAT separately.
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(90),pg_temp.fid(30),jsonb_build_object(
  'stream','design','revision',0,'mode','design','amount','1000','currency','UAH','vatRate','20','priceBasis','net',
  'discountType','fixed','discountValue','100','reason','Discounted design agreement'));
select is((select row(amount,discount_amount,net_amount,vat_amount,gross_amount) from public.finance_project_current_terms where project_id=pg_temp.fid(30)),
  row(1000::numeric,100::numeric,900::numeric,180::numeric,1080::numeric),'terms snapshot provides discounted Net and VAT amounts');
select lives_ok($$select pg_temp.rec(100,'project_terms',pg_temp.result(90),'900','revenue',30)$$,'Net agreement value can be recognized');
select is((select row(amount,vat_amount,gross_amount) from public.finance_recognition_entries where id=pg_temp.result(100)),
  row(900::numeric,180::numeric,1080::numeric),'recognition stores Net, calculated VAT, and Gross separately');
select throws_like($$select pg_temp.rec(101,'project_terms',pg_temp.result(90),'0.01','revenue',30)$$,'%finance_recognition_over_source%','recognized income cannot exceed agreement Net');
select lives_ok($$select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(91),pg_temp.fid(30),jsonb_build_object(
  'stream','design','revision',1,'mode','design','amount','1400','currency','UAH','vatRate','20','priceBasis','net',
  'discountType','fixed','discountValue','100','reason','Amended value'))$$,'contract can be amended after partial recognition');
select throws_like($$select pg_temp.rec(102,'project_terms',pg_temp.result(91),'401','revenue',30)$$,'%finance_recognition_over_source%','later terms revisions share the existing project allowance');
select throws_like($$select pg_temp.rec(103,'project_terms',pg_temp.result(90),'1','revenue',30)$$,'%finance_recognition_source_invalid%','superseded legacy terms cannot be selected');
select ok(exists(select 1 from jsonb_array_elements(public.get_finance_recognition_sources(pg_temp.fid(1))) s where s->>'kind'='project_terms'),
  'admin source getter exposes the active agreement source');
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(95),pg_temp.fid(32),jsonb_build_object('stream','design','revision',0,
  'mode','design','amount','2000','currency','UAH','vatRate','20','priceBasis','net','reason','VAT example'));
select lives_ok($$select pg_temp.rec(96,'project_terms',pg_temp.result(95),'500','revenue',32)$$,'partial VAT-bearing terms recognized');
select is((select row(amount,vat_amount) from public.finance_recognition_entries where id=pg_temp.result(96)),row(500::numeric,100::numeric),'old terms retain their 20 percent VAT snapshot');
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(97),pg_temp.fid(32),jsonb_build_object('stream','design','revision',1,
  'mode','design','amount','2000','currency','UAH','vatRate','0','priceBasis','net','reason','VAT exemption'));
select lives_ok($$select pg_temp.rec(98,'project_terms',pg_temp.result(97),'500','revenue',32)$$,'remainder recognized under amended VAT terms');
select is((select row(amount,vat_amount) from public.finance_recognition_entries where id=pg_temp.result(98)),row(500::numeric,0::numeric),'remainder uses amended zero VAT while preserving prior VAT');
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(99),pg_temp.fid(32),jsonb_build_object('stream','design','revision',2,
  'mode','design','amount','2000','currency','UAH','vatRate','20','priceBasis','net','reason','VAT restored'));

-- One expected advance is income once; its late settlement remains Cash Flow only.
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(110),pg_temp.fid(30),jsonb_build_object('stream','design','useAgreementBasis',true,'item',jsonb_build_object(
  'direction','incoming','amount','300','currency','UAH','categoryId',pg_temp.cat('project_payments'),'description','Advance',
  'dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),'commitment','agreed','certainty','fixed','established',true)));
select is((select row(amount,net_amount,vat_amount) from public.finance_expected_items where id=pg_temp.result(110)),row(360::numeric,300::numeric,60::numeric),'advance carries the agreement VAT split');
select lives_ok($$select pg_temp.rec(111,'expected',pg_temp.result(110),'300','revenue',30)$$,'advance is recognized in its earned period');
select lives_ok($$select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(112),pg_temp.result(110),jsonb_build_object(
  'kind','incoming','date',pg_temp.today(),'amount','360','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('project_payments')),360)$$,'late cash settlement records without another recognition');
select is((select count(*) from public.finance_recognized_actuals where project_id=pg_temp.fid(30) and classification='revenue'),2::bigint,'only agreement and advance recognitions enter management income');
select is((select sum(amount) from public.finance_recognized_actuals where expected_item_id=pg_temp.result(110)),300::numeric,'settled advance contributes once at Net value');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),1::bigint,'late settlement creates one cash movement');

-- Only fixed, agreed operating expectations are eligible; recognition belongs to their economic dates.
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(120),jsonb_build_object('direction','outgoing','amount','100','currency','UAH',
  'categoryId',pg_temp.cat('rent'),'description','Agreed rent','dueDate',pg_temp.today(),'commitment','agreed','certainty','fixed'));
select lives_ok($$select pg_temp.rec(121,'expected',pg_temp.result(120),'100','overhead',null,jsonb_build_object('periodStart',pg_temp.month(0),'periodEnd',pg_temp.today()))$$,'agreed fixed unpaid expense recognizes to its economic period');
select is((select period_start from public.finance_recognition_entries where id=pg_temp.result(121)),pg_temp.month(0),'expense period is independent of cash due date');
select throws_like($$select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(163),jsonb_build_object('id',pg_temp.result(120),'version',1,
  'direction','outgoing','amount','101','currency','UAH','categoryId',pg_temp.cat('rent'),'description','Changed rent','dueDate',pg_temp.today(),
  'commitment','agreed','certainty','fixed','established',true))$$,'%finance_recognized_source_locked%','recognized expectation terms cannot be rewritten');
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(122),jsonb_build_object('direction','outgoing','amount','50','currency','UAH',
  'categoryId',pg_temp.cat('rent'),'description','Tentative rent','dueDate',pg_temp.today(),'commitment','tentative','certainty','fixed'));
select throws_like($$select pg_temp.rec(123,'expected',pg_temp.result(122),'50','overhead',null)$$,'%finance_recognition_source_invalid%','tentative expectation is excluded');
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(124),jsonb_build_object('direction','outgoing','amount','50','currency','UAH',
  'categoryId',pg_temp.cat('rent'),'description','Estimated rent','dueDate',pg_temp.today(),'commitment','agreed','certainty','estimated'));
select throws_like($$select pg_temp.rec(125,'expected',pg_temp.result(124),'50','overhead',null)$$,'%finance_recognition_source_invalid%','estimated expectation is excluded');
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(126),jsonb_build_object('direction','outgoing','amount','50','currency','UAH',
  'categoryId',pg_temp.cat('financing_out'),'description','Loan repayment','dueDate',pg_temp.today(),'commitment','agreed','certainty','fixed'));
select throws_like($$select pg_temp.rec(127,'expected',pg_temp.result(126),'50','overhead',null)$$,'%finance_recognition_source_invalid%','financing expectation is excluded');
select throws_like($$select pg_temp.rec(142,'expected',pg_temp.result(120),'1','overhead',null,jsonb_build_object('date',pg_temp.today()+1,'periodStart',pg_temp.month(1),'periodEnd',pg_temp.today()+1))$$,
  '%finance_input_invalid%','future economic periods cannot be recognized early');

-- Payroll and trip expectations retain their source identities and cannot be recognized again.
select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(128),jsonb_build_object('kind','payroll','employeeId',pg_temp.fid(11),
  'revision',0,'name','Payroll','amount','1000','currency','UAH','categoryId',pg_temp.cat('salary'),'basis','net',
  'employeePayout','1000','employeeDeductions','','employerCostStatus','unknown','intervalMonths',1,'payoutDay',1,'paymentMonthOffset',0,
  'effectiveFrom',pg_temp.month(),'commitment','agreed','certainty','fixed','reason','Payroll agreement'));
select public.generate_finance_obligations(pg_temp.fid(1),pg_temp.fid(129),pg_temp.result(128),pg_temp.month(),pg_temp.month());
select throws_like($$select pg_temp.rec(136,'expected',(select expected_item_id from public.finance_obligation_items limit 1),'1000','overhead',null)$$,
  '%finance_recognition_source_invalid%','payroll expectation is excluded from recognition');
select public.save_finance_trip(pg_temp.fid(1),pg_temp.fid(137),jsonb_build_object('title','Client visit','destination','Kyiv',
  'startsOn',pg_temp.today(),'endsOn',pg_temp.today(),'projectId',pg_temp.fid(30),'status','planned','travelers',jsonb_build_array(pg_temp.fid(11)::text)));
select public.record_finance_trip_entry(pg_temp.fid(1),pg_temp.fid(138),pg_temp.result(137),jsonb_build_object('kind','advance','expenseType','other',
  'label','Travel advance','amount','30','currency','UAH','date',pg_temp.today(),'employeeId',pg_temp.fid(11),'accountId',pg_temp.fid(20)));
select throws_like($$select pg_temp.rec(139,'expected',(select expected_item_id from public.finance_trip_entries where trip_id=pg_temp.result(137)),'30','overhead',null)$$,
  '%finance_recognition_source_invalid%','trip expectation is excluded from recognition');

-- A standalone operating movement may be recognized once, and cannot also be allocated as a second cost.
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(130),jsonb_build_object('kind','outgoing','date',pg_temp.today(),
  'accountId',pg_temp.fid(20),'amount','80','categoryId',pg_temp.cat('rent')));
select lives_ok($$select pg_temp.rec(131,'movement',pg_temp.movement(130),'80','overhead',null)$$,'standalone cash cost can enter recognition');
select is((select count(*) from public.finance_recognized_actuals where movement_id=pg_temp.movement(130)),1::bigint,'movement has one recognition');
select throws_like($$select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(132),pg_temp.result(120),pg_temp.movement(130),80)$$,
  '%finance_recognized_cash_source_locked%','recognized standalone cost cannot be matched to a second expectation');
select throws_like($$select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(164),pg_temp.movement(130),pg_temp.today(),'Reverse recognized cost')$$,
  '%finance_recognized_source_locked%','recognized cash cannot be reversed');

-- Source caps, request idempotency, corrections, and contra adjustments preserve audit history.
select throws_like($$select pg_temp.rec(121,'expected',pg_temp.result(120),'1','overhead',null)$$,'%finance_request_conflict%','changed request payload is rejected');
select lives_ok($$select pg_temp.rec(121,'expected',pg_temp.result(120),'100','overhead',null,jsonb_build_object('periodStart',pg_temp.month(0),'periodEnd',pg_temp.today()))$$,
  'recognition retry returns the original entry');
select is((select count(*) from public.finance_recognition_entries where expected_item_id=pg_temp.result(120)),1::bigint,'idempotent retry adds no duplicate recognition');
select throws_like($$select pg_temp.rec(133,'expected',pg_temp.result(120),'0.01','overhead',null)$$,'%finance_recognition_over_source%','repeated recognition cannot exceed source cap');
select lives_ok($$select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(134),pg_temp.result(121),jsonb_build_object('operation','adjustment',
  'amount','40','date',pg_temp.today(),'reason','Reduce estimated obligation'))$$,'contra adjustment can reduce an expense');
select is((select sum(amount) from public.finance_recognized_actuals where expected_item_id=pg_temp.result(120)),60::numeric,'contra adjustment reduces current economic expense');
select is((select count(*) from public.finance_recognition_entries where related_entry_id=pg_temp.result(121)),1::bigint,'adjustment is retained as linked immutable history');
select lives_ok($$select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(135),pg_temp.result(121),jsonb_build_object('operation','correction',
  'reason','Correct source classification','replacement',jsonb_build_object('sourceKind','expected','sourceId',pg_temp.result(120),'projectId',null,
  'classification','overhead','amount','100','date',pg_temp.today(),'periodStart',pg_temp.month(0),'periodEnd',pg_temp.today(),
  'description','Corrected expense','reason','Corrected source')))$$,'recognition can be corrected with reversal and replacement');
select is((select count(*) from public.finance_recognized_actuals where expected_item_id=pg_temp.result(120)),1::bigint,'correction replaces the active recognition exactly once');
select ok(not exists(select 1 from public.finance_recognized_actuals where id=pg_temp.result(121)),'reversed recognition is hidden from current actuals');

select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(165),jsonb_build_object('direction','outgoing','amount','50','currency','UAH',
  'categoryId',pg_temp.cat('rent'),'description','Expense later cancelled','dueDate',pg_temp.today(),'commitment','agreed','certainty','fixed'));
select pg_temp.rec(166,'expected',pg_temp.result(165),'50','overhead',null);
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(167),pg_temp.result(166),jsonb_build_object('operation','adjustment',
  'amount','10','date',pg_temp.today(),'reason','Reduce before cancellation'));
select lives_ok($$select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(168),pg_temp.result(166),jsonb_build_object('operation','cancel',
  'reason','Cancel after prior adjustment'))$$,'cancellation reverses prior adjustment and original recognition');
select is((select count(*) from public.finance_recognized_actuals where expected_item_id=pg_temp.result(165)),0::bigint,
  'cancelled recognition and adjustment leave no active actual');

-- Refund of an unused advance is not negative earned income; explicit reversal is separate.
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(140),pg_temp.fid(30),jsonb_build_object('stream','design','useAgreementBasis',true,'item',jsonb_build_object(
  'direction','incoming','amount','120','currency','UAH','categoryId',pg_temp.cat('project_payments'),'description','Unused advance',
  'commitment','agreed','certainty','fixed','established',true)));
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(141),pg_temp.result(140),jsonb_build_object('kind','incoming','date',pg_temp.today(),
  'amount','120','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('project_payments')),120);
select lives_ok($$select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(142),jsonb_build_object('kind','refund','date',pg_temp.today(),
  'accountId',pg_temp.fid(20),'amount','120','relatedMovementId',pg_temp.movement(141),'categoryId',pg_temp.cat('project_payments')))$$,'unused advance refund is recorded as cash');
select is((select count(*) from public.finance_recognized_actuals where expected_item_id=pg_temp.result(140)),0::bigint,'cash refund alone creates no negative recognized income');
select is((select sum(amount) from public.finance_recognized_actuals where classification='revenue'),2200::numeric,'refund does not reduce unrelated recognized income');

-- Split VAT to the currency cent, including the final residual slice.
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(170),pg_temp.fid(32),jsonb_build_object('stream','design','useAgreementBasis',true,'item',jsonb_build_object(
  'direction','incoming','amount','10','currency','UAH','categoryId',pg_temp.cat('project_payments'),'description','VAT thirds',
  'commitment','agreed','certainty','fixed','established',true)));
select lives_ok($$select pg_temp.rec(171,'expected',pg_temp.result(170),'3.33','revenue',32)$$,'first partial slice recognized');
select lives_ok($$select pg_temp.rec(172,'expected',pg_temp.result(170),'3.33','revenue',32)$$,'second partial slice recognized');
select lives_ok($$select pg_temp.rec(173,'expected',pg_temp.result(170),'3.34','revenue',32)$$,'final partial slice recognized');
select is((select row(sum(amount),sum(vat_amount),sum(gross_amount)) from public.finance_recognition_entries where expected_item_id=pg_temp.result(170)),
  row(10::numeric,2::numeric,12::numeric),'partial VAT slices conserve exact Net, VAT, and Gross totals');

-- Retained cancellation inherits the original expectation's already-recognized allowance.
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(174),pg_temp.fid(30),jsonb_build_object('stream','design','useAgreementBasis',true,'item',jsonb_build_object(
  'direction','incoming','amount','100','currency','UAH','categoryId',pg_temp.cat('project_payments'),'description','Partially paid source',
  'commitment','agreed','certainty','fixed','established',true)));
select lives_ok($$select pg_temp.rec(175,'expected',pg_temp.result(174),'50','revenue',30)$$,'original expectation partly recognized');
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(176),pg_temp.result(174),jsonb_build_object('kind','incoming','date',pg_temp.today(),
  'amount','20','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('project_payments')),20);
select public.cancel_finance_project_expectation(pg_temp.fid(1),pg_temp.fid(177),jsonb_build_object('itemId',pg_temp.result(174),'version',1,
  'settledAmount','20','retainSettlement',true,'reason','Retain paid portion'));
select throws_like($$select pg_temp.rec(178,'expected',pg_temp.result(177),'1','revenue',30)$$,'%finance_recognition_over_source%',
  'retained cancellation shares the original expected source cap');

-- Unresolved foreign-currency valuation can be completed once and historical values stay frozen.
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(150),jsonb_build_object('direction','outgoing','amount','10','currency','USD',
  'categoryId',pg_temp.cat('rent'),'description','Foreign rent','dueDate',pg_temp.today(),'commitment','agreed','certainty','fixed'));
select lives_ok($$select pg_temp.rec(151,'expected',pg_temp.result(150),'10','overhead',null)$$,'foreign recognition can remain unvalued');
select is((select reporting_amount from public.finance_recognition_entries where id=pg_temp.result(151)),null::numeric,'missing FX remains visibly unresolved');
select lives_ok($$select public.value_finance_recognition(pg_temp.fid(1),pg_temp.result(151),jsonb_build_object('rate','40','source','manual','effectiveDate',pg_temp.today()))$$,'unresolved historical valuation can be completed');
select is((select reporting_amount from public.finance_recognition_entries where id=pg_temp.result(151)),400::numeric,'completion stores reporting value');
select throws_like($$select public.value_finance_recognition(pg_temp.fid(1),pg_temp.result(151),jsonb_build_object('rate','41','source','manual','effectiveDate',pg_temp.today()))$$,'%finance_valuation_locked%','resolved historical FX cannot be changed');
select throws_like($$update public.finance_recognition_entries set amount=11 where id=pg_temp.result(151)$$,'%permission denied%','clients cannot directly change economic recognition facts');

-- Management tables and RPCs are finance-admin only and deny direct writes.
select throws_like($$insert into public.finance_recognition_entries(studio_id,classification,source_kind,category_id,source_snapshot,period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,reason,created_by)
  values(pg_temp.fid(1),'overhead','movement',pg_temp.cat('rent'),'{}',pg_temp.month(0),pg_temp.today(),pg_temp.today(),'Direct','UAH',1,0,1,'UAH','Direct',pg_temp.fid(10))$$,'%permission denied%','direct recognition inserts are denied');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select is((select count(*) from public.finance_recognition_entries),0::bigint,'employees cannot read management recognition');
select throws_like($$select pg_temp.rec(160,'expected',pg_temp.result(120),'1','overhead',null)$$,'%finance_admin_required%','employees cannot recognize');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select is((select count(*) from public.finance_recognition_entries),0::bigint,'another studio cannot read recognition');
select throws_like($$select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(161),'{}')$$,'%finance_admin_required%','cross-studio recognition is denied');
select set_config('request.jwt.claim.sub',pg_temp.fid(13)::text,true);
select throws_like($$select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(162),'{}')$$,'%finance_admin_required%','inactive admin cannot recognize');

select * from finish();
rollback;
