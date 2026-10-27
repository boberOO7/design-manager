-- Economic expense evidence is separate from cash, invoices and payable status.
create table public.finance_expense_service_policies (
  id uuid primary key default gen_random_uuid(), studio_id uuid not null references public.finance_settings(studio_id),
  schedule_id uuid not null, revision integer not null check(revision>0),
  first_period date not null check(extract(day from first_period)=1), service_start date not null,
  service_months integer not null check(service_months in (1,3,12)), effective_from date not null,
  policy text not null check(policy in ('service_days','period_end','manual')), project_id uuid,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default clock_timestamp(),
  unique(studio_id,id), unique(studio_id,schedule_id,revision),
  foreign key(studio_id,schedule_id) references public.finance_schedules(studio_id,id),
  foreign key(project_id,studio_id) references public.projects(id,studio_id)
);
create table public.finance_expense_receipts (
  id uuid primary key default gen_random_uuid(), studio_id uuid not null references public.finance_settings(studio_id),
  expected_item_id uuid, movement_id uuid, occurred_on date not null, project_id uuid,
  source_version text not null, snapshot jsonb not null, created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(), unique(studio_id,id),
  foreign key(studio_id,expected_item_id) references public.finance_expected_items(studio_id,id),
  foreign key(studio_id,movement_id) references public.finance_movements(studio_id,id),
  foreign key(project_id,studio_id) references public.projects(id,studio_id),
  check(num_nonnulls(expected_item_id,movement_id)=1)
);
create unique index finance_expense_receipt_expected_once on public.finance_expense_receipts(studio_id,expected_item_id) where expected_item_id is not null;
create unique index finance_expense_receipt_movement_once on public.finance_expense_receipts(studio_id,movement_id) where movement_id is not null;
create index finance_expense_policy_schedule on public.finance_expense_service_policies(studio_id,schedule_id,first_period desc,revision desc);
create index finance_expense_policy_creator on public.finance_expense_service_policies(created_by);
create index finance_expense_receipt_creator on public.finance_expense_receipts(created_by);
do $$declare name text;begin
  foreach name in array array['finance_expense_service_policies','finance_expense_receipts'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
    execute format('grant select on public.%I to authenticated',name);
    execute format('create policy finance_admin_read on public.%I for select to authenticated using((select private.is_finance_admin(studio_id)))',name);
    execute format('create trigger immutable_history before update or delete on public.%I for each row execute function private.reject_finance_history_change()',name);
  end loop;
end $$;
alter table public.finance_recognition_entries add column expense_receipt_id uuid, add column expense_policy_id uuid,
  add foreign key(studio_id,expense_receipt_id) references public.finance_expense_receipts(studio_id,id),
  add foreign key(studio_id,expense_policy_id) references public.finance_expense_service_policies(studio_id,id),
  add constraint finance_expense_recognition_owner check(num_nonnulls(expense_receipt_id,expense_policy_id)<=1
    and (num_nonnulls(expense_receipt_id,expense_policy_id)=0 or classification in ('direct_cost','overhead') and source_kind in ('expected','movement')));
create index finance_expense_recognition_receipt on public.finance_recognition_entries(studio_id,expense_receipt_id) where expense_receipt_id is not null;
create index finance_expense_recognition_policy on public.finance_recognition_entries(studio_id,expense_policy_id,expected_item_id,recognized_on) where expense_policy_id is not null;

-- This is the existing recognition core with explicit internal authorship for
-- scheduled work. Public/manual callers still use the verified current actor.
create or replace function private.post_finance_recognition_core(p_studio uuid,p_input jsonb,p_actor uuid,p_receipt uuid,p_policy uuid) returns uuid
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
  snapshot:=snapshot||jsonb_build_object('recognitionDate',day)||case when p_receipt is not null or p_policy is not null then jsonb_build_object('expenseReceiptId',p_receipt,'expensePolicyId',p_policy) else '{}'::jsonb end;
  insert into public.finance_recognition_entries(studio_id,classification,source_kind,terms_id,expected_item_id,movement_id,project_id,category_id,
    source_snapshot,period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,
    reporting_amount,fx_rate,fx_source,fx_effective_date,reason,created_by,earning_event_id,earning_correction_of,expense_receipt_id,expense_policy_id)
  values(p_studio,classification,source_kind,case when source_kind='project_terms' then source_id end,
    case when source_kind='expected' then source_id end,case when source_kind='movement' then source_id end,project,cat.id,snapshot,
    first_day,last_day,day,btrim(p_input->>'description'),snapshot->>'currency',value,parts.vat_amount,parts.gross_amount,
    setup.base_currency,report_value,rate,fx_source,fx_date,btrim(p_input->>'reason'),p_actor,earning,corrects,p_receipt,p_policy) returning id into result;
  return result;
end $$;
revoke all on function private.post_finance_recognition_core(uuid,jsonb,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create or replace function private.post_finance_recognition(p_studio uuid,p_input jsonb) returns uuid
language sql security definer set search_path='' as $$
  select private.post_finance_recognition_core(p_studio,p_input,auth.uid(),null,null)
$$;

-- Valuation reuses the current family residual calculation and immutable-FX guard.
create or replace function private.value_finance_expense_recognition(p_studio_id uuid,p_entry_id uuid,p_fx jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare entry public.finance_recognition_entries; valuation record;
begin
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
revoke all on function private.value_finance_expense_recognition(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function private.finance_expense_source(p_studio uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare item public.finance_expected_items; movement public.finance_movements; cat public.finance_categories; cash public.finance_movement_entries;
  project uuid; schedule uuid; obligation public.finance_obligations; result jsonb; consumed numeric;
begin
  if p_kind='expected' then
    select * into item from public.finance_expected_items where studio_id=p_studio and id=p_id;
    select * into cat from public.finance_categories where studio_id=p_studio and id=item.category_id;
    select * into obligation from public.finance_obligations o where o.studio_id=p_studio and exists(
      select 1 from public.finance_obligation_items i where i.studio_id=p_studio and i.obligation_id=o.id and i.expected_item_id=item.id);
    if item.id is null or item.direction<>'outgoing' or item.commitment<>'agreed' or item.certainty<>'fixed' or cat.nature<>'operating'
      or cat.default_key in ('salary','employee_bonus') or obligation.kind in ('payroll','bonus')
      or private.finance_labor_cash_expected(p_studio,item.id)
      or exists(select 1 from public.finance_trip_entries where studio_id=p_studio and expected_item_id=item.id)
      or exists(select 1 from public.finance_trip_balances where studio_id=p_studio and expected_item_id=item.id) then return null;end if;
    select project_id into project from public.finance_project_items where studio_id=p_studio and expected_item_id=item.id;
    select coalesce(sum(amount),0) into consumed from public.finance_recognition_entries where studio_id=p_studio
      and (expected_item_id=private.finance_recognition_expected_root(p_studio,item.id)
        or source_snapshot->>'economicExpectedId'=private.finance_recognition_expected_root(p_studio,item.id)::text);
    result:=jsonb_build_object('kind',p_kind,'sourceId',item.id,'version',item.version::text,'label',coalesce(nullif(item.description,''),cat.name),
      'currency',item.currency,'amount',item.net_amount::text,'gross',item.amount::text,'consumed',consumed::text,
      'projectId',project,'scheduleId',obligation.schedule_id,'obligationId',obligation.id,'categoryId',cat.id,'projectEnabled',cat.project_expense_enabled);
  elsif p_kind='movement' then
    select * into movement from public.finance_current_movements where studio_id=p_studio and id=p_id;
    select * into cat from public.finance_categories where studio_id=p_studio and id=movement.category_id;
    if movement.id is null or movement.kind<>'outgoing' or movement.nature<>'operating' or cat.id is null
      or cat.default_key in ('salary','employee_bonus') or coalesce((movement.request_payload->>'allocationIntent')::boolean,false)
      or exists(select 1 from public.finance_allocations where studio_id=p_studio and movement_id=movement.id)
      or exists(select 1 from public.finance_trip_entries where studio_id=p_studio and movement_id=movement.id) then return null;end if;
    select * into cash from public.finance_movement_entries where studio_id=p_studio and movement_id=movement.id and entry_role='primary';
    select coalesce(sum(amount),0) into consumed from public.finance_recognition_entries where studio_id=p_studio and movement_id=movement.id;
    result:=jsonb_build_object('kind',p_kind,'sourceId',movement.id,'version',movement.id::text,'label',coalesce(nullif(movement.description,''),cat.name),
      'currency',cash.currency,'amount',abs(cash.amount)::text,'gross',abs(cash.amount)::text,'consumed',consumed::text,
      'projectId',null,'scheduleId',null,'obligationId',null,'categoryId',cat.id,'projectEnabled',cat.project_expense_enabled);
  end if;
  return result;
end $$;
revoke all on function private.finance_expense_source(uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.finance_expense_policy_for_item(p_studio uuid,p_item uuid) returns public.finance_expense_service_policies
language sql stable security definer set search_path='' as $$
  select p.* from public.finance_expense_service_policies p join public.finance_obligations o on o.studio_id=p.studio_id and o.schedule_id=p.schedule_id
    join public.finance_obligation_items i on i.studio_id=o.studio_id and i.obligation_id=o.id
    where i.studio_id=p_studio and i.expected_item_id=private.finance_recognition_expected_root(p_studio,p_item) and p.first_period<=o.period_start
    order by p.first_period desc,p.revision desc limit 1
$$;
revoke all on function private.finance_expense_policy_for_item(uuid,uuid) from public,anon,authenticated,service_role;

create function private.guard_finance_expense_ownership() returns trigger
language plpgsql security definer set search_path='' as $$
declare receipt public.finance_expense_receipts; policy public.finance_expense_service_policies;
begin
  if new.related_entry_id is not null then
    select expense_receipt_id,expense_policy_id into new.expense_receipt_id,new.expense_policy_id
      from public.finance_recognition_entries where studio_id=new.studio_id and id=new.related_entry_id;
  end if;
  if new.kind<>'recognition' or new.classification not in ('direct_cost','overhead') then return new;end if;
  select * into receipt from public.finance_expense_receipts where studio_id=new.studio_id
    and (expected_item_id=private.finance_recognition_expected_root(new.studio_id,new.expected_item_id) or movement_id=new.movement_id);
  policy:=private.finance_expense_policy_for_item(new.studio_id,new.expected_item_id);
  if receipt.id is not null and new.expense_receipt_id is distinct from receipt.id
    or policy.id is not null and policy.policy<>'manual' and new.expense_policy_id is distinct from policy.id then
    raise exception 'finance_expense_source_owned';end if;
  return new;
end $$;
revoke all on function private.guard_finance_expense_ownership() from public,anon,authenticated,service_role;
create trigger finance_expense_ownership before insert on public.finance_recognition_entries for each row execute function private.guard_finance_expense_ownership();

create function private.finance_expense_period_reviewed(p_studio uuid,p_project uuid,p_from date,p_to date) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.finance_report_coverage c where c.studio_id=p_studio
    and c.month<=p_to and c.reviewed_through>=p_from and (c.project_id is null or c.project_id=p_project)
    and case when p_project is null then c.overhead_reviewed else c.direct_costs_reviewed end)
$$;
revoke all on function private.finance_expense_period_reviewed(uuid,uuid,date,date) from public,anon,authenticated,service_role;

create function public.save_finance_expense_service_policy(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; o public.finance_obligations; t public.finance_schedule_terms; cat public.finance_categories;
  schedule uuid:=(p_input->>'scheduleId')::uuid; first_month date:=(p_input->>'firstPeriod')::date; start_date date:=(p_input->>'serviceStart')::date;
  effective date:=(p_input->>'effectiveFrom')::date; project uuid:=nullif(p_input->>'projectId','')::uuid; revision integer; boundary date;
  payload jsonb:=jsonb_build_object('operation','expense_service_policy','input',p_input);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select recognition_start_month into boundary from public.finance_settings where studio_id=p_studio_id and finalized_at is not null;
  select * into o from public.finance_obligations where studio_id=p_studio_id and schedule_id=schedule and period_start=first_month and kind='recurring';
  select * into t from public.finance_schedule_terms where studio_id=p_studio_id and id=o.terms_id;
  select * into cat from public.finance_categories where studio_id=p_studio_id and id=t.category_id;
  if boundary is null then raise exception 'finance_recognition_inactive';end if;
  if coalesce((p_input->>'confirmed')::boolean,false) is not true or o.id is null or start_date is null or effective is null or effective<greatest(boundary,(now() at time zone 'Europe/Kyiv')::date)
    or (p_input->>'serviceMonths')::integer is distinct from t.interval_months
    or coalesce(p_input->>'policy','') not in ('service_days','period_end','manual')
    or cat.nature<>'operating' or cat.default_key in ('salary','employee_bonus') then raise exception 'finance_input_invalid';end if;
  if project is not null and (not cat.project_expense_enabled or not exists(select 1 from public.projects where studio_id=p_studio_id and id=project)) then raise exception 'finance_project_invalid';end if;
  if exists(select 1 from public.finance_recognition_entries r join public.finance_obligation_items i on i.studio_id=r.studio_id
      and i.expected_item_id=private.finance_recognition_expected_root(r.studio_id,r.expected_item_id)
    join public.finance_obligations obligations on obligations.studio_id=i.studio_id and obligations.id=i.obligation_id
    where r.studio_id=p_studio_id and obligations.schedule_id=schedule and obligations.period_start>=first_month) then
    raise exception 'finance_expense_history_protected';end if;
  select coalesce(max(p.revision),0)+1 into revision from public.finance_expense_service_policies p where p.studio_id=p_studio_id and p.schedule_id=schedule;
  insert into public.finance_expense_service_policies(studio_id,schedule_id,revision,first_period,service_start,service_months,effective_from,policy,project_id,created_by)
    values(p_studio_id,schedule,revision,first_month,start_date,t.interval_months,effective,p_input->>'policy',project,auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;
revoke all on function public.save_finance_expense_service_policy(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_expense_service_policy(uuid,uuid,jsonb) to authenticated;

create function public.confirm_finance_expense_receipt(p_studio_id uuid,p_request_id uuid,p_kind text,p_source_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare source jsonb; receipt public.finance_expense_receipts; result uuid; boundary date; project uuid; occurred date:=(p_input->>'date')::date;
  payload jsonb:=jsonb_build_object('operation','expense_receipt','kind',p_kind,'sourceId',p_source_id,'input',p_input);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select recognition_start_month into boundary from public.finance_settings where studio_id=p_studio_id and finalized_at is not null;
  if boundary is null then raise exception 'finance_recognition_inactive';end if;
  if coalesce((p_input->>'confirmed')::boolean,false) is not true or occurred is null or occurred<boundary
    or occurred>(now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_input_invalid';end if;
  source:=private.finance_expense_source(p_studio_id,p_kind,p_source_id);
  if source is null then raise exception 'finance_expense_source_invalid';end if;
  if source->>'scheduleId' is not null then raise exception 'finance_expense_service_period_required';end if;
  if source->>'version' is distinct from p_input->>'version' then raise exception 'finance_version_conflict';end if;
  project:=coalesce((source->>'projectId')::uuid,nullif(p_input->>'projectId','')::uuid);
  if source->>'projectId' is not null and nullif(p_input->>'projectId','') is not null and project::text is distinct from p_input->>'projectId' then raise exception 'finance_project_invalid';end if;
  select * into receipt from public.finance_expense_receipts where studio_id=p_studio_id
    and (expected_item_id=private.finance_recognition_expected_root(p_studio_id,p_source_id) and p_kind='expected' or movement_id=p_source_id and p_kind='movement');
  if receipt.id is not null then
    if receipt.occurred_on<>occurred or receipt.project_id is distinct from project or receipt.source_version is distinct from source->>'version' then raise exception 'finance_request_conflict';end if;
    result:=receipt.id;
  else
    if (source->>'consumed')::numeric<>0 then raise exception 'finance_expense_manual_history';end if;
    if private.finance_expense_period_reviewed(p_studio_id,project,occurred,occurred) and not coalesce((p_input->>'approveReviewed')::boolean,false) then
      raise exception 'finance_expense_history_protected';end if;
    insert into public.finance_expense_receipts(studio_id,expected_item_id,movement_id,occurred_on,project_id,source_version,snapshot,created_by)
      values(p_studio_id,case when p_kind='expected' then private.finance_recognition_expected_root(p_studio_id,p_source_id) end,case when p_kind='movement' then p_source_id end,occurred,project,source->>'version',source,auth.uid()) returning id into result;
    perform private.post_finance_recognition_core(p_studio_id,jsonb_build_object('sourceKind',p_kind,'sourceId',p_source_id,'projectId',project,
      'classification',case when project is null then 'overhead' else 'direct_cost' end,'amount',source->>'amount','date',occurred,
      'periodStart',occurred,'periodEnd',occurred,'description',source->>'label','reason','Confirmed actual product or service receipt','fx',p_input->'fx'),auth.uid(),result,null);
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;
revoke all on function public.confirm_finance_expense_receipt(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.confirm_finance_expense_receipt(uuid,uuid,text,uuid,jsonb) to authenticated;

create function private.finance_expense_service_candidates(p_studio uuid) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare o record; p public.finance_expense_service_policies; source jsonb; boundary date; base text; digits integer;
  first_day date; last_day date; eligible date; month date; through date; segment_from date; target numeric; recorded numeric; months integer; issue text; source_issue text; candidate jsonb;
begin
  select recognition_start_month,base_currency into boundary,base from public.finance_settings where studio_id=p_studio and finalized_at is not null;
  if boundary is null then return;end if;
  for o in select obligations.*,i.expected_item_id,t.interval_months from public.finance_obligations obligations
    join public.finance_obligation_items i on i.studio_id=obligations.studio_id and i.obligation_id=obligations.id and i.component='recurring'
    join public.finance_schedule_terms t on t.studio_id=obligations.studio_id and t.id=obligations.terms_id
    where obligations.studio_id=p_studio and obligations.kind='recurring' order by obligations.period_start,obligations.id loop
    p:=private.finance_expense_policy_for_item(p_studio,o.expected_item_id);
    if p.id is null or p.policy='manual' or private.finance_labor_cash_expected(p_studio,o.expected_item_id) then continue;end if;
    months:=(extract(year from o.period_start)-extract(year from p.first_period))::integer*12
      +(extract(month from o.period_start)-extract(month from p.first_period))::integer;
    first_day:=(p.service_start+make_interval(months=>months))::date;
    last_day:=(p.service_start+make_interval(months=>months+p.service_months)-interval '1 day')::date;
    eligible:=greatest(first_day,p.effective_from,boundary);
    if eligible>least(last_day,(now() at time zone 'Europe/Kyiv')::date) then continue;end if;
    if p.policy='period_end' and last_day>(now() at time zone 'Europe/Kyiv')::date then continue;end if;
    source:=private.finance_expense_source(p_studio,'expected',o.expected_item_id);
    issue:=null;
    if source is null then issue:='source_unavailable';
    elsif o.interval_months<>p.service_months then issue:='policy_stale';
    elsif exists(select 1 from public.finance_labor_automation where studio_id=p_studio)
      and not (private.finance_labor_source_review(p_studio)->>'reviewed')::boolean then issue:='payroll_source_review';
    elsif exists(select 1 from public.finance_recognition_entries r where r.studio_id=p_studio
      and (r.expected_item_id=o.expected_item_id or r.source_snapshot->>'economicExpectedId'=o.expected_item_id::text)
      and r.expense_policy_id is distinct from p.id) then issue:='manual_history';
    elsif exists(select 1 from public.finance_recognition_entries r where r.studio_id=p_studio and r.expense_policy_id=p.id
      and r.expected_item_id=o.expected_item_id and r.kind<>'recognition') then issue:='source_corrected';end if;
    source_issue:=issue;
    select minor_units into digits from public.finance_currencies where code=source->>'currency';
    for month in select generate_series(date_trunc('month',case when p.policy='period_end' then last_day else eligible end),
      date_trunc('month',least(last_day,(now() at time zone 'Europe/Kyiv')::date)),interval '1 month')::date loop
      issue:=source_issue;
      segment_from:=case when p.policy='period_end' then eligible else greatest(month,eligible) end;
      through:=least((month+interval '1 month - 1 day')::date,last_day,(now() at time zone 'Europe/Kyiv')::date);
      target:=trunc((source->>'amount')::numeric*(through-first_day+1)/(last_day-first_day+1),digits)
        -trunc((source->>'amount')::numeric*(segment_from-first_day)/(last_day-first_day+1),digits);
      select coalesce(sum(amount),0) into recorded from public.finance_recognition_entries where studio_id=p_studio
        and expense_policy_id=p.id and expected_item_id=o.expected_item_id and recognized_on>=month and recognized_on<(month+interval '1 month')::date;
      if target<recorded then issue:='source_changed';end if;
      if target=recorded and issue is null then continue;end if;
      if issue is null and private.finance_expense_period_reviewed(p_studio,p.project_id,segment_from,through) then issue:='history_protected';end if;
      candidate:=jsonb_build_object('action','recognize','studioId',p_studio,'sourceId',o.expected_item_id,'policyId',p.id,'month',month,
        'from',segment_from,'to',through,'amount',greatest(target-recorded,0)::text,'currency',source->>'currency','reportingCurrency',base,
        'projectId',p.project_id,'label',coalesce(source->>'label','Expense source unavailable'),'issue',issue,
        'source',source-'consumed','policy',to_jsonb(p),'recorded',recorded::text);
      return next candidate||jsonb_build_object('digest',md5(candidate::text));
    end loop;
  end loop;
end $$;
revoke all on function private.finance_expense_service_candidates(uuid) from public,anon,authenticated,service_role;

create function public.process_finance_automatic_expense(p_studio_id uuid,p_source_id uuid,p_month date,p_digest text,p_fx jsonb default null,p_approve boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare candidate jsonb; result uuid; actor uuid;
begin
  if p_approve and not private.is_finance_admin(p_studio_id)
    or not p_approve and auth.role() is distinct from 'service_role' and not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  select c into candidate from private.finance_expense_service_candidates(p_studio_id) c where c->>'sourceId'=p_source_id::text and c->>'month'=p_month::text;
  if candidate is null then
    select id into result from public.finance_recognition_entries where studio_id=p_studio_id and expected_item_id=p_source_id
      and expense_policy_id is not null and recognized_on>=p_month and recognized_on<(p_month+interval '1 month')::date order by created_at desc,id desc limit 1;
    return result;
  end if;
  if candidate->>'digest' is distinct from p_digest then raise exception 'finance_version_conflict';end if;
  if candidate->>'issue' is not null and not (p_approve and candidate->>'issue'='history_protected') then
    raise exception 'finance_expense_%',candidate->>'issue';end if;
  if (candidate->>'amount')::numeric<=0 then return null;end if;
  actor:=case when p_approve then auth.uid() else (candidate->'policy'->>'created_by')::uuid end;
  result:=private.post_finance_recognition_core(p_studio_id,jsonb_build_object('sourceKind','expected','sourceId',p_source_id,
    'projectId',candidate->>'projectId','classification',case when candidate->>'projectId' is null then 'overhead' else 'direct_cost' end,
    'amount',candidate->>'amount','date',candidate->>'to','periodStart',candidate->>'from','periodEnd',candidate->>'to',
    'description',candidate->>'label','reason','Automatic configured service-period expense','fx',p_fx),actor,null,(candidate->>'policyId')::uuid);
  return result;
end $$;
revoke all on function public.process_finance_automatic_expense(uuid,uuid,date,text,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.process_finance_automatic_expense(uuid,uuid,date,text,jsonb,boolean) to authenticated,service_role;

create function public.prepare_finance_automatic_expenses(p_studio_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare studio uuid; schedule record; result jsonb:='[]';
begin
  if auth.role() is distinct from 'service_role' and (p_studio_id is null or not private.is_finance_admin(p_studio_id)) then raise exception 'finance_admin_required';end if;
  for studio in select studio_id from public.finance_expense_service_policies where p_studio_id is null or studio_id=p_studio_id
    union select studio_id from public.finance_expense_receipts where p_studio_id is null or studio_id=p_studio_id loop
    perform 1 from public.studio_members where studio_id=studio order by user_id for share;
    perform 1 from public.finance_settings where studio_id=studio for update;
    for schedule in select schedule_id,min(first_period) as first_period,(array_agg(created_by order by revision))[1] as actor
      from public.finance_expense_service_policies where studio_id=studio group by schedule_id loop
      perform private.reconcile_finance_schedule_occurrences(studio,schedule.schedule_id,schedule.first_period,
        (date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '11 months')::date,schedule.actor);
    end loop;
    result:=result||coalesce((select jsonb_agg(c) from private.finance_expense_service_candidates(studio) c where c->>'issue' is null),'[]');
    result:=result||coalesce((select jsonb_agg(jsonb_build_object('action','value','studioId',studio,'sourceId',r.id,'currency',r.currency,
      'reportingCurrency',r.reporting_currency,'to',r.recognized_on)) from public.finance_recognition_entries r
      where r.studio_id=studio and r.kind='recognition' and (r.expense_policy_id is not null or r.expense_receipt_id is not null) and r.reporting_amount is null),'[]');
  end loop;
  return result;
end $$;
revoke all on function public.prepare_finance_automatic_expenses(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_finance_automatic_expenses(uuid) to authenticated,service_role;

create function public.value_finance_automatic_expense(p_studio_id uuid,p_entry_id uuid,p_fx jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' and not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  if not exists(select 1 from public.finance_recognition_entries where studio_id=p_studio_id and id=p_entry_id
    and (expense_receipt_id is not null or expense_policy_id is not null)) then raise exception 'finance_input_invalid';end if;
  perform private.value_finance_expense_recognition(p_studio_id,p_entry_id,p_fx);
end $$;
revoke all on function public.value_finance_automatic_expense(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.value_finance_automatic_expense(uuid,uuid,jsonb) to authenticated,service_role;

create function public.get_finance_expense_source(p_studio_id uuid,p_kind text,p_source_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare source jsonb; receipt public.finance_expense_receipts; entries jsonb; boundary date;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  source:=private.finance_expense_source(p_studio_id,p_kind,p_source_id);
  select * into receipt from public.finance_expense_receipts where studio_id=p_studio_id
    and (expected_item_id=private.finance_recognition_expected_root(p_studio_id,p_source_id) and p_kind='expected' or movement_id=p_source_id and p_kind='movement');
  select recognition_start_month into boundary from public.finance_settings where studio_id=p_studio_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'amount',amount::text,'currency',currency,'reportingAmount',reporting_amount::text,
    'date',recognized_on,'kind',kind) order by created_at,id),'[]') into entries from public.finance_recognition_entries where studio_id=p_studio_id and expense_receipt_id=receipt.id;
  return jsonb_build_object('source',source,'receipt',case when receipt.id is null then null else to_jsonb(receipt) end,'entries',entries,'recognitionStart',boundary);
end $$;
revoke all on function public.get_finance_expense_source(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_expense_source(uuid,text,uuid) to authenticated;

create function public.get_finance_expense_automation_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  return jsonb_build_object('projects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id) from public.projects where studio_id=p_studio_id),'[]'),'policies',coalesce((select jsonb_agg(to_jsonb(p) order by p.schedule_id,p.revision desc) from public.finance_expense_service_policies p where p.studio_id=p_studio_id),'[]'),
    'periods',coalesce((select jsonb_agg(jsonb_build_object('scheduleId',o.schedule_id,'periodStart',o.period_start,'periodEnd',o.period_end,
      'sourceId',i.expected_item_id,'serviceMonths',t.interval_months,'cashOnly',private.finance_labor_cash_expected(o.studio_id,i.expected_item_id)) order by o.period_start,o.id)
      from public.finance_obligations o join public.finance_obligation_items i on i.studio_id=o.studio_id and i.obligation_id=o.id and i.component='recurring'
      join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id where o.studio_id=p_studio_id and o.kind='recurring'),'[]'),
    'candidates',coalesce((select jsonb_agg(c order by c->>'to',c->>'sourceId') from private.finance_expense_service_candidates(p_studio_id) c),'[]'),
    'missingFx',coalesce((select jsonb_agg(jsonb_build_object('id',id,'date',recognized_on,'currency',currency,'sourceId',expected_item_id,'amount',amount::text))
      from public.finance_recognition_entries where studio_id=p_studio_id and kind='recognition' and (expense_policy_id is not null or expense_receipt_id is not null) and reporting_amount is null),'[]'));
end $$;
revoke all on function public.get_finance_expense_automation_reporting(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_expense_automation_reporting(uuid) to authenticated;

alter function public.get_finance_recognition_sources(uuid) rename to get_finance_recognition_sources_before_expenses;
alter function public.get_finance_recognition_sources_before_expenses(uuid) set schema private;
revoke all on function private.get_finance_recognition_sources_before_expenses(uuid) from public,anon,authenticated,service_role;
create function public.get_finance_recognition_sources(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sources jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  sources:=private.get_finance_recognition_sources_before_expenses(p_studio_id);
  return coalesce((select jsonb_agg(s order by position) from jsonb_array_elements(sources) with ordinality item(s,position)
    where not exists(select 1 from public.finance_expense_receipts r where r.studio_id=p_studio_id
      and (r.expected_item_id=private.finance_recognition_expected_root(p_studio_id,(s->>'sourceId')::uuid) and s->>'kind'='expected'
        or r.movement_id=(s->>'sourceId')::uuid and s->>'kind'='movement'))
    and (s->>'kind'<>'expected' or coalesce((private.finance_expense_policy_for_item(p_studio_id,(s->>'sourceId')::uuid)).policy,'manual')='manual')),'[]');
end $$;
revoke all on function public.get_finance_recognition_sources(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_recognition_sources(uuid) to authenticated;

alter function public.get_finance_management_reporting(uuid) rename to get_finance_management_reporting_before_expenses;
alter function public.get_finance_management_reporting_before_expenses(uuid) set schema private;
revoke all on function private.get_finance_management_reporting_before_expenses(uuid) from public,anon,authenticated,service_role;
create function public.get_finance_management_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  return private.get_finance_management_reporting_before_expenses(p_studio_id)||jsonb_build_object('expenseAutomation',public.get_finance_expense_automation_reporting(p_studio_id));
end $$;
revoke all on function public.get_finance_management_reporting(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_management_reporting(uuid) to authenticated;
notify pgrst,'reload schema';
