-- Commercial ownership is resolved from immutable foreign keys, never by rewriting
-- historical recognition snapshots. Reversal/adjustment lineage inherits its source.
create function private.finance_recognition_order(p_studio uuid,p_entry uuid) returns uuid
language sql stable security invoker set search_path='' as $$
  with recursive lineage as (
    select r.id,r.terms_id,r.expected_item_id,r.related_entry_id,0 as depth
      from public.finance_recognition_entries r where r.studio_id=p_studio and r.id=p_entry
    union all
    select r.id,r.terms_id,r.expected_item_id,r.related_entry_id,l.depth+1
      from lineage l join public.finance_recognition_entries r on r.studio_id=p_studio and r.id=l.related_entry_id
  ) select coalesce(t.order_id,i.order_id) from lineage l
      left join public.finance_project_terms t on t.studio_id=p_studio and t.id=l.terms_id
      left join public.finance_project_items i on i.studio_id=p_studio and i.expected_item_id=l.expected_item_id
    where coalesce(t.order_id,i.order_id) is not null order by l.depth limit 1
$$;
revoke all on function private.finance_recognition_order(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.finance_recognition_order(uuid,uuid) to authenticated;


create or replace function private.post_finance_recognition(p_studio uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare setup public.finance_settings; terms public.finance_project_terms; item public.finance_expected_items;
  movement public.finance_movements; cash public.finance_movement_entries; cat public.finance_categories;
  project uuid:=nullif(p_input->>'projectId','')::uuid; source_id uuid:=(p_input->>'sourceId')::uuid;
  classification text:=p_input->>'classification'; source_kind text:=p_input->>'sourceKind';
  value numeric:=(p_input->>'amount')::numeric; day date:=(p_input->>'date')::date;
  first_day date:=(p_input->>'periodStart')::date; last_day date:=(p_input->>'periodEnd')::date;
  digits integer; cap numeric; consumed numeric; snapshot_consumed numeric; consumed_vat numeric; root_item uuid; snapshot jsonb; parts record; valuation record; rate numeric; fx_source text; fx_date date; report_value numeric; result uuid;
begin
  select * into setup from public.finance_settings where studio_id=p_studio;
  if setup.recognition_start_month is null then raise exception 'finance_recognition_inactive'; end if;
  if day is null or first_day is null or last_day is null or first_day>last_day or day not between first_day and last_day
    or first_day<setup.recognition_start_month or last_day>(now() at time zone 'Europe/Kyiv')::date
    or char_length(btrim(coalesce(p_input->>'description',''))) not between 1 and 2000
    or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000
    then raise exception 'finance_input_invalid'; end if;
  if project is not null and not exists(select 1 from public.projects where studio_id=p_studio and id=project)
    then raise exception 'finance_project_invalid'; end if;
  if source_kind='project_terms' then
    select * into terms from public.finance_project_current_terms where studio_id=p_studio and id=source_id and stream='design'
      and exists(select 1 from public.finance_project_orders o where o.studio_id=p_studio and o.id=order_id and o.status='confirmed');
    if not found or classification<>'revenue' or terms.project_id is distinct from project or terms.gross_amount is null
      then raise exception 'finance_recognition_source_invalid'; end if;
    select * into cat from public.finance_categories where studio_id=p_studio and default_key='project_payments';
    snapshot:=to_jsonb(terms); cap:=terms.net_amount;
    select minor_units into digits from public.finance_currencies where code=terms.currency;
    select * into parts from private.finance_vat_parts(value,terms.vat_rate,'net',digits);
    -- Revisions share one allowance within this order; another order has its own cap.
    select coalesce(sum(r.amount),0) into consumed from public.finance_recognition_entries r
      where r.studio_id=p_studio and r.project_id=project and r.classification='revenue' and r.currency=terms.currency
        and private.finance_recognition_order(r.studio_id,r.id)=terms.order_id;
    select coalesce(sum(r.amount),0),coalesce(sum(r.vat_amount),0) into snapshot_consumed,consumed_vat
      from public.finance_recognition_entries r where r.studio_id=p_studio and r.terms_id=terms.id;
  elsif source_kind='expected' then
    select * into item from public.finance_expected_items where studio_id=p_studio and id=source_id and commitment='agreed' and certainty='fixed';
    if not found or exists(select 1 from public.finance_obligation_items l join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id where l.studio_id=p_studio and l.expected_item_id=source_id and o.kind in ('payroll','bonus'))
      or exists(select 1 from public.finance_trip_entries where studio_id=p_studio and expected_item_id=source_id)
      or exists(select 1 from public.finance_trip_balances where studio_id=p_studio and expected_item_id=source_id)
      then raise exception 'finance_recognition_source_invalid'; end if;
    select * into cat from public.finance_categories where studio_id=p_studio and id=item.category_id and nature='operating' and default_key is distinct from 'salary' and default_key is distinct from 'employee_bonus';
    if not found or (item.direction='incoming') is distinct from (classification='revenue')
      or classification='labor' then raise exception 'finance_recognition_source_invalid'; end if;
    if exists(select 1 from public.finance_project_items where studio_id=p_studio and expected_item_id=source_id and project_id is distinct from project)
      then raise exception 'finance_project_invalid'; end if;
    if classification='direct_cost' and not cat.project_expense_enabled then raise exception 'finance_category_invalid'; end if;
    root_item:=private.finance_recognition_expected_root(p_studio,source_id);
    snapshot:=to_jsonb(item)||coalesce((select to_jsonb(p) from public.finance_project_items p where p.studio_id=p_studio and p.expected_item_id=source_id),'{}'::jsonb)||jsonb_build_object('economicExpectedId',root_item);
    cap:=item.net_amount; select minor_units into digits from public.finance_currencies where code=item.currency;
    select * into parts from private.finance_vat_parts(value,item.vat_rate,'net',digits);
    select coalesce(sum(r.amount),0),coalesce(sum(r.vat_amount),0) into consumed,consumed_vat from public.finance_recognition_entries r
      where r.studio_id=p_studio and (r.expected_item_id=root_item or r.source_snapshot->>'economicExpectedId'=root_item::text);
    snapshot_consumed:=consumed;
    if snapshot->>'stream'='design' then
      select * into terms from public.finance_project_current_terms where studio_id=p_studio and project_id=project and stream='design'
        and order_id=(snapshot->>'order_id')::uuid
        and exists(select 1 from public.finance_project_orders o where o.studio_id=p_studio and o.id=order_id and o.status='confirmed');
      if not found or terms.currency<>item.currency or value+(select coalesce(sum(r.amount),0) from public.finance_recognition_entries r
        where r.studio_id=p_studio and r.project_id=project and r.classification='revenue' and r.currency=item.currency
          and private.finance_recognition_order(r.studio_id,r.id)=terms.order_id)>terms.net_amount
        then raise exception 'finance_recognition_over_source'; end if;
      terms:=null;
    end if;
  elsif source_kind='movement' then
    select * into movement from public.finance_current_movements where studio_id=p_studio and id=source_id and kind='outgoing' and nature='operating';
    if not found or classification not in ('direct_cost','overhead') or coalesce((movement.request_payload->>'allocationIntent')::boolean,false)
      or exists(select 1 from public.finance_allocations where studio_id=p_studio and movement_id=source_id)
      or exists(select 1 from public.finance_trip_entries where studio_id=p_studio and movement_id=source_id)
      then raise exception 'finance_recognition_source_invalid'; end if;
    select * into cash from public.finance_movement_entries where studio_id=p_studio and movement_id=source_id and entry_role='primary';
    select * into cat from public.finance_categories where studio_id=p_studio and id=movement.category_id and default_key is distinct from 'salary' and default_key is distinct from 'employee_bonus';
    if classification='direct_cost' and not cat.project_expense_enabled then raise exception 'finance_category_invalid'; end if;
    snapshot:=to_jsonb(movement)||jsonb_build_object('currency',cash.currency); cap:=abs(cash.amount);
    select minor_units into digits from public.finance_currencies where code=cash.currency;
    select * into parts from private.finance_vat_parts(value,null,'net',digits);
    select coalesce(sum(amount),0) into consumed from public.finance_recognition_entries where studio_id=p_studio and movement_id=source_id;
  else raise exception 'finance_recognition_source_invalid'; end if;
  if cat.id is null or value is null or value<=0 or value<>round(value,digits) or value+consumed>cap
    then raise exception 'finance_recognition_over_source'; end if;
  -- The final slice takes the residual snapshot VAT so partial confirmations conserve cents.
  if value+snapshot_consumed=cap and source_kind in ('project_terms','expected') then
    parts.vat_amount:=case when source_kind='project_terms' then terms.vat_amount else item.vat_amount end-consumed_vat;
    if parts.vat_amount<0 then raise exception 'finance_recognition_source_changed'; end if;
    parts.gross_amount:=value+parts.vat_amount;
  end if;
  if classification='direct_cost' and project is null or classification='overhead' and project is not null
    then raise exception 'finance_project_invalid'; end if;
  if snapshot->>'currency'=setup.base_currency or p_input->'fx' is not null and p_input->'fx'<>'null'::jsonb then
    select * into valuation from private.finance_valuation(snapshot->>'currency',setup.base_currency,day,value,p_input->'fx');
    rate:=valuation.rate; fx_source:=valuation.source; fx_date:=valuation.effective_date; report_value:=valuation.reporting_amount;
  end if;
  snapshot:=snapshot||jsonb_build_object('recognitionDate',day);
  insert into public.finance_recognition_entries(studio_id,classification,source_kind,terms_id,expected_item_id,movement_id,project_id,category_id,
    source_snapshot,period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,
    reporting_amount,fx_rate,fx_source,fx_effective_date,reason,created_by)
  values(p_studio,classification,source_kind,case when source_kind='project_terms' then source_id end,
    case when source_kind='expected' then source_id end,case when source_kind='movement' then source_id end,project,cat.id,snapshot,
    first_day,last_day,day,btrim(p_input->>'description'),snapshot->>'currency',value,parts.vat_amount,parts.gross_amount,
    setup.base_currency,report_value,rate,fx_source,fx_date,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  return result;
end $$;

create or replace function public.get_finance_recognition_sources(p_studio_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  with sources as (
    select 'project_terms'::text as kind,t.id as "sourceId",p.name||' · '||o.name as label,t.project_id as "projectId",o.id as "orderId",o.name as "orderName",'revenue'::text as classification,
      t.currency,t.net_amount as amount,t.gross_amount as gross,
      t.net_amount-coalesce((select sum(r.amount) from public.finance_recognition_entries r
        where r.studio_id=t.studio_id and r.project_id=t.project_id and r.classification='revenue' and r.currency=t.currency
          and private.finance_recognition_order(r.studio_id,r.id)=t.order_id),0) as remaining,
      null::date as "periodStart",null::date as "periodEnd",t.revision as version
    from public.finance_project_current_terms t join public.projects p on p.id=t.project_id and p.studio_id=t.studio_id
    join public.finance_project_orders o on o.studio_id=t.studio_id and o.project_id=t.project_id and o.id=t.order_id and o.status='confirmed'
    where t.studio_id=p_studio_id and t.stream='design'
    union all
    select 'expected',i.id,case when o.id is not null then o.name||' · ' else '' end||coalesce(nullif(i.description,''),c.name),p.project_id,o.id,o.name,
      case when i.direction='incoming' then 'revenue' when p.project_id is not null then 'direct_cost' else 'overhead' end,
      i.currency,i.net_amount,i.amount,least(i.net_amount-coalesce((select sum(r.amount) from public.finance_recognition_entries r
        where r.studio_id=i.studio_id and (r.expected_item_id=private.finance_recognition_expected_root(i.studio_id,i.id)
          or r.source_snapshot->>'economicExpectedId'=private.finance_recognition_expected_root(i.studio_id,i.id)::text)),0),
        case when p.stream='design' then t.net_amount-coalesce((select sum(r.amount) from public.finance_recognition_entries r
          where r.studio_id=i.studio_id and r.classification='revenue' and r.currency=i.currency
            and private.finance_recognition_order(r.studio_id,r.id)=p.order_id),0) else i.net_amount end),p.period_start,
      case when p.period_start is not null then (p.period_start+interval '1 month - 1 day')::date end,i.version
    from public.finance_expected_items i join public.finance_categories c on c.studio_id=i.studio_id and c.id=i.category_id
    left join public.finance_project_items p on p.studio_id=i.studio_id and p.expected_item_id=i.id
    left join public.finance_project_orders o on o.studio_id=p.studio_id and o.project_id=p.project_id and o.id=p.order_id
    left join public.finance_project_current_terms t on t.studio_id=p.studio_id and t.project_id=p.project_id and t.order_id=p.order_id and t.stream='design'
    where i.studio_id=p_studio_id and c.nature='operating' and c.default_key is distinct from 'salary' and c.default_key is distinct from 'employee_bonus' and i.commitment='agreed' and i.certainty='fixed'
      and (p.stream is distinct from 'design' or o.status='confirmed' and t.id is not null)
      and not exists(select 1 from public.finance_obligation_items l join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id where l.studio_id=i.studio_id and l.expected_item_id=i.id and o.kind in ('payroll','bonus'))
      and not exists(select 1 from public.finance_trip_entries t where t.studio_id=i.studio_id and t.expected_item_id=i.id)
      and not exists(select 1 from public.finance_trip_balances b where b.studio_id=i.studio_id and b.expected_item_id=i.id)
    union all
    select 'movement',m.id,coalesce(nullif(m.description,''),m.category),null::uuid,null::uuid,null::text,'overhead',e.currency,abs(e.amount),abs(e.amount),
      abs(e.amount)-coalesce((select sum(r.amount) from public.finance_recognition_entries r where r.studio_id=m.studio_id and r.movement_id=m.id),0),
      m.financial_date,m.financial_date,1
    from public.finance_current_movements m join public.finance_movement_entries e on e.studio_id=m.studio_id and e.movement_id=m.id and e.entry_role='primary'
    where m.studio_id=p_studio_id and m.kind='outgoing' and m.nature='operating'
      and not exists(select 1 from public.finance_categories c where c.studio_id=m.studio_id and c.id=m.category_id and c.default_key in ('salary','employee_bonus'))
      and not coalesce((m.request_payload->>'allocationIntent')::boolean,false)
      and not exists(select 1 from public.finance_allocations a where a.studio_id=m.studio_id and a.movement_id=m.id)
      and not exists(select 1 from public.finance_trip_entries t where t.studio_id=m.studio_id and t.movement_id=m.id)
  ) select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('amount',s.amount::text,'gross',s.gross::text,'remaining',s.remaining::text) order by s.label,s."sourceId"),'[]'::jsonb)
    into result from sources s;
  return result;
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
    'net_amount',t.net_amount::text,'gross_amount',t.gross_amount::text,'effective_from',t.effective_from,
    'order_id',o.id,'order_name',o.name,'order_status',o.status) order by t.project_id,t.stream,o.is_default desc,o.created_at,o.id),'[]') into contracts
    from public.finance_project_current_terms t
    left join public.finance_project_orders o on o.studio_id=t.studio_id and o.project_id=t.project_id and o.id=t.order_id
    where t.studio_id=p_studio_id and (t.stream<>'design' or o.status='confirmed');
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

create or replace function public.get_finance_management_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare entries jsonb;coverage jsonb;projects jsonb;start_month date;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  select recognition_start_month into start_month from public.finance_settings where studio_id=p_studio_id;
  select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('amount',e.amount::text,'vat_amount',e.vat_amount::text,'gross_amount',e.gross_amount::text,
    'reporting_amount',e.reporting_amount::text,'fx_rate',e.fx_rate::text,'order_id',private.finance_recognition_order(e.studio_id,e.id)) order by e.created_at,e.id),'[]') into entries
    from public.finance_recognition_entries e where e.studio_id=p_studio_id;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.month,c.id),'[]') into coverage from public.finance_current_report_coverage c where c.studio_id=p_studio_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'startsOn',p.start_date) order by p.name,p.id),'[]') into projects from public.projects p where p.studio_id=p_studio_id;
  return jsonb_build_object('asOf',(now() at time zone 'Europe/Kyiv')::date,'capturedAt',statement_timestamp(),'recognitionStart',start_month,
    'entries',entries,'coverage',coverage,'projects',projects,'sources',public.get_finance_recognition_sources(p_studio_id),
    'labor',public.get_finance_labor_reporting(p_studio_id),'tripSources',public.get_finance_trip_recognition_sources(p_studio_id),'projectReporting',public.get_finance_project_reporting(p_studio_id));
end $$;

create or replace function private.guard_finance_recognized_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='finance_expected_items' then
    if row(new.direction,new.currency,new.amount,new.net_amount,new.vat_amount,new.vat_rate,new.price_basis,new.category_id)
      is distinct from row(old.direction,old.currency,old.amount,old.net_amount,old.vat_amount,old.vat_rate,old.price_basis,old.category_id)
      and exists(select 1 from public.finance_recognized_actuals where studio_id=old.studio_id and expected_item_id=old.id)
      then raise exception 'finance_recognized_source_locked'; end if;
  elsif tg_table_name='finance_movements' then
    if new.kind='reversal' and exists(select 1 from public.finance_recognized_actuals where studio_id=new.studio_id and movement_id=new.related_movement_id)
      then raise exception 'finance_recognized_source_locked'; end if;
  elsif tg_table_name='finance_project_terms' then
    if new.stream='design' and exists(select 1 from public.finance_recognized_actuals r
      where r.studio_id=new.studio_id and r.project_id=new.project_id and r.classification='revenue'
        and r.currency<>new.currency and private.finance_recognition_order(r.studio_id,r.id)=new.order_id)
      then raise exception 'finance_recognition_currency_locked'; end if;
  end if;
  return new;
end $$;
