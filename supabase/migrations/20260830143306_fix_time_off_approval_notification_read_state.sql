-- Resolve only unread submission notifications when the final approval is
-- recorded. Updating an already-read notification, even to the same read_at
-- value, correctly violates enforce_notification_read_only().
create or replace function public.approve_time_off_request(
  p_request_id uuid,
  p_review_note text default null
)
returns table (
  status public.time_off_request_status,
  approval_count integer,
  required_approval_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.time_off_requests%rowtype;
  active_admin_count integer;
  inserted_count integer;
  approvals integer;
  required integer;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_review_note is not null and char_length(p_review_note) > 2000 then
    raise exception 'Review note is too long';
  end if;

  select request.* into target
  from public.time_off_requests as request
  where request.id = p_request_id
  for update;

  if not found then
    raise exception 'The request was not found';
  end if;

  if not exists (
    select 1
    from public.studio_members as member
    inner join public.profiles as profile on profile.id = member.user_id
    where member.studio_id = target.studio_id
      and member.user_id = actor_id
      and member.system_role = 'admin'
      and member.is_active = true
      and profile.is_active = true
  ) then
    raise exception 'Only active studio administrators may approve time-off requests';
  end if;

  if target.status <> 'pending' then
    raise exception 'This time-off request is no longer pending';
  end if;

  required := case when target.request_type = 'vacation' then 2 else 1 end;
  select count(*) into active_admin_count
  from public.studio_members as member
  inner join public.profiles as profile on profile.id = member.user_id
  where member.studio_id = target.studio_id
    and member.system_role = 'admin'
    and member.is_active = true
    and profile.is_active = true;

  if active_admin_count < required then
    raise exception 'This request requires % active admin approvals, but only % active administrators are available', required, active_admin_count;
  end if;

  insert into public.time_off_request_approvals (request_id, admin_user_id)
  values (target.id, actor_id)
  on conflict (request_id, admin_user_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    raise exception 'You have already approved this time-off request';
  end if;

  select count(*) into approvals
  from public.time_off_request_approvals as approval
  where approval.request_id = target.id;

  if approvals >= required then
    update public.time_off_requests
    set status = 'approved', reviewed_by = actor_id, reviewed_at = now(), review_note = p_review_note
    where id = target.id;

    update public.notifications
    set read_at = now()
    where studio_id = target.studio_id
      and entity_type = 'time_off_request'
      and entity_id = target.id
      and notification_type = 'time_off_request_submitted'
      and read_at is null;

    target.status := 'approved';
  end if;

  return query select target.status, approvals, required;
end;
$$;

revoke execute on function public.approve_time_off_request(uuid, text) from public, anon;
grant execute on function public.approve_time_off_request(uuid, text) to authenticated;
