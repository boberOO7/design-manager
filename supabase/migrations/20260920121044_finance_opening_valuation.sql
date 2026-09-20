-- Opening stock valuation uses Phase 2's rate convention and metadata, never ledger entries.
-- Existing finalized foreign openings deliberately remain NULL until an admin completes them.
alter table public.finance_accounts
  add column opening_reporting_amount numeric,
  add column opening_fx_rate numeric,
  add column opening_fx_source text,
  add column opening_fx_effective_date date,
  add column opening_valued_at timestamptz,
  add column opening_valued_by uuid references public.profiles(id) on delete restrict,
  add constraint finance_opening_fx_complete check (
    num_nonnulls(opening_reporting_amount,opening_fx_rate,opening_fx_source,opening_fx_effective_date,opening_valued_at,opening_valued_by) in (0,6)),
  add constraint finance_opening_fx_rate_valid check (
    opening_fx_rate>0 and opening_fx_rate<=1000000000 and opening_fx_rate=round(opening_fx_rate,10)),
  add constraint finance_opening_fx_source_valid check (opening_fx_source in ('manual','nbu')),
  add constraint finance_opening_reporting_range check (opening_reporting_amount between -99999999999999999999 and 99999999999999999999);
create index finance_accounts_opening_valued_by_idx on public.finance_accounts(opening_valued_by) where opening_valued_by is not null;

create function private.guard_finance_opening_valuation() returns trigger
language plpgsql security definer set search_path='' as $$
declare setup public.finance_settings; digits integer;
begin
  select * into setup from public.finance_settings where studio_id=new.studio_id for update;
  if tg_op='UPDATE' then
    if setup.finalized_at is not null and old.opening_reporting_amount is not null and
      row(new.opening_reporting_amount,new.opening_fx_rate,new.opening_fx_source,new.opening_fx_effective_date,new.opening_valued_at,new.opening_valued_by)
      is distinct from row(old.opening_reporting_amount,old.opening_fx_rate,old.opening_fx_source,old.opening_fx_effective_date,old.opening_valued_at,old.opening_valued_by)
      then raise exception 'finance_opening_valuation_locked'; end if;
    if setup.finalized_at is null and (new.currency is distinct from old.currency or new.opening_balance is distinct from old.opening_balance) then
      new.opening_reporting_amount:=null; new.opening_fx_rate:=null; new.opening_fx_source:=null;
      new.opening_fx_effective_date:=null; new.opening_valued_at:=null; new.opening_valued_by:=null;
    end if;
  end if;
  if new.opening_reporting_amount is not null then
    select minor_units into digits from public.finance_currencies where code=setup.base_currency;
    if new.currency=setup.base_currency or new.opening_balance=0
      or new.opening_fx_effective_date is distinct from setup.cutover_date
      or (new.opening_fx_source='nbu' and setup.base_currency<>'UAH')
      or new.opening_reporting_amount is distinct from round(new.opening_balance*new.opening_fx_rate,digits)
      then raise exception 'finance_opening_fx_invalid'; end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_finance_opening_valuation() from public,anon,authenticated,service_role;
create trigger guard_finance_opening_valuation before insert or update on public.finance_accounts
for each row execute function private.guard_finance_opening_valuation();

create function private.guard_finance_opening_finalization() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.finalized_at is not null and (tg_op='INSERT' or old.finalized_at is null) then
    if tg_op='UPDATE' and (new.base_currency is distinct from old.base_currency or new.cutover_date is distinct from old.cutover_date)
      then raise exception 'finance_setup_context_changed'; end if;
    if exists(select 1 from public.finance_accounts a where a.studio_id=new.studio_id and a.currency<>new.base_currency
      and a.opening_balance<>0 and a.opening_reporting_amount is null) then raise exception 'finance_opening_fx_required'; end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_finance_opening_finalization() from public,anon,authenticated,service_role;
create trigger guard_finance_opening_finalization before insert or update on public.finance_settings
for each row execute function private.guard_finance_opening_finalization();

create function private.clear_draft_finance_opening_valuations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.finalized_at is null and (new.base_currency is distinct from old.base_currency or new.cutover_date is distinct from old.cutover_date) then
    update public.finance_accounts set opening_reporting_amount=null,opening_fx_rate=null,opening_fx_source=null,
      opening_fx_effective_date=null,opening_valued_at=null,opening_valued_by=null
    where studio_id=new.studio_id and opening_reporting_amount is not null;
  end if;
  return new;
end $$;
revoke all on function private.clear_draft_finance_opening_valuations() from public,anon,authenticated,service_role;
create trigger clear_draft_finance_opening_valuations after update on public.finance_settings
for each row execute function private.clear_draft_finance_opening_valuations();

create function public.value_finance_opening(p_studio_id uuid,p_account_id uuid,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare setup public.finance_settings; account public.finance_accounts; rate numeric; source text; effective date; digits integer;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id for update;
  if not found then raise exception 'finance_setup_required'; end if;
  -- Archived openings also belong to historical cash and must be completable.
  select * into account from public.finance_accounts where studio_id=p_studio_id and id=p_account_id;
  if not found then raise exception 'finance_account_unavailable'; end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' or
    account.currency is distinct from p_input->>'currency' or setup.base_currency is distinct from p_input->>'reportingCurrency'
    or account.opening_balance is distinct from (p_input->>'openingAmount')::numeric
    or setup.cutover_date is distinct from (p_input->>'date')::date then raise exception 'finance_setup_context_changed'; end if;
  if account.currency=setup.base_currency or account.opening_balance=0 then raise exception 'finance_opening_fx_unnecessary'; end if;
  rate:=(p_input->'fx'->>'rate')::numeric; source:=p_input->'fx'->>'source'; effective:=(p_input->'fx'->>'effectiveDate')::date;
  if rate is null or not(rate>0 and rate<=1000000000) or rate<>round(rate,10)
    or source is null or source not in ('manual','nbu') or effective is distinct from setup.cutover_date
    or (source='nbu' and setup.base_currency<>'UAH') then raise exception 'finance_opening_fx_invalid'; end if;
  if setup.finalized_at is not null and account.opening_reporting_amount is not null then
    if row(rate,source,effective) is not distinct from row(account.opening_fx_rate,account.opening_fx_source,account.opening_fx_effective_date) then return; end if;
    raise exception 'finance_opening_valuation_locked';
  end if;
  select minor_units into digits from public.finance_currencies where code=setup.base_currency;
  update public.finance_accounts set opening_reporting_amount=round(opening_balance*rate,digits),opening_fx_rate=rate,
    opening_fx_source=source,opening_fx_effective_date=effective,opening_valued_at=now(),opening_valued_by=auth.uid()
  where studio_id=p_studio_id and id=p_account_id;
end $$;
revoke all on function public.value_finance_opening(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.value_finance_opening(uuid,uuid,jsonb) to authenticated;

-- Only the historical opening CTE changes; current-balance, Budget and Forecast FX are unchanged.
-- Reporting projection only: forecast timing, settlement and FX remain Phase 6A's responsibility.
create or replace function public.get_finance_overview(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_fx jsonb default '[]',p_period text default '3') returns jsonb
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
    select coalesce(sum(case when currency=report->>'currency' then opening_balance when opening_balance=0 then 0 else opening_reporting_amount end),0) as amount,
      coalesce(bool_or(currency<>report->>'currency' and opening_balance<>0 and opening_reporting_amount is null),false) as incomplete
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
