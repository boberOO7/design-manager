-- An estimate describes remaining work at a reviewed economic cost boundary.
-- Existing estimates stay immutable and unverified; no historical inference.
alter table public.finance_project_cost_estimates add column source_digest text
  check(source_digest is null or source_digest ~ '^[a-f0-9]{32}$');
create or replace view public.finance_project_current_cost_estimates with(security_invoker=true) as
select e.* from public.finance_project_cost_estimates e where not exists(select 1 from public.finance_project_cost_estimates n
  where n.studio_id=e.studio_id and n.project_id=e.project_id and n.revision>e.revision);

create function private.finance_project_cost_state(p_studio uuid,p_project uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
with costs as (
  select jsonb_build_array('direct',e.id,e.currency,e.amount::text,e.recognized_on) as fact,e.recognized_on as day
  from public.finance_recognized_actuals e where e.studio_id=p_studio and e.project_id=p_project and e.classification='direct_cost'
  union all
  select jsonb_build_array('labor',a.entry_id,a.project_id,a.amount::text,p.available_native_amount::text,e.id,e.amount::text,e.recognized_on),e.recognized_on
  from public.finance_current_labor_allocations a join public.finance_labor_cost_pools p on p.studio_id=a.studio_id and p.id=a.entry_id
  join public.finance_recognized_actuals e on e.studio_id=p.studio_id and (e.id=p.id or e.related_entry_id=p.id)
  where a.studio_id=p_studio and a.project_id=p_project
)
select jsonb_build_object('projectId',p_project,'digest',md5(coalesce(jsonb_agg(fact order by fact::text),'[]'::jsonb)::text),'latestDate',max(day)) from costs;
$$;
revoke all on function private.finance_project_cost_state(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.save_finance_project_cost_estimate(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;payload jsonb:=jsonb_build_object('operation','project_cost_estimate','project',p_project_id,'input',p_input);
  setup public.finance_settings; previous integer;currency_code text:=p_input->>'currency';day date:=(p_input->>'date')::date;digits integer;
  direct numeric:=(p_input->>'directBudget')::numeric;labor numeric:=(p_input->>'laborBudget')::numeric;remaining_direct numeric:=(p_input->>'remainingDirect')::numeric;
  remaining_labor numeric:=(p_input->>'remainingLabor')::numeric;valuation record;rate numeric;source text;effective date;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id;
  select minor_units into digits from public.finance_currencies c where c.code=currency_code;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id) or day is null or day>(now() at time zone 'Europe/Kyiv')::date
    or day<setup.recognition_start_month or setup.recognition_start_month is null or digits is null
    or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000
    or exists(select 1 from unnest(array[direct,labor,remaining_direct,remaining_labor]) value where value<0 or value>9999999999.9999 or value<>round(value,digits)) then raise exception 'finance_input_invalid';end if;
  select coalesce(max(revision),0) into previous from public.finance_project_cost_estimates where studio_id=p_studio_id and project_id=p_project_id;
  if previous is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict';end if;
  if currency_code=setup.base_currency or p_input->'fx' is not null and p_input->'fx'<>'null'::jsonb then
    select * into valuation from private.finance_valuation(currency_code,setup.base_currency,day,1,p_input->'fx');rate:=valuation.rate;source:=valuation.source;effective:=valuation.effective_date;
  end if;
  insert into public.finance_project_cost_estimates(studio_id,project_id,revision,currency,as_of,direct_budget,labor_budget,remaining_direct,remaining_labor,
    reporting_currency,fx_rate,fx_source,fx_effective_date,reason,created_by,source_digest)
    values(p_studio_id,p_project_id,previous+1,currency_code,day,direct,labor,remaining_direct,remaining_labor,setup.base_currency,rate,source,effective,btrim(p_input->>'reason'),auth.uid(),private.finance_project_cost_state(p_studio_id,p_project_id)->>'digest') returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;

create or replace function public.get_finance_project_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare receipts jsonb;events jsonb;estimates jsonb;contracts jsonb;matched jsonb;cash_history jsonb;cost_states jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'description',m.description,'date',p.financial_date,'currency',p.currency,
    'original',p.original_amount::text,'remaining',p.net_amount::text,'unattributed',(p.net_amount-coalesce(a.total,0))::text,
    'revision',coalesce(r.revision,0),'items',coalesce(a.items,'[]')) order by p.financial_date desc,p.id),'[]') into receipts
  from public.finance_payment_availability p join public.finance_current_movements m on m.studio_id=p.studio_id and m.id=p.id
    left join lateral (select max(revision) as revision from public.finance_project_cash_revisions where studio_id=p.studio_id and movement_id=p.id) r on true
    left join lateral (select sum(net_amount) as total,jsonb_agg(jsonb_build_object('projectId',project_id,'amount',net_amount::text) order by project_id) filter(where net_amount>0) as items
      from public.finance_project_cash_net where studio_id=p.studio_id and movement_id=p.id) a on true
  where p.studio_id=p_studio_id and m.kind='incoming' and p.nature='operating' and p.net_amount>=0
    and not exists(select 1 from public.finance_allocations x join public.finance_trip_balances b on b.studio_id=x.studio_id and b.expected_item_id=x.expected_item_id
      where x.studio_id=p.studio_id and x.movement_id=p.id);
  select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('amount',e.amount::text,'source_reporting_amount',e.source_reporting_amount::text,
    'source_amount',e.source_amount::text,'fx_rate',e.fx_rate::text) order by e.financial_date,e.movement_id,e.project_id),'[]') into events
    from public.finance_project_cash_events e where e.studio_id=p_studio_id;
  select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('direct_budget',e.direct_budget::text,'labor_budget',e.labor_budget::text,
    'remaining_direct',e.remaining_direct::text,'remaining_labor',e.remaining_labor::text,'fx_rate',e.fx_rate::text) order by e.project_id,e.revision),'[]') into estimates
    from public.finance_project_cost_estimates e where e.studio_id=p_studio_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'project_id',t.project_id,'stream',t.stream,'mode',t.mode,'currency',t.currency,
    'net_amount',t.net_amount::text,'gross_amount',t.gross_amount::text,'effective_from',t.effective_from) order by t.project_id,t.stream),'[]') into contracts
    from public.finance_project_current_terms t where t.studio_id=p_studio_id;
  select coalesce(jsonb_agg(jsonb_build_object('projectId',t.project_id,'stream',t.stream,'currency',t.currency,'amount',t.collected_amount::text) order by t.project_id,t.stream,t.currency),'[]') into matched
    from public.finance_project_totals t where t.studio_id=p_studio_id and t.stream<>'expenses';
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'movementId',r.movement_id,'revision',r.revision,'reason',r.reason,
    'createdAt',r.created_at,'createdBy',r.created_by,'actor',coalesce(p.full_name,r.created_by::text),'currency',e.currency,'description',m.description,
    'items',coalesce((select jsonb_agg(jsonb_build_object('projectId',i.project_id,'amount',i.amount::text) order by i.project_id)
      from public.finance_project_cash_items i where i.studio_id=r.studio_id and i.revision_id=r.id),'[]')) order by r.movement_id,r.revision),'[]') into cash_history
    from public.finance_project_cash_revisions r join public.finance_movements m on m.studio_id=r.studio_id and m.id=r.movement_id
    join public.finance_movement_entries e on e.studio_id=r.studio_id and e.movement_id=r.movement_id and e.entry_role='primary'
    left join public.profiles p on p.id=r.created_by where r.studio_id=p_studio_id;
  select coalesce(jsonb_agg(private.finance_project_cost_state(p_studio_id,p.id) order by p.id),'[]') into cost_states
    from public.projects p where p.studio_id=p_studio_id;
  return jsonb_build_object('receipts',receipts,'events',events,'estimates',estimates,'contracts',contracts,'matched',matched,'cashHistory',cash_history,'costStates',cost_states);
end $$;

create or replace function public.get_finance_labor_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  return jsonb_build_object('allocationHistory',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'entryId',r.entry_id,'revision',r.revision,'method',r.method,'reason',r.reason,'createdAt',r.created_at,'createdBy',r.created_by,
    'items',coalesce((select jsonb_agg(jsonb_build_object('projectId',i.project_id,'amount',i.amount::text) order by i.project_id) from public.finance_labor_allocation_items i where i.studio_id=r.studio_id and i.revision_id=r.id),'[]')) order by r.entry_id,r.revision)
    from public.finance_labor_allocation_revisions r where r.studio_id=p_studio_id),'[]'),'missingPeriods',private.finance_missing_labor_periods(p_studio_id),'sources',public.get_finance_labor_sources(p_studio_id),
    'pools',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'obligation_id',p.obligation_id,'employee_id',p.employee_id,'description',p.description,
      'period_start',p.period_start,'period_end',p.period_end,'recognized_on',p.recognized_on,'currency',p.currency,'amount',p.amount::text,
      'reporting_currency',p.reporting_currency,'available_reporting_amount',p.available_reporting_amount::text,'allocated_amount',p.allocated_amount::text,
      'allocation_revision',p.allocation_revision,'fx_rate',p.fx_rate::text,'fx_source',p.fx_source,'fx_effective_date',p.fx_effective_date) order by p.period_start,p.description,p.id)
      from public.finance_labor_cost_pools p where p.studio_id=p_studio_id),'[]'),
    'allocations',coalesce((select jsonb_agg(jsonb_build_object('entry_id',a.entry_id,'project_id',a.project_id,'amount',a.amount::text,'revision',a.revision,'reason',a.reason,'created_at',a.created_at) order by a.entry_id,a.project_id)
      from public.finance_current_labor_allocations a where a.studio_id=p_studio_id),'[]'));
end $$;

-- Unvalued money is not zero in new definitive scenario risk metrics.
create or replace function private.project_finance_forecast_inputs(p_inputs jsonb,p_assumptions jsonb default '[]',p_horizon text default '6') returns jsonb
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
    'riskIncomplete',(select incomplete from cash) or exists(select 1 from timed where rate is null and (forecast_date is null or forecast_date<=last_day)),
    'incomplete',(select incomplete from cash) or exists(select 1 from issues),
    'issues',coalesce((select jsonb_agg(to_jsonb(i) order by source,id,date) from issues i),'[]'::jsonb)) into result;
  if (result->>'riskIncomplete')::boolean then
    result:=result||jsonb_build_object('lowPoint',null,'firstDeficit',null,'daily','[]'::jsonb);
  end if;
  return result;
end $$;

-- Coverage is a reviewed source boundary, not an everlasting assertion of zero.
create or replace view public.finance_current_report_coverage with(security_invoker=true) as
with current as (
  select distinct on(studio_id,project_id,month) * from public.finance_report_coverage order by studio_id,project_id,month,revision desc
)
select c.id,c.studio_id,c.project_id,c.month,c.reviewed_through,
  c.revenue_reviewed and not ('revenue'=any(changed.classes)) as revenue_reviewed,
  c.direct_costs_reviewed and not ('direct_cost'=any(changed.classes)) as direct_costs_reviewed,
  c.labor_reviewed and not ('labor'=any(changed.classes)) as labor_reviewed,
  c.overhead_reviewed and not ('overhead'=any(changed.classes)) as overhead_reviewed,
  c.revision,c.reason,c.created_by,c.created_at,cardinality(changed.classes)>0 as changed_since_review
from current c cross join lateral (
  select coalesce(array_agg(distinct classification),'{}'::text[]) as classes from (
    select e.classification from public.finance_recognition_entries e
    where e.studio_id=c.studio_id and e.created_at>c.created_at and e.recognized_on between c.month and c.reviewed_through
      and (c.project_id is null or e.project_id=c.project_id or e.classification='labor' and exists(
        select 1 from public.finance_labor_allocation_items i join public.finance_labor_allocation_revisions r on r.studio_id=i.studio_id and r.id=i.revision_id
        where r.studio_id=e.studio_id and r.entry_id=coalesce(e.related_entry_id,e.id) and i.project_id=c.project_id))
    union all
    select 'labor' from public.finance_labor_allocation_revisions r join public.finance_recognition_entries e on e.studio_id=r.studio_id and e.id=r.entry_id
    where c.project_id is not null and r.studio_id=c.studio_id and r.created_at>c.created_at and e.recognized_on between c.month and c.reviewed_through
      and exists(select 1 from public.finance_labor_allocation_items i join public.finance_labor_allocation_revisions h on h.studio_id=i.studio_id and h.id=i.revision_id
        where h.studio_id=r.studio_id and h.entry_id=r.entry_id and i.project_id=c.project_id)
  ) facts
) changed;

-- Every partial contra consumes a cumulative proportional slice of the original
-- rounded snapshot. Technical mirrors remain exact, including deferred FX fills.
create function private.finance_recognition_family_value(p_entry uuid,p_rate numeric) returns numeric
language plpgsql stable security invoker set search_path='' as $$
declare e public.finance_recognition_entries;original public.finance_recognition_entries;digits integer;consumed numeric;total numeric;
begin
  select * into e from public.finance_recognition_entries where id=p_entry;
  if not found then raise exception 'finance_input_invalid';end if;
  if e.reporting_amount is not null then return e.reporting_amount;end if;
  if e.kind='reversal' then return -private.finance_recognition_family_value(e.related_entry_id,p_rate);end if;
  select minor_units into digits from public.finance_currencies where code=e.reporting_currency;
  if e.kind='recognition' then return round(e.amount*p_rate,digits);end if;
  select * into original from public.finance_recognition_entries where studio_id=e.studio_id and id=e.related_entry_id and kind='recognition';
  if original.id is null then raise exception 'finance_input_invalid';end if;
  if e.source_kind='trip' and not exists(select 1 from public.finance_recognized_actuals where studio_id=e.studio_id and id=e.id) then
    return round(e.amount*p_rate,digits);
  end if;
  select -sum(a.amount) into consumed from public.finance_recognition_entries a
    where a.studio_id=e.studio_id and a.related_entry_id=original.id and a.kind='adjustment' and (a.created_at,a.id)<=(e.created_at,e.id)
      and (e.source_kind<>'trip' or exists(select 1 from public.finance_recognized_actuals x where x.studio_id=a.studio_id and x.id=a.id));
  total:=coalesce(original.reporting_amount,round(original.amount*p_rate,digits));
  return -(round(consumed*total/original.amount,digits)-round((consumed+e.amount)*total/original.amount,digits));
end $$;
revoke all on function private.finance_recognition_family_value(uuid,numeric) from public,anon,authenticated,service_role;

create or replace function public.adjust_finance_recognition(p_studio_id uuid,p_request_id uuid,p_entry_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','recognition_adjustment','entry',p_entry_id,'input',p_input);
  result uuid; original public.finance_recognition_entries; value numeric; vat numeric; report_value numeric; digits integer; day date; consumed numeric;consumed_vat numeric;consumed_report numeric; operation text:=p_input->>'operation';
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into original from public.finance_recognized_actuals where studio_id=p_studio_id and id=p_entry_id and kind='recognition';
  if not found or operation not in ('correction','cancel','adjustment') or operation is null
    or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000 then raise exception 'finance_input_invalid'; end if;
  if original.source_kind='trip' then raise exception 'finance_trip_source_owned'; end if;
  value:=case when operation='adjustment' then (p_input->>'amount')::numeric else original.amount end;
  day:=case when operation='adjustment' then (p_input->>'date')::date else original.recognized_on end;
  select minor_units into digits from public.finance_currencies where code=original.currency;
  if value is null or value<=0 or value<>round(value,digits) or day is null
    or day>(now() at time zone 'Europe/Kyiv')::date or day<original.recognized_on
    or operation='adjustment' and value>original.amount+coalesce((select sum(amount) from public.finance_recognition_entries
      where studio_id=p_studio_id and related_entry_id=original.id and kind='adjustment'),0)
    then raise exception 'finance_recognition_over_source'; end if;
  select coalesce(-sum(amount),0),coalesce(-sum(vat_amount),0),coalesce(-sum(reporting_amount),0) into consumed,consumed_vat,consumed_report
    from public.finance_recognized_actuals where studio_id=p_studio_id and related_entry_id=original.id and kind='adjustment';
  vat:=case when operation<>'adjustment' then original.vat_amount else round(original.vat_amount*(consumed+value)/original.amount,digits)-consumed_vat end;
  select minor_units into digits from public.finance_currencies where code=original.reporting_currency;
  report_value:=case when operation<>'adjustment' then original.reporting_amount else round(original.reporting_amount*(consumed+value)/original.amount,digits)-consumed_report end;
  -- An error correction also removes earlier economic adjustments to this fact.
  -- Mirror each signed child exactly; the original and its children then consume zero.
  if operation in ('correction','cancel') then
    insert into public.finance_recognition_entries(studio_id,kind,classification,source_kind,terms_id,expected_item_id,movement_id,obligation_id,employee_id,project_id,
      category_id,source_snapshot,period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,
      reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,related_entry_id,reason,created_by)
    select studio_id,'reversal',classification,source_kind,terms_id,expected_item_id,movement_id,obligation_id,employee_id,project_id,
      category_id,source_snapshot,period_start,period_end,recognized_on,description,currency,-amount,-vat_amount,-gross_amount,
      reporting_currency,-reporting_amount,fx_rate,fx_source,fx_effective_date,id,btrim(p_input->>'reason'),auth.uid()
    from public.finance_recognized_actuals where studio_id=p_studio_id and related_entry_id=original.id and kind='adjustment';
  end if;
  insert into public.finance_recognition_entries(studio_id,kind,classification,source_kind,terms_id,expected_item_id,movement_id,obligation_id,employee_id,project_id,
    category_id,source_snapshot,period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,
    reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,related_entry_id,reason,created_by)
  values(p_studio_id,case when operation='adjustment' then 'adjustment' else 'reversal' end,original.classification,original.source_kind,
    original.terms_id,original.expected_item_id,original.movement_id,original.obligation_id,original.employee_id,original.project_id,original.category_id,original.source_snapshot,
    original.period_start,original.period_end,day,original.description,original.currency,-value,-vat,-(value+vat),original.reporting_currency,
    -report_value,original.fx_rate,original.fx_source,original.fx_effective_date,original.id,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  if operation='correction' then result:=private.post_finance_recognition(p_studio_id,p_input->'replacement'); end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now()); return result;
end $$;

create or replace function public.value_finance_recognition(p_studio_id uuid,p_entry_id uuid,p_fx jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare entry public.finance_recognition_entries; valuation record;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  select * into entry from public.finance_recognition_entries where studio_id=p_studio_id and id=p_entry_id and kind='recognition';
  if not found then raise exception 'finance_input_invalid'; end if;
  select * into valuation from private.finance_valuation(entry.currency,entry.reporting_currency,entry.recognized_on,entry.amount,p_fx);
  if entry.reporting_amount is not null then
    if row(entry.fx_rate,entry.fx_source,entry.fx_effective_date) is not distinct from row(valuation.rate,valuation.source,valuation.effective_date) then return; end if;
    raise exception 'finance_valuation_locked';
  end if;
  with recursive family as (
    select id from public.finance_recognition_entries where studio_id=p_studio_id and id=entry.id
    union all select e.id from public.finance_recognition_entries e join family f on e.related_entry_id=f.id where e.studio_id=p_studio_id
  )
  update public.finance_recognition_entries e set reporting_amount=private.finance_recognition_family_value(e.id,valuation.rate),
    fx_rate=valuation.rate,fx_source=valuation.source,fx_effective_date=valuation.effective_date
  from family f where e.studio_id=p_studio_id and e.id=f.id and e.reporting_amount is null;
end $$;

create or replace function private.guard_finance_recognition_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare digits integer; expected numeric; original public.finance_recognition_entries; refunded numeric;
begin
  if tg_op<>'UPDATE' or old.reporting_amount is not null or new.reporting_amount is null
    or (to_jsonb(new)-array['reporting_amount','fx_rate','fx_source','fx_effective_date'])
      is distinct from (to_jsonb(old)-array['reporting_amount','fx_rate','fx_source','fx_effective_date'])
    then raise exception 'finance_history_immutable';end if;
  select minor_units into digits from public.finance_currencies where code=new.reporting_currency;
  if old.related_entry_id is not null then
    select * into original from public.finance_recognition_entries where studio_id=old.studio_id and id=old.related_entry_id;
    if original.fx_rate is not null and row(original.fx_rate,original.fx_source,original.fx_effective_date) is distinct from row(new.fx_rate,new.fx_source,new.fx_effective_date) then raise exception 'finance_fx_required';end if;
  end if;
  expected:=private.finance_recognition_family_value(old.id,new.fx_rate);
  if new.fx_effective_date is distinct from coalesce((new.source_snapshot->>'recognitionDate')::date,new.recognized_on)
    or new.reporting_amount is distinct from expected
    or (new.currency=new.reporting_currency and (new.fx_rate<>1 or new.fx_source<>'identity')) then raise exception 'finance_fx_required';end if;
  return new;
end $$;

-- Deterministic assumption occurrences must satisfy the shared RFC UUID contract.
create function private.finance_scenario_item_id(p_seed text) returns uuid
language sql immutable set search_path='' as $$
select (substr(value,1,12)||'3'||substr(value,14,3)||'8'||substr(value,18,15))::uuid from (select md5(p_seed) as value) digest;
$$;
revoke all on function private.finance_scenario_item_id(text) from public,anon,authenticated,service_role;

create or replace function private.apply_finance_scenario_assumptions(p_inputs jsonb,p_assumptions jsonb) returns jsonb
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
          extra:=extra||jsonb_build_array(source||jsonb_build_object('id',private.finance_scenario_item_id('scenario-expense:'||identifier||':'||day),'remaining_amount',amount::text,'due_date',day,'expected_payment_date',day));
        else
          first_month:=date_trunc('month',day)::date;
          for month in select d::date from generate_series(first_month::timestamp,least(finish,through)::timestamp,interval '1 month') d loop
            occurrence:=month+least(extract(day from day)::integer,extract(day from (month+interval '1 month'-interval '1 day'))::integer)-1;
            if occurrence>=day and occurrence<=finish then
              extra:=extra||jsonb_build_array(source||jsonb_build_object('id',private.finance_scenario_item_id('scenario-expense:'||identifier||':'||occurrence),'remaining_amount',amount::text,'due_date',occurrence,'expected_payment_date',occurrence));
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
          extra:=extra||jsonb_build_array(source||jsonb_build_object('id',private.finance_scenario_item_id('scenario-order:'||identifier||':'||(payment->>'id')),'remaining_amount',amount::text,'due_date',day,'expected_payment_date',day));
        end loop;
      end if;
    else raise exception 'finance_scenario_input_invalid';end if;
  end loop;
  return inputs||jsonb_build_object('expected',expected||extra,'fx',fx);
end $$;

create or replace function private.capture_finance_forecast_inputs(p_studio_id uuid,p_horizon text,p_scenario text,p_fx jsonb) returns jsonb
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
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'direction',c.direction,'nature',c.nature,'archivedAt',c.archived_at,'default_key',c.default_key,'custom_name',c.custom_name) order by c.id) from public.finance_categories c where c.studio_id=p_studio_id),'[]'),
    'currencies',(select jsonb_agg(jsonb_build_object('code',c.code,'minorUnits',c.minor_units) order by c.code) from public.finance_currencies c)) into result;
  return result;
end $$;
