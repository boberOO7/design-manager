-- A new request must leave previously reserved future work years fundable as well.
create or replace function private.vacation_request_exceeds(
  p_studio_id uuid, p_user_id uuid, p_start date, p_end date
) returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  anchor date;
  checkpoint date := greatest((now() at time zone 'Europe/Kyiv')::date, p_start);
  anniversary date;
  horizon date;
  year_index integer := 1;
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

  anniversary := (anchor + make_interval(years => year_index))::date;
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
    year_index := year_index + 1;
    anniversary := (anchor + make_interval(years => year_index))::date;
  end loop;
  return false;
end;
$$;
