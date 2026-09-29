-- Retained cancellation uses actual settled net/VAT snapshots.
create or replace function public.cancel_finance_project_expectation(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','project_cancellation','input',p_input);
  result uuid; original public.finance_expected_items; link public.finance_project_items;
  paid numeric; retained_net numeric; allocations jsonb; allocation jsonb; reason text:=btrim(p_input->>'reason');
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if reason is null or char_length(reason) not between 1 and 2000 then raise exception 'finance_project_reason_required'; end if;
  select * into original from public.finance_expected_items where studio_id=p_studio_id and id=(p_input->>'itemId')::uuid;
  select * into link from public.finance_project_items where studio_id=p_studio_id and expected_item_id=original.id;
  if link.expected_item_id is null or original.commitment='cancelled' then raise exception 'finance_project_invalid'; end if;
  select coalesce(sum(amount),0),coalesce(sum(net_amount),0) into paid,retained_net
    from public.finance_allocations where studio_id=p_studio_id and expected_item_id=original.id;
  if original.version is distinct from (p_input->>'version')::integer or paid is distinct from (p_input->>'settledAmount')::numeric
    then raise exception 'finance_version_conflict'; end if;
  if paid>0 and not coalesce((p_input->>'retainSettlement')::boolean,false) then raise exception 'finance_project_retention_required'; end if;
  result:=case when paid>0 then gen_random_uuid() else original.id end;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'movement',a.movement_id,'amount',a.amount+coalesce(r.amount,0))),'[]') into allocations
    from public.finance_allocations a
    left join lateral (select sum(amount) amount from public.finance_allocations where studio_id=p_studio_id and released_allocation_id=a.id) r on true
    where a.studio_id=p_studio_id and a.expected_item_id=original.id and a.amount>0 and a.amount+coalesce(r.amount,0)>0;
  for allocation in select value from jsonb_array_elements(allocations) loop
    perform public.release_finance_allocation(p_studio_id,gen_random_uuid(),(allocation->>'id')::uuid,reason);
  end loop;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  update public.finance_expected_items set commitment='cancelled',is_established=false,version=version+1,updated_at=now() where id=original.id and studio_id=p_studio_id;
  if paid>0 then
    -- Preserve the original category even if it has since been archived.
    insert into public.finance_expected_items(id,studio_id,direction,amount,currency,category_id,description,due_date,expected_payment_date,commitment,certainty,is_established,created_by)
      values(result,p_studio_id,original.direction,paid,original.currency,original.category_id,original.description,original.due_date,original.expected_payment_date,'agreed','fixed',original.is_established,auth.uid());
    update public.finance_expected_items set vat_rate=original.vat_rate,price_basis=original.price_basis,
      net_amount=retained_net,vat_amount=paid-retained_net where studio_id=p_studio_id and id=result;
    -- Visit/month source identities remain permanently reserved on the original.
    insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream,terms_id,source,contractor_id,context_label)
      values(p_studio_id,result,link.project_id,link.stream,link.terms_id,'manual',link.contractor_id,link.context_label);
    for allocation in select value from jsonb_array_elements(allocations) loop
      perform public.allocate_finance_payment(p_studio_id,gen_random_uuid(),result,(allocation->>'movement')::uuid,(allocation->>'amount')::numeric);
    end loop;
  end if;
  return result;
end;
$$;
