-- Extend the existing salary/Worklog engine with an in-memory capacity proposal.
-- No settings, policies, recognition, allocations or historical records are written.
create function private.finance_labor_period_basis(p_studio uuid,o public.finance_obligations,cfg public.finance_labor_automation,source jsonb,p_preview_fx jsonb,p_reporting_currency text,p_capacity jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare member public.studio_members;
  capacity public.finance_labor_capacity_revisions; day date; scheduled integer; absence integer;
  logged bigint; submitted boolean; employed boolean; projects jsonb; scope uuid[]:='{}'; missing_scope uuid[]:='{}'; shares jsonb:='{}';
  missing jsonb:='[]'; outside jsonb:='[]'; days jsonb:='[]'; expected bigint:=0; complete integer:=0; required integer:=0;
  result jsonb; pool_state jsonb; manual boolean; proposal numeric; proposal_items jsonb; proposal_pools numeric[]; rate numeric; digits integer; part record; share numeric; issues text[]:='{}';
begin
  select * into member from public.studio_members where studio_id=p_studio and user_id=o.employee_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'available',p.available_reporting_amount::text,'native',p.available_native_amount::text,
    'revision',p.allocation_revision,'fx',case when p.fx_rate is null then null else jsonb_build_object('rate',p.fx_rate::text,'source',p.fx_source,'effectiveDate',p.fx_effective_date) end) order by p.id),'[]') into pool_state
    from public.finance_labor_cost_pools p where p.studio_id=p_studio and p.obligation_id=o.id;
  select exists(select 1 from public.finance_labor_allocation_revisions r join public.finance_recognition_entries e on e.studio_id=r.studio_id and e.id=r.entry_id
    where r.studio_id=p_studio and e.obligation_id=o.id and r.method='manual_management') into manual;
  if exists(select 1 from jsonb_array_elements(pool_state) p where p->'available'='null'::jsonb) then issues:=array_append(issues,'fx_required');end if;
  if source->>'basis'='net' and source->>'deductionsStatus'<>'fixed' then issues:=array_append(issues,'unknown_deductions');end if;
  if source->>'employerStatus'<>'fixed' then issues:=array_append(issues,'unknown_employer_cost');end if;
  if source is null or not coalesce((source->>'sourceReady')::boolean,false) then issues:=array_append(issues,'source_unavailable');end if;
  if member.joined_at is null or (member.joined_at at time zone 'Europe/Kyiv')::date>o.period_start or member.removed_at is not null and (member.removed_at at time zone 'Europe/Kyiv')::date<=o.period_end then
    issues:=array_append(issues,'partial_employment');end if;
  if (source->>'remainingCost')::numeric<0 then issues:=array_append(issues,'payroll_correction');end if;
  for day in select generate_series(o.period_start::timestamp,o.period_end::timestamp,interval '1 day')::date loop
    select * into capacity from public.finance_labor_capacity_revisions c where c.studio_id=p_studio
      and (c.employee_id=o.employee_id or c.employee_id is null) and c.effective_from<=day
      order by (c.employee_id is not null) desc,c.effective_from desc,c.created_at desc,c.id desc limit 1;
    -- A proposed revision is an in-memory preview; employee overrides still win.
    if p_capacity is not null and (p_capacity->>'effectiveFrom')::date<=day
      and ((p_capacity->>'employeeId')::uuid=o.employee_id or p_capacity->>'employeeId' is null)
      and (capacity.id is null or
        (capacity.employee_id is null and p_capacity->>'employeeId' is not null) or
        (capacity.employee_id is not distinct from (p_capacity->>'employeeId')::uuid
          and capacity.effective_from<=(p_capacity->>'effectiveFrom')::date)) then
      capacity.id:=md5(p_capacity::text)::uuid;
      capacity.employee_id:=(p_capacity->>'employeeId')::uuid;
      capacity.effective_from:=(p_capacity->>'effectiveFrom')::date;
      capacity.daily_minutes:=(p_capacity->>'dailyMinutes')::integer;
      select array_agg(value::integer) into capacity.weekdays from jsonb_array_elements_text(p_capacity->'weekdays');
    end if;
    if capacity.id is null then issues:=array_append(issues,'missing_capacity');end if;
    scheduled:=case when extract(isodow from day)::integer=any(capacity.weekdays)
      and not exists(select 1 from public.studio_days_off where studio_id=p_studio and date=day) then capacity.daily_minutes else 0 end;
    expected:=expected+scheduled;
    employed:=private.finance_labor_employed_on_day(p_studio,o.employee_id,day);
    if scheduled>0 and not employed then issues:=array_append(issues,'partial_employment');end if;
    -- Union of absence minutes avoids counting overlapping timed requests twice.
    select case when bool_or(r.all_day) then scheduled else least(scheduled,coalesce((select count(distinct minute)::integer
      from public.time_off_requests a cross join lateral generate_series(extract(epoch from a.start_time)::integer/60,
        extract(epoch from a.end_time)::integer/60-1) minute where a.studio_id=p_studio and a.user_id=o.employee_id
        and a.status='approved' and a.cancelled_at is null and not a.all_day and a.start_date<=day and a.end_date>=day),0)) end into absence
      from public.time_off_requests r where r.studio_id=p_studio and r.user_id=o.employee_id and r.status='approved'
        and r.cancelled_at is null and r.start_date<=day and r.end_date>=day;
    absence:=coalesce(absence,0);
    select exists(select 1 from public.work_log_days where studio_id=p_studio and user_id=o.employee_id and work_date=day) into submitted;
    -- All logged work normalizes capacity, including internal work without a
    -- task. Project shares and evidence below still contain only task/review time.
    select coalesce(sum(w.minutes),0) into logged from public.work_log_entries w
      where w.studio_id=p_studio and w.user_id=o.employee_id and w.work_date=day;
    select coalesce(jsonb_agg(jsonb_build_object('taskId',w.task_id,'projectId',t.project_id,'reviewRoundId',w.review_round_id,'minutes',w.minutes) order by w.id),'[]')
      into projects from public.work_log_entries w join public.tasks t on t.id=w.task_id
      where w.studio_id=p_studio and w.user_id=o.employee_id and w.work_date=day;
    if day>=cfg.starts_on and scheduled>absence and employed and day<(now() at time zone 'Europe/Kyiv')::date then
      required:=required+1;if submitted then complete:=complete+1;else
        missing:=missing||jsonb_build_array(day);
        missing_scope:=missing_scope||array(select private.finance_employee_projects_on_day(p_studio,o.employee_id,day));
      end if;
    end if;
    if day>=cfg.starts_on and day<=(now() at time zone 'Europe/Kyiv')::date then
    for part in select t.project_id,sum(w.minutes) as minutes from public.work_log_entries w join public.tasks t on t.id=w.task_id
      where w.studio_id=p_studio and w.user_id=o.employee_id and w.work_date=day and (cfg.internal_project_id is null or t.project_id<>cfg.internal_project_id) group by t.project_id loop
      scope:=array_append(scope,part.project_id);
      if submitted and employed and scheduled>0 and absence<scheduled then
        share:=scheduled::numeric*part.minutes/greatest(scheduled,logged+absence);
        shares:=jsonb_set(shares,array[part.project_id::text],to_jsonb(coalesce((shares->>part.project_id::text)::numeric,0)+share));
      else outside:=outside||jsonb_build_array(jsonb_build_object('date',day,'projectId',part.project_id));end if;
    end loop;
    end if;
    days:=days||jsonb_build_array(jsonb_build_object('date',day,'capacityId',capacity.id,'scheduled',scheduled,'absence',absence,
      'employed',employed,'submitted',submitted,'loggedMinutes',logged,'entries',projects));
  end loop;
  -- Actual logged work establishes employee/project scope even for an admin
  -- who can work without a project_members access grant.
  if jsonb_array_length(missing)>0 then missing_scope:=missing_scope||scope;end if;
  if jsonb_array_length(outside)>0 then issues:=array_append(issues,'outside_schedule');end if;
  result:=jsonb_build_object('obligationId',o.id,'employeeId',o.employee_id,'label',o.employee_name,'periodStart',o.period_start,'periodEnd',o.period_end,
    'accruedFrom',greatest(o.period_start,cfg.starts_on),'asOf',least(o.period_end,(now() at time zone 'Europe/Kyiv')::date),
    'reportingCurrency',p_reporting_currency,
    'source',source,'expectedMinutes',expected,'completedDays',complete,'requiredDays',required,'missingDates',missing,'outsideSchedule',outside,
    'projectIds',to_jsonb(array(select distinct id from unnest(scope||missing_scope) id where cfg.internal_project_id is null or id<>cfg.internal_project_id order by id)),
    'missingProjectIds',to_jsonb(array(select distinct id from unnest(missing_scope) id where cfg.internal_project_id is null or id<>cfg.internal_project_id order by id)),
    'shares',shares,'days',days,'pools',pool_state,'manual',manual,'issues',to_jsonb(array(select distinct v from unnest(issues) v order by v)));
  result:=result||jsonb_build_object('proposalFx',p_preview_fx);
  select minor_units into digits from public.finance_currencies where code=p_reporting_currency;
  if source->>'currency'=p_reporting_currency then rate:=1;
  elsif p_preview_fx is not null and p_preview_fx<>'null'::jsonb then rate:=(p_preview_fx->>'rate')::numeric;
  elsif (select count(distinct p->'fx'->>'rate') from jsonb_array_elements(pool_state) p where p->'fx'<>'null'::jsonb)=1 then
    select (p->'fx'->>'rate')::numeric into rate from jsonb_array_elements(pool_state) p where p->'fx'<>'null'::jsonb limit 1;
  end if;
  if rate is null and coalesce((source->>'sourceReady')::boolean,false) and (source->>'knownCost')::numeric>0 then
    result:=jsonb_set(result,'{issues}',(result->'issues')||jsonb_build_array('fx_required'));end if;
  -- Approval previews use exactly the same per-pool minor-unit truncation as writes.
  -- Pending new recognition is another pool, never a rounded aggregate salary.
  select array_agg(coalesce((p->>'available')::numeric,case when p_preview_fx is not null then private.finance_labor_pool_reporting_value((p->>'id')::uuid,rate) end)) into proposal_pools from jsonb_array_elements(pool_state) p;
  if (source->>'remainingCost')::numeric<0 then
    proposal_pools:=case when rate is not null then array[round((source->>'knownCost')::numeric*rate,digits)] end;
  elsif (source->>'remainingCost')::numeric>0 then
    proposal_pools:=array_append(coalesce(proposal_pools,'{}'),case when rate is not null then round((source->>'remainingCost')::numeric*rate,digits) end);
  end if;
  if exists(select 1 from unnest(proposal_pools) amount where amount is null) then
    proposal:=null;proposal_items:='[]';
  else
    select coalesce(sum(amount),0) into proposal from unnest(proposal_pools) amount;
    select coalesce(jsonb_agg(jsonb_build_object('projectId',key,'amount',amount::text) order by key),'[]') into proposal_items
      from (select key,(select coalesce(sum(trunc(pool*value::numeric/nullif(expected,0),digits)),0) from unnest(proposal_pools) pool) amount
        from jsonb_each_text(shares)) parts where amount>0;
  end if;
  if source is null or not coalesce((source->>'sourceReady')::boolean,false) then proposal:=null;proposal_items:='[]';end if;
  result:=result||jsonb_build_object('proposedAllocations',proposal_items,'proposedRemainder',
    (proposal-coalesce((select sum((i->>'amount')::numeric) from jsonb_array_elements(proposal_items) i),0))::text);
  return result||jsonb_build_object('digest',md5(result::text));
end $$;

revoke all on function private.finance_labor_period_basis(uuid,public.finance_obligations,public.finance_labor_automation,jsonb,jsonb,text,jsonb) from public,anon,authenticated,service_role;
create or replace function private.finance_labor_period_basis(p_studio uuid,o public.finance_obligations,cfg public.finance_labor_automation,source jsonb,p_preview_fx jsonb,p_reporting_currency text) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.finance_labor_period_basis(p_studio,o,cfg,source,p_preview_fx,p_reporting_currency,null)
$$;

create function private.finance_labor_reporting_core(p_studio_id uuid,p_fx jsonb,p_open boolean,p_capacity jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare candidate jsonb; o public.finance_obligations; cfg public.finance_labor_automation; t public.finance_schedule_terms;
  source jsonb; basis jsonb; values_json jsonb; issues jsonb; periods jsonb:='[]'; fx jsonb; valuation record; base text;
  known numeric; remaining numeric; calculated numeric; recognized numeric; known_total numeric; recognized_native numeric;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  if jsonb_typeof(p_fx) is distinct from 'object' then raise exception 'finance_input_invalid';end if;
  select base_currency into base from public.finance_settings where studio_id=p_studio_id;
  for candidate in select * from private.finance_calculated_labor_candidates(p_studio_id,p_open) loop
    source:=null; fx:=null; t:=null; known:=null; remaining:=null; calculated:=null; recognized:=0; known_total:=null; recognized_native:=0;
    o:=null;
    if candidate->>'obligation_id' is not null then
      select * into o from public.finance_obligations where studio_id=p_studio_id and id=(candidate->>'obligation_id')::uuid;
      source:=private.finance_labor_source(p_studio_id,o.id);
    else
      o.studio_id:=p_studio_id;o.employee_id:=(candidate->>'employee_id')::uuid;o.schedule_id:=(candidate->>'schedule_id')::uuid;
      o.terms_id:=(candidate->>'terms_id')::uuid;o.kind:='payroll';
      o.period_start:=(candidate->>'period_start')::date;o.period_end:=(candidate->>'period_end')::date;
      select full_name into o.employee_name from public.profiles where id=o.employee_id;
      select * into t from public.finance_schedule_terms where studio_id=p_studio_id and id=o.terms_id;
      if t.id is not null then
        source:=jsonb_build_object('sourceReady',t.basis in ('net','gross') and ((t.commitment='agreed' and t.certainty='fixed') or t.amount=0),'currency',t.currency,'basis',t.basis,
          'deductionsStatus',case when t.employee_deductions is null then 'unknown' else 'fixed' end,'employerStatus',t.employer_cost_status,
          'knownCost',private.finance_payroll_known_cost(t.basis,t.amount,t.employee_payout,coalesce(t.employee_deductions,0),
            case when t.employer_cost_status='fixed' then coalesce(t.employer_cost,0) else 0 end)::text,
          'recognizedCost','0','remainingCost',private.finance_payroll_known_cost(t.basis,t.amount,t.employee_payout,coalesce(t.employee_deductions,0),
            case when t.employer_cost_status='fixed' then coalesce(t.employer_cost,0) else 0 end)::text);
      end if;
    end if;
    cfg:=private.finance_labor_configuration(p_studio_id);
    cfg.studio_id:=p_studio_id;cfg.starts_on:=o.period_start;
    if p_capacity ? 'internalProjectId' then cfg.internal_project_id:=(p_capacity->>'internalProjectId')::uuid;end if;
    if source is not null then
      select nullif(c.snapshot->'proposalFx','null'::jsonb) into fx from public.finance_labor_calculations c
        where c.studio_id=p_studio_id and c.obligation_id=o.id and c.status<>'provisional'
          and c.snapshot->'source'->>'currency'=source->>'currency' order by c.created_at desc,c.id desc limit 1;
      if fx is null and (select count(distinct p.fx_rate) from public.finance_labor_cost_pools p
        where p.studio_id=p_studio_id and p.obligation_id=o.id and p.fx_rate is not null)=1 then
        select jsonb_build_object('rate',p.fx_rate::text,'source',p.fx_source,'effectiveDate',p.fx_effective_date) into fx
          from public.finance_labor_cost_pools p where p.studio_id=p_studio_id and p.obligation_id=o.id and p.fx_rate is not null order by p.id limit 1;
      end if;
      fx:=coalesce(fx,p_fx->((source->>'currency')||':'||least(o.period_end,(now() at time zone 'Europe/Kyiv')::date)::text));
      if source->>'currency'=base or fx is not null then
        select * into valuation from private.finance_valuation(source->>'currency',base,least(o.period_end,(now() at time zone 'Europe/Kyiv')::date),(source->>'knownCost')::numeric,fx);
        fx:=jsonb_build_object('rate',valuation.rate::text,'source',valuation.source,'effectiveDate',valuation.effective_date);
      end if;
    end if;
    basis:=private.finance_labor_period_basis(p_studio_id,o,cfg,source,fx,base,p_capacity);
    issues:=basis->'issues';
    if candidate->>'terms_id' is null and candidate->>'kind'<>'bonus' then
      issues:=issues||jsonb_build_array(case when (candidate->>'candidates')::integer>1 then 'ambiguous_salary' else 'missing_salary' end);
    end if;
    if jsonb_array_length(basis->'missingDates')>0 then issues:=issues||jsonb_build_array('missing_reports');end if;
    if cfg.internal_project_id is null and jsonb_array_length(basis->'projectIds')>0 then issues:=issues||jsonb_build_array('internal_classification');end if;
    basis:=basis||jsonb_build_object('issues',issues);
    recognized_native:=coalesce((source->>'recognizedCost')::numeric,0);
    if coalesce((source->>'sourceReady')::boolean,false) and not (issues ? 'partial_employment') then
      known:=(source->>'knownCost')::numeric;recognized_native:=(source->>'recognizedCost')::numeric;
      remaining:=(source->>'remainingCost')::numeric;
    end if;
    if remaining>=0 then values_json:=private.finance_provisional_labor_values(basis);
    else values_json:=jsonb_build_object('provisionalAllocations','[]'::jsonb,'provisionalRemainder',null);end if;
    if o.period_end<(now() at time zone 'Europe/Kyiv')::date and remaining>=0 and values_json->>'provisionalRemainder' is null and fx is not null then
      select * into valuation from private.finance_valuation(source->>'currency',base,least(o.period_end,(now() at time zone 'Europe/Kyiv')::date),remaining,fx);
      values_json:=values_json||jsonb_build_object('provisionalRemainder',valuation.reporting_amount::text);
    end if;
    if o.period_end>=(now() at time zone 'Europe/Kyiv')::date and remaining=0 then values_json:=jsonb_build_object('provisionalRemainder','0','provisionalAllocations','[]');end if;
    calculated:=(values_json->>'provisionalRemainder')::numeric+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(values_json->'provisionalAllocations') a),0);
    select case when count(*) filter(where available_reporting_amount is null)>0 then null else coalesce(sum(available_reporting_amount),0) end into recognized
      from public.finance_labor_cost_pools where studio_id=p_studio_id and obligation_id=o.id;
    known_total:=recognized+calculated;
    if values_json->'issues' is not null then issues:=values_json->'issues';end if;
    if (basis->>'manual')::boolean and remaining>0 then issues:=issues||jsonb_build_array('manual_attribution');end if;
    periods:=periods||jsonb_build_array(jsonb_build_object('sourceKey',candidate->>'sourceKey','obligationId',o.id,'scheduleId',o.schedule_id,'termsId',o.terms_id,
      'employeeId',o.employee_id,'label',coalesce(o.employee_name,o.employee_id::text),'periodStart',o.period_start,'periodEnd',least(o.period_end,(now() at time zone 'Europe/Kyiv')::date),
      'currency',source->>'currency','knownNative',known::text,'recognizedNative',recognized_native::text,'remainingNative',remaining::text,
      'reportingCurrency',base,'knownStudioCost',known_total::text,'recognizedCost',recognized::text,'calculatedCost',calculated::text,
      'allocations',coalesce(values_json->'provisionalAllocations','[]'),'unattributedCost',values_json->>'provisionalRemainder',
      'projectIds',basis->'projectIds','expectedMinutes',basis->'expectedMinutes','completedDays',basis->'completedDays','requiredDays',basis->'requiredDays',
      'missingDates',basis->'missingDates','issues',issues,'fx',fx));
  end loop;
  return jsonb_build_object('asOf',(now() at time zone 'Europe/Kyiv')::date,'reportingCurrency',base,'periods',periods);
end $$;
revoke all on function private.finance_labor_reporting_core(uuid,jsonb,boolean,jsonb) from public,anon,authenticated,service_role;
create or replace function private.finance_labor_reporting_core(p_studio_id uuid,p_fx jsonb,p_open boolean) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.finance_labor_reporting_core(p_studio_id,p_fx,p_open,null)
$$;

-- Both source calculations and new recognition require review for the same sources.
-- Unrelated services are independent of payroll setup; existing postings stay owned.
create function private.finance_recurring_payroll_review_required(p_studio uuid,p_schedule uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select not (r->>'reviewed')::boolean and exists(
    select 1 from jsonb_array_elements(r->'recurring') t where t->>'scheduleId'=p_schedule::text)
  from private.finance_labor_source_review(p_studio) r
$$;
revoke all on function private.finance_recurring_payroll_review_required(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.guard_finance_labor_payroll_sources() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.kind='recognition' then
    if new.source_kind='labor' and exists(select 1 from public.finance_labor_automation where studio_id=new.studio_id)
      and not (private.finance_labor_source_review(new.studio_id)->>'reviewed')::boolean then
      raise exception 'finance_payroll_source_review_required';end if;
    if new.source_kind='expected' and exists(
      select 1 from public.finance_obligation_items i join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
      where i.studio_id=new.studio_id and i.expected_item_id=private.finance_recognition_expected_root(new.studio_id,new.expected_item_id)
        and o.kind='recurring' and private.finance_recurring_payroll_review_required(new.studio_id,o.schedule_id)) then
      raise exception 'finance_payroll_source_review_required';end if;
    if new.source_kind='expected' and private.finance_labor_cash_expected(new.studio_id,new.expected_item_id) then
      raise exception 'finance_payroll_cash_source';end if;
  end if;
  return new;
end $$;

create or replace function private.finance_expense_service_calculations(p_studio uuid,p_calculate boolean) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare o record; p public.finance_expense_service_policies; source jsonb; boundary date; base text; digits integer;
  first_day date; last_day date; eligible date; month date; through date; segment_from date; target numeric; recorded numeric; months integer; inferred boolean; issue text; source_issue text; candidate jsonb;
begin
  select recognition_start_month,base_currency into boundary,base from public.finance_settings where studio_id=p_studio and finalized_at is not null;
  if boundary is null and not p_calculate then return;end if;
  for o in
    with periods as (
      select obligations.schedule_id,obligations.period_start,i.expected_item_id,t.interval_months,t.amount,t.currency,t.name,t.category_id
      from public.finance_obligations obligations
      join public.finance_obligation_items i on i.studio_id=obligations.studio_id and i.obligation_id=obligations.id and i.component='recurring'
      join public.finance_schedule_terms t on t.studio_id=obligations.studio_id and t.id=obligations.terms_id
      where obligations.studio_id=p_studio and obligations.kind='recurring'
      union all
      select s.id,d::date,null,t.interval_months,t.amount,t.currency,t.name,t.category_id
      from public.finance_schedules s join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
      join public.finance_categories c on c.studio_id=t.studio_id and c.id=t.category_id
      cross join lateral generate_series(t.effective_from::timestamp,least(t.valid_through,(now() at time zone 'Europe/Kyiv')::date)::timestamp,make_interval(months=>t.interval_months)) d
      where p_calculate and s.studio_id=p_studio and s.kind='recurring' and t.commitment='agreed' and t.certainty='fixed'
        and c.nature='operating' and coalesce(c.default_key,'') not in ('salary','employee_bonus')
        and not (private.finance_labor_source_review(p_studio)->'cashTermIds' ? t.id::text)
        and not exists(select 1 from public.finance_obligations existing where existing.studio_id=p_studio and existing.schedule_id=s.id and existing.period_start=d::date)
    ) select *,expected_item_id is null as synthetic from periods order by period_start,schedule_id loop
    if exists(select 1 from public.finance_categories c where c.studio_id=p_studio and c.id=o.category_id
      and (c.nature<>'operating' or c.default_key in ('salary','employee_bonus'))) then continue;end if;
    if not o.synthetic and (exists(select 1 from public.finance_trip_entries e where e.studio_id=p_studio and e.expected_item_id=o.expected_item_id)
      or exists(select 1 from public.finance_trip_balances b where b.studio_id=p_studio and b.expected_item_id=o.expected_item_id)) then continue;end if;
    inferred:=false;
    select * into p from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=o.schedule_id and first_period<=o.period_start
      order by first_period desc,revision desc limit 1;
    if p.id is null and p_calculate then p:=private.finance_default_monthly_service(p_studio,o.schedule_id);inferred:=p.id is not null;end if;
    if p.id is null or p.policy='manual' or (not o.synthetic and private.finance_labor_cash_expected(p_studio,o.expected_item_id)) then continue;end if;
    months:=(extract(year from o.period_start)-extract(year from p.first_period))::integer*12
      +(extract(month from o.period_start)-extract(month from p.first_period))::integer;
    first_day:=(p.service_start+make_interval(months=>months))::date;
    last_day:=(p.service_start+make_interval(months=>months+p.service_months)-interval '1 day')::date;
    eligible:=case when p_calculate then greatest(first_day,coalesce(p.coverage_from,p.effective_from)) else greatest(first_day,p.effective_from,boundary,(select (recognition_enabled_at at time zone 'Europe/Kyiv')::date from public.finance_settings where studio_id=p_studio)) end;
    if eligible>least(last_day,(now() at time zone 'Europe/Kyiv')::date) then continue;end if;
    if p.policy='period_end' and last_day>(now() at time zone 'Europe/Kyiv')::date then continue;end if;
    source:=case when o.synthetic then jsonb_build_object('currency',o.currency,'amount',o.amount::text,'label',o.name) else private.finance_expense_source(p_studio,'expected',o.expected_item_id) end;
    issue:=null;
    if source is null then issue:='source_unavailable';
    elsif o.interval_months<>p.service_months or months%p.service_months<>0 then issue:='policy_stale';
    elsif nullif(source->>'projectId','')::uuid is not null and nullif(source->>'projectId','')::uuid is distinct from p.project_id then issue:='source_project';
    elsif inferred and exists(select 1 from public.finance_recognition_entries r
      join public.finance_obligation_items i on i.studio_id=r.studio_id and i.expected_item_id=private.finance_recognition_expected_root(r.studio_id,r.expected_item_id)
      join public.finance_obligations obligations on obligations.studio_id=i.studio_id and obligations.id=i.obligation_id
      where r.studio_id=p_studio and obligations.schedule_id=o.schedule_id) then issue:='manual_history';
    elsif private.finance_recurring_payroll_review_required(p_studio,o.schedule_id) then issue:='payroll_source_review';
    elsif exists(select 1 from public.finance_recognition_entries r where r.studio_id=p_studio
      and (r.expected_item_id=o.expected_item_id or r.source_snapshot->>'economicExpectedId'=o.expected_item_id::text)
      and r.expense_policy_id is distinct from p.id) then issue:='manual_history';
    elsif exists(select 1 from public.finance_recognition_entries r where r.studio_id=p_studio and r.expense_policy_id=p.id
      and r.expected_item_id=o.expected_item_id and r.kind<>'recognition') then issue:='source_corrected';end if;
    source_issue:=issue;
    select minor_units into digits from public.finance_currencies where code=source->>'currency';
    for month in select generate_series(date_trunc('month',case when p.policy='period_end' then last_day else eligible end),
      date_trunc('month',least(last_day,(now() at time zone 'Europe/Kyiv')::date)),interval '1 month')::date loop
      issue:=source_issue;
      segment_from:=case when p.policy='period_end' then eligible else greatest(month,eligible) end;
      through:=least((month+interval '1 month - 1 day')::date,last_day,(now() at time zone 'Europe/Kyiv')::date);
      target:=trunc((source->>'amount')::numeric*(through-first_day+1)/(last_day-first_day+1),digits)
        -trunc((source->>'amount')::numeric*(segment_from-first_day)/(last_day-first_day+1),digits);
      select coalesce(sum(amount),0) into recorded from public.finance_recognition_entries where studio_id=p_studio
        and expense_policy_id=p.id and expected_item_id=o.expected_item_id and recognized_on>=month and recognized_on<(month+interval '1 month')::date;
      if target<recorded then issue:='source_changed';end if;
      if target=recorded and issue is null then continue;end if;
      if issue is null and private.finance_expense_period_reviewed(p_studio,p.project_id,segment_from,through) then issue:='history_protected';end if;
      candidate:=jsonb_build_object('action','recognize','studioId',p_studio,'sourceId',coalesce(o.expected_item_id,md5(o.schedule_id::text||o.period_start::text)::uuid),'policyId',p.id,'month',month,
        'from',segment_from,'to',through,'amount',greatest(target-recorded,0)::text,'currency',source->>'currency','reportingCurrency',base,
        'projectId',p.project_id,'label',coalesce(source->>'label','Expense source unavailable'),'issue',issue,
        'source',source-'consumed','policy',to_jsonb(p),'recorded',recorded::text);
      return next candidate||jsonb_build_object('digest',md5(candidate::text));
    end loop;
  end loop;
end $$;
-- Read current operational defaults; no assertion about their historical validity.
alter function public.get_finance_labor_reporting(uuid) rename to get_finance_labor_before_setup_defaults;
alter function public.get_finance_labor_before_setup_defaults(uuid) set schema private;
revoke all on function private.get_finance_labor_before_setup_defaults(uuid) from public,anon,authenticated,service_role;
create function public.get_finance_labor_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; recurring jsonb;
begin
  result:=private.get_finance_labor_before_setup_defaults(p_studio_id);
  select coalesce(jsonb_agg(t||jsonb_build_object('hasRecognizedExpense',exists(
    select 1 from public.finance_recognized_actuals e
    join public.finance_obligation_items i on i.studio_id=e.studio_id and i.expected_item_id=private.finance_recognition_expected_root(e.studio_id,e.expected_item_id)
    join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
    where e.studio_id=p_studio_id and o.terms_id=(t->>'termId')::uuid
    group by o.terms_id having sum(e.amount)>0)) order by t->>'termId'),'[]') into recurring
    from jsonb_array_elements(result->'sourceReview'->'recurring') t;
  result:=jsonb_set(result,'{sourceReview,recurring}',recurring);
  return result||jsonb_build_object('studioDailyMinutes',(select standard_workday_minutes from public.studios where id=p_studio_id));
end $$;
revoke all on function public.get_finance_labor_reporting(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_labor_reporting(uuid) to authenticated;

alter function public.preview_finance_labor_activation(uuid,jsonb) rename to preview_finance_labor_before_costs;
alter function public.preview_finance_labor_before_costs(uuid,jsonb) set schema private;
revoke all on function private.preview_finance_labor_before_costs(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.preview_finance_labor_activation(p_studio_id uuid,p_input jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; proposal jsonb; costs jsonb; days integer[]; project uuid;
begin
  result:=private.preview_finance_labor_before_costs(p_studio_id,p_input);
  if (p_input->>'dailyMinutes')::integer is null or (p_input->>'dailyMinutes')::integer<=0
    or jsonb_typeof(p_input->'weekdays') is distinct from 'array' then raise exception 'finance_input_invalid';end if;
  select array_agg(distinct value::integer) into days from jsonb_array_elements_text(p_input->'weekdays');
  if exists(select 1 from unnest(days) d where d not between 1 and 7) then raise exception 'finance_input_invalid';end if;
  project:=coalesce(nullif(p_input->>'internalProjectId','')::uuid,(private.finance_labor_configuration(p_studio_id)).internal_project_id);
  if project is not null and not exists(select 1 from public.projects where studio_id=p_studio_id and id=project) then raise exception 'finance_input_invalid';end if;
  proposal:=jsonb_build_object('employeeId',nullif(p_input->>'employeeId',''),'effectiveFrom',result->>'capacityFrom',
    'dailyMinutes',p_input->'dailyMinutes','weekdays',p_input->'weekdays','internalProjectId',project);
  costs:=private.finance_labor_reporting_core(p_studio_id,'{}',true,proposal);
  costs:=jsonb_set(costs,'{periods}',coalesce((select jsonb_agg(p) from jsonb_array_elements(costs->'periods') p
    where (p->>'periodEnd')::date>=(result->>'capacityFrom')::date),'[]'));
  result:=result||jsonb_build_object('costPreview',costs,'historicalCapacityRequired',(result->>'capacityFrom')::date<(now() at time zone 'Europe/Kyiv')::date);
  -- Include the original source digest and calculated capacity/leave/employment evidence.
  return result||jsonb_build_object('digest',md5((result||jsonb_build_object('input',p_input-'previewDigest'))::text));
end $$;
revoke all on function public.preview_finance_labor_activation(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.preview_finance_labor_activation(uuid,jsonb) to authenticated;

alter function public.configure_finance_labor_automation(uuid,uuid,jsonb) rename to configure_finance_labor_before_costs;
alter function public.configure_finance_labor_before_costs(uuid,uuid,jsonb) set schema private;
revoke all on function private.configure_finance_labor_before_costs(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.configure_finance_labor_automation(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare preview jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  if exists(select 1 from public.finance_planning_requests where studio_id=p_studio_id and request_id=p_request_id) then
    return private.configure_finance_labor_before_costs(p_studio_id,p_request_id,p_input);end if;
  preview:=public.preview_finance_labor_activation(p_studio_id,p_input-'previewDigest');
  if p_input->>'previewDigest' is distinct from preview->>'digest' then raise exception 'finance_preview_required';end if;
  if (preview->>'historicalCapacityRequired')::boolean and coalesce((p_input->>'historicalCapacityConfirmed')::boolean,false) is not true then
    raise exception 'finance_capacity_confirmation_required';end if;
  return private.configure_finance_labor_before_costs(p_studio_id,p_request_id,p_input);
end $$;
revoke all on function public.configure_finance_labor_automation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.configure_finance_labor_automation(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
