begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('d5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Quick income A'),(pg_temp.fid(2),'Quick income B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
  select pg_temp.fid(n),'authenticated','authenticated','quick-income-'||n||'@test','{}','{}' from generate_series(10,12)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
  select pg_temp.fid(n),'Income tester','quick-income-'||n||'@test',case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.studio_members(studio_id,user_id,system_role)
  select pg_temp.fid(case when n=12 then 2 else 1 end),pg_temp.fid(n),case when n=11 then 'employee' else 'admin' end from generate_series(10,12)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
  values(pg_temp.fid(1),'UAH',current_date,pg_temp.fid(10)),(pg_temp.fid(2),'UAH',current_date,pg_temp.fid(12));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
  (pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',0,pg_temp.fid(10)),
  (pg_temp.fid(21),pg_temp.fid(1),'Dollar','USD',0,pg_temp.fid(10)),
  (pg_temp.fid(22),pg_temp.fid(2),'Foreign bank','UAH',0,pg_temp.fid(12));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values
  (pg_temp.fid(30),pg_temp.fid(1),'Quick income A',100,current_date,pg_temp.fid(10),'active'),
  (pg_temp.fid(31),pg_temp.fid(2),'Quick income B',100,current_date,pg_temp.fid(12),'active');
insert into public.contractor_categories(id,studio_id,name,color_key) values
  (pg_temp.fid(40),pg_temp.fid(1),'Builders','blue'),(pg_temp.fid(41),pg_temp.fid(2),'Builders','blue');
insert into public.contractors(id,category_id,name,created_by) values
  (pg_temp.fid(42),pg_temp.fid(40),'Local builder',pg_temp.fid(10)),(pg_temp.fid(43),pg_temp.fid(41),'Foreign builder',pg_temp.fid(12));
create function pg_temp.cat(key text) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key=key$$;
create function pg_temp.item(patch jsonb default '{}') returns jsonb language sql as $$select jsonb_build_object(
  'direction','incoming','amount','150','currency','UAH','categoryId',pg_temp.cat('contractor_bonus'),
  'description','Builder bonus','dueDate',current_date,'expectedDate',current_date,
  'commitment','agreed','certainty','fixed','established',true)||patch$$;
create function pg_temp.receipt(patch jsonb default '{}') returns jsonb language sql as $$select jsonb_build_object(
  'accountId',pg_temp.fid(20),'date',current_date,'fx',jsonb_build_object('rate','1','source','identity','effectiveDate',current_date))||patch$$;
create function pg_temp.quick(n integer,patch jsonb default '{}',project integer default 30) returns uuid language sql as $$
  select public.record_finance_project_income(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(project),
    jsonb_build_object('stream','contractor_bonus','contractorId',pg_temp.fid(42),'item',pg_temp.item(),'receipt',pg_temp.receipt())||patch)$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));

select lives_ok($$select pg_temp.quick(100)$$,'one call creates and fully settles a new bonus');
select is((select count(*) from public.finance_expected_items where studio_id=pg_temp.fid(1)),1::bigint,'one expectation');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),1::bigint,'one cash movement');
select is((select settled_amount from public.finance_expected_balances where studio_id=pg_temp.fid(1)),150::numeric,'full amount matched');
select is((select remaining_amount from public.finance_expected_balances where studio_id=pg_temp.fid(1)),0::numeric,'no phantom receivable');
select is((select stream from public.finance_project_items where studio_id=pg_temp.fid(1)),'contractor_bonus','bonus classification retained');
select is((select contractor_id from public.finance_project_items where studio_id=pg_temp.fid(1)),pg_temp.fid(42),'contractor identity retained');
select is((select collected_amount from public.finance_project_totals where studio_id=pg_temp.fid(1) and stream='contractor_bonus'),150::numeric,'project totals include the receipt once');
select lives_ok($$select pg_temp.quick(100)$$,'lost-response retry succeeds');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),1::bigint,'retry posts no duplicate cash');
select is((select count(*) from public.finance_expected_items where studio_id=pg_temp.fid(1)),1::bigint,'retry creates no duplicate expectation');
select throws_like($$select pg_temp.quick(100,jsonb_build_object('item',pg_temp.item('{"amount":"200"}')))$$,'%finance_request_conflict%','changed retry rejected');

create temporary table before_failure as select count(*) as requests from public.finance_planning_requests where studio_id=pg_temp.fid(1);
select throws_like($$select pg_temp.quick(101,jsonb_build_object('receipt',pg_temp.receipt(jsonb_build_object('date',current_date+1))))$$,'%finance_input_invalid%','posting rejects a future cash date after creating the child expectation');
select is((select count(*) from public.finance_expected_items where studio_id=pg_temp.fid(1)),1::bigint,'failed posting rolls back the new expectation');
select is((select count(*) from public.finance_movements where studio_id=pg_temp.fid(1)),1::bigint,'failed posting leaves no cash');
select is((select count(*) from public.finance_planning_requests where studio_id=pg_temp.fid(1)),(select requests from before_failure),'failed posting rolls back all child request records');
select throws_like($$select pg_temp.quick(102,jsonb_build_object('receipt',pg_temp.receipt(jsonb_build_object('accountId',pg_temp.fid(21)))))$$,'%finance_input_invalid%','account currency must match the actual receipt currency');
select throws_like($$select pg_temp.quick(103,'{}',31)$$,'%finance_project_invalid%','foreign project rejected');
select throws_like($$select pg_temp.quick(104,jsonb_build_object('contractorId',pg_temp.fid(43)))$$,'%finance_project_contractor_invalid%','foreign contractor rejected');
select throws_like($$select pg_temp.quick(105,jsonb_build_object('receipt',pg_temp.receipt(jsonb_build_object('accountId',pg_temp.fid(22)))))$$,'%finance_input_invalid%','foreign account rejected');
select throws_like($$select pg_temp.quick(106,jsonb_build_object('item',pg_temp.item('{"amount":"-1"}')))$$,'%finance_amount_invalid%','invalid amounts retain existing validation');
select throws_like($$select pg_temp.quick(107,jsonb_build_object('item',pg_temp.item(jsonb_build_object('id',(select id from public.finance_expected_items where studio_id=pg_temp.fid(1))))))$$,'%finance_input_invalid%','shortcut cannot modify an existing expectation');
select throws_like($$select pg_temp.quick(108,'{"stream":"design"}')$$,'%finance_input_invalid%','contract payments cannot bypass their own flow');
select throws_like($$select pg_temp.quick(109,'{"stream":"supervision"}')$$,'%finance_input_invalid%','supervision retains its specialized flow');
select throws_like($$select pg_temp.quick(110,jsonb_build_object('item',pg_temp.item('{"direction":"outgoing"}')))$$,'%finance_input_invalid%','shortcut cannot post an expense');
select throws_like($$select pg_temp.quick(111,jsonb_build_object('item',pg_temp.item('{"certainty":"estimated"}')))$$,'%finance_input_invalid%','received money cannot be an estimated expectation');
select lives_ok($$select pg_temp.quick(112,jsonb_build_object('stream','other','contractorId','',
  'item',pg_temp.item(jsonb_build_object('categoryId',pg_temp.cat('other_income')))))$$,'other income uses the same atomic path');
select is((select collected_amount from public.finance_project_totals where studio_id=pg_temp.fid(1) and stream='other'),150::numeric,'other income retains its own totals');

select ok(not has_function_privilege('anon','public.record_finance_project_income(uuid,uuid,uuid,jsonb)','execute'),'anonymous execution revoked');
select ok(not has_function_privilege('service_role','public.record_finance_project_income(uuid,uuid,uuid,jsonb)','execute'),'service execution not granted');
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_like($$select pg_temp.quick(120)$$,'%finance_admin_required%','employee cannot record income');
select set_config('request.jwt.claim.sub',pg_temp.fid(12)::text,true);
select throws_like($$select pg_temp.quick(121)$$,'%finance_admin_required%','other studio admin cannot record income');
select * from finish();
rollback;
