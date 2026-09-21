begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('65000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Project Finance A'),(pg_temp.fid(2),'Project Finance B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','planning-'||n||'@test','{}','{}',now(),now() from generate_series(10,14)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Planning tester','planning-'||n||'@test',case when n=11 then 'employee' else 'admin' end,n<>13 from generate_series(10,14)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=12 then 2 else 1 end),pg_temp.fid(n),case when n=11 then 'employee' else 'admin' end,n<>14 from generate_series(10,14)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.fid(1),'UAH','2026-09-01',pg_temp.fid(10)),(pg_temp.fid(2),'UAH','2026-09-01',pg_temp.fid(12));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',1000,pg_temp.fid(10)),(pg_temp.fid(21),pg_temp.fid(1),'Dollar','USD',0,pg_temp.fid(10));
create function pg_temp.cat(key text,studio integer default 1) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(studio) and default_key=key$$;
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values
(pg_temp.fid(30),pg_temp.fid(1),'Project A',100,'2026-09-01',pg_temp.fid(10),'active'),
(pg_temp.fid(31),pg_temp.fid(2),'Project B',100,'2026-09-01',pg_temp.fid(12),'active');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values(pg_temp.fid(30),pg_temp.fid(11),'designer',0,'2026-09-01');
insert into public.contractor_categories(id,studio_id,name,color_key) values(pg_temp.fid(40),pg_temp.fid(1),'Builders','blue'),(pg_temp.fid(41),pg_temp.fid(2),'Builders','blue');
insert into public.contractors(id,category_id,name,created_by) values(pg_temp.fid(42),pg_temp.fid(40),'Builder A',pg_temp.fid(10)),(pg_temp.fid(43),pg_temp.fid(41),'Builder B',pg_temp.fid(12));
create function pg_temp.result(n integer) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.terms(n integer,patch jsonb default '{}',project integer default 30) returns uuid language sql as $$
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(project),jsonb_build_object('stream','design','revision',0,'mode','design','amount','500','currency','UAH','reason','Agreement')||patch)$$;
create function pg_temp.item(n integer,patch jsonb default '{}',context jsonb default '{}',project integer default 30) returns uuid language sql as $$
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(project),jsonb_build_object('stream','design','item',jsonb_build_object('direction','incoming','amount','100','currency','UAH','categoryId',pg_temp.cat('project_payments'),
  'description','Advance','dueDate','2026-09-01','expectedDate','2026-10-01','commitment','agreed','certainty','fixed','established',true)||patch)||context)$$;
create function pg_temp.months(n integer,first_month date default '2026-09-01',last_month date default '2026-11-01') returns uuid language sql as $$select public.generate_finance_supervision_months(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(30),first_month,last_month)$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));

create function pg_temp.known() returns jsonb language sql as $$select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'protected',has_settlement_history) order by id),'[]') from public.finance_project_plan_items where project_id=pg_temp.fid(30)$$;
create function pg_temp.plan(n integer,patch jsonb default '{}') returns uuid language sql as $$select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(30),jsonb_build_object('revision',coalesce((select revision from public.finance_project_current_terms where project_id=pg_temp.fid(30) and stream='design'),0),'pricingMethod','fixed','amount','1000','currency','UAH','reason','Reviewed payment schedule','allowUnscheduled',false,'known',pg_temp.known(),'items',jsonb_build_array(jsonb_build_object('id','','name','Advance','amount','300','dueDate','2026-09-20','expectedDate','2026-10-01'),jsonb_build_object('id','','name','Payment 2','amount','500','dueDate','2026-10-15','expectedDate',''),jsonb_build_object('id','','name','Final payment','amount','200','dueDate','','expectedDate','')))||patch)$$;
select lives_ok($$select pg_temp.plan(800)$$,'fixed value and initial 30/50/20 schedule saved atomically');
select is((select count(*) from public.finance_project_plan_items),3::bigint,'three canonical expected items');
select is((select scheduled_amount from public.finance_project_totals where stream='design'),1000::numeric,'full reconciliation');
select is((select count(*) from public.finance_movements),0::bigint,'schedule creates no cash');
select lives_ok($$select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(800),pg_temp.fid(30),(select payload->'input' from public.finance_planning_requests where request_id=pg_temp.fid(800)))$$,'lost-response retry returns existing revision');
select is((select count(*) from public.finance_project_terms),1::bigint,'retry adds no revision');
select throws_like($$select pg_temp.plan(800,'{"amount":"1200"}')$$,'%finance_request_conflict%','request key cannot save a different payload');
select throws_like($$select pg_temp.plan(801,'{"amount":"999"}')$$,'%finance_project_over_scheduled%','over-allocation rejected before writes');
select throws_like($$select pg_temp.plan(801,'{"amount":"1100"}')$$,'%finance_project_plan_remainder%','unscheduled value requires explicit confirmation');
select throws_like($$select pg_temp.plan(801,'{"known":[]}')$$,'%finance_version_conflict%','stale schedule rejected');
select throws_like($$select pg_temp.plan(801,'{"reason":""}')$$,'%finance_input_invalid%','revision reason required');
select lives_ok($$select pg_temp.plan(802,jsonb_build_object('items',(select jsonb_agg(jsonb_build_object('id',id,'name',description,'amount',case when description='Advance' then '200' when description='Payment 2' then '600' else '200' end,'dueDate',due_date,'expectedDate',expected_payment_date) order by description desc) from public.finance_project_plan_items)))$$,'entirely unpaid schedule redistributed while retaining IDs');
select is((select count(*) from public.finance_expected_items),3::bigint,'unpaid edits do not recreate items');
select is((select amount from public.finance_expected_items where description='Advance'),200::numeric,'reduction applied before increase');
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(810),(select id from public.finance_project_plan_items where description='Advance'),jsonb_build_object('kind','incoming','date','2026-09-20','amount','200','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('project_payments')),200);
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(811),(select id from public.finance_project_plan_items where description='Payment 2'),jsonb_build_object('kind','incoming','date','2026-09-20','amount','100','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('project_payments')),100);
create temporary table protected_before as select * from public.finance_expected_items where id in(select id from public.finance_project_plan_items where has_settlement_history);
select lives_ok($$select pg_temp.plan(812,jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',(select id from public.finance_project_plan_items where description='Final payment'),'name','Final payment','amount','100','dueDate','2026-11-01','expectedDate',''),jsonb_build_object('id','','name','Fourth payment','amount','100','dueDate','','expectedDate',''))))$$,'fourth payment redistributes only the 200 editable value');
select results_eq($$select * from public.finance_expected_items where id in(select id from protected_before) order by id$$,$$select * from protected_before order by id$$,'fully and partially settled rows completely unchanged');
select is((select count(*) from public.finance_project_plan_items),4::bigint,'fourth item added');
select is((select collected_amount from public.finance_project_totals where stream='design'),300::numeric,'collections unchanged');
select is((select count(*) from public.finance_movements),2::bigint,'no duplicate cash');
select throws_like($$select pg_temp.plan(813,jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',(select id from protected_before limit 1),'name','Changed','amount','1000','dueDate','','expectedDate',''))))$$,'%finance_project_settled_terms_locked%','historically protected item cannot enter editable list');
select lives_ok($$select pg_temp.plan(814,jsonb_build_object('amount','1100','allowUnscheduled',true,'items',(select jsonb_agg(jsonb_build_object('id',id,'name',description,'amount',amount,'dueDate',due_date,'expectedDate',expected_payment_date)) from public.finance_project_plan_items where not has_settlement_history)))$$,'explicit remainder preserved without forecast date');
select is((select unscheduled_amount from public.finance_project_totals where stream='design'),100::numeric,'100 intentionally unscheduled');
select lives_ok($$select pg_temp.plan(815,jsonb_build_object('amount','1100','items',(select jsonb_agg(jsonb_build_object('id',id,'name',description,'amount',amount,'dueDate',due_date,'expectedDate',expected_payment_date)) from public.finance_project_plan_items where not has_settlement_history)||jsonb_build_array(jsonb_build_object('id','','name','Additional payment','amount','100','dueDate','','expectedDate',''))))$$,'keep existing amounts and add another from remainder');
select lives_ok($$select pg_temp.plan(816,jsonb_build_object('pricingMethod','area','area','123','rate','20','amount','2460','allowUnscheduled',true,'items',(select jsonb_agg(jsonb_build_object('id',id,'name',description,'amount',amount,'dueDate',due_date,'expectedDate',expected_payment_date)) from public.finance_project_plan_items where not has_settlement_history)))$$,'area pricing snapshots inputs');
select throws_like($$select pg_temp.plan(817,'{"pricingMethod":"area","area":"123","rate":"20","amount":"2461"}')$$,'%finance_amount_invalid%','forged area product rejected');
reset role;
update public.projects set total_area_m2=150 where id=pg_temp.fid(30);
set local role authenticated;
select is((select area_snapshot from public.finance_project_plan_revisions where terms_id=pg_temp.result(816)),123::numeric,'area snapshot survives project-area changes');
select is((select amount from public.finance_project_terms where id=pg_temp.result(816)),2460::numeric,'contract value unchanged by project area');
select throws_like($$update public.finance_project_plan_revisions set area_snapshot=150$$,'%permission denied%','pricing snapshots not directly writable');
select throws_like($$select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(820),pg_temp.fid(31),'{}')$$,'%finance_project_invalid%','foreign project denied');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select is((select count(*) from public.finance_project_plan_revisions),0::bigint,'employee cannot read pricing revisions');
select is((select count(*) from public.finance_project_plan_items),0::bigint,'employee cannot read builder items');
select throws_like($$select pg_temp.plan(821)$$,'%finance_admin_required%','employee cannot save');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select is((select count(*) from public.finance_project_plan_revisions),0::bigint,'other studio cannot read pricing');
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
reset role;
update public.projects set status='completed',completed_at='2026-09-21' where id=pg_temp.fid(30);
set local role authenticated;
select lives_ok($$select pg_temp.plan(823,jsonb_build_object('amount','2460','allowUnscheduled',true,'items',(select jsonb_agg(jsonb_build_object('id',id,'name',description,'amount',amount,'dueDate',due_date,'expectedDate',expected_payment_date)) from public.finance_project_plan_items where not has_settlement_history)))$$,'completed projects can explicitly revise unpaid plans');
reset role;
update public.projects set status='archived',archived_at='2026-09-21' where id=pg_temp.fid(30);
set local role authenticated;
select lives_ok($$select pg_temp.plan(822,jsonb_build_object('amount','2460','allowUnscheduled',true,'items',(select jsonb_agg(jsonb_build_object('id',id,'name',description,'amount',amount,'dueDate',due_date,'expectedDate',expected_payment_date)) from public.finance_project_plan_items where not has_settlement_history)))$$,'archived projects can explicitly revise unpaid plans');
select lives_ok($$select pg_temp.plan(824,'{"amount":"2460","allowUnscheduled":true,"items":[]}')$$,'removing unpaid items explicitly cancels their expectations');
select is((select count(*) from public.finance_expected_items where commitment='cancelled'),3::bigint,'removed rows retained as cancelled history');
select results_eq($$select * from public.finance_expected_items where id in(select id from protected_before) order by id$$,$$select * from protected_before order by id$$,'removal still preserves every protected field');
select is((select count(*) from public.finance_movements),2::bigint,'removing future payments never changes cash');
select * from finish();
rollback;
