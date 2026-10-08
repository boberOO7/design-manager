-- Approved payroll reductions clear prior shares using an actual JSON array.
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
  if prior.id is not null and prior.digest=basis->>'digest' and (prior.status in ('applied','manual') or not p_approve and prior.status<>'exception') then
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
  insert into public.finance_labor_calculations(studio_id,obligation_id,digest,status,snapshot,created_by,initiated_by)
  values(p_studio_id,o.id,basis->>'digest',status,basis,actor,case when p_approve then 'admin' else 'automatic' end) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,actor,now());return result;
end $$;






notify pgrst,'reload schema';
