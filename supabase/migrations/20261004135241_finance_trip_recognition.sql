-- Actual trip expenses own their economic source. Advances and reimbursements remain cash/settlement only.
alter table public.finance_trip_entries add constraint finance_trip_entry_tenant_unique unique(studio_id,id);
alter table public.finance_recognition_entries add column trip_entry_id uuid,
  add column trip_effect_movement_id uuid,
  add foreign key(studio_id,trip_entry_id) references public.finance_trip_entries(studio_id,id),
  add foreign key(studio_id,trip_effect_movement_id) references public.finance_movements(studio_id,id),
  drop constraint finance_recognition_source_kind_check,
  drop constraint finance_recognition_source_check;
alter table public.finance_recognition_entries add constraint finance_recognition_source_kind_check
  check(source_kind in ('project_terms','expected','movement','labor','trip')),
  add constraint finance_recognition_source_check check(
    (source_kind='trip' and trip_entry_id is not null and classification in ('direct_cost','overhead')
      and terms_id is null and expected_item_id is null and movement_id is null and obligation_id is null and employee_id is null)
    or (source_kind<>'trip' and trip_entry_id is null and trip_effect_movement_id is null and (
      (source_kind='project_terms' and terms_id is not null and project_id is not null and expected_item_id is null and movement_id is null and obligation_id is null and employee_id is null)
      or (source_kind='expected' and expected_item_id is not null and terms_id is null and movement_id is null and obligation_id is null and employee_id is null)
      or (source_kind='movement' and movement_id is not null and terms_id is null and expected_item_id is null and obligation_id is null and employee_id is null)
      or (source_kind='labor' and classification='labor' and obligation_id is not null and employee_id is not null and project_id is null and terms_id is null and expected_item_id is null and movement_id is null))));
create unique index finance_trip_recognized_once on public.finance_recognition_entries(studio_id,trip_entry_id) where source_kind='trip' and kind='recognition';
create unique index finance_trip_refund_recognized_once on public.finance_recognition_entries(studio_id,trip_effect_movement_id) where source_kind='trip' and kind='adjustment';
create index finance_trip_recognition_source_idx on public.finance_recognition_entries(studio_id,trip_entry_id);
create index finance_trip_recognition_effect_idx on public.finance_recognition_entries(studio_id,trip_effect_movement_id);
create or replace view public.finance_recognized_actuals with(security_invoker=true) as
select e.* from public.finance_recognition_entries e where e.kind<>'reversal' and not exists(
  select 1 from public.finance_recognition_entries r where r.studio_id=e.studio_id and r.related_entry_id=e.id and r.kind='reversal');

create function private.reverse_finance_trip_fact(p_fact uuid,p_reason text,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  insert into public.finance_recognition_entries(studio_id,kind,classification,source_kind,trip_entry_id,trip_effect_movement_id,project_id,category_id,
    source_snapshot,period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,reporting_amount,
    fx_rate,fx_source,fx_effective_date,related_entry_id,reason,created_by)
  select studio_id,'reversal',classification,source_kind,trip_entry_id,trip_effect_movement_id,project_id,category_id,
    source_snapshot,period_start,period_end,recognized_on,description,currency,-amount,-vat_amount,-gross_amount,reporting_currency,-reporting_amount,
    fx_rate,fx_source,fx_effective_date,id,p_reason,p_actor from public.finance_recognized_actuals where id=p_fact and source_kind='trip'
  returning id into result;
  return result;
end $$;

create function private.cancel_finance_trip_fact(p_studio uuid,p_entry uuid,p_reason text,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare original public.finance_recognition_entries; child record;
begin
  select * into original from public.finance_recognized_actuals where studio_id=p_studio and trip_entry_id=p_entry and kind='recognition' and source_kind='trip';
  if not found then return; end if;
  for child in select id from public.finance_recognized_actuals where studio_id=p_studio and related_entry_id=original.id and kind='adjustment' loop
    perform private.reverse_finance_trip_fact(child.id,p_reason,p_actor);
  end loop;
  perform private.reverse_finance_trip_fact(original.id,p_reason,p_actor);
end $$;

create function private.apply_finance_trip_cash_fact(p_studio uuid,p_movement uuid) returns void
language plpgsql security definer set search_path='' as $$
declare event public.finance_movements; target public.finance_movements; original public.finance_recognition_entries;
  entry public.finance_movement_entries; child public.finance_recognition_entries; expense uuid; prior_native numeric; prior_reporting numeric;
  value numeric; report_value numeric; digits integer;
begin
  select * into event from public.finance_movements where studio_id=p_studio and id=p_movement;
  if event.kind not in ('refund','reversal') then return; end if;
  select * into target from public.finance_movements where studio_id=p_studio and id=event.related_movement_id;
  select id into expense from public.finance_trip_entries where studio_id=p_studio and kind='expense' and movement_id=
    case when target.kind='refund' then target.related_movement_id else target.id end;
  if expense is null then return; end if;
  select * into original from public.finance_recognized_actuals where studio_id=p_studio and trip_entry_id=expense and kind='recognition';
  if not found then return; end if;
  if event.kind='reversal' then
    if target.kind='refund' then
      select * into child from public.finance_recognized_actuals where studio_id=p_studio and trip_effect_movement_id=target.id and kind='adjustment';
      if found then perform private.reverse_finance_trip_fact(child.id,'Trip refund correction',event.created_by); end if;
    else perform private.cancel_finance_trip_fact(p_studio,expense,'Trip payment correction',event.created_by);
    end if;
    return;
  end if;
  if exists(select 1 from public.finance_recognition_entries where studio_id=p_studio and trip_effect_movement_id=event.id and kind='adjustment') then return; end if;
  select * into entry from public.finance_movement_entries where studio_id=p_studio and movement_id=event.id and entry_role='primary';
  value:=abs(entry.amount);
  select coalesce(-sum(amount),0),coalesce(-sum(reporting_amount),0) into prior_native,prior_reporting
    from public.finance_recognized_actuals where studio_id=p_studio and related_entry_id=original.id and kind='adjustment';
  if entry.currency<>original.currency or value+prior_native>original.amount then raise exception 'finance_trip_refund_principal_invalid'; end if;
  select minor_units into digits from public.finance_currencies where code=original.reporting_currency;
  report_value:=case when value+prior_native=original.amount then original.reporting_amount-prior_reporting
    else round(original.reporting_amount*(value+prior_native)/original.amount,digits)-prior_reporting end;
  insert into public.finance_recognition_entries(studio_id,kind,classification,source_kind,trip_entry_id,trip_effect_movement_id,project_id,category_id,
    source_snapshot,period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,reporting_amount,
    fx_rate,fx_source,fx_effective_date,related_entry_id,reason,created_by)
  values(p_studio,'adjustment',original.classification,'trip',expense,event.id,original.project_id,original.category_id,
    original.source_snapshot||jsonb_build_object('refund',to_jsonb(event),'cashFx',to_jsonb(entry)),event.financial_date,event.financial_date,event.financial_date,
    original.description,original.currency,-value,0,-value,original.reporting_currency,-report_value,original.fx_rate,original.fx_source,
    original.fx_effective_date,original.id,'Confirmed trip expense refund',event.created_by);
end $$;

create function private.capture_finance_trip_fact(p_studio uuid,p_entry uuid,p_reason text,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare entry public.finance_trip_entries; trip public.finance_trips; setup public.finance_settings; result uuid; category uuid; event record;
begin
  select * into entry from public.finance_trip_entries where studio_id=p_studio and id=p_entry and kind='expense' and reverses_id is null;
  select * into setup from public.finance_settings where studio_id=p_studio;
  if entry.id is null or setup.recognition_start_month is null or entry.financial_date<setup.recognition_start_month then return null; end if;
  select id into result from public.finance_recognition_entries where studio_id=p_studio and trip_entry_id=p_entry and kind='recognition';
  if result is not null then return result; end if;
  select * into trip from public.finance_trips where studio_id=p_studio and id=entry.trip_id;
  category:=private.trip_category(p_studio,'outgoing');
  insert into public.finance_recognition_entries(studio_id,classification,source_kind,trip_entry_id,project_id,category_id,source_snapshot,
    period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,reason,created_by)
  values(p_studio,case when trip.project_id is null then 'overhead' else 'direct_cost' end,'trip',entry.id,trip.project_id,category,
    jsonb_build_object('trip',to_jsonb(trip),'entry',to_jsonb(entry),'recognitionDate',entry.financial_date),entry.financial_date,entry.financial_date,entry.financial_date,
    left(trip.title||case when entry.label='' then '' else ' · '||entry.label end,2000),entry.currency,entry.amount,0,entry.amount,
    entry.reporting_currency,entry.reporting_amount,entry.fx_rate,entry.fx_source,entry.fx_effective_date,p_reason,p_actor) returning id into result;
  -- Explicit confirmation of an existing source also preserves its immutable correction/refund chain.
  if exists(select 1 from public.finance_trip_entries where studio_id=p_studio and reverses_id=entry.id) then
    perform private.cancel_finance_trip_fact(p_studio,entry.id,'Trip expense source correction',p_actor);
  elsif entry.movement_id is not null then
    for event in select m.id from public.finance_movements m where m.studio_id=p_studio and
      (m.related_movement_id=entry.movement_id or m.related_movement_id in(select id from public.finance_movements where studio_id=p_studio and related_movement_id=entry.movement_id))
      order by m.created_at,m.id loop perform private.apply_finance_trip_cash_fact(p_studio,event.id); end loop;
  end if;
  return result;
end $$;

create function private.recognize_posted_finance_trip() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.kind='expense' then
    if new.reverses_id is not null then perform private.cancel_finance_trip_fact(new.studio_id,new.reverses_id,'Trip expense correction',new.created_by);
    else perform private.capture_finance_trip_fact(new.studio_id,new.id,'Admin-posted actual trip expense',new.created_by); end if;
  end if;
  return new;
end $$;
create trigger finance_trip_recognition after insert on public.finance_trip_entries for each row execute function private.recognize_posted_finance_trip();
create function private.recognize_finance_trip_cash_effect() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.entry_role='primary' then perform private.apply_finance_trip_cash_fact(new.studio_id,new.movement_id); end if;
  return new;
end $$;
create trigger finance_trip_refund_recognition after insert on public.finance_movement_entries for each row execute function private.recognize_finance_trip_cash_effect();

create function public.get_finance_trip_recognition_sources(p_studio_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'tripId',e.trip_id,'projectId',t.project_id,'description',t.title||' · '||e.label,
    'date',e.financial_date,'amount',e.amount::text,'currency',e.currency,'reportingAmount',e.reporting_amount::text,'reportingCurrency',e.reporting_currency) order by e.financial_date,e.id),'[]') into result
  from public.finance_trip_entries e join public.finance_trips t on t.studio_id=e.studio_id and t.id=e.trip_id
    join public.finance_settings s on s.studio_id=e.studio_id
  where e.studio_id=p_studio_id and e.kind='expense' and e.reverses_id is null and e.financial_date>=s.recognition_start_month
    and not exists(select 1 from public.finance_recognition_entries r where r.studio_id=e.studio_id and r.trip_entry_id=e.id and r.kind='recognition');
  return result;
end $$;
create function public.confirm_finance_trip_recognition(p_studio_id uuid,p_request_id uuid,p_entry_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; payload jsonb:=jsonb_build_object('operation','trip_recognition','entry',p_entry_id,'reason',p_reason);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'finance_input_invalid';end if;
  result:=private.capture_finance_trip_fact(p_studio_id,p_entry_id,btrim(p_reason),auth.uid());
  if result is null then raise exception 'finance_input_invalid';end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;
revoke all on function private.reverse_finance_trip_fact(uuid,text,uuid),private.cancel_finance_trip_fact(uuid,uuid,text,uuid),
  private.apply_finance_trip_cash_fact(uuid,uuid),private.capture_finance_trip_fact(uuid,uuid,text,uuid),private.recognize_posted_finance_trip(),private.recognize_finance_trip_cash_effect()
  from public,anon,authenticated,service_role;
revoke all on function public.get_finance_trip_recognition_sources(uuid),public.confirm_finance_trip_recognition(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_trip_recognition_sources(uuid),public.confirm_finance_trip_recognition(uuid,uuid,uuid,text) to authenticated;

-- Trip corrections continue through their owning financial flow.
create or replace function public.adjust_finance_recognition(p_studio_id uuid,p_request_id uuid,p_entry_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','recognition_adjustment','entry',p_entry_id,'input',p_input);
  result uuid; original public.finance_recognition_entries; value numeric; vat numeric; report_value numeric; digits integer; day date; operation text:=p_input->>'operation';
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
  vat:=case when value=original.amount then original.vat_amount else round(original.vat_amount*value/original.amount,digits) end;
  select minor_units into digits from public.finance_currencies where code=original.reporting_currency;
  report_value:=case when value=original.amount then original.reporting_amount else round(value*original.fx_rate,digits) end;
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

-- Employee trip balance settlements are neither service revenue nor another expense.
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
    select * into terms from public.finance_project_current_terms where studio_id=p_studio and id=source_id and stream='design';
    if not found or classification<>'revenue' or terms.project_id is distinct from project or terms.gross_amount is null
      then raise exception 'finance_recognition_source_invalid'; end if;
    select * into cat from public.finance_categories where studio_id=p_studio and default_key='project_payments';
    snapshot:=to_jsonb(terms); cap:=terms.net_amount;
    select minor_units into digits from public.finance_currencies where code=terms.currency;
    select * into parts from private.finance_vat_parts(value,terms.vat_rate,'net',digits);
    -- Terms revisions do not give the same design contract a second recognition allowance.
    select coalesce(sum(r.amount),0) into consumed from public.finance_recognition_entries r
      where r.studio_id=p_studio and r.project_id=project and r.classification='revenue' and r.currency=terms.currency
        and (r.source_kind='project_terms' or r.source_snapshot->>'stream'='design');
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
      select * into terms from public.finance_project_current_terms where studio_id=p_studio and project_id=project and stream='design';
      if terms.currency<>item.currency or value+(select coalesce(sum(r.amount),0) from public.finance_recognition_entries r
        where r.studio_id=p_studio and r.project_id=project and r.classification='revenue' and r.currency=item.currency
          and (r.source_kind='project_terms' or r.source_snapshot->>'stream'='design'))>terms.net_amount
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
    select 'project_terms'::text as kind,t.id as "sourceId",p.name||' · '||t.stream as label,t.project_id as "projectId",'revenue'::text as classification,
      t.currency,t.net_amount as amount,t.gross_amount as gross,
      t.net_amount-coalesce((select sum(r.amount) from public.finance_recognition_entries r
        where r.studio_id=t.studio_id and r.project_id=t.project_id and r.classification='revenue' and r.currency=t.currency
          and (r.source_kind='project_terms' or r.source_snapshot->>'stream'='design')),0) as remaining,
      null::date as "periodStart",null::date as "periodEnd",t.revision as version
    from public.finance_project_current_terms t join public.projects p on p.id=t.project_id and p.studio_id=t.studio_id
    where t.studio_id=p_studio_id and t.stream='design'
    union all
    select 'expected',i.id,coalesce(nullif(i.description,''),c.name),p.project_id,
      case when i.direction='incoming' then 'revenue' when p.project_id is not null then 'direct_cost' else 'overhead' end,
      i.currency,i.net_amount,i.amount,i.net_amount-coalesce((select sum(r.amount) from public.finance_recognition_entries r
        where r.studio_id=i.studio_id and (r.expected_item_id=private.finance_recognition_expected_root(i.studio_id,i.id)
          or r.source_snapshot->>'economicExpectedId'=private.finance_recognition_expected_root(i.studio_id,i.id)::text)),0),p.period_start,
      case when p.period_start is not null then (p.period_start+interval '1 month - 1 day')::date end,i.version
    from public.finance_expected_items i join public.finance_categories c on c.studio_id=i.studio_id and c.id=i.category_id
    left join public.finance_project_items p on p.studio_id=i.studio_id and p.expected_item_id=i.id
    where i.studio_id=p_studio_id and c.nature='operating' and c.default_key is distinct from 'salary' and c.default_key is distinct from 'employee_bonus' and i.commitment='agreed' and i.certainty='fixed'
      and not exists(select 1 from public.finance_obligation_items l join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id where l.studio_id=i.studio_id and l.expected_item_id=i.id and o.kind in ('payroll','bonus'))
      and not exists(select 1 from public.finance_trip_entries t where t.studio_id=i.studio_id and t.expected_item_id=i.id)
      and not exists(select 1 from public.finance_trip_balances b where b.studio_id=i.studio_id and b.expected_item_id=i.id)
    union all
    select 'movement',m.id,coalesce(nullif(m.description,''),m.category),null::uuid,'overhead',e.currency,abs(e.amount),abs(e.amount),
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
-- Manual coverage cannot hide a missing closed payroll source. This diagnostic
-- reuses schedule-history occurrence identity without materializing any records.
create function private.finance_missing_labor_periods(p_studio uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not private.is_finance_admin(p_studio) then raise exception 'finance_admin_required';end if;
  select coalesce(jsonb_agg(jsonb_build_object('scheduleId',s.id,'label',t.name,'periodStart',d::date,
    'periodEnd',least((d+make_interval(months=>t.interval_months)-interval '1 day')::date,t.valid_through)) order by d,s.id),'[]') into result
  from public.finance_schedules s join public.finance_settings f on f.studio_id=s.studio_id
    join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
    cross join lateral generate_series(f.recognition_start_month::timestamp,(now() at time zone 'Europe/Kyiv')::date::timestamp,interval '1 month') d
  where s.studio_id=p_studio and s.kind='payroll' and t.commitment='agreed' and d::date>=t.effective_from
    and (t.valid_through is null or d::date<=t.valid_through)
    and ((extract(year from d)-extract(year from t.effective_from))::integer*12+(extract(month from d)-extract(month from t.effective_from))::integer)%t.interval_months=0
    and least((d+make_interval(months=>t.interval_months)-interval '1 day')::date,t.valid_through)<=(now() at time zone 'Europe/Kyiv')::date
    and not exists(select 1 from public.finance_obligations o where o.studio_id=s.studio_id and o.schedule_id=s.id and o.period_start=d::date);
  return result;
end $$;
revoke all on function private.finance_missing_labor_periods(uuid) from public,anon,authenticated,service_role;
grant execute on function private.finance_missing_labor_periods(uuid) to authenticated;

create or replace function public.get_finance_labor_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  return jsonb_build_object('missingPeriods',private.finance_missing_labor_periods(p_studio_id),'sources',public.get_finance_labor_sources(p_studio_id),
    'pools',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'obligation_id',p.obligation_id,'employee_id',p.employee_id,'description',p.description,
      'period_start',p.period_start,'period_end',p.period_end,'recognized_on',p.recognized_on,'currency',p.currency,'amount',p.amount::text,
      'reporting_currency',p.reporting_currency,'available_reporting_amount',p.available_reporting_amount::text,'allocated_amount',p.allocated_amount::text,
      'allocation_revision',p.allocation_revision,'fx_rate',p.fx_rate::text,'fx_source',p.fx_source,'fx_effective_date',p.fx_effective_date) order by p.period_start,p.description,p.id)
      from public.finance_labor_cost_pools p where p.studio_id=p_studio_id),'[]'),
    'allocations',coalesce((select jsonb_agg(jsonb_build_object('entry_id',a.entry_id,'project_id',a.project_id,'amount',a.amount::text,'revision',a.revision,'reason',a.reason,'created_at',a.created_at) order by a.entry_id,a.project_id)
      from public.finance_current_labor_allocations a where a.studio_id=p_studio_id),'[]'));
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
  if entry.source_kind='trip' then
    -- Allocate the newly completed valuation cumulatively across active refunds;
    -- every technical mirror uses the exact valuation of its parent.
    with recursive family as (
      select id from public.finance_recognition_entries where studio_id=p_studio_id and id=entry.id
      union all select e.id from public.finance_recognition_entries e join family f on e.related_entry_id=f.id where e.studio_id=p_studio_id
    ), active_refunds as (
      select e.id,e.amount,sum(-e.amount) over(order by e.created_at,e.id) as refunded
      from public.finance_recognized_actuals e where e.studio_id=p_studio_id and e.related_entry_id=entry.id and e.kind='adjustment'
    ), valued as (
      select e.id,e.kind,e.related_entry_id,
        case when a.id is not null then -(round(a.refunded*valuation.reporting_amount/entry.amount,c.minor_units)-round((a.refunded+e.amount)*valuation.reporting_amount/entry.amount,c.minor_units))
          else round(e.amount*valuation.rate,c.minor_units) end as value
      from public.finance_recognition_entries e join family f on f.id=e.id join public.finance_currencies c on c.code=e.reporting_currency
        left join active_refunds a on a.id=e.id where e.studio_id=p_studio_id and e.kind<>'reversal'
    )
    update public.finance_recognition_entries e set reporting_amount=case when e.kind='reversal' then -parent.value else own.value end,
      fx_rate=valuation.rate,fx_source=valuation.source,fx_effective_date=valuation.effective_date
    from family f left join valued own on own.id=f.id
      left join public.finance_recognition_entries origin on origin.id=f.id
      left join valued parent on parent.id=origin.related_entry_id
    where e.id=f.id and e.studio_id=p_studio_id and e.reporting_amount is null;
    return;
  end if;
  with recursive family as (
    select id from public.finance_recognition_entries where studio_id=p_studio_id and id=entry.id
    union all select e.id from public.finance_recognition_entries e join family f on e.related_entry_id=f.id where e.studio_id=p_studio_id
  )
  update public.finance_recognition_entries e set reporting_amount=round(e.amount*valuation.rate,c.minor_units),
    fx_rate=valuation.rate,fx_source=valuation.source,fx_effective_date=valuation.effective_date
  from public.finance_currencies c,family f where c.code=e.reporting_currency and e.studio_id=p_studio_id
    and e.id=f.id and e.reporting_amount is null;
end $$;

-- Trip expected balances are derived settlement amounts, with no VAT. Permit
-- only their exact canonical reconciliation; settled contract/VAT snapshots stay locked.
create or replace function private.set_finance_expected_vat() returns trigger
language plpgsql security definer set search_path='' as $$
declare digits integer; parts record;
begin
  select minor_units into digits from public.finance_currencies where code=new.currency;
  if digits is null then raise exception 'finance_amount_invalid'; end if;
  if tg_op='UPDATE' and exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id)
    and row(new.amount,new.currency,new.vat_rate,new.price_basis,new.net_amount,new.vat_amount)
      is distinct from row(old.amount,old.currency,old.vat_rate,old.price_basis,old.net_amount,old.vat_amount)
    and not (
      coalesce(current_setting('studioflow.trip_reconcile',true),'')='on'
      and new.currency=old.currency and new.vat_rate is null and old.vat_rate is null and new.price_basis is null and old.price_basis is null
      and (exists(select 1 from public.finance_trip_entry_values e where e.studio_id=old.studio_id and e.expected_item_id=old.id
          and e.currency=new.currency and e.net_amount=new.amount)
        or exists(
          select 1 from public.finance_trip_balances b join public.finance_trips t on t.studio_id=b.studio_id and t.id=b.trip_id
          cross join lateral (select coalesce(sum(e.net_amount) filter(where e.kind='expense'),0) as spent,
            coalesce(sum(e.net_amount) filter(where e.kind='advance'),0) as advanced
            from public.finance_trip_entry_values e where e.studio_id=b.studio_id and e.trip_id=b.trip_id and e.employee_id=b.employee_id and e.currency=b.currency) cost
          cross join lateral (select coalesce(sum(a.amount) filter(where x.direction='outgoing'),0) as paid_out,
            coalesce(sum(a.amount) filter(where x.direction='incoming'),0) as paid_in
            from public.finance_trip_balances x left join public.finance_allocations a on a.studio_id=x.studio_id and a.expected_item_id=x.expected_item_id
            where x.studio_id=b.studio_id and x.trip_id=b.trip_id and x.employee_id=b.employee_id and x.currency=b.currency) paid
          where b.studio_id=old.studio_id and b.expected_item_id=old.id and b.currency=new.currency
            and new.amount=case when b.direction='outgoing' then paid.paid_out+greatest(cost.spent-cost.advanced-paid.paid_out+paid.paid_in,0)
              else paid.paid_in+case when t.status in ('completed','cancelled') then greatest(-(cost.spent-cost.advanced-paid.paid_out+paid.paid_in),0) else 0 end end
        ))
    ) then raise exception 'finance_project_settled_terms_locked'; end if;
  if new.vat_rate is null then
    new.price_basis:=null; new.net_amount:=new.amount; new.vat_amount:=0;
  elsif new.vat_rate<0 or new.vat_rate<>round(new.vat_rate,4) or new.price_basis not in ('net','gross') then
    raise exception 'finance_project_vat_invalid';
  elsif tg_op='INSERT' or (new.amount is distinct from old.amount and (new.net_amount,new.vat_amount) is not distinct from (old.net_amount,old.vat_amount)) then
    select * into parts from private.finance_vat_parts(new.amount,new.vat_rate,'gross',digits);
    new.net_amount:=parts.net_amount; new.vat_amount:=parts.vat_amount;
  elsif new.net_amount+new.vat_amount<>new.amount then
    raise exception 'finance_project_vat_invalid';
  end if;
  return new;
end;
$$;

-- Completing a trip's unresolved valuation must conserve the original cost,
-- including the residual cent on several refunds. All other facts stay immutable.
create or replace function private.guard_finance_recognition_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare digits integer; expected numeric; original public.finance_recognition_entries; refunded numeric;
begin
  if tg_op<>'UPDATE' or old.reporting_amount is not null or new.reporting_amount is null
    or (to_jsonb(new)-array['reporting_amount','fx_rate','fx_source','fx_effective_date'])
      is distinct from (to_jsonb(old)-array['reporting_amount','fx_rate','fx_source','fx_effective_date'])
    then raise exception 'finance_history_immutable';end if;
  select minor_units into digits from public.finance_currencies where code=new.reporting_currency;
  expected:=round(new.amount*new.fx_rate,digits);
  if new.source_kind='trip' and new.kind='adjustment' and exists(select 1 from public.finance_recognized_actuals where studio_id=new.studio_id and id=new.id) then
    select * into original from public.finance_recognition_entries where studio_id=new.studio_id and id=new.related_entry_id and source_kind='trip' and kind='recognition';
    if original.id is null or original.fx_rate is not null and row(original.fx_rate,original.fx_source,original.fx_effective_date)
      is distinct from row(new.fx_rate,new.fx_source,new.fx_effective_date) then raise exception 'finance_fx_required';end if;
    select -sum(amount) into refunded from public.finance_recognized_actuals where studio_id=new.studio_id and related_entry_id=original.id and kind='adjustment'
      and (created_at,id)<=(new.created_at,new.id);
    expected:=-(round(refunded*round(original.amount*new.fx_rate,digits)/original.amount,digits)
      -round((refunded+new.amount)*round(original.amount*new.fx_rate,digits)/original.amount,digits));
  end if;
  if new.fx_effective_date is distinct from coalesce((new.source_snapshot->>'recognitionDate')::date,new.recognized_on)
    or new.reporting_amount is distinct from expected
    or (new.currency=new.reporting_currency and (new.fx_rate<>1 or new.fx_source<>'identity')) then raise exception 'finance_fx_required';end if;
  return new;
end $$;
