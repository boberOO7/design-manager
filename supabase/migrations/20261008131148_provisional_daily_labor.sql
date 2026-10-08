-- Progressive work attribution is a proposal, never an early P&L expense.
alter table public.finance_labor_automation drop constraint finance_labor_automation_starts_on_check;
alter table public.finance_labor_calculations drop constraint finance_labor_calculations_status_check;
alter table public.finance_labor_calculations add constraint finance_labor_calculations_status_check
  check(status in ('applied','pending_review','exception','manual','provisional'));

-- Preserve the original activation and every later date change.
create table public.finance_labor_activation_revisions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_labor_automation(studio_id),
  starts_on date not null, previous_starts_on date not null,
  preview_digest text, created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp()
);
create index finance_labor_activation_latest on public.finance_labor_activation_revisions(studio_id,created_at desc,id);
alter table public.finance_labor_activation_revisions enable row level security;
revoke all on public.finance_labor_activation_revisions from public,anon,authenticated,service_role;
grant select on public.finance_labor_activation_revisions to authenticated;
create policy admin_read on public.finance_labor_activation_revisions for select to authenticated
  using((select private.is_finance_admin(studio_id)));
create trigger immutable_history before update or delete on public.finance_labor_activation_revisions
  for each row execute function private.reject_finance_history_change();

create function private.finance_labor_configuration(p_studio uuid) returns public.finance_labor_automation
language plpgsql stable security definer set search_path='' as $$
declare cfg public.finance_labor_automation; starts date;
begin
  select * into cfg from public.finance_labor_automation where studio_id=p_studio;
  select starts_on into starts from public.finance_labor_activation_revisions where studio_id=p_studio order by created_at desc,id desc limit 1;
  cfg.starts_on:=coalesce(starts,cfg.starts_on); return cfg;
end $$;
revoke all on function private.finance_labor_configuration(uuid) from public,anon,authenticated,service_role;

create function public.preview_finance_labor_activation(p_studio_id uuid,p_input jsonb) returns jsonb
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
    'capacity',(select jsonb_agg(to_jsonb(c) order by c.id) from public.finance_labor_capacity_revisions c where c.studio_id=p_studio_id),
    'terms',(select jsonb_agg(to_jsonb(t) order by t.id) from public.finance_schedule_history t where t.studio_id=p_studio_id),
    'sources',(select jsonb_agg(private.finance_labor_source(p_studio_id,o.id) order by o.id) from public.finance_obligations o where o.studio_id=p_studio_id and o.period_end>=starts),
    'reports',(select jsonb_agg(to_jsonb(w) order by w.user_id,w.work_date) from public.work_log_days w where w.studio_id=p_studio_id and w.work_date>=starts),
    'work',(select jsonb_agg(to_jsonb(w) order by w.id) from public.work_log_entries w where w.studio_id=p_studio_id and w.work_date>=starts));
  return result||jsonb_build_object('digest',md5((result||jsonb_build_object('input',p_input-'previewDigest','state',state))::text));
end $$;
revoke all on function public.preview_finance_labor_activation(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.preview_finance_labor_activation(uuid,jsonb) to authenticated;

create or replace function public.configure_finance_labor_automation(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; starts date:=(p_input->>'effectiveFrom')::date; employee uuid:=nullif(p_input->>'employeeId','')::uuid;
  payload jsonb:=jsonb_build_object('operation','labor_capacity','input',p_input); days integer[];
  cfg public.finance_labor_automation; preview jsonb; capacity_from date;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  perform 1 from public.studio_members where studio_id=p_studio_id order by user_id for share;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  cfg:=private.finance_labor_configuration(p_studio_id);
  preview:=public.preview_finance_labor_activation(p_studio_id,p_input-'previewDigest');
  if starts<(now() at time zone 'Europe/Kyiv')::date and p_input->>'previewDigest' is distinct from preview->>'digest' then raise exception 'finance_preview_required';end if;
  if (p_input->>'dailyMinutes')::integer is null or (p_input->>'dailyMinutes')::integer<=0 then raise exception 'finance_input_invalid';end if;
  if employee is not null and not exists(select 1 from public.studio_members where studio_id=p_studio_id and user_id=employee) then raise exception 'finance_input_invalid';end if;
  select array_agg(distinct value::integer order by value::integer) into days from jsonb_array_elements_text(p_input->'weekdays'); days:=coalesce(days,'{}');
  capacity_from:=(preview->>'capacityFrom')::date;
  if cfg.studio_id is null then
    if employee is not null or coalesce((p_input->>'internalDesignationConfirmed')::boolean,false) is not true then raise exception 'finance_input_invalid';end if;
    insert into public.finance_labor_automation(studio_id,starts_on,internal_project_id,created_by)
    values(p_studio_id,starts,(p_input->>'internalProjectId')::uuid,auth.uid());
  elsif coalesce((p_input->>'changeActivation')::boolean,false) then
    if employee is not null or (p_input->>'internalProjectId')::uuid is distinct from cfg.internal_project_id then raise exception 'finance_input_invalid';end if;
    if starts>cfg.starts_on and exists(select 1 from public.finance_labor_calculations where studio_id=p_studio_id and status='applied') then
      raise exception 'finance_history_protected';end if;
    insert into public.finance_labor_activation_revisions(studio_id,starts_on,previous_starts_on,preview_digest,created_by)
    values(p_studio_id,starts,cfg.starts_on,p_input->>'previewDigest',auth.uid());
  end if;
  insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
  values(p_studio_id,employee,capacity_from,(p_input->>'dailyMinutes')::integer,days,auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;

-- Preserve genuine project missingness and allow an FX-less proposal to recover.
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
    select coalesce(sum(w.minutes),0),coalesce(jsonb_agg(jsonb_build_object('taskId',w.task_id,'projectId',t.project_id,'reviewRoundId',w.review_round_id,'minutes',w.minutes) order by w.id),'[]')
      into logged,projects from public.work_log_entries w join public.tasks t on t.id=w.task_id
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
      'employed',employed,'submitted',submitted,'entries',projects));
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


create or replace function private.finance_automatic_labor_basis(p_studio uuid,p_obligation uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.finance_automatic_labor_basis_at_fx(p_studio,p_obligation,
    (select nullif(c.snapshot->'proposalFx','null'::jsonb) from public.finance_labor_calculations c
      join public.finance_obligations o on o.studio_id=c.studio_id and o.id=c.obligation_id
      where c.studio_id=p_studio and c.obligation_id=p_obligation
        and c.snapshot->'source'->>'currency'=private.finance_labor_source(p_studio,p_obligation)->>'currency'
        and (case when o.period_end>=(now() at time zone 'Europe/Kyiv')::date
          then c.status='provisional' and c.snapshot->>'asOf'=(now() at time zone 'Europe/Kyiv')::date::text
          else c.status<>'provisional' end)
      order by c.created_at desc,c.id desc limit 1));
$$;

-- Daily values use cumulative minor-unit truncation so their sum equals the
-- same whole-period proposal used at finalization, including its allocation cap.
create function private.finance_provisional_labor_values(p_basis jsonb) returns jsonb
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
        (select sum((x->>'minutes')::numeric) from jsonb_array_elements(d->'entries') x)+(d->>'absence')::numeric) as share
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

create or replace function public.process_finance_automatic_labor(p_studio_id uuid,p_obligation_id uuid,p_digest text,p_fx jsonb default null,
  p_request_id uuid default gen_random_uuid(),p_approve boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare cfg public.finance_labor_automation; o public.finance_obligations; basis jsonb; source jsonb; prior public.finance_labor_calculations;
  actor uuid; result uuid; status text:='applied'; protected boolean; pool public.finance_labor_cost_pools;
  items jsonb; digits integer; denominator numeric; payload jsonb; resolved_fx jsonb:=p_fx; approved_partial boolean; valuation record;
begin
  if p_approve then
    if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  elsif auth.role() is distinct from 'service_role' and not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  cfg:=private.finance_labor_configuration(p_studio_id);
  select * into o from public.finance_obligations where studio_id=p_studio_id and id=p_obligation_id;
  if cfg.studio_id is null or o.id is null or o.period_end<cfg.starts_on or o.period_start>(now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_input_invalid';end if;
  if p_approve and o.period_end>=(now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_input_invalid';end if;
  actor:=case when p_approve then auth.uid() else cfg.created_by end;
  perform 1 from public.studio_members where studio_id=p_studio_id and user_id=o.employee_id for share;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  payload:=jsonb_build_object('operation','automatic_labor','obligation',o.id,'digest',p_digest,'approve',p_approve);
  result:=private.begin_finance_labor_write(p_studio_id,p_request_id,payload,actor);if result is not null then return result;end if;
  basis:=private.finance_automatic_labor_basis(p_studio_id,o.id);
  if basis->>'digest' is distinct from p_digest then raise exception 'finance_version_conflict';end if;
  if p_approve and basis->>'proposedRemainder' is null then raise exception 'finance_preview_required';end if;
  -- Store a validated historical FX proposal without booking an expense in a
  -- protected/ambiguous period. Approval is bound to that exact preview digest.
  if basis->'proposalFx' is not null and basis->'proposalFx'<>'null'::jsonb then
    resolved_fx:=basis->'proposalFx';
  elsif not p_approve and basis->'source'<>'null'::jsonb and resolved_fx is not null and resolved_fx<>'null'::jsonb then
    select * into valuation from private.finance_valuation(basis->'source'->>'currency',
      (select base_currency from public.finance_settings where studio_id=p_studio_id),least(o.period_end,(now() at time zone 'Europe/Kyiv')::date),(basis->'source'->>'knownCost')::numeric,resolved_fx);
    basis:=private.finance_automatic_labor_basis_at_fx(p_studio_id,o.id,resolved_fx);
  end if;
  select * into prior from public.finance_labor_calculations where studio_id=p_studio_id and obligation_id=o.id order by created_at desc,id desc limit 1;
  if prior.id is not null and prior.digest=basis->>'digest' and (prior.status in ('applied','manual') or not p_approve and prior.status<>'exception' and (prior.status<>'provisional' or o.period_end>=(now() at time zone 'Europe/Kyiv')::date)) then
    insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,prior.id,actor,now());return prior.id;end if;
  source:=basis->'source';denominator:=(basis->>'expectedMinutes')::numeric;
  select exists(select 1 from public.finance_report_coverage c where c.studio_id=p_studio_id and c.labor_reviewed
    and o.period_end between c.month and c.reviewed_through and (c.project_id is null
      or basis->'projectIds' ? c.project_id::text or exists(select 1 from public.finance_labor_allocation_items i
        join public.finance_labor_allocation_revisions r on r.studio_id=i.studio_id and r.id=i.revision_id
        join public.finance_recognition_entries e on e.studio_id=r.studio_id and e.id=r.entry_id
        where e.studio_id=p_studio_id and e.obligation_id=o.id and i.project_id=c.project_id))) into protected;
  -- Changing activation must not rewrite an existing finalized attribution.
  protected:=protected or exists(select 1 from public.finance_labor_calculations c where c.studio_id=p_studio_id and c.obligation_id=o.id
    and c.status='applied' and coalesce(c.snapshot->>'accruedFrom',c.snapshot->>'periodStart') is distinct from basis->>'accruedFrom');
  approved_partial:=exists(select 1 from public.finance_labor_calculations c where c.studio_id=p_studio_id and c.obligation_id=o.id
    and c.status='applied' and c.initiated_by='admin' and c.snapshot->'source'->>'version'=source->>'version'
    and (select jsonb_agg(jsonb_build_object('date',d->'date','employed',d->'employed') order by d->>'date') from jsonb_array_elements(c.snapshot->'days') d)
      = (select jsonb_agg(jsonb_build_object('date',d->'date','employed',d->'employed') order by d->>'date') from jsonb_array_elements(basis->'days') d));
  if (basis->>'manual')::boolean then status:='manual';
  elsif o.period_end>=(now() at time zone 'Europe/Kyiv')::date then
    if jsonb_array_length(basis->'pools')>0 or protected then status:='pending_review';
    elsif basis->'issues' ? 'source_unavailable' or basis->'issues' ? 'partial_employment' or basis->'issues' ? 'missing_capacity' then status:='exception';
    else status:='provisional';end if;
  elsif private.finance_labor_known_zero(basis) then status:='applied';
  elsif protected and not p_approve then status:='pending_review';
  elsif basis->'issues' ? 'source_unavailable'
    or (basis->'issues' ? 'partial_employment' and not p_approve and not approved_partial)
    or (basis->'issues' ? 'payroll_correction' and not p_approve) then status:='exception';
  else
    if (source->>'remainingCost')::numeric<0 then
      -- Admin-approved payroll reconciliation uses existing exact cancellation
      -- semantics, preserving the original FX and all attribution revisions.
      for pool in select * from public.finance_labor_cost_pools where studio_id=p_studio_id and obligation_id=o.id and available_native_amount>0 order by id loop
        perform private.save_finance_labor_allocation_core(p_studio_id,gen_random_uuid(),pool.id,
          jsonb_build_object('revision',pool.allocation_revision,'items','[]'::jsonb,'reason','Approved payroll correction'),actor,'automatic_work_tracking');
        perform public.adjust_finance_recognition(p_studio_id,gen_random_uuid(),pool.id,jsonb_build_object('operation','cancel','reason','Approved payroll correction'));
      end loop;
      source:=private.finance_labor_source(p_studio_id,o.id);
    end if;
    if (source->>'remainingCost')::numeric>0 then
      perform private.record_finance_labor_cost_core(p_studio_id,gen_random_uuid(),
        jsonb_build_object('obligationId',o.id,'version',source->>'version','reason','Automatic closed-period payroll recognition','fx',resolved_fx),actor);
    end if;
    for pool in select * from public.finance_labor_cost_pools where studio_id=p_studio_id and obligation_id=o.id order by id loop
      if basis->'issues' ? 'missing_capacity' then status:='exception';continue;end if;
      if pool.available_reporting_amount is null and resolved_fx is not null and resolved_fx<>'null'::jsonb then
        perform private.value_finance_labor_pool(pool.id,resolved_fx);
        select * into pool from public.finance_labor_cost_pools where studio_id=p_studio_id and id=pool.id;
      end if;
      if pool.available_reporting_amount is null then status:='exception';continue;end if;
      select minor_units into digits from public.finance_currencies where code=pool.reporting_currency;
      select coalesce(jsonb_agg(jsonb_build_object('projectId',key,'amount',value::text) order by key),'[]') into items from (
        select key,trunc(pool.available_reporting_amount*(value::numeric)/nullif(denominator,0),digits) as value
        from jsonb_each_text(basis->'shares')
      ) parts where value>0;
      if pool.allocation_revision=0 or items is distinct from (
        select coalesce(jsonb_agg(jsonb_build_object('projectId',project_id,'amount',amount::text) order by project_id),'[]')
        from public.finance_current_labor_allocations where studio_id=p_studio_id and entry_id=pool.id) then
        perform private.save_finance_labor_allocation_core(p_studio_id,gen_random_uuid(),pool.id,
          jsonb_build_object('revision',pool.allocation_revision,'items',items,'reason','Automatic expected daily capacity attribution'),actor,'automatic_work_tracking');
      end if;
    end loop;
  end if;
  basis:=private.finance_automatic_labor_basis_at_fx(p_studio_id,o.id,resolved_fx);
  if status='provisional' then basis:=basis||private.finance_provisional_labor_values(basis);end if;
  insert into public.finance_labor_calculations(studio_id,obligation_id,digest,status,snapshot,created_by,initiated_by)
  values(p_studio_id,o.id,basis->>'digest',status,basis,actor,case when p_approve then 'admin' else 'automatic' end) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,actor,now());return result;
end $$;



create or replace function public.prepare_finance_automatic_labor(p_studio_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.finance_labor_automation; schedule record; o record; basis jsonb; prior public.finance_labor_calculations; current_capacity integer; result jsonb:='[]';
begin
  if auth.role() is distinct from 'service_role' and (p_studio_id is null or not private.is_finance_admin(p_studio_id)) then raise exception 'finance_admin_required';end if;
  for cfg in select c.* from public.finance_labor_automation a cross join lateral private.finance_labor_configuration(a.studio_id) c
    where (p_studio_id is null or c.studio_id=p_studio_id) and c.starts_on<=(now() at time zone 'Europe/Kyiv')::date order by c.studio_id loop
    -- Match the membership-first lock order of payroll maintenance/removal.
    perform 1 from public.studio_members where studio_id=cfg.studio_id order by user_id for share;
    perform 1 from public.finance_settings where studio_id=cfg.studio_id for update;
    select c.daily_minutes into current_capacity from public.finance_labor_capacity_revisions c
      where c.studio_id=cfg.studio_id and c.employee_id is null and c.effective_from<=(now() at time zone 'Europe/Kyiv')::date
      order by c.effective_from desc,c.created_at desc,c.id desc limit 1;
    if current_capacity is not null then
      update public.studios set standard_workday_minutes=current_capacity where id=cfg.studio_id and standard_workday_minutes is distinct from current_capacity;
    end if;
    for schedule in select id from public.finance_schedules where studio_id=cfg.studio_id and kind='payroll' order by id loop
      perform private.reconcile_finance_schedule_occurrences(cfg.studio_id,schedule.id,date_trunc('month',cfg.starts_on)::date,
        (date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '11 months')::date,cfg.created_by);
    end loop;
    for o in select id from public.finance_obligations where studio_id=cfg.studio_id and kind in ('payroll','bonus')
      and period_end>=cfg.starts_on and period_start<=(now() at time zone 'Europe/Kyiv')::date order by period_start,id loop
      basis:=private.finance_automatic_labor_basis(cfg.studio_id,o.id);
      select * into prior from public.finance_labor_calculations where studio_id=cfg.studio_id and obligation_id=o.id order by created_at desc,id desc limit 1;
      if prior.id is not null and prior.digest=basis->>'digest' and not (prior.status='provisional' and (basis->>'periodEnd')::date<(now() at time zone 'Europe/Kyiv')::date) and not (basis->'issues' ? 'fx_required') and (basis->>'proposedRemainder' is not null or not coalesce((basis->'source'->>'sourceReady')::boolean,false)) then continue;end if;
      result:=result||jsonb_build_array(jsonb_build_object('studioId',cfg.studio_id,'obligationId',o.id,'digest',basis->>'digest',
        'currency',basis->'source'->>'currency','reportingCurrency',(select base_currency from public.finance_settings where studio_id=cfg.studio_id),
        'periodEnd',basis->>'periodEnd','valuationDate',least((basis->>'periodEnd')::date,(now() at time zone 'Europe/Kyiv')::date),'fx',coalesce(nullif(basis->'proposalFx','null'::jsonb),case when (select count(distinct value->'fx') from jsonb_array_elements(basis->'pools') where value->'fx'<>'null'::jsonb)=1 then (select value->'fx' from jsonb_array_elements(basis->'pools') where value->'fx'<>'null'::jsonb limit 1) end)));
    end loop;
  end loop;
  return result;
end $$;

create or replace function public.set_standard_workday_minutes(p_studio_id uuid,p_minutes integer) returns void
language plpgsql security definer set search_path='' as $$
declare days integer[]; effective date;begin
  perform private.set_standard_workday_minutes_base(p_studio_id,p_minutes);
  select greatest(starts_on,(now() at time zone 'Europe/Kyiv')::date) into effective from private.finance_labor_configuration(p_studio_id);
  if effective is not null then
    perform 1 from public.finance_settings where studio_id=p_studio_id for update;
    select weekdays into days from public.finance_labor_capacity_revisions where studio_id=p_studio_id and employee_id is null and effective_from<=effective order by effective_from desc,created_at desc,id desc limit 1;
    if days is null then raise exception 'finance_input_invalid';end if;
    insert into public.finance_labor_capacity_revisions(studio_id,effective_from,daily_minutes,weekdays,created_by)
    values(p_studio_id,effective,p_minutes,days,auth.uid());
  end if;
end $$;

create or replace function public.get_finance_labor_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; cfg public.finance_labor_automation; periods jsonb; issues jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  result:=private.get_finance_labor_reporting_base(p_studio_id);
  cfg:=private.finance_labor_configuration(p_studio_id);
  select coalesce(jsonb_agg(basis||case when o.period_end>=(now() at time zone 'Europe/Kyiv')::date then private.finance_provisional_labor_values(basis) else '{}'::jsonb end
    ||jsonb_build_object('status',case when (basis->>'manual')::boolean then 'manual'
    when o.period_end>=(now() at time zone 'Europe/Kyiv')::date and jsonb_array_length(basis->'pools')=0 then 'provisional'
    when c.digest=basis->>'digest' and c.status<>'provisional' then c.status else 'pending' end) order by o.period_start,o.employee_name,o.id),'[]') into periods
  from public.finance_obligations o cross join lateral (select private.finance_automatic_labor_basis(o.studio_id,o.id) as basis) b
  left join lateral (select * from public.finance_labor_calculations where studio_id=o.studio_id and obligation_id=o.id order by created_at desc,id desc limit 1) c on true
  where o.studio_id=p_studio_id and o.kind in ('payroll','bonus') and o.period_end>=cfg.starts_on and o.period_start<=(now() at time zone 'Europe/Kyiv')::date;
  -- Each warning carries its owning project. Studio-wide missingness never
  -- contaminates another employee's unrelated project result.
  with automatic as (
    select p from jsonb_array_elements(periods) p where not (p->>'manual')::boolean
  ), scoped as (
    select p,j.value as project_id,'missing_reports'::text as kind from automatic cross join lateral jsonb_array_elements_text(p->'missingProjectIds') j
    union all select p,j.value,k.value from automatic cross join lateral jsonb_array_elements_text(p->'projectIds') j
      cross join lateral jsonb_array_elements_text(p->'issues') k where k.value<>'outside_schedule'
    union all select p,j.value,'payroll_source' from automatic cross join lateral jsonb_array_elements_text(p->'projectIds') j
      where (p->'source'->>'remainingCost')::numeric<>0 and p->>'status'<>'provisional'
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
      union select t.project_id from public.work_log_entries w join public.tasks t on t.id=w.task_id
        where w.studio_id=p_studio_id and w.user_id=(s->>'employeeId')::uuid
          and w.work_date between (s->>'periodStart')::date and (s->>'periodEnd')::date
    ) projects where not exists(select 1 from automatic where p->>'obligationId'=s->>'obligationId')
  ), all_issues as (
    select jsonb_build_object('projectId',project_id,'employeeId',p->>'employeeId','periodStart',p->>'accruedFrom','periodEnd',p->>'asOf','kind',kind) as issue from scoped where not (private.finance_labor_known_zero(p) and kind in ('missing_reports','missing_capacity','outside_schedule','pending_review'))
    union select jsonb_build_object('projectId',project_id,'employeeId',s->>'employeeId','periodStart',s->>'periodStart','periodEnd',s->>'periodEnd','kind','payroll_source') from legacy
    union select jsonb_build_object('projectId',t.project_id,'employeeId',w.user_id,'periodStart',date_trunc('month',w.work_date)::date,
      'periodEnd',(date_trunc('month',w.work_date)+interval '1 month - 1 day')::date,'kind','missing_payroll')
      from public.work_log_entries w join public.tasks t on t.id=w.task_id where w.studio_id=p_studio_id and w.work_date>=cfg.starts_on
      and not exists(select 1 from public.finance_obligations o where o.studio_id=w.studio_id and o.employee_id=w.user_id and o.kind='payroll' and w.work_date between o.period_start and o.period_end)
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

notify pgrst,'reload schema';
