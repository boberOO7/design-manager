-- Preserve distributed schedule cents during ordinary Expected edits.
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
  elsif tg_op='INSERT' or ((new.net_amount,new.vat_amount) is not distinct from (old.net_amount,old.vat_amount)
    and (new.amount,new.currency,new.vat_rate,new.price_basis) is distinct from (old.amount,old.currency,old.vat_rate,old.price_basis)) then
    select * into parts from private.finance_vat_parts(new.amount,new.vat_rate,'gross',digits);
    new.net_amount:=parts.net_amount; new.vat_amount:=parts.vat_amount;
  elsif new.net_amount+new.vat_amount<>new.amount
    or (abs(new.vat_amount-round(new.net_amount*new.vat_rate/100,digits))>power(10::numeric,-digits)
      and abs(new.net_amount-round(new.amount/(1+new.vat_rate/100),digits))>power(10::numeric,-digits)) then
    raise exception 'finance_project_vat_invalid';
  end if;
  return new;
end;
$$;

create or replace function public.save_finance_project_item(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','project_item','project',p_project_id,'input',p_input);
  result uuid; item_id uuid; terms public.finance_project_terms; link public.finance_project_items;
  visit public.calendar_events; contractor_name text; contractor_studio uuid; scheduled numeric;
  existing public.finance_expected_items; priced record; digits integer; rate numeric; basis text; gross numeric; net_snapshot numeric; vat_snapshot numeric;
  v_stream text:=p_input->>'stream'; source text:=coalesce(p_input->>'source','manual'); item jsonb:=p_input->'item';
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id) then raise exception 'finance_project_invalid'; end if;
  if v_stream='expenses' then
    if item->>'direction' is distinct from 'outgoing' or source<>'manual'
      or not exists(select 1 from public.finance_categories c where c.studio_id=p_studio_id
        and c.id=(item->>'categoryId')::uuid and c.direction='outgoing' and c.nature='operating')
      or (nullif(item->>'id','') is null and not exists(
        select 1 from public.finance_categories c where c.studio_id=p_studio_id
          and c.id=(item->>'categoryId')::uuid and c.project_expense_enabled))
      then raise exception 'finance_project_expense_invalid'; end if;
  elsif item->>'direction' is distinct from 'incoming' then
    raise exception 'finance_project_income_required';
  end if;
  item_id:=nullif(item->>'id','')::uuid;
  if item_id is not null then
    select * into link from public.finance_project_items where studio_id=p_studio_id and expected_item_id=item_id and project_id=p_project_id;
    if not found then raise exception 'finance_project_invalid'; end if;
    select * into existing from public.finance_expected_items where studio_id=p_studio_id and id=item_id;
    if coalesce((p_input->>'useCurrentTerms')::boolean,false) then
      select * into terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=v_stream;
    end if;
    -- Source identities are permanent, including after a refund/cancellation.
    if v_stream is distinct from link.stream then raise exception 'finance_project_context_locked'; end if;
  else
    if source not in ('manual','visit') then raise exception 'finance_project_source_invalid'; end if;
    select * into terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=v_stream;
    if v_stream='design' then
      if terms.id is null then raise exception 'finance_project_agreement_required'; end if;
      if terms.currency is distinct from item->>'currency' then raise exception 'finance_project_currency_locked'; end if;
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
  select minor_units into digits from public.finance_currencies where code=item->>'currency';
  if digits is null then raise exception 'finance_amount_invalid'; end if;
  rate:=case when item_id is not null and not coalesce((p_input->>'useCurrentTerms')::boolean,false) then existing.vat_rate else terms.vat_rate end;
  basis:=case when item_id is not null and not coalesce((p_input->>'useCurrentTerms')::boolean,false) then existing.price_basis else terms.price_basis end;
  select * into priced from private.finance_vat_parts((item->>'amount')::numeric,rate,
    case when coalesce((p_input->>'useAgreementBasis')::boolean,false) then basis else 'gross' end,digits);
  gross:=priced.gross_amount;
  net_snapshot:=priced.net_amount; vat_snapshot:=priced.vat_amount;
  if item_id is not null and not coalesce((p_input->>'useCurrentTerms')::boolean,false)
    and not coalesce((p_input->>'useAgreementBasis')::boolean,false)
    and gross=existing.amount and item->>'currency'=existing.currency
    and rate is not distinct from existing.vat_rate and basis is not distinct from existing.price_basis then
    net_snapshot:=existing.net_amount; vat_snapshot:=existing.vat_amount;
  end if;
  if gross is null or gross<=0 or gross>9999999999.9999 or gross<>round(gross,digits) then raise exception 'finance_amount_invalid'; end if;
  if item_id is null and v_stream='design' then
    select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances
      where studio_id=p_studio_id and project_id=p_project_id and stream='design' and commitment<>'cancelled';
    if scheduled+(case when item->>'commitment'='cancelled' then 0 else gross end)>terms.gross_amount then raise exception 'finance_project_over_scheduled'; end if;
  end if;
  result:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),jsonb_set(item,'{amount}',to_jsonb(gross),true));
  update public.finance_expected_items set vat_rate=rate,price_basis=basis,net_amount=net_snapshot,vat_amount=vat_snapshot
    where studio_id=p_studio_id and id=result;
  if item_id is null then
    insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream,terms_id,source,visit_id,contractor_id,context_label,extra_visit)
    values(p_studio_id,result,p_project_id,v_stream,terms.id,source,visit.id,nullif(p_input->>'contractorId','')::uuid,
      coalesce(contractor_name,case when visit.id is not null then visit.title||' · '||(visit.starts_at at time zone 'Europe/Kyiv')::date::text end,''),coalesce((p_input->>'extraVisit')::boolean,false));
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;
