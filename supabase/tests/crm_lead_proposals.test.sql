begin;
select no_plan();
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$select ('56000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.pid(1),'Lead quotes A'),(pg_temp.pid(2),'Lead quotes B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.pid(n),'authenticated','authenticated','lead-quote-'||n||'@test','{}','{}',now(),now() from generate_series(10,12)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.pid(n),'Quote tester','lead-quote-'||n||'@test',case when n=11 then 'employee' else 'admin' end,true from generate_series(10,12)n;
insert into public.studio_members(studio_id,user_id,system_role)
select pg_temp.pid(case when n=12 then 2 else 1 end),pg_temp.pid(n),case when n=11 then 'employee' else 'admin' end from generate_series(10,12)n;
insert into public.crm_leads(id,studio_id,client_name,first_contact_date)
values(pg_temp.pid(20),pg_temp.pid(1),'Клініка','2026-11-01');
create temporary table captured as select jsonb_build_object('schemaVersion',3,'projectId',null,'leadId',id,
  'leadUpdatedAt',updated_at,'revision',1,'projectNumber','336','commercialTerms','{}'::jsonb,
  'studioContactDetails',jsonb_build_object('website','','email','','phone','','businessAddress','','contactPerson','')) as source
from public.crm_leads where id=pg_temp.pid(20);
grant select on captured to authenticated;
create function pg_temp.save_quote(actor uuid,request uuid,source jsonb) returns uuid language sql security definer set search_path='' as $$
  select public.save_crm_lead_proposal(pg_temp.pid(1),pg_temp.pid(20),request,source,source,'JVBERi0=',actor)
$$;
select ok(not has_table_privilege('authenticated','public.crm_lead_proposals','INSERT'),'browser cannot insert snapshots or bytes');
select ok(not has_function_privilege('authenticated','public.save_crm_lead_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid)','EXECUTE'),'browser cannot impersonate a PDF renderer');
select ok(has_function_privilege('service_role','public.save_crm_lead_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid)','EXECUTE'),'trusted renderer may save');
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
set local role authenticated;
select lives_ok($$select pg_temp.save_quote(pg_temp.pid(10),pg_temp.pid(30),source) from captured$$,'admin saves a proposal without a project or Finance setup');
select is((select count(*) from public.crm_lead_proposals where lead_id=pg_temp.pid(20)),1::bigint,'proposal belongs to lead');
select is((select project_id from public.crm_leads where id=pg_temp.pid(20)),null::uuid,'no project created');
select is((select count(*) from public.finance_project_orders where studio_id=pg_temp.pid(1)),0::bigint,'no financial orders created');
select is((select count(*) from public.finance_expected_items where studio_id=pg_temp.pid(1)),0::bigint,'no expected payments created');
select lives_ok($$select pg_temp.save_quote(pg_temp.pid(10),pg_temp.pid(30),source) from captured$$,'lost-response retry returns the same revision');
select throws_like($$select pg_temp.save_quote(pg_temp.pid(10),pg_temp.pid(31),source) from captured$$,'%finance_version_conflict%','concurrent stale revision cannot append');
select throws_like($$select pg_temp.save_quote(pg_temp.pid(10),pg_temp.pid(30),source||'{"projectNumber":"999"}') from captured$$,'%finance_version_conflict%','request id cannot be reused for a different payload');
select throws_like($$update public.crm_lead_proposals set snapshot='{}'$$,'%permission denied%','browser cannot rewrite history');
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
select is((select count(*) from public.crm_lead_proposals),0::bigint,'employee cannot read quote data');
select throws_like($$select pg_temp.save_quote(pg_temp.pid(11),pg_temp.pid(32),source) from captured$$,'%finance_forbidden%','employee cannot generate');
select set_config('request.jwt.claim.sub',pg_temp.pid(12)::text,true);
select is((select count(*) from public.crm_lead_proposals),0::bigint,'other studio cannot read quote history');
select throws_like($$select pg_temp.save_quote(pg_temp.pid(12),pg_temp.pid(32),source) from captured$$,'%finance_forbidden%','other studio cannot save');
reset role;
select throws_like($$delete from public.crm_lead_proposals where lead_id=pg_temp.pid(20)$$,'%finance_history_immutable%','privileged deletion cannot erase PDF history');
select throws_like($$delete from public.crm_leads where id=pg_temp.pid(20)$$,'%foreign key constraint%','lead deletion cannot orphan proposal history');
update public.studios set email='changed@example.test' where id=pg_temp.pid(1);
select throws_like($$select pg_temp.save_quote(pg_temp.pid(10),pg_temp.pid(33),source||'{"revision":2}') from captured$$,'%finance_version_conflict%','changed studio contacts invalidate a stale preview');
select lives_ok($$select pg_temp.save_quote(pg_temp.pid(10),pg_temp.pid(30),source) from captured$$,'idempotent saved download survives later source changes');
update public.profiles set is_active=false where id=pg_temp.pid(10);
select throws_like($$select pg_temp.save_quote(pg_temp.pid(10),pg_temp.pid(34),source) from captured$$,'%finance_forbidden%','inactive actor cannot save');
select * from finish();
rollback;
