-- Share the burst limit across server instances without storing raw IP addresses.
create table private.feedback_submission_limits (
  invitation_id uuid not null references public.project_feedback(id) on delete cascade,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  accepted_count smallint not null check (accepted_count between 1 and 2),
  requested_at timestamptz not null,
  primary key (invitation_id, source_hash)
);
alter table private.feedback_submission_limits enable row level security;
revoke all on private.feedback_submission_limits from public, anon, authenticated, service_role;

create function public.submit_feedback_with_cooldown(p_token text, p_answers jsonb, p_source_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_invitation uuid;
  v_limit private.feedback_submission_limits;
  v_now timestamptz;
  v_accepted boolean;
begin
  if p_source_hash is null or p_source_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'feedback_invalid_source' using errcode = '22023';
  end if;
  -- Use the same invitation lock as submission/revocation, including the first burst.
  select id into v_invitation from public.project_feedback where token = p_token for update;
  if not found or not exists (
    select 1 from public.project_feedback where id = v_invitation
      and revoked_at is null and expires_at > clock_timestamp()
  ) then return false; end if;
  v_now := clock_timestamp();
  select * into v_limit from private.feedback_submission_limits
    where invitation_id = v_invitation and source_hash = p_source_hash;
  if v_limit.accepted_count = 2 and v_limit.requested_at > v_now - interval '5 minutes' then
    raise exception 'feedback_rate_limited' using errcode = 'P0001',
      detail = ceil(extract(epoch from v_limit.requested_at + interval '5 minutes' - v_now))::integer::text;
  end if;

  v_accepted := public.submit_versioned_feedback(p_token, p_answers);
  if not v_accepted then return false; end if;
  -- Invalid answers roll back before consuming a place in the burst.
  insert into private.feedback_submission_limits(invitation_id, source_hash, accepted_count, requested_at)
    values (v_invitation, p_source_hash, 1, clock_timestamp())
  on conflict (invitation_id, source_hash) do update
    set accepted_count = case when feedback_submission_limits.requested_at <= excluded.requested_at - interval '5 minutes'
      then 1 else feedback_submission_limits.accepted_count + 1 end,
      requested_at = excluded.requested_at;
  return true;
end;
$$;
revoke all on function public.submit_feedback_with_cooldown(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_feedback_with_cooldown(text, jsonb, text) to service_role;
notify pgrst, 'reload schema';
