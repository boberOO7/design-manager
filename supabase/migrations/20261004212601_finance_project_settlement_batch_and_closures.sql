-- Non-cash agreement closures never enter the movement, allocation or recognition ledgers.
create table public.finance_settlement_adjustments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id) on delete restrict,
  expected_item_id uuid not null,
  amount numeric not null check(amount<>0 and amount between -9999999999.9999 and 9999999999.9999),
  currency text not null references public.finance_currencies(code),
  financial_date date not null check(financial_date between date '1900-01-01' and date '9999-12-31'),
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  explanation text not null default '' check(char_length(explanation)<=2000),
  reversed_adjustment_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  unique(studio_id,id,expected_item_id,currency),
  unique(studio_id,reversed_adjustment_id),
  foreign key(studio_id,expected_item_id) references public.finance_expected_items(studio_id,id) on delete restrict,
  foreign key(studio_id,reversed_adjustment_id,expected_item_id,currency)
    references public.finance_settlement_adjustments(studio_id,id,expected_item_id,currency) on delete restrict,
  check((amount<0)=(reversed_adjustment_id is not null)),
  check(amount<0 or (reason in ('fx_difference','client_agreement','other')
    and (reason<>'other' or char_length(btrim(explanation))>0)))
);
create index finance_settlement_adjustment_item_idx on public.finance_settlement_adjustments(studio_id,expected_item_id);
create index finance_settlement_adjustment_creator_idx on public.finance_settlement_adjustments(created_by);
alter table public.finance_settlement_adjustments enable row level security;
revoke all on public.finance_settlement_adjustments from public,anon,authenticated,service_role;
grant select on public.finance_settlement_adjustments to authenticated;
create policy finance_settlement_adjustments_admin on public.finance_settlement_adjustments for select to authenticated
using((select private.is_finance_admin(studio_id)));
create trigger finance_settlement_adjustments_immutable before update or delete on public.finance_settlement_adjustments
for each row execute function private.reject_finance_history_change();

-- Preserve cash-only collected and VAT totals; append non-cash closure columns.
create or replace view public.finance_expected_balances with(security_invoker=true) as
select i.id,i.studio_id,i.direction,i.amount,i.currency,i.category_id,i.description,i.due_date,i.expected_payment_date,
  i.commitment,i.certainty,i.is_established,i.version,i.created_by,i.created_at,i.updated_at,
  coalesce(a.settled,0) as settled_amount,i.amount-coalesce(a.settled,0)-coalesce(j.adjusted,0) as remaining_amount,
  case when coalesce(a.settled,0)+coalesce(j.adjusted,0)=i.amount then 'settled'
    when coalesce(a.settled,0)+coalesce(j.adjusted,0)=0 then 'unpaid' else 'partial' end as payment_state,
  case when i.due_date is null then 'unscheduled' when i.due_date>(now() at time zone 'Europe/Kyiv')::date then 'not_due'
    when i.due_date=(now() at time zone 'Europe/Kyiv')::date then 'due' else 'overdue' end as due_state,
  case when i.is_established and i.commitment='agreed' and i.certainty='fixed' then i.amount-coalesce(a.settled,0)-coalesce(j.adjusted,0) else 0 end as outstanding_amount,
  i.vat_rate,i.price_basis,i.net_amount,i.vat_amount,coalesce(j.adjusted,0) as adjustment_amount
from public.finance_expected_items i left join (
  select studio_id,expected_item_id,sum(amount) as settled from public.finance_allocations group by studio_id,expected_item_id
) a on a.studio_id=i.studio_id and a.expected_item_id=i.id
left join (select studio_id,expected_item_id,sum(amount) as adjusted from public.finance_settlement_adjustments
  group by studio_id,expected_item_id) j on j.studio_id=i.studio_id and j.expected_item_id=i.id;

create or replace view public.finance_project_expected_balances with(security_invoker=true) as
select b.id,b.studio_id,b.direction,b.amount,b.currency,b.category_id,b.description,b.due_date,b.expected_payment_date,
  b.commitment,b.certainty,b.is_established,b.version,b.created_by,b.created_at,b.updated_at,b.settled_amount,b.remaining_amount,
  b.payment_state,b.due_state,b.outstanding_amount,l.project_id,l.stream,l.source,l.period_start,l.visit_id,l.contractor_id,l.context_label,
  b.vat_rate,b.price_basis,b.net_amount,b.vat_amount,b.adjustment_amount
from public.finance_expected_balances b join public.finance_project_items l on l.studio_id=b.studio_id and l.expected_item_id=b.id;

create or replace view public.finance_project_plan_items with(security_invoker=true) as
select b.id,b.studio_id,b.direction,b.amount,b.currency,b.category_id,b.description,b.due_date,b.expected_payment_date,
  b.commitment,b.certainty,b.is_established,b.version,b.created_by,b.created_at,b.updated_at,b.settled_amount,b.remaining_amount,
  b.payment_state,b.due_state,b.outstanding_amount,b.project_id,b.stream,b.source,b.period_start,b.visit_id,b.contractor_id,b.context_label,
  exists(select 1 from public.finance_allocations a where a.studio_id=b.studio_id and a.expected_item_id=b.id) as has_settlement_history,
  b.vat_rate,b.price_basis,b.net_amount,b.vat_amount,e.client_note,e.schedule_percentage,b.adjustment_amount
from public.finance_project_expected_balances b
join public.finance_expected_items e on e.studio_id=b.studio_id and e.id=b.id
where b.stream='design' and b.commitment<>'cancelled';

create or replace view public.finance_project_totals with(security_invoker=true) as
with amounts as (
  select b.studio_id,b.project_id,b.stream,b.currency,
    sum(case when b.commitment<>'cancelled' then b.amount else 0 end) as scheduled_amount,
    sum(b.adjustment_amount) as closed_amount,sum(b.settled_amount) as collected_amount,sum(b.outstanding_amount) as outstanding_amount,
    sum(case when b.commitment<>'cancelled' then b.remaining_amount-b.outstanding_amount else 0 end) as planned_amount,
    sum(case when b.commitment<>'cancelled' then b.net_amount else 0 end) as scheduled_net_amount,
    sum(case when b.commitment<>'cancelled' then b.vat_amount else 0 end) as scheduled_vat_amount,
    sum(coalesce(a.net_amount,0)) as collected_net_amount,sum(coalesce(a.vat_amount,0)) as collected_vat_amount
  from public.finance_project_expected_balances b
  left join (select studio_id,expected_item_id,sum(net_amount) net_amount,sum(vat_amount) vat_amount
    from public.finance_allocations group by studio_id,expected_item_id) a on a.studio_id=b.studio_id and a.expected_item_id=b.id
  group by b.studio_id,b.project_id,b.stream,b.currency
), contracts as (select * from public.finance_project_current_terms where stream='design')
select coalesce(a.studio_id,c.studio_id) as studio_id,coalesce(a.project_id,c.project_id) as project_id,
  coalesce(a.stream,'design') as stream,coalesce(a.currency,c.currency) as currency,c.gross_amount as contract_amount,
  coalesce(a.scheduled_amount,0) as scheduled_amount,coalesce(a.collected_amount,0) as collected_amount,
  coalesce(a.outstanding_amount,0) as outstanding_amount,coalesce(a.planned_amount,0) as planned_amount,
  case when c.id is not null then c.gross_amount-coalesce(a.scheduled_amount,0) end as unscheduled_amount,
  c.net_amount as contract_net_amount,c.vat_amount as contract_vat_amount,c.gross_amount as contract_gross_amount,
  coalesce(a.scheduled_net_amount,0) as scheduled_net_amount,coalesce(a.scheduled_vat_amount,0) as scheduled_vat_amount,
  coalesce(a.collected_net_amount,0) as collected_net_amount,coalesce(a.collected_vat_amount,0) as collected_vat_amount,
  coalesce(a.closed_amount,0) as closed_amount
from amounts a full join contracts c on c.studio_id=a.studio_id and c.project_id=a.project_id and a.stream='design' and c.currency=a.currency;

-- The existing cash floor remains authoritative; closures add another protected part.
create function private.guard_finance_settlement_adjustment_balance() returns trigger
language plpgsql security definer set search_path='' as $$
declare cash numeric; adjusted numeric;
begin
  select coalesce(sum(amount),0) into adjusted from public.finance_settlement_adjustments
    where studio_id=old.studio_id and expected_item_id=old.id;
  if adjusted>0 then
    select coalesce(sum(amount),0) into cash from public.finance_allocations
      where studio_id=old.studio_id and expected_item_id=old.id;
    if new.amount<cash+adjusted then raise exception 'finance_below_settled'; end if;
    if new.commitment='cancelled' then raise exception 'finance_settlement_adjustment_reverse_required'; end if;
    if new.currency is distinct from old.currency or new.direction is distinct from old.direction
      then raise exception 'finance_expected_identity_locked'; end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_finance_settlement_adjustment_balance() from public,anon,authenticated,service_role;
create trigger finance_expected_adjustment_balance before update on public.finance_expected_items
for each row execute function private.guard_finance_settlement_adjustment_balance();

create function public.close_finance_expected_remainder(
  p_studio_id uuid,p_request_id uuid,p_item_id uuid,p_date date,p_reason text,p_explanation text,p_remaining numeric
) returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','close_expected_remainder','item',p_item_id,'date',p_date,
    'reason',p_reason,'explanation',btrim(coalesce(p_explanation,'')),'remaining',p_remaining);
  result uuid; item public.finance_project_expected_balances;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into item from public.finance_project_expected_balances where studio_id=p_studio_id and id=p_item_id;
  if item.id is null or item.direction<>'incoming' or item.commitment='cancelled'
    or item.settled_amount<=0 or item.remaining_amount<=0
    or not exists(select 1 from public.finance_categories where studio_id=p_studio_id and id=item.category_id and nature='operating')
    or not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null)
    or p_date is null or p_date not between date '1900-01-01' and date '9999-12-31'
    or p_date>(now() at time zone 'Europe/Kyiv')::date
    or p_reason is null or p_reason not in ('fx_difference','client_agreement','other')
    or char_length(coalesce(p_explanation,''))>2000
    or (p_reason='other' and char_length(btrim(coalesce(p_explanation,'')))=0)
    then raise exception 'finance_settlement_adjustment_invalid'; end if;
  if p_remaining is distinct from item.remaining_amount then raise exception 'finance_settlement_preview_stale'; end if;
  insert into public.finance_settlement_adjustments(studio_id,expected_item_id,amount,currency,financial_date,reason,explanation,created_by)
  values(p_studio_id,item.id,item.remaining_amount,item.currency,p_date,p_reason,btrim(coalesce(p_explanation,'')),auth.uid())
  returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

create function public.reverse_finance_settlement_adjustment(
  p_studio_id uuid,p_request_id uuid,p_adjustment_id uuid,p_date date,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','reverse_settlement_adjustment','adjustment',p_adjustment_id,
    'date',p_date,'reason',btrim(p_reason)); result uuid; original public.finance_settlement_adjustments;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into original from public.finance_settlement_adjustments where studio_id=p_studio_id and id=p_adjustment_id and amount>0;
  if original.id is null or exists(select 1 from public.finance_settlement_adjustments
      where studio_id=p_studio_id and reversed_adjustment_id=original.id)
    or p_date is null or p_date<original.financial_date or p_date>(now() at time zone 'Europe/Kyiv')::date
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000
    then raise exception 'finance_settlement_adjustment_invalid'; end if;
  insert into public.finance_settlement_adjustments(studio_id,expected_item_id,amount,currency,financial_date,reason,reversed_adjustment_id,created_by)
  values(p_studio_id,original.expected_item_id,-original.amount,original.currency,p_date,btrim(p_reason),original.id,auth.uid())
  returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

-- One parent lock and transaction encompass the complete cash payment and matches.
-- Snapshot all compatible unpaid installments, not only the rows receiving cash.
create function public.record_finance_project_payment(
  p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_item_id uuid,p_input jsonb,p_allocations jsonb,p_snapshot jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','project_payment_batch','project',p_project_id,'item',p_item_id,
    'input',p_input,'allocations',p_allocations,'snapshot',p_snapshot);
  result uuid; selected public.finance_project_expected_balances; item public.finance_project_expected_balances;
  payment public.finance_payment_availability; plan_id uuid; plan_order uuid[]:='{}'; candidate record; allocation record;
  candidates uuid[]:='{}'; matches uuid[]:='{}'; snapshot_ids uuid[]:='{}'; snapshot_row record;
  item_digits integer; payment_digits integer; rate numeric; total numeric:=0; native_total numeric:=0;
  next_native numeric; row_native numeric; converted numeric; child_request uuid;
  selected_position integer; allocation_position integer; previous_position integer:=0;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_allocations) is distinct from 'array'
    or jsonb_typeof(p_snapshot) is distinct from 'object' or jsonb_typeof(p_snapshot->'items') is distinct from 'array'
    or not(p_snapshot ? 'planRevisionId') or p_input->>'kind' is distinct from 'incoming'
    or p_input ? 'projectReceiptSplits' or p_input ? 'projectRefundSplits'
    then raise exception 'finance_input_invalid'; end if;
  select * into selected from public.finance_project_expected_balances
    where studio_id=p_studio_id and project_id=p_project_id and id=p_item_id;
  if selected.id is null or selected.direction<>'incoming'
    or not exists(select 1 from public.finance_categories where studio_id=p_studio_id and id=selected.category_id and nature='operating')
    then raise exception 'finance_allocation_incompatible'; end if;
  if selected.commitment='cancelled' or selected.remaining_amount<=0 then raise exception 'finance_settlement_preview_stale'; end if;
  select r.terms_id,r.item_order into plan_id,plan_order from public.finance_project_plan_revisions r
    join public.finance_project_terms t on t.studio_id=r.studio_id and t.id=r.terms_id
    where r.studio_id=p_studio_id and r.project_id=p_project_id and t.stream=selected.stream
    order by t.revision desc limit 1;
  if plan_id is distinct from nullif(p_snapshot->>'planRevisionId','')::uuid then raise exception 'finance_settlement_preview_stale'; end if;
  for candidate in select b.id,b.version,b.remaining_amount from public.finance_project_expected_balances b
    join public.finance_categories c on c.studio_id=b.studio_id and c.id=b.category_id
    where b.studio_id=p_studio_id and b.project_id=p_project_id and b.stream=selected.stream and b.currency=selected.currency
      and b.direction='incoming' and b.commitment<>'cancelled' and b.remaining_amount>0 and c.nature='operating'
    order by array_position(plan_order,b.id) nulls last,b.due_date nulls last,b.id
  loop
    candidates:=array_append(candidates,candidate.id);
    if not exists(select 1 from jsonb_to_recordset(p_snapshot->'items') as x("itemId" uuid,version integer,remaining numeric)
      where x."itemId"=candidate.id and x.version=candidate.version and x.remaining=candidate.remaining_amount)
      then raise exception 'finance_settlement_preview_stale'; end if;
  end loop;
  selected_position:=array_position(candidates,p_item_id);
  for snapshot_row in select * from jsonb_to_recordset(p_snapshot->'items') as x("itemId" uuid,version integer,remaining numeric)
  loop
    if snapshot_row."itemId" is null or snapshot_row."itemId"=any(snapshot_ids) or not(snapshot_row."itemId"=any(candidates))
      then raise exception 'finance_settlement_preview_stale'; end if;
    snapshot_ids:=array_append(snapshot_ids,snapshot_row."itemId");
  end loop;
  -- A reused cash request without the batch's audit record is a different operation.
  if exists(select 1 from public.finance_movements where studio_id=p_studio_id and request_id=p_request_id)
    then raise exception 'finance_request_conflict'; end if;
  result:=public.record_finance_movement(p_studio_id,p_request_id,p_input);
  select * into payment from public.finance_payment_availability where studio_id=p_studio_id and id=result;
  if payment.direction<>'incoming' or payment.nature<>'operating' then raise exception 'finance_allocation_incompatible'; end if;
  select minor_units into item_digits from public.finance_currencies where code=selected.currency;
  select minor_units into payment_digits from public.finance_currencies where code=payment.currency;
  if selected.currency=payment.currency then rate:=1;
  else
    rate:=(p_input->'settlementFx'->>'rate')::numeric;
    if rate is null or rate<=0 or rate>1000000000 or rate<>round(rate,10)
      or coalesce(p_input->'settlementFx'->>'source','') not in ('manual','nbu')
      or (p_input->'settlementFx'->>'effectiveDate')::date is distinct from payment.financial_date
      then raise exception 'finance_fx_required'; end if;
  end if;
  converted:=round(payment.original_amount*rate,item_digits);
  for allocation in select * from jsonb_to_recordset(p_allocations) as x("itemId" uuid,amount numeric)
  loop
    if allocation."itemId" is null or allocation."itemId"=any(matches) or not(allocation."itemId"=any(candidates))
      then raise exception 'finance_allocation_incompatible'; end if;
    allocation_position:=array_position(candidates,allocation."itemId");
    if allocation_position<selected_position or allocation_position<=previous_position
      then raise exception 'finance_allocation_incompatible'; end if;
    previous_position:=allocation_position;
    matches:=array_append(matches,allocation."itemId");
    select * into item from public.finance_project_expected_balances where studio_id=p_studio_id and id=allocation."itemId";
    if allocation.amount is null or allocation.amount<=0 or allocation.amount>9999999999.9999
      or allocation.amount<>round(allocation.amount,item_digits) then raise exception 'finance_amount_invalid'; end if;
    if allocation.amount>item.remaining_amount then raise exception 'finance_overallocation'; end if;
    total:=total+allocation.amount;
    if total>converted then raise exception 'finance_overallocation'; end if;
    next_native:=case when selected.currency=payment.currency then total
      when total=converted then payment.original_amount
      else ceil(total/rate*power(10::numeric,payment_digits))/power(10::numeric,payment_digits) end;
    row_native:=next_native-native_total;
    if row_native<=0 or next_native>payment.original_amount then raise exception 'finance_settlement_split_unrepresentable'; end if;
    child_request:=md5(p_studio_id::text||':'||p_request_id::text||':project-payment:'||allocation."itemId"::text)::uuid;
    if selected.currency=payment.currency then
      perform public.allocate_finance_payment(p_studio_id,child_request,allocation."itemId",result,allocation.amount);
    else
      perform private.allocate_finance_payment_cross(p_studio_id,child_request,allocation."itemId",result,
        allocation.amount,row_native,p_input->'settlementFx');
    end if;
    native_total:=next_native;
  end loop;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

-- This context keeps excess principal associated with the originating project
-- without turning settlement into reporting cash attribution.
create view public.finance_project_payment_context with(security_invoker=true) as
with recursive project_payments(studio_id,project_id,movement_id) as (
  select r.studio_id,(r.payload->>'project')::uuid,r.result_id
  from public.finance_planning_requests r join public.finance_movements m on m.studio_id=r.studio_id and m.id=r.result_id
  where r.payload->>'operation'='project_payment_batch' and m.kind='incoming' and m.nature='operating'
  union
  select c.studio_id,p.project_id,c.replacement_movement_id
  from project_payments p join public.finance_movement_corrections c
    on c.studio_id=p.studio_id and c.original_movement_id=p.movement_id
  join public.finance_movements m on m.studio_id=c.studio_id and m.id=c.replacement_movement_id
  where m.kind='incoming' and m.nature='operating'
) select studio_id,project_id,movement_id from project_payments;
revoke all on public.finance_project_payment_context from public,anon,authenticated,service_role;
grant select on public.finance_project_payment_context to authenticated;
revoke all on function public.record_finance_project_payment(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb),
  public.close_finance_expected_remainder(uuid,uuid,uuid,date,text,text,numeric),
  public.reverse_finance_settlement_adjustment(uuid,uuid,uuid,date,text) from public,anon,authenticated,service_role;
grant execute on function public.record_finance_project_payment(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb),
  public.close_finance_expected_remainder(uuid,uuid,uuid,date,text,text,numeric),
  public.reverse_finance_settlement_adjustment(uuid,uuid,uuid,date,text) to authenticated;
