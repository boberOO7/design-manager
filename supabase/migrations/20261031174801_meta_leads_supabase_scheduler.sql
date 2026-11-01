create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Only the database operator/cron owner may read these Vault secrets and dispatch.
-- The existing GET endpoint retains its CRON_SECRET bearer authorization.
create function private.dispatch_meta_lead_worker()
returns bigint language plpgsql security invoker set search_path = '' as $$
declare v_url text; v_token text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets
    where name = 'studioflow_meta_leads_worker_url';
  select decrypted_secret into v_token from vault.decrypted_secrets
    where name = 'studioflow_meta_leads_cron_secret';
  if v_url is null or v_url !~ '^https://[^/?#@[:space:]]+/api/integrations/meta-leads/worker$'
    or v_token is null or length(btrim(v_token)) = 0 then
    raise exception 'meta_worker_scheduler_not_configured';
  end if;
  return net.http_get(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_token),
    timeout_milliseconds := 65000
  );
end;
$$;
revoke all on function private.dispatch_meta_lead_worker() from public, anon, authenticated, service_role;

-- Inactive even when Vault already contains secrets: deploy the removal of the
-- Vercel Meta cron first, then configure Vault and explicitly activate this job.
-- Named scheduling updates the same owner's existing job rather than duplicating it.
select cron.schedule_in_database(
  'studioflow-meta-leads-worker', '* * * * *',
  'select private.dispatch_meta_lead_worker();',
  current_database(), null, false
);
