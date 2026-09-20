-- Reporting projection only: forecast timing, settlement and FX remain Phase 6A's responsibility.
create function public.get_finance_overview(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_fx jsonb default '[]',p_period text default '3') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare report jsonb; today date; first_day date; last_day date; digits integer; result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_period is null or p_period not in ('month','3','year') then raise exception 'finance_input_invalid'; end if;
  -- Also maintains automatic occurrences and takes the canonical Finance settings lock.
  report:=public.calculate_finance_forecast(p_studio_id,p_horizon,p_scenario,p_fx);
  today:=(report->>'asOf')::date; last_day:=(report->>'through')::date;
  first_day:=greatest((report->>'cutover')::date,case p_period when 'month' then date_trunc('month',today)::date when 'year' then date_trunc('year',today)::date else (date_trunc('month',today)-interval '2 months')::date end);
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
    select coalesce(sum(opening_balance) filter(where currency=report->>'currency'),0) as amount,
      coalesce(bool_or(currency<>report->>'currency' and opening_balance<>0),false) as incomplete
    from public.finance_accounts where studio_id=p_studio_id
  ), effects as (
    select financial_date as date,sum(reporting_amount) as amount from public.finance_cash_effects
    where studio_id=p_studio_id and financial_date<=today group by financial_date
  ), historical_dates as (
    select first_day as date union select today union select date from effects where date>=first_day
    union select d::date from generate_series(first_day::timestamp,today::timestamp,interval '1 month') d
  ), history as (
    select d.date,case when (select incomplete from opening) then null else
      (select amount from opening)+coalesce((select sum(e.amount) from effects e where e.date<=d.date),0) end as amount
    from historical_dates d
  ), projected_dates as (
    select today as date union select last_day union select date from items where date between today and last_day
    union select (m->>'month')::date from jsonb_array_elements(report->'months') m where (m->>'month')::date>today
  ), projection as (
    select d.date,(report->>'cashBase')::numeric+coalesce((select sum(case when i.direction='incoming' then i."reportingAmount" else -i."reportingAmount" end) from items i where i.date between today and d.date),0) as amount
    from projected_dates d
  ), flows as (
    select date_trunc('month',financial_date)::date as month,nature,direction,sum(amount)::text as amount
    from public.finance_planning_actuals where studio_id=p_studio_id and financial_date between first_day and today group by 1,2,3
  ), categories as (
    select c.category_id as id,c.category as name,c.direction,c.nature,
      case when bool_and(c.budget is not null) and count(*)=jsonb_array_length(report->'months') then sum(c.budget)::text end as budget,
      sum(c.actual)::text as actual,sum(c.full_period)::text as forecast,bool_or(c.incomplete) as incomplete,
      case when bool_and(c.budget is not null) and count(*)=jsonb_array_length(report->'months') then (sum(c.full_period)-sum(c.budget))::text end as variance
    from jsonb_to_recordset(report->'comparisons') as c(category_id uuid,category text,direction text,nature text,budget numeric,actual numeric,full_period numeric,incomplete boolean)
    group by 1,2,3,4
  )
  select jsonb_build_object('forecast',report,'period',p_period,'actualFrom',first_day,'upcomingThrough',least(today+30,last_day),
    'historyIncomplete',(select incomplete from opening),
    'history',coalesce((select jsonb_agg(jsonb_build_object('date',date,'amount',amount::text) order by date) from history),'[]'),
    'projection',(select jsonb_agg(jsonb_build_object('date',date,'amount',amount::text) order by date) from projection),
    'lowPoint',(select jsonb_build_object('date',date,'amount',amount::text) from (select date,amount from projection union all select today,(report->>'cashBase')::numeric) p order by amount,date limit 1),
    'flows',coalesce((select jsonb_agg(to_jsonb(f) order by month,nature,direction) from flows f),'[]'),
    'netFlow',coalesce((select sum(case when direction='incoming' then amount::numeric else -amount::numeric end) from flows),0)::text,
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
revoke all on function public.get_finance_overview(uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_overview(uuid,text,text,jsonb,text) to authenticated;
