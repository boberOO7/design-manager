-- Optional payroll costs default to known zero on explicit saves only.
-- Preserve original request payloads, consumed terms and recognition history.
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
  -- Normalize only newly saved payroll terms, after the original request retry check.
  -- Existing null terms and explicit historical cost revisions remain unknown.
  if p_input->>'kind'='payroll' then
    if coalesce((p_input->>'employeeDeductionsUnknown')::boolean,false) then
      if p_input->>'basis' is distinct from 'net' or nullif(btrim(p_input->>'employeeDeductions'),'') is not null then
        raise exception 'finance_compensation_invalid';
      end if;
      p_input:=p_input||jsonb_build_object('employeeDeductions','');
    else
      p_input:=p_input||jsonb_build_object('employeeDeductions',coalesce(nullif(btrim(p_input->>'employeeDeductions'),''),'0'));
    end if;
    p_input:=p_input||jsonb_build_object('employerCostStatus',coalesce(nullif(p_input->>'employerCostStatus',''),'fixed'));
    if p_input->>'employerCostStatus'<>'unknown' then
      if nullif(btrim(p_input->>'employerCost'),'') is null then
        p_input:=p_input||jsonb_build_object('employerCostStatus','fixed');
      end if;
      p_input:=p_input||jsonb_build_object('employerCost',coalesce(nullif(btrim(p_input->>'employerCost'),''),'0'));
    end if;
  end if;
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
