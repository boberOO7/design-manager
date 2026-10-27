-- Reuse salary and Worklog/capacity formulas without enabling processing or posting history.
create function private.finance_payroll_known_cost(p_basis text,p_amount numeric,p_payout numeric,p_deductions numeric,p_employer numeric) returns numeric
language sql immutable set search_path='' as $$
  select case when p_basis='gross' then p_amount else coalesce(p_payout,p_amount)+p_deductions end+p_employer
$$;
revoke all on function private.finance_payroll_known_cost(text,numeric,numeric,numeric,numeric) from public,anon,authenticated,service_role;
grant execute on function private.finance_payroll_known_cost(text,numeric,numeric,numeric,numeric) to authenticated;

create or replace function private.finance_labor_source(p_studio uuid,p_obligation uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare obligation public.finance_obligations; terms public.finance_schedule_terms; payout public.finance_expected_items;
  deductions public.finance_payroll_cost_revisions; employer public.finance_payroll_cost_revisions;
  deductions_status text; employer_status text; deductions_value numeric; employer_value numeric;
  known numeric; consumed numeric; snapshot jsonb; result jsonb; code text;
begin
  select * into obligation from public.finance_obligations where studio_id=p_studio and id=p_obligation and kind in ('payroll','bonus');
  if not found then return null; end if;
  select * into terms from public.finance_schedule_terms where studio_id=p_studio and id=obligation.terms_id;
  select i.* into payout from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
    where l.studio_id=p_studio and l.obligation_id=p_obligation and l.component in ('payout','bonus');
  select * into deductions from public.finance_payroll_cost_revisions where studio_id=p_studio and obligation_id=p_obligation and component='deductions' order by revision desc limit 1;
  select * into employer from public.finance_payroll_cost_revisions where studio_id=p_studio and obligation_id=p_obligation and component='employer_cost' order by revision desc limit 1;
  code:=coalesce(terms.currency,payout.currency);
  if code is null then return null; end if;
  deductions_status:=coalesce(deductions.status,case when terms.employee_deductions is null then 'unknown' else 'fixed' end);
  employer_status:=coalesce(employer.status,terms.employer_cost_status,'unknown');
  deductions_value:=case when deductions_status='fixed' then coalesce(deductions.amount,terms.employee_deductions,0) else 0 end;
  employer_value:=case when employer_status='fixed' then coalesce(employer.amount,terms.employer_cost,0) else 0 end;
  if obligation.kind='bonus' then
    known:=case when payout.commitment='agreed' and payout.certainty='fixed' then payout.amount else 0 end;
    deductions_status:='fixed';employer_status:='fixed';
  else known:=private.finance_payroll_known_cost(terms.basis,terms.amount,terms.employee_payout,deductions_value,employer_value);
  end if;
  select coalesce(sum(r.amount),0) into consumed from public.finance_recognition_entries r where r.studio_id=p_studio and r.obligation_id=p_obligation;
  snapshot:=jsonb_build_object('obligation',to_jsonb(obligation),'terms',to_jsonb(terms),'payout',to_jsonb(payout),
    'deductionsRevision',to_jsonb(deductions),'employerRevision',to_jsonb(employer),'deductionsStatus',deductions_status,'employerStatus',employer_status,
    'knownCost',known::text,'currency',code);
  result:=jsonb_build_object('obligationId',obligation.id,'employeeId',obligation.employee_id,'label',obligation.employee_name,
    'kind',obligation.kind,'periodStart',obligation.period_start,'periodEnd',obligation.period_end,'currency',code,
    'knownCost',known::text,'recognizedCost',consumed::text,'remainingCost',(known-consumed)::text,
    'deductionsStatus',deductions_status,'employerStatus',employer_status,'basis',coalesce(terms.basis,'bonus'),
    'version',md5(snapshot::text),'snapshot',snapshot,
    'sourceReady',coalesce(payout.commitment='agreed' and payout.certainty='fixed' or obligation.kind='payroll' and terms.amount=0,false),
    'canConfirm',obligation.period_end<=(now() at time zone 'Europe/Kyiv')::date
      and coalesce(payout.commitment='agreed' and payout.certainty='fixed' or obligation.kind='payroll' and terms.amount=0,false));
  return result;
end $$;

create function private.finance_labor_period_basis(p_studio uuid,o public.finance_obligations,cfg public.finance_labor_automation,source jsonb,p_preview_fx jsonb,p_reporting_currency text) returns jsonb
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

revoke all on function private.finance_labor_period_basis(uuid,public.finance_obligations,public.finance_labor_automation,jsonb,jsonb,text) from public,anon,authenticated,service_role;

-- The worker retains its activation, ownership and source-review boundaries.
create or replace function private.finance_automatic_labor_basis_before_source_review(p_studio uuid,p_obligation uuid,p_preview_fx jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.finance_obligations; cfg public.finance_labor_automation;
begin
  select * into o from public.finance_obligations where studio_id=p_studio and id=p_obligation and kind in ('payroll','bonus');
  cfg:=private.finance_labor_configuration(p_studio);
  if o.id is null or cfg.studio_id is null or o.period_end<cfg.starts_on then return null;end if;
  return private.finance_labor_period_basis(p_studio,o,cfg,private.finance_labor_source(p_studio,p_obligation),p_preview_fx,
    (select base_currency from public.finance_settings where studio_id=p_studio));
end $$;
revoke all on function private.finance_automatic_labor_basis_before_source_review(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- A missing occurrence is a calculation candidate, never a new payable or ledger source.
create function private.finance_historical_labor_candidates(p_studio uuid) returns setof jsonb
language sql stable security definer set search_path='' as $$
  with terms as (
    select s.employee_id,s.id as schedule_id,t.id as terms_id,d::date as period_start,
      least((d+make_interval(months=>t.interval_months)-interval '1 day')::date,t.valid_through) as period_end
    from public.finance_schedules s join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
    cross join lateral generate_series(t.effective_from::timestamp,
      least(t.valid_through,date_trunc('month',now() at time zone 'Europe/Kyiv')::date-1)::timestamp,
      make_interval(months=>t.interval_months)) d
    where s.studio_id=p_studio and s.kind='payroll'
  ), synthetic as (
    select employee_id,period_start,max(period_end) as period_end,count(*) as candidates,
      case when count(*)=1 then (array_agg(schedule_id))[1] end as schedule_id,
      case when count(*)=1 then (array_agg(terms_id))[1] end as terms_id
    from terms t where period_end<(now() at time zone 'Europe/Kyiv')::date and not exists(
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
      from public.finance_obligations o where o.studio_id=p_studio and o.kind in ('payroll','bonus') and o.period_end<(now() at time zone 'Europe/Kyiv')::date
    union all select employee_id,period_start,period_end,schedule_id,terms_id,null,'payroll',candidates from synthetic
    union all select employee_id,period_start,period_end,null,null,null,'missing',0 from missing
  ) select to_jsonb(c)||jsonb_build_object('sourceKey',case when c.kind='bonus' then 'bonus:'||c.obligation_id::text
    else c.kind||':'||c.employee_id::text||':'||c.period_start::text end) from candidates c order by period_start,employee_id,kind
$$;
revoke all on function private.finance_historical_labor_candidates(uuid) from public,anon,authenticated,service_role;

create function public.get_finance_historical_labor_reporting(p_studio_id uuid,p_fx jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare candidate jsonb; o public.finance_obligations; cfg public.finance_labor_automation; t public.finance_schedule_terms;
  source jsonb; basis jsonb; values_json jsonb; issues jsonb; periods jsonb:='[]'; fx jsonb; valuation record; base text;
  known numeric; remaining numeric; calculated numeric; recognized numeric; known_total numeric; recognized_native numeric;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  if jsonb_typeof(p_fx) is distinct from 'object' then raise exception 'finance_input_invalid';end if;
  select base_currency into base from public.finance_settings where studio_id=p_studio_id;
  for candidate in select * from private.finance_historical_labor_candidates(p_studio_id) loop
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
    if source is not null then
      select nullif(c.snapshot->'proposalFx','null'::jsonb) into fx from public.finance_labor_calculations c
        where c.studio_id=p_studio_id and c.obligation_id=o.id and c.status<>'provisional'
          and c.snapshot->'source'->>'currency'=source->>'currency' order by c.created_at desc,c.id desc limit 1;
      if fx is null and (select count(distinct p.fx_rate) from public.finance_labor_cost_pools p
        where p.studio_id=p_studio_id and p.obligation_id=o.id and p.fx_rate is not null)=1 then
        select jsonb_build_object('rate',p.fx_rate::text,'source',p.fx_source,'effectiveDate',p.fx_effective_date) into fx
          from public.finance_labor_cost_pools p where p.studio_id=p_studio_id and p.obligation_id=o.id and p.fx_rate is not null order by p.id limit 1;
      end if;
      fx:=coalesce(fx,p_fx->((source->>'currency')||':'||o.period_end::text));
      if source->>'currency'=base or fx is not null then
        select * into valuation from private.finance_valuation(source->>'currency',base,o.period_end,(source->>'knownCost')::numeric,fx);
        fx:=jsonb_build_object('rate',valuation.rate::text,'source',valuation.source,'effectiveDate',valuation.effective_date);
      end if;
    end if;
    basis:=private.finance_labor_period_basis(p_studio_id,o,cfg,source,fx,base);
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
    if remaining>=0 and values_json->>'provisionalRemainder' is null and fx is not null then
      select * into valuation from private.finance_valuation(source->>'currency',base,o.period_end,remaining,fx);
      values_json:=values_json||jsonb_build_object('provisionalRemainder',valuation.reporting_amount::text);
    end if;
    calculated:=(values_json->>'provisionalRemainder')::numeric+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(values_json->'provisionalAllocations') a),0);
    select case when count(*) filter(where available_reporting_amount is null)>0 then null else coalesce(sum(available_reporting_amount),0) end into recognized
      from public.finance_labor_cost_pools where studio_id=p_studio_id and obligation_id=o.id;
    known_total:=recognized+calculated;
    if values_json->'issues' is not null then issues:=values_json->'issues';end if;
    if (basis->>'manual')::boolean and remaining>0 then issues:=issues||jsonb_build_array('manual_attribution');end if;
    periods:=periods||jsonb_build_array(jsonb_build_object('sourceKey',candidate->>'sourceKey','obligationId',o.id,'scheduleId',o.schedule_id,'termsId',o.terms_id,
      'employeeId',o.employee_id,'label',coalesce(o.employee_name,o.employee_id::text),'periodStart',o.period_start,'periodEnd',o.period_end,
      'currency',source->>'currency','knownNative',known::text,'recognizedNative',recognized_native::text,'remainingNative',remaining::text,
      'reportingCurrency',base,'knownStudioCost',known_total::text,'recognizedCost',recognized::text,'calculatedCost',calculated::text,
      'allocations',coalesce(values_json->'provisionalAllocations','[]'),'unattributedCost',values_json->>'provisionalRemainder',
      'projectIds',basis->'projectIds','expectedMinutes',basis->'expectedMinutes','completedDays',basis->'completedDays','requiredDays',basis->'requiredDays',
      'missingDates',basis->'missingDates','issues',issues,'fx',fx));
  end loop;
  return jsonb_build_object('asOf',(now() at time zone 'Europe/Kyiv')::date,'reportingCurrency',base,'periods',periods);
end $$;
revoke all on function public.get_finance_historical_labor_reporting(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_historical_labor_reporting(uuid,jsonb) to authenticated;

-- FX discovery is a read; the final management read owns the source/recognition snapshot.
alter function public.get_finance_management_reporting(uuid) rename to get_finance_management_reporting_before_historical_labor;
alter function public.get_finance_management_reporting_before_historical_labor(uuid) set schema private;
revoke all on function private.get_finance_management_reporting_before_historical_labor(uuid) from public,anon,authenticated,service_role;
create function public.get_finance_management_reporting(p_studio_id uuid,p_historical_fx jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  return private.get_finance_management_reporting_before_historical_labor(p_studio_id)
    ||jsonb_build_object('historicalLabor',public.get_finance_historical_labor_reporting(p_studio_id,p_historical_fx));
end $$;
revoke all on function public.get_finance_management_reporting(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_management_reporting(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
