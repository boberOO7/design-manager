-- Preserve employee/month identity while making replacement ownership explicit.
create or replace function private.reconcile_finance_schedule_occurrences(
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
          and (i.is_established
            or exists(select 1 from public.finance_allocations a where a.studio_id=i.studio_id and a.expected_item_id=i.id))
      ) into protected;
      if period<date_trunc('month',now() at time zone 'Europe/Kyiv')::date or protected
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
-- Dependencies include future terms beyond the materialized forecast horizon.
create function private.guard_finance_category_schedule_dependency() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    perform 1 from public.finance_settings where studio_id=new.studio_id for update;
    if exists(select 1 from public.finance_schedule_history t
      where t.studio_id=new.studio_id
        and (t.valid_through is null or t.valid_through>=greatest(t.effective_from,date_trunc('month',now() at time zone 'Europe/Kyiv')::date))
        and (t.category_id=new.id or (new.default_key='employer_costs' and t.basis is not null
          and (t.employee_deductions is null or t.employee_deductions>0 or t.employer_cost is null or t.employer_cost>0))))
    then raise exception 'finance_category_schedule_required'; end if;
  end if;
  return new;
end $$;
create trigger finance_category_schedule_dependency before update of archived_at on public.finance_categories
for each row execute function private.guard_finance_category_schedule_dependency();

-- Reject unusable new terms at save time, rather than on a later Calendar read.
create function private.guard_finance_payroll_cost_category() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.basis is not null
    and (new.employee_deductions is null or new.employee_deductions>0 or new.employer_cost is null or new.employer_cost>0)
    and not exists(select 1 from public.finance_categories where studio_id=new.studio_id and default_key='employer_costs' and archived_at is null)
  then raise exception 'finance_payroll_cost_category_required'; end if;
  return new;
end $$;
create trigger finance_payroll_cost_category before insert on public.finance_schedule_terms
for each row execute function private.guard_finance_payroll_cost_category();

-- Append-only completion facts for originally unknown components. Salary terms,
-- payouts and actual cash are never rewritten by this workflow.
create table public.finance_payroll_cost_revisions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  obligation_id uuid not null,
  component text not null check(component in ('deductions','employer_cost')),
  revision integer not null check(revision>0),
  status text not null check(status in ('unknown','fixed','estimated')),
  amount numeric check(amount>=0 and amount<=9999999999.9999),
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key(studio_id,obligation_id) references public.finance_obligations(studio_id,id) on delete restrict,
  unique(studio_id,obligation_id,component,revision),
  check((status='unknown')=(amount is null))
);
create index finance_payroll_cost_revisions_creator_idx on public.finance_payroll_cost_revisions(created_by);
alter table public.finance_payroll_cost_revisions enable row level security;
revoke all on public.finance_payroll_cost_revisions from public,anon,authenticated,service_role;
grant select on public.finance_payroll_cost_revisions to authenticated;
create policy finance_admin_read on public.finance_payroll_cost_revisions for select to authenticated using((select private.is_finance_admin(studio_id)));
create trigger finance_history_immutable before update or delete on public.finance_payroll_cost_revisions
for each row execute function private.reject_finance_history_change();

create view public.finance_payroll_unknown_costs with(security_invoker=true) as
select o.studio_id,o.id as obligation_id,c.component,t.currency,
  coalesce(r.revision,0) as revision,coalesce(r.status,'unknown') as status,r.amount,r.reason,r.created_by,r.created_at,
  (o.period_start<date_trunc('month',now() at time zone 'Europe/Kyiv')::date
    or exists(select 1 from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
      where l.studio_id=o.studio_id and l.obligation_id=o.id and l.component='payout'
        and (i.is_established or exists(select 1 from public.finance_allocations a where a.studio_id=i.studio_id and a.expected_item_id=i.id))))
    and exists(select 1 from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
      where l.studio_id=o.studio_id and l.obligation_id=o.id and l.component='payout' and i.commitment<>'cancelled')
    and not exists(select 1 from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
      where l.studio_id=o.studio_id and l.obligation_id=o.id and l.component=c.component
        and (i.is_established or exists(select 1 from public.finance_allocations a where a.studio_id=i.studio_id and a.expected_item_id=i.id))) as can_complete
from public.finance_obligations o
join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id
cross join lateral (values ('deductions',t.employee_deductions is null),('employer_cost',t.employer_cost_status='unknown')) c(component,unknown)
left join lateral (select * from public.finance_payroll_cost_revisions r where r.studio_id=o.studio_id and r.obligation_id=o.id and r.component=c.component order by r.revision desc limit 1) r on true
where o.kind='payroll' and c.unknown;
revoke all on public.finance_payroll_unknown_costs from public,anon,authenticated,service_role;
grant select on public.finance_payroll_unknown_costs to authenticated;

create function public.complete_finance_payroll_cost(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','payroll_cost','input',p_input); result uuid;
  cost public.finance_payroll_unknown_costs; payout public.finance_expected_items; item public.finance_expected_items;
  category uuid; value numeric; state text:=p_input->>'status'; digits integer;
  previous_reconcile text:=current_setting('studioflow.finance_occurrence_reconcile',true);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into cost from public.finance_payroll_unknown_costs
    where studio_id=p_studio_id and obligation_id=(p_input->>'obligationId')::uuid and component=p_input->>'component';
  if cost.obligation_id is null or not cost.can_complete then raise exception 'finance_payroll_cost_locked'; end if;
  if cost.revision is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  value:=nullif(p_input->>'amount','')::numeric;
  select minor_units into digits from public.finance_currencies where code=cost.currency;
  if state is null or state not in ('unknown','fixed','estimated') or (state='unknown') is distinct from (value is null)
    or (value is not null and (value<0 or value>9999999999.9999 or value<>round(value,digits)))
    or nullif(btrim(p_input->>'reason'),'') is null or char_length(btrim(p_input->>'reason'))>2000
  then raise exception 'finance_input_invalid'; end if;
  select i.* into payout from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
    where l.studio_id=p_studio_id and l.obligation_id=cost.obligation_id and l.component='payout';
  select i.* into item from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
    where l.studio_id=p_studio_id and l.obligation_id=cost.obligation_id and l.component=cost.component;
  perform set_config('studioflow.finance_occurrence_reconcile','on',true);
  if value>0 then
    select id into category from public.finance_categories where studio_id=p_studio_id and default_key='employer_costs' and archived_at is null;
    if category is null then raise exception 'finance_payroll_cost_category_required'; end if;
    if item.id is null then
      insert into public.finance_expected_items(studio_id,direction,amount,currency,category_id,description,due_date,expected_payment_date,commitment,certainty,is_established,created_by)
        values(p_studio_id,'outgoing',value,cost.currency,category,payout.description||' · '||cost.component,payout.due_date,payout.expected_payment_date,'agreed',state,false,auth.uid()) returning * into item;
      insert into public.finance_obligation_items(studio_id,obligation_id,expected_item_id,component) values(p_studio_id,cost.obligation_id,item.id,cost.component);
    else
      update public.finance_expected_items set amount=value,certainty=state,commitment='agreed',version=version+1,updated_at=now()
        where studio_id=p_studio_id and id=item.id;
    end if;
  elsif item.id is not null then
    update public.finance_expected_items set commitment='cancelled',version=version+1,updated_at=now() where studio_id=p_studio_id and id=item.id;
  end if;
  perform set_config('studioflow.finance_occurrence_reconcile',coalesce(previous_reconcile,''),true);
  insert into public.finance_payroll_cost_revisions(studio_id,obligation_id,component,revision,status,amount,reason,created_by)
    values(p_studio_id,cost.obligation_id,cost.component,cost.revision+1,state,value,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;
revoke all on function public.complete_finance_payroll_cost(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.complete_finance_payroll_cost(uuid,uuid,jsonb) to authenticated;
revoke all on function private.guard_finance_category_schedule_dependency(),private.guard_finance_payroll_cost_category() from public,anon,authenticated,service_role;

-- Unknown-cost diagnostics use explicit completion facts; cash aggregation is unchanged.
create or replace function private.calculate_finance_forecast_report(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_fx jsonb default '[]') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare setup public.finance_settings; today date:=(now() at time zone 'Europe/Kyiv')::date;
  first_day date:=date_trunc('month',today)::date; last_day date; digits integer; result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id;
  if setup.finalized_at is null then raise exception 'finance_finalized_setup_required'; end if;
  if p_horizon is null or p_horizon not in ('3','6','year','12') or p_scenario is null or p_scenario not in ('confirmed','planned') then raise exception 'finance_input_invalid'; end if;
  last_day:=case when p_horizon='year' then make_date(extract(year from today)::integer,12,31) else (first_day+make_interval(months=>p_horizon::integer)-interval '1 day')::date end;
  if jsonb_typeof(p_fx) is distinct from 'array' or jsonb_array_length(p_fx)>200 then raise exception 'finance_fx_invalid'; end if;
  if exists(select 1 from jsonb_to_recordset(p_fx) as f(currency text,rate numeric,source text,"effectiveDate" date)
    where f.currency is null or not exists(select 1 from public.finance_currencies c where c.code=f.currency)
    or f.rate is null or not(f.rate>0 and f.rate<=1000000000) or f.rate<>round(f.rate,10)
    or f.source is null or f.source not in ('manual','nbu') or f."effectiveDate" is distinct from today
    or (f.source='nbu' and setup.base_currency<>'UAH') or f.currency=setup.base_currency)
    or exists(select 1 from jsonb_to_recordset(p_fx) as f(currency text) group by currency having count(*)>1) then raise exception 'finance_fx_invalid'; end if;
  select minor_units into digits from public.finance_currencies where code=setup.base_currency;
  with fx as (
    select f.currency,f.rate,f.source,f."effectiveDate" as effective_date from jsonb_to_recordset(p_fx) as f(currency text,rate numeric,source text,"effectiveDate" date)
    union all select setup.base_currency,1,'identity',today
  ), expected as (
    select i.id,i.category_id,c.name as category,c.nature,i.direction,i.description,i.currency,i.remaining_amount,
      i.commitment,i.certainty,i.due_date,i.expected_payment_date,i.version,
      case when i.direction='outgoing' then greatest(coalesce(i.expected_payment_date,i.due_date),today)
        when coalesce(i.expected_payment_date,i.due_date)>=today then coalesce(i.expected_payment_date,i.due_date) end as cash_date,
      f.rate,round(i.remaining_amount*f.rate,digits) as reporting_amount,
      pi.project_id,pi.stream,oi.component,o.kind as obligation_kind,
      case when i.direction='incoming' and coalesce(i.expected_payment_date,i.due_date)<today then 'stale_incoming'
        when coalesce(i.expected_payment_date,i.due_date) is null then 'undated' end as timing_issue
    from public.finance_expected_balances i
    join public.finance_categories c on c.studio_id=i.studio_id and c.id=i.category_id
    left join fx f on f.currency=i.currency
    left join public.finance_project_items pi on pi.studio_id=i.studio_id and pi.expected_item_id=i.id
    left join public.finance_obligation_items oi on oi.studio_id=i.studio_id and oi.expected_item_id=i.id
    left join public.finance_obligations o on o.studio_id=oi.studio_id and o.id=oi.obligation_id
    where i.studio_id=p_studio_id and i.remaining_amount>0 and (i.commitment='agreed' or (p_scenario='planned' and i.commitment='tentative'))
  ), timed as (
    -- PostgreSQL greatest(NULL,today) is today: truly undated outgoings stay undated.
    select e.*,case when timing_issue='undated' then null else cash_date end as forecast_date from expected e
  ), remaining as (
    select date_trunc('month',forecast_date)::date as month,category_id,direction,nature,
      sum(reporting_amount) as amount,bool_or(reporting_amount is null) as incomplete
    from timed where forecast_date between today and last_day group by 1,2,3,4
  ), actual as (
    select date_trunc('month',financial_date)::date as month,category_id,direction,nature,sum(amount) as amount
    from public.finance_planning_actuals where studio_id=p_studio_id and financial_date between first_day and today group by 1,2,3,4
  ), budget as (
    select b.id,b.revision,make_date(b.year,n,1) as month,b.category_id,c.direction,c.nature,b.months[n] as amount
    from public.finance_current_budget b join public.finance_categories c on c.studio_id=b.studio_id and c.id=b.category_id
    cross join generate_series(1,12) n where b.studio_id=p_studio_id and make_date(b.year,n,1) between first_day and last_day
  ), keys as (
    select month,category_id,direction,nature from actual union select month,category_id,direction,nature from remaining union select month,category_id,direction,nature from budget
  ), comparisons as (
    select k.*,c.name as category,b.id as budget_revision_id,b.revision as budget_revision,b.amount::text as budget,
      coalesce(a.amount,0)::text as actual,coalesce(r.amount,0)::text as remaining,
      (coalesce(a.amount,0)+coalesce(r.amount,0))::text as full_period,coalesce(r.incomplete,false) as incomplete
    from keys k left join actual a on a.month=k.month and a.category_id is not distinct from k.category_id and a.direction=k.direction and a.nature=k.nature
    left join remaining r on r.month=k.month and r.category_id is not distinct from k.category_id and r.direction=k.direction and r.nature=k.nature
    left join budget b on b.month=k.month and b.category_id=k.category_id
    left join public.finance_categories c on c.studio_id=p_studio_id and c.id=k.category_id
  ), cash as (
    select coalesce(sum(round(b.recorded_balance*f.rate,digits)),0) as amount,
      coalesce(bool_or(f.rate is null and b.recorded_balance<>0),false) as incomplete
    from public.finance_account_balances b left join fx f on f.currency=b.currency where b.studio_id=p_studio_id
  ), months as (
    select d::date as month,coalesce(sum(case when r.direction='incoming' then r.amount else -r.amount end),0) as remaining
    from generate_series(first_day::timestamp,last_day::timestamp,interval '1 month') d left join remaining r on r.month=d::date group by d
  ), issues as (
    select 'expected' as source,id::text as id,description as label,coalesce(timing_issue,'missing_fx') as reason,currency,remaining_amount::text as amount,forecast_date as date
    from timed where (timing_issue is not null or rate is null) and (forecast_date is null or forecast_date<=last_day)
    union all
    select 'account',b.id::text,b.name,'missing_fx',b.currency,b.recorded_balance::text,null::date
    from public.finance_account_balances b left join fx f on f.currency=b.currency where b.studio_id=p_studio_id and f.rate is null and b.recorded_balance<>0
    union all
    select 'payroll',o.id::text,coalesce(o.employee_name,t.name),
      case when exists(select 1 from public.finance_payroll_unknown_costs c where c.studio_id=o.studio_id and c.obligation_id=o.id and c.component='employer_cost' and c.status='unknown') then 'unknown_employer_cost' else 'unknown_deductions' end,t.currency,null::text,o.period_start
    from public.finance_obligations o join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id
    where o.studio_id=p_studio_id and o.kind='payroll' and exists(select 1 from public.finance_payroll_unknown_costs c where c.studio_id=o.studio_id and c.obligation_id=o.id and c.status='unknown')
      and exists(select 1 from public.finance_obligation_items oi join public.finance_expected_items i on i.studio_id=oi.studio_id and i.id=oi.expected_item_id
        where oi.studio_id=o.studio_id and oi.obligation_id=o.id and i.commitment<>'cancelled' and coalesce(i.expected_payment_date,i.due_date,today)<=last_day)
    union all
    -- Coverage diagnostics only: no schedule amount is expanded into cash reporting.
    select 'schedule',s.id::text,t.name,'ungenerated_period',t.currency,null::text,d::date
    from public.finance_schedules s join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
    cross join generate_series((first_day-interval '1 month')::timestamp,last_day::timestamp,interval '1 month') d
    where s.studio_id=p_studio_id and d::date>=t.effective_from and (t.valid_through is null or d::date<=t.valid_through)
      and (t.commitment='agreed' or p_scenario='planned')
      and ((extract(year from d)-extract(year from t.effective_from))::integer*12+(extract(month from d)-extract(month from t.effective_from))::integer)%t.interval_months=0
      and (d+make_interval(months=>t.payment_month_offset))::date<=last_day
      and not exists(select 1 from public.finance_obligations o where o.studio_id=s.studio_id and o.schedule_id=s.id and o.period_start=d::date)
    union all
    select 'project',p.project_id::text,pr.name,'unscheduled_project',p.currency,p.unscheduled_amount::text,null::date
    from public.finance_project_totals p join public.projects pr on pr.studio_id=p.studio_id and pr.id=p.project_id
    where p.studio_id=p_studio_id and p.unscheduled_amount>0
    union all
    select 'project',t.project_id::text,pr.name,'ungenerated_supervision',t.currency,null::text,d::date
    from public.finance_project_terms t join public.projects pr on pr.studio_id=t.studio_id and pr.id=t.project_id
    cross join generate_series(first_day::timestamp,last_day::timestamp,interval '1 month') d
    where t.studio_id=p_studio_id and t.mode='monthly' and d::date>=t.effective_from and (t.effective_through is null or d::date<=t.effective_through)
      and not exists(select 1 from public.finance_project_terms newer where newer.studio_id=t.studio_id and newer.project_id=t.project_id and newer.stream=t.stream and newer.revision>t.revision and newer.effective_from<=d::date)
      and not exists(select 1 from public.finance_project_items i where i.studio_id=t.studio_id and i.project_id=t.project_id and i.source='monthly' and i.period_start=d::date)
  )
  select jsonb_build_object('version',1,'asOf',today,'from',first_day,'through',last_day,'cutover',setup.cutover_date,'currency',setup.base_currency,'scenario',p_scenario,'horizon',p_horizon,
    'fx',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'rate',rate::text,'source',source,'effectiveDate',effective_date) order by currency) from fx),'[]'::jsonb),
    'cashBase',(select amount::text from cash),'cashIncomplete',(select incomplete from cash),
    'comparisons',coalesce((select jsonb_agg(to_jsonb(c) order by c.month,c.direction,c.category_id) from comparisons c),'[]'::jsonb),
    'months',(select jsonb_agg(jsonb_build_object('month',month,'remaining',remaining::text,'closing',closing::text) order by month) from (select month,remaining,(select amount from cash)+sum(remaining) over(order by month) as closing from months) m),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'categoryId',category_id,'description',description,'direction',direction,'nature',nature,'currency',currency,'amount',remaining_amount::text,'reportingAmount',reporting_amount::text,'date',forecast_date,'dueDate',due_date,'expectedDate',expected_payment_date,'commitment',commitment,'certainty',certainty,'version',version,'projectId',project_id,'stream',stream,'component',component,'obligationKind',obligation_kind) order by forecast_date nulls last,id) from timed where forecast_date is null or forecast_date<=last_day),'[]'::jsonb),
    'issues',coalesce((select jsonb_agg(to_jsonb(i) order by source,id,date) from issues i),'[]'::jsonb)) into result;
  return result;
end $$;


create or replace function private.guard_finance_obligation_item() returns trigger
language plpgsql security definer set search_path='' as $$
declare component text;
begin
  if current_setting('studioflow.finance_occurrence_reconcile',true)='on' then return new; end if;
  select l.component into component from public.finance_obligation_items l where l.studio_id=old.studio_id and l.expected_item_id=old.id;
  if component is null then return new; end if;
  if row(new.amount,new.certainty,new.commitment) is distinct from row(old.amount,old.certainty,old.commitment)
    and exists(select 1 from public.finance_obligation_items l join public.finance_payroll_cost_revisions r
      on r.studio_id=l.studio_id and r.obligation_id=l.obligation_id and r.component=l.component
      where l.studio_id=old.studio_id and l.expected_item_id=old.id)
  then raise exception 'finance_payroll_cost_locked'; end if;
  if row(new.direction,new.currency,new.category_id,new.due_date) is distinct from row(old.direction,old.currency,old.category_id,old.due_date)
    or (component in ('payout','deductions','bonus') and row(new.amount,new.certainty) is distinct from row(old.amount,old.certainty)) then raise exception 'finance_obligation_locked'; end if;
  return new;
end $$;

