-- Skip superseded historical-labor and month passes; their values were immediately overwritten.
-- Keep the same guarded snapshot, canonical calculations and final month evidence.
create or replace function public.get_finance_management_reporting(p_studio_id uuid,p_historical_fx jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare report jsonb; months jsonb; first_day date;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  report:=private.get_finance_management_reporting_before_months(p_studio_id)
    ||jsonb_build_object('historicalLabor',public.get_finance_calculated_labor_reporting(p_studio_id,p_historical_fx),
      'calculations',public.get_finance_source_calculations(p_studio_id));
  -- Completeness is inspected even without posting. Existing exception/approval rules remain in force.
  select min(day) into first_day from (
    select date_trunc('month',(c->>'date')::date)::date as day from jsonb_array_elements(report->'calculations') c
    union all select date_trunc('month',(c->>'periodStart')::date)::date from jsonb_array_elements(report->'historicalLabor'->'periods') c
    union all select min(month) from public.finance_report_coverage where studio_id=p_studio_id
    union all select (report->>'recognitionStart')::date
    union all select date_trunc('month',now() at time zone 'Europe/Kyiv')::date
  ) boundaries;
  select coalesce(jsonb_agg((e.state-'facts')||jsonb_build_object('revision',coalesce(c.revision,0),'confirmationId',c.id,
    'changed',c.id is not null and c.source_digest<>e.state->>'digest',
    'status',case when c.source_digest=e.state->>'digest' and jsonb_array_length(e.state->'exceptions')=0 then 'confirmed'
      when jsonb_array_length(e.state->'exceptions')>0 or c.id is not null then 'needs_review' else 'provisional' end) order by periods.day),'[]') into months
    from generate_series(first_day::timestamp,(now() at time zone 'Europe/Kyiv')::date::timestamp,interval '1 month') periods(day)
    cross join lateral(select private.finance_month_evidence(p_studio_id,periods.day::date,report) as state) e
    left join lateral(select c.* from public.finance_month_confirmations c where c.studio_id=p_studio_id and c.month=periods.day::date order by c.revision desc limit 1) c on true;
  return report||jsonb_build_object('months',months);
end $$;
revoke all on function public.get_finance_management_reporting(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_management_reporting(uuid,jsonb) to authenticated;
