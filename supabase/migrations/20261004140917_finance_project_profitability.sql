-- Project received cash is explicit reporting attribution, separate from settlement.
create table public.finance_project_cash_revisions (
  id uuid primary key default gen_random_uuid(),studio_id uuid not null,movement_id uuid not null,revision integer not null check(revision>0),
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
  unique(studio_id,id),unique(studio_id,movement_id,revision),foreign key(studio_id,movement_id) references public.finance_movements(studio_id,id)
);
create table public.finance_project_cash_items (
  studio_id uuid not null,revision_id uuid not null,project_id uuid not null,amount numeric not null check(amount>0 and amount<=9999999999.9999),
  primary key(studio_id,revision_id,project_id),foreign key(studio_id,revision_id) references public.finance_project_cash_revisions(studio_id,id),
  foreign key(project_id,studio_id) references public.projects(id,studio_id)
);
create table public.finance_project_refund_items (
  studio_id uuid not null,movement_id uuid not null,project_id uuid not null,amount numeric not null check(amount>0 and amount<=9999999999.9999),
  primary key(studio_id,movement_id,project_id),foreign key(studio_id,movement_id) references public.finance_movements(studio_id,id),
  foreign key(project_id,studio_id) references public.projects(id,studio_id)
);
create table public.finance_project_cost_estimates (
  id uuid primary key default gen_random_uuid(),studio_id uuid not null,project_id uuid not null,revision integer not null check(revision>0),
  currency text not null references public.finance_currencies(code),as_of date not null,
  direct_budget numeric,labor_budget numeric,remaining_direct numeric,remaining_labor numeric,
  reporting_currency text not null,fx_rate numeric,fx_source text,fx_effective_date date,
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
  unique(studio_id,id),unique(studio_id,project_id,revision),foreign key(project_id,studio_id) references public.projects(id,studio_id),
  foreign key(studio_id,reporting_currency) references public.finance_settings(studio_id,base_currency),
  check(direct_budget>=0 and direct_budget<=9999999999.9999),check(labor_budget>=0 and labor_budget<=9999999999.9999),
  check(remaining_direct>=0 and remaining_direct<=9999999999.9999),check(remaining_labor>=0 and remaining_labor<=9999999999.9999),
  check((fx_rate is null and fx_source is null and fx_effective_date is null) or
    (fx_rate>0 and fx_source in ('identity','manual','nbu') and fx_effective_date=as_of))
);
create index finance_project_cash_source_idx on public.finance_project_cash_revisions(studio_id,movement_id);
create index finance_project_cash_creator_idx on public.finance_project_cash_revisions(created_by);
create index finance_project_cash_project_idx on public.finance_project_cash_items(studio_id,project_id);
create index finance_project_refund_project_idx on public.finance_project_refund_items(studio_id,project_id);
create index finance_project_cost_creator_idx on public.finance_project_cost_estimates(created_by);
do $$declare name text;begin
  foreach name in array array['finance_project_cash_revisions','finance_project_cash_items','finance_project_refund_items','finance_project_cost_estimates'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
    execute format('grant select on public.%I to authenticated',name);
    execute format('create policy finance_admin_read on public.%I for select to authenticated using((select private.is_finance_admin(studio_id)))',name);
    execute format('create trigger finance_project_reporting_immutable before update or delete on public.%I for each row execute function private.reject_finance_history_change()',name);
  end loop;
end $$;
create view public.finance_project_cash_raw with(security_invoker=true) as
select i.*,r.movement_id,r.revision,r.reason,r.created_at from public.finance_project_cash_items i
  join public.finance_project_cash_revisions r on r.studio_id=i.studio_id and r.id=i.revision_id
where not exists(select 1 from public.finance_project_cash_revisions n where n.studio_id=r.studio_id and n.movement_id=r.movement_id and n.revision>r.revision);
create view public.finance_project_cash_net with(security_invoker=true) as
select i.*,i.amount-coalesce((select sum(f.amount) from public.finance_project_refund_items f
  join public.finance_current_movements m on m.studio_id=f.studio_id and m.id=f.movement_id
  where f.studio_id=i.studio_id and m.related_movement_id=i.movement_id and f.project_id=i.project_id),0) as net_amount
from public.finance_project_cash_raw i join public.finance_current_movements m on m.studio_id=i.studio_id and m.id=i.movement_id
where m.kind='incoming' and m.nature='operating';
create view public.finance_project_cash_events with(security_invoker=true) as
select i.studio_id,i.movement_id,i.project_id,i.amount,m.financial_date,e.currency,e.reporting_currency,e.reporting_amount as source_reporting_amount,
  abs(e.amount) as source_amount,e.fx_rate,e.fx_source,e.fx_effective_date,i.revision,i.reason
from public.finance_project_cash_raw i join public.finance_current_movements m on m.studio_id=i.studio_id and m.id=i.movement_id
  join public.finance_movement_entries e on e.studio_id=m.studio_id and e.movement_id=m.id and e.entry_role='primary'
where m.kind='incoming' and m.nature='operating'
union all
select i.studio_id,i.movement_id,i.project_id,-i.amount,m.financial_date,e.currency,e.reporting_currency,e.reporting_amount,
  abs(e.amount),e.fx_rate,e.fx_source,e.fx_effective_date,0,m.description
from public.finance_project_refund_items i join public.finance_current_movements m on m.studio_id=i.studio_id and m.id=i.movement_id
  join public.finance_current_movements original on original.studio_id=m.studio_id and original.id=m.related_movement_id and original.kind='incoming' and original.nature='operating'
  join public.finance_movement_entries e on e.studio_id=m.studio_id and e.movement_id=m.id and e.entry_role='primary';
create view public.finance_project_current_cost_estimates with(security_invoker=true) as
select e.* from public.finance_project_cost_estimates e where not exists(select 1 from public.finance_project_cost_estimates n
  where n.studio_id=e.studio_id and n.project_id=e.project_id and n.revision>e.revision);
revoke all on public.finance_project_cash_raw,public.finance_project_cash_net,public.finance_project_cash_events,public.finance_project_current_cost_estimates from public,anon,authenticated,service_role;
grant select on public.finance_project_cash_raw,public.finance_project_cash_net,public.finance_project_cash_events,public.finance_project_current_cost_estimates to authenticated;

create function private.post_finance_project_cash_split(p_studio uuid,p_movement uuid,p_input jsonb,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare payment public.finance_payment_availability; result uuid; previous integer; item record; raw_amount numeric; total numeric:=0; digits integer; projects uuid[]:='{}';
begin
  select * into payment from public.finance_payment_availability where studio_id=p_studio and id=p_movement and direction='incoming' and nature='operating';
  if not found or exists(select 1 from public.finance_allocations a join public.finance_trip_balances b on b.studio_id=a.studio_id and b.expected_item_id=a.expected_item_id
      where a.studio_id=p_studio and a.movement_id=p_movement) then raise exception 'finance_cash_source_invalid';end if;
  if jsonb_typeof(p_input->'items') is distinct from 'array' or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000 then raise exception 'finance_input_invalid';end if;
  select coalesce(max(revision),0) into previous from public.finance_project_cash_revisions where studio_id=p_studio and movement_id=p_movement;
  if previous is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict';end if;
  select minor_units into digits from public.finance_currencies where code=payment.currency;
  for item in select * from jsonb_to_recordset(p_input->'items') as x("projectId" uuid,amount numeric) loop
    if item."projectId" is null or item."projectId"=any(projects) or item.amount is null or item.amount<=0 or item.amount<>round(item.amount,digits)
      or not exists(select 1 from public.projects where studio_id=p_studio and id=item."projectId") then raise exception 'finance_input_invalid';end if;
    projects:=array_append(projects,item."projectId");total:=total+item.amount;
  end loop;
  if total>payment.net_amount then raise exception 'finance_cash_overallocated';end if;
  insert into public.finance_project_cash_revisions(studio_id,movement_id,revision,reason,created_by)
    values(p_studio,p_movement,previous+1,btrim(p_input->>'reason'),p_actor) returning id into result;
  -- Input is the remaining received principal; active refund parts remain attached
  -- to their original projects so reversing a refund restores exact attribution.
  insert into public.finance_project_cash_items(studio_id,revision_id,project_id,amount)
  select p_studio,result,"projectId",sum(amount) from (
    select * from jsonb_to_recordset(p_input->'items') as x("projectId" uuid,amount numeric)
    union all select f.project_id,f.amount from public.finance_project_refund_items f join public.finance_current_movements m on m.studio_id=f.studio_id and m.id=f.movement_id
      where f.studio_id=p_studio and m.related_movement_id=p_movement
  ) combined group by "projectId";
  return result;
end $$;
create function public.save_finance_project_cash_split(p_studio_id uuid,p_request_id uuid,p_movement_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;payload jsonb:=jsonb_build_object('operation','project_cash_split','movement',p_movement_id,'input',p_input);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  result:=private.post_finance_project_cash_split(p_studio_id,p_movement_id,p_input,auth.uid());
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;

create function private.guard_finance_project_cash_posting() returns trigger
language plpgsql security definer set search_path='' as $$
declare movement public.finance_movements;original public.finance_movements;parts jsonb;item record;value numeric;digits integer;total numeric:=0;available numeric;projects uuid[]:='{}';
begin
  if new.entry_role<>'primary' then return new;end if;
  select * into movement from public.finance_movements where studio_id=new.studio_id and id=new.movement_id;
  if movement.kind='incoming' and movement.nature='operating' and movement.request_payload ? 'projectReceiptSplits' then
    perform private.post_finance_project_cash_split(new.studio_id,movement.id,jsonb_build_object('revision',0,'items',movement.request_payload->'projectReceiptSplits',
      'reason',coalesce(nullif(movement.description,''),'Confirmed project cash attribution')),movement.created_by);
  elsif movement.kind='refund' then
    select * into original from public.finance_movements where studio_id=new.studio_id and id=movement.related_movement_id and kind='incoming' and nature='operating';
    if not found then return new;end if;
    parts:=coalesce(movement.request_payload->'projectRefundSplits','[]');
    if jsonb_typeof(parts) is distinct from 'array' then raise exception 'finance_input_invalid';end if;
    select minor_units into digits from public.finance_currencies where code=new.currency;
    for item in select * from jsonb_to_recordset(parts) as x("projectId" uuid,amount numeric) loop
      select net_amount into available from public.finance_project_cash_net where studio_id=new.studio_id and movement_id=original.id and project_id=item."projectId";
      if item."projectId" is null or item."projectId"=any(projects) or item.amount is null or item.amount<=0 or item.amount<>round(item.amount,digits)
        or available is null or item.amount>available then raise exception 'finance_cash_refund_overallocated';end if;
      projects:=array_append(projects,item."projectId");total:=total+item.amount;
      insert into public.finance_project_refund_items values(new.studio_id,movement.id,item."projectId",item.amount);
    end loop;
    if total>abs(new.amount) or coalesce((select sum(net_amount) from public.finance_project_cash_net where studio_id=new.studio_id and movement_id=original.id),0)
      >(select net_amount from public.finance_payment_availability where studio_id=new.studio_id and id=original.id) then raise exception 'finance_cash_refund_attribution_required';end if;
  end if;
  return new;
end $$;
create trigger finance_project_cash_posting after insert on public.finance_movement_entries for each row execute function private.guard_finance_project_cash_posting();
create function private.preserve_finance_project_cash_correction() returns trigger
language plpgsql security definer set search_path='' as $$
declare items jsonb;original_currency text;replacement_currency text;
begin
  if not exists(select 1 from public.finance_movements where studio_id=new.studio_id and id=new.replacement_movement_id and kind='incoming' and nature='operating') then return new;end if;
  if exists(select 1 from public.finance_project_cash_revisions where studio_id=new.studio_id and movement_id=new.replacement_movement_id) then return new;end if;
  if exists(select 1 from public.finance_project_cash_revisions where studio_id=new.studio_id and movement_id=new.original_movement_id) then
    select currency into original_currency from public.finance_movement_entries where studio_id=new.studio_id and movement_id=new.original_movement_id and entry_role='primary';
    select currency into replacement_currency from public.finance_movement_entries where studio_id=new.studio_id and movement_id=new.replacement_movement_id and entry_role='primary';
    if original_currency<>replacement_currency then raise exception 'finance_cash_correction_attribution_required';end if;
    select coalesce(jsonb_agg(jsonb_build_object('projectId',project_id,'amount',amount::text)),'[]') into items from public.finance_project_cash_raw
      where studio_id=new.studio_id and movement_id=new.original_movement_id;
    perform private.post_finance_project_cash_split(new.studio_id,new.replacement_movement_id,jsonb_build_object('revision',0,'items',items,'reason','Preserved explicit attribution on cash correction'),auth.uid());
  end if;
  return new;
end $$;
create trigger finance_project_cash_correction after insert on public.finance_movement_corrections for each row execute function private.preserve_finance_project_cash_correction();
create function private.guard_finance_project_cash_matching() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.amount>0 and exists(select 1 from public.finance_trip_balances where studio_id=new.studio_id and expected_item_id=new.expected_item_id)
    and exists(select 1 from public.finance_project_cash_net where studio_id=new.studio_id and movement_id=new.movement_id and net_amount>0)
    then raise exception 'finance_cash_nonproject_receipt';end if;
  return new;
end $$;
create trigger finance_project_cash_matching before insert on public.finance_allocations for each row execute function private.guard_finance_project_cash_matching();

create function public.save_finance_project_cost_estimate(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
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
    reporting_currency,fx_rate,fx_source,fx_effective_date,reason,created_by)
    values(p_studio_id,p_project_id,previous+1,currency_code,day,direct,labor,remaining_direct,remaining_labor,setup.base_currency,rate,source,effective,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;
revoke all on function private.post_finance_project_cash_split(uuid,uuid,jsonb,uuid),private.guard_finance_project_cash_posting(),private.preserve_finance_project_cash_correction(),private.guard_finance_project_cash_matching() from public,anon,authenticated,service_role;
revoke all on function public.save_finance_project_cash_split(uuid,uuid,uuid,jsonb),public.save_finance_project_cost_estimate(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_project_cash_split(uuid,uuid,uuid,jsonb),public.save_finance_project_cost_estimate(uuid,uuid,uuid,jsonb) to authenticated;

create function public.get_finance_project_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare receipts jsonb;events jsonb;estimates jsonb;contracts jsonb;matched jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'description',m.description,'date',p.financial_date,'currency',p.currency,
    'original',p.original_amount::text,'remaining',p.net_amount::text,'unattributed',(p.net_amount-coalesce(a.total,0))::text,
    'revision',coalesce(r.revision,0),'items',coalesce(a.items,'[]')) order by p.financial_date desc,p.id),'[]') into receipts
  from public.finance_payment_availability p join public.finance_current_movements m on m.studio_id=p.studio_id and m.id=p.id
    left join lateral (select max(revision) as revision from public.finance_project_cash_revisions where studio_id=p.studio_id and movement_id=p.id) r on true
    left join lateral (select sum(net_amount) as total,jsonb_agg(jsonb_build_object('projectId',project_id,'amount',net_amount::text) order by project_id) filter(where net_amount>0) as items
      from public.finance_project_cash_net where studio_id=p.studio_id and movement_id=p.id) a on true
  where p.studio_id=p_studio_id and m.kind='incoming' and p.nature='operating' and p.net_amount>0
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
  return jsonb_build_object('receipts',receipts,'events',events,'estimates',estimates,'contracts',contracts,'matched',matched);
end $$;
create function public.get_finance_management_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare entries jsonb;coverage jsonb;projects jsonb;start_month date;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  select recognition_start_month into start_month from public.finance_settings where studio_id=p_studio_id;
  select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('amount',e.amount::text,'vat_amount',e.vat_amount::text,'gross_amount',e.gross_amount::text,
    'reporting_amount',e.reporting_amount::text,'fx_rate',e.fx_rate::text) order by e.created_at,e.id),'[]') into entries
    from public.finance_recognition_entries e where e.studio_id=p_studio_id;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.month,c.id),'[]') into coverage from public.finance_current_report_coverage c where c.studio_id=p_studio_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'startsOn',p.start_date) order by p.name,p.id),'[]') into projects from public.projects p where p.studio_id=p_studio_id;
  return jsonb_build_object('asOf',(now() at time zone 'Europe/Kyiv')::date,'capturedAt',statement_timestamp(),'recognitionStart',start_month,
    'entries',entries,'coverage',coverage,'projects',projects,'sources',public.get_finance_recognition_sources(p_studio_id),
    'labor',public.get_finance_labor_reporting(p_studio_id),'tripSources',public.get_finance_trip_recognition_sources(p_studio_id),'projectReporting',public.get_finance_project_reporting(p_studio_id));
end $$;
revoke all on function public.get_finance_project_reporting(uuid),public.get_finance_management_reporting(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_project_reporting(uuid),public.get_finance_management_reporting(uuid) to authenticated;
