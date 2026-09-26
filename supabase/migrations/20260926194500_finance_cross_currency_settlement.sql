-- An allocation has two signed values: obligation units and actual account units.
-- Existing allocations were only permitted between identical currencies.
alter table public.finance_allocations
  add column payment_amount numeric,
  add column payment_currency text references public.finance_currencies(code),
  add column obligation_currency text references public.finance_currencies(code),
  add column settlement_rate numeric,
  add column settlement_source text,
  add column settlement_effective_date date;
update public.finance_allocations a set
  payment_amount=a.amount,payment_currency=e.currency,obligation_currency=i.currency,
  settlement_rate=1,settlement_source='identity',settlement_effective_date=m.financial_date
from public.finance_expected_items i,public.finance_movements m,public.finance_movement_entries e
where i.studio_id=a.studio_id and i.id=a.expected_item_id
  and m.studio_id=a.studio_id and m.id=a.movement_id
  and e.studio_id=m.studio_id and e.movement_id=m.id and e.entry_role='primary';
alter table public.finance_allocations
  alter column payment_amount set not null,
  alter column payment_currency set not null,
  alter column obligation_currency set not null,
  alter column settlement_rate set not null,
  alter column settlement_source set not null,
  alter column settlement_effective_date set not null,
  add constraint finance_allocation_payment_amount_check check
    (payment_amount<>0 and payment_amount between -9999999999.9999 and 9999999999.9999
      and (payment_amount>0)=(amount>0)),
  add constraint finance_allocation_rate_check check
    (settlement_rate>0 and settlement_rate<=1000000000 and settlement_rate=round(settlement_rate,10)
      and settlement_source in ('identity','manual','nbu')),
  add constraint finance_allocation_fx_check check
    ((payment_currency=obligation_currency and settlement_source='identity' and settlement_rate=1)
      or (payment_currency<>obligation_currency and settlement_source in ('manual','nbu')));

-- A dated NBU cross-rate is valid for non-UAH reporting currencies too.
alter table public.finance_movement_entries drop constraint finance_movement_entries_check1;

-- Cash availability is measured in the account currency; expected balances
-- and project totals continue to sum finance_allocations.amount in obligation units.
create or replace view public.finance_payment_availability with(security_invoker=true) as
select m.id,m.studio_id,case when m.kind='owner_withdrawal' then 'outgoing' else m.kind end as direction,m.nature,m.category,m.category_id,m.description,m.financial_date,
  e.account_id,e.currency,abs(e.amount) as original_amount,
  case when r.id is not null then 0 else abs(e.amount)-coalesce(f.refunded,0) end as net_amount,
  coalesce(a.allocated,0) as allocated_amount,
  case when r.id is not null then 0 else abs(e.amount)-coalesce(f.refunded,0) end-coalesce(a.allocated,0) as unapplied_amount
from public.finance_movements m join public.finance_movement_entries e on e.studio_id=m.studio_id and e.movement_id=m.id and e.entry_role='primary'
left join public.finance_movements r on r.studio_id=m.studio_id and r.related_movement_id=m.id and r.kind='reversal'
left join (
  select f.studio_id,f.related_movement_id,sum(abs(e.amount)) as refunded from public.finance_movements f
  join public.finance_movement_entries e on e.studio_id=f.studio_id and e.movement_id=f.id and e.entry_role='primary'
  where f.kind='refund' and not exists(select 1 from public.finance_movements r where r.studio_id=f.studio_id and r.related_movement_id=f.id and r.kind='reversal')
  group by f.studio_id,f.related_movement_id
) f on f.studio_id=m.studio_id and f.related_movement_id=m.id
left join (select studio_id,movement_id,sum(payment_amount) as allocated from public.finance_allocations group by studio_id,movement_id) a on a.studio_id=m.studio_id and a.movement_id=m.id
where m.kind in ('incoming','outgoing','owner_withdrawal');

create or replace function public.allocate_finance_payment(p_studio_id uuid,p_request_id uuid,p_item_id uuid,p_movement_id uuid,p_amount numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','allocate','item',p_item_id,'movement',p_movement_id,'amount',p_amount);
  result uuid; item public.finance_expected_balances; payment public.finance_payment_availability; digits integer;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into item from public.finance_expected_balances where studio_id=p_studio_id and id=p_item_id;
  select * into payment from public.finance_payment_availability where studio_id=p_studio_id and id=p_movement_id;
  if item.id is null or payment.id is null or item.commitment='cancelled' or item.currency<>payment.currency or item.direction<>payment.direction then raise exception 'finance_allocation_incompatible'; end if;
  if payment.nature is distinct from (select nature from public.finance_categories where studio_id=p_studio_id and id=item.category_id) then raise exception 'finance_allocation_incompatible'; end if;
  select minor_units into digits from public.finance_currencies where code=item.currency;
  if p_amount is null or not(p_amount>0 and p_amount<=9999999999.9999) or p_amount<>round(p_amount,digits) then raise exception 'finance_amount_invalid'; end if;
  if p_amount>item.remaining_amount or p_amount>payment.unapplied_amount then raise exception 'finance_overallocation'; end if;
  insert into public.finance_allocations(studio_id,expected_item_id,movement_id,amount,payment_amount,payment_currency,obligation_currency,settlement_rate,settlement_source,settlement_effective_date,created_by)
  values(p_studio_id,p_item_id,p_movement_id,p_amount,p_amount,payment.currency,item.currency,1,'identity',payment.financial_date,auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

create function private.allocate_finance_payment_cross(p_studio_id uuid,p_request_id uuid,p_item_id uuid,p_movement_id uuid,p_amount numeric,p_payment_amount numeric,p_fx jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','allocate_cross','item',p_item_id,'movement',p_movement_id,'amount',p_amount,'paymentAmount',p_payment_amount,'fx',p_fx);
  result uuid; item public.finance_expected_balances; payment public.finance_payment_availability;
  item_digits integer; payment_digits integer; rate numeric; source text; effective date;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into item from public.finance_expected_balances where studio_id=p_studio_id and id=p_item_id;
  select * into payment from public.finance_payment_availability where studio_id=p_studio_id and id=p_movement_id;
  if item.id is null or payment.id is null or item.commitment='cancelled' or item.currency=payment.currency or item.direction<>payment.direction
    or payment.nature is distinct from (select nature from public.finance_categories where studio_id=p_studio_id and id=item.category_id)
  then raise exception 'finance_allocation_incompatible'; end if;
  select minor_units into item_digits from public.finance_currencies where code=item.currency;
  select minor_units into payment_digits from public.finance_currencies where code=payment.currency;
  rate:=(p_fx->>'rate')::numeric; source:=p_fx->>'source'; effective:=(p_fx->>'effectiveDate')::date;
  if rate is null or rate<=0 or rate>1000000000 or rate<>round(rate,10)
    or source not in ('manual','nbu') or effective is distinct from payment.financial_date
  then raise exception 'finance_fx_required'; end if;
  if p_amount is null or p_payment_amount is null or p_amount<=0 or p_payment_amount<=0
    or p_amount<>round(p_amount,item_digits) or p_payment_amount<>round(p_payment_amount,payment_digits)
    or p_amount>item.remaining_amount or p_payment_amount>payment.unapplied_amount
  then raise exception 'finance_overallocation'; end if;
  insert into public.finance_allocations(studio_id,expected_item_id,movement_id,amount,payment_amount,payment_currency,obligation_currency,settlement_rate,settlement_source,settlement_effective_date,created_by)
  values(p_studio_id,p_item_id,p_movement_id,p_amount,p_payment_amount,payment.currency,item.currency,rate,source,effective,auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;
revoke all on function private.allocate_finance_payment_cross(uuid,uuid,uuid,uuid,numeric,numeric,jsonb) from public,anon,authenticated,service_role;

create or replace function public.record_finance_expected_payment(p_studio_id uuid,p_request_id uuid,p_item_id uuid,p_input jsonb,p_allocation_amount numeric default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare movement uuid; item public.finance_expected_balances; payment public.finance_payment_availability; prior jsonb;
  rate numeric; settled numeric; payment_used numeric; converted numeric; item_digits integer; payment_digits integer;
begin
  movement:=public.record_finance_movement(p_studio_id,p_request_id,p_input);
  select payload into prior from public.finance_planning_requests
    where studio_id=p_studio_id and request_id=p_request_id;
  if prior is not null then
    if prior->>'item'=p_item_id::text and prior->>'movement'=movement::text
      and prior->>'operation' in ('allocate','allocate_cross')
      and (p_allocation_amount is null or (prior->>'amount')::numeric=p_allocation_amount) then return movement; end if;
    raise exception 'finance_request_conflict';
  end if;
  select * into item from public.finance_expected_balances where studio_id=p_studio_id and id=p_item_id;
  select * into payment from public.finance_payment_availability where studio_id=p_studio_id and id=movement;
  if item.id is null or payment.id is null or item.commitment='cancelled' or item.direction<>payment.direction then raise exception 'finance_allocation_incompatible'; end if;
  if item.currency=payment.currency then
    settled:=coalesce(p_allocation_amount,least(item.remaining_amount,payment.unapplied_amount));
    perform public.allocate_finance_payment(p_studio_id,p_request_id,p_item_id,movement,settled);
  else
    rate:=(p_input->'settlementFx'->>'rate')::numeric;
    if rate is null or rate<=0 or rate>1000000000 or rate<>round(rate,10) then raise exception 'finance_fx_required'; end if;
    select minor_units into item_digits from public.finance_currencies where code=item.currency;
    select minor_units into payment_digits from public.finance_currencies where code=payment.currency;
    converted:=round(payment.unapplied_amount*rate,item_digits);
    settled:=least(converted,item.remaining_amount);
    if p_allocation_amount is not null and p_allocation_amount<>settled then raise exception 'finance_allocation_incompatible'; end if;
    payment_used:=case when settled=converted then payment.unapplied_amount
      else least(payment.unapplied_amount,ceil(settled/rate*10^payment_digits)/10^payment_digits) end;
    if settled<=0 or payment_used<=0 then raise exception 'finance_amount_invalid'; end if;
    perform private.allocate_finance_payment_cross(p_studio_id,p_request_id,p_item_id,movement,settled,payment_used,p_input->'settlementFx');
  end if;
  return movement;
end $$;

create or replace function public.release_finance_allocation(p_studio_id uuid,p_request_id uuid,p_allocation_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','release','allocation',p_allocation_id,'reason',btrim(p_reason));
  result uuid; original public.finance_allocations; remaining numeric; payment_remaining numeric;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into original from public.finance_allocations where studio_id=p_studio_id and id=p_allocation_id and amount>0;
  if not found or p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'finance_allocation_invalid'; end if;
  select original.amount+coalesce(sum(amount),0),original.payment_amount+coalesce(sum(payment_amount),0)
    into remaining,payment_remaining from public.finance_allocations where studio_id=p_studio_id and released_allocation_id=original.id;
  if remaining<=0 or payment_remaining<=0 then raise exception 'finance_allocation_released'; end if;
  insert into public.finance_allocations(studio_id,expected_item_id,movement_id,amount,payment_amount,payment_currency,obligation_currency,settlement_rate,settlement_source,settlement_effective_date,released_allocation_id,reason,created_by)
  values(p_studio_id,original.expected_item_id,original.movement_id,-remaining,-payment_remaining,original.payment_currency,original.obligation_currency,original.settlement_rate,original.settlement_source,original.settlement_effective_date,original.id,btrim(p_reason),auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

create or replace function private.release_refunded_finance_allocations() returns trigger
language plpgsql security definer set search_path='' as $$
declare event public.finance_movements; payment public.finance_payment_availability;
  excess numeric; allocation record; released_cash numeric; released_obligation numeric; obligation_digits integer;
begin
  if new.entry_role<>'primary' then return new; end if;
  select * into event from public.finance_movements where studio_id=new.studio_id and id=new.movement_id;
  if event.kind not in ('refund','reversal') then return new; end if;
  select * into payment from public.finance_payment_availability where studio_id=new.studio_id and id=event.related_movement_id;
  if not found then return new; end if;
  excess:=payment.allocated_amount-payment.net_amount;
  for allocation in
    select a.*,a.amount+coalesce((select sum(r.amount) from public.finance_allocations r where r.studio_id=a.studio_id and r.released_allocation_id=a.id),0) as remaining,
      a.payment_amount+coalesce((select sum(r.payment_amount) from public.finance_allocations r where r.studio_id=a.studio_id and r.released_allocation_id=a.id),0) as cash_remaining
    from public.finance_allocations a where a.studio_id=new.studio_id and a.movement_id=payment.id and a.amount>0 order by a.created_at desc,a.id desc
  loop
    exit when excess<=0;
    released_cash:=least(excess,allocation.cash_remaining);
    if released_cash>0 then
      select minor_units into obligation_digits from public.finance_currencies where code=allocation.obligation_currency;
      released_obligation:=case when released_cash=allocation.cash_remaining then allocation.remaining
        else least(allocation.remaining,round(released_cash*allocation.amount/allocation.payment_amount,obligation_digits)) end;
      if released_obligation<=0 then raise exception 'finance_allocation_precision'; end if;
      insert into public.finance_allocations(studio_id,expected_item_id,movement_id,amount,payment_amount,payment_currency,obligation_currency,settlement_rate,settlement_source,settlement_effective_date,released_allocation_id,cause_movement_id,reason,created_by)
      values(new.studio_id,allocation.expected_item_id,payment.id,-released_obligation,-released_cash,allocation.payment_currency,allocation.obligation_currency,allocation.settlement_rate,allocation.settlement_source,allocation.settlement_effective_date,allocation.id,event.id,'cash_'||event.kind,event.created_by);
      excess:=excess-released_cash;
    end if;
  end loop;
  return new;
end $$;
