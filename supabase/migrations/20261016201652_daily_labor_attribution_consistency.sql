-- Keep daily provisional shares consistent with the full-period capacity calculation.
-- Internal activities follow the existing non-client-work normalization rule.
create or replace function private.finance_automatic_labor_basis_at_fx(p_studio uuid,p_obligation uuid,p_preview_fx jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.finance_obligations; cfg public.finance_labor_automation; member public.studio_members;
  capacity public.finance_labor_capacity_revisions; source jsonb; day date; scheduled integer; absence integer;
  logged bigint; submitted boolean; employed boolean; projects jsonb; scope uuid[]:='{}'; missing_scope uuid[]:='{}'; shares jsonb:='{}';
  missing jsonb:='[]'; outside jsonb:='[]'; days jsonb:='[]'; expected bigint:=0; complete integer:=0; required integer:=0;
  result jsonb; pool_state jsonb; manual boolean; proposal numeric; proposal_items jsonb; proposal_pools numeric[]; rate numeric; digits integer; part record; share numeric; issues text[]:='{}';
begin
  select * into o from public.finance_obligations where studio_id=p_studio and id=p_obligation and kind in ('payroll','bonus');
  cfg:=private.finance_labor_configuration(p_studio);
  if o.id is null or cfg.studio_id is null or o.period_end<cfg.starts_on then return null;end if;
  source:=private.finance_labor_source(p_studio,p_obligation);
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
      where w.studio_id=p_studio and w.user_id=o.employee_id and w.work_date=day and t.project_id<>cfg.internal_project_id group by t.project_id loop
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
    'reportingCurrency',(select base_currency from public.finance_settings where studio_id=p_studio),
    'source',source,'expectedMinutes',expected,'completedDays',complete,'requiredDays',required,'missingDates',missing,'outsideSchedule',outside,
    'projectIds',to_jsonb(array(select distinct id from unnest(scope||missing_scope) id where id<>cfg.internal_project_id order by id)),
    'missingProjectIds',to_jsonb(array(select distinct id from unnest(missing_scope) id where id<>cfg.internal_project_id order by id)),
    'shares',shares,'days',days,'pools',pool_state,'manual',manual,'issues',to_jsonb(array(select distinct v from unnest(issues) v order by v)));
  result:=result||jsonb_build_object('proposalFx',p_preview_fx);
  select minor_units into digits from public.finance_currencies where code=(select base_currency from public.finance_settings where studio_id=p_studio);
  if source->>'currency'=(select base_currency from public.finance_settings where studio_id=p_studio) then rate:=1;
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
revoke all on function private.finance_automatic_labor_basis_at_fx(uuid,uuid,jsonb) from public,anon,authenticated;

-- Freeze all logged minutes in daily evidence, including taskless internal work.
create or replace function private.finance_provisional_labor_values(p_basis jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare budget numeric; digits integer; daily jsonb; valid boolean;
begin
  select minor_units into digits from public.finance_currencies where code=p_basis->>'reportingCurrency';
  valid:=not (p_basis->>'manual')::boolean and jsonb_array_length(p_basis->'pools')=0
    and coalesce((p_basis->'source'->>'sourceReady')::boolean,false)
    and not (p_basis->'issues' ?| array['missing_capacity','partial_employment','source_unavailable']);
  valid:=valid or private.finance_labor_known_zero(p_basis);
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
  return jsonb_build_object('provisionalAllocations',p_basis->'proposedAllocations','provisionalDailyAllocations',daily,
    'provisionalRemainder',p_basis->'proposedRemainder','provisionalFx',p_basis->'proposalFx');
end $$;
revoke all on function private.finance_provisional_labor_values(jsonb) from public,anon,authenticated,service_role;


-- A historical preview must become stale when ownership, review or capacity evidence changes.
create or replace function public.preview_finance_labor_activation(p_studio_id uuid,p_input jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare starts date:=(p_input->>'effectiveFrom')::date; employee uuid:=nullif(p_input->>'employeeId','')::uuid;
  cfg public.finance_labor_automation; boundary date; periods jsonb; result jsonb; state jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  cfg:=private.finance_labor_configuration(p_studio_id);
  select recognition_start_month into boundary from public.finance_settings where studio_id=p_studio_id and finalized_at is not null;
  if starts is null or boundary is null or starts<boundary then raise exception 'finance_input_invalid';end if;
  with candidates as (
    select s.employee_id,p.full_name as label,m::date as period_start,
      least((m+make_interval(months=>t.interval_months)-interval '1 day')::date,t.valid_through) as period_end,t.id as terms_id,
      t.currency,case when t.basis='gross' then t.amount else coalesce(t.employee_payout,t.amount)+coalesce(t.employee_deductions,0) end
        +case when t.employer_cost_status='fixed' then coalesce(t.employer_cost,0) else 0 end as known
    from public.finance_schedules s join public.profiles p on p.id=s.employee_id
    cross join lateral generate_series(date_trunc('month',starts),date_trunc('month',greatest(starts,(now() at time zone 'Europe/Kyiv')::date)),interval '1 month') m
    cross join lateral (select h.* from public.finance_schedule_history h where h.studio_id=s.studio_id and h.schedule_id=s.id
      and h.effective_from<=m::date and (h.valid_through is null or h.valid_through>=m::date) order by h.revision desc limit 1) t
    where s.studio_id=p_studio_id and s.kind='payroll' and (employee is null or s.employee_id=employee)
      and ((extract(year from m)-extract(year from t.effective_from))*12+extract(month from m)-extract(month from t.effective_from))::integer%t.interval_months=0
  ), affected as (
    select c.employee_id,c.label,c.period_start,coalesce(o.period_end,c.period_end) as period_end,o.id,
      coalesce((private.finance_labor_source(p_studio_id,o.id)->>'knownCost')::numeric,c.known) as known,coalesce(private.finance_labor_source(p_studio_id,o.id)->>'currency',c.currency) as currency
    from candidates c left join public.finance_obligations o on o.studio_id=p_studio_id and o.employee_id=c.employee_id and o.kind='payroll' and o.period_start=c.period_start
    union select o.employee_id,o.employee_name,o.period_start,o.period_end,o.id,
      (private.finance_labor_source(p_studio_id,o.id)->>'knownCost')::numeric,private.finance_labor_source(p_studio_id,o.id)->>'currency'
      from public.finance_obligations o where o.studio_id=p_studio_id and o.kind in ('payroll','bonus')
      and o.period_end>=starts and o.period_start<=(now() at time zone 'Europe/Kyiv')::date and (employee is null or o.employee_id=employee)
  ) select coalesce(jsonb_agg(jsonb_build_object('employeeId',a.employee_id,'label',a.label,'periodStart',a.period_start,'periodEnd',a.period_end,
    'knownCost',a.known::text,'currency',a.currency,
    'recognizedCost',coalesce((select sum(e.amount) from public.finance_recognition_entries e where e.studio_id=p_studio_id and e.obligation_id=a.id),0)::text,
    'manual',exists(select 1 from public.finance_labor_allocation_revisions r join public.finance_recognition_entries e on e.studio_id=r.studio_id and e.id=r.entry_id
      where e.studio_id=p_studio_id and e.obligation_id=a.id and r.method='manual_management'),
    'protected',exists(select 1 from public.finance_report_coverage c where c.studio_id=p_studio_id and c.labor_reviewed and a.period_end between c.month and c.reviewed_through),
    'completedDays',(select count(*) from public.work_log_days w where w.studio_id=p_studio_id and w.user_id=a.employee_id and w.work_date between greatest(starts,a.period_start) and least(a.period_end,(now() at time zone 'Europe/Kyiv')::date)))
    order by a.period_start,a.employee_id,a.id),'[]') into periods from affected a;
  result:=jsonb_build_object('startsOn',starts,'capacityFrom',case when cfg.studio_id is null or coalesce((p_input->>'changeActivation')::boolean,false) and not exists(
      select 1 from public.finance_labor_capacity_revisions c where c.studio_id=p_studio_id and c.employee_id is null and c.effective_from<=date_trunc('month',starts)::date)
      then date_trunc('month',starts)::date else starts end,
    'recognitionStart',boundary,'existingAutomationStart',cfg.starts_on,'periods',periods);
  -- Bind the preview to source/evidence changes as well as the requested settings.
  state:=jsonb_build_object(
    'allocations',(select jsonb_agg(to_jsonb(r) order by r.id) from public.finance_labor_allocation_revisions r where r.studio_id=p_studio_id),
    'coverage',(select jsonb_agg(to_jsonb(c) order by c.id) from public.finance_report_coverage c where c.studio_id=p_studio_id),
    'daysOff',(select jsonb_agg(to_jsonb(d) order by d.id) from public.studio_days_off d where d.studio_id=p_studio_id),
    'absences',(select jsonb_agg(to_jsonb(r) order by r.id) from public.time_off_requests r where r.studio_id=p_studio_id and r.end_date>=date_trunc('month',starts)::date),
    'membership',(select jsonb_agg(to_jsonb(m) order by m.user_id) from public.studio_members m where m.studio_id=p_studio_id),
    'capacity',(select jsonb_agg(to_jsonb(c) order by c.id) from public.finance_labor_capacity_revisions c where c.studio_id=p_studio_id),
    'terms',(select jsonb_agg(to_jsonb(t) order by t.id) from public.finance_schedule_history t where t.studio_id=p_studio_id),
    'sources',(select jsonb_agg(private.finance_labor_source(p_studio_id,o.id) order by o.id) from public.finance_obligations o where o.studio_id=p_studio_id and o.period_end>=starts),
    'reports',(select jsonb_agg(to_jsonb(w) order by w.user_id,w.work_date) from public.work_log_days w where w.studio_id=p_studio_id and w.work_date>=starts),
    'work',(select jsonb_agg(to_jsonb(w) order by w.id) from public.work_log_entries w where w.studio_id=p_studio_id and w.work_date>=starts));
  return result||jsonb_build_object('digest',md5((result||jsonb_build_object('input',p_input-'previewDigest','state',state))::text));
end $$;
revoke all on function public.preview_finance_labor_activation(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.preview_finance_labor_activation(uuid,jsonb) to authenticated;


notify pgrst,'reload schema';
