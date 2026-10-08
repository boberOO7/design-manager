-- Retain applied migration history; extend proposals and authoritative capacity.
create or replace function private.finance_automatic_labor_basis(p_studio uuid,p_obligation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.finance_obligations; cfg public.finance_labor_automation; member public.studio_members;
  capacity public.finance_labor_capacity_revisions; source jsonb; day date; scheduled integer; absence integer;
  logged bigint; submitted boolean; employed boolean; projects jsonb; scope uuid[]:='{}'; missing_scope uuid[]:='{}'; shares jsonb:='{}';
  missing jsonb:='[]'; outside jsonb:='[]'; days jsonb:='[]'; expected bigint:=0; complete integer:=0; required integer:=0;
  result jsonb; pool_state jsonb; manual boolean; proposal numeric; proposal_items jsonb; rate numeric; digits integer; part record; share numeric; issues text[]:='{}';
begin
  select * into o from public.finance_obligations where studio_id=p_studio and id=p_obligation and kind in ('payroll','bonus');
  select * into cfg from public.finance_labor_automation where studio_id=p_studio;
  if o.id is null or cfg.studio_id is null or o.period_start<cfg.starts_on then return null;end if;
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
  if member.joined_at is null or member.joined_at>o.period_start or member.removed_at is not null and member.removed_at<=o.period_end then
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
    employed:=member.joined_at is not null and day>=member.joined_at and (member.removed_at is null or day<member.removed_at);
    -- Union of absence minutes avoids counting overlapping timed requests twice.
    select case when bool_or(r.all_day) then scheduled else least(scheduled,coalesce((select count(distinct minute)::integer
      from public.time_off_requests a cross join lateral generate_series(extract(epoch from a.start_time)::integer/60,
        extract(epoch from a.end_time)::integer/60-1) minute where a.studio_id=p_studio and a.user_id=o.employee_id
        and a.status='approved' and a.cancelled_at is null and not a.all_day and a.start_date<=day and a.end_date>=day),0)) end into absence
      from public.time_off_requests r where r.studio_id=p_studio and r.user_id=o.employee_id and r.status='approved'
        and r.cancelled_at is null and r.start_date<=day and r.end_date>=day;
    absence:=coalesce(absence,0);
    select exists(select 1 from public.work_log_days where studio_id=p_studio and user_id=o.employee_id and work_date=day) into submitted;
    select coalesce(sum(w.minutes),0),coalesce(jsonb_agg(jsonb_build_object('taskId',w.task_id,'projectId',t.project_id,'reviewRoundId',w.review_round_id,'minutes',w.minutes) order by w.id),'[]')
      into logged,projects from public.work_log_entries w join public.tasks t on t.id=w.task_id
      where w.studio_id=p_studio and w.user_id=o.employee_id and w.work_date=day;
    if scheduled>absence and employed and day<(now() at time zone 'Europe/Kyiv')::date then
      required:=required+1;if submitted then complete:=complete+1;else
        missing:=missing||jsonb_build_array(day);
        missing_scope:=missing_scope||array(select private.finance_employee_projects_on_day(p_studio,o.employee_id,day));
      end if;
    end if;
    for part in select t.project_id,sum(w.minutes) as minutes from public.work_log_entries w join public.tasks t on t.id=w.task_id
      where w.studio_id=p_studio and w.user_id=o.employee_id and w.work_date=day and t.project_id<>cfg.internal_project_id group by t.project_id loop
      scope:=array_append(scope,part.project_id);
      if submitted and employed and scheduled>0 and absence<scheduled then
        share:=scheduled::numeric*part.minutes/greatest(scheduled,logged+absence);
        shares:=jsonb_set(shares,array[part.project_id::text],to_jsonb(coalesce((shares->>part.project_id::text)::numeric,0)+share));
      else outside:=outside||jsonb_build_array(jsonb_build_object('date',day,'projectId',part.project_id));end if;
    end loop;
    days:=days||jsonb_build_array(jsonb_build_object('date',day,'capacityId',capacity.id,'scheduled',scheduled,'absence',absence,
      'employed',employed,'submitted',submitted,'entries',projects));
  end loop;
  if jsonb_array_length(outside)>0 then issues:=array_append(issues,'outside_schedule');end if;
  result:=jsonb_build_object('obligationId',o.id,'employeeId',o.employee_id,'label',o.employee_name,'periodStart',o.period_start,'periodEnd',o.period_end,
    'source',source,'expectedMinutes',expected,'completedDays',complete,'requiredDays',required,'missingDates',missing,'outsideSchedule',outside,
    'projectIds',to_jsonb(array(select distinct id from unnest(scope||missing_scope) id where id<>cfg.internal_project_id order by id)),
    'missingProjectIds',to_jsonb(array(select distinct id from unnest(missing_scope) id where id<>cfg.internal_project_id order by id)),
    'shares',shares,'days',days,'pools',pool_state,'manual',manual,'issues',to_jsonb(array(select distinct v from unnest(issues) v order by v)));
  select minor_units into digits from public.finance_currencies where code=(select base_currency from public.finance_settings where studio_id=p_studio);
  if source->>'currency'=(select base_currency from public.finance_settings where studio_id=p_studio) then rate:=1;
  elsif (select count(distinct p->'fx'->>'rate') from jsonb_array_elements(pool_state) p where p->'fx'<>'null'::jsonb)=1 then
    select (p->'fx'->>'rate')::numeric into rate from jsonb_array_elements(pool_state) p where p->'fx'<>'null'::jsonb limit 1;
  end if;
  proposal:=case when rate is not null then round((source->>'knownCost')::numeric*rate,digits) end;
  select coalesce(jsonb_agg(jsonb_build_object('projectId',key,'amount',amount::text) order by key),'[]') into proposal_items
  from (select key,trunc(proposal*value::numeric/nullif(expected,0),digits) amount from jsonb_each_text(shares)) rows where amount>0;
  result:=result||jsonb_build_object('proposedAllocations',proposal_items,'proposedRemainder',
    (proposal-coalesce((select sum((i->>'amount')::numeric) from jsonb_array_elements(proposal_items) i),0))::text);
  return result||jsonb_build_object('digest',md5(result::text));
end $$;

create or replace function public.get_finance_labor_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; cfg public.finance_labor_automation; periods jsonb; issues jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  result:=private.get_finance_labor_reporting_base(p_studio_id);
  select * into cfg from public.finance_labor_automation where studio_id=p_studio_id;
  select coalesce(jsonb_agg(basis||jsonb_build_object('status',case when (basis->>'manual')::boolean then 'manual'
    when c.digest=basis->>'digest' then c.status when c.id is not null then 'pending' else 'pending' end) order by o.period_start,o.employee_name,o.id),'[]') into periods
  from public.finance_obligations o cross join lateral (select private.finance_automatic_labor_basis(o.studio_id,o.id) as basis) b
  left join lateral (select * from public.finance_labor_calculations where studio_id=o.studio_id and obligation_id=o.id order by created_at desc,id desc limit 1) c on true
  where o.studio_id=p_studio_id and o.kind in ('payroll','bonus') and o.period_start>=cfg.starts_on and o.period_start<=(now() at time zone 'Europe/Kyiv')::date;
  -- Each warning carries its owning project. Studio-wide missingness never
  -- contaminates another employee's unrelated project result.
  with automatic as (
    select p from jsonb_array_elements(periods) p where not (p->>'manual')::boolean
  ), scoped as (
    select p,j.value as project_id,'missing_reports'::text as kind from automatic cross join lateral jsonb_array_elements_text(p->'missingProjectIds') j
    union all select p,j.value,k.value from automatic cross join lateral jsonb_array_elements_text(p->'projectIds') j
      cross join lateral jsonb_array_elements_text(p->'issues') k where k.value<>'outside_schedule'
    union all select p,j.value,'pending_review' from automatic cross join lateral jsonb_array_elements_text(p->'projectIds') j
      where p->>'status' in ('pending','pending_review') and (p->>'periodEnd')::date<(now() at time zone 'Europe/Kyiv')::date
    union all select p,j.value->>'projectId','outside_schedule' from automatic cross join lateral jsonb_array_elements(p->'outsideSchedule') j
  ), source_issues as (
    select s from jsonb_array_elements(result->'sources') s where
      not (s->>'sourceReady')::boolean or (s->>'remainingCost')::numeric<>0
      or (s->>'basis'='net' and s->>'deductionsStatus'<>'fixed') or s->>'employerStatus'<>'fixed' or exists(select 1 from public.finance_labor_cost_pools pool where pool.studio_id=p_studio_id and pool.obligation_id=(s->>'obligationId')::uuid and pool.available_reporting_amount is null)
  ), legacy as (
    select distinct s,project_id from source_issues cross join lateral (
      select i.project_id from public.finance_labor_allocation_items i join public.finance_labor_allocation_revisions r on r.studio_id=i.studio_id and r.id=i.revision_id
        join public.finance_recognition_entries e on e.studio_id=r.studio_id and e.id=r.entry_id
        where e.studio_id=p_studio_id and e.obligation_id=(s->>'obligationId')::uuid
      union select private.finance_employee_projects_on_day(p_studio_id,(s->>'employeeId')::uuid,d::date)
        from generate_series((s->>'periodStart')::timestamp,least((s->>'periodEnd')::date,(now() at time zone 'Europe/Kyiv')::date)::timestamp,interval '1 day') d
    ) projects where not exists(select 1 from automatic where p->>'obligationId'=s->>'obligationId')
  ), all_issues as (
    select jsonb_build_object('projectId',project_id,'employeeId',p->>'employeeId','periodStart',p->>'periodStart','periodEnd',p->>'periodEnd','kind',kind) as issue from scoped
    union select jsonb_build_object('projectId',project_id,'employeeId',s->>'employeeId','periodStart',s->>'periodStart','periodEnd',s->>'periodEnd','kind','payroll_source') from legacy
    union select jsonb_build_object('projectId',t.project_id,'employeeId',w.user_id,'periodStart',date_trunc('month',w.work_date)::date,
      'periodEnd',(date_trunc('month',w.work_date)+interval '1 month - 1 day')::date,'kind','missing_payroll')
      from public.work_log_entries w join public.tasks t on t.id=w.task_id where w.studio_id=p_studio_id and w.work_date>=cfg.starts_on
      and not exists(select 1 from public.finance_obligations o where o.studio_id=w.studio_id and o.employee_id=w.user_id and o.kind in ('payroll','bonus') and w.work_date between o.period_start and o.period_end)
    union select jsonb_build_object('projectId',project_id,'employeeId',schedule.employee_id,'periodStart',m->>'periodStart','periodEnd',m->>'periodEnd','kind','missing_payroll_period')
      from jsonb_array_elements(result->'missingPeriods') m join public.finance_schedules schedule on schedule.id=(m->>'scheduleId')::uuid and schedule.studio_id=p_studio_id
      cross join lateral (select distinct private.finance_employee_projects_on_day(p_studio_id,schedule.employee_id,d::date) as project_id
        from generate_series((m->>'periodStart')::timestamp,(m->>'periodEnd')::timestamp,interval '1 day') d) projects
  ) select coalesce(jsonb_agg(distinct issue) filter(where issue->>'projectId' is distinct from cfg.internal_project_id::text),'[]') into issues from all_issues;
  return result||jsonb_build_object('automation',case when cfg.studio_id is null then null else jsonb_build_object('startsOn',cfg.starts_on,'internalProjectId',cfg.internal_project_id) end,
    'employees',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.full_name) order by p.full_name,m.user_id) from public.studio_members m join public.profiles p on p.id=m.user_id where m.studio_id=p_studio_id and m.is_active and p.is_active),'[]'),
    'capacity',coalesce((select jsonb_agg(to_jsonb(c) order by c.effective_from,c.created_at,c.id) from public.finance_labor_capacity_revisions c where c.studio_id=p_studio_id),'[]'),
    'automaticPeriods',periods,'projectIssues',issues);
end $$;

alter function public.set_standard_workday_minutes(uuid,integer) rename to set_standard_workday_minutes_base;
alter function public.set_standard_workday_minutes_base(uuid,integer) set schema private;
create function public.set_standard_workday_minutes(p_studio_id uuid,p_minutes integer) returns void
language plpgsql security definer set search_path='' as $$
declare days integer[];
begin
  perform private.set_standard_workday_minutes_base(p_studio_id,p_minutes);
  if exists(select 1 from public.finance_labor_automation where studio_id=p_studio_id) then
    perform 1 from public.finance_settings where studio_id=p_studio_id for update;
    select weekdays into days from public.finance_labor_capacity_revisions where studio_id=p_studio_id and employee_id is null order by effective_from desc,created_at desc,id desc limit 1;
    insert into public.finance_labor_capacity_revisions(studio_id,effective_from,daily_minutes,weekdays,created_by)
    values(p_studio_id,(date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '1 month')::date,p_minutes,coalesce(days,array[1,2,3,4,5]),auth.uid());
  end if;
end $$;
revoke all on function private.set_standard_workday_minutes_base(uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.set_standard_workday_minutes(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.set_standard_workday_minutes(uuid,integer) to authenticated;

create or replace function public.configure_finance_labor_automation(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; starts date:=(p_input->>'effectiveFrom')::date; employee uuid:=nullif(p_input->>'employeeId','')::uuid;
  payload jsonb:=jsonb_build_object('operation','labor_capacity','input',p_input); days integer[];
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  if employee is not null then perform 1 from public.studio_members where studio_id=p_studio_id and user_id=employee for share;end if;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  if starts is null or starts<((date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '1 month')::date)
    or starts<>date_trunc('month',starts)::date or (p_input->>'dailyMinutes')::integer is null
    or not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null and recognition_start_month is not null and recognition_start_month<=starts)
    then raise exception 'finance_input_invalid';end if;
  select array_agg(distinct value::integer order by value::integer) into days from jsonb_array_elements_text(p_input->'weekdays');
  days:=coalesce(days,'{}');
  if not exists(select 1 from public.finance_labor_automation where studio_id=p_studio_id) then
    if employee is not null then raise exception 'finance_input_invalid';end if;
    insert into public.finance_labor_automation(studio_id,starts_on,internal_project_id,created_by)
    values(p_studio_id,starts,(p_input->>'internalProjectId')::uuid,auth.uid());
  end if;
  insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
  values(p_studio_id,employee,starts,(p_input->>'dailyMinutes')::integer,days,auth.uid()) returning id into result;
  if employee is null then perform private.set_standard_workday_minutes_base(p_studio_id,(p_input->>'dailyMinutes')::integer);end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;
notify pgrst,'reload schema';
