begin;
select no_plan();
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$select ('79500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.pid(1),'Proposal design test');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.pid(10),'authenticated','authenticated','proposal-design@test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role,is_active)
values(pg_temp.pid(10),'Proposal admin','proposal-design@test','admin',true);
insert into public.studio_members(studio_id,user_id,system_role) values(pg_temp.pid(1),pg_temp.pid(10),'admin');
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.pid(1),'EUR','2026-09-01',pg_temp.pid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values(pg_temp.pid(20),pg_temp.pid(1),'Bank','EUR',0,pg_temp.pid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
values(pg_temp.pid(30),pg_temp.pid(1),'336 Proposal',100,'2026-09-01',pg_temp.pid(10),'active');
create function pg_temp.presentation(source jsonb) returns jsonb language sql as $$
  select jsonb_build_object('projectTitle',source->>'projectTitle','clientName',source->>'clientName','contact',source->>'contact','address',source->>'address','intro','')
$$;
create function pg_temp.save(source jsonb,presentation jsonb,request integer) returns uuid
language sql security definer set search_path='' as $$
  select public.save_finance_project_proposal(pg_temp.pid(1),pg_temp.pid(30),pg_temp.pid(request),source,presentation,'JVBERi0=',pg_temp.pid(10))
$$;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.pid(1));
select public.save_finance_project_plan(pg_temp.pid(1),pg_temp.pid(100),pg_temp.pid(30),jsonb_build_object(
  'revision',0,'pricingMethod','fixed','amount','4000','currency','EUR','vatRate','23','priceBasis','net','revenueTaxRate','6','reason','Agreement','known','[]'::jsonb,
  'items',jsonb_build_array(jsonb_build_object('id','','name','Аванс','amount','1200','percentage','30'),jsonb_build_object('id','','name','Концепція','amount','2000','percentage','50'),jsonb_build_object('id','','name','Фінальний платіж','amount','800','percentage','20'))));
create temporary table first_source as select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30)) as source;
select lives_ok($$select pg_temp.save(source,pg_temp.presentation(source),200) from first_source$$,'missing design saves with the original default');
select is((select snapshot->>'designVariant' from public.finance_project_proposals where revision=1),'classic','new snapshots explicitly store the original default');
select lives_ok($$select pg_temp.save(source,pg_temp.presentation(source),200) from first_source$$,'defaulted variant preserves lost-response idempotency');
create temporary table frozen as select snapshot,pdf from public.finance_project_proposals where revision=1;
create temporary table next_source as select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30)) as source;
select throws_like($$select pg_temp.save(source,pg_temp.presentation(source)||' {"designVariant":"unknown"}'::jsonb,201) from next_source$$,'%finance_input_invalid%','unknown design rejected at SQL boundary');
select throws_like($$select pg_temp.save(source,pg_temp.presentation(source)||' {"designVariant":null}'::jsonb,201) from next_source$$,'%finance_input_invalid%','null design rejected');
select throws_like($$select pg_temp.save(source,pg_temp.presentation(source)||' {"designVariant":23}'::jsonb,201) from next_source$$,'%finance_input_invalid%','non-string design rejected');
select lives_ok($$select pg_temp.save(source,pg_temp.presentation(source)||' {"designVariant":"measured-space"}'::jsonb,202) from next_source$$,'Measured Space saves');
select lives_ok($$select pg_temp.save(source,pg_temp.presentation(source)||' {"designVariant":"measured-space"}'::jsonb,202) from next_source$$,'same design retry is idempotent');
select throws_like($$select pg_temp.save(source,pg_temp.presentation(source)||' {"designVariant":"quiet-monument"}'::jsonb,202) from next_source$$,'%finance_request_conflict%','retry cannot change a saved design');
select lives_ok($$select pg_temp.save(s,pg_temp.presentation(s)||' {"designVariant":"quiet-monument"}'::jsonb,203) from (select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30)) s) q$$,'Quiet Monument saves as a later revision');
select lives_ok($$select pg_temp.save(s,pg_temp.presentation(s)||' {"designVariant":"folded-plane"}'::jsonb,204) from (select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30)) s) q$$,'Folded Plane saves as a later revision');
select is((select string_agg(snapshot->>'designVariant',',' order by revision) from public.finance_project_proposals),'classic,measured-space,quiet-monument,folded-plane','each revision retains its own variant');
select is((select count(distinct snapshot->>'gross') from public.finance_project_proposals),1::bigint,'presentation does not alter the client price');
select is((select count(distinct snapshot->'rows') from public.finance_project_proposals),1::bigint,'presentation does not alter the payment schedule');
select results_eq($$select snapshot,pdf from public.finance_project_proposals where revision=1$$,$$select snapshot,pdf from frozen$$,'later designs leave original snapshot and PDF unchanged');
reset role;
select throws_like($$update public.finance_project_proposals set snapshot=jsonb_set(snapshot,'{designVariant}','"folded-plane"') where revision=1$$,'%finance_history_immutable%','even privileged callers cannot change a saved variant');
select ok(not has_function_privilege('authenticated','public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid)','EXECUTE'),'browser still cannot inject PDF bytes');
select * from finish();
rollback;
