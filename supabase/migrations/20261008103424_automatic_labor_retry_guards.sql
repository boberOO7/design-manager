-- Resolve missing pool FX with the existing family rounding rule, including
-- previous partial adjustments; round(remaining_native * rate) is not equivalent.
create function private.finance_labor_pool_reporting_value(p_entry uuid,p_rate numeric) returns numeric
language sql stable security definer set search_path='' as $$
  with recursive family as (
    select id,studio_id from public.finance_recognition_entries where id=p_entry and source_kind='labor'
    union all select e.id,e.studio_id from public.finance_recognition_entries e join family f on e.studio_id=f.studio_id and e.related_entry_id=f.id
  ) select sum(coalesce(e.reporting_amount,private.finance_recognition_family_value(e.id,p_rate)))
    from family f join public.finance_recognition_entries e on e.studio_id=f.studio_id and e.id=f.id;
$$;
revoke all on function private.finance_labor_pool_reporting_value(uuid,numeric) from public,anon,authenticated,service_role;

create or replace function private.finance_automatic_labor_basis_at_fx(p_studio uuid,p_obligation uuid,p_preview_fx jsonb) returns jsonb
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
  result:=result||jsonb_build_object('proposalFx',p_preview_fx);
  select minor_units into digits from public.finance_currencies where code=(select base_currency from public.finance_settings where studio_id=p_studio);
  if source->>'currency'=(select base_currency from public.finance_settings where studio_id=p_studio) then rate:=1;
  elsif p_preview_fx is not null and p_preview_fx<>'null'::jsonb then rate:=(p_preview_fx->>'rate')::numeric;
  elsif (select count(distinct p->'fx'->>'rate') from jsonb_array_elements(pool_state) p where p->'fx'<>'null'::jsonb)=1 then
    select (p->'fx'->>'rate')::numeric into rate from jsonb_array_elements(pool_state) p where p->'fx'<>'null'::jsonb limit 1;
  end if;
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
  if p_approve and basis->>'proposedRemainder' is null then raise exception 'finance_preview_required';end if;
  -- Store a validated historical FX proposal without booking an expense in a
  -- protected/ambiguous period. Approval is bound to that exact preview digest.
  if basis->'proposalFx' is not null and basis->'proposalFx'<>'null'::jsonb then
    resolved_fx:=basis->'proposalFx';
  elsif not p_approve and basis->'source'<>'null'::jsonb and resolved_fx is not null and resolved_fx<>'null'::jsonb then
    select * into valuation from private.finance_valuation(basis->'source'->>'currency',
      (select base_currency from public.finance_settings where studio_id=p_studio_id),o.period_end,(basis->'source'->>'knownCost')::numeric,resolved_fx);
    basis:=private.finance_automatic_labor_basis_at_fx(p_studio_id,o.id,resolved_fx);
  end if;
  select * into prior from public.finance_labor_calculations where studio_id=p_studio_id and obligation_id=o.id order by created_at desc,id desc limit 1;
  if prior.id is not null and prior.digest=p_digest and (prior.status in ('applied','manual') or not p_approve and prior.status<>'exception') then
    insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,prior.id,actor,now());return prior.id;end if;
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
  basis:=private.finance_automatic_labor_basis_at_fx(p_studio_id,o.id,resolved_fx);
  insert into public.finance_labor_calculations(studio_id,obligation_id,digest,status,snapshot,created_by,initiated_by)
  values(p_studio_id,o.id,basis->>'digest',status,basis,actor,case when p_approve then 'admin' else 'automatic' end) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,actor,now());return result;
end $$;



create or replace function public.prepare_finance_automatic_labor(p_studio_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.finance_labor_automation; schedule record; o record; basis jsonb; prior public.finance_labor_calculations; current_capacity integer; result jsonb:='[]';
begin
  if auth.role() is distinct from 'service_role' and (p_studio_id is null or not private.is_finance_admin(p_studio_id)) then raise exception 'finance_admin_required';end if;
  for cfg in select * from public.finance_labor_automation where (p_studio_id is null or studio_id=p_studio_id)
    and starts_on<=(now() at time zone 'Europe/Kyiv')::date order by studio_id loop
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
      perform private.reconcile_finance_schedule_occurrences(cfg.studio_id,schedule.id,cfg.starts_on,
        (date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '11 months')::date,cfg.created_by);
    end loop;
    for o in select id from public.finance_obligations where studio_id=cfg.studio_id and kind in ('payroll','bonus')
      and period_start>=cfg.starts_on and period_end<(now() at time zone 'Europe/Kyiv')::date order by period_start,id loop
      basis:=private.finance_automatic_labor_basis(cfg.studio_id,o.id);
      select * into prior from public.finance_labor_calculations where studio_id=cfg.studio_id and obligation_id=o.id order by created_at desc,id desc limit 1;
      if prior.id is not null and prior.digest=basis->>'digest' and not (basis->'issues' ? 'fx_required') and (basis->>'proposedRemainder' is not null or not coalesce((basis->'source'->>'sourceReady')::boolean,false)) then continue;end if;
      result:=result||jsonb_build_array(jsonb_build_object('studioId',cfg.studio_id,'obligationId',o.id,'digest',basis->>'digest',
        'currency',basis->'source'->>'currency','reportingCurrency',(select base_currency from public.finance_settings where studio_id=cfg.studio_id),
        'periodEnd',basis->>'periodEnd','fx',coalesce(nullif(basis->'proposalFx','null'::jsonb),case when (select count(distinct value->'fx') from jsonb_array_elements(basis->'pools') where value->'fx'<>'null'::jsonb)=1 then (select value->'fx' from jsonb_array_elements(basis->'pools') where value->'fx'<>'null'::jsonb limit 1) end)));
    end loop;
  end loop;
  return result;
end $$;



notify pgrst,'reload schema';
