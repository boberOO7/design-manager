-- Keep reconciliation unambiguous and reserve restored trip payments.
create or replace function private.reconcile_finance_trip(p_studio uuid,p_trip uuid) returns void
language plpgsql security definer set search_path='' as $$
declare person record; item public.finance_expected_items; link record; spent numeric; advanced numeric;
  paid_out numeric; paid_in numeric; balance numeric; target numeric; balance_direction text; category uuid; result uuid;
  previous text:=current_setting('studioflow.trip_reconcile',true);
begin
  perform 1 from public.finance_settings where studio_id=p_studio for update;
  perform set_config('studioflow.trip_reconcile','on',true);
  -- Cash expectations consume their entire payment and never add a second future cost.
  for link in select e.expected_item_id,e.movement_id,e.net_amount from public.finance_trip_entry_values e where e.studio_id=p_studio and e.trip_id=p_trip and e.movement_id is not null loop
    update public.finance_expected_items set amount=case when link.net_amount>0 then link.net_amount else amount end,
      commitment=case when link.net_amount>0 then 'agreed' else 'cancelled' end,is_established=link.net_amount>0,version=version+1,updated_at=now()
      where studio_id=p_studio and id=link.expected_item_id and (amount is distinct from link.net_amount or commitment is distinct from case when link.net_amount>0 then 'agreed' else 'cancelled' end);
    -- Reversing a refund restores cash availability, not old allocations. Re-match the
    -- restored trip cash explicitly so it cannot become an unrelated payment.
    select * into item from public.finance_expected_items where studio_id=p_studio and id=link.expected_item_id;
    select coalesce(sum(amount),0) into paid_out from public.finance_allocations where studio_id=p_studio and expected_item_id=item.id;
    if link.net_amount>paid_out then
      perform public.allocate_finance_payment(p_studio,gen_random_uuid(),item.id,link.movement_id,link.net_amount-paid_out);
    end if;
  end loop;
  for person in select distinct employee_id,currency from public.finance_trip_entries where studio_id=p_studio and trip_id=p_trip and employee_id is not null loop
    select coalesce(sum(net_amount) filter(where kind='expense'),0),coalesce(sum(net_amount) filter(where kind='advance'),0)
      into spent,advanced from public.finance_trip_entry_values where studio_id=p_studio and trip_id=p_trip and employee_id=person.employee_id and currency=person.currency;
    select coalesce(sum(a.amount) filter(where b.direction='outgoing'),0),coalesce(sum(a.amount) filter(where b.direction='incoming'),0)
      into paid_out,paid_in from public.finance_trip_balances b left join public.finance_allocations a on a.studio_id=b.studio_id and a.expected_item_id=b.expected_item_id
      where b.studio_id=p_studio and b.trip_id=p_trip and b.employee_id=person.employee_id and b.currency=person.currency;
    balance:=spent-advanced-paid_out+paid_in;
    foreach balance_direction in array array['outgoing','incoming'] loop
      target:=case when balance_direction='outgoing' then paid_out+greatest(balance,0) else paid_in+greatest(-balance,0) end;
      select i.* into item from public.finance_trip_balances b join public.finance_expected_items i on i.studio_id=b.studio_id and i.id=b.expected_item_id
        where b.studio_id=p_studio and b.trip_id=p_trip and b.employee_id=person.employee_id and b.currency=person.currency and b.direction=balance_direction;
      if item.id is null and target>0 then
        category:=private.trip_category(p_studio,balance_direction);
        -- Internal derived expectations can retain an archived reporting category.
        insert into public.finance_expected_items(studio_id,direction,amount,currency,category_id,description,expected_payment_date,commitment,certainty,is_established,created_by)
        select p_studio,balance_direction,target,person.currency,category,t.title||' · '||v.employee_name,(now() at time zone 'Europe/Kyiv')::date,'agreed','fixed',true,auth.uid()
          from public.finance_trips t join public.finance_trip_travelers v on v.studio_id=t.studio_id and v.trip_id=t.id and v.employee_id=person.employee_id
          where t.studio_id=p_studio and t.id=p_trip returning id into result;
        insert into public.finance_trip_balances values(p_studio,p_trip,person.employee_id,person.currency,balance_direction,result);
      elsif item.id is not null then
        update public.finance_expected_items set amount=case when target>0 then target else amount end,
          commitment=case when target>0 then 'agreed' else 'cancelled' end,is_established=target>0,version=version+1,updated_at=now()
          where id=item.id and (amount is distinct from target or commitment is distinct from case when target>0 then 'agreed' else 'cancelled' end);
      end if;
    end loop;
  end loop;
  perform set_config('studioflow.trip_reconcile',coalesce(previous,''),true);
end $$;

