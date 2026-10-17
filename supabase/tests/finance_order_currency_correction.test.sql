begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('79000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month() returns date language sql stable as $$select date_trunc('month',pg_temp.today())::date$$;
create function pg_temp.result(n integer) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.cat() returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='project_payments'$$;
create function pg_temp.item(n integer) returns uuid language sql as $$select id from public.finance_project_plan_items where order_id=pg_temp.fid(n) order by amount limit 1$$;
create function pg_temp.input(n integer,patch jsonb default '{}') returns jsonb language sql as $$select jsonb_build_object(
  'orderId',pg_temp.fid(n),'version',(select version from public.finance_project_orders where id=pg_temp.fid(n)),
  'termsId',(select id from public.finance_project_current_terms where order_id=pg_temp.fid(n)),
  'currency','USD','reason','Correct mistaken original denomination','confirmed',true,
  'known',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',version) order by id) from public.finance_project_plan_items where order_id=pg_temp.fid(n)),'[]'::jsonb))||patch$$;
create function pg_temp.correct(request integer,n integer,patch jsonb default '{}') returns uuid language sql as $$
  select public.correct_finance_project_order_currency(pg_temp.fid(1),pg_temp.fid(request),pg_temp.fid(30),pg_temp.input(n,patch))$$;

insert into public.studios(id,name) values(pg_temp.fid(1),'Currency corrections A'),(pg_temp.fid(2),'Currency corrections B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','currency-correction-'||n||'@test','{}','{}',now(),now() from generate_series(10,12)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Currency tester','currency-correction-'||n||'@test',case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=12 then 2 else 1 end),pg_temp.fid(n),case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'UAH',pg_temp.month(),pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',0,pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values(pg_temp.fid(21),pg_temp.fid(1),'Dollar bank','USD',0,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values(pg_temp.fid(30),pg_temp.fid(1),'Currency correction project',100,pg_temp.month(),pg_temp.fid(10),'active');
insert into public.finance_project_orders(id,studio_id,project_id,name,is_default,status,created_by,updated_by,confirmed_at)
select pg_temp.fid(n),pg_temp.fid(1),pg_temp.fid(30),'Order '||n,n=40,'confirmed',pg_temp.fid(10),pg_temp.fid(10),now() from generate_series(40,45)n;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(80),pg_temp.month());
select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(100+n),pg_temp.fid(30),jsonb_build_object(
  'orderId',pg_temp.fid(n),'revision',0,'pricingMethod','area','area','100','rate',case when n=45 then '80.0001' else '80' end,'amount',case when n=45 then '8000.01' else '8000' end,'currency','UAH',
  'vatRate','20','priceBasis','net','discountType','percentage','discountValue','10','revenueTaxRate','6','reason','Agreed services',
  'known','[]'::jsonb,'items',jsonb_build_array(
    jsonb_build_object('name','Advance','amount','2160','percentage','30','dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),'clientNote','Invoice instructions'),
    jsonb_build_object('name','Milestone','amount','3600','percentage','50','dueDate',pg_temp.today()+14,'expectedDate',pg_temp.today()+15),
    jsonb_build_object('name','Final','amount',case when n=45 then '1440.01' else '1440' end,'percentage','20','dueDate',pg_temp.today()+30,'expectedDate',pg_temp.today()+32)))) from generate_series(40,45)n;
create temporary table before_items as select * from public.finance_expected_items where id in (select id from public.finance_project_plan_items where order_id=pg_temp.fid(40));
create temporary table before_links as select * from public.finance_project_items;
create temporary table before_terms as select * from public.finance_project_terms;
create temporary table before_plans as select * from public.finance_project_plan_revisions;
create temporary table before_orders as select * from public.finance_project_orders;
create temporary table correction_request as select pg_temp.input(40) as payload;

select throws_like($$select pg_temp.correct(200,40,'{"confirmed":false}')$$,'%finance_input_invalid%','explicit confirmation required');
select throws_like($$select pg_temp.correct(201,40,'{"reason":" "}')$$,'%finance_input_invalid%','amendment reason required');
select throws_like($$select pg_temp.correct(202,40,'{"version":0}')$$,'%finance_version_conflict%','stale order rejected');
select throws_like($$select pg_temp.correct(203,40,'{"termsId":"79000000-0000-4000-8000-000000000999"}')$$,'%finance_version_conflict%','stale terms rejected');
select throws_like($$select pg_temp.correct(204,40,'{"known":[]}')$$,'%finance_version_conflict%','stale schedule rejected');
select lives_ok($$select public.correct_finance_project_order_currency(pg_temp.fid(1),pg_temp.fid(210),pg_temp.fid(30),(select payload from correction_request))$$,'unpaid confirmed multi-installment order can correct original currency');
select is((select row(amount,currency,discount_type,discount_value,discount_amount,vat_rate,price_basis,net_amount,vat_amount,gross_amount,revenue_tax_rate)
  from public.finance_project_current_terms where order_id=pg_temp.fid(40)),row(8000::numeric,'USD'::text,'percentage'::text,10::numeric,800::numeric,20::numeric,'net'::text,7200::numeric,1440::numeric,8640::numeric,6::numeric),'nominal value, VAT, discount and revenue tax semantics preserved');
select results_eq($$select to_jsonb(e)-array['currency','version','updated_at'] from public.finance_expected_items e join before_items b on b.id=e.id order by e.id$$,
  $$select to_jsonb(b)-array['currency','version','updated_at'] from before_items b order by b.id$$,'payment identities, proportions, amounts, dates and all unrelated fields unchanged');
select ok((select bool_and(e.currency='USD' and e.version=b.version+1) from public.finance_expected_items e join before_items b on b.id=e.id),'all installments adopt corrected currency with incremented versions');
select is((select count(*) from public.finance_project_plan_items where order_id=pg_temp.fid(40)),3::bigint,'no duplicate schedule rows');
select is((select row(contract_amount,scheduled_amount,planned_amount,outstanding_amount) from public.finance_project_order_totals where order_id=pg_temp.fid(40)),row(8640::numeric,8640::numeric,6048::numeric,2592::numeric),'project finance preserves established and future obligation semantics');
select ok(exists(select 1 from jsonb_array_elements(public.get_finance_project_reporting(pg_temp.fid(1))->'contracts') c
  where c->>'order_id'=pg_temp.fid(40)::text and c->>'currency'='USD' and (c->>'net_amount')::numeric=7200),'reporting source exposes corrected VAT-exclusive currency and amount');
select results_eq($$select * from public.finance_project_items order by expected_item_id$$,$$select * from before_links order by expected_item_id$$,'immutable payment source ownership preserved');
select results_eq($$select t.* from public.finance_project_terms t join before_terms b on b.id=t.id order by t.id$$,$$select * from before_terms order by id$$,'original agreement history immutable');
select results_eq($$select p.* from public.finance_project_plan_revisions p join before_plans b on b.terms_id=p.terms_id order by p.terms_id$$,$$select * from before_plans order by terms_id$$,'original plan revisions immutable');
select is((select row(pricing_method,area_snapshot,rate_per_m2) from public.finance_project_plan_revisions where terms_id=pg_temp.result(210)),row('area'::text,100::numeric,80::numeric),'area pricing copied without changing rate');
select results_eq($$select to_jsonb(o)-array['version','updated_at','updated_by'] from public.finance_project_orders o where id=pg_temp.fid(40)$$,
  $$select to_jsonb(o)-array['version','updated_at','updated_by'] from before_orders o where id=pg_temp.fid(40)$$,'order name, confirmation lifecycle and draft snapshot preserved');
select results_eq($$select o.* from public.finance_project_orders o where id<>pg_temp.fid(40) order by id$$,$$select * from before_orders where id<>pg_temp.fid(40) order by id$$,'unrelated orders unchanged');
select is(public.correct_finance_project_order_currency(pg_temp.fid(1),pg_temp.fid(210),pg_temp.fid(30),(select payload from correction_request)),pg_temp.result(210),'identical retry remains idempotent after version changes');
select is((select count(*) from public.finance_project_terms where order_id=pg_temp.fid(40)),2::bigint,'retry creates no duplicate amendment');
select throws_like($$select public.correct_finance_project_order_currency(pg_temp.fid(1),pg_temp.fid(210),pg_temp.fid(30),(select payload||'{"currency":"EUR"}' from correction_request))$$,'%finance_request_conflict%','different retry rejected');

select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(300),jsonb_build_object('kind','incoming','date',pg_temp.today(),'accountId',pg_temp.fid(20),'amount','100','categoryId',pg_temp.cat()));
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(301),pg_temp.item(41),(select id from public.finance_movements where request_id=pg_temp.fid(300)),100);
select throws_like($$select pg_temp.correct(302,41)$$,'%finance_order_currency_allocation_history%','allocated payment blocks currency reinterpretation');
select public.release_finance_allocation(pg_temp.fid(1),pg_temp.fid(303),pg_temp.result(301),'Wrong match');
select throws_like($$select pg_temp.correct(304,41)$$,'%finance_order_currency_allocation_history%','released allocation remains protected history');
-- Isolate the closure guard for inherited non-cash history without allocations.
reset role;
insert into public.finance_settlement_adjustments(id,studio_id,expected_item_id,amount,currency,financial_date,reason,explanation,created_by)
values(pg_temp.fid(310),pg_temp.fid(1),pg_temp.item(42),1728,'UAH',pg_temp.today(),'client_agreement','Historical closure',pg_temp.fid(10));
set local role authenticated;
select throws_like($$select pg_temp.correct(311,42)$$,'%finance_order_currency_closure_history%','non-cash closure blocks correction');
select public.reverse_finance_settlement_adjustment(pg_temp.fid(1),pg_temp.fid(312),pg_temp.fid(310),pg_temp.today(),'Reopen remainder');
select throws_like($$select pg_temp.correct(313,42)$$,'%finance_order_currency_closure_history%','reversed closure remains protected history');
select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(320),jsonb_build_object('sourceKind','expected','sourceId',pg_temp.item(43),
  'classification','revenue','projectId',pg_temp.fid(30),'amount','100','date',pg_temp.today(),'periodStart',pg_temp.month(),'periodEnd',pg_temp.today(),'description','Earned services','reason','Reviewed services'));
select throws_like($$select pg_temp.correct(321,43)$$,'%finance_order_currency_recognition_history%','expected-source recognition blocks correction');
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(322),pg_temp.result(320),jsonb_build_object('operation','cancel','reason','Cancel recognition'));
select throws_like($$select pg_temp.correct(323,43)$$,'%finance_order_currency_recognition_history%','reversed recognition remains protected history');
select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(330),jsonb_build_object('sourceKind','project_terms',
  'sourceId',(select id from public.finance_project_current_terms where order_id=pg_temp.fid(44)),
  'classification','revenue','projectId',pg_temp.fid(30),'amount','100','date',pg_temp.today(),'periodStart',pg_temp.month(),'periodEnd',pg_temp.today(),'description','Earned services','reason','Reviewed services'));
select throws_like($$select pg_temp.correct(331,44)$$,'%finance_order_currency_recognition_history%','terms-source recognition blocks correction');
select is((select count(*) from public.finance_project_terms),7::bigint,'blocked operations append no agreement revisions');
select is((select currency from public.finance_project_current_terms where order_id=pg_temp.fid(41)),'UAH','blocked payment order retains its original denomination');
select is((select e.amount from public.finance_movement_entries e join public.finance_movements m on m.id=e.movement_id where m.request_id=pg_temp.fid(300) and e.entry_role='primary'),100::numeric,'cash history untouched');
select throws_like($$select pg_temp.correct(340,45,'{"currency":"XXX"}')$$,'%finance_input_invalid%','unsupported currency rejected');
select throws_like($$select pg_temp.correct(341,45,'{"currency":"UAH"}')$$,'%finance_input_invalid%','same denomination is not a correction');
select throws_like($$select pg_temp.correct(342,45,'{"currency":"JPY"}')$$,'%finance_order_currency_precision%','currency requiring nominal rounding is rejected');
select public.record_finance_project_payment(pg_temp.fid(1),pg_temp.fid(343),pg_temp.fid(30),pg_temp.item(45),
  jsonb_build_object('kind','incoming','date',pg_temp.today(),'accountId',pg_temp.fid(21),'amount','0.01','categoryId',pg_temp.cat(),
    'fx',jsonb_build_object('rate','40','source','manual','effectiveDate',pg_temp.today()),
    'settlementFx',jsonb_build_object('rate','0.0001','source','manual','effectiveDate',pg_temp.today())),
  '[]'::jsonb,jsonb_build_object('orderId',pg_temp.fid(45),'planRevisionId',(select id from public.finance_project_current_terms where order_id=pg_temp.fid(45)),
    'items',(select jsonb_agg(jsonb_build_object('itemId',id,'version',version,'remaining',remaining_amount::text)) from public.finance_project_expected_balances where order_id=pg_temp.fid(45))));
select ok(not exists(select 1 from public.finance_allocations a join public.finance_project_items i on i.expected_item_id=a.expected_item_id where i.order_id=pg_temp.fid(45)),
  'zero-converted project receipt has no positive allocation');
select throws_like($$select pg_temp.correct(344,45)$$,'%finance_order_currency_allocation_history%','order-linked cash without allocations also blocks correction');

reset role;
insert into public.finance_project_orders(id,studio_id,project_id,name,status,created_by,updated_by,confirmed_at)
values(pg_temp.fid(46),pg_temp.fid(1),pg_temp.fid(30),'Unscheduled fixed discount','confirmed',pg_temp.fid(10),pg_temp.fid(10),now());
set local role authenticated;
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(346),pg_temp.fid(30),jsonb_build_object('orderId',pg_temp.fid(46),
  'stream','design','revision',0,'mode','design','amount','8000','currency','UAH','discountType','fixed','discountValue','100','reason','Agreement without schedule'));
select lives_ok($$select pg_temp.correct(347,46)$$,'unpaid unscheduled agreement can also be corrected');
select is((select row(amount,currency,discount_type,discount_value,discount_amount,net_amount,gross_amount,vat_rate) from public.finance_project_current_terms where order_id=pg_temp.fid(46)),
  row(8000::numeric,'USD'::text,'fixed'::text,100::numeric,100::numeric,7900::numeric,7900::numeric,null::numeric),'fixed nominal discount and absence of VAT preserved');
select throws_like($$select public.correct_finance_project_order_currency(pg_temp.fid(2),pg_temp.fid(350),pg_temp.fid(30),pg_temp.input(45))$$,'%finance_admin_required%','cross-studio correction denied');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select pg_temp.correct(351,45)$$,'%finance_admin_required%','employee correction denied');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select throws_like($$select pg_temp.correct(352,45)$$,'%finance_admin_required%','foreign admin correction denied');
select * from finish();
rollback;
