begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select ok(not has_function_privilege('anon','private.process_space_design_lead_jobs()','EXECUTE'),'anonymous cannot process inbox');
select ok(not has_function_privilege('authenticated','private.process_space_design_lead_jobs()','EXECUTE'),'browser cannot process inbox');
select ok(not has_function_privilege('service_role','private.process_space_design_lead_jobs()','EXECUTE'),'SQL worker is not exposed through API');
select is(to_regprocedure('private.dispatch_space_design_lead_worker()'),null::regprocedure,'HTTP dispatcher removed');
select ok((select command='select private.process_space_design_lead_jobs();' and schedule='* * * * *' and not active
  from cron.job where jobname='studioflow-space-design-leads-worker'),'cron uses SQL worker and awaits explicit activation');

insert into public.studios(id,name) values
  ('67000000-0000-4000-8000-000000000001','SQL worker A'),
  ('67000000-0000-4000-8000-000000000002','SQL worker B');
insert into public.space_design_integration_keys(key_id,studio_id,requests_per_minute) values
  ('sql-worker-a','67000000-0000-4000-8000-000000000001',1000),
  ('sql-worker-b','67000000-0000-4000-8000-000000000002',1000);
create function pg_temp.sql_event(i integer,phone text,email text default null,client text default 'SQL worker fixture',studio uuid default '67000000-0000-4000-8000-000000000001')
returns text language sql as $$
  select public.accept_space_design_lead(case when studio='67000000-0000-4000-8000-000000000001' then 'sql-worker-a' else 'sql-worker-b' end,
    studio,('67000000-0000-4000-9000-'||lpad(i::text,12,'0'))::uuid,repeat('a',64),
    jsonb_build_object('submission_id','67000000-0000-4000-9000-'||lpad(i::text,12,'0'),
      'submitted_at','2026-11-08T12:00:00Z','client_name',client,'phone',phone,'email',email));
$$;
select pg_temp.sql_event(1,'+12025550101',client=>'');
select pg_temp.sql_event(2,'+12025550102');
create temp table worker_result as select private.process_space_design_lead_jobs() as result;
select is((select result->>'claimed' from worker_result),'2','worker claims accepted batch');
select is((select result->>'created' from worker_result),'1','healthy job completes despite another job failure');
select is((select result->>'retried' from worker_result),'1','failed CRM write schedules retry');
select ok((select status='pending' and attempts=1 and available_at>now() and last_error='crm_write_failed' and payload is not null
  from public.space_design_lead_jobs where key_id='sql-worker-a' and submission_id='67000000-0000-4000-9000-000000000001'),'failure persists safe diagnostic and original payload');
select is((select count(*)::integer from public.crm_leads where studio_id='67000000-0000-4000-8000-000000000001'),1,'failed CRM write has no phantom lead');
select is(private.process_space_design_lead_jobs()->>'claimed','0','backoff prevents immediate retry');
update public.space_design_lead_jobs set attempts=7,available_at=now()-interval '1 second'
  where key_id='sql-worker-a' and submission_id='67000000-0000-4000-9000-000000000001';
select is(private.process_space_design_lead_jobs()->>'failed','1','eighth failed attempt becomes terminal');
select ok((select status='failed' and attempts=8 and last_error='crm_write_failed' from public.space_design_lead_jobs
  where key_id='sql-worker-a' and submission_id='67000000-0000-4000-9000-000000000001'),'terminal failure remains inspectable');

select pg_temp.sql_event(3,'+12025550103');
select pg_temp.sql_event(4,'0012025550103');
select pg_temp.sql_event(5,null,'Person@example.test');
select pg_temp.sql_event(6,null,' person@EXAMPLE.test ');
select pg_temp.sql_event(7,'+12025550103',studio=>'67000000-0000-4000-8000-000000000002');
delete from worker_result;
insert into worker_result select private.process_space_design_lead_jobs();
select is((select result->>'claimed' from worker_result),'5','same worker processes both studios');
select is((select result->>'created' from worker_result),'3','phone match across studios does not suppress lead');
select is((select result->>'duplicate' from worker_result),'2','normalized phone and email duplicates suppressed');
select is((select count(*)::integer from public.crm_leads where studio_id='67000000-0000-4000-8000-000000000002'),1,'other studio receives its own lead');
select ok(not exists(select 1 from public.space_design_lead_jobs where key_id in ('sql-worker-a','sql-worker-b')
  and status in ('created','duplicate') and payload is not null),'success payloads cleared');
select ok(not exists(select 1 from public.crm_leads where studio_id in ('67000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000002')
  and (source<>'SPACE DESIGN Website' or status<>'new')),'source/status contract preserved');
select is(pg_temp.sql_event(3,'+12025550103'),'replayed','completed event stays idempotent');
select is(private.process_space_design_lead_jobs()->>'claimed','0','replay creates no new work');
select * from finish();
rollback;
