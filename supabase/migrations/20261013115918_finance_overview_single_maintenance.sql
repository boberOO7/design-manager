-- Discovery is read-only; preparation owns the single schedule-maintenance pass.
create or replace function public.get_finance_overview_fx_context(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_period text default '3') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare setup public.finance_settings; today date:=(now() at time zone 'Europe/Kyiv')::date;
  first_day date:=date_trunc('month',today)::date; last_day date; currencies jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_period is null or p_period not in ('month','3','year') then raise exception 'finance_input_invalid'; end if;
  if p_horizon is null or p_horizon not in ('3','6','year','12') or p_scenario is null or p_scenario not in ('confirmed','planned') then raise exception 'finance_input_invalid'; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id;
  if setup.finalized_at is null then raise exception 'finance_finalized_setup_required'; end if;
  last_day:=case when p_horizon='year' then make_date(extract(year from today)::integer,12,31)
    else (first_day+make_interval(months=>p_horizon::integer)-interval '1 day')::date end;
  with needed as (
    -- Current account issues only require FX for nonzero recorded balances.
    select b.currency from public.finance_account_balances b
    where b.studio_id=p_studio_id and b.recorded_balance<>0
    union
    select i.currency from public.finance_expected_balances i
    where i.studio_id=p_studio_id and (
      -- Receivables span all dates, independently of the forecast horizon/scenario.
      (i.direction='incoming' and i.outstanding_amount>0)
      or (
        i.remaining_amount>0
        and (i.commitment='agreed' or (p_scenario='planned' and i.commitment='tentative'))
        -- Undated/stale incoming and overdue outgoing items remain in the forecast.
        and (coalesce(i.expected_payment_date,i.due_date) is null or coalesce(i.expected_payment_date,i.due_date)<=last_day)
        and exists(select 1 from public.finance_categories c where c.studio_id=i.studio_id and c.id=i.category_id)
      )
    )
  )
  select coalesce(jsonb_agg(currency order by currency),'[]'::jsonb) into currencies
  from needed where currency<>setup.base_currency;
  return jsonb_build_object('asOf',today,'currency',setup.base_currency,'requiredCurrencies',currencies);
end $$;

create function public.prepare_finance_overview_fx_context(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_period text default '3') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_period is null or p_period not in ('month','3','year') then raise exception 'finance_input_invalid'; end if;
  if p_horizon is null or p_horizon not in ('3','6','year','12') or p_scenario is null or p_scenario not in ('confirmed','planned') then raise exception 'finance_input_invalid'; end if;
  perform public.ensure_finance_schedule_occurrences(p_studio_id,p_horizon);
  return public.get_finance_overview_fx_context(p_studio_id,p_horizon,p_scenario,p_period);
end $$;

-- Same guarded definer boundary as calculate_finance_forecast, without another refresh.
-- Its existing private report function reads canonical sources and applies unchanged formulas.
create function private.calculate_finance_overview_forecast(p_studio_id uuid,p_horizon text,p_scenario text,p_fx jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  return private.calculate_finance_forecast_report(p_studio_id,p_horizon,p_scenario,p_fx);
end $$;

-- Share the existing Overview projection verbatim between maintained and read-only callers.
create function private.project_finance_overview_report(p_studio_id uuid,p_report jsonb,p_period text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare report jsonb:=p_report; today date; first_day date; last_day date; digits integer; result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_period is null or p_period not in ('month','3','year') then raise exception 'finance_input_invalid'; end if;
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

create or replace function public.get_finance_overview(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_fx jsonb default '[]',p_period text default '3') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare report jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_period is null or p_period not in ('month','3','year') then raise exception 'finance_input_invalid'; end if;
  report:=public.calculate_finance_forecast(p_studio_id,p_horizon,p_scenario,p_fx);
  return private.project_finance_overview_report(p_studio_id,report,p_period);
end $$;

-- After preparation, all report reads use one statement snapshot and perform no maintenance.
create function public.get_finance_overview_after_refresh(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_fx jsonb default '[]',p_period text default '3') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_period is null or p_period not in ('month','3','year') then raise exception 'finance_input_invalid'; end if;
  return private.project_finance_overview_report(p_studio_id,private.calculate_finance_overview_forecast(p_studio_id,p_horizon,p_scenario,p_fx),p_period);
end $$;

revoke all on function public.prepare_finance_overview_fx_context(uuid,text,text,text),public.get_finance_overview_after_refresh(uuid,text,text,jsonb,text),private.calculate_finance_overview_forecast(uuid,text,text,jsonb),private.project_finance_overview_report(uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_finance_overview_fx_context(uuid,text,text,text),public.get_finance_overview_after_refresh(uuid,text,text,jsonb,text),private.calculate_finance_overview_forecast(uuid,text,text,jsonb),private.project_finance_overview_report(uuid,jsonb,text) to authenticated;
