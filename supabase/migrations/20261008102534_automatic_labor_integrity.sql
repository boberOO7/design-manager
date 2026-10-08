-- Append corrections to the locally applied rollout; preserve recognition and allocation history.
-- Deleting work-bearing tasks/review rounds must not erase recorded labor evidence.
alter table public.work_log_entries drop constraint work_log_entries_task_id_fkey;
alter table public.work_log_entries add constraint work_log_entries_task_id_fkey foreign key(task_id) references public.tasks(id) on delete restrict;
alter table public.work_log_entries drop constraint work_log_entries_review_round_id_task_id_fkey;
alter table public.work_log_entries add constraint work_log_entries_review_round_id_task_id_fkey foreign key(review_round_id,task_id) references public.task_review_rounds(id,task_id) on delete restrict;

-- The rollout begins in a future month. Capture membership transitions from now
-- so a later restore cannot turn a removal interval into missing work reports.
create table private.finance_labor_membership_events (
  id bigint generated always as identity primary key,
  studio_id uuid not null,employee_id uuid not null,
  joined_on date,removed_on date,is_active boolean not null,
  changed_at timestamptz not null default clock_timestamp(),baseline boolean not null default false,
  foreign key(studio_id,employee_id) references public.studio_members(studio_id,user_id)
);
create index finance_labor_membership_event_lookup on private.finance_labor_membership_events(studio_id,employee_id,changed_at desc,id desc);
revoke all on private.finance_labor_membership_events from public,anon,authenticated,service_role;
insert into private.finance_labor_membership_events(studio_id,employee_id,joined_on,removed_on,is_active,baseline)
select studio_id,user_id,(joined_at at time zone 'Europe/Kyiv')::date,(removed_at at time zone 'Europe/Kyiv')::date,is_active,true from public.studio_members;
create trigger immutable_history before update or delete on private.finance_labor_membership_events
for each row execute function private.reject_finance_history_change();
create function private.snapshot_finance_labor_membership() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or row(new.joined_at,new.removed_at,new.is_active) is distinct from row(old.joined_at,old.removed_at,old.is_active) then
    insert into private.finance_labor_membership_events(studio_id,employee_id,joined_on,removed_on,is_active,baseline)
    values(new.studio_id,new.user_id,(new.joined_at at time zone 'Europe/Kyiv')::date,(new.removed_at at time zone 'Europe/Kyiv')::date,new.is_active,tg_op='INSERT');
  end if;return new;
end $$;
create trigger snapshot_finance_labor_membership after insert or update of joined_at,removed_at,is_active on public.studio_members
for each row execute function private.snapshot_finance_labor_membership();
create function private.finance_labor_employed_on_day(p_studio uuid,p_employee uuid,p_day date) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select e.joined_on<=p_day and
      case when e.baseline then e.removed_on is null or p_day<e.removed_on else e.is_active end
    from private.finance_labor_membership_events e where e.studio_id=p_studio and e.employee_id=p_employee
      and (e.baseline or (e.changed_at at time zone 'Europe/Kyiv')::date<=p_day)
    order by e.baseline asc,e.changed_at desc,e.id desc limit 1),false);
$$;
revoke all on function private.snapshot_finance_labor_membership(),private.finance_labor_employed_on_day(uuid,uuid,date) from public,anon,authenticated,service_role;

create or replace function private.finance_employee_projects_on_day(p_studio uuid,p_employee uuid,p_day date) returns setof uuid
language sql stable security definer set search_path='' as $$
  with candidates as (
    select pm.project_id from public.project_members pm join public.projects p on p.id=pm.project_id where p.studio_id=p_studio and pm.user_id=p_employee
    union select a.project_id from public.project_activity a where a.studio_id=p_studio and a.entity_type='project_member' and a.changes->>'member_id'=p_employee::text
  )
  select c.project_id from candidates c
    left join public.project_members pm on pm.project_id=c.project_id and pm.user_id=p_employee
    left join lateral (
      select a.action_type as action,a.changes from public.project_activity a where a.studio_id=p_studio and a.project_id=c.project_id
        and a.entity_type='project_member' and a.changes->>'member_id'=p_employee::text
        and (a.action_type in ('project_member_added','project_member_removed') or a.changes ? 'is_active')
        and (a.created_at at time zone 'Europe/Kyiv')::date<=p_day order by a.created_at desc,a.id desc limit 1
    ) history on true
  where case when history.action is not null then history.action<>'project_member_removed' and coalesce((history.changes->'is_active'->>'to')::boolean,true)
    else pm.assigned_at<=p_day and (pm.removed_at is null or pm.removed_at>=p_day) end;
$$;

-- Actual Work Tracking capacity changes have their actual effective day.
-- Finance's independently scheduled future revisions do not change today's setting.
alter table public.finance_labor_capacity_revisions drop constraint finance_labor_capacity_revisions_effective_from_check;
create or replace function public.set_standard_workday_minutes(p_studio_id uuid,p_minutes integer) returns void
language plpgsql security definer set search_path='' as $$
declare days integer[]; effective date;begin
  perform private.set_standard_workday_minutes_base(p_studio_id,p_minutes);
  select greatest(starts_on,(now() at time zone 'Europe/Kyiv')::date) into effective from public.finance_labor_automation where studio_id=p_studio_id;
  if effective is not null then
    perform 1 from public.finance_settings where studio_id=p_studio_id for update;
    select weekdays into days from public.finance_labor_capacity_revisions where studio_id=p_studio_id and employee_id is null and effective_from<=effective order by effective_from desc,created_at desc,id desc limit 1;
    if days is null then raise exception 'finance_input_invalid';end if;
    insert into public.finance_labor_capacity_revisions(studio_id,effective_from,daily_minutes,weekdays,created_by)
    values(p_studio_id,effective,p_minutes,days,auth.uid());
  end if;
end $$;

create or replace function public.save_finance_labor_allocation(p_studio_id uuid,p_request_id uuid,p_entry_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare replay uuid;begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  replay:=private.begin_finance_labor_write(p_studio_id,p_request_id,jsonb_build_object('operation','labor_allocation','entry',p_entry_id,'input',p_input),auth.uid());
  if replay is not null then return replay;end if;
  if exists(select 1 from public.finance_labor_allocation_revisions r join public.finance_recognition_entries e on e.studio_id=r.studio_id and e.id=r.entry_id
    where r.studio_id=p_studio_id and e.obligation_id=(select obligation_id from public.finance_recognition_entries where studio_id=p_studio_id and id=p_entry_id) and r.method='automatic_work_tracking') then
    raise exception 'finance_automatic_labor_owned';end if;
  return private.save_finance_labor_allocation_core(p_studio_id,p_request_id,p_entry_id,p_input,auth.uid(),'manual_management');
end $$;

create or replace function private.finance_automatic_labor_basis(p_studio uuid,p_obligation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.finance_obligations; cfg public.finance_labor_automation; member public.studio_members;
  capacity public.finance_labor_capacity_revisions; source jsonb; day date; scheduled integer; absence integer;
  logged bigint; submitted boolean; employed boolean; projects jsonb; scope uuid[]:='{}'; missing_scope uuid[]:='{}'; shares jsonb:='{}';
  missing jsonb:='[]'; outside jsonb:='[]'; days jsonb:='[]'; expected bigint:=0; complete integer:=0; required integer:=0;
  result jsonb; pool_state jsonb; manual boolean; proposal numeric; proposal_items jsonb; proposal_pools numeric[]; rate numeric; digits integer; part record; share numeric; issues text[]:='{}';
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
  -- Approval previews use exactly the same per-pool minor-unit truncation as writes.
  -- Pending new recognition is another pool, never a rounded aggregate salary.
  select array_agg((p->>'available')::numeric) into proposal_pools from jsonb_array_elements(pool_state) p;
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
      union select t.project_id from public.work_log_entries w join public.tasks t on t.id=w.task_id
        where w.studio_id=p_studio_id and w.user_id=(s->>'employeeId')::uuid
          and w.work_date between (s->>'periodStart')::date and (s->>'periodEnd')::date
    ) projects where not exists(select 1 from automatic where p->>'obligationId'=s->>'obligationId')
  ), all_issues as (
    select jsonb_build_object('projectId',project_id,'employeeId',p->>'employeeId','periodStart',p->>'periodStart','periodEnd',p->>'periodEnd','kind',kind) as issue from scoped
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


create or replace function public.process_finance_automatic_labor(p_studio_id uuid,p_obligation_id uuid,p_digest text,p_fx jsonb default null,
  p_request_id uuid default gen_random_uuid(),p_approve boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare cfg public.finance_labor_automation; o public.finance_obligations; basis jsonb; source jsonb; prior public.finance_labor_calculations;
  actor uuid; result uuid; status text:='applied'; protected boolean; pool public.finance_labor_cost_pools;
  items jsonb; digits integer; denominator numeric; payload jsonb; resolved_fx jsonb:=p_fx; approved_partial boolean;
begin
  if p_approve then
    if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  elsif auth.role() is distinct from 'service_role' and not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  select * into cfg from public.finance_labor_automation where studio_id=p_studio_id;
  select * into o from public.finance_obligations where studio_id=p_studio_id and id=p_obligation_id;
  if cfg.studio_id is null or o.id is null or o.period_start<cfg.starts_on or o.period_end>=(now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_input_invalid';end if;
  actor:=case when p_approve then auth.uid() else cfg.created_by end;
  perform 1 from public.studio_members where studio_id=p_studio_id and user_id=o.employee_id for share;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  payload:=jsonb_build_object('operation','automatic_labor','obligation',o.id,'digest',p_digest,'approve',p_approve);
  result:=private.begin_finance_labor_write(p_studio_id,p_request_id,payload,actor);if result is not null then return result;end if;
  basis:=private.finance_automatic_labor_basis(p_studio_id,o.id);
  if basis->>'digest' is distinct from p_digest then raise exception 'finance_version_conflict';end if;
  select * into prior from public.finance_labor_calculations where studio_id=p_studio_id and obligation_id=o.id order by created_at desc,id desc limit 1;
  if prior.id is not null and prior.digest=p_digest and (prior.status in ('applied','manual') or not p_approve and prior.status<>'exception') then return prior.id;end if;
  source:=basis->'source';denominator:=(basis->>'expectedMinutes')::numeric;
  select exists(select 1 from public.finance_report_coverage c where c.studio_id=p_studio_id and c.labor_reviewed
    and o.period_end between c.month and c.reviewed_through and (c.project_id is null
      or basis->'projectIds' ? c.project_id::text or exists(select 1 from public.finance_labor_allocation_items i
        join public.finance_labor_allocation_revisions r on r.studio_id=i.studio_id and r.id=i.revision_id
        join public.finance_recognition_entries e on e.studio_id=r.studio_id and e.id=r.entry_id
        where e.studio_id=p_studio_id and e.obligation_id=o.id and i.project_id=c.project_id))) into protected;
  approved_partial:=exists(select 1 from public.finance_labor_calculations c where c.studio_id=p_studio_id and c.obligation_id=o.id
    and c.status='applied' and c.initiated_by='admin' and c.snapshot->'source'->>'version'=source->>'version'
    and (select jsonb_agg(jsonb_build_object('date',d->'date','employed',d->'employed') order by d->>'date') from jsonb_array_elements(c.snapshot->'days') d)
      = (select jsonb_agg(jsonb_build_object('date',d->'date','employed',d->'employed') order by d->>'date') from jsonb_array_elements(basis->'days') d));
  if (basis->>'manual')::boolean then status:='manual';
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
          jsonb_build_object('revision',pool.allocation_revision,'items','[]','reason','Approved payroll correction'),actor,'automatic_work_tracking');
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
  basis:=private.finance_automatic_labor_basis(p_studio_id,o.id);
  insert into public.finance_labor_calculations(studio_id,obligation_id,digest,status,snapshot,created_by,initiated_by)
  values(p_studio_id,o.id,basis->>'digest',status,basis,actor,case when p_approve then 'admin' else 'automatic' end) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,actor,now());return result;
end $$;

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
    if employee is not null or coalesce((p_input->>'internalDesignationConfirmed')::boolean,false) is not true then raise exception 'finance_input_invalid';end if;
    insert into public.finance_labor_automation(studio_id,starts_on,internal_project_id,created_by)
    values(p_studio_id,starts,(p_input->>'internalProjectId')::uuid,auth.uid());
  end if;
  insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
  values(p_studio_id,employee,starts,(p_input->>'dailyMinutes')::integer,days,auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;

notify pgrst,'reload schema';
