begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('76000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month() returns date language sql stable as $$select date_trunc('month',pg_temp.today())::date$$;
create function pg_temp.result(n integer) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.cat(key text) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key=key$$;
create function pg_temp.rec(n integer,kind text,source uuid,value text,fx jsonb default null) returns uuid language sql as $$
  select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(n),jsonb_build_object('sourceKind',kind,'sourceId',source,
    'classification','revenue','projectId',pg_temp.fid(30),'amount',value,'date',pg_temp.today(),'periodStart',pg_temp.month(),
    'periodEnd',pg_temp.today(),'description','Earned services','reason','Reviewed services','fx',fx))$$;
create function pg_temp.remaining(source uuid) returns numeric language sql as $$
  select (s->>'remaining')::numeric from jsonb_array_elements(public.get_finance_recognition_sources(pg_temp.fid(1))) s where s->>'sourceId'=source::text$$;

insert into public.studios(id,name) values(pg_temp.fid(1),'Order reporting A'),(pg_temp.fid(2),'Order reporting B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(pg_temp.fid(10),'authenticated','authenticated','order-reporting@test','{}','{}',now(),now()),
    (pg_temp.fid(11),'authenticated','authenticated','order-reporting-employee@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active)
  values(pg_temp.fid(10),'Admin','order-reporting@test','admin',true),(pg_temp.fid(11),'Employee','order-reporting-employee@test','employee',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active)
  values(pg_temp.fid(1),pg_temp.fid(10),'admin',true),(pg_temp.fid(1),pg_temp.fid(11),'employee',true);
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
  values(pg_temp.fid(1),'UAH',pg_temp.month(),pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
  values(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',0,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
  values(pg_temp.fid(30),pg_temp.fid(1),'One operational Project',100,pg_temp.month(),pg_temp.fid(10),'active');
insert into public.finance_project_orders(id,studio_id,project_id,name,is_default,status,created_by,updated_by,confirmed_at)
  values(pg_temp.fid(40),pg_temp.fid(1),pg_temp.fid(30),'Interior',true,'confirmed',pg_temp.fid(10),pg_temp.fid(10),now()),
    (pg_temp.fid(41),pg_temp.fid(1),pg_temp.fid(30),'Facade',false,'confirmed',pg_temp.fid(10),pg_temp.fid(10),now()),
    (pg_temp.fid(42),pg_temp.fid(1),pg_temp.fid(30),'EUR services',false,'confirmed',pg_temp.fid(10),pg_temp.fid(10),now()),
    (pg_temp.fid(43),pg_temp.fid(1),pg_temp.fid(30),'Unconfirmed commission',false,'draft',pg_temp.fid(10),pg_temp.fid(10),null);
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(80),pg_temp.month());
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(90),pg_temp.fid(30),jsonb_build_object('orderId',pg_temp.fid(40),
  'stream','design','revision',0,'mode','design','amount','100','currency','UAH','reason','Interior accepted'));
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(91),pg_temp.fid(30),jsonb_build_object('orderId',pg_temp.fid(41),
  'stream','design','revision',0,'mode','design','amount','200','currency','UAH','reason','Facade accepted'));
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(92),pg_temp.fid(30),jsonb_build_object('orderId',pg_temp.fid(42),
  'stream','design','revision',0,'mode','design','amount','500','currency','EUR','reason','EUR services accepted'));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(93),pg_temp.fid(30),jsonb_build_object('orderId',pg_temp.fid(40),
  'stream','design','item',jsonb_build_object('direction','incoming','amount','100','currency','UAH','categoryId',pg_temp.cat('project_payments'),
    'description','Interior advance','dueDate',pg_temp.today(),'commitment','agreed','certainty','fixed','established',true)));
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(94),pg_temp.fid(30),jsonb_build_object('orderId',pg_temp.fid(41),
  'stream','design','item',jsonb_build_object('direction','incoming','amount','200','currency','UAH','categoryId',pg_temp.cat('project_payments'),
    'description','Facade advance','dueDate',pg_temp.today(),'commitment','agreed','certainty','fixed','established',true)));

-- Emulate an existing immutable recognition snapshot written before orders existed.
reset role;
insert into public.finance_recognition_entries(id,studio_id,classification,source_kind,terms_id,project_id,category_id,source_snapshot,
  period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,reporting_amount,
  fx_rate,fx_source,fx_effective_date,reason,created_by)
values(pg_temp.fid(300),pg_temp.fid(1),'revenue','project_terms',pg_temp.result(90),pg_temp.fid(30),pg_temp.cat('project_payments'),
  jsonb_build_object('stream','design','currency','UAH','recognitionDate',pg_temp.today()),pg_temp.month(),pg_temp.today(),pg_temp.today(),
  'Historical performed services','UAH',60,0,60,'UAH',60,1,'identity',pg_temp.today(),'Historical fact',pg_temp.fid(10));
set local role authenticated;
select is(pg_temp.remaining(pg_temp.result(90)),40::numeric,'historical recognition consumes only its order allowance');
select is(pg_temp.remaining(pg_temp.result(91)),200::numeric,'same-currency additional order retains independent allowance');
select is(pg_temp.remaining(pg_temp.result(93)),40::numeric,'expected source availability is capped by the same order allowance');
select throws_like($$select pg_temp.rec(100,'project_terms',pg_temp.result(90),'41')$$,'%finance_recognition_over_source%',
  'terms recognition cannot borrow unused allowance from another order');
select throws_like($$select pg_temp.rec(101,'expected',pg_temp.result(93),'41')$$,'%finance_recognition_over_source%',
  'payment recognition cannot borrow unused allowance from another order');
select lives_ok($$select pg_temp.rec(102,'expected',pg_temp.result(94),'140')$$,'independent facade payment services can be recognized');
select is(pg_temp.remaining(pg_temp.result(91)),60::numeric,'terms and payment recognitions share that order capacity');
select lives_ok($$select pg_temp.rec(103,'project_terms',pg_temp.result(90),'40')$$,'initial order residual recognizes independently');
select is(pg_temp.remaining(pg_temp.result(90)),0::numeric,'initial order capacity is fully consumed');
select is(pg_temp.remaining(pg_temp.result(91)),60::numeric,'initial recognition does not consume facade capacity');
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(95),pg_temp.fid(30),jsonb_build_object('orderId',pg_temp.fid(40),
  'stream','design','revision',1,'mode','design','amount','150','currency','UAH','reason','Interior amended'));
select is(pg_temp.remaining(pg_temp.result(95)),50::numeric,'new terms revision retains prior order recognition consumption');
select lives_ok($$select pg_temp.rec(104,'project_terms',pg_temp.result(92),'500',jsonb_build_object('rate','42','source','manual','effectiveDate',pg_temp.today()))$$,
  'mixed-currency additional order recognizes independently');
select is((select row(currency,amount,reporting_amount,fx_rate) from public.finance_recognition_entries where id=pg_temp.result(104)),
  row('EUR'::text,500::numeric,21000::numeric,42::numeric),'additional order retains its native and historical valuation');
select throws_like($$select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(96),pg_temp.fid(30),jsonb_build_object('orderId',pg_temp.fid(42),
  'stream','design','revision',1,'mode','design','amount','500','currency','USD','reason','Invalid currency change'))$$,
  '%finance_recognition_currency_locked%','recognized order cannot change its native currency');
select throws_like($$select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(97),pg_temp.fid(30),jsonb_build_object('orderId',pg_temp.fid(43),
  'stream','design','revision',0,'mode','design','amount','1000','currency','UAH','reason','Not accepted'))$$,
  '%finance_project_order_unconfirmed%','draft cannot become a recognition source through direct terms writes');
select is(jsonb_array_length(public.get_finance_project_reporting(pg_temp.fid(1))->'contracts'),3,'project contract report includes all confirmed orders only');
select ok(not exists(select 1 from jsonb_array_elements(public.get_finance_recognition_sources(pg_temp.fid(1))) s
  where s->>'orderId'=pg_temp.fid(43)::text),'draft absent from operational recognition sources');
select ok(exists(select 1 from jsonb_array_elements(public.get_finance_recognition_sources(pg_temp.fid(1))) s
  where s->>'orderId'=pg_temp.fid(41)::text and s->>'orderName'='Facade'),'recognition selector exposes order identity');
select is((select e->>'order_id' from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.fid(1))->'entries') e
  where e->>'id'=pg_temp.fid(300)::text),pg_temp.fid(40)::text,'historical terms foreign key resolves order in reporting');
select is((select e->>'order_id' from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.fid(1))->'entries') e
  where e->>'id'=pg_temp.result(102)::text),pg_temp.fid(41)::text,'historical expected-item foreign key resolves order in reporting');
select ok(not (select source_snapshot ? 'order_id' from public.finance_recognition_entries where id=pg_temp.fid(300)),
  'reading the new ownership leaves the historical snapshot unchanged');
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(110),pg_temp.fid(300),jsonb_build_object('operation','cancel','reason','Historical fact correction'));
select is(pg_temp.remaining(pg_temp.result(95)),110::numeric,'reversal releases only its original order allowance');
select is((select e->>'order_id' from jsonb_array_elements(public.get_finance_management_reporting(pg_temp.fid(1))->'entries') e
  where e->>'id'=pg_temp.result(110)::text),pg_temp.fid(40)::text,'reversal retains order lineage without snapshot rewrites');
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(111),pg_temp.result(102),jsonb_build_object('operation','adjustment','amount','40','date',pg_temp.today(),'reason','Facade scope reduction'));
select is(pg_temp.remaining(pg_temp.result(91)),100::numeric,'economic adjustment restores capacity only for its order');
select is((select sum(reporting_amount) from public.finance_recognition_entries where terms_id=pg_temp.result(92)),21000::numeric,
  'other-order adjustments preserve historical foreign-currency valuation');
select throws_like($$select public.get_finance_management_reporting(pg_temp.fid(2))$$,'%finance_admin_required%','cross-studio reporting remains denied');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select public.get_finance_recognition_sources(pg_temp.fid(1))$$,'%finance_admin_required%','employee cannot inspect recognition sources');
select is(private.finance_recognition_order(pg_temp.fid(1),pg_temp.fid(300)),null::uuid,'ownership helper observes underlying RLS');
select * from finish();
rollback;
