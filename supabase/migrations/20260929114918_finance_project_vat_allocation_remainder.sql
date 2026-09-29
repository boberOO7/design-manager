-- Give the final settlement or refund slice the remaining cents from its
-- original obligation/allocation snapshot, so split rounding closes exactly.
create or replace function private.set_finance_allocation_vat() returns trigger
language plpgsql security definer set search_path='' as $$
declare expected public.finance_expected_items; original public.finance_allocations;
  digits integer; allocated_gross numeric; allocated_net numeric;
begin
  select * into expected from public.finance_expected_items where studio_id=new.studio_id and id=new.expected_item_id;
  select minor_units into digits from public.finance_currencies where code=expected.currency;
  if new.released_allocation_id is not null then
    select * into original from public.finance_allocations where studio_id=new.studio_id and id=new.released_allocation_id;
    select coalesce(-sum(amount),0),coalesce(-sum(net_amount),0) into allocated_gross,allocated_net
      from public.finance_allocations where studio_id=new.studio_id and released_allocation_id=original.id;
    new.net_amount:=case when -new.amount=original.amount-allocated_gross then -(original.net_amount-allocated_net)
      else -round(original.net_amount*(-new.amount)/original.amount,digits) end;
  else
    select coalesce(sum(amount),0),coalesce(sum(net_amount),0) into allocated_gross,allocated_net
      from public.finance_allocations where studio_id=new.studio_id and expected_item_id=new.expected_item_id;
    new.net_amount:=case when new.amount=expected.amount-allocated_gross then expected.net_amount-allocated_net
      else round(expected.net_amount*new.amount/expected.amount,digits) end;
  end if;
  new.vat_amount:=new.amount-new.net_amount;
  return new;
end;
$$;
