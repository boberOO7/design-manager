-- Review notes are admin-only data.  Keep them off the employee-readable
-- request row so a caller's ordinary request select can never return a note.
create table public.time_off_request_reviews (
  request_id uuid primary key references public.time_off_requests(id) on delete cascade,
  note text not null check (char_length(note) <= 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.time_off_request_reviews (request_id, note, created_by, created_at, updated_at)
select id, review_note, reviewed_by, coalesce(reviewed_at, created_at), updated_at
from public.time_off_requests
where review_note is not null;

alter table public.time_off_request_reviews enable row level security;
revoke all on table public.time_off_request_reviews from public, anon, authenticated;
grant select (request_id, note, created_by, created_at, updated_at)
on table public.time_off_request_reviews to authenticated;

create policy "time_off_request_reviews_select_for_active_admin"
on public.time_off_request_reviews for select to authenticated
using (
  exists (
    select 1
    from public.time_off_requests as request
    where request.id = time_off_request_reviews.request_id
      and (select private.is_studio_admin(request.studio_id))
  )
);

create trigger set_time_off_request_reviews_updated_at
before update on public.time_off_request_reviews
for each row execute function public.set_updated_at();

create or replace function private.initialize_time_off_request_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(private.is_studio_admin(new.studio_id), false) then
    new.status := 'approved';
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  else
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  new.cancelled_at := null;
  return new;
end;
$$;

revoke execute on function private.initialize_time_off_request_status() from public, anon, authenticated;

create or replace function private.validate_time_off_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_is_admin boolean;
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1
      from public.studio_members as membership
      inner join public.profiles as profile on profile.id = membership.user_id
      where membership.studio_id = new.studio_id
        and membership.user_id = new.user_id
        and membership.is_active = true
        and profile.is_active = true
    ) then
      raise exception 'Time-off user must be an active studio member';
    end if;

    if new.request_type in ('day_off', 'sick_leave', 'other')
      and coalesce(nullif(btrim(new.private_note), ''), '') = '' then
      raise exception 'A reason is required for this time-off request';
    end if;

    actor_is_admin := coalesce(private.is_studio_admin(new.studio_id), false);
    if new.user_id is distinct from actor_id then
      raise exception 'Time-off requests must belong to the authenticated user';
    end if;

    if actor_is_admin then
      if new.status <> 'approved'
        or new.reviewed_by is distinct from actor_id
        or new.reviewed_at is null
        or new.cancelled_at is not null then
        raise exception 'Administrator time-off requests must be approved by their creator';
      end if;
    elsif new.status <> 'pending'
      or new.reviewed_by is not null
      or new.reviewed_at is not null
      or new.cancelled_at is not null then
      raise exception 'Employee time-off requests must start pending and unreviewed';
    end if;

    return new;
  end if;

  if new.studio_id is distinct from old.studio_id
    or new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Time-off ownership fields cannot be changed';
  end if;

  if new.request_type is distinct from old.request_type
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time
    or new.all_day is distinct from old.all_day
    or new.private_note is distinct from old.private_note then
    raise exception 'Time-off request details cannot be changed after submission';
  end if;

  if old.status = 'cancelled' then
    raise exception 'Cancelled time-off requests are read-only';
  end if;

  actor_is_admin := exists (
    select 1
    from public.studio_members as membership
    inner join public.profiles as profile on profile.id = membership.user_id
    where membership.studio_id = new.studio_id
      and membership.user_id = actor_id
      and membership.system_role = 'admin'
      and membership.is_active = true
      and profile.is_active = true
  );

  if old.status in ('approved', 'rejected') then
    if not actor_is_admin or new.status <> 'cancelled' then
      raise exception 'Only administrators may cancel reviewed time-off requests';
    end if;

    if new.cancelled_at is null
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Cancelling a reviewed request must preserve review details';
    end if;

    return new;
  end if;

  if old.status <> 'pending' then
    raise exception 'Unsupported time-off status transition';
  end if;

  if not actor_is_admin then
    if old.user_id is distinct from actor_id
      or new.status <> 'cancelled'
      or new.reviewed_by is not null
      or new.reviewed_at is not null
      or new.cancelled_at is null then
      raise exception 'Employees may only cancel their own pending request';
    end if;
    return new;
  end if;

  if new.status in ('approved', 'rejected') then
    if new.reviewed_by is distinct from actor_id
      or new.reviewed_at is null
      or new.cancelled_at is not null then
      raise exception 'Reviewed requests require the active administrator and review time';
    end if;
  elsif new.status = 'cancelled' then
    if new.reviewed_by is not null
      or new.reviewed_at is not null
      or new.cancelled_at is null then
      raise exception 'Cancelling a pending request cannot set review details';
    end if;
  else
    raise exception 'Unsupported time-off status transition';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_time_off_request() from public, anon, authenticated;

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
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if p_review_note is not null and char_length(p_review_note) > 2000 then raise exception 'Review note is too long'; end if;

  select request.* into target from public.time_off_requests as request where request.id = p_request_id for update;
  if not found then raise exception 'The request was not found'; end if;
  if not exists (
    select 1 from public.studio_members as member inner join public.profiles as profile on profile.id = member.user_id
    where member.studio_id = target.studio_id and member.user_id = actor_id and member.system_role = 'admin' and member.is_active = true and profile.is_active = true
  ) then raise exception 'Only active studio administrators may approve time-off requests'; end if;
  if target.status <> 'pending' then raise exception 'This time-off request is no longer pending'; end if;

  required := case when target.request_type = 'vacation' then 2 else 1 end;
  select count(*) into active_admin_count from public.studio_members as member inner join public.profiles as profile on profile.id = member.user_id
  where member.studio_id = target.studio_id and member.system_role = 'admin' and member.is_active = true and profile.is_active = true;
  if active_admin_count < required then raise exception 'This request requires % active admin approvals, but only % active administrators are available', required, active_admin_count; end if;

  insert into public.time_off_request_approvals (request_id, admin_user_id) values (target.id, actor_id) on conflict (request_id, admin_user_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then raise exception 'You have already approved this time-off request'; end if;
  select count(*) into approvals from public.time_off_request_approvals as approval where approval.request_id = target.id;

  if approvals >= required then
    update public.time_off_requests set status = 'approved', reviewed_by = actor_id, reviewed_at = now() where id = target.id;
    if p_review_note is not null then
      insert into public.time_off_request_reviews (request_id, note, created_by) values (target.id, p_review_note, actor_id);
    end if;
    update public.notifications set read_at = coalesce(read_at, now()) where studio_id = target.studio_id and entity_type = 'time_off_request' and entity_id = target.id and notification_type = 'time_off_request_submitted';
    target.status := 'approved';
  end if;

  return query select target.status, approvals, required;
end;
$$;

revoke execute on function public.approve_time_off_request(uuid, text) from public, anon;
grant execute on function public.approve_time_off_request(uuid, text) to authenticated;

create function public.reject_time_off_request(
  p_request_id uuid,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.time_off_requests%rowtype;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if p_review_note is not null and char_length(p_review_note) > 2000 then raise exception 'Review note is too long'; end if;
  select request.* into target from public.time_off_requests as request where request.id = p_request_id for update;
  if not found then raise exception 'The request was not found'; end if;
  if not exists (
    select 1 from public.studio_members as member inner join public.profiles as profile on profile.id = member.user_id
    where member.studio_id = target.studio_id and member.user_id = actor_id and member.system_role = 'admin' and member.is_active = true and profile.is_active = true
  ) then raise exception 'Only active studio administrators may reject time-off requests'; end if;
  if target.status <> 'pending' then raise exception 'This time-off request is no longer pending'; end if;

  update public.time_off_requests set status = 'rejected', reviewed_by = actor_id, reviewed_at = now() where id = target.id;
  if p_review_note is not null then
    insert into public.time_off_request_reviews (request_id, note, created_by) values (target.id, p_review_note, actor_id);
  end if;
end;
$$;

revoke execute on function public.reject_time_off_request(uuid, text) from public, anon;
grant execute on function public.reject_time_off_request(uuid, text) to authenticated;

alter table public.time_off_requests drop column review_note;
