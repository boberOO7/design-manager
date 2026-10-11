-- pg_net sends only after commit. pg_cron is used for pending-work recovery,
-- never to poll an idle queue or to initiate ordinary notification delivery.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault with schema vault;

create table private.web_push_dispatch_state (
  singleton boolean primary key default true check (singleton),
  dispatch_id uuid,
  request_id bigint,
  requested_at timestamptz,
  failures integer not null default 0,
  retry_after timestamptz,
  wake_at timestamptz
);
insert into private.web_push_dispatch_state(singleton) values (true);
alter table private.web_push_dispatch_state enable row level security;
revoke all on private.web_push_dispatch_state from public, anon, authenticated, service_role;

create function private.schedule_web_push_wakeup(p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_wake timestamptz;
  v_delay integer;
  v_schedule text;
begin
  select wake_at into v_wake from private.web_push_dispatch_state where singleton for update;
  if p_at is not null and v_wake is not null and v_wake <= p_at then return; end if;
  perform cron.unschedule(jobid) from cron.job
    where jobname = 'studioflow-web-push-retry' and username = current_user;
  if p_at is null then
    update private.web_push_dispatch_state set wake_at = null where singleton;
    return;
  end if;
  v_delay := greatest(1, ceil(extract(epoch from p_at - clock_timestamp()))::integer);
  if v_delay < 60 then
    v_schedule := v_delay::text || ' seconds';
    v_wake := clock_timestamp() + make_interval(secs => v_delay);
  else
    -- A calendar date could be missed during a database restart. A recoverable
    -- minute timer remains armed only while unfinished work exists; it checks
    -- the durable next_attempt_at deadline before making any HTTP request.
    v_wake := date_trunc('minute', clock_timestamp()) + interval '1 minute';
    v_schedule := '* * * * *';
  end if;
  perform cron.schedule('studioflow-web-push-retry', v_schedule, 'select private.retry_web_push_dispatch();');
  update private.web_push_dispatch_state set wake_at = v_wake where singleton;
end;
$$;
revoke all on function private.schedule_web_push_wakeup(timestamptz) from public, anon, authenticated, service_role;

create function private.request_web_push_dispatch()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_state private.web_push_dispatch_state%rowtype;
  v_due timestamptz;
  v_now timestamptz := clock_timestamp();
  v_url text;
  v_token text;
  v_dispatch uuid;
  v_request bigint;
begin
  select * into v_state from private.web_push_dispatch_state where singleton for update;
  select min(next_attempt_at) into v_due from public.web_push_deliveries where completed_at is null;
  if v_due is null then
    perform private.schedule_web_push_wakeup(null);
    update private.web_push_dispatch_state set dispatch_id = null, request_id = null,
      requested_at = null, retry_after = null, failures = 0 where singleton;
    return;
  end if;
  if v_state.dispatch_id is not null then
    if v_state.requested_at + interval '70 seconds' > v_now then
      perform private.schedule_web_push_wakeup(v_state.requested_at + interval '70 seconds');
      return;
    end if;
    -- No acknowledgement: HTTP failure, unavailable app, or lost pg_net request.
    v_state.failures := least(v_state.failures + 1, 7);
    v_state.retry_after := v_now + make_interval(secs => least(3600, 30 * power(2, v_state.failures))::integer);
    update private.web_push_dispatch_state set dispatch_id = null, request_id = null,
      requested_at = null, failures = v_state.failures, retry_after = v_state.retry_after where singleton;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'studioflow_web_push_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'studioflow_web_push_token';
  if v_url is null or v_token is null then
    perform private.schedule_web_push_wakeup(null);
    return; -- Retain durable deliveries until an administrator configures dispatch.
  end if;
  v_due := greatest(v_due, coalesce(v_state.retry_after, v_due));
  if v_due > v_now then
    perform private.schedule_web_push_wakeup(v_due);
    return;
  end if;
  v_dispatch := gen_random_uuid();
  v_request := net.http_post(
    url := v_url,
    body := jsonb_build_object('dispatchId', v_dispatch),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    timeout_milliseconds := 65000
  );
  update private.web_push_dispatch_state set dispatch_id = v_dispatch, request_id = v_request,
    requested_at = v_now, retry_after = null where singleton;
  perform private.schedule_web_push_wakeup(v_now + interval '70 seconds');
end;
$$;
revoke all on function private.request_web_push_dispatch() from public, anon, authenticated, service_role;

create function private.retry_web_push_dispatch()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from private.web_push_dispatch_state where singleton for update;
  -- Each timer removes itself before considering the next pending-work deadline.
  perform private.schedule_web_push_wakeup(null);
  perform private.request_web_push_dispatch();
end;
$$;
revoke all on function private.retry_web_push_dispatch() from public, anon, authenticated, service_role;

create function private.wake_web_push_dispatch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.request_web_push_dispatch();
  exception when others then
    -- A transport failure must not roll back the persisted in-app notification.
    -- No provider URL, token or exception text is logged.
    perform private.schedule_web_push_wakeup(clock_timestamp() + interval '1 minute');
  end;
  return null;
end;
$$;
revoke all on function private.wake_web_push_dispatch() from public, anon, authenticated, service_role;
create trigger web_push_deliveries_dispatch after insert on public.web_push_deliveries
  for each statement execute function private.wake_web_push_dispatch();

create function public.complete_web_push_dispatch(p_dispatch_id uuid, p_success boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_state private.web_push_dispatch_state%rowtype;
begin
  select * into v_state from private.web_push_dispatch_state where singleton for update;
  if v_state.dispatch_id is distinct from p_dispatch_id or p_dispatch_id is null then return; end if;
  update private.web_push_dispatch_state set dispatch_id = null, request_id = null, requested_at = null,
    failures = case when p_success then 0 else least(v_state.failures + 1, 7) end,
    retry_after = case when p_success then null else clock_timestamp() +
      make_interval(secs => least(3600, 30 * power(2, least(v_state.failures + 1, 7)))::integer) end
    where singleton;
  perform private.schedule_web_push_wakeup(null);
  perform private.request_web_push_dispatch();
end;
$$;
revoke all on function public.complete_web_push_dispatch(uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.complete_web_push_dispatch(uuid,boolean) to service_role;

-- Environment-specific URLs and bearer credentials belong in encrypted Vault,
-- not migrations, trigger definitions, cron commands, or browser code.
create function private.configure_web_push_dispatch(p_url text, p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_url is null or p_url !~ '^https?://[^[:space:]]+/api/push/dispatch$'
    or p_token is null or length(p_token) = 0 then
    raise exception 'invalid_web_push_dispatch_configuration';
  end if;
  select id into v_id from vault.secrets where name = 'studioflow_web_push_url';
  if v_id is null then perform vault.create_secret(p_url, 'studioflow_web_push_url');
  else perform vault.update_secret(v_id, p_url); end if;
  select id into v_id from vault.secrets where name = 'studioflow_web_push_token';
  if v_id is null then perform vault.create_secret(p_token, 'studioflow_web_push_token');
  else perform vault.update_secret(v_id, p_token); end if;
  perform private.request_web_push_dispatch();
end;
$$;
revoke all on function private.configure_web_push_dispatch(text,text) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
