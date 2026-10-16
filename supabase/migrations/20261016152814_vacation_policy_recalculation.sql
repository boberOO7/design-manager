-- Existing balances remain derived, with exact twelfths of a day. A recalculation
-- appends a replay baseline; it never rewrites policy history or leave records.
alter table private.studio_vacation_policies
  add column recalculates_existing boolean not null default false,
  add column preview_digest text,
  add column negative_balances_confirmed boolean not null default false,
  add column created_by uuid references public.profiles(id) on delete set null;
create unique index studio_vacation_policy_recalculation_digest_idx
  on private.studio_vacation_policies(studio_id, preview_digest)
  where preview_digest is not null;

create function private.vacation_calculation_policy_at(
  p_studio_id uuid, p_instant timestamptz, p_recalculation private.studio_vacation_policies
) returns table(annual_days integer, carry_rule text, carry_cap_days integer)
language sql volatile security definer set search_path = '' as $$
  select coalesce(policy.annual_days, (p_recalculation).annual_days, 24),
    coalesce(policy.carry_rule, (p_recalculation).carry_rule, 'carry_all'),
    case when policy.id is not null then policy.carry_cap_days else (p_recalculation).carry_cap_days end
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

create function private.calculate_vacation_balance_units(
  p_studio_id uuid, p_user_id uuid, p_as_of date,
  p_extra_start date default null, p_extra_end date default null,
  p_recalculation private.studio_vacation_policies default null
) returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  member record;
  recalculation private.studio_vacation_policies;
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
      from private.vacation_calculation_policy_at(p_studio_id, month_date::timestamp at time zone 'Europe/Kyiv', recalculation) policy;
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
    from private.vacation_calculation_policy_at(p_studio_id, next_anniversary::timestamp at time zone 'Europe/Kyiv', recalculation);
    -- Expire unused positive days, never forgive a confirmed recalculation deficit.
    if boundary_policy.carry_rule = 'none' then
      balance_units := case when recalculation.effective_at is null then 0 else least(balance_units, 0) end;
    elsif boundary_policy.carry_rule = 'capped' then
      balance_units := least(
        case when recalculation.effective_at is null then greatest(balance_units, 0) else balance_units end,
        boundary_policy.carry_cap_days::bigint * 12);
    end if;
    period_start := next_anniversary;
    year_index := year_index + 1;
    next_anniversary := (anniversary_anchor + make_interval(years => year_index))::date;
  end loop;
end;
$$;
revoke all on function private.calculate_vacation_balance_units(uuid,uuid,date,date,date,private.studio_vacation_policies)
from public,anon,authenticated,service_role;

create or replace function private.vacation_balance_units(
  p_studio_id uuid, p_user_id uuid, p_as_of date,
  p_extra_start date default null, p_extra_end date default null
) returns bigint language sql volatile security definer set search_path = '' as $$
  select private.calculate_vacation_balance_units(p_studio_id,p_user_id,p_as_of,p_extra_start,p_extra_end);
$$;

create function private.vacation_policy_recalculation_preview(
  p_studio_id uuid, p_annual_days integer, p_carry_rule text, p_carry_cap_days integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  proposed private.studio_vacation_policies;
  today date := (now() at time zone 'Europe/Kyiv')::date;
  member record;
  checkpoint date;
  anniversary date;
  anchor date;
  horizon date;
  year_index integer;
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
    or (p_carry_rule = 'capped' and (p_carry_cap_days is null or p_carry_cap_days < 0))
    or (p_carry_rule <> 'capped' and p_carry_cap_days is not null) then
    raise exception 'Invalid vacation policy' using errcode = '22023';
  end if;
  proposed.annual_days := p_annual_days;
  proposed.carry_rule := p_carry_rule;
  proposed.carry_cap_days := p_carry_cap_days;
  proposed.effective_at := clock_timestamp();

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

    -- Match the existing reservation checkpoints, including leave crossing a work-year boundary.
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
    year_index:=1;
    if anchor is not null and horizon is not null then
      anniversary := (anchor + make_interval(years=>year_index))::date;
      while anniversary <= horizon loop
        if anniversary > today and exists (
          select 1 from public.time_off_requests r
          where r.studio_id=p_studio_id and r.user_id=member.user_id and r.request_type='vacation'
            and r.status in ('pending','approved') and r.start_date < anniversary and r.end_date >= anniversary
        ) then
          checkpoint_units := private.calculate_vacation_balance_units(p_studio_id,member.user_id,anniversary,null,null,proposed);
          if checkpoint_units < minimum_units or (minimum_units is null and checkpoint_units is not null) then minimum_units:=checkpoint_units; shortfall_date:=anniversary; end if;
        end if;
        year_index:=year_index+1;
        anniversary := (anchor + make_interval(years=>year_index))::date;
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
    'studioId',p_studio_id,'annualDays',p_annual_days,'carryRule',p_carry_rule,'carryCapDays',p_carry_cap_days,
    'state',source_state,'preview',result)::text));
end;
$$;
revoke all on function private.vacation_policy_recalculation_preview(uuid,integer,text,integer)
from public,anon,authenticated,service_role;

create function public.preview_studio_vacation_policy_recalculation(
  p_studio_id uuid,p_annual_days integer,p_carry_rule text,p_carry_cap_days integer default null
) returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.vacation_policy_recalculation_preview(p_studio_id,p_annual_days,p_carry_rule,p_carry_cap_days);
$$;
revoke all on function public.preview_studio_vacation_policy_recalculation(uuid,integer,text,integer)
from public,anon,authenticated,service_role;
grant execute on function public.preview_studio_vacation_policy_recalculation(uuid,integer,text,integer) to authenticated;

create function public.recalculate_studio_vacation_policy(
  p_studio_id uuid,p_annual_days integer,p_carry_rule text,p_carry_cap_days integer default null,
  p_preview_digest text default null,p_confirm_negative boolean default false
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
    and latest.carry_cap_days is not distinct from p_carry_cap_days then return; end if;

  -- Vacation inserts and opening-balance edits already lock memberships. Lock
  -- existing leave rows too; retry busy sources rather than risk inverted RPC locks.
  perform 1 from public.studio_members where studio_id=p_studio_id order by id for update nowait;
  perform 1 from public.time_off_requests where studio_id=p_studio_id and request_type='vacation' order by id for update nowait;
  preview:=private.vacation_policy_recalculation_preview(p_studio_id,p_annual_days,p_carry_rule,p_carry_cap_days);
  if p_preview_digest is null or p_preview_digest is distinct from preview->>'digest' then
    raise exception 'vacation_policy_preview_stale';
  end if;
  if (preview->>'hasShortfall')::boolean and not coalesce(p_confirm_negative,false) then
    raise exception 'vacation_policy_negative_confirmation_required';
  end if;
  -- Replaying an already-current recalculation is a no-op, with no duplicate accrual or version.
  if latest.recalculates_existing and latest.annual_days=p_annual_days and latest.carry_rule=p_carry_rule
    and latest.carry_cap_days is not distinct from p_carry_cap_days then return; end if;
  insert into private.studio_vacation_policies(studio_id,annual_days,carry_rule,carry_cap_days,
    recalculates_existing,preview_digest,negative_balances_confirmed,created_by)
  values(p_studio_id,p_annual_days,p_carry_rule,p_carry_cap_days,true,p_preview_digest,
    (preview->>'hasShortfall')::boolean and p_confirm_negative,auth.uid());
end;
$$;
revoke all on function public.recalculate_studio_vacation_policy(uuid,integer,text,integer,text,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.recalculate_studio_vacation_policy(uuid,integer,text,integer,text,boolean) to authenticated;
create or replace function public.save_studio_vacation_policy(
  p_studio_id uuid, p_annual_days integer, p_carry_rule text, p_carry_cap_days integer default null
) returns void language plpgsql security definer set search_path = '' as $$
declare current_policy record;
begin
  if auth.uid() is null or not coalesce(private.is_studio_admin(p_studio_id), false)
    or not exists(select 1 from public.profiles where id=auth.uid() and is_active) then
    raise exception 'Only active studio administrators can save the vacation policy';
  end if;
  if p_annual_days is null or p_annual_days < 0
    or p_carry_rule is null or p_carry_rule not in ('carry_all', 'capped', 'none')
    or (p_carry_rule = 'capped' and (p_carry_cap_days is null or p_carry_cap_days < 0))
    or (p_carry_rule <> 'capped' and p_carry_cap_days is not null) then
    raise exception 'Invalid vacation policy';
  end if;
  perform 1 from public.studios where id = p_studio_id for update nowait;
  if not found then raise exception 'Studio was not found'; end if;
  select * into current_policy from private.vacation_policy_at(p_studio_id, clock_timestamp());
  if current_policy.annual_days = p_annual_days and current_policy.carry_rule = p_carry_rule
    and current_policy.carry_cap_days is not distinct from p_carry_cap_days then return; end if;
  insert into private.studio_vacation_policies (studio_id, annual_days, carry_rule, carry_cap_days)
  values (p_studio_id, p_annual_days, p_carry_rule, p_carry_cap_days);
end;
$$;

notify pgrst,'reload schema';
