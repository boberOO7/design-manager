-- Frozen native inputs reuse the existing Forecast sources and projection.
-- No legacy snapshot reconstruction and no scenario writes to operational sources.
alter table public.finance_forecast_snapshots add column native_inputs jsonb;
alter table public.finance_forecast_snapshots add constraint finance_forecast_native_version check(native_inputs is null or native_inputs->>'version'='2');
alter table public.finance_forecast_snapshots add constraint finance_forecast_snapshot_studio_id unique(studio_id,id);
create function private.capture_finance_forecast_inputs(p_studio_id uuid,p_horizon text,p_scenario text,p_fx jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
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
    where s.studio_id=p_studio_id and d::date>=t.effective_from and (t.valid_through is null or d::date<=t.valid_through)
      and (t.commitment='agreed' or p_scenario='planned')
      and ((extract(year from d)-extract(year from t.effective_from))::integer*12+(extract(month from d)-extract(month from t.effective_from))::integer)%t.interval_months=0
      and (d+make_interval(months=>t.payment_month_offset))::date<=last_day
      and not exists(select 1 from public.finance_obligations o where o.studio_id=s.studio_id and o.schedule_id=s.id and o.period_start=d::date)
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
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'direction',c.direction,'nature',c.nature,'archivedAt',c.archived_at) order by c.id) from public.finance_categories c where c.studio_id=p_studio_id),'[]'),
    'currencies',(select jsonb_agg(jsonb_build_object('code',c.code,'minorUnits',c.minor_units) order by c.code) from public.finance_currencies c)) into result;
  return result;
end $$;

create function private.apply_finance_scenario_assumptions(p_inputs jsonb,p_assumptions jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare inputs jsonb:=p_inputs;expected jsonb:=p_inputs->'expected';fx jsonb:=p_inputs->'fx';a jsonb;payment jsonb;source jsonb;category jsonb;extra jsonb:='[]';
  day date;finish date;occurrence date;first_month date;month date;today date:=(p_inputs->>'asOf')::date;through date:=(p_inputs->>'through')::date;
  amount numeric;rate numeric;digits integer;identifier uuid;seen_ids uuid[]:='{}';seen_items uuid[]:='{}';seen_fx text[]:='{}';currency_code text;seen_payments uuid[];
begin
  if jsonb_typeof(p_assumptions) is distinct from 'array' then raise exception 'finance_scenario_input_invalid';end if;
  for a in select value from jsonb_array_elements(p_assumptions) loop
    identifier:=(a->>'id')::uuid;
    if identifier is null or identifier=any(seen_ids) then raise exception 'finance_scenario_input_invalid';end if;
    seen_ids:=array_append(seen_ids,identifier);
    if a->>'type' in ('income_delay','expense_change') then
      if (a->>'itemId')::uuid is null or (a->>'itemId')::uuid=any(seen_items) then raise exception 'finance_scenario_input_invalid';end if;
      select value into source from jsonb_array_elements(expected) where value->>'id'=a->>'itemId';
      if source is null then raise exception 'finance_scenario_source_missing';end if;
      seen_items:=array_append(seen_items,(a->>'itemId')::uuid);
      day:=(a->>'date')::date;amount:=(a->>'amount')::numeric;
      if a->>'type'='income_delay' then
        if a ? 'amount' or source->>'direction'<>'incoming' or day is null or day<greatest(today,coalesce((source->>'expected_payment_date')::date,(source->>'due_date')::date,today))
          then raise exception 'finance_scenario_input_invalid';end if;
      else
        select (value->>'minorUnits')::integer into digits from jsonb_array_elements(p_inputs->'currencies') where value->>'code'=source->>'currency';
        if source->>'direction'<>'outgoing' or day is null and amount is null or day<today
          or amount<0 or amount>9999999999.9999 or amount<>round(amount,digits) then raise exception 'finance_scenario_input_invalid';end if;
      end if;
      source:=source||jsonb_build_object('assumptionId',identifier);
      if day is not null then source:=source||jsonb_build_object('expected_payment_date',day);end if;
      if amount is not null then source:=source||jsonb_build_object('remaining_amount',amount::text);end if;
      select coalesce(jsonb_agg(case when value->>'id'=a->>'itemId' then source else value end),'[]') into expected from jsonb_array_elements(expected);
    elsif a->>'type'='fx' then
      currency_code:=a->>'currency';rate:=(a->>'rate')::numeric;
      if currency_code is null or currency_code=any(seen_fx) or currency_code=p_inputs->>'currency'
        or not exists(select 1 from jsonb_array_elements(p_inputs->'currencies') where value->>'code'=currency_code)
        or rate is null or rate<=0 or rate>1000000000 or rate<>round(rate,10) then raise exception 'finance_scenario_input_invalid';end if;
      seen_fx:=array_append(seen_fx,currency_code);
      select coalesce(jsonb_agg(value),'[]') into fx from jsonb_array_elements(fx) where value->>'currency'<>currency_code;
      fx:=fx||jsonb_build_array(jsonb_build_object('currency',currency_code,'rate',rate::text,'source','manual','effectiveDate',today));
    elsif a->>'type' in ('expense','order') then
      currency_code:=a->>'currency';
      select (value->>'minorUnits')::integer into digits from jsonb_array_elements(p_inputs->'currencies') where value->>'code'=currency_code;
      select value into category from jsonb_array_elements(p_inputs->'categories') where value->>'id'=a->>'categoryId';
      if digits is null or category is null or category->>'archivedAt' is not null or category->>'nature'<>'operating'
        or category->>'direction'<>(case when a->>'type'='expense' then 'outgoing' else 'incoming' end)
        or char_length(btrim(coalesce(a->>'description',''))) not between 1 and 2000 then raise exception 'finance_scenario_input_invalid';end if;
      source:=jsonb_build_object('category_id',category->>'id','category',category->>'name','nature','operating',
        'direction',category->>'direction','description',btrim(a->>'description'),'currency',currency_code,'commitment','agreed','certainty','estimated','version',1,
        'project_id',null,'stream',null,'component',null,'obligation_kind',null,'assumptionId',identifier);
      if a->>'type'='expense' then
        day:=(a->>'date')::date;finish:=coalesce((a->>'endDate')::date,greatest(day,through));amount:=(a->>'amount')::numeric;
        if day is null or day<today or finish<day or amount is null or amount<=0 or amount>9999999999.9999 or amount<>round(amount,digits)
          or a->>'repeat' is null or a->>'repeat' not in ('once','monthly') then raise exception 'finance_scenario_input_invalid';end if;
        if a->>'repeat'='once' then
          extra:=extra||jsonb_build_array(source||jsonb_build_object('id',md5('scenario-expense:'||identifier||':'||day)::uuid,'remaining_amount',amount::text,'due_date',day,'expected_payment_date',day));
        else
          first_month:=date_trunc('month',day)::date;
          for month in select d::date from generate_series(first_month::timestamp,least(finish,through)::timestamp,interval '1 month') d loop
            occurrence:=month+least(extract(day from day)::integer,extract(day from (month+interval '1 month'-interval '1 day'))::integer)-1;
            if occurrence>=day and occurrence<=finish then
              extra:=extra||jsonb_build_array(source||jsonb_build_object('id',md5('scenario-expense:'||identifier||':'||occurrence)::uuid,'remaining_amount',amount::text,'due_date',occurrence,'expected_payment_date',occurrence));
            end if;
          end loop;
        end if;
      else
        if jsonb_typeof(a->'payments') is distinct from 'array' or jsonb_array_length(a->'payments')=0 then raise exception 'finance_scenario_input_invalid';end if;
        seen_payments:='{}';
        for payment in select value from jsonb_array_elements(a->'payments') loop
          day:=(payment->>'date')::date;amount:=(payment->>'amount')::numeric;
          if (payment->>'id')::uuid is null or (payment->>'id')::uuid=any(seen_payments) or day is null or day<today or amount is null or amount<=0 or amount>9999999999.9999
            or amount<>round(amount,digits) then raise exception 'finance_scenario_input_invalid';end if;
          seen_payments:=array_append(seen_payments,(payment->>'id')::uuid);
          extra:=extra||jsonb_build_array(source||jsonb_build_object('id',md5('scenario-order:'||identifier||':'||(payment->>'id'))::uuid,'remaining_amount',amount::text,'due_date',day,'expected_payment_date',day));
        end loop;
      end if;
    else raise exception 'finance_scenario_input_invalid';end if;
  end loop;
  return inputs||jsonb_build_object('expected',expected||extra,'fx',fx);
end $$;

create function private.project_finance_forecast_inputs(p_inputs jsonb,p_assumptions jsonb default '[]',p_horizon text default '6') returns jsonb
language plpgsql immutable set search_path='' as $$
declare inputs jsonb;today date:=(p_inputs->>'asOf')::date;first_day date:=date_trunc('month',today)::date;last_day date;
  digits integer:=(p_inputs->>'digits')::integer;result jsonb;
begin
  if p_inputs->>'version' is distinct from '2' or p_horizon is null or p_horizon not in ('3','6','year','12') then raise exception 'finance_scenario_input_invalid';end if;
  inputs:=private.apply_finance_scenario_assumptions(p_inputs,p_assumptions);
  last_day:=case when p_horizon='year' then make_date(extract(year from today)::integer,12,31) else (first_day+make_interval(months=>p_horizon::integer)-interval '1 day')::date end;
  with fx as (
    select f.currency,f.rate,f.source,f."effectiveDate" as effective_date from jsonb_to_recordset((inputs->'fx')) as f(currency text,rate numeric,source text,"effectiveDate" date)
    
  ), expected as (
    select i.*,case when i.direction='outgoing' then greatest(coalesce(i.expected_payment_date,i.due_date),today)
      when coalesce(i.expected_payment_date,i.due_date)>=today then coalesce(i.expected_payment_date,i.due_date) end as cash_date,
      f.rate,round(i.remaining_amount*f.rate,digits) as reporting_amount,
      case when i.direction='incoming' and coalesce(i.expected_payment_date,i.due_date)<today then 'stale_incoming'
        when coalesce(i.expected_payment_date,i.due_date) is null then 'undated' end as timing_issue
    from jsonb_to_recordset(inputs->'expected') as i(id uuid,category_id uuid,category text,nature text,direction text,description text,currency text,remaining_amount numeric,
      commitment text,certainty text,due_date date,expected_payment_date date,version integer,project_id uuid,stream text,component text,obligation_kind text,"assumptionId" uuid)
    left join fx f on f.currency=i.currency where i.remaining_amount>0 and (i.commitment='agreed' or inputs->>'scenario'='planned')
  ), timed as (
    -- PostgreSQL greatest(NULL,today) is today: truly undated outgoings stay undated.
    select e.*,case when timing_issue='undated' then null else cash_date end as forecast_date from expected e
  ), remaining as (
    select date_trunc('month',forecast_date)::date as month,category_id,direction,nature,
      sum(reporting_amount) as amount,bool_or(reporting_amount is null) as incomplete
    from timed where forecast_date between today and last_day group by 1,2,3,4
  ), actual as (
    select * from jsonb_to_recordset(inputs->'actuals') as a(month date,category_id uuid,direction text,nature text,amount numeric,incomplete boolean)
  ), budget as (
    select * from jsonb_to_recordset(inputs->'budgets') as b(id uuid,revision integer,month date,category_id uuid,direction text,nature text,amount numeric) where month<=last_day
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
    left join jsonb_to_recordset(inputs->'categories') as c(id uuid,name text) on c.id=k.category_id
  ), cash as (
    select coalesce(sum(round(b.amount*f.rate,digits)),0) as amount,
      coalesce(bool_or(f.rate is null and b.amount<>0),false) as incomplete
    from jsonb_to_recordset(inputs->'accounts') as b(id uuid,name text,currency text,amount numeric) left join fx f on f.currency=b.currency
  ), months as (
    select d::date as month,coalesce(sum(case when r.direction='incoming' then r.amount else -r.amount end),0) as remaining
    from generate_series(first_day::timestamp,last_day::timestamp,interval '1 month') d left join remaining r on r.month=d::date group by d
  ), issues as (
    select 'expected' as source,id::text as id,description as label,coalesce(timing_issue,'missing_fx') as reason,currency,remaining_amount::text as amount,forecast_date as date
    from timed where (timing_issue is not null or rate is null) and (forecast_date is null or forecast_date<=last_day)
    union all
    select 'account',b.id::text,b.name,'missing_fx',b.currency,b.amount::text,null::date
    from jsonb_to_recordset(inputs->'accounts') as b(id uuid,name text,currency text,amount numeric) left join fx f on f.currency=b.currency where f.rate is null and b.amount<>0
    union all
    select d.source,d.id,d.label,d.reason,d.currency,d.amount,d.date from jsonb_to_recordset(inputs->'diagnostics') as d(source text,id text,label text,reason text,currency text,amount text,date date,required_through date)
    where required_through is null or required_through<=last_day
  ), daily as (
    select day, (select amount from cash)+coalesce((select sum(case when direction='incoming' then reporting_amount else -reporting_amount end) from timed where forecast_date between today and d.day),0) as amount
    from (select today as day union select forecast_date from timed where forecast_date between today and last_day) d
  ), low_point as (
    select day,amount from (select day,amount from daily union all select today,(select amount from cash)) d order by amount,day limit 1
  )
  select jsonb_build_object('version',1,'asOf',today,'from',first_day,'through',last_day,'cutover',(inputs->>'cutover')::date,'currency',(inputs->>'currency'),'scenario',(inputs->>'scenario'),'horizon',p_horizon,
    'fx',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'rate',rate::text,'source',source,'effectiveDate',effective_date) order by currency) from fx),'[]'::jsonb),
    'cashBase',(select amount::text from cash),'cashIncomplete',(select incomplete from cash),
    'comparisons',coalesce((select jsonb_agg(to_jsonb(c) order by c.month,c.direction,c.category_id) from comparisons c),'[]'::jsonb),
    'months',(select jsonb_agg(jsonb_build_object('month',month,'remaining',remaining::text,'closing',closing::text) order by month) from (select month,remaining,(select amount from cash)+sum(remaining) over(order by month) as closing from months) m),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'categoryId',category_id,'description',description,'direction',direction,'nature',nature,'currency',currency,'amount',remaining_amount::text,'reportingAmount',reporting_amount::text,'date',forecast_date,'dueDate',due_date,'expectedDate',expected_payment_date,'commitment',commitment,'certainty',certainty,'version',version,'projectId',project_id,'stream',stream,'component',component,'obligationKind',obligation_kind,'assumptionId',"assumptionId") order by forecast_date nulls last,id) from timed where forecast_date is null or forecast_date<=last_day),'[]'::jsonb),
    'daily',(select jsonb_agg(jsonb_build_object('date',day,'amount',amount::text) order by day) from daily),
    'lowPoint',(select jsonb_build_object('date',day,'amount',amount::text) from low_point),
    'firstDeficit',(select min(day) from (select day from daily where amount<0 union all select today where (select amount from cash)<0) negative_days),
    'incomplete',(select incomplete from cash) or exists(select 1 from issues),
    'issues',coalesce((select jsonb_agg(to_jsonb(i) order by source,id,date) from issues i),'[]'::jsonb)) into result;
  return result;
end $$;

-- Existing API, source/maintenance ownership and report v1 contracts are preserved.
create or replace function private.calculate_finance_forecast_report(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_fx jsonb default '[]') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  return private.project_finance_forecast_inputs(private.capture_finance_forecast_inputs(p_studio_id,p_horizon,p_scenario,p_fx),'[]',p_horizon);
end $$;

create table public.finance_forecast_scenarios (
  id uuid primary key default gen_random_uuid(),studio_id uuid not null references public.finance_settings(studio_id),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(studio_id,id)
);
create table public.finance_forecast_scenario_revisions (
  id uuid primary key default gen_random_uuid(),studio_id uuid not null references public.finance_settings(studio_id),scenario_id uuid not null,
  revision integer not null check(revision>0),name text not null check(char_length(btrim(name)) between 1 and 120),base_snapshot_id uuid not null,
  assumptions jsonb not null check(jsonb_typeof(assumptions)='array'),reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(studio_id,scenario_id,revision),
  foreign key(studio_id,scenario_id) references public.finance_forecast_scenarios(studio_id,id),
  foreign key(studio_id,base_snapshot_id) references public.finance_forecast_snapshots(studio_id,id)
);
create index finance_scenario_base_idx on public.finance_forecast_scenario_revisions(studio_id,base_snapshot_id);
create index finance_scenario_creator_idx on public.finance_forecast_scenarios(created_by);
create index finance_scenario_revision_creator_idx on public.finance_forecast_scenario_revisions(created_by);
do $$declare name text;begin
  foreach name in array array['finance_forecast_scenarios','finance_forecast_scenario_revisions'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
    execute format('grant select on public.%I to authenticated',name);
    execute format('create policy finance_admin_read on public.%I for select to authenticated using((select private.is_finance_admin(studio_id)))',name);
    execute format('create trigger finance_scenario_history_immutable before update or delete on public.%I for each row execute function private.reject_finance_history_change()',name);
  end loop;
end $$;
create view public.finance_current_scenarios with(security_invoker=true) as
select r.* from public.finance_forecast_scenario_revisions r where not exists(select 1 from public.finance_forecast_scenario_revisions n where n.studio_id=r.studio_id and n.scenario_id=r.scenario_id and n.revision>r.revision);
revoke all on public.finance_current_scenarios from public,anon,authenticated,service_role;
grant select on public.finance_current_scenarios to authenticated;

create or replace function public.save_finance_forecast_snapshot(p_studio_id uuid,p_request_id uuid,p_name text,p_horizon text,p_scenario text,p_fx jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;report jsonb;inputs jsonb;payload jsonb:=jsonb_build_object('operation','forecast_snapshot','name',p_name,'horizon',p_horizon,'scenario',p_scenario,'fx',p_fx);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  -- Capture a full 12-month source window once. Pure 6/12 evaluations never materialize occurrences.
  perform public.ensure_finance_schedule_occurrences(p_studio_id,'12');
  inputs:=private.capture_finance_forecast_inputs(p_studio_id,p_horizon,p_scenario,p_fx);
  report:=private.project_finance_forecast_inputs(inputs,'[]',p_horizon);
  report:=jsonb_set(report,'{comparisons}',coalesce((select jsonb_agg(value-'actual'-'full_period') from jsonb_array_elements(report->'comparisons')),'[]'));
  insert into public.finance_forecast_snapshots(studio_id,name,forecast,native_inputs,created_by) values(p_studio_id,btrim(p_name),report,inputs,auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;

create function public.save_finance_forecast_scenario(p_studio_id uuid,p_request_id uuid,p_scenario_id uuid default null,p_input jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;payload jsonb:=jsonb_build_object('operation','forecast_scenario','scenario',p_scenario_id,'input',p_input);identity uuid:=p_scenario_id;
  previous public.finance_forecast_scenario_revisions;base public.finance_forecast_snapshots;revision integer;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select * into base from public.finance_forecast_snapshots where studio_id=p_studio_id and id=(p_input->>'baseId')::uuid;
  if not found or base.native_inputs is null then raise exception 'finance_scenario_base_required';end if;
  if char_length(btrim(coalesce(p_input->>'name',''))) not between 1 and 120 or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000
    or jsonb_typeof(p_input->'assumptions') is distinct from 'array' then raise exception 'finance_scenario_input_invalid';end if;
  if identity is not null then
    select * into previous from public.finance_current_scenarios where studio_id=p_studio_id and scenario_id=identity;
    if not found then raise exception 'finance_scenario_input_invalid';end if;
    revision:=previous.revision;
    if previous.base_snapshot_id<>base.id and (p_input->>'rebaseConfirmed')::boolean is distinct from true then raise exception 'finance_scenario_rebase_confirmation_required';end if;
  else revision:=0;end if;
  if revision is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict';end if;
  perform private.project_finance_forecast_inputs(base.native_inputs,p_input->'assumptions','12');
  if identity is null then insert into public.finance_forecast_scenarios(studio_id,created_by) values(p_studio_id,auth.uid()) returning id into identity;end if;
  insert into public.finance_forecast_scenario_revisions(studio_id,scenario_id,revision,name,base_snapshot_id,assumptions,reason,created_by)
    values(p_studio_id,identity,revision+1,btrim(p_input->>'name'),base.id,p_input->'assumptions',btrim(p_input->>'reason'),auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;

create function private.finance_scenario_base_changes(p_old jsonb,p_new jsonb,p_assumptions jsonb) returns jsonb
language sql immutable set search_path='' as $$
  with old_items as(select value from jsonb_array_elements(p_old->'expected')),new_items as(select value from jsonb_array_elements(p_new->'expected')),
  changes as(select coalesce(n.value->>'id',o.value->>'id') as id,coalesce(n.value->>'description',o.value->>'description') as label,
    case when n.value is null then 'missing' when o.value is null then 'added' else 'changed' end as status,o.value as before,n.value as after
    from old_items o full join new_items n on o.value->>'id'=n.value->>'id' where o.value is distinct from n.value)
  select jsonb_build_object('changes',coalesce((select jsonb_agg(to_jsonb(c) order by id) from changes c),'[]'),
    'invalidItemIds',coalesce((select jsonb_agg(a->>'itemId' order by a->>'itemId') from jsonb_array_elements(p_assumptions) a
      where a->>'type' in ('income_delay','expense_change') and not exists(select 1 from new_items n where n.value->>'id'=a->>'itemId')),'[]'),
    'cashChanged',p_old->'accounts' is distinct from p_new->'accounts' or p_old->'fx' is distinct from p_new->'fx');
$$;

create function public.get_finance_scenario_workspace(p_studio_id uuid,p_base_id uuid default null,p_horizon text default '6') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base public.finance_forecast_snapshots;bases jsonb;scenarios jsonb;changed boolean:=false;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  if p_horizon is null or p_horizon not in ('6','12') then raise exception 'finance_scenario_input_invalid';end if;
  if p_base_id is null then select * into base from public.finance_forecast_snapshots where studio_id=p_studio_id and native_inputs is not null order by capture_order desc limit 1;
  else select * into base from public.finance_forecast_snapshots where studio_id=p_studio_id and id=p_base_id;if not found then raise exception 'finance_scenario_base_required';end if;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'asOf',s.forecast->>'asOf','createdAt',s.created_at,'nativeVersion',(s.native_inputs->>'version')::integer) order by s.capture_order desc nulls last,s.created_at desc),'[]') into bases
    from public.finance_forecast_snapshots s where s.studio_id=p_studio_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'scenarioId',r.scenario_id,'revision',r.revision,'name',r.name,'baseId',r.base_snapshot_id,'baseName',old.name,'asOf',old.forecast->>'asOf',
    'assumptions',r.assumptions,'reason',r.reason,'createdAt',r.created_at,
    'history',coalesce((select jsonb_agg(jsonb_build_object('revision',h.revision,'name',h.name,'baseId',h.base_snapshot_id,'reason',h.reason,'createdAt',h.created_at,'assumptions',h.assumptions) order by h.revision desc) from public.finance_forecast_scenario_revisions h where h.studio_id=r.studio_id and h.scenario_id=r.scenario_id),'[]'),
    'report',case when base.native_inputs is not null and r.base_snapshot_id=base.id then private.project_finance_forecast_inputs(base.native_inputs,r.assumptions,p_horizon) end,
    'rebasePreview',case when base.native_inputs is not null and r.base_snapshot_id<>base.id then private.finance_scenario_base_changes(old.native_inputs,base.native_inputs,r.assumptions) end) order by r.created_at desc,r.id),'[]') into scenarios
    from public.finance_current_scenarios r join public.finance_forecast_snapshots old on old.studio_id=r.studio_id and old.id=r.base_snapshot_id where r.studio_id=p_studio_id;
  if base.native_inputs is not null then
    changed:=exists(select 1 from jsonb_array_elements(base.native_inputs->'expected') frozen
      left join public.finance_expected_balances live on live.studio_id=p_studio_id and live.id=(frozen->>'id')::uuid
      where live.id is null or live.version<>(frozen->>'version')::integer or live.remaining_amount is distinct from (frozen->>'remaining_amount')::numeric
        or live.expected_payment_date is distinct from (frozen->>'expected_payment_date')::date or live.due_date is distinct from (frozen->>'due_date')::date)
      or exists(select 1 from public.finance_expected_balances live where live.studio_id=p_studio_id and live.remaining_amount>0 and live.commitment in ('agreed','tentative')
        and not exists(select 1 from jsonb_array_elements(base.native_inputs->'expected') frozen where frozen->>'id'=live.id::text))
      or (select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'currency',b.currency,'amount',b.recorded_balance::text) order by b.id),'[]') from public.finance_account_balances b where b.studio_id=p_studio_id) is distinct from base.native_inputs->'accounts'
      or exists(select 1 from jsonb_array_elements(base.native_inputs->'budgets') frozen where not exists(select 1 from public.finance_current_budget b where b.studio_id=p_studio_id and b.id=(frozen->>'id')::uuid))
      or exists(select 1 from public.finance_current_budget b where b.studio_id=p_studio_id and b.year between extract(year from (base.native_inputs->>'from')::date)::integer and extract(year from (base.native_inputs->>'through')::date)::integer and not exists(select 1 from jsonb_array_elements(base.native_inputs->'budgets') frozen where frozen->>'id'=b.id::text));
  end if;
  return jsonb_build_object('bases',bases,'base',case when base.native_inputs is not null then jsonb_build_object('id',base.id,'name',base.name,'inputs',base.native_inputs) end,
    'baseline',case when base.native_inputs is not null then private.project_finance_forecast_inputs(base.native_inputs,'[]',p_horizon) end,'scenarios',scenarios,'sourceChanged',changed);
end $$;
revoke all on function private.capture_finance_forecast_inputs(uuid,text,text,jsonb),private.apply_finance_scenario_assumptions(jsonb,jsonb),private.project_finance_forecast_inputs(jsonb,jsonb,text),private.finance_scenario_base_changes(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.save_finance_forecast_scenario(uuid,uuid,uuid,jsonb),public.get_finance_scenario_workspace(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_forecast_scenario(uuid,uuid,uuid,jsonb),public.get_finance_scenario_workspace(uuid,uuid,text) to authenticated;

-- Read-only capture preview. Opening saved scenarios must not maintain real occurrences.
create function public.get_finance_forecast_capture_preview(p_studio_id uuid,p_scenario text default 'confirmed',p_fx jsonb default '[]') returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  return private.project_finance_forecast_inputs(private.capture_finance_forecast_inputs(p_studio_id,'12',p_scenario,p_fx),'[]','12');
end $$;
revoke all on function public.get_finance_forecast_capture_preview(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_forecast_capture_preview(uuid,text,jsonb) to authenticated;
