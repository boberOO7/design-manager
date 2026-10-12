-- Keep the per-user cooldown across device replacement, logout and Vercel instances.
create table private.web_push_test_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  requested_at timestamptz not null
);
alter table private.web_push_test_limits enable row level security;
revoke all on private.web_push_test_limits from public, anon, authenticated, service_role;

create function public.claim_web_push_test(p_endpoint text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_session uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  v_subscription uuid;
  v_claimed uuid;
begin
  if v_user is null or v_session is null or not exists (
    select 1 from auth.sessions where id = v_session and user_id = v_user
      and (not_after is null or not_after > now())
  ) or not exists (select 1 from public.profiles where id = v_user and is_active)
    or (select count(*) from public.studio_members where user_id = v_user and is_active) <> 1 then
    raise exception 'active_session_required' using errcode = '42501';
  end if;
  select id into v_subscription from public.web_push_subscriptions
    where endpoint = p_endpoint and user_id = v_user and session_id = v_session;
  if v_subscription is null then
    raise exception 'web_push_subscription_missing' using errcode = 'P0001';
  end if;
  insert into private.web_push_test_limits(user_id, requested_at)
  values (v_user, clock_timestamp())
  on conflict (user_id) do update set requested_at = excluded.requested_at
    where web_push_test_limits.requested_at <= excluded.requested_at - interval '1 minute'
  returning user_id into v_claimed;
  if v_claimed is null then
    raise exception 'web_push_test_rate_limited' using errcode = 'P0001';
  end if;
  return v_subscription;
end;
$$;
revoke all on function public.claim_web_push_test(text) from public, anon, authenticated, service_role;
grant execute on function public.claim_web_push_test(text) to authenticated;
notify pgrst, 'reload schema';
