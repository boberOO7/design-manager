-- Store the accounting boundary on the existing effective-dated policy versions.
-- Old rows retain employee-anniversary behavior; no leave or opening balances change.
alter table private.studio_vacation_policies
  add column year_boundary text not null default 'employee'
  check (year_boundary in ('employee','calendar'));

-- Replace the input contracts rather than leaving ambiguous PostgREST overloads.
drop function public.get_studio_vacation_policy(uuid);
drop function public.save_studio_vacation_policy(uuid,integer,text,integer);
drop function public.preview_studio_vacation_policy_recalculation(uuid,integer,text,integer);
drop function public.recalculate_studio_vacation_policy(uuid,integer,text,integer,text,boolean);
drop function private.vacation_policy_recalculation_preview(uuid,integer,text,integer);
drop function private.vacation_calculation_policy_at(uuid,timestamptz,private.studio_vacation_policies);

create function private.vacation_calculation_policy_at(
  p_studio_id uuid, p_instant timestamptz, p_recalculation private.studio_vacation_policies
) returns table(annual_days integer, carry_rule text, carry_cap_days integer, year_boundary text)
language sql volatile security definer set search_path = '' as $$
  select coalesce(policy.annual_days, (p_recalculation).annual_days, 24),
    coalesce(policy.carry_rule, (p_recalculation).carry_rule, 'carry_all'),
    case when policy.id is not null then policy.carry_cap_days else (p_recalculation).carry_cap_days end,
    coalesce(policy.year_boundary, (p_recalculation).year_boundary, 'employee')
  from (select 1) base
  left join lateral (
    select version.* from private.studio_vacation_policies version
    where version.studio_id = p_studio_id and version.effective_at <= p_instant
      and ((p_recalculation).effective_at is null or version.effective_at > (p_recalculation).effective_at)
    order by version.effective_at desc, version.id desc limit 1
  ) policy on true;
$$;
revoke all on function private.vacation_calculation_policy_at(uuid,timestamptz,private.studio_vacation_policies)
from public,anon,authenticated,service_role;

-- Find the next actual boundary under the policy effective on that date. Mode
-- switches do not retroactively introduce January resets or replay old anniversaries.
create function private.next_vacation_year_boundary(
  p_studio_id uuid, p_anchor date, p_after date,
  p_recalculation private.studio_vacation_policies default null
) returns date language plpgsql volatile security definer set search_path = '' as $$
declare
  employee_year integer;
  employee_boundary date;
  calendar_boundary date;
  candidate date;
  mode text;
begin
  if p_anchor is null or p_after is null then return null; end if;
  employee_year:=greatest(1,extract(year from p_after)::integer-extract(year from p_anchor)::integer);
  employee_boundary:=(p_anchor+make_interval(years=>employee_year))::date;
  if employee_boundary<=p_after then
    employee_year:=employee_year+1;
    employee_boundary:=(p_anchor+make_interval(years=>employee_year))::date;
  end if;
  calendar_boundary:=make_date(extract(year from p_after)::integer+1,1,1);
  loop
    candidate:=least(employee_boundary,calendar_boundary);
    select policy.year_boundary into mode from private.vacation_calculation_policy_at(
      p_studio_id,candidate::timestamp at time zone 'Europe/Kyiv',p_recalculation) policy;
    if (mode='employee' and candidate=employee_boundary)
      or (mode='calendar' and candidate=calendar_boundary) then return candidate; end if;
    if candidate=employee_boundary then
      employee_year:=employee_year+1;
      employee_boundary:=(p_anchor+make_interval(years=>employee_year))::date;
    end if;
    if candidate=calendar_boundary then
      calendar_boundary:=make_date(extract(year from calendar_boundary)::integer+1,1,1);
    end if;
  end loop;
end;
$$;
revoke all on function private.next_vacation_year_boundary(uuid,date,date,private.studio_vacation_policies)
from public,anon,authenticated,service_role;

create or replace function private.calculate_vacation_balance_units(
  p_studio_id uuid, p_user_id uuid, p_as_of date,
  p_extra_start date default null, p_extra_end date default null,
  p_recalculation private.studio_vacation_policies default null
) returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  member record;
  recalculation private.studio_vacation_policies;
  accrual_from date;
  anniversary_anchor date;
  next_boundary date;
  period_start date;
  month_date date;
  month_index integer := 1;
  earned_rate integer;
  reserved_days bigint;
  extra_days integer;
  balance_units bigint;
  boundary_policy record;
begin
  recalculation := p_recalculation;
  if recalculation.effective_at is null then
    select version.* into recalculation from private.studio_vacation_policies version
    where version.studio_id = p_studio_id and version.recalculates_existing
      and version.effective_at < (p_as_of + 1)::timestamp at time zone 'Europe/Kyiv'
    order by version.effective_at desc, version.id desc limit 1;
  end if;
  select joined_at, vacation_opening_date, vacation_opening_days into member
  from public.studio_members
  where studio_id = p_studio_id and user_id = p_user_id and is_active;
  if not found then return null; end if;
  accrual_from := coalesce(member.vacation_opening_date, member.joined_at);
  if accrual_from is null or p_as_of is null or p_as_of < accrual_from then return null; end if;
  anniversary_anchor := coalesce(member.joined_at, accrual_from);
  balance_units := coalesce(member.vacation_opening_days, 0)::bigint * 12;
  period_start := accrual_from;
  next_boundary := private.next_vacation_year_boundary(p_studio_id,anniversary_anchor,period_start,recalculation);

  loop
    -- Completed-month accrual remains anchored to the original start, once per month.
    -- A month completed on a boundary belongs to the ending year before carryover.
    loop
      month_date := (accrual_from + make_interval(months => month_index))::date;
      exit when month_date > least(p_as_of, next_boundary);
      select policy.annual_days into earned_rate
      from private.vacation_calculation_policy_at(p_studio_id, month_date::timestamp at time zone 'Europe/Kyiv', recalculation) policy;
      balance_units := balance_units + earned_rate;
      month_index := month_index + 1;
    end loop;

    select coalesce(sum(least(request.end_date, next_boundary - 1)
      - greatest(request.start_date, period_start) + 1), 0) into reserved_days
    from public.time_off_requests request
    where request.studio_id = p_studio_id and request.user_id = p_user_id
      and request.request_type = 'vacation' and request.status in ('pending', 'approved')
      and request.end_date >= period_start and request.start_date < next_boundary;
    extra_days := 0;
    if p_extra_start is not null and p_extra_end is not null
      and p_extra_end >= period_start and p_extra_start < next_boundary then
      extra_days := least(p_extra_end, next_boundary - 1)
        - greatest(p_extra_start, period_start) + 1;
    end if;
    balance_units := balance_units - 12 * (reserved_days + extra_days);
    if p_as_of < next_boundary then return balance_units; end if;

    select * into boundary_policy
    from private.vacation_calculation_policy_at(p_studio_id, next_boundary::timestamp at time zone 'Europe/Kyiv', recalculation);
    -- Expire unused positive days, never forgive a confirmed recalculation deficit.
    if boundary_policy.carry_rule = 'none' then
      balance_units := case when recalculation.effective_at is null then 0 else least(balance_units, 0) end;
    elsif boundary_policy.carry_rule = 'capped' then
      balance_units := least(
        case when recalculation.effective_at is null then greatest(balance_units, 0) else balance_units end,
        boundary_policy.carry_cap_days::bigint * 12);
    end if;
    period_start := next_boundary;
    next_boundary := private.next_vacation_year_boundary(p_studio_id,anniversary_anchor,period_start,recalculation);
  end loop;
end;
$$;
revoke all on function private.calculate_vacation_balance_units(uuid,uuid,date,date,date,private.studio_vacation_policies)
from public,anon,authenticated,service_role;

-- A new request must leave previously reserved future work years fundable as well.
create or replace function private.vacation_request_exceeds(
  p_studio_id uuid, p_user_id uuid, p_start date, p_end date
) returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  anchor date;
  checkpoint date := greatest((now() at time zone 'Europe/Kyiv')::date, p_start);
  anniversary date;
  horizon date;
  existing_request record;
  before_units bigint;
  after_units bigint;
begin
  select coalesce(joined_at, vacation_opening_date) into anchor
  from public.studio_members where studio_id = p_studio_id and user_id = p_user_id and is_active;
  if anchor is null then return true; end if;
  if private.vacation_balance_units(p_studio_id, p_user_id, checkpoint, p_start, p_end) < 0 then return true; end if;

  select greatest(p_end, coalesce(max(request.end_date), p_end)) into horizon
  from public.time_off_requests request
  where request.studio_id = p_studio_id and request.user_id = p_user_id
    and request.request_type = 'vacation' and request.status in ('pending', 'approved')
    and request.end_date > checkpoint;

  for existing_request in
    select request.start_date, request.end_date from public.time_off_requests request
    where request.studio_id = p_studio_id and request.user_id = p_user_id
      and request.request_type = 'vacation' and request.status in ('pending', 'approved')
      and request.start_date > checkpoint
  loop
    before_units := private.vacation_balance_units(p_studio_id, p_user_id, existing_request.start_date);
    after_units := private.vacation_balance_units(p_studio_id, p_user_id, existing_request.start_date, p_start, p_end);
    if after_units < 0 and after_units < before_units then return true; end if;
  end loop;

  anniversary := private.next_vacation_year_boundary(p_studio_id,anchor,checkpoint);
  while anniversary <= horizon loop
    if anniversary > checkpoint and (
      anniversary between p_start and p_end
      or exists (
        select 1 from public.time_off_requests request
        where request.studio_id = p_studio_id and request.user_id = p_user_id
          and request.request_type = 'vacation' and request.status in ('pending', 'approved')
          and request.start_date < anniversary and request.end_date >= anniversary
      )
    ) then
      after_units := private.vacation_balance_units(p_studio_id, p_user_id, anniversary, p_start, p_end);
      if anniversary <= p_end and after_units < 0 then return true; end if;
      before_units := private.vacation_balance_units(p_studio_id, p_user_id, anniversary);
      if after_units < 0 and after_units < before_units then return true; end if;
    end if;
    anniversary := private.next_vacation_year_boundary(p_studio_id,anchor,anniversary);
  end loop;
  return false;
end;
$$;

create function private.vacation_policy_recalculation_preview(
  p_studio_id uuid, p_annual_days integer, p_carry_rule text, p_carry_cap_days integer, p_year_boundary text default 'employee'
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  proposed private.studio_vacation_policies;
  today date := (now() at time zone 'Europe/Kyiv')::date;
  member record;
  checkpoint date;
  anniversary date;
  anchor date;
  horizon date;
  before_units bigint;
  after_units bigint;
  checkpoint_units bigint;
  minimum_units bigint;
  shortfall_date date;
  used_days bigint;
  reserved_days bigint;
  rows jsonb := '[]'::jsonb;
  source_state jsonb;
  result jsonb;
begin
  if auth.uid() is null or not coalesce(private.is_studio_admin(p_studio_id),false)
    or not exists(select 1 from public.profiles where id=auth.uid() and is_active) then
    raise exception 'vacation_policy_admin_required' using errcode = '42501';
  end if;
  if p_annual_days is null or p_annual_days < 0 or p_carry_rule is null
    or p_carry_rule not in ('carry_all','capped','none')
    or p_year_boundary is null or p_year_boundary not in ('employee','calendar')
    or (p_carry_rule = 'capped' and (p_carry_cap_days is null or p_carry_cap_days < 0))
    or (p_carry_rule <> 'capped' and p_carry_cap_days is not null) then
    raise exception 'Invalid vacation policy' using errcode = '22023';
  end if;
  proposed.annual_days := p_annual_days;
  proposed.carry_rule := p_carry_rule;
  proposed.carry_cap_days := p_carry_cap_days;
  proposed.effective_at := clock_timestamp();
  proposed.year_boundary := p_year_boundary;

  -- Include source identities and exact state, not just rounded visible balances.
  select jsonb_build_object(
    'policies', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)
      from private.studio_vacation_policies p where p.studio_id=p_studio_id),
    'members', (select coalesce(jsonb_agg(jsonb_build_array(m.user_id,m.joined_at,m.vacation_opening_date,m.vacation_opening_days,m.is_active,m.system_role) order by m.id),'[]'::jsonb)
      from public.studio_members m where m.studio_id=p_studio_id),
    'requests', (select coalesce(jsonb_agg(jsonb_build_array(r.id,r.user_id,r.start_date,r.end_date,r.status) order by r.id),'[]'::jsonb)
      from public.time_off_requests r where r.studio_id=p_studio_id and r.request_type='vacation')
  ) into source_state;

  for member in
    select m.user_id, coalesce(p.full_name,'') as name,
      coalesce(m.vacation_opening_date,m.joined_at)::date as accrual_from,
      coalesce(m.joined_at,m.vacation_opening_date)::date as anchor,
      m.vacation_opening_days as opening_days
    from public.studio_members m join public.profiles p on p.id=m.user_id
    where m.studio_id=p_studio_id and m.is_active
    order by m.user_id
  loop
    before_units := private.vacation_balance_units(p_studio_id,member.user_id,today);
    after_units := private.calculate_vacation_balance_units(p_studio_id,member.user_id,today,null,null,proposed);
    minimum_units := after_units;
    shortfall_date := case when after_units < 0 then today end;
    anchor := member.anchor;

    -- Use the same configured boundaries as request enforcement, including spanning leave.
    for checkpoint in
      select distinct greatest(r.start_date,today)
      from public.time_off_requests r
      where r.studio_id=p_studio_id and r.user_id=member.user_id and r.request_type='vacation'
        and r.status in ('pending','approved') and r.end_date >= today
    loop
      checkpoint_units := private.calculate_vacation_balance_units(p_studio_id,member.user_id,checkpoint,null,null,proposed);
      if checkpoint_units < minimum_units or (minimum_units is null and checkpoint_units is not null) then minimum_units:=checkpoint_units; shortfall_date:=checkpoint; end if;
    end loop;
    select max(r.end_date) into horizon from public.time_off_requests r
    where r.studio_id=p_studio_id and r.user_id=member.user_id and r.request_type='vacation'
      and r.status in ('pending','approved') and r.end_date >= today;
    if anchor is not null and horizon is not null then
      anniversary := private.next_vacation_year_boundary(p_studio_id,anchor,today,proposed);
      while anniversary <= horizon loop
        if anniversary > today and exists (
          select 1 from public.time_off_requests r
          where r.studio_id=p_studio_id and r.user_id=member.user_id and r.request_type='vacation'
            and r.status in ('pending','approved') and r.start_date < anniversary and r.end_date >= anniversary
        ) then
          checkpoint_units := private.calculate_vacation_balance_units(p_studio_id,member.user_id,anniversary,null,null,proposed);
          if checkpoint_units < minimum_units or (minimum_units is null and checkpoint_units is not null) then minimum_units:=checkpoint_units; shortfall_date:=anniversary; end if;
        end if;
        anniversary := private.next_vacation_year_boundary(p_studio_id,anchor,anniversary,proposed);
      end loop;
    end if;

    select
      coalesce(sum(case when r.status='approved' then greatest(0,least(r.end_date,today)-greatest(r.start_date,member.accrual_from)+1) else 0 end),0),
      coalesce(sum(case when r.status='pending' then greatest(0,r.end_date-greatest(r.start_date,member.accrual_from)+1)
        else greatest(0,r.end_date-greatest(r.start_date,member.accrual_from,today+1)+1) end),0)
    into used_days,reserved_days from public.time_off_requests r
    where r.studio_id=p_studio_id and r.user_id=member.user_id and r.request_type='vacation'
      and r.status in ('pending','approved') and r.end_date >= member.accrual_from;

    rows:=rows||jsonb_build_array(jsonb_build_object(
      'userId',member.user_id,'name',member.name,'accrualFrom',member.accrual_from,'openingDays',member.opening_days,
      'before',floor(before_units::numeric/12),'after',floor(after_units::numeric/12),
      'delta',floor(after_units::numeric/12)-floor(before_units::numeric/12),
      'changed',before_units is distinct from after_units,
      'usedDays',used_days,'reservedDays',reserved_days,
      'minimumBalance',floor(minimum_units::numeric/12),'shortfallDate',shortfall_date
    ));
  end loop;
  result:=jsonb_build_object('asOf',today,'employees',rows,
    'hasShortfall',exists(select 1 from jsonb_array_elements(rows) r where (r->>'minimumBalance')::numeric<0));
  return result||jsonb_build_object('digest',md5(jsonb_build_object(
    'studioId',p_studio_id,'annualDays',p_annual_days,'carryRule',p_carry_rule,'carryCapDays',p_carry_cap_days,'yearBoundary',p_year_boundary,
    'state',source_state,'preview',result)::text));
end;
$$;
revoke all on function private.vacation_policy_recalculation_preview(uuid,integer,text,integer,text)
from public,anon,authenticated,service_role;

create function public.get_studio_vacation_policy(p_studio_id uuid)
returns table(annual_days integer, carry_rule text, carry_cap_days integer, year_boundary text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not coalesce(private.is_studio_admin(p_studio_id),false) then
    raise exception 'Only active studio administrators can view the vacation policy';
  end if;
  return query select policy.* from private.vacation_calculation_policy_at(p_studio_id,clock_timestamp(),null) policy;
end;
$$;
revoke all on function public.get_studio_vacation_policy(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_studio_vacation_policy(uuid) to authenticated;

create function public.preview_studio_vacation_policy_recalculation(
  p_studio_id uuid,p_annual_days integer,p_carry_rule text,p_carry_cap_days integer default null, p_year_boundary text default 'employee'
) returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.vacation_policy_recalculation_preview(p_studio_id,p_annual_days,p_carry_rule,p_carry_cap_days,p_year_boundary);
$$;
revoke all on function public.preview_studio_vacation_policy_recalculation(uuid,integer,text,integer,text)
from public,anon,authenticated,service_role;
grant execute on function public.preview_studio_vacation_policy_recalculation(uuid,integer,text,integer,text) to authenticated;

create function public.recalculate_studio_vacation_policy(
  p_studio_id uuid,p_annual_days integer,p_carry_rule text,p_carry_cap_days integer default null,
  p_preview_digest text default null,p_confirm_negative boolean default false, p_year_boundary text default 'employee'
) returns void language plpgsql security definer set search_path = '' as $$
declare preview jsonb; latest private.studio_vacation_policies;
begin
  if auth.uid() is null or not coalesce(private.is_studio_admin(p_studio_id),false)
    or not exists(select 1 from public.profiles where id=auth.uid() and is_active) then
    raise exception 'vacation_policy_admin_required' using errcode = '42501';
  end if;
  -- The studio FK lock also serializes new memberships with the preview.
  -- NOWAIT on every source lock avoids inverted membership/request lock waits.
  perform 1 from public.studios where id=p_studio_id for update nowait;
  if not found then raise exception 'Studio was not found'; end if;
  select * into latest from private.studio_vacation_policies p where p.studio_id=p_studio_id and p.effective_at<=clock_timestamp()
    order by p.effective_at desc,p.id desc limit 1;
  if p_preview_digest is not null and latest.preview_digest=p_preview_digest
    and latest.annual_days=p_annual_days and latest.carry_rule=p_carry_rule
    and latest.carry_cap_days is not distinct from p_carry_cap_days
    and latest.year_boundary=p_year_boundary then return; end if;

  -- Vacation inserts and opening-balance edits already lock memberships. Lock
  -- existing leave rows too; retry busy sources rather than risk inverted RPC locks.
  perform 1 from public.studio_members where studio_id=p_studio_id order by id for update nowait;
  perform 1 from public.time_off_requests where studio_id=p_studio_id and request_type='vacation' order by id for update nowait;
  preview:=private.vacation_policy_recalculation_preview(p_studio_id,p_annual_days,p_carry_rule,p_carry_cap_days,p_year_boundary);
  if p_preview_digest is null or p_preview_digest is distinct from preview->>'digest' then
    raise exception 'vacation_policy_preview_stale';
  end if;
  if (preview->>'hasShortfall')::boolean and not coalesce(p_confirm_negative,false) then
    raise exception 'vacation_policy_negative_confirmation_required';
  end if;
  -- Replaying an already-current recalculation is a no-op, with no duplicate accrual or version.
  if latest.recalculates_existing and latest.annual_days=p_annual_days and latest.carry_rule=p_carry_rule
    and latest.carry_cap_days is not distinct from p_carry_cap_days
    and latest.year_boundary=p_year_boundary then return; end if;
  insert into private.studio_vacation_policies(studio_id,annual_days,carry_rule,carry_cap_days,
    recalculates_existing,preview_digest,negative_balances_confirmed,created_by,year_boundary)
  values(p_studio_id,p_annual_days,p_carry_rule,p_carry_cap_days,true,p_preview_digest,
    (preview->>'hasShortfall')::boolean and p_confirm_negative,auth.uid(),p_year_boundary);
end;
$$;
revoke all on function public.recalculate_studio_vacation_policy(uuid,integer,text,integer,text,boolean,text)
from public,anon,authenticated,service_role;
grant execute on function public.recalculate_studio_vacation_policy(uuid,integer,text,integer,text,boolean,text) to authenticated;
create or replace function public.save_studio_vacation_policy(
  p_studio_id uuid, p_annual_days integer, p_carry_rule text, p_carry_cap_days integer default null, p_year_boundary text default 'employee'
) returns void language plpgsql security definer set search_path = '' as $$
declare current_policy record;
begin
  if auth.uid() is null or not coalesce(private.is_studio_admin(p_studio_id), false)
    or not exists(select 1 from public.profiles where id=auth.uid() and is_active) then
    raise exception 'Only active studio administrators can save the vacation policy';
  end if;
  if p_annual_days is null or p_annual_days < 0
    or p_carry_rule is null or p_carry_rule not in ('carry_all', 'capped', 'none')
    or p_year_boundary is null or p_year_boundary not in ('employee','calendar')
    or (p_carry_rule = 'capped' and (p_carry_cap_days is null or p_carry_cap_days < 0))
    or (p_carry_rule <> 'capped' and p_carry_cap_days is not null) then
    raise exception 'Invalid vacation policy';
  end if;
  perform 1 from public.studios where id = p_studio_id for update nowait;
  if not found then raise exception 'Studio was not found'; end if;
  select * into current_policy from private.vacation_calculation_policy_at(p_studio_id, clock_timestamp(),null);
  if current_policy.annual_days = p_annual_days and current_policy.carry_rule = p_carry_rule
    and current_policy.carry_cap_days is not distinct from p_carry_cap_days
    and current_policy.year_boundary=p_year_boundary then return; end if;
  insert into private.studio_vacation_policies (studio_id, annual_days, carry_rule, carry_cap_days, year_boundary)
  values (p_studio_id, p_annual_days, p_carry_rule, p_carry_cap_days, p_year_boundary);
end;
$$;

revoke all on function public.save_studio_vacation_policy(uuid,integer,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.save_studio_vacation_policy(uuid,integer,text,integer,text) to authenticated;

notify pgrst,'reload schema';
