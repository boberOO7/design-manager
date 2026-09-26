-- A generated obligation is a projection until its payout is earned, paid,
-- or has an audited payroll-cost completion. Only then must its terms be frozen.
create function private.finance_payroll_term_consumed(p_studio uuid,p_term uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.finance_obligations o
    where o.studio_id=p_studio and o.terms_id=p_term and (
      exists(select 1 from public.finance_payroll_cost_revisions r
        where r.studio_id=o.studio_id and r.obligation_id=o.id)
      or exists(select 1 from public.finance_obligation_items l
        join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
        where l.studio_id=o.studio_id and l.obligation_id=o.id and (
          i.is_established or exists(select 1 from public.finance_allocations a
            where a.studio_id=i.studio_id and a.expected_item_id=i.id)
        ))
    ));
$$;
create function private.finance_payroll_schedule_consumed(p_studio uuid,p_schedule uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.finance_schedule_terms t
    where t.studio_id=p_studio and t.schedule_id=p_schedule
      and private.finance_payroll_term_consumed(p_studio,t.id));
$$;
revoke all on function private.finance_payroll_term_consumed(uuid,uuid),
  private.finance_payroll_schedule_consumed(uuid,uuid) from public,anon,authenticated,service_role;

-- The view shares the RPC's authoritative payment/history predicate.
create view public.finance_payroll_editability with (security_invoker=true) as
select s.studio_id,s.id as schedule_id,
  not private.finance_payroll_term_consumed(s.studio_id,t.id) as editable,
  not private.finance_payroll_schedule_consumed(s.studio_id,s.id) as removable
from public.finance_schedules s
join lateral (select id from public.finance_schedule_terms
  where studio_id=s.studio_id and schedule_id=s.id order by revision desc limit 1) t on true
where s.kind='payroll' and s.stopped_from is null;
revoke all on public.finance_payroll_editability from public,anon,authenticated,service_role;
grant select on public.finance_payroll_editability to authenticated;

-- Allow only the active RPC's latest, unconsumed payroll term to change in place.
drop trigger finance_history_immutable on public.finance_schedule_terms;
create function private.guard_finance_payroll_term_edit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and current_setting('studioflow.finance_payroll_draft_edit',true)='on'
    and row(new.id,new.studio_id,new.schedule_id,new.revision,new.created_by,new.created_at)
      is not distinct from row(old.id,old.studio_id,old.schedule_id,old.revision,old.created_by,old.created_at)
    and exists(select 1 from public.finance_schedules s where s.studio_id=old.studio_id
      and s.id=old.schedule_id and s.kind='payroll' and s.stopped_from is null)
    and old.id=(select t.id from public.finance_schedule_terms t
      where t.studio_id=old.studio_id and t.schedule_id=old.schedule_id order by t.revision desc limit 1)
    and not private.finance_payroll_term_consumed(old.studio_id,old.id)
  then return new; end if;
  raise exception 'finance_history_immutable';
end $$;
revoke all on function private.guard_finance_payroll_term_edit() from public,anon,authenticated,service_role;
create trigger finance_payroll_term_edit_guard before update or delete on public.finance_schedule_terms
for each row execute function private.guard_finance_payroll_term_edit();

CREATE OR REPLACE FUNCTION private.reconcile_finance_schedule_occurrences(p_studio uuid, p_schedule uuid, p_from date, p_through date, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare schedule public.finance_schedules; terms public.finance_schedule_history; obligation public.finance_obligations;
  period date; v_period_end date; due_month date; v_due date; months integer;
  v_employee_name text; cost_category uuid; desired text[]; protected boolean; primary_active boolean;
  previous_reconcile text:=current_setting('studioflow.finance_occurrence_reconcile',true);
begin
  if p_from is null or p_through is null or extract(day from p_from)<>1 or extract(day from p_through)<>1 or p_through<p_from then
    raise exception 'finance_schedule_range';
  end if;
  select * into schedule from public.finance_schedules where studio_id=p_studio and id=p_schedule for update;
  if schedule.id is null then raise exception 'finance_schedule_invalid'; end if;
  select full_name into v_employee_name from public.profiles where id=schedule.employee_id;
  select id into cost_category from public.finance_categories
    where studio_id=p_studio and default_key='employer_costs' and archived_at is null;
  perform set_config('studioflow.finance_occurrence_reconcile','on',true);

  for period in
    select generate_series(p_from::timestamp,p_through::timestamp,interval '1 month')::date
    union
    select period_start from public.finance_obligations
      where studio_id=p_studio and schedule_id=p_schedule and period_start>p_through
    order by 1
  loop
    terms:=null; obligation:=null; desired:=array[]::text[];
    select * into terms from public.finance_schedule_history
      where studio_id=p_studio and schedule_id=p_schedule and effective_from<=period
        and (valid_through is null or period<=valid_through)
      order by revision desc limit 1;
    if terms.id is not null then
      months:=(extract(year from period)-extract(year from terms.effective_from))::integer*12
        +(extract(month from period)-extract(month from terms.effective_from))::integer;
      if months%terms.interval_months<>0 then terms:=null; end if;
    end if;

    select * into obligation from public.finance_obligations
      where studio_id=p_studio and schedule_id=p_schedule and period_start=period;
    -- A schedule without applicable terms may only maintain its own occurrences.
    if obligation.id is null and schedule.kind='payroll' and terms.id is not null then
      select * into obligation from public.finance_obligations
        where studio_id=p_studio and employee_id=schedule.employee_id and kind='payroll' and period_start=period;
    end if;

    if obligation.id is not null then
      select exists(
        select 1 from public.finance_obligation_items l
        join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
        where l.studio_id=p_studio and l.obligation_id=obligation.id
          and ((schedule.kind<>'payroll' and i.is_established)
            or exists(select 1 from public.finance_allocations a where a.studio_id=i.studio_id and a.expected_item_id=i.id))
      ) into protected;
      if (period<date_trunc('month',now() at time zone 'Europe/Kyiv')::date and current_setting('studioflow.finance_payroll_draft_edit',true)<>'on') or protected
        or exists(select 1 from public.finance_payroll_cost_revisions r where r.studio_id=p_studio and r.obligation_id=obligation.id) then continue; end if;
    end if;

    -- Reuse only a stopped predecessor's system-cancelled, unprotected occurrence.
    -- The employee/month identity survives, but ownership transfers exactly once.
    if obligation.id is not null and obligation.schedule_id<>schedule.id then
      if not exists(select 1 from public.finance_schedules predecessor
        where predecessor.studio_id=p_studio and predecessor.id=obligation.schedule_id
          and predecessor.stopped_from<=period)
        or exists(select 1 from public.finance_obligation_items l
          where l.studio_id=p_studio and l.obligation_id=obligation.id and l.managed_active)
      then continue; end if;
    end if;

    if terms.id is null then
      if obligation.id is not null and obligation.schedule_id=schedule.id then
        update public.finance_expected_items i set commitment='cancelled',is_established=false,version=i.version+1,updated_at=now()
          from public.finance_obligation_items l
          where l.studio_id=p_studio and l.obligation_id=obligation.id and l.expected_item_id=i.id and l.managed_active;
        update public.finance_obligation_items set managed_active=false
          where studio_id=p_studio and obligation_id=obligation.id and managed_active;
      end if;
      continue;
    end if;

    if obligation.id is not null then
      select exists(select 1 from public.finance_obligation_items where studio_id=p_studio and obligation_id=obligation.id
        and component=case when schedule.kind='payroll' then 'payout' else 'recurring' end and managed_active) into primary_active;
      if obligation.schedule_id=schedule.id and obligation.terms_id=terms.id and primary_active
        and current_setting('studioflow.finance_payroll_draft_edit',true)<>'on' then continue; end if;
    end if;

    v_period_end:=least((period+make_interval(months=>terms.interval_months)-interval '1 day')::date,terms.valid_through);
    due_month:=(period+make_interval(months=>terms.payment_month_offset))::date;
    v_due:=least(due_month+terms.payout_day-1,(due_month+interval '1 month - 1 day')::date);
    if obligation.id is null then
      insert into public.finance_obligations(studio_id,schedule_id,terms_id,kind,employee_id,employee_name,period_start,period_end,created_by)
        values(p_studio,schedule.id,terms.id,schedule.kind,schedule.employee_id,v_employee_name,period,v_period_end,coalesce(p_actor,schedule.created_by))
        returning * into obligation;
    else
      update public.finance_obligations set schedule_id=schedule.id,terms_id=terms.id,employee_name=coalesce(v_employee_name,obligation.employee_name),period_end=v_period_end
        where studio_id=p_studio and id=obligation.id returning * into obligation;
    end if;

    desired:=array[case when schedule.kind='payroll' then 'payout' else 'recurring' end];
    perform private.reconcile_finance_obligation_item(p_studio,obligation.id,desired[1],coalesce(terms.employee_payout,terms.amount),
      terms.currency,terms.category_id,terms.name||' · '||to_char(period,'YYYY-MM'),v_due,terms.commitment,terms.certainty,coalesce(p_actor,schedule.created_by));
    if terms.employee_deductions>0 then
      desired:=array_append(desired,'deductions');
      perform private.reconcile_finance_obligation_item(p_studio,obligation.id,'deductions',terms.employee_deductions,
        terms.currency,cost_category,terms.name||' · deductions · '||to_char(period,'YYYY-MM'),v_due,'agreed','fixed',coalesce(p_actor,schedule.created_by));
    end if;
    if terms.employer_cost>0 then
      desired:=array_append(desired,'employer_cost');
      perform private.reconcile_finance_obligation_item(p_studio,obligation.id,'employer_cost',terms.employer_cost,
        terms.currency,cost_category,terms.name||' · employer cost · '||to_char(period,'YYYY-MM'),v_due,'agreed',terms.employer_cost_status,coalesce(p_actor,schedule.created_by));
    end if;
    update public.finance_expected_items i set commitment='cancelled',is_established=false,version=i.version+1,updated_at=now()
      from public.finance_obligation_items l
      where l.studio_id=p_studio and l.obligation_id=obligation.id and l.expected_item_id=i.id and l.managed_active
        and not(l.component=any(desired));
    update public.finance_obligation_items set managed_active=false
      where studio_id=p_studio and obligation_id=obligation.id and managed_active and not(component=any(desired));
  end loop;
  perform set_config('studioflow.finance_occurrence_reconcile',coalesce(previous_reconcile,''),true);
end $function$;

CREATE OR REPLACE FUNCTION public.save_finance_schedule(p_studio_id uuid, p_request_id uuid, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb:=jsonb_build_object('operation','schedule','input',p_input); result uuid;
  schedule public.finance_schedules; prior public.finance_schedule_terms; category public.finance_categories;
  employee uuid:=nullif(p_input->>'employeeId','')::uuid; starts date:=(p_input->>'effectiveFrom')::date; digits integer; value numeric;
  first_day date:=date_trunc('month',now() at time zone 'Europe/Kyiv')::date;
  editable boolean:=false; old_from date; previous_edit text:=current_setting('studioflow.finance_payroll_draft_edit',true);
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if employee is not null then perform 1 from public.studio_members where studio_id=p_studio_id and user_id=employee for share; end if;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null) then raise exception 'finance_finalized_setup_required'; end if;
  select * into schedule from public.finance_schedules where studio_id=p_studio_id and id=nullif(p_input->>'id','')::uuid;
  if schedule.id is null then
    if nullif(p_input->>'id','') is not null then raise exception 'finance_schedule_invalid'; end if;
    if employee is not null and (not exists(select 1 from public.studio_members m join public.profiles p on p.id=m.user_id where m.studio_id=p_studio_id and m.user_id=employee and m.is_active and p.is_active)
      or exists(select 1 from public.finance_schedules s where s.studio_id=p_studio_id and s.employee_id=employee and (s.stopped_from is null or starts<s.stopped_from))) then raise exception 'finance_employee_invalid'; end if;
    insert into public.finance_schedules(studio_id,kind,employee_id,created_by)
      values(p_studio_id,p_input->>'kind',employee,auth.uid()) returning * into schedule;
  elsif schedule.kind is distinct from p_input->>'kind' or schedule.employee_id is distinct from employee or schedule.stopped_from is not null then raise exception 'finance_schedule_invalid'; end if;
  select * into prior from public.finance_schedule_terms where studio_id=p_studio_id and schedule_id=schedule.id order by revision desc limit 1;
  if coalesce(prior.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  editable:=schedule.kind='payroll' and prior.id is not null
    and not private.finance_payroll_term_consumed(p_studio_id,prior.id);
  if editable then
    if starts<=(select max(t.effective_from) from public.finance_schedule_terms t
      where t.studio_id=p_studio_id and t.schedule_id=schedule.id and t.revision<prior.revision)
      or exists(select 1 from public.finance_obligations o
        where o.studio_id=p_studio_id and o.employee_id=schedule.employee_id and o.kind='payroll'
          and o.period_start>=starts and o.terms_id<>prior.id
          and (exists(select 1 from public.finance_payroll_cost_revisions r
                where r.studio_id=o.studio_id and r.obligation_id=o.id)
            or exists(select 1 from public.finance_obligation_items l
                join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
                where l.studio_id=o.studio_id and l.obligation_id=o.id and (i.is_established
                  or exists(select 1 from public.finance_allocations a
                    where a.studio_id=i.studio_id and a.expected_item_id=i.id)))))
    then raise exception 'finance_schedule_effective_date'; end if;
    old_from:=prior.effective_from;
  end if;
  if prior.id is not null and not editable and ((starts<=prior.effective_from and not(schedule.kind='payroll' and starts=first_day and prior.effective_from=first_day))
    or starts<first_day or (schedule.kind<>'payroll' and starts<=(now() at time zone 'Europe/Kyiv')::date)
    or exists(select 1 from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id and o.period_start<starts and o.period_end>=starts)
    or exists(select 1 from public.finance_obligations o join public.finance_obligation_items l on l.studio_id=o.studio_id and l.obligation_id=o.id
      join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
      where o.studio_id=p_studio_id and o.schedule_id=schedule.id and o.period_start>=starts
        and (schedule.kind<>'payroll' or o.period_start=starts)
        and ((schedule.kind<>'payroll' and i.is_established) or exists(select 1 from public.finance_allocations a where a.studio_id=i.studio_id and a.expected_item_id=i.id))))
    then raise exception 'finance_schedule_effective_date'; end if;
  select * into category from public.finance_categories where studio_id=p_studio_id and id=(p_input->>'categoryId')::uuid and archived_at is null;
  if category.id is null or category.direction<>'outgoing' or (schedule.kind='payroll' and category.default_key is distinct from 'salary') then raise exception 'finance_category_invalid'; end if;
  if (schedule.kind='payroll') is distinct from (nullif(p_input->>'basis','') is not null) then raise exception 'finance_compensation_invalid'; end if;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if digits is null then raise exception 'finance_amount_invalid'; end if;
  foreach value in array array[(p_input->>'amount')::numeric,nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,nullif(p_input->>'employerCost','')::numeric] loop
    if value is not null and (value<>round(value,digits) or value<0 or value>9999999999.9999) then raise exception 'finance_amount_invalid'; end if;
  end loop;
  if editable then perform set_config('studioflow.finance_payroll_draft_edit','on',true); end if;
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
  if editable and least(old_from,starts)<=first_day+interval '11 months' then
    perform private.reconcile_finance_schedule_occurrences(p_studio_id,schedule.id,least(old_from,starts),(first_day+interval '11 months')::date,auth.uid());
  elsif not editable and starts<=first_day+interval '11 months' then
    perform private.reconcile_finance_schedule_occurrences(p_studio_id,schedule.id,greatest((first_day-interval '1 month')::date,starts),(first_day+interval '11 months')::date,auth.uid());
  end if;
  if editable then perform set_config('studioflow.finance_payroll_draft_edit',coalesce(previous_edit,''),true); end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,schedule.id,auth.uid(),now());
  return schedule.id;
end $function$;

-- Removal keeps the request audit and cancels only unrealized projections.
-- A stopped-from-first-period schedule has no active compensation and can be recreated.
create function public.remove_unconsumed_finance_payroll(
  p_studio_id uuid,p_request_id uuid,p_schedule_id uuid,p_revision integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','remove_payroll','scheduleId',p_schedule_id,'revision',p_revision);
  result uuid; schedule public.finance_schedules; first_from date;
  first_day date:=date_trunc('month',now() at time zone 'Europe/Kyiv')::date;
  previous_edit text:=current_setting('studioflow.finance_payroll_draft_edit',true);
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
  if result is not null then return result; end if;
  select * into schedule from public.finance_schedules
    where studio_id=p_studio_id and id=p_schedule_id and kind='payroll' for update;
  if not found or schedule.stopped_from is not null then raise exception 'finance_schedule_invalid'; end if;
  if p_revision is distinct from (select max(revision) from public.finance_schedule_terms
    where studio_id=p_studio_id and schedule_id=p_schedule_id) then raise exception 'finance_version_conflict'; end if;
  if private.finance_payroll_schedule_consumed(p_studio_id,p_schedule_id) then raise exception 'finance_payroll_consumed'; end if;
  select min(effective_from) into first_from from public.finance_schedule_terms
    where studio_id=p_studio_id and schedule_id=p_schedule_id;
  update public.finance_schedules set stopped_from=first_from where studio_id=p_studio_id and id=p_schedule_id;
  perform set_config('studioflow.finance_payroll_draft_edit','on',true);
  if first_from<=first_day+interval '11 months' then
    perform private.reconcile_finance_schedule_occurrences(p_studio_id,p_schedule_id,first_from,(first_day+interval '11 months')::date,auth.uid());
  end if;
  perform set_config('studioflow.finance_payroll_draft_edit',coalesce(previous_edit,''),true);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,p_schedule_id,auth.uid(),now());
  return p_schedule_id;
end $$;
revoke all on function public.remove_unconsumed_finance_payroll(uuid,uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.remove_unconsumed_finance_payroll(uuid,uuid,uuid,integer) to authenticated;
