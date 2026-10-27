begin;
-- Plain transaction-scoped assertions: no extension or test-environment changes.
create function pg_temp.assert_true(value boolean,label text) returns text language plpgsql as $$begin
 if value is distinct from true then raise exception 'FAILED: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.assert_equal(actual anyelement,expected anyelement,label text) returns text language plpgsql as $$begin
 if actual is distinct from expected then raise exception 'FAILED: % (actual %, expected %)',label,actual,expected;end if;return 'PASS: '||label;end$$;
create function pg_temp.expect_error(statement text,pattern text,label text) returns text language plpgsql as $$declare failure text;begin
 begin execute statement;exception when others then failure:=sqlerrm;end;
 if failure is null or failure not like pattern then raise exception 'FAILED: % (error %)',label,failure;end if;return 'PASS: '||label;end$$;
create function pg_temp.expect_success(statement text,label text) returns text language plpgsql as $$begin execute statement;return 'PASS: '||label;end$$;
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('87000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month() returns date language sql stable as $$select date_trunc('month',pg_temp.today())::date$$;
create function pg_temp.result(n integer) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.terms(n integer,o integer,value text,code text default 'UAH') returns uuid language sql as $$
 select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(30),jsonb_build_object('orderId',pg_temp.fid(o),'stream','design','mode','design',
 'revision',coalesce((select revision from public.finance_project_current_terms where studio_id=pg_temp.fid(1) and order_id=pg_temp.fid(o)),0),
 'amount',value,'currency',code,'vatRate','20','priceBasis','net','reason','Signed contractual services'))$$;
create function pg_temp.milestone(n integer,o integer,value text,condition text default 'delivery') returns uuid language sql as $$
 select public.save_finance_earning_milestone(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(30),pg_temp.fid(o),
 jsonb_build_object('title','Deliverable '||n,'netAmount',value,'condition',condition,'revision',0))$$;
create function pg_temp.fulfill(n integer,m uuid,kind text default 'delivery',day date default pg_temp.today(),fx jsonb default null) returns uuid language sql as $$
 select public.fulfill_finance_earning_milestone(pg_temp.fid(1),pg_temp.fid(n),m,jsonb_build_object('intent','fulfill','revision',1,'kind',kind,'date',day,'confirmed',true,'fx',fx))$$;
create function pg_temp.revenue(o integer) returns numeric language sql as $$
 select coalesce(sum(r.amount),0) from public.finance_recognition_entries r where r.studio_id=pg_temp.fid(1) and r.classification='revenue' and private.finance_recognition_order(r.studio_id,r.id)=pg_temp.fid(o)$$;
create function pg_temp.recognize(n integer,o integer,value text) returns uuid language sql as $$
 select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('sourceKind','project_terms','sourceId',(select id from public.finance_project_current_terms where order_id=pg_temp.fid(o)),
 'classification','revenue','projectId',pg_temp.fid(30),'amount',value,'date',pg_temp.today(),'periodStart',pg_temp.today(),'periodEnd',pg_temp.today(),'description','Manual services','reason','Reviewed'))$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Earning tests'),(pg_temp.fid(2),'Other tenant');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.fid(10),'authenticated','authenticated','earning-admin@test','{}','{}',now(),now()),(pg_temp.fid(11),'authenticated','authenticated','earning-employee@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active) values(pg_temp.fid(10),'Admin','earning-admin@test','admin',true),(pg_temp.fid(11),'Employee','earning-employee@test','employee',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active) values(pg_temp.fid(1),pg_temp.fid(10),'admin',true),(pg_temp.fid(1),pg_temp.fid(11),'employee',true);
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'UAH',pg_temp.month(),pg_temp.fid(10)),(pg_temp.fid(2),'UAH',pg_temp.month(),pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',0,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values(pg_temp.fid(30),pg_temp.fid(1),'Contract project',100,pg_temp.month(),pg_temp.fid(10),'active');
insert into public.finance_project_orders(id,studio_id,project_id,name,is_default,status,created_by,updated_by,confirmed_at)
select pg_temp.fid(n),pg_temp.fid(1),pg_temp.fid(30),'Order '||n,n=40,'confirmed',pg_temp.fid(10),pg_temp.fid(10),now() from generate_series(40,45) n;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select pg_temp.terms(90,40,'1000'),pg_temp.terms(91,41,'600'),pg_temp.terms(92,42,'100','USD'),pg_temp.terms(93,43,'300'),pg_temp.terms(94,44,'500'),pg_temp.terms(95,45,'100');
select pg_temp.milestone(100,40,'400'),pg_temp.milestone(101,40,'600','acceptance');
select pg_temp.expect_error($$select pg_temp.milestone(102,40,'0.01')$$,'%finance_earning_over_contract%','milestones cannot overallocate net order value');
select pg_temp.assert_equal((public.get_finance_project_earnings(pg_temp.fid(1))->'orders'->0->>'complete')::boolean,true,'full earning plan is complete');
select pg_temp.assert_equal(pg_temp.revenue(40),0::numeric,'configured milestones do not recognize income');
-- Cash, advances and dated payment expectations never fulfill earning conditions.
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(110),pg_temp.fid(30),jsonb_build_object('orderId',pg_temp.fid(40),'stream','design','useAgreementBasis',true,'item',jsonb_build_object(
 'direction','incoming','amount','100','currency','UAH','categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='project_payments'),
 'description','Advance','dueDate',pg_temp.today(),'expectedDate',pg_temp.today(),'commitment','agreed','certainty','fixed','established',true)));
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(111),pg_temp.result(110),jsonb_build_object('kind','incoming','date',pg_temp.today(),'amount','120','accountId',pg_temp.fid(20),'categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='project_payments')),120);
select pg_temp.assert_equal(pg_temp.revenue(40),0::numeric,'advance and due dates do not create earned revenue');
select pg_temp.fulfill(120,pg_temp.result(100));
select pg_temp.assert_equal(pg_temp.revenue(40),0::numeric,'inactive accounting does not silently recognize');
select pg_temp.assert_equal((select exception from public.finance_project_earning_attempts where event_id=pg_temp.result(120)),'finance_recognition_inactive','inactive accounting creates an actionable exception');
select pg_temp.assert_equal((select count(*) from public.finance_project_earning_events),1::bigint,'delivery evidence survives recognition exception');
select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(121),pg_temp.month());
select set_config('test.earning_event',pg_temp.result(120)::text,true);
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select public.process_finance_pending_source(pg_temp.fid(1),'earning',current_setting('test.earning_event')::uuid);
reset role;
select pg_temp.assert_equal((select created_by from public.finance_recognition_entries where earning_event_id=current_setting('test.earning_event')::uuid),pg_temp.fid(10),'service worker retains the confirmed event author without impersonation');
select pg_temp.assert_equal((select attempted_by from public.finance_project_earning_attempts where event_id=current_setting('test.earning_event')::uuid and entry_id is not null),pg_temp.fid(10),'automatic attempts retain original evidence authorship');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select pg_temp.assert_equal(pg_temp.revenue(40),400::numeric,'only delivered share is earned');
select pg_temp.assert_equal((select row(amount,vat_amount,gross_amount,recognized_on) from public.finance_recognition_entries where earning_event_id=pg_temp.result(120)),row(400::numeric,80::numeric,480::numeric,pg_temp.today()),'derived net/VAT/gross and actual date are preserved');
select pg_temp.expect_success($$select pg_temp.fulfill(123,pg_temp.result(100))$$,'repeated delivery is idempotent');
select pg_temp.expect_success($$select pg_temp.fulfill(123,pg_temp.result(100))$$,'same request retry is idempotent');
select pg_temp.assert_equal(pg_temp.revenue(40),400::numeric,'retries cannot duplicate revenue');
select pg_temp.expect_error($$select pg_temp.fulfill(124,pg_temp.result(100),'delivery',pg_temp.today()-1)$$,'%finance_earning_event_conflict%','different event date cannot rewrite history');
select pg_temp.fulfill(125,pg_temp.result(101));
select pg_temp.assert_equal(pg_temp.revenue(40),400::numeric,'delivery does not earn acceptance-required revenue');
select pg_temp.fulfill(126,pg_temp.result(101),'acceptance');
select pg_temp.assert_equal(pg_temp.revenue(40),1000::numeric,'acceptance earns remaining share');
select pg_temp.assert_equal((select count(*) from public.finance_recognition_entries where classification='revenue' and project_id=pg_temp.fid(30)),2::bigint,'multiple milestones create separate earned facts');
select pg_temp.expect_error($$select pg_temp.recognize(130,40,'1')$$,'%finance_earning_plan_owned%','generic contract path cannot duplicate milestone earnings');
select pg_temp.expect_error($$select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(131),jsonb_build_object('sourceKind','expected','sourceId',pg_temp.result(110),'classification','revenue','projectId',pg_temp.fid(30),'amount','1','date',pg_temp.today(),'periodStart',pg_temp.today(),'periodEnd',pg_temp.today(),'description','Duplicate','reason','Duplicate'))$$,'%finance_recognition_over_source%','payment expectation path cannot duplicate milestone earnings');
select pg_temp.expect_error($$select public.save_finance_earning_milestone(pg_temp.fid(1),pg_temp.fid(132),pg_temp.fid(30),pg_temp.fid(40),jsonb_build_object('id',pg_temp.result(100),'revision',1,'title','Changed','netAmount','399','condition','delivery'))$$,'%finance_earning_history_protected%','fulfilled definitions are immutable');
select pg_temp.expect_error($$select pg_temp.terms(133,40,'999')$$,'%finance_earning_over_contract%','contract cannot shrink below recognized amount');
select pg_temp.expect_success($$select pg_temp.terms(134,40,'1200')$$,'contract increase preserves earned history');
select pg_temp.assert_equal(pg_temp.revenue(40),1000::numeric,'contract edits do not restate earned revenue');
-- Order ownership and previously entered manual recognition.
select pg_temp.recognize(140,41,'100');
select pg_temp.milestone(141,41,'200');
select pg_temp.fulfill(142,pg_temp.result(141));
select pg_temp.assert_equal(pg_temp.revenue(41),100::numeric,'legacy manual income is not guessed into a second earning event');
select pg_temp.assert_equal((select exception from public.finance_project_earning_attempts where event_id=pg_temp.result(142)),'finance_earning_manual_history','manual overlap requires explicit reconciliation');
select pg_temp.milestone(145,43,'300');select pg_temp.fulfill(146,pg_temp.result(145));
select pg_temp.assert_equal(pg_temp.revenue(43),300::numeric,'another order has its own allowance');
-- Historical valuation and technical correction/reversal reuse existing core.
select pg_temp.milestone(150,42,'100');
select pg_temp.fulfill(151,pg_temp.result(150),'delivery',greatest(pg_temp.month(),pg_temp.today()-1),jsonb_build_object('rate','40','source','manual','effectiveDate',greatest(pg_temp.month(),pg_temp.today()-1)));
select pg_temp.assert_equal((select reporting_amount from public.finance_recognition_entries where earning_event_id=pg_temp.result(151)),4000::numeric,'event uses historical FX snapshot');
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(152),(select id from public.finance_recognition_entries where earning_event_id=pg_temp.result(146)),jsonb_build_object('operation','correction','reason','Correct amount',
 'replacement',jsonb_build_object('sourceKind','project_terms','sourceId',pg_temp.result(93),'classification','revenue','projectId',pg_temp.fid(30),'amount','250','date',pg_temp.today(),'periodStart',pg_temp.today(),'periodEnd',pg_temp.today(),'description','Corrected deliverable','reason','Controlled correction')));
select pg_temp.assert_equal(pg_temp.revenue(43),250::numeric,'controlled correction preserves event ownership and corrected total');
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(153),pg_temp.result(152),jsonb_build_object('operation','cancel','reason','Mistaken recognition'));
select pg_temp.expect_success($$select public.fulfill_finance_earning_milestone(pg_temp.fid(1),pg_temp.fid(154),pg_temp.result(145),'{"intent":"retry"}')$$,'retry after reversal does not replay event');
select pg_temp.assert_equal(pg_temp.revenue(43),0::numeric,'reversed earning stays reversed');
select pg_temp.assert_equal((select count(*) from public.finance_recognition_entries where earning_event_id=pg_temp.result(146) and kind='recognition'),2::bigint,'only original and controlled replacement exist');
-- A second event on the same foreign order retains an unresolved valuation until repaired.
select pg_temp.terms(155,42,'200','USD');
select pg_temp.milestone(156,42,'100');select pg_temp.fulfill(157,pg_temp.result(156));
select pg_temp.assert_equal((select reporting_amount from public.finance_recognition_entries where earning_event_id=pg_temp.result(157)),null::numeric,'missing FX remains unresolved instead of guessed');
select pg_temp.assert_equal((select m->>'exception' from jsonb_array_elements(public.get_finance_project_earnings(pg_temp.fid(1))->'milestones') m where m->>'id'=pg_temp.result(156)::text),'finance_fx_unavailable','missing FX is an actionable reporting exception');
select public.process_finance_pending_source(pg_temp.fid(1),'earning',pg_temp.result(157),jsonb_build_object('rate','41','source','manual','effectiveDate',pg_temp.today()));
select public.process_finance_pending_source(pg_temp.fid(1),'earning',pg_temp.result(157),jsonb_build_object('rate','99','source','manual','effectiveDate',pg_temp.today()));
select pg_temp.assert_equal((select reporting_amount from public.finance_recognition_entries where earning_event_id=pg_temp.result(157)),4100::numeric,'retry fills only missing valuation');
select pg_temp.assert_equal((select reporting_amount from public.finance_recognition_entries where earning_event_id=pg_temp.result(151)),4000::numeric,'repair does not restate older historical FX');

select pg_temp.assert_equal((select count(*) from public.finance_recognition_entries where earning_event_id=pg_temp.result(157) and kind='recognition'),1::bigint,'repeated workers value the original recognition without duplicating it');
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.prepare_finance_automatic_expenses(pg_temp.fid(1))) c where c->>'sourceId'=pg_temp.result(142)::text),'permanent manual-history conflicts are not automatically retried');
select public.process_finance_pending_source(pg_temp.fid(1),'earning',pg_temp.result(142));
select pg_temp.assert_equal((select count(*) from public.finance_project_earning_attempts where event_id=pg_temp.result(142)),1::bigint,'direct worker calls retain permanent conflict diagnostics without repeated attempts');
select public.process_finance_pending_source(pg_temp.fid(1),'earning',pg_temp.result(146));
select pg_temp.assert_equal(pg_temp.revenue(43),0::numeric,'worker never restores a reversed earning');
-- Historical boundary, stale definitions, missing FX and unconfigured coverage.
select pg_temp.milestone(160,44,'200');select pg_temp.fulfill(161,pg_temp.result(160),'delivery',pg_temp.month()-1);
select pg_temp.assert_equal(pg_temp.revenue(44),0::numeric,'pre-activation delivery is never shifted to today');
select pg_temp.assert_equal((select exception from public.finance_project_earning_attempts where event_id=pg_temp.result(161)),'finance_input_invalid','historical date has a clear boundary exception');
select public.process_finance_pending_source(pg_temp.fid(1),'earning',pg_temp.result(161));
select pg_temp.assert_equal(pg_temp.revenue(44),0::numeric,'worker cannot move a pre-activation event into the permitted period');
select pg_temp.milestone(162,44,'300');select pg_temp.terms(163,44,'600');select pg_temp.fulfill(164,pg_temp.result(162));
select pg_temp.assert_equal(pg_temp.revenue(44),0::numeric,'contract changes require explicit milestone reconciliation');
select pg_temp.assert_equal((select exception from public.finance_project_earning_attempts where event_id=pg_temp.result(164)),'finance_earning_plan_stale','stale terms are reported');
select pg_temp.assert_equal((select (o->>'configured')::boolean from jsonb_array_elements(public.get_finance_project_earnings(pg_temp.fid(1))->'orders') o where o->>'orderId'=pg_temp.fid(45)::text),false,'unconfigured order is explicitly marked incomplete');
select public.save_finance_earning_milestone(pg_temp.fid(1),pg_temp.fid(165),pg_temp.fid(30),pg_temp.fid(45),jsonb_build_object('title','Half of order','percentage','50','revision',0,'condition','delivery','stage','stage_1'));
select pg_temp.assert_equal((select net_amount from public.finance_project_earning_milestones where id=pg_temp.result(165)),50::numeric,'explicit percentage uses eligible net contract amount');
select pg_temp.assert_equal((select (o->>'complete')::boolean from jsonb_array_elements(public.get_finance_project_earnings(pg_temp.fid(1))->'orders') o where o->>'orderId'=pg_temp.fid(45)::text),false,'partially configured earnings are not complete');
select public.save_finance_earning_milestone(pg_temp.fid(1),pg_temp.fid(166),pg_temp.fid(30),pg_temp.fid(45),jsonb_build_object('id',pg_temp.result(165),'revision',1,'title','Corrected definition','netAmount','100','condition','delivery'));
select pg_temp.assert_equal((select net_amount from public.finance_project_earning_milestones where id=pg_temp.result(165)),100::numeric,'unfulfilled definition can be amended explicitly');
select pg_temp.assert_true(public.get_finance_management_reporting(pg_temp.fid(1)) ? 'earnings','P&L reporting exposes earning coverage');
select pg_temp.expect_error($$select public.get_finance_project_earnings(pg_temp.fid(2))$$,'%finance_admin_required%','cross-tenant reads are rejected');
select pg_temp.expect_error($$select public.void_unrecognized_earning_milestone(pg_temp.fid(1),pg_temp.fid(180),pg_temp.result(100),'Wrong event')$$,'%finance_earning_history_protected%','posted earnings cannot use the unposted-event correction path');
select public.void_unrecognized_earning_milestone(pg_temp.fid(1),pg_temp.fid(181),pg_temp.result(162),'Wrong contractual definition; configure a corrected deliverable');
select pg_temp.assert_equal((select active from public.finance_project_earning_milestones where id=pg_temp.result(162)),false,'unposted mistaken milestone can be closed explicitly');
select pg_temp.assert_equal((select count(*) from public.finance_project_earning_events where milestone_id=pg_temp.result(162)),2::bigint,'original fulfillment and reasoned void both remain in history');
select pg_temp.expect_error($$select public.fulfill_finance_earning_milestone(pg_temp.fid(1),pg_temp.fid(182),pg_temp.result(162),'{"intent":"retry"}')$$,'%finance_earning_event_invalid%','closed unposted evidence cannot be replayed');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select pg_temp.assert_equal((select count(*) from public.finance_project_earning_milestones),0::bigint,'employee cannot read financial milestones');
select pg_temp.expect_error($$select pg_temp.milestone(170,45,'100')$$,'%finance_admin_required%','employee cannot configure earnings');
select pg_temp.expect_error($$select pg_temp.fulfill(171,pg_temp.result(100))$$,'%finance_admin_required%','employee cannot confirm delivery');
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select pg_temp.expect_error($$update public.finance_project_earning_events set occurred_on=occurred_on-1$$,'%permission denied%','events have no direct update grant');
select pg_temp.expect_error($$insert into public.finance_project_earning_milestones(studio_id,project_id,order_id,terms_id,title,net_amount,created_by) values(pg_temp.fid(1),pg_temp.fid(30),pg_temp.fid(45),pg_temp.result(95),'Bypass',1,pg_temp.fid(10))$$,'%permission denied%','direct milestone writes cannot bypass guarded RPCs');

rollback;
