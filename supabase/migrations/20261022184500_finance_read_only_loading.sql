-- Finance reads never start maintenance or recognition. Keep the public read
-- signatures for existing callers, but remove their implicit write behavior.
create or replace function public.prepare_finance_overview_fx_context(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_period text default '3') returns jsonb
language sql stable security invoker set search_path='' as $$
  select public.get_finance_overview_fx_context(p_studio_id,p_horizon,p_scenario,p_period)
$$;

create or replace function public.calculate_finance_forecast(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_fx jsonb default '[]') returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  return private.calculate_finance_forecast_report(p_studio_id,p_horizon,p_scenario,p_fx);
end $$;
alter function public.get_finance_overview(uuid,text,text,jsonb,text) stable;

create or replace function public.prepare_finance_automatic_expenses(p_studio_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare studio uuid; source record; schedule record; defaults public.finance_expense_service_policies;
  first_day date:=date_trunc('month',now() at time zone 'Europe/Kyiv')::date;
begin
  if auth.role() is distinct from 'service_role' and (p_studio_id is null or not private.is_finance_admin(p_studio_id)) then raise exception 'finance_admin_required';end if;
  -- Preserve the existing rolling window for every finalized studio, including
  -- studios that have not enabled economic recognition. Reads no longer extend it.
  for studio in select studio_id from public.finance_settings where finalized_at is not null
    and (p_studio_id is null or studio_id=p_studio_id) order by studio_id loop
    perform 1 from public.studio_members where studio_id=studio order by user_id for share;
    perform 1 from public.finance_settings where studio_id=studio for update;
    for schedule in select id,created_by from public.finance_schedules
      where studio_id=studio and (stopped_from is null or stopped_from>first_day-interval '1 month') order by id loop
      perform private.reconcile_finance_schedule_occurrences(studio,schedule.id,
        (first_day-interval '1 month')::date,(first_day+interval '11 months')::date,schedule.created_by);
    end loop;
  end loop;
  for studio in select studio_id from public.finance_settings where finalized_at is not null and recognition_start_month is not null
    and (p_studio_id is null or studio_id=p_studio_id) order by studio_id for update loop
    for source in select s.id from public.finance_schedules s where s.studio_id=studio and s.kind='recurring'
      and not exists(select 1 from public.finance_recognition_entries r
        join public.finance_obligation_items i on i.studio_id=r.studio_id and i.expected_item_id=private.finance_recognition_expected_root(r.studio_id,r.expected_item_id)
        join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
        where r.studio_id=studio and o.schedule_id=s.id) loop
      defaults:=private.finance_default_monthly_service(studio,source.id);
      if defaults.id is null then continue;end if;
      insert into public.finance_expense_service_policies(studio_id,schedule_id,revision,first_period,service_start,service_months,effective_from,policy,project_id,created_by,coverage_from,source_default)
        values(studio,source.id,1,defaults.first_period,defaults.service_start,defaults.service_months,defaults.effective_from,'service_days',null,defaults.created_by,defaults.coverage_from,true);
    end loop;
  end loop;
  return private.prepare_finance_expenses_before_monthly(p_studio_id);
end $$;
revoke all on function public.prepare_finance_automatic_expenses(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_finance_automatic_expenses(uuid) to authenticated,service_role;

notify pgrst,'reload schema';
