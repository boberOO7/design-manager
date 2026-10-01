begin;
select no_plan();
create function pg_temp.did(n integer) returns uuid language sql immutable as $$select ('69000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.did(1),'Discount test');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.did(10),'authenticated','authenticated','discount@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active) values(pg_temp.did(10),'Discount admin','discount@test','admin',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active) values(pg_temp.did(1),pg_temp.did(10),'admin',true);
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.did(1),'USD','2026-01-01',pg_temp.did(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values(pg_temp.did(20),pg_temp.did(1),'USD bank','USD',0,pg_temp.did(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
select pg_temp.did(n),pg_temp.did(1),'336 Discount project',100,'2026-09-01',pg_temp.did(10),'active' from generate_series(30,35)n;
create function pg_temp.terms(n integer,project integer,patch jsonb default '{}') returns uuid language sql as $$
select public.save_finance_project_terms(pg_temp.did(1),pg_temp.did(n),pg_temp.did(project),jsonb_build_object('stream','design','revision',0,'mode','design','amount','10560','currency','USD','vatRate','23','priceBasis','net','discountType','percentage','discountValue','10','revenueTaxRate','6','reason','Discount agreement')||patch)$$;
create function pg_temp.save_proposal(source jsonb) returns uuid language sql security definer set search_path='' as $$
select public.save_finance_project_proposal(pg_temp.did(1),pg_temp.did(30),pg_temp.did(200),source,
jsonb_build_object('projectTitle',source->>'projectTitle','clientName',source->>'clientName','contact',source->>'contact','address',source->>'address','intro',''), 'JVBERi0=',pg_temp.did(10))$$;
select set_config('request.jwt.claim.sub',pg_temp.did(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.did(1));
select lives_ok($$select pg_temp.terms(100,31)$$,'percentage discount before excluded VAT');
select is((select row(amount,discount_amount,net_amount,vat_amount,gross_amount) from public.finance_project_current_terms where project_id=pg_temp.did(31)),
row(10560::numeric,1056::numeric,9504::numeric,2185.92::numeric,11689.92::numeric),'list / discount / discounted net / VAT / client gross');
select is((select round(net_amount*revenue_tax_rate/100,2) from public.finance_project_current_terms where project_id=pg_temp.did(31)),570.24::numeric,'revenue estimate uses discounted Net');
select lives_ok($$select pg_temp.terms(101,32,'{"amount":"12988.80","priceBasis":"gross"}')$$,'discount before extracting included VAT');
select is((select row(net_amount,vat_amount,gross_amount) from public.finance_project_current_terms where project_id=pg_temp.did(32)),
row(9504::numeric,2185.92::numeric,11689.92::numeric),'included and excluded percentage paths agree');
select lives_ok($$select pg_temp.terms(102,33,'{"discountType":"fixed","discountValue":"1056"}')$$,'fixed discount in contract currency');
select is((select row(discount_amount,net_amount,vat_amount,gross_amount) from public.finance_project_current_terms where project_id=pg_temp.did(33)),
row(1056::numeric,9504::numeric,2185.92::numeric,11689.92::numeric),'fixed discount reduces VAT taxable base');
select lives_ok($$select pg_temp.terms(103,34,'{"amount":"12988.80","priceBasis":"gross","discountType":"fixed","discountValue":"1298.88"}')$$,'fixed Gross discount with included VAT');
select is((select row(net_amount,vat_amount,gross_amount) from public.finance_project_current_terms where project_id=pg_temp.did(34)),row(9504::numeric,2185.92::numeric,11689.92::numeric),'Gross fixed discount extracts discounted VAT');
select throws_like($$select pg_temp.terms(104,35,'{"discountValue":"100"}')$$,'%finance_project_discount_invalid%','existing positive agreement rule excludes a zero contract');
select throws_like($$select pg_temp.terms(104,35,'{"discountValue":"-1"}')$$,'%finance_project_discount_invalid%','negative discount rejected');
select throws_like($$select pg_temp.terms(104,35,'{"discountType":"fixed","discountValue":"0.001"}')$$,'%finance_project_discount_invalid%','fixed currency precision enforced');
select throws_like($$select pg_temp.terms(104,35,'{"discountType":"none","discountValue":"10"}')$$,'%finance_project_discount_invalid%','no discount cannot hide a value');
select public.save_finance_project_plan(pg_temp.did(1),pg_temp.did(110),pg_temp.did(30),jsonb_build_object(
'revision',0,'pricingMethod','area','area','100','rate','10','amount','1000','currency','USD','vatRate','23','priceBasis','net','reason','Original plan','allowUnscheduled',false,'known','[]'::jsonb,
'items',jsonb_build_array(jsonb_build_object('id','','name','Advance','percentage','30','amount','300','dueDate','','expectedDate',''),jsonb_build_object('id','','name','Visualization','percentage','50','amount','500','dueDate','','expectedDate',''),jsonb_build_object('id','','name','Documentation','percentage','20','amount','200','dueDate','','expectedDate',''))));
select is((select row(discount_type,discount_value,discount_amount,amount,gross_amount) from public.finance_project_current_terms where project_id=pg_temp.did(30)),
row('none'::text,0::numeric,0::numeric,1000::numeric,1230::numeric),'existing callers without discount retain monetary values');
select pg_temp.save_proposal(public.get_finance_proposal_source(pg_temp.did(1),pg_temp.did(30)));
create temporary table frozen_proposal as select snapshot,pdf from public.finance_project_proposals where project_id=pg_temp.did(30);
select public.record_finance_expected_payment(pg_temp.did(1),pg_temp.did(120),(select id from public.finance_project_plan_items where project_id=pg_temp.did(30) and description='Advance'),
jsonb_build_object('kind','incoming','date','2026-09-30','amount','1','accountId',pg_temp.did(20),'categoryId',(select id from public.finance_categories where studio_id=pg_temp.did(1) and default_key='project_payments')),1);
create temporary table frozen_payment as select * from public.finance_expected_items where id in(select id from public.finance_project_plan_items where project_id=pg_temp.did(30) and has_settlement_history);
create temporary table frozen_allocations as select * from public.finance_allocations;
create temporary table frozen_movements as select * from public.finance_movements;
create temporary table original_terms as select * from public.finance_project_terms where project_id=pg_temp.did(30);
select lives_ok($$select public.save_finance_project_plan(pg_temp.did(1),pg_temp.did(111),pg_temp.did(30),jsonb_build_object(
'revision',1,'pricingMethod','area','area','100','rate','10','amount','1000','currency','USD','vatRate','23','priceBasis','net','discountType','percentage','discountValue','10','reason','Agreed discount','allowUnscheduled',false,
'known',(select jsonb_agg(jsonb_build_object('id',id,'version',version,'protected',has_settlement_history) order by id) from public.finance_project_plan_items where project_id=pg_temp.did(30)),
'items',(select jsonb_agg(jsonb_build_object('id',id,'name',description,'amount',case when description='Visualization' then '450' else '150' end,'dueDate','','expectedDate','')) from public.finance_project_plan_items where project_id=pg_temp.did(30) and not has_settlement_history)))$$,'discount updates only unpaid schedule while protecting whole historical payment');
select is((select row(contract_net_amount,contract_vat_amount,contract_gross_amount,scheduled_amount,collected_amount) from public.finance_project_totals where project_id=pg_temp.did(30)),row(900::numeric,207::numeric,1107::numeric,1107::numeric,1::numeric),'discounted contract and Gross schedule close with old protected row');
select results_eq($$select to_jsonb(e)-'schedule_percentage' from public.finance_expected_items e where id in(select id from frozen_payment)$$,$$select to_jsonb(e)-'schedule_percentage' from frozen_payment e$$,'protected payment unchanged; existing amendment trigger only refreshes its derived share');
select results_eq($$select * from public.finance_allocations$$,$$select * from frozen_allocations$$,'settlement composition unchanged');
select results_eq($$select * from public.finance_movements$$,$$select * from frozen_movements$$,'discount creates no ledger movement');
select results_eq($$select * from public.finance_project_terms where id in(select id from original_terms)$$,$$select * from original_terms$$,'original list and agreement revision unchanged');
select results_eq($$select snapshot,pdf from public.finance_project_proposals where project_id=pg_temp.did(30)$$,$$select snapshot,pdf from frozen_proposal$$,'discount edit cannot change historical proposal or PDF');
select is(public.get_finance_proposal_source(pg_temp.did(1),pg_temp.did(30))->'pricing',jsonb_build_object('listAmount','1000','priceBasis','net','discountType','percentage','discountValue','10','discountAmount','100.00','agreedAmount','900.00','net','900.00','listGross','1230.00','discountGross','123.00'),'new proposal allowlists complete discounted price snapshot');
select ok(not(public.get_finance_proposal_source(pg_temp.did(1),pg_temp.did(30))::text like '%revenueTax%'),'proposal omits internal revenue tax');
select throws_like($$update public.finance_project_terms set discount_value=20$$,'%permission denied%','direct terms discount edits denied');
reset role;
select * from finish();
rollback;
