-- A missing employment start and opening date is an unknown balance, not zero.
create or replace function private.vacation_available(p_studio_id uuid, p_user_id uuid, p_as_of date)
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
  from months
  where accrual_from is not null;
$$;
