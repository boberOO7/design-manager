-- A term becomes historical only after a finalized or paid payroll occurrence uses it.
-- The RPC may discard the unused suffix after moving its unprotected projections.
create or replace function private.guard_finance_payroll_term_edit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('studioflow.finance_payroll_draft_edit',true)='on'
    and exists(select 1 from public.finance_schedules s where s.studio_id=old.studio_id
      and s.id=old.schedule_id and s.kind='payroll' and s.stopped_from is null)
    and old.id=(select t.id from public.finance_schedule_terms t
      where t.studio_id=old.studio_id and t.schedule_id=old.schedule_id order by t.revision desc limit 1)
    and not private.finance_payroll_term_consumed(old.studio_id,old.id)
  then
    if tg_op='DELETE' and not exists(select 1 from public.finance_obligations o
      where o.studio_id=old.studio_id and o.terms_id=old.id) then return old; end if;
    if tg_op='UPDATE' and row(new.id,new.studio_id,new.schedule_id,new.revision,new.created_by,new.created_at)
      is not distinct from row(old.id,old.studio_id,old.schedule_id,old.revision,old.created_by,old.created_at)
    then return new; end if;
  end if;
  raise exception 'finance_history_immutable';
end $$;

-- Reconcile every persisted unpaid occurrence, including manually generated future periods.
CREATE OR REPLACE FUNCTION public.save_finance_schedule(p_studio_id uuid, p_request_id uuid, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb:=jsonb_build_object('operation','schedule','input',p_input); result uuid;
  schedule public.finance_schedules; prior public.finance_schedule_terms; anchor public.finance_schedule_terms; category public.finance_categories;
  employee uuid:=nullif(p_input->>'employeeId','')::uuid; starts date:=(p_input->>'effectiveFrom')::date; digits integer; value numeric;
  first_day date:=date_trunc('month',now() at time zone 'Europe/Kyiv')::date;
  editable boolean:=false; old_from date; previous_edit text:=current_setting('studioflow.finance_payroll_draft_edit',true);
  previous_reconcile text:=current_setting('studioflow.finance_occurrence_reconcile',true);
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if employee is not null then perform 1 from public.studio_members where studio_id=p_studio_id and user_id=employee for share; end if;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null) then raise exception 'finance_finalized_setup_required'; end if;
  select * into schedule from public.finance_schedules where studio_id=p_studio_id and id=nullif(p_input->>'id','')::uuid;
  if schedule.id is null then
    if nullif(p_input->>'id','') is not null then raise exception 'finance_schedule_invalid'; end if;
    if employee is not null and (not exists(select 1 from public.studio_members m join public.profiles p on p.id=m.user_id where m.studio_id=p_studio_id and m.user_id=employee and m.is_active and p.is_active)
      or exists(select 1 from public.finance_schedules s where s.studio_id=p_studio_id and s.employee_id=employee and (s.stopped_from is null or (starts<s.stopped_from and exists(select 1 from public.finance_schedule_terms t where t.studio_id=s.studio_id and t.schedule_id=s.id and t.effective_from<s.stopped_from))))) then raise exception 'finance_employee_invalid'; end if;
    insert into public.finance_schedules(studio_id,kind,employee_id,created_by)
      values(p_studio_id,p_input->>'kind',employee,auth.uid()) returning * into schedule;
  elsif schedule.kind is distinct from p_input->>'kind' or schedule.employee_id is distinct from employee or schedule.stopped_from is not null then raise exception 'finance_schedule_invalid'; end if;
  select * into prior from public.finance_schedule_terms where studio_id=p_studio_id and schedule_id=schedule.id order by revision desc limit 1;
  if coalesce(prior.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  editable:=schedule.kind='payroll' and prior.id is not null
    and not private.finance_payroll_term_consumed(p_studio_id,prior.id);
  if editable then
    select * into anchor from public.finance_schedule_terms t
      where t.studio_id=p_studio_id and t.schedule_id=schedule.id
        and t.revision>coalesce((select max(h.revision) from public.finance_schedule_terms h
          where h.studio_id=p_studio_id and h.schedule_id=schedule.id
            and private.finance_payroll_term_consumed(p_studio_id,h.id)),0)
      order by t.revision limit 1;
    select min(t.effective_from) into old_from from public.finance_schedule_terms t
      where t.studio_id=p_studio_id and t.schedule_id=schedule.id and t.revision>=anchor.revision;
  end if;
  if schedule.kind='payroll' and (
    (editable and exists(select 1 from public.finance_schedule_terms t
      where t.studio_id=p_studio_id and t.schedule_id=schedule.id and t.revision<anchor.revision
        and t.effective_from>=starts))
    or exists(select 1 from public.finance_obligations o
      where o.studio_id=p_studio_id and o.employee_id=schedule.employee_id and o.kind='payroll'
        and o.period_start>=starts and (
          exists(select 1 from public.finance_payroll_cost_revisions r
            where r.studio_id=o.studio_id and r.obligation_id=o.id)
          or exists(select 1 from public.finance_obligation_items l
            join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
            where l.studio_id=o.studio_id and l.obligation_id=o.id and (i.is_established
              or exists(select 1 from public.finance_allocations a
                where a.studio_id=i.studio_id and a.expected_item_id=i.id)))))
  ) then raise exception 'finance_schedule_effective_date'; end if;
  if prior.id is not null and not editable and (
    starts<=prior.effective_from
    or (schedule.kind<>'payroll' and (starts<first_day or starts<=(now() at time zone 'Europe/Kyiv')::date))
    or exists(select 1 from public.finance_obligations o
      where o.studio_id=p_studio_id and o.schedule_id=schedule.id
        and o.period_start<starts and o.period_end>=starts)
    or (schedule.kind<>'payroll' and exists(select 1 from public.finance_obligations o
      join public.finance_obligation_items l on l.studio_id=o.studio_id and l.obligation_id=o.id
      join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
      where o.studio_id=p_studio_id and o.schedule_id=schedule.id and o.period_start>=starts
        and (i.is_established or exists(select 1 from public.finance_allocations a
          where a.studio_id=i.studio_id and a.expected_item_id=i.id))))
  ) then raise exception 'finance_schedule_effective_date'; end if;
  select * into category from public.finance_categories where studio_id=p_studio_id and id=(p_input->>'categoryId')::uuid and archived_at is null;
  if category.id is null or category.direction<>'outgoing' or (schedule.kind='payroll' and category.default_key is distinct from 'salary') then raise exception 'finance_category_invalid'; end if;
  if (schedule.kind='payroll') is distinct from (nullif(p_input->>'basis','') is not null) then raise exception 'finance_compensation_invalid'; end if;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if digits is null then raise exception 'finance_amount_invalid'; end if;
  foreach value in array array[(p_input->>'amount')::numeric,nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,nullif(p_input->>'employerCost','')::numeric] loop
    if value is not null and (value<>round(value,digits) or value<0 or value>9999999999.9999) then raise exception 'finance_amount_invalid'; end if;
  end loop;
  if schedule.kind='payroll' then perform set_config('studioflow.finance_payroll_draft_edit','on',true); end if;
  if editable and anchor.revision<prior.revision then
    -- Only the unused suffix can be folded into one editable configuration.
    perform set_config('studioflow.finance_occurrence_reconcile','on',true);
    update public.finance_obligations o set terms_id=anchor.id
      where o.studio_id=p_studio_id and o.schedule_id=schedule.id
        and o.terms_id in (select t.id from public.finance_schedule_terms t
          where t.studio_id=p_studio_id and t.schedule_id=schedule.id and t.revision>anchor.revision);
    perform set_config('studioflow.finance_occurrence_reconcile',coalesce(previous_reconcile,''),true);
    for prior in select * from public.finance_schedule_terms t
      where t.studio_id=p_studio_id and t.schedule_id=schedule.id and t.revision>anchor.revision
      order by t.revision desc loop
      delete from public.finance_schedule_terms where studio_id=p_studio_id and id=prior.id;
    end loop;
    prior:=anchor;
  end if;
  insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,effective_through,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
  values(p_studio_id,schedule.id,coalesce(prior.revision,0)+case when editable then 0 else 1 end,btrim(p_input->>'name'),(p_input->>'amount')::numeric,p_input->>'currency',category.id,
    (p_input->>'intervalMonths')::integer,(p_input->>'payoutDay')::integer,coalesce((p_input->>'paymentMonthOffset')::integer,0),starts,nullif(p_input->>'effectiveThrough','')::date,
    p_input->>'commitment',p_input->>'certainty',nullif(p_input->>'basis',''),nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,
    case when p_input ? 'employerCost' then nullif(p_input->>'employerCost','')::numeric
      when schedule.kind='payroll' and prior.id is null and not(p_input ? 'employerCostStatus') then 0
      else prior.employer_cost end,
    coalesce(p_input->>'employerCostStatus',prior.employer_cost_status,case when schedule.kind='payroll' then 'fixed' else 'unknown' end),btrim(p_input->>'reason'),auth.uid())
  on conflict(studio_id,schedule_id,revision) do update set
    name=excluded.name,amount=excluded.amount,currency=excluded.currency,category_id=excluded.category_id,
    interval_months=excluded.interval_months,payout_day=excluded.payout_day,payment_month_offset=excluded.payment_month_offset,
    effective_from=excluded.effective_from,effective_through=excluded.effective_through,
    commitment=excluded.commitment,certainty=excluded.certainty,basis=excluded.basis,
    employee_payout=excluded.employee_payout,employee_deductions=excluded.employee_deductions,
    employer_cost=excluded.employer_cost,employer_cost_status=excluded.employer_cost_status,reason=excluded.reason;
  if editable and (least(old_from,starts)<=first_day+interval '11 months' or exists(select 1 from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id)) then
    perform private.reconcile_finance_schedule_occurrences(p_studio_id,schedule.id,least(old_from,starts),
      greatest((first_day+interval '11 months')::date,coalesce((select max(o.period_start) from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id),first_day)),auth.uid());
  elsif not editable and (starts<=first_day+interval '11 months' or exists(select 1 from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id)) then
    perform private.reconcile_finance_schedule_occurrences(p_studio_id,schedule.id,
      case when schedule.kind='payroll' then starts else greatest((first_day-interval '1 month')::date,starts) end,
      greatest((first_day+interval '11 months')::date,coalesce((select max(o.period_start) from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id),first_day)),auth.uid());
  end if;
  if schedule.kind='payroll' then perform set_config('studioflow.finance_payroll_draft_edit',coalesce(previous_edit,''),true); end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,schedule.id,auth.uid(),now());
  return schedule.id;
end $function$;

-- Existing setup edits may have produced several unused rows before this rule existed.
-- Keep the latest configuration, and retain every term that has a finalized payroll use.
do $$
declare schedule public.finance_schedules; anchor public.finance_schedule_terms; latest public.finance_schedule_terms;
  obsolete public.finance_schedule_terms; earliest date; horizon date;
  previous_edit text:=current_setting('studioflow.finance_payroll_draft_edit',true);
  previous_reconcile text:=current_setting('studioflow.finance_occurrence_reconcile',true);
begin
  for schedule in select * from public.finance_schedules
    where kind='payroll' and stopped_from is null order by studio_id,id for update loop
    select * into latest from public.finance_schedule_terms
      where studio_id=schedule.studio_id and schedule_id=schedule.id order by revision desc limit 1;
    if latest.id is null or private.finance_payroll_term_consumed(schedule.studio_id,latest.id) then continue; end if;
    select * into anchor from public.finance_schedule_terms t
      where t.studio_id=schedule.studio_id and t.schedule_id=schedule.id
        and t.revision>coalesce((select max(h.revision) from public.finance_schedule_terms h
          where h.studio_id=schedule.studio_id and h.schedule_id=schedule.id
            and private.finance_payroll_term_consumed(schedule.studio_id,h.id)),0)
      order by t.revision limit 1;
    if anchor.id=latest.id then continue; end if;
    select min(effective_from) into earliest from public.finance_schedule_terms
      where studio_id=schedule.studio_id and schedule_id=schedule.id and revision>=anchor.revision;
    perform set_config('studioflow.finance_payroll_draft_edit','on',true);
    perform set_config('studioflow.finance_occurrence_reconcile','on',true);
    update public.finance_obligations o set terms_id=anchor.id
      where o.studio_id=schedule.studio_id and o.schedule_id=schedule.id
        and o.terms_id in (select t.id from public.finance_schedule_terms t
          where t.studio_id=schedule.studio_id and t.schedule_id=schedule.id and t.revision>anchor.revision);
    perform set_config('studioflow.finance_occurrence_reconcile',coalesce(previous_reconcile,''),true);
    for obsolete in select * from public.finance_schedule_terms t
      where t.studio_id=schedule.studio_id and t.schedule_id=schedule.id and t.revision>anchor.revision
      order by t.revision desc loop
      delete from public.finance_schedule_terms where studio_id=schedule.studio_id and id=obsolete.id;
    end loop;
    update public.finance_schedule_terms set
      name=latest.name,amount=latest.amount,currency=latest.currency,category_id=latest.category_id,
      interval_months=latest.interval_months,payout_day=latest.payout_day,payment_month_offset=latest.payment_month_offset,
      effective_from=latest.effective_from,effective_through=latest.effective_through,
      commitment=latest.commitment,certainty=latest.certainty,basis=latest.basis,
      employee_payout=latest.employee_payout,employee_deductions=latest.employee_deductions,
      employer_cost=latest.employer_cost,employer_cost_status=latest.employer_cost_status,
      reason=latest.reason
      where studio_id=schedule.studio_id and id=anchor.id;
    select greatest((date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '11 months')::date,
      coalesce(max(o.period_start),date_trunc('month',now() at time zone 'Europe/Kyiv')::date)) into horizon
      from public.finance_obligations o where o.studio_id=schedule.studio_id and o.schedule_id=schedule.id;
    if least(earliest,latest.effective_from)<=horizon then
      perform private.reconcile_finance_schedule_occurrences(schedule.studio_id,schedule.id,
        least(earliest,latest.effective_from),horizon,latest.created_by);
    end if;
    perform set_config('studioflow.finance_payroll_draft_edit',coalesce(previous_edit,''),true);
    perform set_config('studioflow.finance_occurrence_reconcile',coalesce(previous_reconcile,''),true);
  end loop;
end $$;

-- Undo a draft revision after earlier payroll has been finalized. Its unpaid
-- occurrences return to the preceding agreement (or cancel if that term ended).
create or replace function public.delete_unconsumed_finance_payroll_revision(
  p_studio_id uuid,p_request_id uuid,p_schedule_id uuid,p_revision integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','delete_payroll_revision','scheduleId',p_schedule_id,'revision',p_revision);
  result uuid; schedule public.finance_schedules; latest public.finance_schedule_terms; previous public.finance_schedule_terms;
  horizon date; previous_edit text:=current_setting('studioflow.finance_payroll_draft_edit',true);
  previous_reconcile text:=current_setting('studioflow.finance_occurrence_reconcile',true);
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
  if result is not null then return result; end if;
  select * into schedule from public.finance_schedules
    where studio_id=p_studio_id and id=p_schedule_id and kind='payroll' and stopped_from is null for update;
  if schedule.id is null then raise exception 'finance_schedule_invalid'; end if;
  select * into latest from public.finance_schedule_terms
    where studio_id=p_studio_id and schedule_id=p_schedule_id order by revision desc limit 1;
  if latest.revision is distinct from p_revision then raise exception 'finance_version_conflict'; end if;
  if private.finance_payroll_term_consumed(p_studio_id,latest.id) then raise exception 'finance_payroll_consumed'; end if;
  select * into previous from public.finance_schedule_terms
    where studio_id=p_studio_id and schedule_id=p_schedule_id and revision<latest.revision
    order by revision desc limit 1;
  if previous.id is null then raise exception 'finance_schedule_invalid'; end if;
  perform set_config('studioflow.finance_payroll_draft_edit','on',true);
  perform set_config('studioflow.finance_occurrence_reconcile','on',true);
  update public.finance_obligations set terms_id=previous.id
    where studio_id=p_studio_id and schedule_id=p_schedule_id and terms_id=latest.id;
  perform set_config('studioflow.finance_occurrence_reconcile',coalesce(previous_reconcile,''),true);
  delete from public.finance_schedule_terms where studio_id=p_studio_id and id=latest.id;
  select greatest((date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '11 months')::date,
    coalesce(max(o.period_start),date_trunc('month',now() at time zone 'Europe/Kyiv')::date)) into horizon
    from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=p_schedule_id;
  if latest.effective_from<=horizon then
    perform private.reconcile_finance_schedule_occurrences(p_studio_id,p_schedule_id,latest.effective_from,horizon,auth.uid());
  end if;
  perform set_config('studioflow.finance_payroll_draft_edit',coalesce(previous_edit,''),true);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,p_schedule_id,auth.uid(),now());
  return p_schedule_id;
end $$;
revoke all on function public.delete_unconsumed_finance_payroll_revision(uuid,uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.delete_unconsumed_finance_payroll_revision(uuid,uuid,uuid,integer)
  to authenticated;

-- History UI lists only terms with finalized payroll use, not draft edits.
create or replace function public.get_finance_payroll_historical_terms(p_studio_id uuid)
returns table(term_id uuid) language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  return query select t.id from public.finance_schedule_terms t
    join public.finance_schedules s on s.studio_id=t.studio_id and s.id=t.schedule_id
    where t.studio_id=p_studio_id and s.kind='payroll'
      and private.finance_payroll_term_consumed(t.studio_id,t.id);
end $$;
revoke all on function public.get_finance_payroll_historical_terms(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_finance_payroll_historical_terms(uuid) to authenticated;
