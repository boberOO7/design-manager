begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$
  select ('68000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Batch settlement studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.fid(10),'authenticated','authenticated','batch@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active)
values(pg_temp.fid(10),'Batch admin','batch@test','admin',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active)
values(pg_temp.fid(1),pg_temp.fid(10),'admin',true);
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.fid(1),'USD','2026-09-01',pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'USD bank','USD',0,pg_temp.fid(10)),
(pg_temp.fid(21),pg_temp.fid(1),'EUR bank','EUR',0,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
select pg_temp.fid(n),pg_temp.fid(1),'Batch project '||n,100,'2026-09-01',pg_temp.fid(10),'active'
from generate_series(30,35)n;
create function pg_temp.cat() returns uuid language sql as $$
  select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='project_payments'
$$;
create function pg_temp.item(request integer) returns uuid language sql as $$
  select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(request)
$$;
create function pg_temp.plan_item(project integer) returns uuid language sql stable as $$
  select id from public.finance_project_expected_balances where studio_id=pg_temp.fid(1)
    and project_id=pg_temp.fid(project) and description='Plan item'
$$;
create function pg_temp.movement(request integer) returns uuid language sql as $$
  select id from public.finance_movements where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(request)
$$;
create function pg_temp.project_items(project integer) returns jsonb language sql stable as $$
  select jsonb_build_object('planRevisionId',(
      select r.terms_id from public.finance_project_plan_revisions r
        join public.finance_project_terms t on t.studio_id=r.studio_id and t.id=r.terms_id
          and t.project_id=r.project_id and t.stream='design'
      where r.studio_id=pg_temp.fid(1) and r.project_id=pg_temp.fid(project)
      order by t.revision desc limit 1),
    'items',coalesce((select jsonb_agg(jsonb_build_object('itemId',b.id,'version',b.version,'remaining',b.remaining_amount::text)
      order by b.id) from public.finance_project_expected_balances b
      where b.studio_id=pg_temp.fid(1) and b.project_id=pg_temp.fid(project) and b.stream='design'
        and b.direction='incoming' and b.commitment<>'cancelled' and b.remaining_amount>0),'[]'::jsonb))
$$;
create function pg_temp.post(request integer,project integer,target integer,input jsonb,allocations jsonb,snapshot jsonb default null)
returns uuid language sql as $$
  select public.record_finance_project_payment(pg_temp.fid(1),pg_temp.fid(request),pg_temp.fid(project),pg_temp.item(target),input,
    allocations,coalesce(snapshot,pg_temp.project_items(project)))
$$;
create function pg_temp.allocation(item_request integer,amount text) returns jsonb language sql as $$
  select jsonb_build_object('itemId',pg_temp.item(item_request),'amount',amount)
$$;
create temp table saved_snapshots(name text primary key,payload jsonb not null);
grant select,insert on saved_snapshots to authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));

-- Four ordinary USD obligations, plus isolated EUR and VAT rounding cases.
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(90),pg_temp.fid(30),
  jsonb_build_object('stream','design','revision',0,'mode','design','amount','300','currency','USD','reason','Batch agreement'));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(100),pg_temp.fid(30),jsonb_build_object('stream','design','item',
  jsonb_build_object('direction','incoming','amount','100','currency','USD','categoryId',pg_temp.cat(),'description','First installment','dueDate','2026-09-01','commitment','agreed','certainty','fixed','established',true)));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(101),pg_temp.fid(30),jsonb_build_object('stream','design','item',
  jsonb_build_object('direction','incoming','amount','100','currency','USD','categoryId',pg_temp.cat(),'description','Second installment','dueDate','2026-09-02','commitment','agreed','certainty','fixed','established',true)));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(102),pg_temp.fid(30),jsonb_build_object('stream','design','item',
  jsonb_build_object('direction','incoming','amount','100','currency','USD','categoryId',pg_temp.cat(),'description','Third installment','dueDate','2026-09-03','commitment','agreed','certainty','fixed','established',true)));
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(91),pg_temp.fid(31),
  jsonb_build_object('stream','design','revision',0,'mode','design','amount','0.03','currency','USD','reason','Rounding agreement'));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(103),pg_temp.fid(31),jsonb_build_object('stream','design','item',
  jsonb_build_object('direction','incoming','amount','0.01','currency','USD','categoryId',pg_temp.cat(),'description','Cent one','dueDate','2026-09-01','commitment','agreed','certainty','fixed','established',true)));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(104),pg_temp.fid(31),jsonb_build_object('stream','design','item',
  jsonb_build_object('direction','incoming','amount','0.02','currency','USD','categoryId',pg_temp.cat(),'description','Cents two and three','dueDate','2026-09-02','commitment','agreed','certainty','fixed','established',true)));
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(92),pg_temp.fid(32),
  jsonb_build_object('stream','design','revision',0,'mode','design','amount','10','currency','USD','reason','Fixed rate agreement'));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(105),pg_temp.fid(32),jsonb_build_object('stream','design','item',
  jsonb_build_object('direction','incoming','amount','10','currency','USD','categoryId',pg_temp.cat(),'description','Historic rate item','commitment','agreed','certainty','fixed','established',true)));
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(93),pg_temp.fid(33),
  jsonb_build_object('stream','design','revision',0,'mode','design','amount','100','currency','USD','reason','VAT agreement',
    'vatRate','23','priceBasis','net'));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(106),pg_temp.fid(33),jsonb_build_object('stream','design','useAgreementBasis',true,'item',
  jsonb_build_object('direction','incoming','amount','100','currency','USD','categoryId',pg_temp.cat(),'description','VAT invoice','commitment','agreed','certainty','fixed','established',true)));
select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(94),pg_temp.fid(34),jsonb_build_object(
  'revision',0,'pricingMethod','fixed','amount','10','currency','USD','reason','Plan snapshot test','allowUnscheduled',false,
  'known',jsonb_build_array(),'items',jsonb_build_array(jsonb_build_object('id','','name','Plan item','amount','10','dueDate','2026-09-01'))));
insert into saved_snapshots values('old_plan',pg_temp.project_items(34));
select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(95),pg_temp.fid(34),jsonb_build_object(
  'revision',1,'pricingMethod','fixed','amount','10','currency','USD','reason','Updated plan snapshot','allowUnscheduled',false,
  'known',jsonb_build_array(jsonb_build_object('id',pg_temp.plan_item(34),'version',(
    select version from public.finance_project_expected_balances where id=pg_temp.plan_item(34)),'protected',false)),
  'items',jsonb_build_array(jsonb_build_object('id',pg_temp.plan_item(34),'name','Plan item','amount','10','dueDate','2026-09-02'))));

-- Partial settlement, then one request splits cash over the remaining balance and another item.
select lives_ok($$select pg_temp.post(200,30,100,
  jsonb_build_object('kind','incoming','date','2026-09-10','accountId',pg_temp.fid(20),'amount','50','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(100,'50')))$$,'project payment posts a partial allocation');
select is((select row(settled_amount,remaining_amount,payment_state) from public.finance_expected_balances where id=pg_temp.item(100)),
  row(50::numeric,50::numeric,'partial'::text),'partial payment updates cash and remaining balance');
select throws_like($$select pg_temp.post(225,30,101,
  jsonb_build_object('kind','incoming','date','2026-09-10','accountId',pg_temp.fid(20),'amount','1','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(100,'1')))$$,'%finance_allocation_incompatible%',
  'selection cannot start after an earlier unpaid installment');
select throws_like($$select pg_temp.post(226,30,100,
  jsonb_build_object('kind','incoming','date','2026-09-10','accountId',pg_temp.fid(20),'amount','2','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(101,'1'),pg_temp.allocation(100,'1')))$$,'%finance_allocation_incompatible%',
  'batch allocations must follow canonical schedule order');
insert into saved_snapshots values('batch',pg_temp.project_items(30));
select lives_ok($$select pg_temp.post(201,30,100,
  jsonb_build_object('kind','incoming','date','2026-09-11','accountId',pg_temp.fid(20),'amount','150','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(100,'50'),pg_temp.allocation(101,'100')),(select payload from saved_snapshots where name='batch'))$$,
  'batch settles a partial tail and a second item');
select is((select row(settled_amount,remaining_amount,payment_state) from public.finance_expected_balances where id=pg_temp.item(100)),
  row(100::numeric,0::numeric,'settled'::text),'batch completes earlier partial item');
select is((select row(settled_amount,remaining_amount,payment_state) from public.finance_expected_balances where id=pg_temp.item(101)),
  row(100::numeric,0::numeric,'settled'::text),'batch exactly settles next item');
select is((select collected_amount from public.finance_project_totals where project_id=pg_temp.fid(30)),200::numeric,
  'project cash total counts the full settled obligation amount');
select is((select count(*) from public.finance_allocations where movement_id=pg_temp.movement(201) and amount>0),2::bigint,
  'one movement creates one allocation per batch row');
select is((select count(*) from public.finance_project_payment_context where studio_id=pg_temp.fid(1) and project_id=pg_temp.fid(30)
  and movement_id=pg_temp.movement(201)),1::bigint,'batch payload exposes the project context once per movement');
select lives_ok($$select pg_temp.post(201,30,100,
  jsonb_build_object('kind','incoming','date','2026-09-11','accountId',pg_temp.fid(20),'amount','150','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(100,'50'),pg_temp.allocation(101,'100')),(select payload from saved_snapshots where name='batch'))$$,
  'identical batch retry returns original movement');
select throws_like($$select pg_temp.post(201,30,100,
  jsonb_build_object('kind','incoming','date','2026-09-11','accountId',pg_temp.fid(20),'amount','150','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(100,'49'),pg_temp.allocation(101,'100')),(select payload from saved_snapshots where name='batch'))$$,
  '%finance_request_conflict%','retry cannot change one allocation amount');
select is((select count(*) from public.finance_movements where request_id=pg_temp.fid(201)),1::bigint,'retry never duplicates cash');

-- Invalid allocations roll back the cash movement, including a later bad row in an otherwise valid batch.
select throws_like($$select pg_temp.post(202,30,102,
  jsonb_build_object('kind','incoming','date','2026-09-12','accountId',pg_temp.fid(20),'amount','110','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(102,'100'),pg_temp.allocation(103,'10')))$$,'%finance_allocation_incompatible%',
  'a batch cannot include an item from another project');
select is((select count(*) from public.finance_movements where request_id=pg_temp.fid(202)),0::bigint,
  'invalid batch leaves no cash movement');
select throws_like($$select pg_temp.post(203,30,102,
  jsonb_build_object('kind','incoming','date','2026-09-12','accountId',pg_temp.fid(20),'amount','101','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(102,'100'),pg_temp.allocation(102,'1')))$$,'%finance_allocation_incompatible%',
  'duplicate item rows are rejected atomically');
select throws_like($$select pg_temp.post(204,30,102,
  jsonb_build_object('kind','incoming','date','2026-09-12','accountId',pg_temp.fid(20),'amount','50','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(102,'60')))$$,'%finance_overallocation%',
  'allocation above the item remainder rejects the complete batch');
select is((select count(*) from public.finance_movements where request_id in(pg_temp.fid(203),pg_temp.fid(204))),0::bigint,
  'failed batch variants leave no movements');

-- Cross-currency batches keep cash currency separate and use cumulative native rounding.
insert into saved_snapshots values('rounding',pg_temp.project_items(31));
select throws_like($$select pg_temp.post(206,31,103,
  jsonb_build_object('kind','incoming','date','2026-09-14','accountId',pg_temp.fid(21),'amount','0.01','categoryId',pg_temp.cat(),
    'fx',jsonb_build_object('rate','40','source','nbu','effectiveDate','2026-09-14'),
    'settlementFx',jsonb_build_object('rate','2','source','manual','effectiveDate','2026-09-14')),
  jsonb_build_array(pg_temp.allocation(103,'0.01'),pg_temp.allocation(104,'0.01')))$$,'%finance_settlement_split_unrepresentable%',
  'positive contract row cannot receive zero native minor units');
select is((select count(*) from public.finance_movements where request_id=pg_temp.fid(206)),0::bigint,
  'unrepresentable split leaves no cash movement');
select lives_ok($$select pg_temp.post(205,31,103,
  jsonb_build_object('kind','incoming','date','2026-09-13','accountId',pg_temp.fid(21),'amount','0.02','categoryId',pg_temp.cat(),
    'fx',jsonb_build_object('rate','40','source','nbu','effectiveDate','2026-09-13'),
    'settlementFx',jsonb_build_object('rate','1.5','source','manual','effectiveDate','2026-09-13')),
  jsonb_build_array(pg_temp.allocation(103,'0.01'),pg_temp.allocation(104,'0.02')),(select payload from saved_snapshots where name='rounding'))$$,
  'cross-currency split uses cumulative cash rounding');
select is((select array_agg(payment_amount order by created_at,id) from public.finance_allocations where movement_id=pg_temp.movement(205) and amount>0),
  array[0.01,0.01]::numeric[],'native split allocates one cent to each row after cumulative rounding');
select is((select array_agg(settlement_rate order by created_at,id) from public.finance_allocations where movement_id=pg_temp.movement(205) and amount>0),
  array[1.5,1.5]::numeric[],'each allocation stores the accepted historic settlement rate');
select is((select fx_rate from public.finance_movement_entries where movement_id=pg_temp.movement(205) and entry_role='primary'),
  40::numeric,'ledger reporting retains its separate reporting FX snapshot');
select lives_ok($$select pg_temp.post(205,31,103,
  jsonb_build_object('kind','incoming','date','2026-09-13','accountId',pg_temp.fid(21),'amount','0.02','categoryId',pg_temp.cat(),
    'fx',jsonb_build_object('rate','40','source','nbu','effectiveDate','2026-09-13'),
    'settlementFx',jsonb_build_object('rate','1.5','source','manual','effectiveDate','2026-09-13')),
  jsonb_build_array(pg_temp.allocation(103,'0.01'),pg_temp.allocation(104,'0.02')),(select payload from saved_snapshots where name='rounding'))$$,
  'cross-currency retry preserves the original settlement snapshot');
select is((select settlement_rate from public.finance_allocations where movement_id=pg_temp.movement(205) and amount>0 limit 1),1.5::numeric,
  'retry does not replace historic settlement rate');
select lives_ok($$select pg_temp.post(207,32,105,
  jsonb_build_object('kind','incoming','date','2026-09-14','accountId',pg_temp.fid(21),'amount','0.01','categoryId',pg_temp.cat(),
    'fx',jsonb_build_object('rate','40','source','nbu','effectiveDate','2026-09-14'),
    'settlementFx',jsonb_build_object('rate','0.0001','source','manual','effectiveDate','2026-09-14')),
  '[]'::jsonb)$$,'zero-converted-cash movement may have no positive allocations');
select is((select unapplied_amount from public.finance_payment_availability where id=pg_temp.movement(207)),0.01::numeric,
  'empty allocation batch preserves all native cash as unapplied');
select is((select project_id from public.finance_project_payment_context where movement_id=pg_temp.movement(207)),pg_temp.fid(32),
  'unapplied project payment retains its project context');
select lives_ok($$select pg_temp.post(222,32,105,
  jsonb_build_object('kind','incoming','date','2026-09-15','accountId',pg_temp.fid(21),'amount','10','categoryId',pg_temp.cat(),
    'fx',jsonb_build_object('rate','40','source','nbu','effectiveDate','2026-09-15'),
    'settlementFx',jsonb_build_object('rate','1.2','source','manual','effectiveDate','2026-09-15')),
  jsonb_build_array(pg_temp.allocation(105,'10')))$$,'excess native cash settles principal and leaves a project-linked unapplied remainder');
select is((select unapplied_amount from public.finance_payment_availability where id=pg_temp.movement(222)),1.66::numeric,
  'excess EUR cash remains available after settlement');
select is((select row(settled_amount,remaining_amount,payment_state) from public.finance_expected_balances where id=pg_temp.item(105)),
  row(10::numeric,0::numeric,'settled'::text),'full contract principal is settled despite excess native cash');
select is((select settlement_rate from public.finance_allocations where movement_id=pg_temp.movement(222) and amount>0),1.2::numeric,
  'excess settlement retains the accepted historic rate');

-- A snapshot captured before another settlement is stale, and stale writes leave no ledger entry.
insert into saved_snapshots values('stale_batch',pg_temp.project_items(30));
select lives_ok($$select pg_temp.post(208,30,102,
  jsonb_build_object('kind','incoming','date','2026-09-15','accountId',pg_temp.fid(20),'amount','1','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(102,'1')))$$,'another batch changes a candidate balance');
select throws_like($$select pg_temp.post(209,30,102,
  jsonb_build_object('kind','incoming','date','2026-09-16','accountId',pg_temp.fid(20),'amount','1','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(102,'1')),(select payload from saved_snapshots where name='stale_batch'))$$,
  '%finance_settlement_preview_stale%','captured project snapshot detects a changed remaining balance');
select is((select count(*) from public.finance_movements where request_id=pg_temp.fid(209)),0::bigint,'stale preview creates no movement');
select throws_like($$select public.record_finance_project_payment(pg_temp.fid(1),pg_temp.fid(210),pg_temp.fid(34),
  pg_temp.plan_item(34),jsonb_build_object('kind','incoming','date','2026-09-17','accountId',pg_temp.fid(20),
    'amount','1','categoryId',pg_temp.cat()),jsonb_build_array(jsonb_build_object('itemId',pg_temp.plan_item(34),'amount','1')),
  (select payload from saved_snapshots where name='old_plan'))$$,'%finance_settlement_preview_stale%',
  'plan revision change invalidates the captured snapshot');
select is((select count(*) from public.finance_movements where request_id=pg_temp.fid(210)),0::bigint,
  'stale plan snapshot creates no movement');
select throws_like($$select public.record_finance_project_payment(pg_temp.fid(2),pg_temp.fid(240),pg_temp.fid(30),
  pg_temp.item(102),jsonb_build_object('kind','incoming','date','2026-09-17','accountId',pg_temp.fid(20),
    'amount','1','categoryId',pg_temp.cat()),jsonb_build_array(pg_temp.allocation(102,'1')),pg_temp.project_items(30))$$,
  '%finance_admin_required%','studio-one administrator cannot write into another studio');

-- A zero-cash settlement adjustment closes only the exact remaining balance; reasons are constrained.
select lives_ok($$select pg_temp.post(210,33,106,
  jsonb_build_object('kind','incoming','date','2026-09-17','accountId',pg_temp.fid(20),'amount','100','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(106,'100')))$$,'cash partly settles VAT inclusive invoice');
select is((select remaining_amount from public.finance_expected_balances where id=pg_temp.item(106)),23::numeric,
  'VAT inclusive item retains its unpaid gross amount');
select throws_like($$select public.close_finance_expected_remainder(pg_temp.fid(1),pg_temp.fid(211),pg_temp.item(106),
  '2026-09-18','other','',22)$$,'%finance_settlement_adjustment_invalid%','closure requires the complete current remainder');
select throws_like($$select public.close_finance_expected_remainder(pg_temp.fid(1),pg_temp.fid(211),pg_temp.item(106),
  '2026-09-18','other','',23)$$,'%finance_settlement_adjustment_invalid%','other closure reason requires an explanation');
select lives_ok($$select public.close_finance_expected_remainder(pg_temp.fid(1),pg_temp.fid(211),pg_temp.item(106),
  '2026-09-18','fx_difference','',23)$$,'FX difference closes full expected remainder without cash');
select is((select row(settled_amount,remaining_amount,payment_state) from public.finance_expected_balances where id=pg_temp.item(106)),
  row(100::numeric,0::numeric,'settled'::text),'adjustment closes remaining without changing cash settlement');
select is((select sum(amount) from public.finance_settlement_adjustments where expected_item_id=pg_temp.item(106) and reversed_adjustment_id is null),
  23::numeric,'signed adjustment records the closed gross remainder');
select is((select row(collected_amount,closed_amount,outstanding_amount) from public.finance_project_totals where project_id=pg_temp.fid(33)),
  row(100::numeric,23::numeric,0::numeric),'project totals separate cash collected and remainder closed');
select throws_like($$select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(230),jsonb_build_object(
  'id',pg_temp.item(106),'version',(select version from public.finance_expected_items where id=pg_temp.item(106)),
  'direction','incoming','amount','122','currency','USD','categoryId',pg_temp.cat(),'description','VAT invoice',
  'dueDate',(select due_date from public.finance_expected_items where id=pg_temp.item(106)),
  'expectedDate',(select expected_payment_date from public.finance_expected_items where id=pg_temp.item(106)),
  'commitment','agreed','certainty','fixed','established',true))$$,'%finance_below_settled%',
  'cash plus an active closure protects the expected amount floor');
select lives_ok($$select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(231),jsonb_build_object(
  'kind','refund','date','2026-09-18','accountId',pg_temp.fid(20),'amount','100',
  'relatedMovementId',pg_temp.movement(210),'categoryId',pg_temp.cat()))$$,'full refund releases cash after the noncash remainder is closed');
select is((select row(settled_amount,adjustment_amount,remaining_amount,payment_state) from public.finance_expected_balances where id=pg_temp.item(106)),
  row(0::numeric,23::numeric,100::numeric,'partial'::text),'refund does not reverse the active closure');
select lives_ok($$select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(232),pg_temp.movement(231),
  '2026-09-19','Undo project refund')$$,'refund can be reversed while the closure remains active');
select is((select row(settled_amount,adjustment_amount,remaining_amount,payment_state) from public.finance_expected_balances where id=pg_temp.item(106)),
  row(0::numeric,23::numeric,100::numeric,'partial'::text),'refund reversal restores unapplied cash without reversing the closure');
select is((select unapplied_amount from public.finance_payment_availability where id=pg_temp.movement(210)),100::numeric,
  'refund reversal restores cash availability for a deliberate rematch');
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(233),pg_temp.item(106),pg_temp.movement(210),100);
select is((select row(settled_amount,adjustment_amount,remaining_amount,payment_state) from public.finance_expected_balances where id=pg_temp.item(106)),
  row(100::numeric,23::numeric,0::numeric,'settled'::text),'rematching restored cash preserves the active closure');
select throws_like($$update public.finance_settlement_adjustments set amount=24 where expected_item_id=pg_temp.item(106)$$,
  '%permission denied%','adjustment history cannot be edited directly');
select throws_like($$delete from public.finance_settlement_adjustments where expected_item_id=pg_temp.item(106)$$,
  '%permission denied%','adjustment history cannot be deleted directly');
select throws_like($$select public.close_finance_expected_remainder(pg_temp.fid(1),pg_temp.fid(212),pg_temp.item(106),
  '2026-09-19','client_agreement','',0)$$,'%finance_settlement_adjustment_invalid%','already closed item cannot be closed twice');
select throws_like($$select public.reverse_finance_settlement_adjustment(pg_temp.fid(1),pg_temp.fid(213),
  (select id from public.finance_settlement_adjustments where expected_item_id=pg_temp.item(106) and reversed_adjustment_id is null),
  '2026-09-20','   ')$$,'%finance_settlement_adjustment_invalid%','reversal requires a nonblank reason');
select lives_ok($$select public.reverse_finance_settlement_adjustment(pg_temp.fid(1),pg_temp.fid(213),
  (select id from public.finance_settlement_adjustments where expected_item_id=pg_temp.item(106) and reversed_adjustment_id is null),
  '2026-09-20','Undo closure')$$,'adjustment can be reversed with a reason');
select is((select sum(amount) from public.finance_settlement_adjustments where expected_item_id=pg_temp.item(106)),0::numeric,
  'reversal stores equal and opposite signed adjustment');
select is((select row(settled_amount,remaining_amount,payment_state) from public.finance_expected_balances where id=pg_temp.item(106)),
  row(100::numeric,23::numeric,'partial'::text),'reversing closure reopens only the unpaid remainder');
select lives_ok($$select public.close_finance_expected_remainder(pg_temp.fid(1),pg_temp.fid(214),pg_temp.item(106),
  '2026-09-21','client_agreement','',23)$$,'client agreement is an accepted closure reason');
select lives_ok($$select public.reverse_finance_settlement_adjustment(pg_temp.fid(1),pg_temp.fid(215),
  (select id from public.finance_settlement_adjustments where expected_item_id=pg_temp.item(106)
    and reversed_adjustment_id is null order by created_at desc limit 1),'2026-09-22','Reopen for explanation')$$,
  'client-agreement closure can be reversed');
select lives_ok($$select public.close_finance_expected_remainder(pg_temp.fid(1),pg_temp.fid(216),pg_temp.item(106),
  '2026-09-23','other','Agreed write-off',23)$$,'other closure reason accepts a required explanation');
select lives_ok($$select public.reverse_finance_settlement_adjustment(pg_temp.fid(1),pg_temp.fid(217),
  (select id from public.finance_settlement_adjustments where expected_item_id=pg_temp.item(106)
    and reversed_adjustment_id is null order by created_at desc limit 1),'2026-09-24','Reopen after write-off')$$,
  'other-reason closure can be reversed');
select is((select recorded_balance from public.finance_account_balances where id=pg_temp.fid(20)),301::numeric,
  'closure and reversal do not change recorded cash');
select is((select sum(vat_reporting_amount) from public.finance_project_vat_actuals where financial_date='2026-09-17'),18.7::numeric,
  'VAT actuals continue to reflect cash settled after remainder closure and reversal');

-- Project audit context follows replacement cash without creating manual cash revisions.
select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(223),pg_temp.movement(222),jsonb_build_object(
  'kind','incoming','date','2026-09-26','accountId',pg_temp.fid(21),'amount','12','categoryId',pg_temp.cat(),
  'fx',jsonb_build_object('rate','40','source','manual','effectiveDate','2026-09-26')));
select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(224),pg_temp.movement(223),jsonb_build_object(
  'kind','incoming','date','2026-09-26','accountId',pg_temp.fid(21),'amount','11','categoryId',pg_temp.cat(),
  'fx',jsonb_build_object('rate','40','source','manual','effectiveDate','2026-09-26')));
select is((select count(*) from public.finance_project_payment_context
  where studio_id=pg_temp.fid(1) and project_id=pg_temp.fid(32)
    and movement_id in(pg_temp.movement(222),pg_temp.movement(223),pg_temp.movement(224))),3::bigint,
  'two consecutive cash corrections retain project context on both replacements');
select is((select count(*) from public.finance_project_cash_revisions where studio_id=pg_temp.fid(1)),0::bigint,
  'project payment corrections do not create manual project cash revisions');

-- RLS hides adjustment history from an ordinary studio member.
reset role;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.fid(11),'authenticated','authenticated','batch-employee@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active)
values(pg_temp.fid(11),'Batch employee','batch-employee@test','employee',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active)
values(pg_temp.fid(1),pg_temp.fid(11),'employee',true);
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
set local role authenticated;
select is((select count(*) from public.finance_settlement_adjustments),0::bigint,'employee cannot read settlement adjustments');
select throws_like($$select pg_temp.post(241,33,106,
  jsonb_build_object('kind','incoming','date','2026-09-25','accountId',pg_temp.fid(20),'amount','1','categoryId',pg_temp.cat()),
  jsonb_build_array(pg_temp.allocation(106,'1')))$$,'%finance_admin_required%','employee cannot post a project settlement batch');
reset role;
set local role anon;
select throws_like($$select public.record_finance_project_payment(pg_temp.fid(1),pg_temp.fid(242),pg_temp.fid(33),
  pg_temp.item(106),jsonb_build_object('kind','incoming','date','2026-09-25','accountId',pg_temp.fid(20),
    'amount','1','categoryId',pg_temp.cat()),jsonb_build_array(pg_temp.allocation(106,'1')),pg_temp.project_items(33))$$,
  '%permission denied%','anonymous caller cannot execute the project settlement RPC');
reset role;
select * from finish();
rollback;
