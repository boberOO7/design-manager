-- Contractual earnings are independent of cash schedules and internal task status.
create table public.finance_project_earning_milestones (
  id uuid primary key default gen_random_uuid(), studio_id uuid not null, project_id uuid not null, order_id uuid not null,
  terms_id uuid not null, title text not null check(char_length(btrim(title)) between 1 and 2000),
  stage text check(stage in ('stage_1','stage_2','stage_3','stage_4')),
  net_amount numeric not null check(net_amount>0 and net_amount<=9999999999.9999),
  percentage numeric check(percentage>0 and percentage<=100 and percentage=round(percentage,4)),
  condition text not null default 'delivery' check(condition in ('delivery','acceptance')),
  revision integer not null default 1 check(revision>0), active boolean not null default true,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default clock_timestamp(),
  unique(studio_id,id), foreign key(studio_id,order_id,project_id) references public.finance_project_orders(studio_id,id,project_id),
  foreign key(studio_id,terms_id,project_id) references public.finance_project_terms(studio_id,id,project_id)
);
create index finance_earning_order_idx on public.finance_project_earning_milestones(studio_id,order_id);
create index finance_earning_terms_idx on public.finance_project_earning_milestones(studio_id,terms_id,project_id);
create index finance_earning_actor_idx on public.finance_project_earning_milestones(created_by);
create table public.finance_project_earning_events (
  id uuid primary key default gen_random_uuid(), studio_id uuid not null, milestone_id uuid not null,
  kind text not null check(kind in ('delivery','acceptance')), occurred_on date not null,
  confirmed_by uuid not null references public.profiles(id), created_at timestamptz not null default clock_timestamp(),
  unique(studio_id,id), unique(studio_id,milestone_id,kind),
  foreign key(studio_id,milestone_id) references public.finance_project_earning_milestones(studio_id,id)
);
create index finance_earning_event_actor_idx on public.finance_project_earning_events(confirmed_by);
alter table public.finance_recognition_entries
  add column earning_event_id uuid,
  add column earning_correction_of uuid,
  add foreign key(studio_id,earning_event_id) references public.finance_project_earning_events(studio_id,id),
  add foreign key(studio_id,earning_correction_of) references public.finance_recognition_entries(studio_id,id),
  add check(earning_correction_of is null or earning_event_id is not null);
create unique index finance_earning_recognition_once on public.finance_recognition_entries(studio_id,earning_event_id)
  where kind='recognition' and earning_correction_of is null and earning_event_id is not null;
create unique index finance_earning_correction_once on public.finance_recognition_entries(studio_id,earning_correction_of)
  where earning_correction_of is not null;
create index finance_earning_event_entries_idx on public.finance_recognition_entries(studio_id,earning_event_id);
create table public.finance_project_earning_attempts (
  id uuid primary key default gen_random_uuid(), studio_id uuid not null, event_id uuid not null,
  entry_id uuid, exception text, attempted_by uuid not null references public.profiles(id), created_at timestamptz not null default clock_timestamp(),
  foreign key(studio_id,event_id) references public.finance_project_earning_events(studio_id,id),
  foreign key(studio_id,entry_id) references public.finance_recognition_entries(studio_id,id),
  check((entry_id is not null)<>(exception is not null))
);
create index finance_earning_attempt_event_idx on public.finance_project_earning_attempts(studio_id,event_id,created_at desc);
create index finance_earning_attempt_entry_idx on public.finance_project_earning_attempts(studio_id,entry_id);
create index finance_earning_attempt_actor_idx on public.finance_project_earning_attempts(attempted_by);
do $$declare name text;begin
  foreach name in array array['finance_project_earning_milestones','finance_project_earning_events','finance_project_earning_attempts'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
    execute format('grant select on public.%I to authenticated',name);
    execute format('create policy finance_admin_read on public.%I for select to authenticated using((select private.is_finance_admin(studio_id)))',name);
    if name<>'finance_project_earning_milestones' then
      execute format('create trigger earning_history_immutable before update or delete on public.%I for each row execute function private.reject_finance_history_change()',name);
    end if;
  end loop;
end $$;

create function private.guard_finance_earning_milestone() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' or exists(select 1 from public.finance_project_earning_events where studio_id=old.studio_id and milestone_id=old.id) then
    raise exception 'finance_earning_history_protected';end if;
  if row(new.id,new.studio_id,new.project_id,new.order_id,new.created_by,new.created_at)
    is distinct from row(old.id,old.studio_id,old.project_id,old.order_id,old.created_by,old.created_at) then raise exception 'finance_earning_history_protected';end if;
  return new;
end $$;
revoke all on function private.guard_finance_earning_milestone() from public,anon,authenticated,service_role;
create trigger earning_milestone_guard before update or delete on public.finance_project_earning_milestones for each row execute function private.guard_finance_earning_milestone();

create function public.save_finance_earning_milestone(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_order_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','earning_milestone','project',p_project_id,'order',p_order_id,'input',p_input);
  result uuid; previous public.finance_project_earning_milestones; terms public.finance_project_terms; digits integer;
  amount numeric:=(p_input->>'netAmount')::numeric; share numeric:=(p_input->>'percentage')::numeric; stage_key text:=nullif(p_input->>'stage','');
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select * into terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and order_id=p_order_id and stream='design';
  if terms.id is null or terms.net_amount is null or not exists(select 1 from public.finance_project_orders where studio_id=p_studio_id and id=p_order_id and project_id=p_project_id and status='confirmed') then raise exception 'finance_earning_order_invalid';end if;
  select minor_units into digits from public.finance_currencies where code=terms.currency;
  if nullif(p_input->>'id','') is not null then
    select * into previous from public.finance_project_earning_milestones where studio_id=p_studio_id and id=(p_input->>'id')::uuid and order_id=p_order_id and project_id=p_project_id;
    if previous.id is null or previous.revision is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict';end if;
  elsif coalesce((p_input->>'revision')::integer,0)<>0 then raise exception 'finance_version_conflict';end if;
  if p_input->>'intent'='remove' then
    if previous.id is null then raise exception 'finance_input_invalid';end if;
    update public.finance_project_earning_milestones set active=false,revision=revision+1 where id=previous.id;result:=previous.id;
  else
    if share is not null then
      if share<=0 or share>100 or share<>round(share,4) then raise exception 'finance_input_invalid';end if;
      amount:=round(terms.net_amount*share/100,digits);
    end if;
    if amount is null or amount<=0 or amount>9999999999.9999 or amount<>round(amount,digits)
      or char_length(btrim(coalesce(p_input->>'title',''))) not between 1 and 2000
      or coalesce(p_input->>'condition','delivery') not in ('delivery','acceptance')
      or (stage_key is not null and not exists(select 1 from public.project_task_stage_columns where project_id=p_project_id and stage=stage_key and is_enabled)) then raise exception 'finance_input_invalid';end if;
    if amount+coalesce((select sum(net_amount) from public.finance_project_earning_milestones where studio_id=p_studio_id and order_id=p_order_id and active and id is distinct from previous.id),0)>terms.net_amount then raise exception 'finance_earning_over_contract';end if;
    if previous.id is null then
      insert into public.finance_project_earning_milestones(studio_id,project_id,order_id,terms_id,title,stage,net_amount,percentage,condition,created_by)
      values(p_studio_id,p_project_id,p_order_id,terms.id,btrim(p_input->>'title'),stage_key,amount,share,coalesce(p_input->>'condition','delivery'),auth.uid()) returning id into result;
    else
      update public.finance_project_earning_milestones set terms_id=terms.id,title=btrim(p_input->>'title'),stage=stage_key,net_amount=amount,percentage=share,
        condition=coalesce(p_input->>'condition','delivery'),revision=revision+1 where id=previous.id returning id into result;
    end if;
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;
revoke all on function public.save_finance_earning_milestone(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_earning_milestone(uuid,uuid,uuid,uuid,jsonb) to authenticated;

create or replace function private.post_finance_recognition(p_studio uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare setup public.finance_settings; terms public.finance_project_terms; item public.finance_expected_items;
  movement public.finance_movements; cash public.finance_movement_entries; cat public.finance_categories;
  project uuid:=nullif(p_input->>'projectId','')::uuid; source_id uuid:=(p_input->>'sourceId')::uuid;
  classification text:=p_input->>'classification'; source_kind text:=p_input->>'sourceKind';
  value numeric:=(p_input->>'amount')::numeric; day date:=(p_input->>'date')::date;
  first_day date:=(p_input->>'periodStart')::date; last_day date:=(p_input->>'periodEnd')::date;
  digits integer; cap numeric; consumed numeric; snapshot_consumed numeric; consumed_vat numeric; root_item uuid; snapshot jsonb; parts record; valuation record; rate numeric; fx_source text; fx_date date; report_value numeric; result uuid;
  earning uuid:=nullif(p_input->>'earningEventId','')::uuid; corrects uuid:=nullif(p_input->>'earningCorrectionOf','')::uuid;
  earning_event public.finance_project_earning_events; milestone public.finance_project_earning_milestones; owner_order uuid;
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
  owner_order:=coalesce(terms.order_id,nullif(snapshot->>'order_id','')::uuid);
  if classification='revenue' and owner_order is not null then
    if earning is null then
      if exists(select 1 from public.finance_project_earning_milestones where studio_id=p_studio and order_id=owner_order and active) then raise exception 'finance_earning_plan_owned';end if;
    else
      select * into earning_event from public.finance_project_earning_events where studio_id=p_studio and id=earning;
      select * into milestone from public.finance_project_earning_milestones where studio_id=p_studio and id=earning_event.milestone_id;
      if milestone.id is null or not milestone.active or milestone.order_id<>owner_order or milestone.project_id is distinct from project
        or earning_event.kind<>milestone.condition or source_kind<>'project_terms' then raise exception 'finance_earning_event_invalid';end if;
      if corrects is null then
        if value is distinct from milestone.net_amount or day<>earning_event.occurred_on or first_day<>day or last_day<>day
          or terms.id<>milestone.terms_id then raise exception 'finance_earning_plan_stale';end if;
        if exists(select 1 from public.finance_recognition_entries where studio_id=p_studio and earning_event_id=earning) then raise exception 'finance_earning_already_recognized';end if;
        if exists(select 1 from public.finance_recognition_entries r where r.studio_id=p_studio and r.classification='revenue' and r.earning_event_id is null
          and private.finance_recognition_order(r.studio_id,r.id)=owner_order group by r.studio_id having sum(r.amount)<>0) then raise exception 'finance_earning_manual_history';end if;
      elsif not exists(select 1 from public.finance_recognition_entries r where r.studio_id=p_studio and r.id=corrects and r.earning_event_id=earning and r.kind='recognition'
        and exists(select 1 from public.finance_recognition_entries v where v.studio_id=r.studio_id and v.related_entry_id=r.id and v.kind='reversal')) then raise exception 'finance_earning_correction_invalid';end if;
    end if;
  elsif earning is not null or corrects is not null then raise exception 'finance_earning_event_invalid';end if;
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
    reporting_amount,fx_rate,fx_source,fx_effective_date,reason,created_by,earning_event_id,earning_correction_of)
  values(p_studio,classification,source_kind,case when source_kind='project_terms' then source_id end,
    case when source_kind='expected' then source_id end,case when source_kind='movement' then source_id end,project,cat.id,snapshot,
    first_day,last_day,day,btrim(p_input->>'description'),snapshot->>'currency',value,parts.vat_amount,parts.gross_amount,
    setup.base_currency,report_value,rate,fx_source,fx_date,btrim(p_input->>'reason'),auth.uid(),earning,corrects) returning id into result;
  return result;
end $$;


-- Reversals/adjustments inherit earning ownership; a cancelled event is never replayed.
create function private.inherit_finance_earning_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.related_entry_id is not null then
    select earning_event_id into new.earning_event_id from public.finance_recognition_entries where studio_id=new.studio_id and id=new.related_entry_id;
  end if;
  return new;
end $$;
revoke all on function private.inherit_finance_earning_event() from public,anon,authenticated,service_role;
create trigger finance_inherit_earning_event before insert on public.finance_recognition_entries for each row execute function private.inherit_finance_earning_event();

-- Keep the existing correction/reversal implementation, adding source ownership to replacements.
alter function public.adjust_finance_recognition(uuid,uuid,uuid,jsonb) rename to adjust_finance_recognition_before_earnings;
alter function public.adjust_finance_recognition_before_earnings(uuid,uuid,uuid,jsonb) set schema private;
revoke all on function private.adjust_finance_recognition_before_earnings(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.adjust_finance_recognition(p_studio_id uuid,p_request_id uuid,p_entry_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare event_id uuid;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  select earning_event_id into event_id from public.finance_recognition_entries where studio_id=p_studio_id and id=p_entry_id;
  if event_id is not null and p_input->>'operation'='correction' then
    p_input:=jsonb_set(p_input,'{replacement}',coalesce(p_input->'replacement','{}')||jsonb_build_object('earningEventId',event_id,'earningCorrectionOf',p_entry_id));
  end if;
  return private.adjust_finance_recognition_before_earnings(p_studio_id,p_request_id,p_entry_id,p_input);
end $$;
revoke all on function public.adjust_finance_recognition(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.adjust_finance_recognition(uuid,uuid,uuid,jsonb) to authenticated;

create function private.guard_finance_earning_contract() returns trigger language plpgsql security definer set search_path='' as $$
declare recognized numeric;
begin
  if new.stream='design' then
    select coalesce(sum(amount),0) into recognized from public.finance_recognition_entries r where r.studio_id=new.studio_id and r.classification='revenue'
      and private.finance_recognition_order(r.studio_id,r.id)=new.order_id;
    if new.net_amount<recognized then raise exception 'finance_earning_over_contract';end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_finance_earning_contract() from public,anon,authenticated,service_role;
create trigger finance_earning_contract_guard after insert on public.finance_project_terms for each row execute function private.guard_finance_earning_contract();

create function private.recognize_finance_earning_event(p_studio uuid,p_event uuid,p_fx jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare event public.finance_project_earning_events; milestone public.finance_project_earning_milestones; result uuid; problem text;
  entry public.finance_recognition_entries; current_terms uuid;
begin
  select * into event from public.finance_project_earning_events where studio_id=p_studio and id=p_event;
  select * into milestone from public.finance_project_earning_milestones where studio_id=p_studio and id=event.milestone_id;
  if event.id is null or milestone.id is null then raise exception 'finance_earning_event_invalid';end if;
  if event.kind<>milestone.condition then return null;end if;
  select * into entry from public.finance_recognition_entries where studio_id=p_studio and earning_event_id=p_event and kind='recognition' order by created_at,id limit 1;
  if entry.id is not null then
    if entry.reporting_amount is null and p_fx is not null and p_fx<>'null'::jsonb then perform public.value_finance_recognition(p_studio,entry.id,p_fx);end if;
    return entry.id;
  end if;
  begin
    select id into current_terms from public.finance_project_current_terms where studio_id=p_studio and order_id=milestone.order_id and stream='design';
    result:=private.post_finance_recognition(p_studio,jsonb_build_object('sourceKind','project_terms','sourceId',current_terms,'projectId',milestone.project_id,
      'classification','revenue','amount',milestone.net_amount,'periodStart',event.occurred_on,'periodEnd',event.occurred_on,'date',event.occurred_on,
      'description',milestone.title,'reason','Confirmed contractual '||event.kind,'fx',p_fx,'earningEventId',event.id));
  exception when raise_exception then
    problem:=sqlerrm;
    if problem not like 'finance_%' then raise;end if;
  end;
  insert into public.finance_project_earning_attempts(studio_id,event_id,entry_id,exception,attempted_by)
    values(p_studio,p_event,result,problem,auth.uid());
  return result;
end $$;
revoke all on function private.recognize_finance_earning_event(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.fulfill_finance_earning_milestone(p_studio_id uuid,p_request_id uuid,p_milestone_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','earning_fulfillment','milestone',p_milestone_id,'input',p_input); result uuid;
  milestone public.finance_project_earning_milestones; event public.finance_project_earning_events;
  day date:=(p_input->>'date')::date; event_kind text:=p_input->>'kind';
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select * into milestone from public.finance_project_earning_milestones where studio_id=p_studio_id and id=p_milestone_id and active;
  if milestone.id is null then raise exception 'finance_earning_event_invalid';end if;
  if p_input->>'intent'='retry' then
    select * into event from public.finance_project_earning_events where studio_id=p_studio_id and milestone_id=milestone.id and kind=milestone.condition;
    if event.id is null then raise exception 'finance_earning_event_invalid';end if;
    result:=event.id;
  else
    if milestone.revision is distinct from (p_input->>'revision')::integer or coalesce((p_input->>'confirmed')::boolean,false) is not true
      or day is null or day>(now() at time zone 'Europe/Kyiv')::date or event_kind is null or event_kind not in ('delivery','acceptance') then raise exception 'finance_input_invalid';end if;
    select * into event from public.finance_project_earning_events where studio_id=p_studio_id and milestone_id=milestone.id and kind=event_kind;
    if event.id is not null then
      if event.occurred_on<>day then raise exception 'finance_earning_event_conflict';end if;
      result:=event.id;
    else
      insert into public.finance_project_earning_events(studio_id,milestone_id,kind,occurred_on,confirmed_by)
        values(p_studio_id,milestone.id,event_kind,day,auth.uid()) returning id into result;
    end if;
  end if;
  perform private.recognize_finance_earning_event(p_studio_id,result,p_input->'fx');
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;
revoke all on function public.fulfill_finance_earning_milestone(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fulfill_finance_earning_milestone(uuid,uuid,uuid,jsonb) to authenticated;

create function public.get_finance_project_earnings(p_studio_id uuid,p_project_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare milestones jsonb; summaries jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('net_amount',m.net_amount::text,'percentage',m.percentage::text,'currency',t.currency,
    'stale',m.terms_id<>c.id,'events',coalesce(ev.items,'[]'),'exception',case when exists(select 1 from public.finance_recognition_entries r where r.studio_id=m.studio_id and r.earning_event_id=e.id and r.kind<>'reversal' and r.reporting_amount is null and not exists(select 1 from public.finance_recognition_entries v where v.studio_id=r.studio_id and v.related_entry_id=r.id and v.kind='reversal')) then 'finance_fx_unavailable' else attempt.exception end,
    'recognized',root.id is not null,'earned',case when root.id is null then null else coalesce((select sum(r.amount) from public.finance_recognition_entries r where r.studio_id=m.studio_id and r.earning_event_id=e.id),0)::text end)
    order by m.created_at,m.id),'[]') into milestones
  from public.finance_project_earning_milestones m join public.finance_project_terms t on t.studio_id=m.studio_id and t.id=m.terms_id
  left join public.finance_project_current_terms c on c.studio_id=m.studio_id and c.order_id=m.order_id and c.stream='design'
  left join public.finance_project_earning_events e on e.studio_id=m.studio_id and e.milestone_id=m.id and e.kind=m.condition
  left join lateral(select jsonb_agg(jsonb_build_object('id',v.id,'kind',v.kind,'date',v.occurred_on,'actor',v.confirmed_by,'actorName',(select coalesce(full_name,v.confirmed_by::text) from public.profiles where id=v.confirmed_by),'recordedAt',v.created_at) order by v.created_at,v.id) as items
    from public.finance_project_earning_events v where v.studio_id=m.studio_id and v.milestone_id=m.id) ev on true
  left join lateral(select r.id,r.reporting_amount from public.finance_recognition_entries r where r.studio_id=m.studio_id and r.earning_event_id=e.id and r.kind='recognition' order by r.created_at,r.id limit 1) root on true
  left join lateral(select a.exception from public.finance_project_earning_attempts a where a.studio_id=m.studio_id and a.event_id=e.id order by a.created_at desc,a.id desc limit 1) attempt on true
  where m.studio_id=p_studio_id and m.active and (p_project_id is null or m.project_id=p_project_id);
  select coalesce(jsonb_agg(jsonb_build_object('orderId',o.id,'projectId',o.project_id,'currency',t.currency,'contract',t.net_amount::text,
    'configured',exists(select 1 from public.finance_project_earning_milestones m where m.studio_id=o.studio_id and m.order_id=o.id and m.active),
    'complete',coalesce((select sum(m.net_amount) from public.finance_project_earning_milestones m where m.studio_id=o.studio_id and m.order_id=o.id and m.active),0)=t.net_amount,
    'stale',exists(select 1 from public.finance_project_earning_milestones m where m.studio_id=o.studio_id and m.order_id=o.id and m.active and m.terms_id<>t.id
      and not exists(select 1 from public.finance_project_earning_events e join public.finance_recognition_entries r on r.studio_id=e.studio_id and r.earning_event_id=e.id where e.studio_id=m.studio_id and e.milestone_id=m.id)),
    'earned',coalesce(r.amount,0)::text,'unearned',(t.net_amount-coalesce(r.amount,0))::text,
    'hasRecognition',coalesce(r.has_recognition,false)) order by o.created_at,o.id),'[]') into summaries
  from public.finance_project_orders o join public.finance_project_current_terms t on t.studio_id=o.studio_id and t.order_id=o.id and t.stream='design'
  left join lateral(select sum(r.amount) as amount,bool_or(r.kind='recognition') as has_recognition from public.finance_recognition_entries r
    where r.studio_id=o.studio_id and r.classification='revenue' and private.finance_recognition_order(r.studio_id,r.id)=o.id) r on true
  where o.studio_id=p_studio_id and o.status='confirmed' and (p_project_id is null or o.project_id=p_project_id);
  return jsonb_build_object('milestones',milestones,'orders',summaries,'recognitionStart',(select recognition_start_month from public.finance_settings where studio_id=p_studio_id));
end $$;
revoke all on function public.get_finance_project_earnings(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_project_earnings(uuid,uuid) to authenticated;

alter function public.get_finance_management_reporting(uuid) rename to get_finance_management_reporting_before_earnings;
alter function public.get_finance_management_reporting_before_earnings(uuid) set schema private;
revoke all on function private.get_finance_management_reporting_before_earnings(uuid) from public,anon,authenticated,service_role;
create function public.get_finance_management_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  return private.get_finance_management_reporting_before_earnings(p_studio_id)||jsonb_build_object('earnings',public.get_finance_project_earnings(p_studio_id));
end $$;
revoke all on function public.get_finance_management_reporting(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_management_reporting(uuid) to authenticated;
