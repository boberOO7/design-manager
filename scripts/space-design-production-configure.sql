-- PROPOSAL ONLY. Do not execute without approval.
-- Target: znzarmgdhddwuxzgvchq (production DB behind studio-flow.space).
-- Prerequisite: both SPACE DESIGN migrations applied, Vercel deployment ready,
-- and existing HMAC/worker secrets configured. No secret is created or rotated.
-- Vercel SPACE_DESIGN_KEY_ID and WordPress SD_STUDIOFLOW_KEY_ID: space-design-prod.
-- Vercel SPACE_DESIGN_CRM_STUDIO_ID: c5a5250b-6ac6-4227-94ff-44f713b70c69.
begin;
do $$
declare
  target_studio uuid := 'c5a5250b-6ac6-4227-94ff-44f713b70c69';
  desired_key text := 'space-design-prod';
  desired_url text := 'https://studio-flow.space/api/integrations/space-design/worker';
  existing_url text;
begin
  if not exists(select 1 from public.studios where id=target_studio and name='SPACE') then
    raise exception 'unexpected_target_studio';
  end if;
  if to_regprocedure('public.accept_space_design_lead(text,uuid,uuid,text,jsonb)') is null
    or to_regprocedure('private.dispatch_space_design_lead_worker()') is null then
    raise exception 'space_design_migrations_required';
  end if;
  if not exists(select 1 from vault.decrypted_secrets
    where name='studioflow_space_design_worker_secret' and length(btrim(decrypted_secret))>0) then
    raise exception 'existing_worker_secret_required';
  end if;

  insert into public.space_design_integration_keys(key_id,studio_id,enabled)
    values(desired_key,target_studio,true) on conflict(key_id) do nothing;
  -- Never rebind an existing key or silently re-enable an operator-revoked key.
  if not exists(select 1 from public.space_design_integration_keys
    where key_id=desired_key and studio_id=target_studio and enabled) then
    raise exception 'key_binding_or_enabled_state_conflict';
  end if;

  select decrypted_secret into existing_url from vault.decrypted_secrets
    where name='studioflow_space_design_worker_url';
  if existing_url is null then
    perform vault.create_secret(desired_url,'studioflow_space_design_worker_url');
  elsif existing_url<>desired_url then
    raise exception 'existing_worker_url_mismatch';
  end if;
end;
$$;
commit;
-- Cron activation is a separate reviewed step in space-design-production-activate.sql.
