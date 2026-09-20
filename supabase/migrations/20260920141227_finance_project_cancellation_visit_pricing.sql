create or replace function private.guard_finance_project_expected() returns trigger
language plpgsql security definer set search_path='' as $$
declare link public.finance_project_items; terms public.finance_project_terms; scheduled numeric;
begin
  select * into link from public.finance_project_items where studio_id=old.studio_id and expected_item_id=old.id;
  if not found then return new; end if;
  if new.direction<>'incoming' then raise exception 'finance_project_income_required'; end if;
  if exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id)
    and row(new.amount,new.currency,new.direction,new.category_id,new.due_date,new.certainty)
      is distinct from row(old.amount,old.currency,old.direction,old.category_id,old.due_date,old.certainty)
    then raise exception 'finance_project_settled_terms_locked'; end if;
  if new.commitment is distinct from old.commitment then
    -- Only the reasoned RPC can close an expectation. Its audit is inserted in
    -- this transaction before the update; authenticated callers cannot insert it.
    if new.commitment='cancelled' then
      if exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id having sum(amount)<>0)
        or not exists(select 1 from public.finance_planning_requests where studio_id=old.studio_id
          and payload->>'operation'='project_cancellation' and payload->'input'->>'itemId'=old.id::text
          and (payload->'input'->>'version')::integer=old.version)
        then raise exception 'finance_project_cancellation_required'; end if;
    elsif old.commitment='cancelled' or exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id)
      then raise exception 'finance_project_settled_terms_locked'; end if;
  end if;
  if link.stream='design' then
    select * into terms from public.finance_project_current_terms where studio_id=old.studio_id and project_id=link.project_id and stream='design';
    select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances where studio_id=old.studio_id and project_id=link.project_id and stream='design' and commitment<>'cancelled' and id<>old.id;
    if new.currency<>terms.currency then raise exception 'finance_project_currency_locked'; end if;
    if scheduled+(case when new.commitment='cancelled' then 0 else new.amount end)>terms.amount then raise exception 'finance_project_over_scheduled'; end if;
  end if;
  return new;
end;
$$;

-- Close unpaid/refunded expectations; retain any remaining settlement only after
-- explicit confirmation. Releasing and re-matching append history, never cash.
create function public.cancel_finance_project_expectation(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','project_cancellation','input',p_input);
  result uuid; original public.finance_expected_items; link public.finance_project_items;
  paid numeric; allocations jsonb; allocation jsonb; reason text:=btrim(p_input->>'reason');
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if reason is null or char_length(reason) not between 1 and 2000 then raise exception 'finance_project_reason_required'; end if;
  select * into original from public.finance_expected_items where studio_id=p_studio_id and id=(p_input->>'itemId')::uuid;
  select * into link from public.finance_project_items where studio_id=p_studio_id and expected_item_id=original.id;
  if link.expected_item_id is null or original.commitment='cancelled' then raise exception 'finance_project_invalid'; end if;
  select coalesce(sum(amount),0) into paid from public.finance_allocations where studio_id=p_studio_id and expected_item_id=original.id;
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
revoke all on function public.cancel_finance_project_expectation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cancel_finance_project_expectation(uuid,uuid,jsonb) to authenticated;

create or replace function public.save_finance_project_item(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','project_item','project',p_project_id,'input',p_input);
  result uuid; item_id uuid; terms public.finance_project_terms; link public.finance_project_items;
  visit public.calendar_events; contractor_name text; contractor_studio uuid; scheduled numeric;
  v_stream text:=p_input->>'stream'; source text:=coalesce(p_input->>'source','manual'); item jsonb:=p_input->'item';
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id) then raise exception 'finance_project_invalid'; end if;
  if item->>'direction' is distinct from 'incoming' then raise exception 'finance_project_income_required'; end if;
  item_id:=nullif(item->>'id','')::uuid;
  if item_id is not null then
    select * into link from public.finance_project_items where studio_id=p_studio_id and expected_item_id=item_id and project_id=p_project_id;
    if not found then raise exception 'finance_project_invalid'; end if;
    -- Source identities are permanent, including after a refund/cancellation.
    if v_stream is distinct from link.stream then raise exception 'finance_project_context_locked'; end if;
  else
    if source not in ('manual','visit') then raise exception 'finance_project_source_invalid'; end if;
    select * into terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=v_stream;
    if v_stream='design' then
      if terms.id is null then raise exception 'finance_project_agreement_required'; end if;
      if terms.currency is distinct from item->>'currency' then raise exception 'finance_project_currency_locked'; end if;
      select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances where studio_id=p_studio_id and project_id=p_project_id and finance_project_expected_balances.stream='design' and commitment<>'cancelled';
      if scheduled+(case when item->>'commitment'='cancelled' then 0 else (item->>'amount')::numeric end)>terms.amount then raise exception 'finance_project_over_scheduled'; end if;
    end if;
    if source='visit' then
      select * into visit from public.calendar_events where id=(p_input->>'visitId')::uuid and studio_id=p_studio_id and project_id=p_project_id and event_type='site_visit' and cancelled_at is null for share;
      if not found or v_stream<>'supervision' then raise exception 'finance_project_visit_invalid'; end if;
      -- Select the terms that actually apply to the visit, not today's rate.
      select * into terms from public.finance_project_terms where studio_id=p_studio_id and project_id=p_project_id and finance_project_terms.stream='supervision'
        and effective_from<=(visit.starts_at at time zone 'Europe/Kyiv')::date order by effective_from desc,revision desc limit 1;
      if terms.id is null or terms.mode not in ('per_visit','monthly') or (terms.effective_through is not null and terms.effective_through<(visit.starts_at at time zone 'Europe/Kyiv')::date)
        or (terms.mode='monthly' and not coalesce((p_input->>'extraVisit')::boolean,false)) then raise exception 'finance_project_visit_not_billable'; end if;
      -- Contract defaults must still match the applicable revision at submission.
      -- Explicit manual prices remain supported and are recorded in the request.
      if p_input->>'visitPricing'='contract' and (terms.mode<>'per_visit'
        or terms.id is distinct from nullif(p_input->>'visitTermsId','')::uuid
        or terms.amount is distinct from (item->>'amount')::numeric or terms.currency is distinct from item->>'currency')
        then raise exception 'finance_project_visit_price_changed'; end if;
    end if;
    if nullif(p_input->>'contractorId','') is not null then
      select c.name,g.studio_id into contractor_name,contractor_studio from public.contractors c join public.contractor_categories g on g.id=c.category_id where c.id=(p_input->>'contractorId')::uuid for share of c;
      if contractor_studio is distinct from p_studio_id or v_stream<>'contractor_bonus' then raise exception 'finance_project_contractor_invalid'; end if;
    end if;
  end if;
  result:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),item);
  if item_id is null then
    insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream,terms_id,source,visit_id,contractor_id,context_label,extra_visit)
    values(p_studio_id,result,p_project_id,v_stream,terms.id,source,visit.id,nullif(p_input->>'contractorId','')::uuid,
      coalesce(contractor_name,case when visit.id is not null then visit.title||' · '||(visit.starts_at at time zone 'Europe/Kyiv')::date::text end,''),coalesce((p_input->>'extraVisit')::boolean,false));
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

