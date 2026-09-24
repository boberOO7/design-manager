alter table public.studio_members
  add column vacation_opening_days integer,
  add column vacation_opening_date date,
  add constraint studio_members_vacation_opening_pair check (
    (vacation_opening_days is null and vacation_opening_date is null)
    or (vacation_opening_days >= 0 and vacation_opening_date is not null
      and (joined_at is null or vacation_opening_date >= joined_at))
  );

-- Opening days include prior usage. Only vacation on/after the effective date is counted.
create function private.vacation_available(p_studio_id uuid, p_user_id uuid, p_as_of date)
returns integer language sql volatile security definer set search_path = '' as $$
  with member as (
    select coalesce(vacation_opening_date, joined_at) as accrual_from,
      coalesce(vacation_opening_days, 0) as opening_days
    from public.studio_members
    where studio_id = p_studio_id and user_id = p_user_id and is_active
  ), months as (
    select member.*,
      greatest(0, (extract(year from p_as_of)::integer - extract(year from accrual_from)::integer) * 12
        + extract(month from p_as_of)::integer - extract(month from accrual_from)::integer) as elapsed
    from member
  )
  select opening_days
    + case when accrual_from is null or p_as_of < accrual_from then 0 else
      2 * (elapsed - case when (accrual_from + make_interval(months => elapsed))::date > p_as_of then 1 else 0 end)
      end
    - coalesce((
      select sum(request.end_date - greatest(request.start_date, months.accrual_from) + 1)::integer
      from public.time_off_requests request
      where request.studio_id = p_studio_id and request.user_id = p_user_id
        and request.request_type = 'vacation' and request.status in ('pending', 'approved')
        and request.end_date >= months.accrual_from
    ), 0)
  from months;
$$;
revoke all on function private.vacation_available(uuid, uuid, date) from public, anon, authenticated;

create function public.get_vacation_balance(p_studio_id uuid, p_user_id uuid, p_as_of date)
returns integer language plpgsql volatile security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_as_of is null or not exists (
    select 1 from public.studio_members actor
    join public.profiles profile on profile.id = actor.user_id
    where actor.studio_id = p_studio_id and actor.user_id = (select auth.uid())
      and actor.is_active and profile.is_active
      and (actor.user_id = p_user_id or actor.system_role = 'admin')
  ) then raise exception 'Vacation balance is unavailable'; end if;
  return private.vacation_available(p_studio_id, p_user_id, p_as_of);
end;
$$;
revoke all on function public.get_vacation_balance(uuid, uuid, date) from public, anon;
grant execute on function public.get_vacation_balance(uuid, uuid, date) to authenticated;

create function public.set_vacation_opening_balance(p_user_id uuid, p_days integer, p_effective_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.studio_members%rowtype; actor_studio uuid;
begin
  if p_days is null or p_days < 0 or p_effective_date is null or p_effective_date > (now() at time zone 'Europe/Kyiv')::date then
    raise exception 'Invalid vacation opening balance';
  end if;
  select actor.studio_id into actor_studio
  from public.studio_members actor join public.profiles profile on profile.id = actor.user_id
  where actor.user_id = (select auth.uid()) and actor.system_role = 'admin'
    and actor.is_active and profile.is_active;
  if actor_studio is null then raise exception 'Only an active studio administrator may set a vacation opening balance'; end if;
  select member.* into target from public.studio_members member
  where member.studio_id = actor_studio and member.user_id = p_user_id and member.is_active for update;
  if not found then raise exception 'Active studio member was not found'; end if;
  if target.joined_at is not null and p_effective_date < target.joined_at then
    raise exception 'Opening date must follow the employment start date';
  end if;
  update public.studio_members set vacation_opening_days = p_days, vacation_opening_date = p_effective_date
  where id = target.id;
end;
$$;
revoke all on function public.set_vacation_opening_balance(uuid, integer, date) from public, anon;
grant execute on function public.set_vacation_opening_balance(uuid, integer, date) to authenticated;

-- Lock the membership so concurrent vacation inserts see preceding reservations.
create function private.enforce_vacation_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare count_from date;
begin
  if new.request_type <> 'vacation' then return new; end if;
  select coalesce(vacation_opening_date, joined_at) into count_from from public.studio_members
  where studio_id = new.studio_id and user_id = new.user_id and is_active for update;
  if not found or count_from is null then raise exception 'Vacation employee is unavailable'; end if;
  if new.end_date < count_from then return new; end if;
  if private.vacation_available(new.studio_id, new.user_id, greatest((now() at time zone 'Europe/Kyiv')::date, new.start_date))
      < new.end_date - greatest(new.start_date, count_from) + 1 then
    raise exception 'vacation_balance_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_vacation_balance() from public, anon, authenticated;
create trigger validate_vacation_balance_before_insert
before insert on public.time_off_requests for each row execute function private.enforce_vacation_balance();

-- Permit administrators to create absences for another member of their studio.
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
    if new.user_id is distinct from actor_id and not actor_is_admin then
      raise exception 'Time-off requests must belong to the authenticated user or an active administrator';
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


-- The prior insert policy restricted every request to its author.
drop policy time_off_requests_insert_own on public.time_off_requests;
create policy time_off_requests_insert_own_or_admin
on public.time_off_requests for insert to authenticated
with check (
  (user_id = (select auth.uid()) and (select private.is_studio_member(studio_id)))
  or (select private.is_studio_admin(studio_id))
);
