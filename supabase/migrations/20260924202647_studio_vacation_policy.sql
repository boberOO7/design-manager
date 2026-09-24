-- Versions are effective when saved. A missing version is the historical and new-studio default.
create table private.studio_vacation_policies (
  id bigint generated always as identity primary key,
  studio_id uuid not null references public.studios(id) on delete cascade,
  effective_at timestamptz not null default clock_timestamp(),
  annual_days integer not null check (annual_days >= 0),
  carry_rule text not null check (carry_rule in ('carry_all', 'capped', 'none')),
  carry_cap_days integer,
  constraint studio_vacation_policy_cap check (
    (carry_rule = 'capped' and carry_cap_days is not null and carry_cap_days >= 0)
    or (carry_rule <> 'capped' and carry_cap_days is null)
  )
);
create index studio_vacation_policies_studio_effective_idx
  on private.studio_vacation_policies (studio_id, effective_at desc, id desc);
alter table private.studio_vacation_policies enable row level security;
revoke all on private.studio_vacation_policies from public, anon, authenticated;

create function private.vacation_policy_at(p_studio_id uuid, p_instant timestamptz)
returns table (annual_days integer, carry_rule text, carry_cap_days integer)
language sql volatile security definer set search_path = '' as $$
  select coalesce(policy.annual_days, 24), coalesce(policy.carry_rule, 'carry_all'), policy.carry_cap_days
  from (select 1) as base
  left join lateral (
    select version.annual_days, version.carry_rule, version.carry_cap_days
    from private.studio_vacation_policies version
    where version.studio_id = p_studio_id and version.effective_at <= p_instant
    order by version.effective_at desc, version.id desc limit 1
  ) policy on true;
$$;
revoke all on function private.vacation_policy_at(uuid, timestamptz) from public, anon, authenticated;

create function public.get_studio_vacation_policy(p_studio_id uuid)
returns table (annual_days integer, carry_rule text, carry_cap_days integer)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then
    raise exception 'Only active studio administrators can view the vacation policy';
  end if;
  return query select policy.* from private.vacation_policy_at(p_studio_id, clock_timestamp()) policy;
end;
$$;
revoke all on function public.get_studio_vacation_policy(uuid) from public, anon;
grant execute on function public.get_studio_vacation_policy(uuid) to authenticated;

create function public.save_studio_vacation_policy(
  p_studio_id uuid, p_annual_days integer, p_carry_rule text, p_carry_cap_days integer
) returns void language plpgsql security definer set search_path = '' as $$
declare current_policy record;
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then
    raise exception 'Only active studio administrators can save the vacation policy';
  end if;
  if p_annual_days is null or p_annual_days < 0
    or p_carry_rule not in ('carry_all', 'capped', 'none')
    or (p_carry_rule = 'capped' and (p_carry_cap_days is null or p_carry_cap_days < 0))
    or (p_carry_rule <> 'capped' and p_carry_cap_days is not null) then
    raise exception 'Invalid vacation policy';
  end if;
  perform 1 from public.studios where id = p_studio_id for update;
  if not found then raise exception 'Studio was not found'; end if;
  select * into current_policy from private.vacation_policy_at(p_studio_id, clock_timestamp());
  if current_policy.annual_days = p_annual_days and current_policy.carry_rule = p_carry_rule
    and current_policy.carry_cap_days is not distinct from p_carry_cap_days then return; end if;
  insert into private.studio_vacation_policies (studio_id, annual_days, carry_rule, carry_cap_days)
  values (p_studio_id, p_annual_days, p_carry_rule, p_carry_cap_days);
end;
$$;
revoke all on function public.save_studio_vacation_policy(uuid, integer, text, integer) from public, anon;
grant execute on function public.save_studio_vacation_policy(uuid, integer, text, integer) to authenticated;

-- One accrued month earns annual_days twelfths of a day. Units stay integral through carryover.
create function private.vacation_balance_units(
  p_studio_id uuid, p_user_id uuid, p_as_of date,
  p_extra_start date default null, p_extra_end date default null
) returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  member record;
  accrual_from date;
  anniversary_anchor date;
  next_anniversary date;
  period_start date;
  month_date date;
  month_index integer := 1;
  year_index integer := 1;
  earned_rate integer;
  reserved_days bigint;
  extra_days integer;
  balance_units bigint;
  boundary_policy record;
begin
  select joined_at, vacation_opening_date, vacation_opening_days into member
  from public.studio_members
  where studio_id = p_studio_id and user_id = p_user_id and is_active;
  if not found then return null; end if;
  accrual_from := coalesce(member.vacation_opening_date, member.joined_at);
  if accrual_from is null or p_as_of is null or p_as_of < accrual_from then return null; end if;
  anniversary_anchor := coalesce(member.joined_at, accrual_from);
  balance_units := coalesce(member.vacation_opening_days, 0)::bigint * 12;
  period_start := accrual_from;
  next_anniversary := (anniversary_anchor + make_interval(years => year_index))::date;
  while next_anniversary <= period_start loop
    year_index := year_index + 1;
    next_anniversary := (anniversary_anchor + make_interval(years => year_index))::date;
  end loop;

  loop
    -- The twelfth completed month belongs to the ending work year before carryover.
    loop
      month_date := (accrual_from + make_interval(months => month_index))::date;
      exit when month_date > least(p_as_of, next_anniversary);
      select policy.annual_days into earned_rate
      from private.vacation_policy_at(p_studio_id, month_date::timestamp at time zone 'Europe/Kyiv') policy;
      balance_units := balance_units + earned_rate;
      month_index := month_index + 1;
    end loop;

    select coalesce(sum(least(request.end_date, next_anniversary - 1)
      - greatest(request.start_date, period_start) + 1), 0) into reserved_days
    from public.time_off_requests request
    where request.studio_id = p_studio_id and request.user_id = p_user_id
      and request.request_type = 'vacation' and request.status in ('pending', 'approved')
      and request.end_date >= period_start and request.start_date < next_anniversary;
    extra_days := 0;
    if p_extra_start is not null and p_extra_end is not null
      and p_extra_end >= period_start and p_extra_start < next_anniversary then
      extra_days := least(p_extra_end, next_anniversary - 1)
        - greatest(p_extra_start, period_start) + 1;
    end if;
    balance_units := balance_units - 12 * (reserved_days + extra_days);
    if p_as_of < next_anniversary then return balance_units; end if;

    select * into boundary_policy
    from private.vacation_policy_at(p_studio_id, next_anniversary::timestamp at time zone 'Europe/Kyiv');
    if boundary_policy.carry_rule = 'none' then balance_units := 0;
    elsif boundary_policy.carry_rule = 'capped' then
      balance_units := least(greatest(balance_units, 0), boundary_policy.carry_cap_days::bigint * 12);
    end if;
    period_start := next_anniversary;
    year_index := year_index + 1;
    next_anniversary := (anniversary_anchor + make_interval(years => year_index))::date;
  end loop;
end;
$$;
revoke all on function private.vacation_balance_units(uuid, uuid, date, date, date) from public, anon, authenticated;

create or replace function private.vacation_available(p_studio_id uuid, p_user_id uuid, p_as_of date)
returns integer language sql volatile security definer set search_path = '' as $$
  select floor(private.vacation_balance_units(p_studio_id, p_user_id, p_as_of)::numeric / 12)::integer;
$$;

create function private.vacation_request_exceeds(
  p_studio_id uuid, p_user_id uuid, p_start date, p_end date
) returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  anchor date;
  checkpoint date := greatest((now() at time zone 'Europe/Kyiv')::date, p_start);
  anniversary date;
  year_index integer := 1;
begin
  select coalesce(joined_at, vacation_opening_date) into anchor
  from public.studio_members where studio_id = p_studio_id and user_id = p_user_id and is_active;
  if anchor is null then return true; end if;
  if private.vacation_balance_units(p_studio_id, p_user_id, checkpoint, p_start, p_end) < 0 then return true; end if;
  anniversary := (anchor + make_interval(years => year_index))::date;
  while anniversary <= p_end loop
    if anniversary > checkpoint and private.vacation_balance_units(p_studio_id, p_user_id, anniversary, p_start, p_end) < 0 then return true; end if;
    year_index := year_index + 1;
    anniversary := (anchor + make_interval(years => year_index))::date;
  end loop;
  return false;
end;
$$;
revoke all on function private.vacation_request_exceeds(uuid, uuid, date, date) from public, anon, authenticated;

create function public.project_vacation_request(p_studio_id uuid, p_user_id uuid, p_start date, p_end date)
returns table (available integer, remaining integer, exceeds boolean)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_start is null or p_end is null or p_end < p_start or not exists (
    select 1 from public.studio_members actor join public.profiles profile on profile.id = actor.user_id
    where actor.studio_id = p_studio_id and actor.user_id = (select auth.uid())
      and actor.is_active and profile.is_active
      and (actor.user_id = p_user_id or actor.system_role = 'admin')
  ) then raise exception 'Vacation projection is unavailable'; end if;
  return query select
    private.vacation_available(p_studio_id, p_user_id, greatest((now() at time zone 'Europe/Kyiv')::date, p_start)),
    floor(private.vacation_balance_units(p_studio_id, p_user_id,
      greatest((now() at time zone 'Europe/Kyiv')::date, p_end), p_start, p_end)::numeric / 12)::integer,
    private.vacation_request_exceeds(p_studio_id, p_user_id, p_start, p_end);
end;
$$;
revoke all on function public.project_vacation_request(uuid, uuid, date, date) from public, anon;
grant execute on function public.project_vacation_request(uuid, uuid, date, date) to authenticated;

create or replace function private.enforce_vacation_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare count_from date;
begin
  if new.request_type <> 'vacation' then return new; end if;
  select coalesce(vacation_opening_date, joined_at) into count_from from public.studio_members
  where studio_id = new.studio_id and user_id = new.user_id and is_active for update;
  if not found or count_from is null then raise exception 'Vacation employee is unavailable'; end if;
  if new.end_date < count_from then return new; end if;
  if private.vacation_request_exceeds(new.studio_id, new.user_id, new.start_date, new.end_date) then
    raise exception 'vacation_balance_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
