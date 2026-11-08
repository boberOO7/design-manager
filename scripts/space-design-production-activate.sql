-- PROPOSAL ONLY. Do not execute without separate activation approval.
-- First verify Vercel deployment/env, matching existing worker secret, configured
-- key/studio and disabled WordPress sending. This enables automatic CRM writes.
-- No authenticated worker GET/HEAD is a read-only health check.
begin;
do $$
declare target_job bigint;
begin
  if not exists(select 1 from public.space_design_integration_keys
    where key_id='space-design-prod' and studio_id='c5a5250b-6ac6-4227-94ff-44f713b70c69' and enabled) then
    raise exception 'production_key_not_ready';
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name='studioflow_space_design_worker_url'
    and decrypted_secret='https://studio-flow.space/api/integrations/space-design/worker') then
    raise exception 'production_worker_url_not_ready';
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name='studioflow_space_design_worker_secret'
    and length(btrim(decrypted_secret))>0) then
    raise exception 'production_worker_secret_not_ready';
  end if;
  select jobid into strict target_job from cron.job
    where jobname='studioflow-space-design-leads-worker'
      and schedule='* * * * *'
      and command='select private.dispatch_space_design_lead_worker();'
      and database=current_database();
  perform cron.alter_job(target_job,active:=true);
end;
$$;
commit;
