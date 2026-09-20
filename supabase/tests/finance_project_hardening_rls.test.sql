begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('66000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
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
create function pg_temp.close_item(n integer,item integer,patch jsonb default '{}') returns uuid language sql as $$
select public.cancel_finance_project_expectation(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('itemId',pg_temp.result(item),'version',1,'settledAmount','0','reason','Engagement terminated')||patch)$$;
create function pg_temp.post(n integer,patch jsonb default '{}') returns uuid language sql as $$
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('kind','incoming','date','2026-09-02','amount','100000','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('project_payments'))||patch)$$;
create function pg_temp.movement(n integer) returns uuid language sql as $$select id from public.finance_movements where request_id=pg_temp.fid(n)$$;
select pg_temp.terms(90,'{"amount":"300000"}');
select pg_temp.item(100,'{"amount":"100000"}');
select pg_temp.post(200);
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(201),pg_temp.result(100),pg_temp.movement(200),100000);
select is((select settled_amount from public.finance_expected_balances where id=pg_temp.result(100)),100000::numeric,'fully paid expectation');
select pg_temp.post(202,jsonb_build_object('kind','refund','relatedMovementId',pg_temp.movement(200)));
select is((select settled_amount from public.finance_expected_balances where id=pg_temp.result(100)),0::numeric,'full refund releases settlement');
select is((select outstanding_amount from public.finance_project_totals where stream='design'),100000::numeric,'refund alone does not cancel');
create temporary table original_allocations as select * from public.finance_allocations;
create temporary table original_cash as select * from public.finance_movement_entries;
create temporary table original_movements as select * from public.finance_movements;
create temporary table original_terms as select * from public.finance_project_terms;
select throws_like($$select pg_temp.item(110,jsonb_build_object('id',pg_temp.result(100),'version',1,'amount','100000','commitment','cancelled','established',false))$$,'%finance_project_cancellation_required%','generic edit cannot bypass audited cancellation');
select throws_like($$select pg_temp.close_item(111,100,'{"reason":" "}')$$,'%finance_project_reason_required%','cancellation requires reason');
select throws_like($$select pg_temp.close_item(111,100,'{"version":2}')$$,'%finance_version_conflict%','stale cancellation rejected');
select lives_ok($$select pg_temp.close_item(111,100)$$,'full refund permits explicit cancellation');
select lives_ok($$select pg_temp.close_item(111,100)$$,'cancellation retry is idempotent');
select throws_like($$select pg_temp.close_item(111,100,'{"reason":"Changed"}')$$,'%finance_request_conflict%','changed retry rejected');
select is((select amount from public.finance_expected_items where id=pg_temp.result(100)),100000::numeric,'original amount preserved');
select is((select commitment from public.finance_expected_items where id=pg_temp.result(100)),'cancelled','explicit cancellation recorded');
select is((select concat(outstanding_amount,'|',planned_amount,'|',scheduled_amount) from public.finance_project_totals where stream='design'),'0|0|0','cancelled amount leaves receivables and planned schedule');
select is(jsonb_array_length(public.calculate_finance_forecast(pg_temp.fid(1),'6','confirmed','[]')->'items'),0,'cancelled refunded expectation excluded from confirmed forecast');
select is(jsonb_array_length(public.calculate_finance_forecast(pg_temp.fid(1),'6','planned','[]')->'items'),0,'cancelled refunded expectation excluded from planned forecast');
select is((select payload->'input'->>'reason' from public.finance_planning_requests where request_id=pg_temp.fid(111)),'Engagement terminated','reason is in immutable audit');
select results_eq('select * from public.finance_allocations','select * from original_allocations','cancellation preserves allocation and refund release rows');
select results_eq('select * from public.finance_movements','select * from original_movements','payment and refund records unchanged');
select results_eq('select * from public.finance_movement_entries','select * from original_cash','cancellation has no cash effect');
select results_eq('select * from public.finance_project_terms','select * from original_terms','commercial terms history unchanged');
select throws_like($$select pg_temp.item(112,jsonb_build_object('id',pg_temp.result(100),'version',2,'amount','99999','commitment','cancelled','established',false))$$,'%finance_project_settled_terms_locked%','original cancelled amount remains locked');
select throws_like($$select pg_temp.item(112,jsonb_build_object('id',pg_temp.result(100),'version',2,'amount','100000'))$$,'%finance_project_settled_terms_locked%','cancelled history cannot be reopened');
select pg_temp.item(120,'{"amount":"100000"}');
select pg_temp.post(220);
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(221),pg_temp.result(120),pg_temp.movement(220),100000);
select pg_temp.post(222,jsonb_build_object('kind','refund','relatedMovementId',pg_temp.movement(220),'amount','60000'));
select throws_like($$select pg_temp.close_item(121,120,'{"settledAmount":"40000"}')$$,'%finance_project_retention_required%','cannot discard retained payment');
select throws_like($$select pg_temp.close_item(121,120,'{"retainSettlement":true}')$$,'%finance_version_conflict%','settlement changes invalidate stale form even when item version unchanged');
create temporary table partial_allocations as select * from public.finance_allocations;
create temporary table partial_cash as select * from public.finance_movement_entries;
select lives_ok($$select pg_temp.close_item(121,120,'{"settledAmount":"40000","retainSettlement":true}')$$,'explicit adjustment preserves retained settlement in replacement');
select lives_ok($$select pg_temp.close_item(121,120,'{"settledAmount":"40000","retainSettlement":true}')$$,'partial adjustment retry creates no second replacement');
select is((select concat(amount,'|',settled_amount,'|',commitment) from public.finance_expected_balances where id=pg_temp.result(120)),'100000|0|cancelled','original partial-refund expectation preserves amount');
select is((select concat(amount,'|',settled_amount,'|',payment_state) from public.finance_expected_balances where id=pg_temp.result(121)),'40000|40000|settled','replacement contains exactly retained payment');
select is((select concat(collected_amount,'|',outstanding_amount,'|',planned_amount,'|',scheduled_amount) from public.finance_project_totals where stream='design'),'40000|0|0|40000','retention closes unpaid forecast without discarding collection');
select results_eq('select a.* from public.finance_allocations a join partial_allocations b using(id) order by a.id','select * from partial_allocations order by id','partial adjustment appends without rewriting allocation history');
select results_eq('select * from public.finance_movement_entries','select * from partial_cash','retention adjustment never changes cash');
select is((select count(*) from public.finance_allocations where expected_item_id=pg_temp.result(120) and reason='Engagement terminated'),1::bigint,'retained allocation released with reason');
select is(jsonb_array_length(public.calculate_finance_forecast(pg_temp.fid(1),'6','planned','[]')->'items'),0,'retention adjustment excludes closed balance and settled replacement from forecast');
select pg_temp.post(223,jsonb_build_object('kind','refund','relatedMovementId',pg_temp.movement(220),'amount','40000'));
select is((select settled_amount from public.finance_expected_balances where id=pg_temp.result(121)),0::numeric,'later refund releases replacement allocation using original payment');
select is((select commitment from public.finance_expected_items where id=pg_temp.result(120)),'cancelled','later refund never reopens cancelled original');
select lives_ok($$select pg_temp.close_item(122,121)$$,'fully refunded replacement can also be cancelled with reason');
-- Two payments settle the target; one also settles an unrelated expectation.
select pg_temp.item(140,'{"amount":"100"}');
select pg_temp.item(150,'{"amount":"50","description":"Unrelated expectation"}');
select pg_temp.post(240,'{"amount":"100"}');
select pg_temp.post(250,'{"amount":"40"}');
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(241),pg_temp.result(140),pg_temp.movement(240),60);
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(242),pg_temp.result(150),pg_temp.movement(240),40);
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(251),pg_temp.result(140),pg_temp.movement(250),40);
create temporary table shared_other_history as select * from public.finance_allocations where expected_item_id=pg_temp.result(150);
create temporary table shared_other_balance as select * from public.finance_expected_balances where id=pg_temp.result(150);
create temporary table shared_history as select * from public.finance_allocations;
create temporary table shared_cash as select * from public.finance_movement_entries;
create temporary table shared_movements as select * from public.finance_movements;
select lives_ok($$select pg_temp.close_item(141,140,'{"settledAmount":"100","retainSettlement":true}')$$,'retention can move settlement from multiple payments including a shared payment');
select is((select concat(amount,'|',settled_amount,'|',commitment) from public.finance_expected_balances where id=pg_temp.result(140)),'100|0|cancelled','shared-payment original closes without changing its amount');
select is((select concat(amount,'|',settled_amount,'|',payment_state) from public.finance_expected_balances where id=pg_temp.result(141)),'100|100|settled','replacement retains exactly both payments');
select results_eq('select movement_id,amount from public.finance_allocations where expected_item_id=pg_temp.result(141) order by movement_id',
  'select movement_id,amount from shared_history where expected_item_id=pg_temp.result(140) order by movement_id','replacement preserves the individual payment amounts');
select results_eq('select * from public.finance_allocations where expected_item_id=pg_temp.result(150)','select * from shared_other_history','unrelated allocation history is untouched');
select results_eq('select * from public.finance_expected_balances where id=pg_temp.result(150)','select * from shared_other_balance','unrelated expectation retains its settlement and outstanding amount');
select results_eq('select a.* from public.finance_allocations a join shared_history b using(id) order by a.id','select * from shared_history order by id','all prior allocation history is immutable');
select results_eq('select * from public.finance_movement_entries','select * from shared_cash','shared-payment retention leaves total cash and every ledger entry unchanged');
select results_eq('select * from public.finance_movements','select * from shared_movements','shared-payment retention preserves movement history');
select is(has_function_privilege('anon','public.cancel_finance_project_expectation(uuid,uuid,jsonb)','execute'),false,'anonymous cancellation execution denied');
select is(has_function_privilege('service_role','public.cancel_finance_project_expectation(uuid,uuid,jsonb)','execute'),false,'privileged client cannot bypass verified user RPC boundary');
select pg_temp.terms(300,'{"stream":"supervision","mode":"per_visit","amount":"3000","effectiveFrom":"2026-06-01"}');
select pg_temp.terms(301,'{"stream":"supervision","revision":1,"mode":"per_visit","amount":"4000","currency":"USD","effectiveFrom":"2026-09-01"}');
select public.create_calendar_event_with_invites(pg_temp.fid(1),'June visit','site_visit','2026-06-10T10:00Z','2026-06-10T11:00Z',false,pg_temp.fid(30),p_assignee_id=>pg_temp.fid(11));
select public.create_calendar_event_with_invites(pg_temp.fid(1),'September Kyiv visit','site_visit','2026-08-31T22:00Z','2026-08-31T23:00Z',false,pg_temp.fid(30),p_assignee_id=>pg_temp.fid(11));
select public.create_calendar_event_with_invites(pg_temp.fid(1),'Override visit','site_visit','2026-06-11T10:00Z','2026-06-11T11:00Z',false,pg_temp.fid(30),p_assignee_id=>pg_temp.fid(11));
create function pg_temp.visit_item(n integer,title text,term integer,amount text,currency text,pricing text default 'contract') returns uuid language sql as $$
 select pg_temp.item(n,jsonb_build_object('amount',amount,'currency',currency),jsonb_build_object('stream','supervision','source','visit','visitPricing',pricing,'visitTermsId',pg_temp.result(term),'visitId',(select id from public.calendar_events e where e.title=visit_item.title)))$$;
select throws_like($$select pg_temp.visit_item(310,'June visit',301,'4000','USD')$$,'%finance_project_visit_price_changed%','current price cannot masquerade as historical contract default');
select lives_ok($$select pg_temp.visit_item(310,'June visit',300,'3000','UAH')$$,'June visit uses historical rate and currency');
select lives_ok($$select pg_temp.visit_item(311,'September Kyiv visit',301,'4000','USD')$$,'Kyiv September boundary uses revised rate and currency');
select lives_ok($$select pg_temp.visit_item(312,'Override visit',300,'3500','UAH','manual')$$,'deliberate historical manual override supported');
select is((select amount from public.finance_expected_items where id=pg_temp.result(312)),3500::numeric,'manual override not replaced by default');
select is((select terms_id from public.finance_project_items where expected_item_id=pg_temp.result(312)),pg_temp.result(300),'manual price still links historical commercial terms');
select throws_like($$select pg_temp.visit_item(313,'June visit',300,'3000','UAH')$$,'%finance_project_visit_once%','duplicate visit billing rejected');
select pg_temp.close_item(314,310);
select throws_like($$select pg_temp.visit_item(313,'June visit',300,'3000','UAH')$$,'%finance_project_visit_once%','cancelled visit identity remains reserved');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select pg_temp.close_item(900,311)$$,'%finance_admin_required%','employee cannot cancel');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select throws_like($$select pg_temp.close_item(900,311)$$,'%finance_admin_required%','foreign admin cannot cancel');
select set_config('request.jwt.claim.sub',pg_temp.fid(13)::text,true);
select throws_like($$select pg_temp.close_item(900,311)$$,'%finance_admin_required%','inactive profile cannot cancel');
select set_config('request.jwt.claim.sub',pg_temp.fid(14)::text,true);
select throws_like($$select pg_temp.close_item(900,311)$$,'%finance_admin_required%','inactive membership cannot cancel');
reset role;
select * from finish();
rollback;
