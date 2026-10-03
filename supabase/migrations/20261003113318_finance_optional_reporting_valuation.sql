-- Native cash remains immutable and exact. Reporting valuation may be unresolved.
alter table public.finance_movement_entries
  alter column reporting_amount drop not null,
  alter column fx_rate drop not null,
  alter column fx_source drop not null,
  alter column fx_effective_date drop not null,
  drop constraint finance_movement_entries_check;
alter table public.finance_movement_entries add constraint finance_entry_valuation_complete check (
  (currency<>reporting_currency and reporting_amount is null and fx_rate is null and fx_source is null and fx_effective_date is null)
  or (reporting_amount is not null and fx_rate is not null and fx_source is not null and fx_effective_date is not null
    and ((currency=reporting_currency and fx_source='identity' and fx_rate=1)
      or (currency<>reporting_currency and fx_source in ('manual','nbu'))))
);

create or replace function private.finance_valuation(p_currency text,p_base text,p_date date,p_amount numeric,p_fx jsonb)
returns table(rate numeric,source text,effective_date date,reporting_amount numeric)
language plpgsql stable security definer set search_path='' as $$
declare digits integer;
begin
  select minor_units into digits from public.finance_currencies where code=p_base;
  if p_currency=p_base then rate:=1; source:='identity'; effective_date:=p_date;
  else rate:=(p_fx->>'rate')::numeric; source:=p_fx->>'source'; effective_date:=(p_fx->>'effectiveDate')::date;
  end if;
  if digits is null or rate is null or not(rate>0 and rate<=1000000000 and rate=round(rate,10))
    or source is null or (p_currency<>p_base and source not in ('manual','nbu'))
    or effective_date is distinct from p_date then raise exception 'finance_fx_required'; end if;
  reporting_amount:=round(p_amount*rate,digits); return next;
end $$;

create or replace function private.add_finance_entry(p_studio uuid,p_movement uuid,p_account uuid,p_role text,p_amount numeric,p_fx jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare account public.finance_accounts; setup public.finance_settings; event public.finance_movements; digits integer; valuation record;
begin
  select * into account from public.finance_accounts where studio_id=p_studio and id=p_account and archived_at is null;
  if not found then raise exception 'finance_account_unavailable'; end if;
  select * into setup from public.finance_settings where studio_id=p_studio;
  select * into event from public.finance_movements where studio_id=p_studio and id=p_movement;
  select minor_units into digits from public.finance_currencies where code=account.currency;
  if p_amount is null or p_amount=0 or p_amount<>round(p_amount,digits) then raise exception 'finance_amount_invalid'; end if;
  if account.currency<>setup.base_currency and (p_fx is null or p_fx='null'::jsonb) then
    insert into public.finance_movement_entries(studio_id,movement_id,account_id,entry_role,currency,amount,reporting_currency)
    values(p_studio,p_movement,p_account,p_role,account.currency,p_amount,setup.base_currency);
    return;
  end if;
  select * into valuation from private.finance_valuation(account.currency,setup.base_currency,event.financial_date,p_amount,p_fx);
  insert into public.finance_movement_entries(studio_id,movement_id,account_id,entry_role,currency,amount,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date)
  values(p_studio,p_movement,p_account,p_role,account.currency,p_amount,setup.base_currency,valuation.reporting_amount,valuation.rate,valuation.source,valuation.effective_date);
end $$;

-- Complete missing metadata once; posted cash, identity and resolved rates stay immutable.
create function private.guard_finance_entry_valuation() returns trigger
language plpgsql security definer set search_path='' as $$
declare day date; digits integer;
begin
  if tg_op<>'UPDATE' or old.reporting_amount is not null or new.reporting_amount is null
    or (to_jsonb(new)-array['reporting_amount','fx_rate','fx_source','fx_effective_date'])
      is distinct from (to_jsonb(old)-array['reporting_amount','fx_rate','fx_source','fx_effective_date'])
    then raise exception 'finance_history_immutable'; end if;
  select case when m.kind='reversal' then original.financial_date else m.financial_date end into day
    from public.finance_movements m left join public.finance_movements original
      on original.studio_id=m.studio_id and original.id=m.related_movement_id
    where m.studio_id=new.studio_id and m.id=new.movement_id;
  select minor_units into digits from public.finance_currencies where code=new.reporting_currency;
  if new.fx_effective_date is distinct from day
    or new.reporting_amount is distinct from round(new.amount*new.fx_rate,digits)
    then raise exception 'finance_fx_required'; end if;
  return new;
end $$;
revoke all on function private.guard_finance_entry_valuation() from public,anon,authenticated,service_role;
drop trigger finance_entries_immutable on public.finance_movement_entries;
create trigger finance_entries_immutable before update or delete on public.finance_movement_entries
for each row execute function private.guard_finance_entry_valuation();

create function public.value_finance_movement(p_studio_id uuid,p_movement_id uuid,p_currency text,p_fx jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare movement public.finance_movements; entry public.finance_movement_entries; valuation record;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  select * into movement from public.finance_movements where studio_id=p_studio_id and id=p_movement_id;
  if not found then raise exception 'finance_input_invalid'; end if;
  if movement.kind='reversal' then
    select * into movement from public.finance_movements where studio_id=p_studio_id and id=movement.related_movement_id;
  end if;
  select * into entry from public.finance_movement_entries
    where studio_id=p_studio_id and movement_id=movement.id and currency=p_currency order by entry_role limit 1;
  if not found then raise exception 'finance_input_invalid'; end if;
  select * into valuation from private.finance_valuation(entry.currency,entry.reporting_currency,movement.financial_date,entry.amount,p_fx);
  if entry.reporting_amount is not null then
    if row(entry.fx_rate,entry.fx_source,entry.fx_effective_date) is not distinct from row(valuation.rate,valuation.source,valuation.effective_date) then return; end if;
    raise exception 'finance_valuation_locked';
  end if;
  -- Mirror any technical reversal, including a correction's original version.
  -- Real refunds retain their own date/valuation and are never completed here.
  update public.finance_movement_entries e set
    reporting_amount=round(e.amount*valuation.rate,c.minor_units),fx_rate=valuation.rate,
    fx_source=valuation.source,fx_effective_date=valuation.effective_date
  from public.finance_currencies c where c.code=e.reporting_currency and e.studio_id=p_studio_id and e.currency=p_currency
    and (e.movement_id=movement.id or e.movement_id in (
      select id from public.finance_movements where studio_id=p_studio_id and related_movement_id=movement.id and kind='reversal'));
end $$;
revoke all on function public.value_finance_movement(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.value_finance_movement(uuid,uuid,text,jsonb) to authenticated;

-- Same-date technical cancellation has no reporting effect even while its original
-- valuation is unresolved. Keep the original entries recoverable in history.
create or replace view public.finance_cash_effects with(security_invoker=true) as
select e.*,m.financial_date,m.kind,m.related_movement_id,
  case when e.entry_role='fee' then 'operating' else m.nature end as nature,
  case when e.entry_role='fee' then 'transfer_fee' else m.category end as category
from public.finance_movement_entries e join public.finance_movements m on m.studio_id=e.studio_id and m.id=e.movement_id
where e.reporting_amount is not null or (not exists(select 1 from public.finance_movements r
    where r.studio_id=m.studio_id and r.kind='reversal' and r.related_movement_id=m.id and r.financial_date=m.financial_date)
  and not (m.kind='reversal' and exists(select 1 from public.finance_movements original
    where original.studio_id=m.studio_id and original.id=m.related_movement_id and original.financial_date=m.financial_date)));

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
    select date_trunc('month',financial_date)::date as month,category_id,direction,nature,sum(amount) as amount,bool_or(amount is null) as incomplete
    from public.finance_planning_actuals where studio_id=p_studio_id and financial_date between first_day and today group by 1,2,3,4
  ), budget as (
    select b.id,b.revision,make_date(b.year,n,1) as month,b.category_id,c.direction,c.nature,b.months[n] as amount
    from public.finance_current_budget b join public.finance_categories c on c.studio_id=b.studio_id and c.id=b.category_id
    cross join generate_series(1,12) n where b.studio_id=p_studio_id and make_date(b.year,n,1) between first_day and last_day
  ), keys as (
    select month,category_id,direction,nature from actual union select month,category_id,direction,nature from remaining union select month,category_id,direction,nature from budget
  ), comparisons as (
    select k.*,c.name as category,b.id as budget_revision_id,b.revision as budget_revision,b.amount::text as budget,
      case when a.incomplete then null else coalesce(a.amount,0)::text end as actual,coalesce(r.amount,0)::text as remaining,
      case when a.incomplete then null else (coalesce(a.amount,0)+coalesce(r.amount,0))::text end as full_period,
      coalesce(a.incomplete,false) or coalesce(r.incomplete,false) as incomplete
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
    select 'payroll',o.employee_id::text,max(coalesce(o.employee_name,t.name)),
      case c.component when 'employer_cost' then 'unknown_employer_cost' else 'unknown_deductions' end,min(t.currency),null::text,min(o.period_start)
    from public.finance_obligations o join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id
    join public.finance_payroll_unknown_costs c on c.studio_id=o.studio_id and c.obligation_id=o.id and c.status='unknown'
    where o.studio_id=p_studio_id and o.kind='payroll'
      and exists(select 1 from public.finance_obligation_items oi join public.finance_expected_items i on i.studio_id=oi.studio_id and i.id=oi.expected_item_id
        where oi.studio_id=o.studio_id and oi.obligation_id=o.id and i.commitment<>'cancelled' and coalesce(i.expected_payment_date,i.due_date,today)<=last_day)
    group by o.employee_id,c.component
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

create or replace function public.get_finance_overview(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_fx jsonb default '[]',p_period text default '3') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare report jsonb; today date; first_day date; last_day date; digits integer; result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_period is null or p_period not in ('month','3','year') then raise exception 'finance_input_invalid'; end if;
  -- Also maintains automatic occurrences and takes the canonical Finance settings lock.
  report:=public.calculate_finance_forecast(p_studio_id,p_horizon,p_scenario,p_fx);
  today:=(report->>'asOf')::date; last_day:=(report->>'through')::date;
  first_day:=case p_period when 'month' then date_trunc('month',today)::date when 'year' then date_trunc('year',today)::date else (date_trunc('month',today)-interval '2 months')::date end;
  select minor_units into digits from public.finance_currencies where code=report->>'currency';
  with fx as (
    select * from jsonb_to_recordset(report->'fx') as f(currency text,rate numeric)
  ), accounts as (
    select b.id,b.name,b.currency,b.recorded_balance::text as native,round(b.recorded_balance*f.rate,digits)::text as amount
    from public.finance_account_balances b left join fx f on f.currency=b.currency where b.studio_id=p_studio_id
  ), receivables as (
    select i.id,i.description,i.currency,i.outstanding_amount::text as native,round(i.outstanding_amount*f.rate,digits)::text as amount,i.due_date as "dueDate",i.expected_payment_date as "expectedDate"
    from public.finance_expected_balances i left join fx f on f.currency=i.currency
    where i.studio_id=p_studio_id and i.direction='incoming' and i.outstanding_amount>0
  ), items as (
    select * from jsonb_to_recordset(report->'items') as i(id uuid,date date,direction text,"reportingAmount" numeric)
  ), opening as (
    select coalesce(sum(case when currency=report->>'currency' then opening_balance when opening_balance=0 then 0 else opening_reporting_amount end),0) as amount,
      coalesce(bool_or(currency<>report->>'currency' and opening_balance<>0 and opening_reporting_amount is null),false) as incomplete
    from public.finance_accounts where studio_id=p_studio_id
  ), effects as (
    select financial_date as date,sum(reporting_amount) as amount,bool_or(reporting_amount is null) as incomplete from public.finance_cash_effects
    where studio_id=p_studio_id and financial_date between (report->>'cutover')::date and today group by financial_date
  ), historical_dates as (
    select first_day as date union select today union select (report->>'cutover')::date where (report->>'cutover')::date between first_day and today
    union select date from effects where date>=first_day
    union select d::date from generate_series(first_day::timestamp,today::timestamp,interval '1 month') d
  ), history as (
    select d.date,case when d.date<(report->>'cutover')::date or (select incomplete from opening) or exists(select 1 from effects e where e.date<=d.date and e.incomplete) then null else
      (select amount from opening)+coalesce((select sum(e.amount) from effects e where e.date<=d.date),0) end as amount
    from historical_dates d
  ), projected_dates as (
    select today as date union select last_day union select date from items where date between today and last_day
    union select (m->>'month')::date from jsonb_array_elements(report->'months') m where (m->>'month')::date>today
  ), projection as (
    select d.date,(report->>'cashBase')::numeric+coalesce((select sum(case when i.direction='incoming' then i."reportingAmount" else -i."reportingAmount" end) from items i where i.date between today and d.date),0) as amount
    from projected_dates d
  ), flows as (
    select date_trunc('month',financial_date)::date as month,nature,direction,case when bool_or(amount is null) then null else sum(amount)::text end as amount
    from public.finance_planning_actuals where studio_id=p_studio_id and financial_date between first_day and today group by 1,2,3
  ), categories as (
    select c.category_id as id,c.category as name,c.direction,c.nature,
      case when bool_and(c.budget is not null) and count(*)=jsonb_array_length(report->'months') then sum(c.budget)::text end as budget,
      case when bool_or(c.actual is null) then null else sum(c.actual)::text end as actual,
      case when bool_or(c.full_period is null) then null else sum(c.full_period)::text end as forecast,bool_or(c.incomplete) as incomplete,
      case when bool_and(c.budget is not null) and count(*)=jsonb_array_length(report->'months') and bool_and(c.full_period is not null) then (sum(c.full_period)-sum(c.budget))::text end as variance
    from jsonb_to_recordset(report->'comparisons') as c(category_id uuid,category text,direction text,nature text,budget numeric,actual numeric,full_period numeric,incomplete boolean)
    group by 1,2,3,4
  )
  select jsonb_build_object('forecast',report,'period',p_period,'actualFrom',first_day,'upcomingThrough',least(today+30,last_day),
    'historyIncomplete',(select incomplete from opening) or exists(select 1 from effects where incomplete),
    'movementValuationIncomplete',exists(select 1 from public.finance_cash_effects where studio_id=p_studio_id and reporting_amount is null),
    'history',coalesce((select jsonb_agg(jsonb_build_object('date',date,'amount',amount::text) order by date) from history),'[]'),
    'projection',(select jsonb_agg(jsonb_build_object('date',date,'amount',amount::text) order by date) from projection),
    'lowPoint',(select jsonb_build_object('date',date,'amount',amount::text) from (select date,amount from projection union all select today,(report->>'cashBase')::numeric) p order by amount,date limit 1),
    'flows',coalesce((select jsonb_agg(to_jsonb(f) order by month,nature,direction) from flows f),'[]'),
    'netFlow',case when exists(select 1 from flows where amount is null) then null else coalesce((select sum(case when direction='incoming' then amount::numeric else -amount::numeric end) from flows),0)::text end,
    'accounts',coalesce((select jsonb_agg(to_jsonb(a) order by name,id) from accounts a),'[]'),
    'receivables',coalesce((select jsonb_agg(to_jsonb(r) order by "dueDate" nulls last,id) from receivables r),'[]'),
    'receivableTotal',coalesce((select sum(amount::numeric) from receivables),0)::text,
    'receivablesIncomplete',exists(select 1 from receivables where amount is null),
    'outgoingTotal',coalesce((select sum("reportingAmount") from items where direction='outgoing' and date between today and least(today+30,last_day)),0)::text,
    'outgoingIncomplete',exists(select 1 from items where direction='outgoing' and date between today and least(today+30,last_day) and "reportingAmount" is null),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by abs(variance::numeric) desc nulls last,name) from categories c),'[]'),
    'requiredCurrencies',coalesce((select jsonb_agg(distinct currency) from receivables where amount is null),'[]')
  ) into result;
  return result;
end $$;

create or replace function public.compare_finance_forecast_snapshot(p_studio_id uuid,p_snapshot_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare saved public.finance_forecast_snapshots; result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into saved from public.finance_forecast_snapshots where studio_id=p_studio_id and id=p_snapshot_id;
  if not found then raise exception 'finance_input_invalid'; end if;
  if saved.capture_order is null then raise exception 'finance_snapshot_boundary_missing'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('month',m->>'month','remaining',m->>'remaining','actual',case when a.incomplete then null else coalesce(a.amount,0)::text end) order by m->>'month'),'[]'::jsonb) into result
  from jsonb_array_elements(saved.forecast->'months') m
  left join lateral (select sum(case when direction='incoming' then amount else -amount end) as amount,bool_or(amount is null) as incomplete from public.finance_planning_actuals
    where studio_id=p_studio_id and financial_date>=(saved.forecast->>'asOf')::date and posting_order>saved.capture_order and financial_date<=(saved.forecast->>'through')::date
      and date_trunc('month',financial_date)::date=(m->>'month')::date) a on true;
  return result;
end $$;

-- Cash-linked trip receipts derive their net valuation from the movement. Personal
-- receipts keep their existing required valuation and immutable snapshot.
alter table public.finance_trip_entries drop constraint finance_trip_actual_valuation_required;
alter table public.finance_trip_entries add constraint finance_trip_actual_valuation_required check(
  kind='plan' or movement_id is not null or (reporting_amount is not null and fx_rate is not null and fx_source is not null and fx_effective_date is not null));
create or replace view public.finance_trip_entry_values with(security_invoker=true) as
select e.*,coalesce(c.amount,e.amount) as net_amount,
  case when e.movement_id is not null then c.reporting_amount else e.reporting_amount end as net_reporting_amount
from public.finance_trip_entries e left join lateral (
  select -coalesce(sum(v.amount),0) as amount,
    case when bool_or(v.reporting_amount is null) then null else -coalesce(sum(v.reporting_amount),0) end as reporting_amount
  from public.finance_cash_effects v join public.finance_movements m on m.studio_id=v.studio_id and m.id=v.movement_id
  where v.entry_role='primary' and m.studio_id=e.studio_id and (m.id=e.movement_id or m.related_movement_id=e.movement_id
    or m.related_movement_id in(select id from public.finance_movements where studio_id=e.studio_id and related_movement_id=e.movement_id))
) c on e.movement_id is not null;
create or replace view public.finance_trip_totals with(security_invoker=true) as
select t.*,s.base_currency as reporting_currency,case when v.foreign_plan then null else coalesce(v.plan,0)::text end as planned_amount,
  case when v.actual_incomplete then null else coalesce(v.actual,0)::text end as actual_amount,
  case when v.foreign_plan or v.actual_incomplete then null else (coalesce(v.actual,0)-coalesce(v.plan,0))::text end as variance,
  case when v.studio_incomplete then null else coalesce(v.studio_paid,0)::text end as studio_paid,
  case when v.employee_incomplete then null else coalesce(v.employee_paid,0)::text end as employee_paid
from public.finance_trips t join public.finance_settings s on s.studio_id=t.studio_id left join lateral (
  select sum(net_amount) filter(where kind='plan' and currency=s.base_currency) as plan,bool_or(kind='plan' and currency<>s.base_currency) as foreign_plan,
    sum(net_reporting_amount) filter(where kind='expense') as actual,
    bool_or(net_reporting_amount is null) filter(where kind='expense') as actual_incomplete,
    sum(net_reporting_amount) filter(where kind='expense' and employee_id is null) as studio_paid,
    bool_or(net_reporting_amount is null) filter(where kind='expense' and employee_id is null) as studio_incomplete,
    sum(net_reporting_amount) filter(where kind='expense' and employee_id is not null) as employee_paid,
    bool_or(net_reporting_amount is null) filter(where kind='expense' and employee_id is not null) as employee_incomplete
  from public.finance_trip_entry_values where studio_id=t.studio_id and trip_id=t.id
) v on true;

-- Preserve the existing refund/reallocation VAT baseline. A same-date technical
-- cancellation has zero economic effect; other missing VAT valuation stays NULL.
create or replace view public.finance_project_vat_actuals with(security_invoker=true) as
with assigned as (
  select a.studio_id,a.id,a.vat_amount,a.amount,a.payment_amount,a.movement_id,a.cause_movement_id,a.released_allocation_id,
    m.financial_date as original_date,
    e.amount as original_cash,case when e.reporting_amount is null and effective_e.id is null then 0 else e.reporting_amount end as original_reporting,e.reporting_currency,
    cause.financial_date as cause_date,cause.kind as cause_kind,
    ce.amount as cause_cash,case when ce.reporting_amount is null and ce.id is not null and effective_ce.id is null then 0 else ce.reporting_amount end as cause_reporting,
    c.minor_units as digits
  from public.finance_allocations a
  join public.finance_project_items p on p.studio_id=a.studio_id and p.expected_item_id=a.expected_item_id and p.stream<>'expenses'
  join public.finance_movements m on m.studio_id=a.studio_id and m.id=a.movement_id
  join public.finance_movement_entries e on e.studio_id=m.studio_id and e.movement_id=m.id and e.entry_role='primary'
  left join public.finance_cash_effects effective_e on effective_e.studio_id=e.studio_id and effective_e.id=e.id
  left join public.finance_movements cause on cause.studio_id=a.studio_id and cause.id=a.cause_movement_id
  left join public.finance_movement_entries ce on ce.studio_id=cause.studio_id and ce.movement_id=cause.id and ce.entry_role='primary'
  left join public.finance_cash_effects effective_ce on effective_ce.studio_id=ce.studio_id and effective_ce.id=ce.id
  join public.finance_currencies c on c.code=e.reporting_currency
  where m.kind='incoming' and m.nature='operating'
), reversed_refunds as (
  select a.*,r.financial_date as reversal_date,r.created_at as reversal_created_at,
    case when re.reporting_amount is null and effective_re.id is null then 0 else re.reporting_amount end as reversal_reporting
  from assigned a
  join public.finance_movements r on r.studio_id=a.studio_id and r.related_movement_id=a.cause_movement_id and r.kind='reversal'
  join public.finance_movement_entries re on re.studio_id=r.studio_id and re.movement_id=r.id and re.entry_role='primary'
  left join public.finance_cash_effects effective_re on effective_re.studio_id=re.studio_id and effective_re.id=re.id
  where a.cause_kind='refund'
), first_reversal as (
  select studio_id,movement_id,min(reversal_created_at) as first_at
  from reversed_refunds group by studio_id,movement_id
), baseline as (
  select f.studio_id,f.movement_id,
    greatest(0,abs(entry.amount)
      - coalesce((select sum(abs(refund_entry.amount)) from public.finance_movements refund
          join public.finance_movement_entries refund_entry on refund_entry.studio_id=refund.studio_id
            and refund_entry.movement_id=refund.id and refund_entry.entry_role='primary'
          where refund.studio_id=f.studio_id and refund.related_movement_id=f.movement_id
            and refund.kind='refund' and refund.created_at<f.first_at
            and not exists(select 1 from public.finance_movements undo where undo.studio_id=refund.studio_id
              and undo.related_movement_id=refund.id and undo.kind='reversal' and undo.created_at<=f.first_at)),0)
      - coalesce((select sum(a.payment_amount) from public.finance_allocations a
          where a.studio_id=f.studio_id and a.movement_id=f.movement_id and a.created_at<f.first_at),0)
      - coalesce((select sum(-a.payment_amount) from public.finance_allocations a
          join public.finance_movements undo on undo.studio_id=a.studio_id
            and undo.related_movement_id=a.cause_movement_id and undo.kind='reversal'
          where a.studio_id=f.studio_id and a.movement_id=f.movement_id and undo.created_at=f.first_at),0)
    ) as unapplied_cash
  from first_reversal f
  join public.finance_movement_entries entry on entry.studio_id=f.studio_id
    and entry.movement_id=f.movement_id and entry.entry_role='primary'
), new_positive as (
  select x.studio_id,x.id,x.movement_id,x.created_at,
    x.payment_amount+coalesce(manual.cash,0) as effective_cash,
    coalesce(sum(x.payment_amount+coalesce(manual.cash,0)) over(
      partition by x.studio_id,x.movement_id order by x.created_at,x.id
      rows between unbounded preceding and 1 preceding),0) as cash_before
  from first_reversal f
  join public.finance_allocations x on x.studio_id=f.studio_id and x.movement_id=f.movement_id
    and x.amount>0 and x.created_at>f.first_at
  left join lateral (
    select sum(release.payment_amount) as cash from public.finance_allocations release
    where release.studio_id=x.studio_id and release.released_allocation_id=x.id
      and release.cause_movement_id is null
  ) manual on true
), reused as (
  select f.studio_id,f.movement_id,
    greatest(0,coalesce(sum(x.effective_cash),0)-baseline.unapplied_cash) as payment_amount
  from first_reversal f
  join baseline on baseline.studio_id=f.studio_id and baseline.movement_id=f.movement_id
  left join new_positive x on x.studio_id=f.studio_id and x.movement_id=f.movement_id
  group by f.studio_id,f.movement_id,baseline.unapplied_cash
), reversal_parts as (
  select a.*,
    coalesce(sum(-a.payment_amount) over(partition by a.studio_id,a.movement_id order by a.reversal_created_at,a.id
      rows between unbounded preceding and 1 preceding),0) as earlier_restored_cash,
    coalesce(reused.payment_amount,0) as reused_cash
  from reversed_refunds a
  left join reused on reused.studio_id=a.studio_id and reused.movement_id=a.movement_id
), allocation_vat as (
  select studio_id,coalesce(a.released_allocation_id,a.id) as original_id,
    sum(round(original_reporting*payment_amount/abs(original_cash)*vat_amount/amount,digits)) as vat_reporting_amount
  from assigned a where cause_movement_id is null
  group by studio_id,original_id
), reassigned as (
  select x.studio_id,a.original_date,r.reversal_date,
    round(v.vat_reporting_amount*(bounds.upper_cash-x.cash_before)/x.effective_cash,a.digits)
      - round(v.vat_reporting_amount*(bounds.lower_cash-x.cash_before)/x.effective_cash,a.digits) as vat_reporting_amount
  from new_positive x
  join assigned a on a.studio_id=x.studio_id and a.id=x.id
  join allocation_vat v on v.studio_id=x.studio_id and v.original_id=x.id
  join baseline b on b.studio_id=x.studio_id and b.movement_id=x.movement_id
  join reversal_parts r on r.studio_id=x.studio_id and r.movement_id=x.movement_id
    and x.created_at>r.reversal_created_at
  cross join lateral (
    select greatest(x.cash_before,b.unapplied_cash+r.earlier_restored_cash) as lower_cash,
      least(x.cash_before+x.effective_cash,b.unapplied_cash+r.earlier_restored_cash-r.payment_amount) as upper_cash
  ) bounds
  where x.effective_cash>0 and bounds.upper_cash>bounds.lower_cash
), slices as (

  select studio_id,case when cause_movement_id is null then original_date else cause_date end as financial_date,
    case when cause_movement_id is null then round(original_reporting*payment_amount/abs(original_cash)*vat_amount/amount,digits)
      else round(cause_reporting*(-payment_amount)/abs(cause_cash)*vat_amount/amount,digits) end as vat_reporting_amount
  from assigned
  union all
  select studio_id,reversal_date,
    round(reversal_reporting*greatest(0,-payment_amount-greatest(0,reused_cash-earlier_restored_cash))
      /abs(cause_cash)*vat_amount/amount,digits)
  from reversal_parts
  union all
  select studio_id,original_date,-vat_reporting_amount from reassigned
  union all
  select studio_id,reversal_date,vat_reporting_amount from reassigned
)
select studio_id,financial_date,case when bool_or(vat_reporting_amount is null) then null else sum(vat_reporting_amount) end as vat_reporting_amount
from slices group by studio_id,financial_date;

