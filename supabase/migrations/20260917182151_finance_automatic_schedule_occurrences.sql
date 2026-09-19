-- Schedules own future expected-item coverage. Existing earned, settled and
-- manually-cancelled occurrences remain immutable; only system projections are
-- reconciled when a future rule changes.
alter table public.finance_obligation_items
  add column managed_active boolean not null default true;

drop trigger finance_history_immutable on public.finance_obligations;
drop trigger finance_history_immutable on public.finance_obligation_items;

create function private.guard_finance_obligation_history() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE'
    and current_setting('studioflow.finance_occurrence_reconcile',true)='on'
    and row(new.id,new.studio_id,new.kind,new.employee_id,new.period_start,new.created_by,new.created_at)
      is not distinct from row(old.id,old.studio_id,old.kind,old.employee_id,old.period_start,old.created_by,old.created_at)
  then return new; end if;
  raise exception 'finance_history_immutable';
end $$;
create trigger finance_obligation_history_guard before update or delete on public.finance_obligations
for each row execute function private.guard_finance_obligation_history();

create function private.guard_finance_obligation_link_history() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE'
    and current_setting('studioflow.finance_occurrence_reconcile',true)='on'
    and row(new.studio_id,new.obligation_id,new.expected_item_id,new.component)
      is not distinct from row(old.studio_id,old.obligation_id,old.expected_item_id,old.component)
  then return new; end if;
  raise exception 'finance_history_immutable';
end $$;
create trigger finance_obligation_link_history_guard before update or delete on public.finance_obligation_items
for each row execute function private.guard_finance_obligation_link_history();

create or replace function private.guard_finance_obligation_item() returns trigger
language plpgsql security definer set search_path='' as $$
declare component text;
begin
  if current_setting('studioflow.finance_occurrence_reconcile',true)='on' then return new; end if;
  select l.component into component from public.finance_obligation_items l where l.studio_id=old.studio_id and l.expected_item_id=old.id;
  if component is null then return new; end if;
  if row(new.direction,new.currency,new.category_id,new.due_date) is distinct from row(old.direction,old.currency,old.category_id,old.due_date)
    or (component in ('payout','deductions','bonus') and row(new.amount,new.certainty) is distinct from row(old.amount,old.certainty)) then raise exception 'finance_obligation_locked'; end if;
  return new;
end $$;

create function private.reconcile_finance_obligation_item(
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
      values(p_studio,'outgoing',p_amount,p_currency,p_category,p_description,p_due,p_due,p_commitment,p_certainty,false,p_actor)
      returning id into item;
    insert into public.finance_obligation_items(studio_id,obligation_id,expected_item_id,component)
      values(p_studio,p_obligation,item,p_component);
  elsif active and state='cancelled' then
    return;
  else
    update public.finance_expected_items
      set amount=p_amount,currency=p_currency,category_id=p_category,description=p_description,due_date=p_due,
        expected_payment_date=case when expected_payment_date is null or expected_payment_date=due_date then p_due else expected_payment_date end,
        commitment=p_commitment,certainty=p_certainty,is_established=false,version=version+1,updated_at=now()
      where studio_id=p_studio and id=item;
    update public.finance_obligation_items set managed_active=true
      where studio_id=p_studio and expected_item_id=item and not managed_active;
  end if;
end $$;

create function private.reconcile_finance_schedule_occurrences(
  p_studio uuid,p_schedule uuid,p_from date,p_through date,p_actor uuid
) returns void
language plpgsql security definer set search_path='' as $$
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
    if obligation.id is null and schedule.kind='payroll' then
      select * into obligation from public.finance_obligations
        where studio_id=p_studio and employee_id=schedule.employee_id and kind='payroll' and period_start=period;
    end if;

    if obligation.id is not null then
      select exists(
        select 1 from public.finance_obligation_items l
        join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
        where l.studio_id=p_studio and l.obligation_id=obligation.id
          and (i.is_established
            or exists(select 1 from public.finance_allocations a where a.studio_id=i.studio_id and a.expected_item_id=i.id))
      ) into protected;
      if period<date_trunc('month',now() at time zone 'Europe/Kyiv')::date or protected then continue; end if;
    end if;

    if terms.id is null then
      if obligation.id is not null then
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
      if obligation.schedule_id=schedule.id and obligation.terms_id=terms.id and primary_active then continue; end if;
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
end $$;

create function public.ensure_finance_schedule_occurrences(p_studio_id uuid,p_horizon text default '12') returns integer
language plpgsql security definer set search_path='' as $$
declare first_day date:=date_trunc('month',now() at time zone 'Europe/Kyiv')::date; last_day date; schedule record; total integer:=0;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_horizon is null or p_horizon not in ('3','6','year','12') then raise exception 'finance_input_invalid'; end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  if not found then return 0; end if;
  last_day:=case when p_horizon='year' then make_date(extract(year from first_day)::integer,12,1)
    else (first_day+make_interval(months=>p_horizon::integer-1))::date end;
  for schedule in select id,created_by from public.finance_schedules
    where studio_id=p_studio_id and (stopped_from is null or stopped_from>first_day-interval '1 month') order by id
  loop
    perform private.reconcile_finance_schedule_occurrences(p_studio_id,schedule.id,(first_day-interval '1 month')::date,last_day,schedule.created_by);
    total:=total+1;
  end loop;
  return total;
end $$;

create or replace function private.guard_finance_payroll_terms() returns trigger
language plpgsql security definer set search_path='' as $$
declare schedule public.finance_schedules;
begin
  select * into schedule from public.finance_schedules where studio_id=new.studio_id and id=new.schedule_id;
  if schedule.kind='payroll' and exists(
    select 1 from public.finance_obligations o
    where o.studio_id=new.studio_id and o.employee_id=schedule.employee_id and o.kind='payroll'
      and o.schedule_id<>new.schedule_id and o.period_end>=new.effective_from
      and exists(select 1 from public.finance_obligation_items l where l.studio_id=o.studio_id and l.obligation_id=o.id and l.managed_active)
  ) then raise exception 'finance_schedule_effective_date'; end if;
  return new;
end $$;

create or replace function public.save_finance_schedule(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','schedule','input',p_input); result uuid;
  schedule public.finance_schedules; prior public.finance_schedule_terms; category public.finance_categories;
  employee uuid:=nullif(p_input->>'employeeId','')::uuid; starts date:=(p_input->>'effectiveFrom')::date; digits integer; value numeric;
  first_day date:=date_trunc('month',now() at time zone 'Europe/Kyiv')::date;
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
  if prior.id is not null and (starts<=prior.effective_from or starts<=(now() at time zone 'Europe/Kyiv')::date
    or exists(select 1 from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id and o.period_start<starts and o.period_end>=starts)
    or exists(select 1 from public.finance_obligations o join public.finance_obligation_items l on l.studio_id=o.studio_id and l.obligation_id=o.id
      join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
      where o.studio_id=p_studio_id and o.schedule_id=schedule.id and o.period_start>=starts
        and (i.is_established or exists(select 1 from public.finance_allocations a where a.studio_id=i.studio_id and a.expected_item_id=i.id))))
    then raise exception 'finance_schedule_effective_date'; end if;
  select * into category from public.finance_categories where studio_id=p_studio_id and id=(p_input->>'categoryId')::uuid and archived_at is null;
  if category.id is null or category.direction<>'outgoing' or (schedule.kind='payroll' and category.default_key is distinct from 'salary') then raise exception 'finance_category_invalid'; end if;
  if (schedule.kind='payroll') is distinct from (nullif(p_input->>'basis','') is not null) then raise exception 'finance_compensation_invalid'; end if;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if digits is null then raise exception 'finance_amount_invalid'; end if;
  foreach value in array array[(p_input->>'amount')::numeric,nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,nullif(p_input->>'employerCost','')::numeric] loop
    if value is not null and (value<>round(value,digits) or value<0 or value>9999999999.9999) then raise exception 'finance_amount_invalid'; end if;
  end loop;
  insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,effective_through,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
  values(p_studio_id,schedule.id,coalesce(prior.revision,0)+1,btrim(p_input->>'name'),(p_input->>'amount')::numeric,p_input->>'currency',category.id,
    (p_input->>'intervalMonths')::integer,(p_input->>'payoutDay')::integer,coalesce((p_input->>'paymentMonthOffset')::integer,0),starts,nullif(p_input->>'effectiveThrough','')::date,
    p_input->>'commitment',p_input->>'certainty',nullif(p_input->>'basis',''),nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,
    nullif(p_input->>'employerCost','')::numeric,coalesce(p_input->>'employerCostStatus','unknown'),btrim(p_input->>'reason'),auth.uid());
  if starts<=first_day+interval '11 months' then
    perform private.reconcile_finance_schedule_occurrences(p_studio_id,schedule.id,greatest((first_day-interval '1 month')::date,starts),(first_day+interval '11 months')::date,auth.uid());
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,schedule.id,auth.uid(),now());
  return schedule.id;
end $$;

create or replace function public.stop_finance_schedule(p_studio_id uuid,p_request_id uuid,p_schedule_id uuid,p_from date) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','stop_schedule','id',p_schedule_id,'from',p_from); result uuid;
  first_day date:=date_trunc('month',now() at time zone 'Europe/Kyiv')::date;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if p_from is null or extract(day from p_from)<>1 or p_from<=(now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_schedule_effective_date'; end if;
  update public.finance_schedules set stopped_from=least(stopped_from,p_from) where studio_id=p_studio_id and id=p_schedule_id returning id into result;
  if result is null then raise exception 'finance_schedule_invalid'; end if;
  perform private.reconcile_finance_schedule_occurrences(p_studio_id,result,p_from,greatest(p_from,(first_day+interval '11 months')::date),auth.uid());
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

create or replace function public.generate_finance_obligations(p_studio_id uuid,p_request_id uuid,p_schedule_id uuid,p_from date,p_through date) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','generate_obligations','id',p_schedule_id,'from',p_from,'through',p_through); result uuid; schedule public.finance_schedules;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into schedule from public.finance_schedules where studio_id=p_studio_id and id=p_schedule_id;
  if schedule.employee_id is not null then perform 1 from public.studio_members where studio_id=p_studio_id and user_id=schedule.employee_id for share; end if;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if schedule.id is null then raise exception 'finance_schedule_invalid'; end if;
  if p_from is null or p_through is null or extract(day from p_from)<>1 or extract(day from p_through)<>1 or p_through<p_from or p_through>=p_from+interval '12 months' then raise exception 'finance_schedule_range'; end if;
  perform private.reconcile_finance_schedule_occurrences(p_studio_id,p_schedule_id,p_from,p_through,auth.uid());
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,p_schedule_id,auth.uid(),now());
  return p_schedule_id;
end $$;

create or replace function private.stop_removed_employee_payroll() returns trigger
language plpgsql security definer set search_path='' as $$
declare schedule record; stopped date:=(date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '1 month')::date;
begin
  if old.is_active and not new.is_active then
    perform 1 from public.finance_settings where studio_id=new.studio_id for update;
    update public.finance_schedules set stopped_from=least(stopped_from,stopped)
      where studio_id=new.studio_id and employee_id=new.user_id;
    for schedule in select id,created_by from public.finance_schedules where studio_id=new.studio_id and employee_id=new.user_id order by id loop
      perform private.reconcile_finance_schedule_occurrences(new.studio_id,schedule.id,stopped,stopped,schedule.created_by);
    end loop;
  end if;
  return new;
end $$;

create or replace function private.stop_inactive_profile_payroll() returns trigger
language plpgsql security definer set search_path='' as $$
declare membership record; schedule record; stopped date:=(date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '1 month')::date;
begin
  if old.is_active and not new.is_active then
    for membership in select studio_id from public.studio_members where user_id=new.id order by studio_id for update loop
      perform 1 from public.finance_settings where studio_id=membership.studio_id for update;
      update public.finance_schedules set stopped_from=least(stopped_from,stopped)
        where studio_id=membership.studio_id and employee_id=new.id;
      for schedule in select id,created_by from public.finance_schedules where studio_id=membership.studio_id and employee_id=new.id order by id loop
        perform private.reconcile_finance_schedule_occurrences(membership.studio_id,schedule.id,stopped,stopped,schedule.created_by);
      end loop;
    end loop;
  end if;
  return new;
end $$;

-- Keep recurrence materialization and forecast aggregation in one transaction so
-- every caller, including snapshots and direct RPC clients, sees full coverage.
alter function public.calculate_finance_forecast(uuid,text,text,jsonb) set schema private;
alter function private.calculate_finance_forecast(uuid,text,text,jsonb) rename to calculate_finance_forecast_report;

create function public.calculate_finance_forecast(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_fx jsonb default '[]') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  perform public.ensure_finance_schedule_occurrences(p_studio_id,p_horizon);
  return private.calculate_finance_forecast_report(p_studio_id,p_horizon,p_scenario,p_fx);
end $$;

create or replace function public.save_finance_forecast_snapshot(p_studio_id uuid,p_request_id uuid,p_name text,p_horizon text,p_scenario text,p_fx jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; report jsonb; payload jsonb:=jsonb_build_object('operation','forecast_snapshot','name',p_name,'horizon',p_horizon,'scenario',p_scenario,'fx',p_fx);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  report:=public.calculate_finance_forecast(p_studio_id,p_horizon,p_scenario,p_fx);
  report:=jsonb_set(report,'{comparisons}',coalesce((select jsonb_agg(value-'actual'-'full_period') from jsonb_array_elements(report->'comparisons')),'[]'::jsonb));
  insert into public.finance_forecast_snapshots(studio_id,name,forecast,created_by) values(p_studio_id,btrim(p_name),report,auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

revoke all on function private.guard_finance_obligation_history(),private.guard_finance_obligation_link_history(),
  private.reconcile_finance_obligation_item(uuid,uuid,text,numeric,text,uuid,text,date,text,text,uuid),
  private.reconcile_finance_schedule_occurrences(uuid,uuid,date,date,uuid),
  private.calculate_finance_forecast_report(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ensure_finance_schedule_occurrences(uuid,text),public.calculate_finance_forecast(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ensure_finance_schedule_occurrences(uuid,text),public.calculate_finance_forecast(uuid,text,text,jsonb) to authenticated;

-- Establish the rolling coverage window for schedules that predate this migration.
do $$declare schedule record; first_day date:=date_trunc('month',now() at time zone 'Europe/Kyiv')::date; begin
  for schedule in select id,studio_id,created_by from public.finance_schedules order by studio_id,id loop
    perform private.reconcile_finance_schedule_occurrences(schedule.studio_id,schedule.id,(first_day-interval '1 month')::date,(first_day+interval '11 months')::date,schedule.created_by);
  end loop;
end $$;
