begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('8d000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kiev')::date$$;
create function pg_temp.month(n integer default 0) returns date language sql stable as $$select (date_trunc('month',pg_temp.today())+make_interval(months=>n))::date$$;
create function pg_temp.result(n integer,studio integer default 1) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(studio) and request_id=pg_temp.fid(n)$$;
create function pg_temp.mid(n integer,studio integer default 1) returns uuid language sql as $$select id from public.finance_movements where studio_id=pg_temp.fid(studio) and request_id=pg_temp.fid(n)$$;
create function pg_temp.cat(key text,studio integer default 1) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(studio) and default_key=key$$;
create function pg_temp.post(n integer,kind text,amount text,account integer,patch jsonb default '{}') returns uuid language sql as $$
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('kind',kind,'date',pg_temp.today(),'accountId',pg_temp.fid(account),
  'amount',amount,'categoryId',pg_temp.cat(case when kind='incoming' then 'project_payments' else 'project_services' end),
  'description','Project receipt fixture')||patch)$$;
create function pg_temp.split(n integer,movement integer,revision integer,items jsonb) returns uuid language sql as $$
select public.save_finance_project_cash_split(pg_temp.fid(1),pg_temp.fid(n),pg_temp.mid(movement),
  jsonb_build_object('revision',revision,'items',items,'reason','Project cash attribution fixture'))$$;
create function pg_temp.balance(trip_id uuid) returns uuid language sql as $$
select expected_item_id from public.finance_trip_balances where studio_id=pg_temp.fid(1) and trip_id=$1 and employee_id=pg_temp.fid(11) and direction='incoming'$$;

insert into public.studios(id,name) values(pg_temp.fid(1),'Profitability A'),(pg_temp.fid(2),'Profitability B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','profit-'||n||'@test','{}','{}',now(),now() from generate_series(10,12)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Profitability tester','profit-'||n||'@test',case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=12 then 2 else 1 end),pg_temp.fid(n),case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values
(pg_temp.fid(1),'UAH',pg_temp.month(-1),pg_temp.fid(10)),(pg_temp.fid(2),'UAH',pg_temp.month(-1),pg_temp.fid(12));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'UAH cash','UAH',0,pg_temp.fid(10)),(pg_temp.fid(21),pg_temp.fid(1),'EUR cash','EUR',0,pg_temp.fid(10)),
(pg_temp.fid(22),pg_temp.fid(1),'USD cash','USD',0,pg_temp.fid(10)),(pg_temp.fid(23),pg_temp.fid(2),'Foreign UAH','UAH',0,pg_temp.fid(12));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values
(pg_temp.fid(30),pg_temp.fid(1),'Project Alpha',100,pg_temp.month(-1),pg_temp.fid(10),'active'),
(pg_temp.fid(31),pg_temp.fid(1),'Project Beta',100,pg_temp.month(-1),pg_temp.fid(10),'active'),
(pg_temp.fid(32),pg_temp.fid(2),'Foreign Project',100,pg_temp.month(-1),pg_temp.fid(12),'active');
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(40),pg_temp.month());
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select public.finalize_finance_setup(pg_temp.fid(2));
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);

-- Incoming operating cash stores project attribution in its native cash currency.
select pg_temp.post(100,'incoming','1000',20,jsonb_build_object('projectReceiptSplits',jsonb_build_array(
  jsonb_build_object('projectId',pg_temp.fid(30),'amount','600'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','400'))));
select is((select row(sum(amount),sum(net_amount)) from public.finance_project_cash_net where movement_id=pg_temp.mid(100)),
  row(1000::numeric,1000::numeric),'one operating receipt is attributed once across projects in native currency');
select is((select row(amount,currency) from public.finance_project_cash_events where movement_id=pg_temp.mid(100) and project_id=pg_temp.fid(30)),
  row(600::numeric,'UAH'::text),'project receipt event preserves each exact native share');
select is((select count(*) from public.finance_project_cash_raw where movement_id=pg_temp.mid(100)),2::bigint,'multi-project receipt stores one source revision with two project shares');

-- Later settlement allocations do not change the recorded project cash receipt.
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(101),jsonb_build_object('direction','incoming','amount','1000','currency','UAH',
  'categoryId',pg_temp.cat('project_payments'),'description','Late allocated receipt','dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),
  'commitment','agreed','certainty','fixed','established',true));
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(102),pg_temp.result(101),pg_temp.mid(100),1000);
select is((select sum(net_amount) from public.finance_project_cash_net where movement_id=pg_temp.mid(100)),1000::numeric,
  'settlement allocation does not reduce or duplicate the receipt attribution');

-- Edits use the post-refund net shares and retain the prior refund parts in the gross source snapshot.
select pg_temp.post(110,'incoming','1000',20);
select pg_temp.split(111,110,0,jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','600'),
  jsonb_build_object('projectId',pg_temp.fid(31),'amount','400')));
select throws_like($$select pg_temp.post(112,'refund','100',20,jsonb_build_object('relatedMovementId',pg_temp.mid(110)))$$,
  '%finance_cash_refund_attribution_required%','refund cannot reduce attributed principal without explicit project parts');
select is((select count(*) from public.finance_movements where request_id=pg_temp.fid(112)),0::bigint,'rejected unattributed refund rolls back its cash movement');
select pg_temp.post(113,'refund','100',20,jsonb_build_object('relatedMovementId',pg_temp.mid(110),'projectRefundSplits',jsonb_build_array(
  jsonb_build_object('projectId',pg_temp.fid(30),'amount','60'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','40'))));
select is((select row(sum(net_amount) filter(where project_id=pg_temp.fid(30)),sum(net_amount) filter(where project_id=pg_temp.fid(31)))
  from public.finance_project_cash_net where movement_id=pg_temp.mid(110)),row(540::numeric,360::numeric),
  'partial refund reduces exactly its explicit per-project shares');
select pg_temp.split(114,110,1,jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','500'),
  jsonb_build_object('projectId',pg_temp.fid(31),'amount','400')));
select is((select row(sum(amount) filter(where project_id=pg_temp.fid(30)),sum(amount) filter(where project_id=pg_temp.fid(31)))
  from public.finance_project_cash_raw where movement_id=pg_temp.mid(110)),row(560::numeric,440::numeric),
  'editing net attribution reconstructs the original gross split with retained refund parts');
select is((select row(sum(net_amount) filter(where project_id=pg_temp.fid(30)),sum(net_amount) filter(where project_id=pg_temp.fid(31)))
  from public.finance_project_cash_net where movement_id=pg_temp.mid(110)),row(500::numeric,400::numeric),
  'revised project receipt displays the intended remaining shares');
select is(pg_temp.split(114,110,1,jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','500'),
  jsonb_build_object('projectId',pg_temp.fid(31),'amount','400'))),pg_temp.result(114),'exact split retry is idempotent');
select throws_like($$select pg_temp.split(114,110,1,jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','600')))$$,
  '%finance_request_conflict%','changed split retry with the same request id is rejected');
select throws_like($$select pg_temp.split(115,110,0,jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','1')))$$,
  '%finance_version_conflict%','stale split revision cannot overwrite current attribution');
select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(116),pg_temp.mid(113),pg_temp.today(),'Refund entered twice');
select is((select row(sum(net_amount) filter(where project_id=pg_temp.fid(30)),sum(net_amount) filter(where project_id=pg_temp.fid(31)))
  from public.finance_project_cash_net where movement_id=pg_temp.mid(110)),row(560::numeric,440::numeric),
  'refund reversal restores the exact revised project shares');

-- Native precision, total caps, duplicate projects, and cross-currency splits are enforced.
select pg_temp.post(120,'incoming','10.12',21);
select pg_temp.split(121,120,0,jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','5.01'),
  jsonb_build_object('projectId',pg_temp.fid(31),'amount','5.11')));
select throws_like($$select pg_temp.post(122,'incoming','10.12',21,jsonb_build_object('projectReceiptSplits',jsonb_build_array(
  jsonb_build_object('projectId',pg_temp.fid(30),'amount','10.01'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','0.12'))))$$,
  '%finance_cash_overallocated%','automatic multi-project split cannot exceed receipt cash total');
select throws_like($$select pg_temp.split(123,120,1,jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','5.001')))$$,
  '%finance_input_invalid%','project share uses the receipt currency minor-unit precision');
select throws_like($$select pg_temp.split(124,120,1,jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','1'),
  jsonb_build_object('projectId',pg_temp.fid(30),'amount','1')))$$,'%finance_input_invalid%','duplicate project share is rejected');
select pg_temp.post(125,'incoming','10.12',21,jsonb_build_object('projectReceiptSplits',jsonb_build_array(
  jsonb_build_object('projectId',pg_temp.fid(30),'amount','10.12'))));
select is((select row(sum(amount),min(currency)) from public.finance_project_cash_events where movement_id=pg_temp.mid(125)),
  row(10.12::numeric,'EUR'::text),'project shares remain in the receipt currency instead of being converted');

-- Cost estimates preserve explicit zeros, nullable budgets, and the historical FX snapshot.
select public.save_finance_project_cost_estimate(pg_temp.fid(1),pg_temp.fid(130),pg_temp.fid(30),jsonb_build_object('revision',0,'currency','UAH',
  'date',pg_temp.today(),'directBudget',null,'laborBudget','0','remainingDirect','0','remainingLabor',null,'reason','No direct budget yet'));
select is((select row(direct_budget,labor_budget,remaining_direct,remaining_labor) from public.finance_project_current_cost_estimates
  where project_id=pg_temp.fid(30)),row(null::numeric,0::numeric,0::numeric,null::numeric),
  'estimate preserves nullable budget fields and explicit zero values');
select throws_like($$select public.save_finance_project_cost_estimate(pg_temp.fid(1),pg_temp.fid(131),pg_temp.fid(30),
  jsonb_build_object('revision',0,'currency','UAH','date',pg_temp.today(),'directBudget','1','laborBudget','1','remainingDirect','0','remainingLabor','0','reason','Stale'))$$,
  '%finance_version_conflict%','estimate revision is optimistic and cannot be overwritten with a stale version');
select public.save_finance_project_cost_estimate(pg_temp.fid(1),pg_temp.fid(132),pg_temp.fid(31),jsonb_build_object('revision',0,'currency','EUR',
  'date',pg_temp.today(),'directBudget','100','laborBudget','40','remainingDirect','80','remainingLabor','20',
  'fx',jsonb_build_object('rate','43.123456','source','manual','effectiveDate',pg_temp.today()),'reason','Frozen estimate FX'));
select is((select row(fx_rate,fx_source,fx_effective_date) from public.finance_project_current_cost_estimates where project_id=pg_temp.fid(31)),
  row(43.123456::numeric,'manual'::text,pg_temp.today()),'estimate stores its own date-specific reporting FX snapshot');
select throws_like($$select public.save_finance_project_cost_estimate(pg_temp.fid(1),pg_temp.fid(133),pg_temp.fid(31),
  jsonb_build_object('revision',0,'currency','EUR','date',pg_temp.today(),'directBudget','1','laborBudget','1','remainingDirect','0','remainingLabor','0','reason','Stale'))$$,
  '%finance_version_conflict%','cost estimate revision cannot silently change after creation');

-- Financing, stock changes, trip advances, and returns never enter project receipt attribution.
select pg_temp.post(140,'incoming','300',20,jsonb_build_object('categoryId',pg_temp.cat('financing_in')));
select public.record_finance_account_balance(pg_temp.fid(1),pg_temp.fid(141),jsonb_build_object('kind','balance_adjustment','accountId',pg_temp.fid(20),
  'date',pg_temp.today(),'amount','25'));
select public.create_finance_account_with_opening(pg_temp.fid(1),pg_temp.fid(142),jsonb_build_object('name','Opening-only account','currency','UAH',
  'openingBalance','50','date',pg_temp.today()));
select ok(not exists(select 1 from public.finance_project_cash_events where movement_id in (pg_temp.mid(140),pg_temp.mid(141))),
  'financing and balance-stock movements are excluded from project receipts');
select ok(not exists(select 1 from public.finance_project_cash_events where movement_id=pg_temp.mid(142)),
  'account opening cash is excluded from project receipt attribution');
select public.save_finance_trip(pg_temp.fid(1),pg_temp.fid(150),jsonb_build_object('title','Cash return','destination','Kyiv','startsOn',pg_temp.today(),
  'endsOn',pg_temp.today(),'status','planned','travelers',jsonb_build_array(pg_temp.fid(10),pg_temp.fid(11))));
select public.record_finance_trip_entry(pg_temp.fid(1),pg_temp.fid(151),pg_temp.result(150),jsonb_build_object('kind','advance','expenseType','other',
  'amount','200','currency','UAH','date',pg_temp.today(),'accountId',pg_temp.fid(20),'employeeId',pg_temp.fid(11)));
select public.save_finance_trip(pg_temp.fid(1),pg_temp.fid(152),jsonb_build_object('id',pg_temp.result(150),'version',1,'title','Cash return',
  'destination','Kyiv','startsOn',pg_temp.today(),'endsOn',pg_temp.today(),'status','completed','travelers',jsonb_build_array(pg_temp.fid(10),pg_temp.fid(11))));
select pg_temp.post(153,'incoming','200',20);
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(154),pg_temp.balance(pg_temp.result(150)),pg_temp.mid(153),200);
select throws_like($$select pg_temp.split(155,153,0,jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','200')))$$,
  '%finance_cash_source_invalid%','trip reimbursement return cannot be relabeled as project receipt cash');

-- Same-currency corrections preserve attribution; changed principal/currency require supplied native shares.
select pg_temp.post(160,'incoming','100',20,jsonb_build_object('projectReceiptSplits',jsonb_build_array(
  jsonb_build_object('projectId',pg_temp.fid(30),'amount','60'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','40'))));
select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(161),pg_temp.mid(160),jsonb_build_object('kind','incoming','date',pg_temp.today(),
  'accountId',pg_temp.fid(20),'amount','100','categoryId',pg_temp.cat('project_payments')));
select is((select row(sum(amount) filter(where project_id=pg_temp.fid(30)),sum(amount) filter(where project_id=pg_temp.fid(31)))
  from public.finance_project_cash_raw where movement_id=pg_temp.result(161)),row(60::numeric,40::numeric),
  'same-currency correction preserves exact project shares');
select pg_temp.post(170,'incoming','100',20,jsonb_build_object('projectReceiptSplits',jsonb_build_array(
  jsonb_build_object('projectId',pg_temp.fid(30),'amount','60'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','40'))));
select throws_like($$select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(171),pg_temp.mid(170),jsonb_build_object('kind','incoming',
  'date',pg_temp.today(),'accountId',pg_temp.fid(20),'amount','80','categoryId',pg_temp.cat('project_payments')))$$,
  '%finance_cash_overallocated%','lower corrected principal requires replacement project shares');
select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(172),pg_temp.mid(170),jsonb_build_object('kind','incoming','date',pg_temp.today(),
  'accountId',pg_temp.fid(20),'amount','80','categoryId',pg_temp.cat('project_payments'),'projectReceiptSplits',jsonb_build_array(
  jsonb_build_object('projectId',pg_temp.fid(30),'amount','50'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','30'))));
select is((select sum(amount) from public.finance_project_cash_raw where movement_id=pg_temp.result(172)),80::numeric,
  'lower corrected principal accepts explicit replacement shares');
select pg_temp.post(180,'incoming','100',20,jsonb_build_object('projectReceiptSplits',jsonb_build_array(
  jsonb_build_object('projectId',pg_temp.fid(30),'amount','60'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','40'))));
select throws_like($$select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(181),pg_temp.mid(180),jsonb_build_object('kind','incoming',
  'date',pg_temp.today(),'accountId',pg_temp.fid(21),'amount','100','categoryId',pg_temp.cat('project_payments')))$$,
  '%finance_cash_correction_attribution_required%','cross-currency correction requires native replacement attribution');
select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(182),pg_temp.mid(180),jsonb_build_object('kind','incoming','date',pg_temp.today(),
  'accountId',pg_temp.fid(21),'amount','100','categoryId',pg_temp.cat('project_payments'),'fx',jsonb_build_object('rate','43','source','manual','effectiveDate',pg_temp.today()),
  'projectReceiptSplits',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','70'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','30'))));
select is((select row(sum(amount),min(currency)) from public.finance_project_cash_events where movement_id=pg_temp.result(182)),
  row(100::numeric,'EUR'::text),'currency-change correction uses explicitly supplied replacement-currency shares');
select pg_temp.post(185,'incoming','200',20,jsonb_build_object('projectReceiptSplits',jsonb_build_array(
  jsonb_build_object('projectId',pg_temp.fid(30),'amount','100'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','100'))));
select pg_temp.post(186,'refund','100',20,jsonb_build_object('relatedMovementId',pg_temp.mid(185),'projectRefundSplits',jsonb_build_array(
  jsonb_build_object('projectId',pg_temp.fid(30),'amount','60'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','40'))));
select throws_like($$select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(187),pg_temp.mid(186),jsonb_build_object('kind','refund',
  'date',pg_temp.today(),'accountId',pg_temp.fid(20),'amount','100','relatedMovementId',pg_temp.mid(185),'categoryId',pg_temp.cat('project_payments')))$$,
  '%finance_cash_refund_attribution_required%','refund correction must include explicit project refund parts');
select lives_ok($$select public.correct_finance_movement(pg_temp.fid(1),pg_temp.fid(188),pg_temp.mid(186),jsonb_build_object('kind','refund',
  'date',pg_temp.today(),'accountId',pg_temp.fid(20),'amount','100','relatedMovementId',pg_temp.mid(185),'categoryId',pg_temp.cat('project_payments'),
  'projectRefundSplits',jsonb_build_array(jsonb_build_object('projectId',pg_temp.fid(30),'amount','50'),jsonb_build_object('projectId',pg_temp.fid(31),'amount','50'))))$$,
  'corrected refund can provide explicit replacement project shares');

-- Original reversals remove receipt attribution; reporting getters expose one coherent project book.
select pg_temp.post(190,'incoming','100',20,jsonb_build_object('projectReceiptSplits',jsonb_build_array(
  jsonb_build_object('projectId',pg_temp.fid(30),'amount','100'))));
select public.reverse_finance_movement(pg_temp.fid(1),pg_temp.fid(191),pg_temp.mid(190),pg_temp.today(),'Receipt was duplicated');
select is((select count(*) from public.finance_project_cash_events where movement_id=pg_temp.mid(190)),0::bigint,
  'reversing the original receipt removes all attributed project cash events');
select is(jsonb_typeof(public.get_finance_project_reporting(pg_temp.fid(1))->'receipts'),'array','project reporting read includes receipt source aggregation');
select ok((public.get_finance_project_reporting(pg_temp.fid(1)) ?& array['receipts','events','estimates','contracts','matched']),
  'project reporting read has one stable composed JSON contract');
select ok((public.get_finance_management_reporting(pg_temp.fid(1))->'projectReporting' ?& array['receipts','events','estimates','contracts','matched']),
  'single management reporting read embeds the full project cash book');
select throws_like($$select public.get_finance_project_reporting(pg_temp.fid(2))$$,'%finance_admin_required%','cross-studio admin cannot read project cash reporting');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select is((select count(*) from public.finance_project_cash_revisions),0::bigint,'employee cannot read project cash attribution');
select throws_like($$select public.get_finance_management_reporting(pg_temp.fid(1))$$,'%finance_admin_required%','employee cannot read the management reporting book');
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select throws_like($$insert into public.finance_project_cash_revisions(studio_id,movement_id,revision,reason,created_by)
  values(pg_temp.fid(1),pg_temp.mid(100),1,'Forged',pg_temp.fid(10))$$,'%permission denied%','authenticated admin cannot forge cash attribution history');

select * from finish();
rollback;
