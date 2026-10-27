-- Source review uses the existing immutable configuration-request audit.
-- Classifications belong to salary-payment terms, never to amounts inferred from time.
create index finance_labor_source_review_lookup on public.finance_planning_requests(studio_id,(payload->'input'->>'payrollSourceDigest'))
  where payload->>'operation'='labor_capacity';

create function private.finance_labor_source_review(p_studio uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare recurring jsonb; digest text; review jsonb; cash_ids jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('termId',t.id,'scheduleId',t.schedule_id,'name',t.name,
    'category',c.name,'amount',t.amount::text,'currency',t.currency,'effectiveFrom',t.effective_from,
    'effectiveThrough',t.valid_through,'stoppedFrom',s.stopped_from) order by t.id),'[]') into recurring
    from public.finance_schedule_history t join public.finance_schedules s on s.studio_id=t.studio_id and s.id=t.schedule_id
    join public.finance_categories c on c.studio_id=t.studio_id and c.id=t.category_id
    where t.studio_id=p_studio and s.kind='recurring' and c.nature='operating'
      and coalesce(least(t.valid_through,s.stopped_from-1),'infinity'::date)>=coalesce((select recognition_start_month from public.finance_settings where studio_id=p_studio),date_trunc('month',now() at time zone 'Europe/Kyiv')::date);
  digest:=md5(recurring::text);
  select r.payload->'input' into review from public.finance_planning_requests r
    where r.studio_id=p_studio and r.payload->>'operation'='labor_capacity'
      and r.payload->'input'->>'payrollSourceDigest'=digest
      and r.payload->'input'->>'payrollSourcesConfirmed'='true'
    order by r.created_at desc,r.request_id desc limit 1;
  select coalesce(jsonb_agg(distinct term order by term),'[]') into cash_ids from public.finance_planning_requests r
    cross join lateral jsonb_array_elements(coalesce(r.payload->'input'->'payrollCashTermIds','[]')) term
    where r.studio_id=p_studio and r.payload->>'operation'='labor_capacity'
      and r.payload->'input'->>'payrollSourcesConfirmed'='true';
  return jsonb_build_object('digest',digest,'reviewed',jsonb_array_length(recurring)=0 or review is not null,
    'recurring',recurring,'cashTermIds',cash_ids);
end $$;
revoke all on function private.finance_labor_source_review(uuid) from public,anon,authenticated,service_role;

create function private.finance_labor_cash_expected(p_studio uuid,p_item uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.finance_obligation_items i
    join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
    where i.studio_id=p_studio and i.expected_item_id=private.finance_recognition_expected_root(p_studio,p_item)
      and exists(select 1 from public.finance_planning_requests r where r.studio_id=p_studio
        and r.payload->>'operation'='labor_capacity' and r.payload->'input'->>'payrollSourcesConfirmed'='true'
        and r.payload->'input'->'payrollCashTermIds' ? o.terms_id::text))
$$;
revoke all on function private.finance_labor_cash_expected(uuid,uuid) from public,anon,authenticated,service_role;

-- Keep the existing activation/preview/idempotency/history protections intact.
alter function public.configure_finance_labor_automation(uuid,uuid,jsonb) rename to configure_finance_labor_automation_before_source_review;
alter function public.configure_finance_labor_automation_before_source_review(uuid,uuid,jsonb) set schema private;
revoke all on function private.configure_finance_labor_automation_before_source_review(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.configure_finance_labor_automation(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare review jsonb; term uuid; existing public.finance_planning_requests;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  perform 1 from public.studio_members where studio_id=p_studio_id order by user_id for share;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  select * into existing from public.finance_planning_requests where studio_id=p_studio_id and request_id=p_request_id;
  if existing.request_id is not null then
    return private.configure_finance_labor_automation_before_source_review(p_studio_id,p_request_id,p_input);
  end if;
  review:=private.finance_labor_source_review(p_studio_id);
  if not (review->>'reviewed')::boolean or p_input ?| array['payrollSourceDigest','payrollSourcesConfirmed','payrollCashTermIds'] then
    if p_input->>'payrollSourceDigest' is distinct from review->>'digest'
      or coalesce((p_input->>'payrollSourcesConfirmed')::boolean,false) is not true
      or jsonb_typeof(p_input->'payrollCashTermIds') is distinct from 'array' then
      raise exception 'finance_payroll_source_review_required';end if;
    for term in select value::uuid from jsonb_array_elements_text(p_input->'payrollCashTermIds') loop
      if not exists(select 1 from jsonb_array_elements(review->'recurring') r where r->>'termId'=term::text) then
        raise exception 'finance_input_invalid';end if;
      if exists(select 1 from public.finance_recognized_actuals e
        join public.finance_obligation_items i on i.studio_id=e.studio_id
          and i.expected_item_id=private.finance_recognition_expected_root(e.studio_id,e.expected_item_id)
        join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
        where e.studio_id=p_studio_id and o.terms_id=term group by o.terms_id having sum(e.amount)>0) then
        raise exception 'finance_payroll_source_history_conflict';end if;
    end loop;
  end if;
  return private.configure_finance_labor_automation_before_source_review(p_studio_id,p_request_id,p_input);
end $$;
revoke all on function public.configure_finance_labor_automation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.configure_finance_labor_automation(uuid,uuid,jsonb) to authenticated;

-- These guards affect expense sources only; earned-revenue recognition is unchanged.
create function private.guard_finance_labor_payroll_sources() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.kind='recognition' then
    if new.source_kind='labor' and exists(select 1 from public.finance_labor_automation where studio_id=new.studio_id)
      and not (private.finance_labor_source_review(new.studio_id)->>'reviewed')::boolean then
      raise exception 'finance_payroll_source_review_required';end if;
    if new.source_kind='expected' and exists(select 1 from public.finance_labor_automation where studio_id=new.studio_id)
      and not (private.finance_labor_source_review(new.studio_id)->>'reviewed')::boolean
      and exists(select 1 from public.finance_obligation_items i join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
        where i.studio_id=new.studio_id and i.expected_item_id=private.finance_recognition_expected_root(new.studio_id,new.expected_item_id) and o.kind='recurring') then
      raise exception 'finance_payroll_source_review_required';end if;
    if new.source_kind='expected' and private.finance_labor_cash_expected(new.studio_id,new.expected_item_id) then
      raise exception 'finance_payroll_cash_source';end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_finance_labor_payroll_sources() from public,anon,authenticated,service_role;
create trigger finance_labor_payroll_source_guard before insert on public.finance_recognition_entries
  for each row execute function private.guard_finance_labor_payroll_sources();

alter function public.get_finance_recognition_sources(uuid) rename to get_finance_recognition_sources_before_labor_review;
alter function public.get_finance_recognition_sources_before_labor_review(uuid) set schema private;
revoke all on function private.get_finance_recognition_sources_before_labor_review(uuid) from public,anon,authenticated,service_role;
create function public.get_finance_recognition_sources(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sources jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  sources:=private.get_finance_recognition_sources_before_labor_review(p_studio_id);
  return coalesce((select jsonb_agg(s) from jsonb_array_elements(sources) s
    where s->>'kind'<>'expected' or (not private.finance_labor_cash_expected(p_studio_id,(s->>'sourceId')::uuid)
      and not (exists(select 1 from public.finance_labor_automation where studio_id=p_studio_id)
        and not (private.finance_labor_source_review(p_studio_id)->>'reviewed')::boolean
        and exists(select 1 from public.finance_obligation_items i join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
          where i.studio_id=p_studio_id and i.expected_item_id=private.finance_recognition_expected_root(p_studio_id,(s->>'sourceId')::uuid) and o.kind='recurring')))),'[]');
end $$;
revoke all on function public.get_finance_recognition_sources(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_recognition_sources(uuid) to authenticated;

alter function private.finance_automatic_labor_basis_at_fx(uuid,uuid,jsonb) rename to finance_automatic_labor_basis_before_source_review;
create function private.finance_automatic_labor_basis_at_fx(p_studio uuid,p_obligation uuid,p_preview_fx jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare basis jsonb;
begin
  basis:=private.finance_automatic_labor_basis_before_source_review(p_studio,p_obligation,p_preview_fx);
  if basis is not null and (basis->'source'->>'sourceReady')::boolean and (basis->'source'->>'knownCost')::numeric>0
    and basis->>'proposedRemainder' is null and not (basis->'issues' ? 'fx_required') then
    basis:=basis||jsonb_build_object('issues',(basis->'issues')||jsonb_build_array('fx_required'));
    basis:=basis||jsonb_build_object('digest',md5((basis-'digest')::text));
  end if;
  if basis is not null and not (private.finance_labor_source_review(p_studio)->>'reviewed')::boolean then
    basis:=basis||jsonb_build_object('issues',(basis->'issues')||jsonb_build_array('payroll_source_review'));
    basis:=basis||jsonb_build_object('digest',md5((basis-'digest')::text));
  end if;
  return basis;
end $$;
revoke all on function private.finance_automatic_labor_basis_at_fx(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function private.finance_provisional_labor_values(p_basis jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare budget numeric; digits integer; daily jsonb; valid boolean; accrued numeric;
begin
  select minor_units into digits from public.finance_currencies where code=p_basis->>'reportingCurrency';
  valid:=not (p_basis->>'manual')::boolean and jsonb_array_length(p_basis->'pools')=0
    and coalesce((p_basis->'source'->>'sourceReady')::boolean,false)
    and not (p_basis->'issues' ?| array['missing_capacity','partial_employment','source_unavailable']);
  valid:=(valid or private.finance_labor_known_zero(p_basis)) and not (p_basis->'issues' ? 'payroll_source_review');
  if not valid or p_basis->>'proposedRemainder' is null then
    return jsonb_build_object('provisionalAllocations','[]'::jsonb,'provisionalDailyAllocations','[]'::jsonb,'provisionalRemainder',null,'provisionalFx',p_basis->'proposalFx');end if;
  budget:=(p_basis->>'proposedRemainder')::numeric+coalesce((select sum((i->>'amount')::numeric) from jsonb_array_elements(p_basis->'proposedAllocations') i),0);
  with shares as (
    select (d->>'date')::date as day,e->>'projectId' as project,
      (d->>'scheduled')::numeric*sum((e->>'minutes')::numeric)/greatest((d->>'scheduled')::numeric,
        coalesce((d->>'loggedMinutes')::numeric,(select sum((x->>'minutes')::numeric) from jsonb_array_elements(d->'entries') x))+(d->>'absence')::numeric) as share
    from jsonb_array_elements(p_basis->'days') d cross join lateral jsonb_array_elements(d->'entries') e
    where (d->>'date')::date between (p_basis->>'accruedFrom')::date and (p_basis->>'asOf')::date
      and (d->>'submitted')::boolean and (d->>'employed')::boolean and (d->>'scheduled')::integer>(d->>'absence')::integer
      and p_basis->'shares' ? (e->>'projectId') group by d,e->>'projectId'
  ), cumulative as (
    select day,project,trunc(budget*sum(share) over(partition by project order by day)/nullif((p_basis->>'expectedMinutes')::numeric,0),digits) as amount from shares
  ), increments as (
    select day,project,amount-coalesce(lag(amount) over(partition by project order by day),0) as amount from cumulative
  ) select coalesce(jsonb_agg(jsonb_build_object('date',day,'projectId',project,'amount',amount::text) order by day,project),'[]') into daily from increments;
  -- Only completed workdays and approved absence have incurred capacity so far.
  select coalesce(sum(case when (d->>'submitted')::boolean then (d->>'scheduled')::numeric else (d->>'absence')::numeric end),0) into accrued
    from jsonb_array_elements(p_basis->'days') d where (d->>'employed')::boolean
      and (d->>'date')::date between (p_basis->>'accruedFrom')::date and (p_basis->>'asOf')::date;
  return jsonb_build_object('provisionalAllocations',p_basis->'proposedAllocations','provisionalDailyAllocations',daily,
    'provisionalRemainder',(coalesce(trunc(budget*accrued/nullif((p_basis->>'expectedMinutes')::numeric,0),digits),round(0,digits))
      -coalesce((select sum((i->>'amount')::numeric) from jsonb_array_elements(daily) i),0))::text,'provisionalFx',p_basis->'proposalFx');
end $$;
revoke all on function private.finance_provisional_labor_values(jsonb) from public,anon,authenticated,service_role;



alter function public.get_finance_labor_reporting(uuid) rename to get_finance_labor_reporting_before_setup;
alter function public.get_finance_labor_reporting_before_setup(uuid) set schema private;
revoke all on function private.get_finance_labor_reporting_before_setup(uuid) from public,anon,authenticated,service_role;
create function public.get_finance_labor_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; conditions jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  result:=private.get_finance_labor_reporting_before_setup(p_studio_id);
  select coalesce(jsonb_agg(jsonb_build_object('employeeId',s.employee_id,'name',p.full_name,'termId',t.id,
    'effectiveFrom',t.effective_from,'effectiveThrough',t.valid_through,'currency',t.currency,
    'amount',t.amount::text,'basis',t.basis,'payout',t.employee_payout::text,'deductions',t.employee_deductions::text,
    'employerCost',t.employer_cost::text,'employerStatus',t.employer_cost_status) order by p.full_name,t.effective_from),'[]') into conditions
    from public.finance_schedules s join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
    join public.profiles p on p.id=s.employee_id where s.studio_id=p_studio_id and s.kind='payroll'
      and coalesce(least(t.valid_through,s.stopped_from-1),'infinity'::date)>=(now() at time zone 'Europe/Kyiv')::date;
  return result||jsonb_build_object('sourceReview',private.finance_labor_source_review(p_studio_id),'salaryConditions',conditions);
end $$;
revoke all on function public.get_finance_labor_reporting(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_labor_reporting(uuid) to authenticated;

notify pgrst,'reload schema';
