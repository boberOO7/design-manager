-- Subscriptions are session-bound capabilities; logout/session deletion cascades
-- to pending deliveries. Browser callers can never select a recipient.
create table public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  endpoint text not null unique check (
    length(endpoint) <= 4096 and endpoint ~ '^https://(fcm\.googleapis\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
  ),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}={0,2}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}={0,2}$'),
  vapid_public_key text not null check (vapid_public_key ~ '^[A-Za-z0-9_-]{87}$'),
  locale text not null default 'uk' check (locale in ('uk', 'en')),
  created_at timestamptz not null default now()
);
create index web_push_subscriptions_user_idx on public.web_push_subscriptions(user_id);
create index web_push_subscriptions_session_idx on public.web_push_subscriptions(session_id);
alter table public.web_push_subscriptions enable row level security;
revoke all on public.web_push_subscriptions from public, anon, authenticated, service_role;
grant select, delete on public.web_push_subscriptions to authenticated;
grant select, delete on public.web_push_subscriptions to service_role;
create policy web_push_select_own on public.web_push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy web_push_delete_own on public.web_push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.register_web_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_vapid_public_key text, p_locale text default 'uk'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_session uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  v_id uuid;
begin
  if v_user is null or v_session is null or not exists (
    select 1 from auth.sessions where id = v_session and user_id = v_user
      and (not_after is null or not_after > now())
  ) or not exists (select 1 from public.profiles where id = v_user and is_active)
    or (select count(*) from public.studio_members where user_id = v_user and is_active) <> 1 then
    raise exception 'active_session_required' using errcode = '42501';
  end if;
  insert into public.web_push_subscriptions(user_id, session_id, endpoint, p256dh, auth, vapid_public_key, locale)
  values (v_user, v_session, p_endpoint, p_p256dh, p_auth, p_vapid_public_key, p_locale)
  on conflict (endpoint) do update set
    session_id = excluded.session_id, p256dh = excluded.p256dh, auth = excluded.auth,
    vapid_public_key = excluded.vapid_public_key, locale = excluded.locale
  where web_push_subscriptions.user_id = v_user
  returning id into v_id;
  if v_id is null then raise exception 'subscription_owner_mismatch' using errcode = '42501'; end if;
  return v_id;
end;
$$;
revoke all on function public.register_web_push_subscription(text,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.register_web_push_subscription(text,text,text,text,text) to authenticated;

create table public.web_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.web_push_subscriptions(id) on delete cascade,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  completed_at timestamptz,
  last_status integer,
  unique(notification_id, subscription_id)
);
create index web_push_deliveries_pending_idx on public.web_push_deliveries(next_attempt_at) where completed_at is null;
create index web_push_deliveries_subscription_idx on public.web_push_deliveries(subscription_id);
alter table public.web_push_deliveries enable row level security;
revoke all on public.web_push_deliveries from public, anon, authenticated, service_role;

create function private.enqueue_web_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.web_push_deliveries(notification_id, subscription_id)
  select new.id, s.id from public.web_push_subscriptions s
  join auth.sessions a on a.id = s.session_id and a.user_id = s.user_id
  join public.profiles p on p.id = s.user_id and p.is_active
  join public.studio_members m on m.user_id = s.user_id and m.studio_id = new.studio_id and m.is_active
  where s.user_id = new.recipient_id and new.read_at is null
    and (a.not_after is null or a.not_after > now())
  on conflict (notification_id, subscription_id) do nothing;
  return new;
end;
$$;
revoke all on function private.enqueue_web_push() from public, anon, authenticated, service_role;
create trigger notifications_enqueue_web_push after insert on public.notifications
  for each row execute function private.enqueue_web_push();

-- Leases allow overlapping cron invocations without sending the same job twice.
create function public.claim_web_push_deliveries(p_limit integer default 20)
returns table(id uuid, notification_id uuid, subscription_id uuid, user_id uuid,
  endpoint text, p256dh text, auth text, vapid_public_key text, locale text, attempts integer, lease_token uuid)
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.web_push_subscriptions s where not exists (
    select 1 from auth.sessions a join public.profiles p on p.id = a.user_id and p.is_active
    where a.id = s.session_id and a.user_id = s.user_id and (a.not_after is null or a.not_after > now())
  );
  update public.web_push_deliveries d set completed_at = now(), lease_token = null
  where d.completed_at is null and not exists (
    select 1 from public.notifications n join public.web_push_subscriptions s on s.id = d.subscription_id
    join public.studio_members m on m.studio_id = n.studio_id and m.user_id = s.user_id and m.is_active
    where n.id = d.notification_id and n.recipient_id = s.user_id and n.read_at is null
  );
  return query
  with pending as (
    select d.id from public.web_push_deliveries d
    where d.completed_at is null and d.next_attempt_at <= now()
    order by d.next_attempt_at, d.id limit greatest(1, least(p_limit, 100)) for update skip locked
  ), claimed as (
    update public.web_push_deliveries d set attempts = d.attempts + 1,
      next_attempt_at = now() + interval '5 minutes', lease_token = gen_random_uuid()
    from pending where d.id = pending.id returning d.*
  )
  select c.id, c.notification_id, s.id, s.user_id, s.endpoint, s.p256dh, s.auth,
    s.vapid_public_key, s.locale, c.attempts, c.lease_token
  from claimed c join public.web_push_subscriptions s on s.id = c.subscription_id;
end;
$$;
revoke all on function public.claim_web_push_deliveries(integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_web_push_deliveries(integer) to service_role;

create function public.finish_web_push_delivery(p_id uuid, p_lease_token uuid, p_status integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_subscription uuid;
begin
  select subscription_id into v_subscription from public.web_push_deliveries
    where id = p_id and lease_token = p_lease_token and completed_at is null for update;
  if v_subscription is null then return; end if;
  if p_status in (404, 410) then
    delete from public.web_push_subscriptions where id = v_subscription;
  else
    update public.web_push_deliveries set
      completed_at = case when p_status between 200 and 299 then now() else null end,
      last_status = p_status, lease_token = null,
      next_attempt_at = now() + make_interval(secs => least(3600, 30 * power(2, least(attempts, 7)))::integer)
    where id = p_id;
  end if;
end;
$$;
revoke all on function public.finish_web_push_delivery(uuid,uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.finish_web_push_delivery(uuid,uuid,integer) to service_role;

notify pgrst, 'reload schema';
