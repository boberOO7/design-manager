-- Automatic attribution reuses the recognition book and allocation revisions.
-- Capacity is confirmed explicitly: studios.standard_workday_minutes has a
-- historical default and cannot establish the actual payroll denominator.
create table public.finance_labor_automation (
  studio_id uuid primary key references public.finance_settings(studio_id),
  starts_on date not null check(starts_on=date_trunc('month',starts_on)::date),
  internal_project_id uuid not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(internal_project_id,studio_id) references public.projects(id,studio_id)
);
create table public.finance_labor_capacity_revisions (
  id uuid primary key default gen_random_uuid(), studio_id uuid not null references public.finance_settings(studio_id),
  employee_id uuid, effective_from date not null check(effective_from=date_trunc('month',effective_from)::date),
  daily_minutes integer not null check(daily_minutes>0),
  weekdays integer[] not null check(weekdays <@ array[1,2,3,4,5,6,7] and array_position(weekdays,null) is null),
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default clock_timestamp(),
  foreign key(studio_id,employee_id) references public.studio_members(studio_id,user_id)
);
create index finance_labor_capacity_lookup on public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,created_at);
create table public.finance_labor_calculations (
  id uuid primary key default gen_random_uuid(), studio_id uuid not null, obligation_id uuid not null,
  digest text not null, status text not null check(status in ('applied','pending_review','exception','manual')),
  snapshot jsonb not null, created_by uuid not null references public.profiles(id),
  initiated_by text not null check(initiated_by in ('automatic','admin')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(studio_id,obligation_id) references public.finance_obligations(studio_id,id)
);
create index finance_labor_calculation_latest on public.finance_labor_calculations(studio_id,obligation_id,created_at desc,id);
create table public.work_log_day_revisions (
  id bigint generated always as identity primary key, studio_id uuid not null references public.studios(id),
  user_id uuid not null references public.profiles(id), work_date date not null,
  entries jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create index work_log_revision_day on public.work_log_day_revisions(studio_id,user_id,work_date,id);
do $$declare name text;begin
  foreach name in array array['finance_labor_automation','finance_labor_capacity_revisions','finance_labor_calculations','work_log_day_revisions'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
    execute format('grant select on public.%I to authenticated',name);
    execute format('create policy admin_read on public.%I for select to authenticated using((select private.is_finance_admin(studio_id)))',name);
    execute format('create trigger immutable_history before update or delete on public.%I for each row execute function private.reject_finance_history_change()',name);
  end loop;
end $$;

create or replace function public.record_finance_labor_cost(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  return private.record_finance_labor_cost_core(p_studio_id,p_request_id,p_input,auth.uid());
end $$;
create or replace function public.save_finance_labor_allocation(p_studio_id uuid,p_request_id uuid,p_entry_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  if exists(select 1 from public.finance_labor_allocation_revisions where studio_id=p_studio_id and entry_id=p_entry_id and method='automatic_work_tracking') then
    raise exception 'finance_automatic_labor_owned';end if;
  return private.save_finance_labor_allocation_core(p_studio_id,p_request_id,p_entry_id,p_input,auth.uid(),'manual_management');
end $$;

create function public.prepare_finance_automatic_labor(p_studio_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.finance_labor_automation; schedule record; o record; basis jsonb; prior public.finance_labor_calculations; result jsonb:='[]';
begin
  if auth.role() is distinct from 'service_role' and (p_studio_id is null or not private.is_finance_admin(p_studio_id)) then raise exception 'finance_admin_required';end if;
  for cfg in select * from public.finance_labor_automation where (p_studio_id is null or studio_id=p_studio_id)
    and starts_on<=(now() at time zone 'Europe/Kyiv')::date order by studio_id loop
    -- Match the membership-first lock order of payroll maintenance/removal.
    perform 1 from public.studio_members where studio_id=cfg.studio_id order by user_id for share;
    perform 1 from public.finance_settings where studio_id=cfg.studio_id for update;
    for schedule in select id from public.finance_schedules where studio_id=cfg.studio_id and kind='payroll' order by id loop
      perform private.reconcile_finance_schedule_occurrences(cfg.studio_id,schedule.id,cfg.starts_on,
        (date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '11 months')::date,cfg.created_by);
    end loop;
    for o in select id from public.finance_obligations where studio_id=cfg.studio_id and kind in ('payroll','bonus')
      and period_start>=cfg.starts_on and period_end<(now() at time zone 'Europe/Kyiv')::date order by period_start,id loop
      basis:=private.finance_automatic_labor_basis(cfg.studio_id,o.id);
      select * into prior from public.finance_labor_calculations where studio_id=cfg.studio_id and obligation_id=o.id order by created_at desc,id desc limit 1;
      if prior.id is not null and prior.digest=basis->>'digest' and not (basis->'issues' ? 'fx_required') then continue;end if;
      result:=result||jsonb_build_array(jsonb_build_object('studioId',cfg.studio_id,'obligationId',o.id,'digest',basis->>'digest',
        'currency',basis->'source'->>'currency','reportingCurrency',(select base_currency from public.finance_settings where studio_id=cfg.studio_id),
        'periodEnd',basis->>'periodEnd','fx',(select value->'fx' from jsonb_array_elements(basis->'pools') where value->'fx'<>'null'::jsonb limit 1)));
    end loop;
  end loop;
  return result;
end $$;

create function public.process_finance_automatic_labor(p_studio_id uuid,p_obligation_id uuid,p_digest text,p_fx jsonb default null,
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
  payload:=jsonb_build_object('operation','automatic_labor','obligation',o.id,'digest',p_digest,'fx',p_fx,'approve',p_approve);
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
  approved_partial:=exists(select 1 from public.finance_labor_calculations where studio_id=p_studio_id and obligation_id=o.id
    and status='applied' and initiated_by='admin');
  if (basis->>'manual')::boolean then status:='manual';
  elsif protected and not p_approve then status:='pending_review';
  elsif basis->'issues' ? 'source_unavailable'
    or (basis->'issues' ? 'partial_employment' and not p_approve and not approved_partial)
    or (basis->'issues' ? 'payroll_correction' and not p_approve) then status:='exception';
  else
    if (source->>'remainingCost')::numeric<0 then
      -- Admin-approved payroll reconciliation uses existing exact cancellation
      -- semantics, preserving the original FX and all attribution revisions.
      for pool in select * from public.finance_labor_cost_pools where studio_id=p_studio_id and obligation_id=o.id order by id loop
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
create policy own_work_revision_read on public.work_log_day_revisions for select to authenticated
using(user_id=(select auth.uid()) and (select private.is_studio_member(studio_id)));

create function private.snapshot_work_log_day() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.work_log_day_revisions(studio_id,user_id,work_date,entries)
  select new.studio_id,new.user_id,new.work_date,coalesce(jsonb_agg(jsonb_build_object(
    'taskId',w.task_id,'projectId',t.project_id,'reviewRoundId',w.review_round_id,'activityKind',w.activity_kind,'minutes',w.minutes) order by w.id),'[]')
  from public.work_log_entries w join public.tasks t on t.id=w.task_id
  where w.studio_id=new.studio_id and w.user_id=new.user_id and w.work_date=new.work_date;
  return new;
end $$;
create trigger work_log_submission_snapshot after insert or update on public.work_log_days
for each row execute function private.snapshot_work_log_day();

alter table public.finance_labor_allocation_revisions drop constraint finance_labor_allocation_revisions_method_check;
alter table public.finance_labor_allocation_revisions add constraint finance_labor_allocation_revisions_method_check
check(method in ('manual_management','automatic_work_tracking'));

create function public.configure_finance_labor_automation(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
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
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;

-- Membership is evidence of potentially affected work, never evidence of hours.
-- Activity restores prior episodes when the current membership was reactivated.
create function private.finance_employee_projects_on_day(p_studio uuid,p_employee uuid,p_day date) returns setof uuid
language sql stable security definer set search_path='' as $$
  select pm.project_id from public.project_members pm join public.projects p on p.id=pm.project_id
  left join lateral (
    select a.action_type as action,a.changes from public.project_activity a where a.studio_id=p_studio and a.project_id=pm.project_id
      and a.entity_type='project_member' and a.changes->>'member_id'=p_employee::text
      and (a.action_type in ('project_member_added','project_member_removed') or a.changes ? 'is_active')
      and (a.created_at at time zone 'Europe/Kyiv')::date<=p_day order by a.created_at desc,a.id desc limit 1
  ) history on true
  where p.studio_id=p_studio and pm.user_id=p_employee and pm.assigned_at<=p_day
    and case when history.action is not null then history.action<>'project_member_removed'
      and coalesce((history.changes->'is_active'->>'to')::boolean,true)
      else pm.removed_at is null or pm.removed_at>=p_day end;
$$;

create function private.finance_automatic_labor_basis(p_studio uuid,p_obligation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.finance_obligations; cfg public.finance_labor_automation; member public.studio_members;
  capacity public.finance_labor_capacity_revisions; source jsonb; day date; scheduled integer; absence integer;
  logged bigint; submitted boolean; employed boolean; projects jsonb; scope uuid[]:='{}'; missing_scope uuid[]:='{}'; shares jsonb:='{}';
  missing jsonb:='[]'; outside jsonb:='[]'; days jsonb:='[]'; expected bigint:=0; complete integer:=0; required integer:=0;
  result jsonb; pool_state jsonb; manual boolean; part record; share numeric; issues text[]:='{}';
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
  return result||jsonb_build_object('digest',md5(result::text));
end $$;

-- Shared writers retain the original source/version/valuation/cap checks.
-- Only the admin wrappers or the source-owned automation operation can call them.
create function private.begin_finance_labor_write(p_studio uuid,p_request uuid,p_payload jsonb,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior public.finance_planning_requests;
begin
  perform 1 from public.finance_settings where studio_id=p_studio for update;
  if not found or p_request is null or p_actor is null then raise exception 'finance_input_invalid';end if;
  select * into prior from public.finance_planning_requests where studio_id=p_studio and request_id=p_request;
  if found then if prior.payload is distinct from p_payload then raise exception 'finance_request_conflict';end if;return prior.result_id;end if;
  return null;
end $$;
create function private.record_finance_labor_cost_core(p_studio_id uuid,p_request_id uuid,p_input jsonb,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','labor_recognition','input',p_input);result uuid; source jsonb;
  obligation uuid:=(p_input->>'obligationId')::uuid; value numeric; day date; start_date date; cat uuid; valuation record;
  snapshot jsonb; rate numeric; rate_source text; rate_date date; reporting_value numeric;
begin
  result:=private.begin_finance_labor_write(p_studio_id,p_request_id,payload,p_actor); if result is not null then return result; end if;
  source:=private.finance_labor_source(p_studio_id,obligation);
  select recognition_start_month into start_date from public.finance_settings where studio_id=p_studio_id;
  if source is null or start_date is null or (source->>'periodStart')::date<start_date or not (source->>'canConfirm')::boolean
    or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000 then raise exception 'finance_input_invalid'; end if;
  if source->>'version' is distinct from p_input->>'version' then raise exception 'finance_version_conflict'; end if;
  value:=(source->>'remainingCost')::numeric;day:=(source->>'periodEnd')::date;
  if value<=0 then raise exception 'finance_labor_no_remaining_cost'; end if;
  select id into cat from public.finance_categories where studio_id=p_studio_id and default_key=case when source->>'kind'='bonus' then 'employee_bonus' else 'salary' end;
  snapshot:=source->'snapshot'||jsonb_build_object('recognitionDate',day);
  if source->>'currency'=(select base_currency from public.finance_settings where studio_id=p_studio_id) or p_input->'fx' is not null and p_input->'fx'<>'null'::jsonb then
    select * into valuation from private.finance_valuation(source->>'currency',(select base_currency from public.finance_settings where studio_id=p_studio_id),day,value,p_input->'fx');
    rate:=valuation.rate;rate_source:=valuation.source;rate_date:=valuation.effective_date;reporting_value:=valuation.reporting_amount;
  end if;
  insert into public.finance_recognition_entries(studio_id,classification,source_kind,obligation_id,employee_id,category_id,source_snapshot,
    period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,reason,created_by)
  values(p_studio_id,'labor','labor',obligation,(source->>'employeeId')::uuid,cat,snapshot,(source->>'periodStart')::date,day,day,
    source->>'label',source->>'currency',value,0,value,(select base_currency from public.finance_settings where studio_id=p_studio_id),
    reporting_value,rate,rate_source,rate_date,btrim(p_input->>'reason'),p_actor) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,p_actor,now());return result;
end $$;

create function private.save_finance_labor_allocation_core(p_studio_id uuid,p_request_id uuid,p_entry_id uuid,p_input jsonb,p_actor uuid,p_method text) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','labor_allocation','entry',p_entry_id,'input',p_input)||case when p_method='manual_management' then '{}'::jsonb else jsonb_build_object('method',p_method) end;result uuid;
  pool public.finance_labor_cost_pools; part jsonb; total numeric:=0; part_value numeric; digits integer; target uuid;
begin
  result:=private.begin_finance_labor_write(p_studio_id,p_request_id,payload,p_actor); if result is not null then return result; end if;
  select * into pool from public.finance_labor_cost_pools where studio_id=p_studio_id and id=p_entry_id;
  if not found or jsonb_typeof(p_input->'items') is distinct from 'array'
    or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000 then raise exception 'finance_input_invalid'; end if;
  if pool.available_reporting_amount is null and jsonb_array_length(p_input->'items')>0 then raise exception 'finance_fx_required';end if;
  if pool.allocation_revision is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  select minor_units into digits from public.finance_currencies where code=pool.reporting_currency;
  if (select count(*) from jsonb_array_elements(p_input->'items'))<>(select count(distinct value->>'projectId') from jsonb_array_elements(p_input->'items')) then raise exception 'finance_input_invalid'; end if;
  for part in select value from jsonb_array_elements(p_input->'items') loop
    part_value:=(part->>'amount')::numeric;target:=(part->>'projectId')::uuid;
    if part_value is null or part_value<=0 or part_value<>round(part_value,digits) or target is null or not exists(select 1 from public.projects where studio_id=p_studio_id and id=target)
      then raise exception 'finance_input_invalid'; end if;
    total:=total+part_value;
  end loop;
  if total>coalesce(pool.available_reporting_amount,0) then raise exception 'finance_labor_overallocated'; end if;
  insert into public.finance_labor_allocation_revisions(studio_id,entry_id,revision,reason,created_by,method)
    values(p_studio_id,p_entry_id,pool.allocation_revision+1,btrim(p_input->>'reason'),p_actor,p_method) returning id into result;
  insert into public.finance_labor_allocation_items(studio_id,revision_id,project_id,amount)
    select p_studio_id,result,(v->>'projectId')::uuid,(v->>'amount')::numeric from jsonb_array_elements(p_input->'items') v;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,p_actor,now());return result;
end $$;

create function private.value_finance_labor_pool(p_entry_id uuid,p_fx jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare entry public.finance_recognition_entries; valuation record; p_studio_id uuid;
begin
  select studio_id into p_studio_id from public.finance_recognition_entries where id=p_entry_id and source_kind='labor';
  if p_studio_id is null then raise exception 'finance_input_invalid';end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  select * into entry from public.finance_recognition_entries where studio_id=p_studio_id and id=p_entry_id and kind='recognition';
  if not found then raise exception 'finance_input_invalid'; end if;
  select * into valuation from private.finance_valuation(entry.currency,entry.reporting_currency,entry.recognized_on,entry.amount,p_fx);
  if entry.reporting_amount is not null then
    if row(entry.fx_rate,entry.fx_source,entry.fx_effective_date) is not distinct from row(valuation.rate,valuation.source,valuation.effective_date) then return; end if;
    raise exception 'finance_valuation_locked';
  end if;
  with recursive family as (
    select id from public.finance_recognition_entries where studio_id=p_studio_id and id=entry.id
    union all select e.id from public.finance_recognition_entries e join family f on e.related_entry_id=f.id where e.studio_id=p_studio_id
  )
  update public.finance_recognition_entries e set reporting_amount=private.finance_recognition_family_value(e.id,valuation.rate),
    fx_rate=valuation.rate,fx_source=valuation.source,fx_effective_date=valuation.effective_date
  from family f where e.studio_id=p_studio_id and e.id=f.id and e.reporting_amount is null;
end $$;

alter function public.get_finance_labor_reporting(uuid) rename to get_finance_labor_reporting_base;
alter function public.get_finance_labor_reporting_base(uuid) set schema private;
create function public.get_finance_labor_reporting(p_studio_id uuid) returns jsonb
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
      or (s->>'basis'='net' and s->>'deductionsStatus'<>'fixed') or s->>'employerStatus'<>'fixed'
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
  ) select coalesce(jsonb_agg(distinct issue) filter(where issue->>'projectId' is distinct from cfg.internal_project_id::text),'[]') into issues from all_issues;
  return result||jsonb_build_object('automation',case when cfg.studio_id is null then null else jsonb_build_object('startsOn',cfg.starts_on,'internalProjectId',cfg.internal_project_id) end,
    'capacity',coalesce((select jsonb_agg(to_jsonb(c) order by c.effective_from,c.created_at,c.id) from public.finance_labor_capacity_revisions c where c.studio_id=p_studio_id),'[]'),
    'automaticPeriods',periods,'projectIssues',issues);
end $$;

-- No worker entry point is available to employees, and private helpers have no
-- execution grant. The employee save can record work, never financial amounts.
revoke all on function public.configure_finance_labor_automation(uuid,uuid,jsonb),public.prepare_finance_automatic_labor(uuid),
  public.process_finance_automatic_labor(uuid,uuid,text,jsonb,uuid,boolean),public.get_finance_labor_reporting(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.configure_finance_labor_automation(uuid,uuid,jsonb),public.get_finance_labor_reporting(uuid) to authenticated;
grant execute on function public.prepare_finance_automatic_labor(uuid),public.process_finance_automatic_labor(uuid,uuid,text,jsonb,uuid,boolean) to authenticated,service_role;
revoke all on function private.snapshot_work_log_day(),private.finance_employee_projects_on_day(uuid,uuid,date),
  private.finance_automatic_labor_basis(uuid,uuid),private.begin_finance_labor_write(uuid,uuid,jsonb,uuid),
  private.record_finance_labor_cost_core(uuid,uuid,jsonb,uuid),private.save_finance_labor_allocation_core(uuid,uuid,uuid,jsonb,uuid,text),
  private.value_finance_labor_pool(uuid,jsonb),private.get_finance_labor_reporting_base(uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
