-- PROPOSAL ONLY. Do not execute without separate activation approval.
-- First verify Vercel deployment/HMAC, configured key/studio and disabled
-- WordPress sending. This enables automatic CRM writes directly inside Postgres.
begin;
do $$
declare target_job bigint;
begin
  if not exists(select 1 from public.space_design_integration_keys
    where key_id='space-design-prod' and studio_id='c5a5250b-6ac6-4227-94ff-44f713b70c69' and enabled) then
    raise exception 'production_key_not_ready';
  end if;
  if to_regprocedure('private.process_space_design_lead_jobs()') is null then
    raise exception 'sql_worker_migration_required';
  end if;
  select jobid into strict target_job from cron.job
    where jobname='studioflow-space-design-leads-worker'
      and schedule='* * * * *'
      and command='select private.process_space_design_lead_jobs();'
      and database=current_database();
  perform cron.alter_job(target_job,active:=true);
end;
$$;
commit;
