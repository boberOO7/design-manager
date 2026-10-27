-- Service evidence is confirmed once at its recurring source. No data backfill.
create function private.configure_finance_schedule_expense(p_studio uuid,p_schedule uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.finance_schedule_terms; cat public.finance_categories; prior public.finance_expense_service_policies;
  first_month date; start_date date; effective date; boundary date; result uuid; project uuid:=nullif(p_input->>'projectId','')::uuid;
  today date:=(now() at time zone 'Europe/Kyiv')::date;
begin
  if not private.is_finance_admin(p_studio) then raise exception 'finance_admin_required';end if;
  select recognition_start_month into boundary from public.finance_settings where studio_id=p_studio and finalized_at is not null for update;
  if boundary is null then raise exception 'finance_recognition_inactive';end if;
  select terms.* into t from public.finance_schedule_terms terms join public.finance_schedules s on s.studio_id=terms.studio_id and s.id=terms.schedule_id
    where terms.studio_id=p_studio and terms.schedule_id=p_schedule and s.kind='recurring' order by terms.revision desc limit 1;
  if t.id is null or t.revision is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict';end if;
  select * into cat from public.finance_categories where studio_id=p_studio and id=t.category_id;
  if coalesce((p_input->>'confirmed')::boolean,false) is not true or cat.nature<>'operating'
    or cat.default_key in ('salary','employee_bonus') then raise exception 'finance_input_invalid';end if;
  if exists(select 1 from public.finance_obligations o join public.finance_obligation_items i on i.studio_id=o.studio_id and i.obligation_id=o.id
    where o.studio_id=p_studio and o.terms_id=t.id and (private.finance_labor_cash_expected(p_studio,i.expected_item_id)
      or exists(select 1 from public.finance_trip_entries e where e.studio_id=p_studio and e.expected_item_id=i.expected_item_id)
      or exists(select 1 from public.finance_trip_balances b where b.studio_id=p_studio and b.expected_item_id=i.expected_item_id))) then raise exception 'finance_expense_source_owned';end if;
  select * into prior from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=p_schedule order by first_period desc,revision desc limit 1;
  -- Ordinary amount/currency/payment revisions keep the existing service anchor and attribution.
  if prior.id is not null and prior.service_months=t.interval_months then return prior.id;end if;
  first_month:=t.effective_from;
  if prior.id is null and not exists(select 1 from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule and interval_months<>t.interval_months) then
    select min(effective_from) into first_month from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule;
  end if;
  start_date:=nullif(p_input->>'serviceStart','')::date;
  if t.interval_months=1 then
    if start_date is not null and (start_date<first_month or start_date>=(first_month+interval '1 month')::date) then raise exception 'finance_input_invalid';end if;
    -- A partial initial month reduces eligible days; it must not shift every later month.
    effective:=greatest(boundary,today,coalesce(start_date,first_month));
    start_date:=first_month;
  else
    if start_date is null then raise exception 'finance_expense_service_period_required';end if;
    effective:=greatest(boundary,today,start_date);
  end if;
  if project is not null and (not cat.project_expense_enabled or not exists(select 1 from public.projects where studio_id=p_studio and id=project)) then raise exception 'finance_project_invalid';end if;
  if exists(select 1 from public.finance_recognition_entries r join public.finance_obligation_items i on i.studio_id=r.studio_id
    and i.expected_item_id=private.finance_recognition_expected_root(r.studio_id,r.expected_item_id)
    join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
    where r.studio_id=p_studio and o.schedule_id=p_schedule and o.period_start>=first_month) then raise exception 'finance_expense_history_protected';end if;
  insert into public.finance_expense_service_policies(studio_id,schedule_id,revision,first_period,service_start,service_months,effective_from,policy,project_id,created_by)
    select p_studio,p_schedule,coalesce(max(revision),0)+1,first_month,start_date,t.interval_months,effective,'service_days',project,auth.uid()
    from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=p_schedule returning id into result;
  return result;
end $$;
revoke all on function private.configure_finance_schedule_expense(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

alter function public.save_finance_recurring_schedule(uuid,uuid,jsonb) rename to save_finance_recurring_schedule_before_expense;
alter function public.save_finance_recurring_schedule_before_expense(uuid,uuid,jsonb) set schema private;
revoke all on function private.save_finance_recurring_schedule_before_expense(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.save_finance_recurring_schedule(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; replay boolean;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  replay:=exists(select 1 from public.finance_planning_requests where studio_id=p_studio_id and request_id=p_request_id);
  result:=private.save_finance_recurring_schedule_before_expense(p_studio_id,p_request_id,p_input);
  if not replay and p_input->'expenseService'->>'confirmed'='true' then
    perform private.configure_finance_schedule_expense(p_studio_id,result,(p_input->'expenseService')||jsonb_build_object('revision',
      (select max(revision) from public.finance_schedule_terms where studio_id=p_studio_id and schedule_id=result)));
  end if;
  return result;
end $$;
revoke all on function public.save_finance_recurring_schedule(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_recurring_schedule(uuid,uuid,jsonb) to authenticated;

-- Preserve the Phase 3 API for legacy policy edits; the integrated editor submits only missing evidence.
alter function public.save_finance_expense_service_policy(uuid,uuid,jsonb) rename to save_finance_expense_service_policy_before_source;
alter function public.save_finance_expense_service_policy_before_source(uuid,uuid,jsonb) set schema private;
revoke all on function private.save_finance_expense_service_policy_before_source(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.save_finance_expense_service_policy(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; payload jsonb:=jsonb_build_object('operation','schedule_expense_service','input',p_input);
begin
  if p_input->>'mode' is distinct from 'schedule' then
    return private.save_finance_expense_service_policy_before_source(p_studio_id,p_request_id,p_input);
  end if;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  result:=private.configure_finance_schedule_expense(p_studio_id,(p_input->>'scheduleId')::uuid,p_input);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;
revoke all on function public.save_finance_expense_service_policy(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_expense_service_policy(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
