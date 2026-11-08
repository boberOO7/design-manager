-- PROPOSAL ONLY. Do not execute without approval.
-- Target: znzarmgdhddwuxzgvchq (production DB behind studio-flow.space).
-- Prerequisite: all three SPACE DESIGN migrations applied, Vercel deployment
-- ready and existing HMAC configured. No secret is created or rotated.
-- Vercel SPACE_DESIGN_KEY_ID and WordPress SD_STUDIOFLOW_KEY_ID: space-design-prod.
-- Vercel SPACE_DESIGN_CRM_STUDIO_ID: c5a5250b-6ac6-4227-94ff-44f713b70c69.
begin;
do $$
declare
  target_studio uuid := 'c5a5250b-6ac6-4227-94ff-44f713b70c69';
  desired_key text := 'space-design-prod';
begin
  if not exists(select 1 from public.studios where id=target_studio and name='SPACE') then
    raise exception 'unexpected_target_studio';
  end if;
  if to_regprocedure('public.accept_space_design_lead(text,uuid,uuid,text,jsonb)') is null
    or to_regprocedure('private.process_space_design_lead_jobs()') is null then
    raise exception 'space_design_migrations_required';
  end if;
  insert into public.space_design_integration_keys(key_id,studio_id,enabled)
    values(desired_key,target_studio,true) on conflict(key_id) do nothing;
  -- Never rebind an existing key or silently re-enable an operator-revoked key.
  if not exists(select 1 from public.space_design_integration_keys
    where key_id=desired_key and studio_id=target_studio and enabled) then
    raise exception 'key_binding_or_enabled_state_conflict';
  end if;

end;
$$;
commit;
-- Cron activation is a separate reviewed step in space-design-production-activate.sql.
