-- Older clients may still call the dated endpoint. New studios use the same safe boundary.
alter function public.activate_finance_recognition(uuid,uuid,date) rename to activate_finance_recognition_before_enablement;
alter function public.activate_finance_recognition_before_enablement(uuid,uuid,date) set schema private;
revoke all on function private.activate_finance_recognition_before_enablement(uuid,uuid,date) from public,anon,authenticated,service_role;
create function public.activate_finance_recognition(p_studio_id uuid,p_request_id uuid,p_month date) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  if (select recognition_start_month from public.finance_settings where studio_id=p_studio_id) is null
    or exists(select 1 from public.finance_planning_requests where studio_id=p_studio_id and request_id=p_request_id and payload->>'operation'='enable_recognition') then
    return public.enable_finance_recognition(p_studio_id,p_request_id);
  end if;
  return private.activate_finance_recognition_before_enablement(p_studio_id,p_request_id,p_month);
end $$;
revoke all on function public.activate_finance_recognition(uuid,uuid,date) from public,anon,authenticated,service_role;
grant execute on function public.activate_finance_recognition(uuid,uuid,date) to authenticated;

create or replace function public.save_finance_report_coverage(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','recognition_coverage','input',p_input); result uuid;
  project uuid:=nullif(p_input->>'projectId','')::uuid; month date:=(p_input->>'month')::date;
  through_date date:=(p_input->>'through')::date; prior integer;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if month is null or month<>date_trunc('month',month)::date or through_date is null or through_date<month
    or through_date>least((month+interval '1 month - 1 day')::date,(now() at time zone 'Europe/Kyiv')::date) then raise exception 'finance_input_invalid';end if;
  select revision into prior from public.finance_current_report_coverage where studio_id=p_studio_id and project_id is not distinct from project and finance_current_report_coverage.month=month;
  if coalesce(prior,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  insert into public.finance_report_coverage(studio_id,project_id,month,reviewed_through,revenue_reviewed,direct_costs_reviewed,labor_reviewed,overhead_reviewed,revision,reason,created_by)
  values(p_studio_id,project,month,through_date,(p_input->>'revenue')::boolean,(p_input->>'direct_costs')::boolean,
    (p_input->>'labor')::boolean,(p_input->>'overhead')::boolean,coalesce(prior,0)+1,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now()); return result;
end $$;

create or replace function public.save_finance_project_cost_estimate(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;payload jsonb:=jsonb_build_object('operation','project_cost_estimate','project',p_project_id,'input',p_input);
  setup public.finance_settings; previous integer;currency_code text:=p_input->>'currency';day date:=(p_input->>'date')::date;digits integer;
  direct numeric:=(p_input->>'directBudget')::numeric;labor numeric:=(p_input->>'laborBudget')::numeric;remaining_direct numeric:=(p_input->>'remainingDirect')::numeric;
  remaining_labor numeric:=(p_input->>'remainingLabor')::numeric;valuation record;rate numeric;source text;effective date;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id;
  select minor_units into digits from public.finance_currencies c where c.code=currency_code;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id) or day is null or day>(now() at time zone 'Europe/Kyiv')::date
    or digits is null
    or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000
    or exists(select 1 from unnest(array[direct,labor,remaining_direct,remaining_labor]) value where value<0 or value>9999999999.9999 or value<>round(value,digits)) then raise exception 'finance_input_invalid';end if;
  select coalesce(max(revision),0) into previous from public.finance_project_cost_estimates where studio_id=p_studio_id and project_id=p_project_id;
  if previous is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict';end if;
  if currency_code=setup.base_currency or p_input->'fx' is not null and p_input->'fx'<>'null'::jsonb then
    select * into valuation from private.finance_valuation(currency_code,setup.base_currency,day,1,p_input->'fx');rate:=valuation.rate;source:=valuation.source;effective:=valuation.effective_date;
  end if;
  insert into public.finance_project_cost_estimates(studio_id,project_id,revision,currency,as_of,direct_budget,labor_budget,remaining_direct,remaining_labor,
    reporting_currency,fx_rate,fx_source,fx_effective_date,reason,created_by,source_digest)
    values(p_studio_id,p_project_id,previous+1,currency_code,day,direct,labor,remaining_direct,remaining_labor,setup.base_currency,rate,source,effective,btrim(p_input->>'reason'),auth.uid(),private.finance_project_cost_state(p_studio_id,p_project_id)->>'digest') returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;

create or replace function private.finance_calculated_labor_candidates(p_studio uuid,p_open boolean) returns setof jsonb
language sql stable security definer set search_path='' as $$
  with terms as (
    select s.employee_id,s.id as schedule_id,t.id as terms_id,d::date as period_start,
      least((d+make_interval(months=>t.interval_months)-interval '1 day')::date,t.valid_through) as period_end
    from public.finance_schedules s join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
    cross join lateral generate_series(t.effective_from::timestamp,
      least(t.valid_through,case when p_open then (now() at time zone 'Europe/Kyiv')::date else date_trunc('month',now() at time zone 'Europe/Kyiv')::date-1 end)::timestamp,
      make_interval(months=>t.interval_months)) d
    where s.studio_id=p_studio and s.kind='payroll'
  ), synthetic as (
    select employee_id,period_start,max(period_end) as period_end,count(*) as candidates,
      case when count(*)=1 then (array_agg(schedule_id))[1] end as schedule_id,
      case when count(*)=1 then (array_agg(terms_id))[1] end as terms_id
    from terms t where (p_open and period_start<=(now() at time zone 'Europe/Kyiv')::date or not p_open and period_end<(now() at time zone 'Europe/Kyiv')::date) and not exists(
      select 1 from public.finance_obligations o where o.studio_id=p_studio and o.employee_id=t.employee_id and o.kind='payroll'
        and o.period_start<=t.period_end and o.period_end>=t.period_start)
    group by employee_id,period_start
  ), work as (
    select user_id,work_date from public.work_log_entries where studio_id=p_studio
    union select user_id,work_date from public.work_log_days where studio_id=p_studio
  ), missing as (
    select distinct w.user_id as employee_id,date_trunc('month',w.work_date)::date as period_start,
      (date_trunc('month',w.work_date)+interval '1 month - 1 day')::date as period_end
    from work w where w.work_date<date_trunc('month',now() at time zone 'Europe/Kyiv')::date
      and not exists(select 1 from public.finance_obligations o where o.studio_id=p_studio and o.employee_id=w.user_id
        and o.kind='payroll' and w.work_date between o.period_start and o.period_end)
      and not exists(select 1 from synthetic t where t.employee_id=w.user_id and w.work_date between t.period_start and t.period_end)
  ), candidates as (
    select o.employee_id,o.period_start,o.period_end,o.schedule_id,o.terms_id,o.id as obligation_id,o.kind,1::bigint as candidates
      from public.finance_obligations o where o.studio_id=p_studio and o.kind in ('payroll','bonus') and (p_open and o.period_start<=(now() at time zone 'Europe/Kyiv')::date or not p_open and o.period_end<(now() at time zone 'Europe/Kyiv')::date)
    union all select employee_id,period_start,period_end,schedule_id,terms_id,null,'payroll',candidates from synthetic
    union all select employee_id,period_start,period_end,null,null,null,'missing',0 from missing
  ) select to_jsonb(c)||jsonb_build_object('sourceKey',case when c.kind='bonus' then 'bonus:'||c.obligation_id::text
    else c.kind||':'||c.employee_id::text||':'||c.period_start::text end) from candidates c order by period_start,employee_id,kind
$$;

create or replace function private.finance_month_evidence(p_studio uuid,p_month date,p_report jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare state jsonb; facts jsonb; calculations jsonb; labor jsonb; issues jsonb; categories jsonb;
begin
  state:=private.finance_month_evidence_before_calculations(p_studio,p_month,p_report);
  select coalesce(jsonb_agg(c order by c->>'id'),'[]') into calculations from jsonb_array_elements(coalesce(p_report->'calculations','[]')) c
    where (c->>'date')::date between p_month and (state->>'through')::date;
  select coalesce(jsonb_agg(c order by c->>'sourceKey'),'[]') into labor from jsonb_array_elements(coalesce(p_report->'historicalLabor'->'periods','[]')) c
    where (c->>'periodEnd')::date between p_month and (state->>'through')::date;
  facts:=(state->'facts')||jsonb_build_object('sourceCalculations',calculations,'calculatedLabor',labor);
  -- Posting status alone is not a missing business fact. Only exact, conflict-free evidence can satisfy it.
  select coalesce(jsonb_agg(issue),'[]') into issues from jsonb_array_elements(state->'exceptions') issue
    where not ((issue->>'reason' in ('earning_unprocessed','finance_recognition_inactive','finance_input_invalid','expense_pending','receipt_unprocessed','trip_pending','missing_expense_period')
      and exists(select 1 from jsonb_array_elements(calculations) c where c->>'ownerId'=issue->>'sourceId' and c->>'amount' is not null and c->>'issue' is null
        and (c->>'currency'=c->>'reportingCurrency' or c->>'reportingAmount' is not null)))
      or (issue->>'reason' in ('labor_source','labor_pending','labor_exception','labor_pending_review') and exists(select 1 from jsonb_array_elements(labor) c
        where c->>'obligationId'=issue->>'sourceId' and c->>'calculatedCost' is not null and jsonb_array_length(c->'issues')=0)));
  issues:=issues||coalesce((select jsonb_agg(jsonb_build_object('category',c->>'classification','sourceId',c->>'sourceId','label',c->>'label',
    'reason',coalesce(c->>'issue',case when c->>'amount' is null then 'source_unavailable' else 'missing_fx' end),'href',c->>'href'))
    from jsonb_array_elements(calculations) c where c->>'issue' is not null or c->>'amount' is null
      or c->>'currency'<>c->>'reportingCurrency' and c->>'reportingAmount' is null),'[]');
  issues:=issues||coalesce((select jsonb_agg(jsonb_build_object('category','labor','sourceId',c->>'sourceKey','label',c->>'label',
    'reason',reason,'href','/finance/reports#labor')) from jsonb_array_elements(labor) c cross join lateral jsonb_array_elements_text(c->'issues') reason),'[]');
  select jsonb_object_agg(category,case when exists(select 1 from jsonb_array_elements(issues) i where i->>'category'=category) then 'incomplete'
    when state->'categories'->>category='incomplete' then 'manual' else state->'categories'->>category end) into categories from unnest(array['revenue','direct_cost','labor','overhead']) category;
  return state||jsonb_build_object('facts',facts,'digest',md5(facts::text),'exceptions',issues,'categories',categories);
end $$;
notify pgrst,'reload schema';
