-- Reporting only: payroll cost accrues independently of Worklog submission.
-- Keep the established project-share calculation and all posting guards.
create or replace function private.finance_provisional_labor_values(p_basis jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; basis jsonb:=p_basis; budget numeric; digits integer; daily jsonb; allocated jsonb;
  closed boolean:=(p_basis->>'periodEnd')::date<(now() at time zone 'Europe/Kyiv')::date;
  remaining numeric; rate numeric; fx jsonb:=p_basis->'proposalFx';
begin
  select minor_units into digits from public.finance_currencies where code=p_basis->>'reportingCurrency';
  if closed then
    -- Recognition already owns its cost/FX. Preview only the outstanding native delta.
    remaining:=(p_basis->'source'->>'remainingCost')::numeric;
    if p_basis->'source'->>'currency'=p_basis->>'reportingCurrency' then rate:=1;
    elsif fx is not null and fx<>'null'::jsonb then rate:=(fx->>'rate')::numeric;
    elsif (select count(distinct p->'fx'->>'rate') from jsonb_array_elements(p_basis->'pools') p where p->'fx'<>'null'::jsonb)=1 then
      select p->'fx' into fx from jsonb_array_elements(p_basis->'pools') p where p->'fx'<>'null'::jsonb limit 1;
      rate:=(fx->>'rate')::numeric;
    end if;
    budget:=case when remaining=0 then round(0,digits) else round(remaining*rate,digits) end;
    basis:=basis||jsonb_build_object('pools','[]'::jsonb,'proposedAllocations','[]'::jsonb,
      'proposedRemainder',budget::text,'proposalFx',fx);
  end if;
  result:=private.finance_provisional_labor_values_before_months(basis);
  -- A closed salary amount remains known without capacity evidence for project attribution.
  if closed and result->>'provisionalRemainder' is null and budget is not null
    and coalesce((basis->'source'->>'sourceReady')::boolean,false) and not (basis->>'manual')::boolean
    and not (basis->'issues' ?| array['partial_employment','source_unavailable','payroll_source_review']) then
    result:=result||jsonb_build_object('provisionalRemainder',budget::text);
  end if;
  if result->>'provisionalRemainder' is null then
    if closed and remaining>0 and rate is null and not (basis->'issues' ? 'fx_required') then
      result:=result||jsonb_build_object('issues',(basis->'issues')||jsonb_build_array('fx_required'));
    end if;
    return result||jsonb_build_object('provisionalDailyRemainders','[]'::jsonb);
  end if;
  budget:=(basis->>'proposedRemainder')::numeric+coalesce((select sum((i->>'amount')::numeric)
    from jsonb_array_elements(basis->'proposedAllocations') i),0);
  if closed then
    -- Closed payroll is dated like its eventual recognition; allocations still use actual Worklog shares.
    select coalesce(jsonb_agg(jsonb_build_object('projectId',project,'amount',amount::text) order by project),'[]') into allocated
      from (select a->>'projectId' as project,sum((a->>'amount')::numeric) as amount
        from jsonb_array_elements(result->'provisionalDailyAllocations') a group by a->>'projectId') parts;
    select coalesce(jsonb_agg(a||jsonb_build_object('date',p_basis->>'asOf') order by a->>'projectId'),'[]') into daily
      from jsonb_array_elements(allocated) a;
    budget:=budget-coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(allocated) a),0);
    return result||jsonb_build_object('provisionalAllocations',allocated,'provisionalDailyAllocations',daily,
      'provisionalRemainder',budget::text,'provisionalDailyRemainders',jsonb_build_array(jsonb_build_object('date',p_basis->>'asOf','amount',budget::text)));
  end if;
  with days as (
    select (d->>'date')::date as day,
      case when (d->>'submitted')::boolean or (d->>'date')::date<(now() at time zone 'Europe/Kyiv')::date
        then (d->>'scheduled')::numeric else (d->>'absence')::numeric end as capacity
    from jsonb_array_elements(basis->'days') d where (d->>'employed')::boolean
      and (d->>'date')::date between (basis->>'accruedFrom')::date and (basis->>'asOf')::date
  ), cumulative as (
    select day,coalesce(trunc(budget*sum(capacity) over(order by day)/nullif((basis->>'expectedMinutes')::numeric,0),digits),0) as amount from days
  ), increments as (
    select day,amount-coalesce(lag(amount) over(order by day),0) as amount from cumulative
  ) select coalesce(jsonb_agg(jsonb_build_object('date',day,'amount',(amount-coalesce((select sum((a->>'amount')::numeric)
    from jsonb_array_elements(result->'provisionalDailyAllocations') a where (a->>'date')::date=day),0))::text) order by day),'[]') into daily from increments;
  return result||jsonb_build_object('provisionalRemainder',round(coalesce((select sum((d->>'amount')::numeric) from jsonb_array_elements(daily) d),0),digits)::text,
    'provisionalDailyRemainders',daily);
end $$;
revoke all on function private.finance_provisional_labor_values(jsonb) from public,anon,authenticated,service_role;

-- Enrich the existing read without changing worker statuses, digests or financial history.
alter function public.get_finance_labor_reporting(uuid) rename to get_finance_labor_reporting_before_provisional_costs;
alter function public.get_finance_labor_reporting_before_provisional_costs(uuid) set schema private;
revoke all on function private.get_finance_labor_reporting_before_provisional_costs(uuid) from public,anon,authenticated,service_role;
create function public.get_finance_labor_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare report jsonb; periods jsonb; boundary date;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  report:=private.get_finance_labor_reporting_before_provisional_costs(p_studio_id);
  select recognition_start_month into boundary from public.finance_settings where studio_id=p_studio_id;
  select coalesce(jsonb_agg(case when (p->>'periodEnd')::date<(now() at time zone 'Europe/Kyiv')::date
    and (p->>'periodStart')::date>=boundary
    and p->>'status' in ('pending','pending_review','exception')
    and (not coalesce((p->'source'->>'sourceReady')::boolean,false) or (p->'source'->>'remainingCost')::numeric>0)
    then p||private.finance_provisional_labor_values(p) else p end order by position),'[]') into periods
    from jsonb_array_elements(report->'automaticPeriods') with ordinality item(p,position);
  return report||jsonb_build_object('automaticPeriods',periods);
end $$;
revoke all on function public.get_finance_labor_reporting(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_labor_reporting(uuid) to authenticated;
notify pgrst,'reload schema';
