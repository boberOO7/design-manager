-- Recurring receipts use the existing versioned rules, expected items and cash settlement.
-- The account is a revision snapshot/default for confirmation, never a cash posting.
alter table public.finance_schedule_terms
  add column account_id uuid,
  add column is_paused boolean not null default false,
  add constraint finance_schedule_terms_account_fkey foreign key(studio_id,account_id)
    references public.finance_accounts(studio_id,id) on delete restrict;
create index finance_schedule_terms_account_idx on public.finance_schedule_terms(studio_id,account_id) where account_id is not null;

create or replace view public.finance_schedule_history with(security_invoker=true) as
 SELECT t.id,
    t.studio_id,
    t.schedule_id,
    t.revision,
    t.name,
    t.amount,
    t.currency,
    t.category_id,
    t.interval_months,
    t.payout_day,
    t.payment_month_offset,
    t.effective_from,
    t.effective_through,
    t.commitment,
    t.certainty,
    t.basis,
    t.employee_payout,
    t.employee_deductions,
    t.employer_cost,
    t.employer_cost_status,
    t.reason,
    t.created_by,
    t.created_at,
    LEAST(t.effective_through, s.stopped_from - 1, lead(t.effective_from) OVER (PARTITION BY t.studio_id, t.schedule_id ORDER BY t.revision) - 1) AS valid_through, t.pay_method, t.rate_per_m2, t.account_id, t.is_paused
   FROM finance_schedule_terms t
     JOIN finance_schedules s ON s.studio_id = t.studio_id AND s.id = t.schedule_id;

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
  if p_input->>'kind'='payroll' and coalesce(p_input->>'payMethod','fixed')='per_m2' then
    if nullif(p_input->>'amount','') is not null or nullif(p_input->>'employeePayout','') is not null then raise exception 'finance_compensation_invalid';end if;
    if nullif(p_input->>'ratePerM2','') is null then raise exception 'finance_amount_invalid';end if;
  elsif coalesce(p_input->>'payMethod','fixed')<>'fixed' or nullif(p_input->>'ratePerM2','') is not null then raise exception 'finance_compensation_invalid';end if;
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
    and not private.finance_payroll_term_consumed(p_studio_id,prior.id)
    and not ((prior.pay_method='per_m2' or coalesce(p_input->>'payMethod','fixed')='per_m2') and starts>prior.effective_from);
  if editable then
    select * into anchor from public.finance_schedule_terms t
      where t.studio_id=p_studio_id and t.schedule_id=schedule.id
        and t.revision>coalesce((select max(h.revision) from public.finance_schedule_terms h
          where h.studio_id=p_studio_id and h.schedule_id=schedule.id
            and private.finance_payroll_term_consumed(p_studio_id,h.id)),0)
      order by t.revision limit 1;
    if prior.pay_method='per_m2' or coalesce(p_input->>'payMethod','fixed')='per_m2' then anchor:=prior;end if;
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
          or exists(select 1 from public.finance_payroll_earning_revisions r where r.studio_id=o.studio_id and r.obligation_id=o.id)
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
  if category.id is null or (schedule.kind='payroll' and (category.direction<>'outgoing' or category.default_key is distinct from 'salary')) then raise exception 'finance_category_invalid'; end if;
  -- Direction is fixed for the rule; revisions cannot turn expense history into income.
  if prior.id is not null and category.direction is distinct from
    (select c.direction from public.finance_categories c where c.studio_id=p_studio_id and c.id=prior.category_id)
    then raise exception 'finance_category_invalid'; end if;
  if p_input ? 'direction' and p_input->>'direction' is distinct from category.direction then raise exception 'finance_category_invalid'; end if;
  if category.direction='incoming' then
    if schedule.kind<>'recurring' or nullif(p_input->>'accountId','') is null or not exists(
      select 1 from public.finance_accounts a where a.studio_id=p_studio_id and a.id=(p_input->>'accountId')::uuid and a.archived_at is null
    ) then raise exception 'finance_account_invalid'; end if;
    if p_input ? 'expenseService' then raise exception 'finance_input_invalid'; end if;
  elsif nullif(p_input->>'accountId','') is not null or coalesce((p_input->>'isPaused')::boolean,false) then
    raise exception 'finance_input_invalid';
  end if;
  if (schedule.kind='payroll') is distinct from (nullif(p_input->>'basis','') is not null) then raise exception 'finance_compensation_invalid'; end if;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if digits is null then raise exception 'finance_amount_invalid'; end if;
  foreach value in array array[nullif(p_input->>'amount','')::numeric,nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,nullif(p_input->>'employerCost','')::numeric] loop
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
  insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,effective_through,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by,pay_method,rate_per_m2,account_id,is_paused)
  values(p_studio_id,schedule.id,coalesce(prior.revision,0)+case when editable then 0 else 1 end,btrim(p_input->>'name'),nullif(p_input->>'amount','')::numeric,p_input->>'currency',category.id,
    (p_input->>'intervalMonths')::integer,(p_input->>'payoutDay')::integer,coalesce((p_input->>'paymentMonthOffset')::integer,0),starts,nullif(p_input->>'effectiveThrough','')::date,
    p_input->>'commitment',p_input->>'certainty',nullif(p_input->>'basis',''),nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,
    case when p_input ? 'employerCost' then nullif(p_input->>'employerCost','')::numeric
      when schedule.kind='payroll' and prior.id is null and not(p_input ? 'employerCostStatus') then 0
      else prior.employer_cost end,
    coalesce(p_input->>'employerCostStatus',prior.employer_cost_status,case when schedule.kind='payroll' then 'fixed' else 'unknown' end),btrim(p_input->>'reason'),auth.uid(),coalesce(p_input->>'payMethod','fixed'),nullif(p_input->>'ratePerM2','')::numeric,
    nullif(p_input->>'accountId','')::uuid,coalesce((p_input->>'isPaused')::boolean,false))
  on conflict(studio_id,schedule_id,revision) do update set
    name=excluded.name,amount=excluded.amount,currency=excluded.currency,category_id=excluded.category_id,
    interval_months=excluded.interval_months,payout_day=excluded.payout_day,payment_month_offset=excluded.payment_month_offset,
    effective_from=excluded.effective_from,effective_through=excluded.effective_through,
    commitment=excluded.commitment,certainty=excluded.certainty,basis=excluded.basis,
    employee_payout=excluded.employee_payout,employee_deductions=excluded.employee_deductions,
    employer_cost=excluded.employer_cost,employer_cost_status=excluded.employer_cost_status,reason=excluded.reason,pay_method=excluded.pay_method,rate_per_m2=excluded.rate_per_m2;
  if editable and (least(old_from,starts)<=first_day+interval '11 months' or exists(select 1 from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id)) then
    perform private.reconcile_finance_schedule_occurrences(p_studio_id,schedule.id,least(old_from,starts),
      greatest((first_day+interval '11 months')::date,coalesce((select max(o.period_start) from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id),first_day)),auth.uid());
  elsif not editable and (starts<=first_day+interval '11 months' or exists(select 1 from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id)) then
    perform private.reconcile_finance_schedule_occurrences(p_studio_id,schedule.id,
      case when schedule.kind='payroll' or category.direction='incoming' then starts else greatest((first_day-interval '1 month')::date,starts) end,
      greatest(starts,(first_day+interval '11 months')::date,coalesce((select max(o.period_start) from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id),first_day)),auth.uid());
  end if;
  if schedule.kind='payroll' then perform set_config('studioflow.finance_payroll_draft_edit',coalesce(previous_edit,''),true); end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,schedule.id,auth.uid(),now());
  return schedule.id;
end $function$;

create or replace function private.reconcile_finance_obligation_item(
  p_studio uuid,p_obligation uuid,p_component text,p_amount numeric,p_currency text,p_category uuid,
  p_description text,p_due date,p_commitment text,p_certainty text,p_actor uuid
) returns void
language plpgsql security definer set search_path='' as $$
declare item uuid; active boolean; state text;
begin
  select l.expected_item_id,l.managed_active,i.commitment into item,active,state
    from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
    where l.studio_id=p_studio and l.obligation_id=p_obligation and l.component=p_component;
  if item is null then
    insert into public.finance_expected_items(studio_id,direction,amount,currency,category_id,description,due_date,expected_payment_date,commitment,certainty,is_established,created_by)
      values(p_studio,(select direction from public.finance_categories where studio_id=p_studio and id=p_category),p_amount,p_currency,p_category,p_description,p_due,p_due,p_commitment,p_certainty,false,p_actor)
      returning id into item;
    insert into public.finance_obligation_items(studio_id,obligation_id,expected_item_id,component)
      values(p_studio,p_obligation,item,p_component);
  elsif active and state='cancelled' then
    return;
  else
    update public.finance_expected_items
      set amount=p_amount,currency=p_currency,category_id=p_category,description=p_description,due_date=p_due,
        expected_payment_date=case when expected_payment_date is null or expected_payment_date=due_date then p_due else expected_payment_date end,
        commitment=p_commitment,certainty=p_certainty,version=version+1,updated_at=now()
      where studio_id=p_studio and id=item;
    update public.finance_obligation_items set managed_active=true
      where studio_id=p_studio and expected_item_id=item and not managed_active;
  end if;
end $$;

CREATE OR REPLACE FUNCTION private.reconcile_finance_schedule_occurrences(p_studio uuid, p_schedule uuid, p_from date, p_through date, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare schedule public.finance_schedules; terms public.finance_schedule_history; obligation public.finance_obligations;
  period date; v_period_end date; due_month date; v_due date; months integer;
  v_employee_name text; cost_category uuid; desired text[]; protected boolean; primary_active boolean;
  basis jsonb; payroll_amount numeric;
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
    select o.period_start from public.finance_obligations o
      join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id
      where o.studio_id=p_studio and o.schedule_id=p_schedule
        and (o.period_start>p_through or t.pay_method='per_m2' and o.period_start<p_from)
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
      if terms.is_paused or months%terms.interval_months<>0 then terms:=null; end if;
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
      if (period<date_trunc('month',now() at time zone 'Europe/Kyiv')::date and coalesce(current_setting('studioflow.finance_payroll_draft_edit',true),'')<>'on' and coalesce(terms.pay_method,'fixed')<>'per_m2') or protected
        or exists(select 1 from public.finance_payroll_earning_revisions r where r.studio_id=p_studio and r.obligation_id=obligation.id)
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
        and coalesce(current_setting('studioflow.finance_payroll_draft_edit',true),'')<>'on' and terms.pay_method<>'per_m2' then continue; end if;
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

    if terms.pay_method='per_m2' then
      basis:=private.finance_payroll_period_basis(p_studio,obligation.id);
      payroll_amount:=case when period<=date_trunc('month',now() at time zone 'Europe/Kyiv')::date then (basis->>'calculatedAmount')::numeric else 0 end;
      if terms.basis='gross' then payroll_amount:=greatest(0,payroll_amount-terms.employee_deductions);end if;
      -- No invented zero/future payments, including optional payroll components.
      if payroll_amount<=0 then
        with retired as (
          update public.finance_expected_items i set commitment='cancelled',is_established=false,version=i.version+1,updated_at=now()
            from public.finance_obligation_items l where l.studio_id=p_studio and l.obligation_id=obligation.id
            and l.expected_item_id=i.id and l.managed_active and i.commitment<>'cancelled' returning i.id
        ) update public.finance_obligation_items set managed_active=false
          where studio_id=p_studio and obligation_id=obligation.id and expected_item_id in (select id from retired);
        continue;
      end if;
    else payroll_amount:=coalesce(terms.employee_payout,terms.amount);end if;

    if terms.pay_method='per_m2' and exists(select 1 from public.finance_obligation_items l
      join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
      where l.studio_id=p_studio and l.obligation_id=obligation.id and l.component='payout' and l.managed_active
        and i.amount=payroll_amount and i.currency=terms.currency and i.due_date=v_due and i.category_id=terms.category_id) then continue;end if;
    desired:=array[case when schedule.kind='payroll' then 'payout' else 'recurring' end];
    perform private.reconcile_finance_obligation_item(p_studio,obligation.id,desired[1],payroll_amount,
      terms.currency,terms.category_id,terms.name||' · '||to_char(period,'YYYY-MM'),v_due,terms.commitment,case when terms.pay_method='per_m2' then 'estimated' else terms.certainty end,coalesce(p_actor,schedule.created_by));
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

CREATE OR REPLACE FUNCTION private.capture_finance_forecast_inputs(p_studio_id uuid, p_horizon text, p_scenario text, p_fx jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare setup public.finance_settings;today date:=(now() at time zone 'Europe/Kyiv')::date;first_day date:=date_trunc('month',today)::date;last_day date;digits integer;result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id;
  if setup.finalized_at is null then raise exception 'finance_finalized_setup_required'; end if;
  if p_horizon is null or p_horizon not in ('3','6','year','12') or p_scenario is null or p_scenario not in ('confirmed','planned') then raise exception 'finance_input_invalid'; end if;
  last_day:=(first_day+interval '12 months'-interval '1 day')::date;
  if jsonb_typeof(p_fx) is distinct from 'array' or jsonb_array_length(p_fx)>200 then raise exception 'finance_fx_invalid'; end if;
  if exists(select 1 from jsonb_to_recordset(p_fx) as f(currency text,rate numeric,source text,"effectiveDate" date)
    where f.currency is null or not exists(select 1 from public.finance_currencies c where c.code=f.currency)
    or f.rate is null or not(f.rate>0 and f.rate<=1000000000) or f.rate<>round(f.rate,10)
    or f.source is null or f.source not in ('manual','nbu') or f."effectiveDate" is distinct from today
    or (f.source='nbu' and setup.base_currency<>'UAH') or f.currency=setup.base_currency)
    or exists(select 1 from jsonb_to_recordset(p_fx) as f(currency text) group by currency having count(*)>1) then raise exception 'finance_fx_invalid'; end if;
  select minor_units into digits from public.finance_currencies where code=setup.base_currency;
  with expected as (
    select i.id,i.category_id,c.name as category,c.nature,i.direction,i.description,i.currency,i.remaining_amount,
      i.commitment,i.certainty,i.due_date,i.expected_payment_date,i.version,
      pi.project_id,pi.stream,oi.component,o.kind as obligation_kind,o.id as obligation_id,o.schedule_id,o.period_start,o.period_end
    from public.finance_expected_balances i
    join public.finance_categories c on c.studio_id=i.studio_id and c.id=i.category_id
    left join public.finance_project_items pi on pi.studio_id=i.studio_id and pi.expected_item_id=i.id
    left join public.finance_obligation_items oi on oi.studio_id=i.studio_id and oi.expected_item_id=i.id
    left join public.finance_obligations o on o.studio_id=oi.studio_id and o.id=oi.obligation_id
    where i.studio_id=p_studio_id and i.remaining_amount>0 and i.commitment in ('agreed','tentative')

  ), actual as (
    select date_trunc('month',financial_date)::date as month,category_id,direction,nature,sum(amount) as amount,bool_or(amount is null) as incomplete
    from public.finance_planning_actuals where studio_id=p_studio_id and financial_date between first_day and today group by 1,2,3,4

  ), budget as (
    select b.id,b.revision,make_date(b.year,n,1) as month,b.category_id,c.direction,c.nature,b.months[n] as amount
    from public.finance_current_budget b join public.finance_categories c on c.studio_id=b.studio_id and c.id=b.category_id
    cross join generate_series(1,12) n where b.studio_id=p_studio_id and make_date(b.year,n,1) between first_day and last_day

  ), diagnostics as (
    select 'payroll' as source,o.employee_id::text as id,max(coalesce(o.employee_name,t.name)) as label,
      case c.component when 'employer_cost' then 'unknown_employer_cost' else 'unknown_deductions' end as reason,min(t.currency) as currency,null::text as amount,min(o.period_start) as date,
      min((select min(coalesce(i.expected_payment_date,i.due_date,today)) from public.finance_obligation_items oi join public.finance_expected_items i on i.studio_id=oi.studio_id and i.id=oi.expected_item_id where oi.studio_id=o.studio_id and oi.obligation_id=o.id and i.commitment<>'cancelled')) as required_through
    from public.finance_obligations o join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id
    join public.finance_payroll_unknown_costs c on c.studio_id=o.studio_id and c.obligation_id=o.id and c.status='unknown'
    where o.studio_id=p_studio_id and o.kind='payroll'
      and exists(select 1 from public.finance_obligation_items oi join public.finance_expected_items i on i.studio_id=oi.studio_id and i.id=oi.expected_item_id
        where oi.studio_id=o.studio_id and oi.obligation_id=o.id and i.commitment<>'cancelled' and coalesce(i.expected_payment_date,i.due_date,today)<=last_day)
    group by o.employee_id,c.component
    union all
    -- Coverage diagnostics only: no schedule amount is expanded into cash reporting.
    select 'schedule',s.id::text,t.name,'ungenerated_period',t.currency,null::text,d::date,(d+make_interval(months=>t.payment_month_offset))::date
    from public.finance_schedules s join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
    cross join generate_series((first_day-interval '1 month')::timestamp,last_day::timestamp,interval '1 month') d
    where s.studio_id=p_studio_id and not t.is_paused and t.pay_method<>'per_m2' and d::date>=t.effective_from and (t.valid_through is null or d::date<=t.valid_through)
      and (t.commitment='agreed' or p_scenario='planned')
      and ((extract(year from d)-extract(year from t.effective_from))::integer*12+(extract(month from d)-extract(month from t.effective_from))::integer)%t.interval_months=0
      and (d+make_interval(months=>t.payment_month_offset))::date<=last_day
      and not exists(select 1 from public.finance_obligations o where o.studio_id=s.studio_id and o.schedule_id=s.id and o.period_start=d::date)
    union all
    select 'schedule',s.id::text,t.name,'piecework_unforecast',t.currency,null::text,d::date,(d+make_interval(months=>t.payment_month_offset))::date
    from public.finance_schedules s join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
    cross join generate_series(first_day::timestamp,last_day::timestamp,interval '1 month') d
    where s.studio_id=p_studio_id and t.pay_method='per_m2' and d::date>=t.effective_from and (t.valid_through is null or d::date<=t.valid_through)
      and (d+make_interval(months=>t.payment_month_offset))::date<=last_day
      and not exists(select 1 from public.finance_obligations o join public.finance_payroll_earning_revisions r on r.studio_id=o.studio_id and r.obligation_id=o.id
        where o.studio_id=s.studio_id and o.schedule_id=s.id and o.period_start=d::date)
    union all
    select 'project',p.project_id::text,pr.name,'unscheduled_project',p.currency,p.unscheduled_amount::text,null::date,null::date
    from public.finance_project_totals p join public.projects pr on pr.studio_id=p.studio_id and pr.id=p.project_id
    where p.studio_id=p_studio_id and p.unscheduled_amount>0
    union all
    select 'project',t.project_id::text,pr.name,'ungenerated_supervision',t.currency,null::text,d::date,d::date
    from public.finance_project_terms t join public.projects pr on pr.studio_id=t.studio_id and pr.id=t.project_id
    cross join generate_series(first_day::timestamp,last_day::timestamp,interval '1 month') d
    where t.studio_id=p_studio_id and t.mode='monthly' and d::date>=t.effective_from and (t.effective_through is null or d::date<=t.effective_through)
      and not exists(select 1 from public.finance_project_terms newer where newer.studio_id=t.studio_id and newer.project_id=t.project_id and newer.stream=t.stream and newer.revision>t.revision and newer.effective_from<=d::date)
      and not exists(select 1 from public.finance_project_items i where i.studio_id=t.studio_id and i.project_id=t.project_id and i.source='monthly' and i.period_start=d::date)

  ) select jsonb_build_object('version',2,'asOf',today,'from',first_day,'through',last_day,'cutover',setup.cutover_date,'currency',setup.base_currency,'digits',digits,'horizon',p_horizon,'scenario',p_scenario,
    'fx',p_fx||jsonb_build_array(jsonb_build_object('currency',setup.base_currency,'rate','1','source','identity','effectiveDate',today)),
    'expected',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('remaining_amount',e.remaining_amount::text) order by e.id) from expected e),'[]'),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'currency',b.currency,'amount',b.recorded_balance::text) order by b.id) from public.finance_account_balances b where b.studio_id=p_studio_id),'[]'),
    'actuals',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('amount',a.amount::text) order by a.month,a.category_id,a.direction,a.nature) from actual a),'[]'),
    'budgets',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('amount',b.amount::text) order by b.month,b.category_id) from budget b),'[]'),
    'diagnostics',coalesce((select jsonb_agg(to_jsonb(d) order by d.source,d.id,d.date) from diagnostics d),'[]'),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'direction',c.direction,'nature',c.nature,'archivedAt',c.archived_at,'default_key',c.default_key,'custom_name',c.custom_name) order by c.id) from public.finance_categories c where c.studio_id=p_studio_id),'[]'),
    'currencies',(select jsonb_agg(jsonb_build_object('code',c.code,'minorUnits',c.minor_units) order by c.code) from public.finance_currencies c)) into result;
  return result;
end $function$;

create or replace function private.configure_finance_schedule_expense(p_studio uuid,p_schedule uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.finance_schedule_terms; cat public.finance_categories; prior public.finance_expense_service_policies;
  first_month date; start_date date; effective date; boundary date; result uuid; project uuid:=nullif(p_input->>'projectId','')::uuid;
  today date:=(now() at time zone 'Europe/Kyiv')::date;
  mode text:=coalesce(nullif(p_input->>'policy',''),'service_days');
begin
  if not private.is_finance_admin(p_studio) then raise exception 'finance_admin_required';end if;
  select recognition_start_month into boundary from public.finance_settings where studio_id=p_studio and finalized_at is not null for update;

  select terms.* into t from public.finance_schedule_terms terms join public.finance_schedules s on s.studio_id=terms.studio_id and s.id=terms.schedule_id
    where terms.studio_id=p_studio and terms.schedule_id=p_schedule and s.kind='recurring' order by terms.revision desc limit 1;
  if t.id is null or t.revision is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict';end if;
  select * into cat from public.finance_categories where studio_id=p_studio and id=t.category_id;
  if coalesce((p_input->>'confirmed')::boolean,false) is not true or mode not in ('service_days','period_end','manual') or cat.direction<>'outgoing' or cat.nature<>'operating'
    or cat.default_key in ('salary','employee_bonus') then raise exception 'finance_input_invalid';end if;
  if exists(select 1 from public.finance_obligations o join public.finance_obligation_items i on i.studio_id=o.studio_id and i.obligation_id=o.id
    where o.studio_id=p_studio and o.terms_id=t.id and (private.finance_labor_cash_expected(p_studio,i.expected_item_id)
      or exists(select 1 from public.finance_trip_entries e where e.studio_id=p_studio and e.expected_item_id=i.expected_item_id)
      or exists(select 1 from public.finance_trip_balances b where b.studio_id=p_studio and b.expected_item_id=i.expected_item_id))) then raise exception 'finance_expense_source_owned';end if;
  select * into prior from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=p_schedule order by first_period desc,revision desc limit 1;
  -- Ordinary amount/currency/payment revisions keep the existing service anchor and attribution.
  if prior.id is not null and prior.service_months=t.interval_months
    and ((extract(year from t.effective_from)-extract(year from prior.first_period))::integer*12
      +(extract(month from t.effective_from)-extract(month from prior.first_period))::integer)%prior.service_months=0 and nullif(p_input->>'serviceStart','') is null
    and (not (p_input ? 'policy') or prior.policy=mode)
    and (not (p_input ? 'projectId') or prior.project_id is not distinct from project) then return prior.id;end if;
  first_month:=t.effective_from;
  if prior.id is null and not exists(select 1 from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule and (interval_months<>t.interval_months or
      ((extract(year from effective_from)-extract(year from t.effective_from))::integer*12
       +(extract(month from effective_from)-extract(month from t.effective_from))::integer)%t.interval_months<>0)) then
    select min(effective_from) into first_month from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule;
  end if;
  start_date:=nullif(p_input->>'serviceStart','')::date;
  if mode='manual' then
    start_date:=first_month;effective:=greatest(boundary,date_trunc('month',today)::date,first_month);
  elsif t.interval_months=1 then
    if start_date is not null and (start_date<first_month or start_date>=(first_month+interval '1 month')::date) then raise exception 'finance_input_invalid';end if;
    -- A partial initial month reduces eligible days; it must not shift every later month.
    effective:=greatest(boundary,date_trunc('month',today)::date,coalesce(start_date,first_month));
    start_date:=first_month;
  else
    if start_date is null then
      if exists(select 1 from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule and (interval_months<>t.interval_months or
      ((extract(year from effective_from)-extract(year from t.effective_from))::integer*12
       +(extract(month from effective_from)-extract(month from t.effective_from))::integer)%t.interval_months<>0)) then
        raise exception 'finance_expense_service_period_required';
      end if;
      -- effective_from identifies the service period; payout day/offset only schedule cash.
      start_date:=first_month;
    end if;
    effective:=greatest(boundary,date_trunc('month',today)::date,start_date);
  end if;
  if project is not null and (not cat.project_expense_enabled or not exists(select 1 from public.projects where studio_id=p_studio and id=project)) then raise exception 'finance_project_invalid';end if;
  if exists(select 1 from public.finance_recognition_entries r join public.finance_obligation_items i on i.studio_id=r.studio_id
    and i.expected_item_id=private.finance_recognition_expected_root(r.studio_id,r.expected_item_id)
    join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
    where r.studio_id=p_studio and o.schedule_id=p_schedule and o.period_start>=first_month) then raise exception 'finance_expense_history_protected';end if;
  insert into public.finance_expense_service_policies(studio_id,schedule_id,revision,first_period,service_start,service_months,effective_from,policy,project_id,created_by,coverage_from,source_default)
    select p_studio,p_schedule,coalesce(max(revision),0)+1,first_month,start_date,t.interval_months,effective,mode,project,auth.uid(),case when t.interval_months=1 then coalesce(nullif(p_input->>'serviceStart','')::date,first_month) else start_date end,coalesce((p_input->>'sourceDefault')::boolean,false)
    from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=p_schedule returning id into result;
  return result;
end $$;
