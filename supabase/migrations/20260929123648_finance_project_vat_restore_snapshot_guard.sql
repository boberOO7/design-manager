-- Explicit snapshot updates can carry residual VAT cents from settled allocations.
create or replace function private.set_finance_expected_vat() returns trigger
language plpgsql security definer set search_path='' as $$
declare digits integer; parts record;
begin
  select minor_units into digits from public.finance_currencies where code=new.currency;
  if digits is null then raise exception 'finance_amount_invalid'; end if;
  if tg_op='UPDATE' and exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id)
    and row(new.amount,new.currency,new.vat_rate,new.price_basis,new.net_amount,new.vat_amount)
      is distinct from row(old.amount,old.currency,old.vat_rate,old.price_basis,old.net_amount,old.vat_amount)
    then raise exception 'finance_project_settled_terms_locked'; end if;
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
