-- Cash planning never creates expectations or ledger entries.
create table public.finance_budget_revisions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id),
  year integer not null check(year between 1900 and 9998),
  category_id uuid not null,
  revision integer not null check(revision>0),
  currency text not null references public.finance_currencies(code),
  months numeric[] not null check(array_length(months,1)=12 and array_ndims(months)=1 and array_lower(months,1)=1),
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(studio_id,year,category_id,revision),
  foreign key(studio_id,category_id) references public.finance_categories(studio_id,id)
);
create index finance_budget_category_idx on public.finance_budget_revisions(studio_id,category_id);
create index finance_budget_creator_idx on public.finance_budget_revisions(created_by);
create index finance_budget_currency_idx on public.finance_budget_revisions(currency);

create table public.finance_forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id),
  name text not null check(char_length(btrim(name)) between 1 and 120),
  -- Versioned expectations, assumptions and cash baseline, never copied ledger rows.
  forecast jsonb not null check(jsonb_typeof(forecast)='object'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index finance_forecast_studio_idx on public.finance_forecast_snapshots(studio_id,created_at desc);
create index finance_forecast_creator_idx on public.finance_forecast_snapshots(created_by);
do $$declare name text; begin
  foreach name in array array['finance_budget_revisions','finance_forecast_snapshots'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
    execute format('grant select on public.%I to authenticated',name);
    execute format('create policy finance_admin_read on public.%I for select to authenticated using((select private.is_finance_admin(studio_id)))',name);
    execute format('create trigger finance_history_immutable before update or delete on public.%I for each row execute function private.reject_finance_history_change()',name);
  end loop;
end $$;
create view public.finance_current_budget with(security_invoker=true) as
select distinct on(studio_id,year,category_id) * from public.finance_budget_revisions order by studio_id,year,category_id,revision desc;
revoke all on public.finance_current_budget from public,anon,authenticated,service_role;
grant select on public.finance_current_budget to authenticated;

create function public.save_finance_budget(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; payload jsonb:=jsonb_build_object('operation','budget','input',p_input);
  setup public.finance_settings; previous integer; amounts numeric[]; digits integer; category uuid:=(p_input->>'categoryId')::uuid;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id;
  if setup.finalized_at is null then raise exception 'finance_finalized_setup_required'; end if;
  if not exists(select 1 from public.finance_categories where studio_id=p_studio_id and id=category and archived_at is null) then raise exception 'finance_category_invalid'; end if;
  select max(revision) into previous from public.finance_budget_revisions where studio_id=p_studio_id and year=(p_input->>'year')::integer and category_id=category;
  if coalesce(previous,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  if jsonb_typeof(p_input->'months') is distinct from 'array' then raise exception 'finance_amount_invalid'; end if;
  select array_agg(value::numeric order by ordinality) into amounts from jsonb_array_elements_text(p_input->'months') with ordinality;
  select minor_units into digits from public.finance_currencies where code=setup.base_currency;
  if coalesce(cardinality(amounts),0)<>12 or exists(select 1 from unnest(amounts) value where value is null or not(value>=0 and value<=9999999999.9999) or value<>round(value,digits)) then raise exception 'finance_amount_invalid'; end if;
  insert into public.finance_budget_revisions(studio_id,year,category_id,revision,currency,months,reason,created_by)
    values(p_studio_id,(p_input->>'year')::integer,category,coalesce(previous,0)+1,setup.base_currency,amounts,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

-- Reversals/refunds retain the original category direction as signed contra-cash.
-- Transfer principal stays separate; only the fee enters category expense actuals.
create view public.finance_planning_actuals with(security_invoker=true) as
select e.studio_id,e.financial_date,e.nature,
  case when e.entry_role='fee' then null else m.category_id end as category_id,
  case when e.entry_role='fee' then 'outgoing' else coalesce(c.direction,
    case when coalesce(original.kind,m.kind)='incoming' then 'incoming' else 'outgoing' end) end as direction,
  e.reporting_amount * case when e.entry_role='fee' then -1 when coalesce(c.direction,
    case when coalesce(original.kind,m.kind)='incoming' then 'incoming' else 'outgoing' end)='incoming' then 1 else -1 end as amount
from public.finance_cash_effects e
join public.finance_movements m on m.studio_id=e.studio_id and m.id=e.movement_id
left join public.finance_categories c on c.studio_id=m.studio_id and c.id=m.category_id
left join public.finance_movements related on related.studio_id=m.studio_id and related.id=m.related_movement_id
left join public.finance_movements original on original.studio_id=m.studio_id and original.id=case when related.kind='refund' then related.related_movement_id else related.id end
where e.nature<>'transfer';
revoke all on public.finance_planning_actuals from public,anon,authenticated,service_role;
grant select on public.finance_planning_actuals to authenticated;

-- One database statement sees one consistent source snapshot and uses exact numeric.
-- p_fx is an explicit flat-rate assumption per currency: {currency,rate,source,effectiveDate}.
create function public.calculate_finance_forecast(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_fx jsonb default '[]') returns jsonb
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
    select 'account',b.account_id::text,b.name,'missing_fx',b.currency,b.recorded_balance::text,null::date
    from public.finance_account_balances b left join fx f on f.currency=b.currency where b.studio_id=p_studio_id and f.rate is null and b.recorded_balance<>0
    union all
    select 'payroll',o.id::text,coalesce(o.employee_name,t.name),
      case when t.employer_cost_status='unknown' then 'unknown_employer_cost' else 'unknown_deductions' end,t.currency,null::text,o.period_start
    from public.finance_obligations o join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id
    where o.studio_id=p_studio_id and o.kind='payroll' and (t.employer_cost_status='unknown' or t.employee_deductions is null)
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

create function public.save_finance_forecast_snapshot(p_studio_id uuid,p_request_id uuid,p_name text,p_horizon text,p_scenario text,p_fx jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; report jsonb; payload jsonb:=jsonb_build_object('operation','forecast_snapshot','name',p_name,'horizon',p_horizon,'scenario',p_scenario,'fx',p_fx);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  report:=public.calculate_finance_forecast(p_studio_id,p_horizon,p_scenario,p_fx);
  -- Preserve remaining category/month results and baseline versions, not actuals.
  report:=jsonb_set(report,'{comparisons}',coalesce((select jsonb_agg(value-'actual'-'full_period') from jsonb_array_elements(report->'comparisons')),'[]'::jsonb));
  insert into public.finance_forecast_snapshots(studio_id,name,forecast,created_by) values(p_studio_id,btrim(p_name),report,auth.uid()) returning id into result;
  -- Avoid a second copy of the snapshot in the generic request audit.
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

-- Compare saved remaining expectations to cash actually recorded AFTER capture.
-- End-of-day is the snapshot boundary; capture-day actuals are deliberately excluded.
create function public.compare_finance_forecast_snapshot(p_studio_id uuid,p_snapshot_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare saved public.finance_forecast_snapshots; result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into saved from public.finance_forecast_snapshots where studio_id=p_studio_id and id=p_snapshot_id;
  if not found then raise exception 'finance_input_invalid'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('month',m->>'month','remaining',m->>'remaining','actual',coalesce(a.amount,0)::text) order by m->>'month'),'[]'::jsonb) into result
  from jsonb_array_elements(saved.forecast->'months') m
  left join lateral (select sum(case when direction='incoming' then amount else -amount end) as amount from public.finance_planning_actuals
    where studio_id=p_studio_id and financial_date>(saved.forecast->>'asOf')::date and financial_date<=(saved.forecast->>'through')::date
      and date_trunc('month',financial_date)::date=(m->>'month')::date) a on true;
  return result;
end $$;
revoke all on function public.save_finance_budget(uuid,uuid,jsonb),public.calculate_finance_forecast(uuid,text,text,jsonb),public.save_finance_forecast_snapshot(uuid,uuid,text,text,text,jsonb),public.compare_finance_forecast_snapshot(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_budget(uuid,uuid,jsonb),public.calculate_finance_forecast(uuid,text,text,jsonb),public.save_finance_forecast_snapshot(uuid,uuid,text,text,text,jsonb),public.compare_finance_forecast_snapshot(uuid,uuid) to authenticated;
