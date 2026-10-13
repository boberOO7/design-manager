-- Discover the same FX scope without building cash history, projections or reports.
create function public.get_finance_overview_fx_context(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_period text default '3') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare setup public.finance_settings; today date:=(now() at time zone 'Europe/Kyiv')::date;
  first_day date:=date_trunc('month',today)::date; last_day date; currencies jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_period is null or p_period not in ('month','3','year') then raise exception 'finance_input_invalid'; end if;
  if p_horizon is null or p_horizon not in ('3','6','year','12') or p_scenario is null or p_scenario not in ('confirmed','planned') then raise exception 'finance_input_invalid'; end if;
  -- Keep occurrence maintenance ahead of currency discovery, including new payroll/recurring items.
  perform public.ensure_finance_schedule_occurrences(p_studio_id,p_horizon);
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
revoke all on function public.get_finance_overview_fx_context(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_overview_fx_context(uuid,text,text,text) to authenticated;
