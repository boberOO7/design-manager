begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('67000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'VAT studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','vat-'||n||'@test','{}','{}',now(),now() from generate_series(10,11)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'VAT tester','vat-'||n||'@test',case when n=10 then 'admin' else 'employee' end,true from generate_series(10,11)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(1),pg_temp.fid(n),case when n=10 then 'admin' else 'employee' end,true from generate_series(10,11)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'USD','2026-01-01',pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
values(pg_temp.fid(20),pg_temp.fid(1),'USD bank','USD',0,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
select pg_temp.fid(n),pg_temp.fid(1),'VAT project '||n,100,'2026-09-01',pg_temp.fid(10),'active' from generate_series(30,37)n;
create function pg_temp.cat() returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='project_payments'$$;
create function pg_temp.result(n integer) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.movement(n integer) returns uuid language sql as $$select id from public.finance_movements where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));

select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(100),pg_temp.fid(30),
  jsonb_build_object('stream','design','revision',0,'mode','design','amount','4000','currency','USD',
    'vatRate','23','priceBasis','net','revenueTaxRate','6','reason','Net agreement'));
select is((select row(net_amount,vat_amount,gross_amount) from public.finance_project_terms where id=pg_temp.result(100)),
  row(4000::numeric,920::numeric,4920::numeric),'4000 net at 23% yields 920 VAT and 4920 gross');
select is((select row(revenue_tax_rate,round(net_amount*revenue_tax_rate/100,2))
  from public.finance_project_terms where id=pg_temp.result(100)),
  row(6::numeric,240::numeric),'revenue tax is a separate 6% estimate of net 4000');
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(101),pg_temp.fid(31),
  jsonb_build_object('stream','design','revision',0,'mode','design','amount','4000','currency','USD',
    'vatRate','23','priceBasis','gross','reason','Gross agreement'));
select is((select row(net_amount,vat_amount,gross_amount) from public.finance_project_terms where id=pg_temp.result(101)),
  row(3252.03::numeric,747.97::numeric,4000::numeric),'4000 gross at 23% yields 3252.03 net and 747.97 VAT');
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(102),pg_temp.fid(32),
  jsonb_build_object('stream','design','revision',0,'mode','design','amount','4000','currency','USD','revenueTaxRate','6','reason','Legacy basis'));
select is((select row(vat_rate,price_basis,net_amount,vat_amount,gross_amount) from public.finance_project_terms where id=pg_temp.result(102)),
  row(null::numeric,null::text,4000::numeric,0::numeric,4000::numeric),'VAT N/A preserves entered contract exactly');
select is((select row(revenue_tax_rate,round(net_amount*revenue_tax_rate/100,2),net_amount-round(net_amount*revenue_tax_rate/100,2))
  from public.finance_project_terms where id=pg_temp.result(102)),
  row(6::numeric,240::numeric,3760::numeric),'no-VAT project estimates 240 revenue tax and 3760 after tax');

select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(110),pg_temp.fid(30),jsonb_build_object(
  'stream','design','useAgreementBasis',true,'item',jsonb_build_object('direction','incoming','amount','4000','currency','USD',
    'categoryId',pg_temp.cat(),'description','Project invoice','dueDate','2026-09-20','expectedDate','2026-09-20',
    'commitment','agreed','certainty','fixed','established',true)));
select is((select row(amount,net_amount,vat_amount,vat_rate,price_basis) from public.finance_expected_items where id=pg_temp.result(110)),
  row(4920::numeric,4000::numeric,920::numeric,23::numeric,'net'::text),'Expected stores gross cash and immutable obligation VAT composition');
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(111),pg_temp.fid(31),jsonb_build_object(
  'stream','design','useAgreementBasis',true,'item',jsonb_build_object('direction','incoming','amount','4000','currency','USD',
    'categoryId',pg_temp.cat(),'description','Gross invoice','commitment','agreed','certainty','fixed','established',true)));
select is((select row(amount,net_amount,vat_amount) from public.finance_expected_items where id=pg_temp.result(111)),
  row(4000::numeric,3252.03::numeric,747.97::numeric),'gross-basis schedule stores exact client receivable and net revenue');
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(112),pg_temp.fid(32),jsonb_build_object(
  'stream','design','useAgreementBasis',true,'item',jsonb_build_object('direction','incoming','amount','4000','currency','USD',
    'categoryId',pg_temp.cat(),'description','Untaxed invoice','commitment','agreed','certainty','fixed','established',true)));
select is((select row(amount,net_amount,vat_amount) from public.finance_expected_items where id=pg_temp.result(112)),
  row(4000::numeric,4000::numeric,0::numeric),'VAT N/A Expected preserves existing monetary value');
select is((select count(*) from public.finance_project_items p join public.finance_expected_items e on e.id=p.expected_item_id
  where p.project_id=pg_temp.fid(32) and e.direction='outgoing'),0::bigint,
  'revenue-tax estimate creates no Expected expense');

select is((select row(contract_net_amount,contract_vat_amount,contract_gross_amount,scheduled_amount,outstanding_amount)
  from public.finance_project_totals where project_id=pg_temp.fid(30)),
  row(4000::numeric,920::numeric,4920::numeric,4920::numeric,4920::numeric),'project summary separates revenue, VAT and receivable');
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(103),pg_temp.fid(30),
  jsonb_build_object('stream','design','revision',1,'mode','design','amount','5000','currency','USD',
    'vatRate','8','priceBasis','net','reason','New VAT rate'));
select is((select row(amount,net_amount,vat_amount,vat_rate) from public.finance_expected_items where id=pg_temp.result(110)),
  row(4920::numeric,4000::numeric,920::numeric,23::numeric),'amendment leaves prior Expected gross and VAT untouched');
select is((select array_agg(revenue_tax_rate order by revision) from public.finance_project_terms where project_id=pg_temp.fid(30)),
  array[6,null]::numeric[],'revenue-tax estimate stays on its original agreement revision');

select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(200),pg_temp.result(110),
  jsonb_build_object('kind','incoming','date','2026-07-20','amount','4920','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),4920);
select is((select row(amount,net_amount,vat_amount) from public.finance_allocations where movement_id=pg_temp.movement(200) and amount>0),
  row(4920::numeric,4000::numeric,920::numeric),'settlement stores net and VAT in obligation currency');
select is((select sum(vat_reporting_amount) from public.finance_project_vat_actuals where studio_id=pg_temp.fid(1)),920::numeric,
  'P&L VAT adjustment is separate from gross cash actual');
select is((select sum(amount) from public.finance_planning_actuals where studio_id=pg_temp.fid(1) and direction='incoming'),4920::numeric,
  'Cash Flow actual remains gross');
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(104),pg_temp.fid(30),
  jsonb_build_object('stream','design','revision',2,'mode','design','amount','6000','currency','USD',
    'vatRate','20','priceBasis','net','reason','After settlement'));
select is((select row(amount,net_amount,vat_amount) from public.finance_allocations where movement_id=pg_temp.movement(200) and amount>0),
  row(4920::numeric,4000::numeric,920::numeric),'later amendment cannot revalue settled allocation');

select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(201),
  jsonb_build_object('kind','refund','date','2026-08-21','amount','1230','accountId',pg_temp.fid(20),
    'relatedMovementId',pg_temp.movement(200),'categoryId',pg_temp.cat()));
select is((select row(amount,net_amount,vat_amount) from public.finance_allocations where cause_movement_id=pg_temp.movement(201)),
  row(-1230::numeric,-1000::numeric,-230::numeric),'partial refund reverses original net/VAT/gross proportions');
select is((select sum(vat_reporting_amount) from public.finance_project_vat_actuals where studio_id=pg_temp.fid(1)),690::numeric,
  'refunded VAT is removed from net revenue while cash stays gross');
select is((select row(collected_amount,collected_net_amount,collected_vat_amount) from public.finance_project_totals where project_id=pg_temp.fid(30)),
  row(3690::numeric,3000::numeric,690::numeric),'paid summary follows effective net/VAT allocation after refund');
select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(202),pg_temp.movement(201),'2026-09-22','Undo refund');
select is((select sum(vat_reporting_amount) from public.finance_project_vat_actuals where studio_id=pg_temp.fid(1)),920::numeric,
  'refund reversal restores originating VAT composition');
select is((select array_agg(vat_reporting_amount order by financial_date) from public.finance_project_vat_actuals
  where studio_id=pg_temp.fid(1) and financial_date in ('2026-07-20','2026-08-21','2026-09-22')),
  array[920,-230,230]::numeric[],'refund and reversal VAT follow their actual cash months');
select is((select row(amount,net_amount,vat_amount,vat_rate) from public.finance_expected_items where id=pg_temp.result(110)),
  row(4920::numeric,4000::numeric,920::numeric,23::numeric),'cash reversal does not rewrite Expected snapshot');
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(212),pg_temp.result(110),pg_temp.movement(200),1230);
select is((select sum(vat_reporting_amount) from public.finance_project_vat_actuals where studio_id=pg_temp.fid(1)),920::numeric,
  'reallocation replaces refund-reversal VAT instead of counting it twice');
select is((select row(collected_amount,collected_net_amount,collected_vat_amount) from public.finance_project_totals where project_id=pg_temp.fid(30)),
  row(4920::numeric,4000::numeric,920::numeric),'reallocated cash uses the original obligation snapshot');
select is((select array_agg(vat_reporting_amount order by financial_date) from public.finance_project_vat_actuals
  where studio_id=pg_temp.fid(1) and financial_date in ('2026-07-20','2026-08-21','2026-09-22')),
  array[920,-230,230]::numeric[],'reallocation keeps restored VAT in the reversal month');

-- Obligation VAT stays in USD when a EUR account pays through frozen settlement FX.
reset role;
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
values(pg_temp.fid(21),pg_temp.fid(1),'EUR bank','EUR',0,pg_temp.fid(10));
set local role authenticated;
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(203),pg_temp.result(111),
  jsonb_build_object('kind','incoming','date','2026-09-23','amount','100','accountId',pg_temp.fid(21),'categoryId',pg_temp.cat(),
    'fx',jsonb_build_object('rate','1.2','source','manual','effectiveDate','2026-09-23'),
    'settlementFx',jsonb_build_object('rate','1.2','source','manual','effectiveDate','2026-09-23')));
select is((select row(amount,payment_amount,net_amount,vat_amount) from public.finance_allocations
  where movement_id=pg_temp.movement(203) and amount>0),
  row(120::numeric,100::numeric,97.56::numeric,22.44::numeric),'EUR cash settles 120 USD with VAT composed in obligation USD');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(21)),100::numeric,
  'EUR account balance stays gross EUR cash');

-- The last partial payment takes the remaining cent instead of repeating a rounded ratio.
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(105),pg_temp.fid(33),
  jsonb_build_object('stream','design','revision',0,'mode','design','amount','0.03','currency','USD',
    'vatRate','23','priceBasis','net','reason','Split rounding'));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(113),pg_temp.fid(33),jsonb_build_object(
  'stream','design','useAgreementBasis',true,'item',jsonb_build_object('direction','incoming','amount','0.03','currency','USD',
    'categoryId',pg_temp.cat(),'description','Small invoice','commitment','agreed','certainty','fixed','established',true)));
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(204),pg_temp.result(113),
  jsonb_build_object('kind','incoming','date','2026-09-24','amount','0.02','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),0.02);
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(205),pg_temp.result(113),
  jsonb_build_object('kind','incoming','date','2026-09-25','amount','0.02','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),0.02);
select is((select row(sum(amount),sum(net_amount),sum(vat_amount)) from public.finance_allocations where expected_item_id=pg_temp.result(113)),
  row(0.04::numeric,0.03::numeric,0.01::numeric),'split settlement closes to the exact obligation net and VAT');

-- The builder RPC inherits the agreement rate for the schedule and stores gross Expected cash.
select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(114),pg_temp.fid(34),jsonb_build_object(
  'revision',0,'pricingMethod','fixed','amount','4000','vatRate','23','priceBasis','net','currency','USD',
  'reason','VAT schedule','revenueTaxRate','6','allowUnscheduled',false,'known',jsonb_build_array(),
  'items',jsonb_build_array(jsonb_build_object('id','','name','Advance','amount','4000','dueDate','2026-09-29','expectedDate','2026-09-29'))));
select is((select row(e.amount,e.net_amount,e.vat_amount) from public.finance_expected_items e
  join public.finance_project_items p on p.expected_item_id=e.id where p.project_id=pg_temp.fid(34)),
  row(4920::numeric,4000::numeric,920::numeric),'VAT agreement plan creates gross Expected receivable with net/VAT snapshot');
select is((select row(revenue_tax_rate,net_amount,gross_amount) from public.finance_project_current_terms
  where project_id=pg_temp.fid(34) and stream='design'),
  row(6::numeric,4000::numeric,4920::numeric),'plan stores revenue-tax estimate separately from client gross');

-- Rounded VAT is shared across installments while the schedule stays fully gross-funded.
select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(222),pg_temp.fid(37),jsonb_build_object(
  'revision',0,'pricingMethod','fixed','amount','0.03','vatRate','23','priceBasis','net','currency','USD',
  'reason','Split VAT schedule','allowUnscheduled',false,'known',jsonb_build_array(),
  'items',jsonb_build_array(
    jsonb_build_object('id','','name','First cent','amount','0.01','dueDate','2026-09-29','expectedDate','2026-09-29'),
    jsonb_build_object('id','','name','Second cent','amount','0.01','dueDate','2026-09-29','expectedDate','2026-09-29'),
    jsonb_build_object('id','','name','Third cent','amount','0.01','dueDate','2026-09-29','expectedDate','2026-09-29'))));
select is((select row(sum(e.net_amount),sum(e.vat_amount),sum(e.amount)) from public.finance_expected_items e
  join public.finance_project_items p on p.expected_item_id=e.id where p.project_id=pg_temp.fid(37)),
  row(0.03::numeric,0.01::numeric,0.04::numeric),'split schedule retains full net, VAT, and gross client receivable');
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(223),pg_temp.fid(37),
  (select jsonb_build_object('stream','design','item',jsonb_build_object(
    'id',e.id,'version',e.version,'direction','incoming','amount',e.amount,'currency',e.currency,
    'categoryId',e.category_id,'description','Edited payment date','dueDate','2026-09-30','expectedDate','2026-09-30',
    'commitment',e.commitment,'certainty',e.certainty,'established',e.is_established))
   from public.finance_expected_items e join public.finance_project_items p on p.expected_item_id=e.id
   where p.project_id=pg_temp.fid(37) and e.vat_amount=0.01 limit 1));
select is((select row(e.net_amount,e.vat_amount,e.amount) from public.finance_expected_items e where e.id=pg_temp.result(223)),
  row(0.01::numeric,0.01::numeric,0.02::numeric),'metadata edit preserves the distributed Expected VAT snapshot');

-- Retained cancellation carries the effective allocation composition, not a new ratio.
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(115),pg_temp.fid(35),
  jsonb_build_object('stream','design','revision',0,'mode','design','amount','0.03','currency','USD',
    'vatRate','23','priceBasis','net','reason','Retained rounding'));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(116),pg_temp.fid(35),jsonb_build_object(
  'stream','design','useAgreementBasis',true,'item',jsonb_build_object('direction','incoming','amount','0.03','currency','USD',
    'categoryId',pg_temp.cat(),'description','Retained invoice','commitment','agreed','certainty','fixed','established',true)));
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(206),pg_temp.result(116),
  jsonb_build_object('kind','incoming','date','2026-09-26','amount','0.01','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),0.01);
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(207),pg_temp.result(116),
  jsonb_build_object('kind','incoming','date','2026-09-26','amount','0.01','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),0.01);
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(208),pg_temp.result(116),
  jsonb_build_object('kind','incoming','date','2026-09-26','amount','0.01','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),0.01);
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(209),pg_temp.result(116),
  jsonb_build_object('kind','incoming','date','2026-09-26','amount','0.01','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),0.01);
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(210),
  jsonb_build_object('kind','refund','date','2026-09-27','amount','0.01','accountId',pg_temp.fid(20),
    'relatedMovementId',pg_temp.movement(209),'categoryId',pg_temp.cat()));
select is((select row(sum(amount),sum(net_amount),sum(vat_amount)) from public.finance_allocations where expected_item_id=pg_temp.result(116)),
  row(0.03::numeric,0.03::numeric,0::numeric),'refund leaves three settled cents entirely net');
select public.cancel_finance_project_expectation(pg_temp.fid(1),pg_temp.fid(211),
  jsonb_build_object('itemId',pg_temp.result(116),'version',1,'settledAmount','0.03','retainSettlement',true,'reason','Retain paid portion'));
select is((select row(e.amount,e.net_amount,e.vat_amount) from public.finance_expected_items e
  join public.finance_project_items p on p.expected_item_id=e.id where p.project_id=pg_temp.fid(35) and e.id<>pg_temp.result(116)),
  row(0.03::numeric,0.03::numeric,0::numeric),'retained Expected keeps exact paid net and VAT snapshots');

-- Pre-existing unapplied cash is consumed before a reversed refund's VAT bucket.
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(216),pg_temp.fid(36),
  jsonb_build_object('stream','design','revision',0,'mode','design','amount','50','currency','USD',
    'vatRate','23','priceBasis','net','reason','Partly applied receipt'));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(217),pg_temp.fid(36),jsonb_build_object(
  'stream','design','useAgreementBasis',true,'item',jsonb_build_object('direction','incoming','amount','50','currency','USD',
    'categoryId',pg_temp.cat(),'description','Partly applied','commitment','agreed','certainty','fixed','established',true)));
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(218),pg_temp.result(217),
  jsonb_build_object('kind','incoming','date','2026-06-20','amount','100','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat()),61.5);
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(219),
  jsonb_build_object('kind','refund','date','2026-06-21','amount','50','accountId',pg_temp.fid(20),
    'relatedMovementId',pg_temp.movement(218),'categoryId',pg_temp.cat()));
select is((select row(amount,vat_amount) from public.finance_allocations where cause_movement_id=pg_temp.movement(219)),
  row(-11.5::numeric,-2.15::numeric),'refund first consumes 38.50 unapplied cash, then 11.50 of VAT-bearing settlement');
select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(220),pg_temp.movement(219),'2026-06-22','Undo partial refund');
select is((select vat_reporting_amount from public.finance_project_vat_actuals where studio_id=pg_temp.fid(1) and financial_date='2026-06-22'),
  2.15::numeric,'reversal restores 2.15 VAT after partly unapplied receipt');
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(221),pg_temp.result(112),pg_temp.movement(218),38.5);
select is((select vat_reporting_amount from public.finance_project_vat_actuals where studio_id=pg_temp.fid(1) and financial_date='2026-06-22'),
  2.15::numeric,'using previously unapplied cash does not displace restored VAT');

select throws_like($$update public.finance_project_terms set vat_rate=8 where id=pg_temp.result(100)$$,'%permission denied%',
  'agreement history cannot be changed directly');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select is((select count(*) from public.finance_project_vat_actuals),0::bigint,'employee cannot read project VAT reporting');
select is((select count(*) from public.finance_project_terms),0::bigint,'employee cannot read agreement VAT');
reset role;
select * from finish();
rollback;
