-- Commercial pricing components are immutable revision data, not production m².
-- Old agreements and stored proposal bytes are deliberately not backfilled.
create function private.finance_area_components_area(p_components jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
declare component jsonb; result numeric:=0;
begin
  if p_components is null or p_components='null'::jsonb then return null; end if;
  if jsonb_typeof(p_components) is distinct from 'array' then raise exception 'finance_input_invalid'; end if;
  if jsonb_array_length(p_components)=0 then raise exception 'finance_input_invalid'; end if;
  for component in select value from jsonb_array_elements(p_components) loop
    if jsonb_typeof(component) is distinct from 'object' then raise exception 'finance_input_invalid'; end if;
    if jsonb_typeof(component->'name') is distinct from 'string'
      or char_length(btrim(component->>'name')) not between 1 and 2000
      or jsonb_typeof(component->'actualArea') is distinct from 'string'
      or jsonb_typeof(component->'coefficient') is distinct from 'string'
      or (component->>'actualArea') !~ '^\d{1,10}(\.\d{1,4})?$'
      or (component->>'coefficient') !~ '^\d{1,10}(\.\d{1,4})?$'
      or component-array['name','actualArea','coefficient']<>'{}'::jsonb then raise exception 'finance_input_invalid'; end if;
    if (component->>'actualArea')::numeric<=0 or (component->>'coefficient')::numeric<=0 then raise exception 'finance_amount_invalid'; end if;
    result:=result+round((component->>'actualArea')::numeric*(component->>'coefficient')::numeric,4);
  end loop;
  if result<=0 or result>9999999999.9999 then raise exception 'finance_amount_invalid'; end if;
  return result;
end;
$$;
revoke all on function private.finance_area_components_area(jsonb) from public,anon,authenticated,service_role;

alter table public.finance_project_plan_revisions
  add column area_components jsonb,
  add constraint finance_project_plan_area_components_check check(
    area_components is null or (pricing_method='area' and area_calculation is null
      and area_snapshot=private.finance_area_components_area(area_components))
  );
create or replace function public.save_finance_project_plan(p_studio_id uuid, p_request_id uuid, p_project_id uuid, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  payload jsonb:=jsonb_build_object('operation','project_plan','project',p_project_id,'input',p_input);
  v_order uuid; result uuid; current_terms public.finance_project_terms; old public.finance_project_plan_items;
  row_input jsonb; item_input jsonb; prepared jsonb:='[]'; allocated_items jsonb:='[]'; known jsonb; supplied_known jsonb;
  discount_type text:=coalesce(p_input->>'discountType','none'); discount_value numeric:=coalesce(nullif(p_input->>'discountValue','')::numeric,0); discount_amount numeric;
  total numeric; gross_total numeric; protected numeric; scheduled numeric:=0; digits integer; area numeric; rate numeric;
  vat_rate numeric; basis text; revenue_tax_rate numeric; basis_total numeric:=0; cumulative numeric:=0; allocated numeric:=0; target numeric; portion numeric; net_part numeric; vat_part numeric; gross_part numeric;
  item_id uuid; category_id uuid; ordered uuid[]:='{}'; reason text:=btrim(p_input->>'reason');
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
  if result is not null then return result; end if;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id)
    or not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null)
    then raise exception 'finance_project_invalid'; end if;
  v_order:=private.resolve_finance_project_order(p_studio_id,p_project_id,nullif(p_input->>'orderId','')::uuid,true);
  select * into current_terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and order_id=v_order and stream='design';
  if coalesce(current_terms.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  if reason is null or char_length(reason) not between 1 and 2000
    or p_input->>'pricingMethod' is null or p_input->>'pricingMethod' not in ('fixed','area')
    or jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_typeof(p_input->'known') is distinct from 'array'
    then raise exception 'finance_input_invalid'; end if;
  total:=(p_input->>'amount')::numeric;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if total is null or digits is null or not(total>0 and total<=9999999999.9999) or total<>round(total,digits) then raise exception 'finance_amount_invalid'; end if;
  vat_rate:=nullif(p_input->>'vatRate','')::numeric; basis:=nullif(p_input->>'priceBasis','');
  if (vat_rate is null)<>(basis is null) or (vat_rate is not null and (vat_rate<0 or vat_rate<>round(vat_rate,4) or basis not in ('net','gross'))) then raise exception 'finance_project_vat_invalid'; end if;
  revenue_tax_rate:=nullif(p_input->>'revenueTaxRate','')::numeric;
  if revenue_tax_rate is not null and (revenue_tax_rate<0 or revenue_tax_rate<>round(revenue_tax_rate,4))
    then raise exception 'finance_project_revenue_tax_invalid'; end if;
  discount_amount:=private.finance_discount_amount(total,discount_type,discount_value,digits);
  select gross_amount into gross_total from private.finance_vat_parts(total-discount_amount,vat_rate,basis,digits);
  if gross_total>9999999999.9999 then raise exception 'finance_amount_invalid'; end if;
  if p_input->>'pricingMethod'='area' then
    area:=(p_input->>'area')::numeric; rate:=(p_input->>'rate')::numeric;
    if area is null or rate is null or not(area>0 and area<=9999999999.9999 and rate>0 and rate<=9999999999.9999)
      or area<>round(area,4) or rate<>round(rate,4) or total<>round(area*rate,digits) then raise exception 'finance_amount_invalid'; end if;
  end if;
  -- Full active-list concurrency check includes history, including fully released matches.
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'protected',has_settlement_history) order by id),'[]'),
    coalesce(sum(amount) filter(where has_settlement_history),0)
    into known,protected from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id and order_id=v_order;
  select coalesce(jsonb_agg(value order by value->>'id'),'[]') into supplied_known from jsonb_array_elements(p_input->'known');
  if known is distinct from supplied_known then raise exception 'finance_version_conflict'; end if;
     for row_input in select value from jsonb_array_elements(coalesce(p_input->'protectedNotes','[]'::jsonb)) loop
       if not exists(select 1 from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id and order_id=v_order and id=(row_input->>'id')::uuid and has_settlement_history) then raise exception 'finance_project_invalid'; end if;
       update public.finance_expected_items set client_note=nullif(btrim(row_input->>'clientNote'),''),version=version+1,updated_at=now()
         where studio_id=p_studio_id and id=(row_input->>'id')::uuid and client_note is distinct from nullif(btrim(row_input->>'clientNote'),'');
     end loop;
  if exists(select 1 from jsonb_array_elements(p_input->'items') x where nullif(x->>'id','') is not null group by x->>'id' having count(*)>1)
    then raise exception 'finance_input_invalid'; end if;
  select id into category_id from public.finance_categories where studio_id=p_studio_id and default_key='project_payments' and archived_at is null;
  for row_input in select value from jsonb_array_elements(p_input->'items') loop
    item_id:=nullif(row_input->>'id','')::uuid;
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id and order_id=v_order and id=item_id;
    if item_id is not null and old.id is null then raise exception 'finance_project_invalid'; end if;
    if old.has_settlement_history then raise exception 'finance_project_settled_terms_locked'; end if;
    if row_input->>'name' is null or char_length(btrim(row_input->>'name')) not between 1 and 2000
      or (row_input->>'amount')::numeric is null or not((row_input->>'amount')::numeric>0 and (row_input->>'amount')::numeric<=9999999999.9999)
      or (row_input->>'amount')::numeric<>round((row_input->>'amount')::numeric,digits) then raise exception 'finance_amount_invalid'; end if;
    basis_total:=basis_total+(row_input->>'amount')::numeric;
    item_input:=jsonb_build_object('id',item_id,'version',old.version,'direction','incoming','amount',row_input->>'amount','currency',p_input->>'currency',
      'categoryId',coalesce(old.category_id,category_id),'description',btrim(row_input->>'name'),'dueDate',nullif(row_input->>'dueDate','')::date,
      'expectedDate',nullif(row_input->>'expectedDate','')::date,'commitment',coalesce(old.commitment,'agreed'),'certainty',coalesce(old.certainty,'fixed'),
      'established',coalesce(old.is_established,nullif(row_input->>'dueDate','')::date<=(now() at time zone 'Europe/Kyiv')::date,false));
    prepared:=prepared||jsonb_build_array(item_input);
  end loop;
  if basis_total>0 then
    if vat_rate is null then target:=0;
    elsif basis='net' then
      target:=round(basis_total*vat_rate/100,digits);
      -- A complete schedule gets the remaining client cash cents after old,
      -- protected payments, even when their VAT rate differs.
      if basis_total=round((gross_total-protected)/(1+vat_rate/100),digits)
        then target:=gross_total-protected-basis_total; end if;
    else target:=round(basis_total/(1+vat_rate/100),digits);
    end if;
    if target<0 then raise exception 'finance_project_over_scheduled'; end if;
    for item_input in select value from jsonb_array_elements(prepared) loop
      cumulative:=cumulative+(item_input->>'amount')::numeric;
      portion:=round(cumulative*target/basis_total,digits)-allocated;
      allocated:=allocated+portion;
      if vat_rate is null then net_part:=(item_input->>'amount')::numeric; vat_part:=0; gross_part:=net_part;
      elsif basis='net' then net_part:=(item_input->>'amount')::numeric; vat_part:=portion; gross_part:=net_part+vat_part;
      else gross_part:=(item_input->>'amount')::numeric; net_part:=portion; vat_part:=gross_part-net_part;
      end if;
      scheduled:=scheduled+gross_part;
      allocated_items:=allocated_items||jsonb_build_array(item_input||jsonb_build_object('gross',gross_part,'net',net_part,'vat',vat_part));
    end loop;
    prepared:=allocated_items;
  end if;
  if protected+scheduled>gross_total then raise exception 'finance_project_over_scheduled'; end if;
  if protected+scheduled<gross_total and not coalesce((p_input->>'allowUnscheduled')::boolean,false) then raise exception 'finance_project_plan_remainder'; end if;
  -- Close removed unpaid items via the existing reasoned cancellation boundary.
  for old in select * from public.finance_project_plan_items b where studio_id=p_studio_id and project_id=p_project_id and order_id=v_order and not has_settlement_history
    and not exists(select 1 from jsonb_array_elements(prepared) i where nullif(i->>'id','')::uuid=b.id)
  loop
    perform public.cancel_finance_project_expectation(p_studio_id,gen_random_uuid(),jsonb_build_object('orderId',v_order,'itemId',old.id,'version',old.version,'settledAmount','0','reason',reason));
  end loop;
  -- Reductions first keep the existing per-item contract ceiling valid throughout.
  for item_input in select value from jsonb_array_elements(prepared) loop
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and id=nullif(item_input->>'id','')::uuid;
    if old.id is not null and (item_input->>'gross')::numeric<old.amount then
      perform public.save_finance_project_item(p_studio_id,gen_random_uuid(),p_project_id,jsonb_build_object('orderId',v_order,'stream','design','item',jsonb_set(item_input,'{amount}',item_input->'gross',true)));
    end if;
  end loop;
  result:=public.save_finance_project_terms(p_studio_id,gen_random_uuid(),p_project_id,jsonb_build_object('orderId',v_order,'stream','design','mode','design','revision',coalesce(current_terms.revision,0),'amount',total,'currency',p_input->>'currency','vatRate',vat_rate,'priceBasis',basis,'revenueTaxRate',revenue_tax_rate,'discountType',discount_type,'discountValue',discount_value,'reason',reason));
  for item_input in select value from jsonb_array_elements(prepared) loop
    item_id:=nullif(item_input->>'id','')::uuid;
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and id=item_id;
    -- Reduced rows get this revision's VAT snapshot after the agreement changes.
    if old.id is not null then item_input:=jsonb_set(item_input,'{version}',to_jsonb(old.version),true); end if;
    item_id:=public.save_finance_project_item(p_studio_id,gen_random_uuid(),p_project_id,
      jsonb_build_object('orderId',v_order,'stream','design','source','manual','useCurrentTerms',true,
        'item',jsonb_set(item_input,'{amount}',item_input->'gross',true)));
    update public.finance_expected_items set net_amount=(item_input->>'net')::numeric,vat_amount=(item_input->>'vat')::numeric
      where studio_id=p_studio_id and id=item_id;
    update public.finance_expected_items set
       client_note=nullif(btrim(p_input->'items'->cardinality(ordered)->>'clientNote'),''),
       schedule_percentage=case when protected=0 and scheduled=gross_total then nullif(p_input->'items'->cardinality(ordered)->>'percentage','')::numeric else nullif(round(amount/gross_total*100,4),0) end
     where studio_id=p_studio_id and id=item_id;
     ordered:=array_append(ordered,item_id);
  end loop;
  insert into public.finance_project_plan_revisions(terms_id,studio_id,project_id,pricing_method,area_snapshot,rate_per_m2,item_order,area_calculation,area_components)
    values(result,p_studio_id,p_project_id,p_input->>'pricingMethod',area,rate,ordered,nullif(p_input->'areaCalculation','null'::jsonb),nullif(p_input->'areaComponents','null'::jsonb));
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$function$;

create or replace function private.finance_project_order_draft_values(p_input jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  digits integer; total numeric; discount numeric; net_value numeric; vat_value numeric; gross_value numeric;
  vat_rate numeric; basis text; revenue_tax numeric; area numeric; rate numeric;
  row_input jsonb; rows jsonb:='[]'; row_amount numeric; basis_total numeric:=0; cumulative numeric:=0;
  target numeric:=0; allocated numeric:=0; portion numeric; row_net numeric; row_vat numeric; row_gross numeric; scheduled numeric:=0;
  keys uuid[]:='{}'; draft_key uuid; pct numeric; due date; expected date;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'pricingMethod' is null
    or p_input->>'pricingMethod' not in ('fixed','area')
    or jsonb_typeof(p_input->'items') is distinct from 'array'
    or jsonb_typeof(p_input->'known') is distinct from 'array' or p_input->'known'<>'[]'::jsonb
    or p_input->>'reason' is null or char_length(btrim(p_input->>'reason')) not between 1 and 2000
    then raise exception 'finance_input_invalid'; end if;
  total:=nullif(p_input->>'amount','')::numeric;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if total is null or digits is null or not(total>0 and total<=9999999999.9999) or total<>round(total,digits)
    then raise exception 'finance_amount_invalid'; end if;
  vat_rate:=nullif(p_input->>'vatRate','')::numeric; basis:=nullif(p_input->>'priceBasis','');
  if (vat_rate is null)<>(basis is null) or (vat_rate is not null and (vat_rate<0 or vat_rate<>round(vat_rate,4) or basis not in ('net','gross')))
    then raise exception 'finance_project_vat_invalid'; end if;
  revenue_tax:=nullif(p_input->>'revenueTaxRate','')::numeric;
  if revenue_tax is not null and (revenue_tax<0 or revenue_tax<>round(revenue_tax,4)) then raise exception 'finance_project_revenue_tax_invalid'; end if;
  discount:=private.finance_discount_amount(total,coalesce(p_input->>'discountType','none'),coalesce(nullif(p_input->>'discountValue','')::numeric,0),digits);
  select net_amount,vat_amount,gross_amount into net_value,vat_value,gross_value from private.finance_vat_parts(total-discount,vat_rate,basis,digits);
  if gross_value>9999999999.9999 then raise exception 'finance_amount_invalid'; end if;
  if p_input->>'pricingMethod'='area' then
    area:=nullif(p_input->>'area','')::numeric; rate:=nullif(p_input->>'rate','')::numeric;
    if area is null or rate is null or not(area>0 and area<=9999999999.9999 and rate>0 and rate<=9999999999.9999)
      or area<>round(area,4) or rate<>round(rate,4) or total<>round(area*rate,digits) then raise exception 'finance_amount_invalid'; end if;
  end if;
  if not private.valid_finance_area_calculation(p_input->>'pricingMethod',area,p_input->'areaCalculation') then
    raise exception 'finance_input_invalid';
  end if;
  if nullif(p_input->'areaComponents','null'::jsonb) is not null and (
    p_input->>'pricingMethod' is distinct from 'area' or nullif(p_input->'areaCalculation','null'::jsonb) is not null
    or area is distinct from private.finance_area_components_area(p_input->'areaComponents')
  ) then raise exception 'finance_input_invalid'; end if;
  for row_input in select value from jsonb_array_elements(p_input->'items') loop
    draft_key:=nullif(row_input->>'draftKey','')::uuid;
    row_amount:=nullif(row_input->>'amount','')::numeric; pct:=nullif(row_input->>'percentage','')::numeric;
    due:=nullif(row_input->>'dueDate','')::date; expected:=nullif(row_input->>'expectedDate','')::date;
    if jsonb_typeof(row_input) is distinct from 'object' or draft_key is null or draft_key=any(keys)
      or nullif(row_input->>'id','') is not null or row_input->>'name' is null
      or char_length(btrim(row_input->>'name')) not between 1 and 2000
      or char_length(coalesce(row_input->>'clientNote',''))>300
      or (pct is not null and (pct<=0 or pct>100 or pct<>round(pct,4)))
      or (due is not null and due not between date '1900-01-01' and date '9999-12-31')
      or (expected is not null and expected not between date '1900-01-01' and date '9999-12-31')
      then raise exception 'finance_input_invalid'; end if;
    if row_amount is null or not(row_amount>0 and row_amount<=9999999999.9999) or row_amount<>round(row_amount,digits)
      then raise exception 'finance_amount_invalid'; end if;
    keys:=array_append(keys,draft_key); basis_total:=basis_total+row_amount;
  end loop;
  if basis_total>0 then
    if vat_rate is null then target:=0;
    elsif basis='net' then
      target:=round(basis_total*vat_rate/100,digits);
      if basis_total=round(gross_value/(1+vat_rate/100),digits) then target:=gross_value-basis_total; end if;
    else target:=round(basis_total/(1+vat_rate/100),digits); end if;
    if target<0 then raise exception 'finance_project_over_scheduled'; end if;
    for row_input in select value from jsonb_array_elements(p_input->'items') loop
      row_amount:=(row_input->>'amount')::numeric; cumulative:=cumulative+row_amount;
      portion:=round(cumulative*target/basis_total,digits)-allocated; allocated:=allocated+portion;
      if vat_rate is null then row_net:=row_amount; row_vat:=0; row_gross:=row_net;
      elsif basis='net' then row_net:=row_amount; row_vat:=portion; row_gross:=row_net+row_vat;
      else row_gross:=row_amount; row_net:=portion; row_vat:=row_gross-row_net; end if;
      scheduled:=scheduled+row_gross;
      rows:=rows||jsonb_build_array(row_input||jsonb_build_object('netAmount',row_net,'vatAmount',row_vat,'grossAmount',row_gross));
    end loop;
  end if;
  if scheduled>gross_value then raise exception 'finance_project_over_scheduled'; end if;
  if scheduled<gross_value and not coalesce((p_input->>'allowUnscheduled')::boolean,false) then raise exception 'finance_project_plan_remainder'; end if;
  return p_input||jsonb_build_object('discountAmount',discount,'netAmount',net_value,'vatAmount',vat_value,'grossAmount',gross_value,'preparedItems',rows);
end $$;

create or replace function private.finance_proposal_source(p_studio_id uuid,p_project_id uuid,p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare project public.projects; commercial_order public.finance_project_orders;
  terms public.finance_project_terms; pricing public.finance_project_plan_revisions;
  lead public.crm_leads; number text; next_revision integer; rows jsonb; digits integer;
  draft jsonb; draft_values jsonb; source_revision integer;
begin
  select * into project from public.projects where studio_id=p_studio_id and id=p_project_id;
  select * into commercial_order from public.finance_project_orders
    where studio_id=p_studio_id and project_id=p_project_id and
      ((p_order_id is not null and id=p_order_id) or (p_order_id is null and is_default and status<>'discarded'));
  if project.id is null or commercial_order.id is null or commercial_order.status='discarded' then
    raise exception 'finance_project_agreement_required';
  end if;
  if commercial_order.status='draft' then
    if commercial_order.draft_plan is null then raise exception 'finance_project_agreement_required'; end if;
    draft:=commercial_order.draft_plan;
    draft_values:=private.finance_project_order_draft_values(draft);
    terms.currency:=draft->>'currency';
    select minor_units into digits from public.finance_currencies where code=terms.currency;
    terms.amount:=(draft->>'amount')::numeric;
    terms.vat_rate:=nullif(draft->>'vatRate','')::numeric;
    terms.price_basis:=nullif(draft->>'priceBasis','');
    terms.discount_type:=coalesce(draft->>'discountType','none');
    terms.discount_value:=coalesce(nullif(draft->>'discountValue',''),'0')::numeric;
    terms.discount_amount:=(draft_values->>'discountAmount')::numeric;
    terms.net_amount:=(draft_values->>'netAmount')::numeric;
    terms.vat_amount:=(draft_values->>'vatAmount')::numeric;
    terms.gross_amount:=(draft_values->>'grossAmount')::numeric;
    pricing.pricing_method:=draft->>'pricingMethod';
    pricing.area_snapshot:=case when pricing.pricing_method='area' then (draft->>'area')::numeric end;
    pricing.rate_per_m2:=case when pricing.pricing_method='area' then (draft->>'rate')::numeric end;
    pricing.area_calculation:=nullif(draft->'areaCalculation','null'::jsonb);
    pricing.area_components:=nullif(draft->'areaComponents','null'::jsonb);
    source_revision:=commercial_order.version;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.value->>'draftKey','name',r.value->>'name','gross',r.value->>'grossAmount',
      'percentage',coalesce(nullif(r.value->>'percentage',''),round((r.value->>'grossAmount')::numeric/terms.gross_amount*100,4)::text),
      'note',coalesce(r.value->>'clientNote','')) order by r.ordinality),'[]'::jsonb)
      into rows from jsonb_array_elements(draft_values->'preparedItems') with ordinality r(value,ordinality);
  else
    select * into terms from public.finance_project_current_terms
      where studio_id=p_studio_id and project_id=p_project_id and stream='design' and order_id=commercial_order.id;
    if terms.id is null then raise exception 'finance_project_agreement_required'; end if;
    select * into pricing from public.finance_project_plan_revisions where terms_id=terms.id;
    select minor_units into digits from public.finance_currencies where code=terms.currency;
    source_revision:=terms.revision;
    select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.description,'gross',i.amount::text,
      'percentage',coalesce(e.schedule_percentage,round(i.amount/terms.gross_amount*100,4))::text,
      'note',coalesce(e.client_note,'')) order by coalesce(array_position(pricing.item_order,i.id),2147483647),i.due_date nulls last,i.id),'[]'::jsonb)
      into rows from public.finance_project_plan_items i
      join public.finance_expected_items e on e.studio_id=i.studio_id and e.id=i.id
      join public.finance_project_items link on link.studio_id=i.studio_id and link.expected_item_id=i.id
      where i.studio_id=p_studio_id and i.project_id=p_project_id and link.order_id=commercial_order.id;
  end if;
  select * into lead from public.crm_leads where studio_id=p_studio_id and project_id=p_project_id;
  select snapshot->>'projectNumber' into number from public.finance_project_proposals
    where studio_id=p_studio_id and project_id=p_project_id order by created_at,revision,id limit 1;
  number:=coalesce(number,substring(btrim(project.name) from '^([0-9]+)(?:[[:space:]_–—-]|$)'));
  if number is null then raise exception 'finance_proposal_number_required'; end if;
  select coalesce(max(revision),0)+1 into next_revision from public.finance_project_proposals
    where studio_id=p_studio_id and order_id=commercial_order.id;
  return jsonb_build_object('schemaVersion',2,'projectId',project.id,'projectNumber',number,'revision',next_revision,
    'order',jsonb_build_object('id',commercial_order.id,'name',commercial_order.name,'status',commercial_order.status),
    'sourceRevision',source_revision,
    'date',((now() at time zone 'Europe/Kyiv')::date)::text,'projectTitle',project.name,
    'clientName',coalesce(project.client_name,lead.client_name,''),'contact',coalesce(lead.phone,''),
    'address',concat_ws(', ',nullif(project.city,''),nullif(project.site_address,'')),
    'area',coalesce(pricing.area_snapshot,project.total_area_m2)::text,
    'areaCalculation',pricing.area_calculation,
    'areaComponents',pricing.area_components,
    'componentRatePerM2',case when pricing.area_components is not null then pricing.rate_per_m2::text else null end,
    'clientRatePerM2',case when pricing.pricing_method='area' then
      (select gross_amount::text from private.finance_vat_parts(pricing.rate_per_m2,terms.vat_rate,terms.price_basis,4)) else null end,
    'currency',terms.currency,'minorUnits',digits,'gross',terms.gross_amount::text,
    'pricing',jsonb_build_object('listAmount',terms.amount::text,'priceBasis',terms.price_basis,
      'discountType',terms.discount_type,'discountValue',terms.discount_value::text,'discountAmount',terms.discount_amount::text,
      'agreedAmount',(terms.amount-terms.discount_amount)::text,'net',terms.net_amount::text,
      'listGross',(select gross_amount::text from private.finance_vat_parts(terms.amount,terms.vat_rate,terms.price_basis,digits)),
      'discountGross',(select (gross_amount-terms.gross_amount)::text from private.finance_vat_parts(terms.amount,terms.vat_rate,terms.price_basis,digits))),
    'studioContactDetails',(select jsonb_build_object('website',coalesce(website,''),'email',coalesce(email,''),
      'phone',coalesce(phone,''),'businessAddress',coalesce(business_address,''),'contactPerson',coalesce(contact_person,''))
      from public.studios where id=p_studio_id),
    'vatRate',terms.vat_rate::text,'vatAmount',terms.vat_amount::text,'rows',rows,'intro','');
end;
$$;

create or replace function public.correct_finance_project_order_currency(
  p_studio_id uuid, p_request_id uuid, p_project_id uuid, p_input jsonb
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  payload jsonb:=jsonb_build_object('operation','project_order_currency_correction','project',p_project_id,'input',p_input);
  result uuid; commercial public.finance_project_orders; agreement public.finance_project_terms;
  plan public.finance_project_plan_revisions; known jsonb; supplied jsonb;
  target_currency text:=p_input->>'currency'; reason text:=btrim(p_input->>'reason');
  digits integer; discount numeric; priced record;
begin
  -- Same verified admin boundary and parent-first lock as settlements and recognition.
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
  if result is not null then return result; end if;
  if p_input->'confirmed' is distinct from 'true'::jsonb
    or reason is null or char_length(reason) not between 1 and 2000
    or jsonb_typeof(p_input->'known') is distinct from 'array'
    or not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null)
    then raise exception 'finance_input_invalid'; end if;
  select * into commercial from public.finance_project_orders
    where studio_id=p_studio_id and project_id=p_project_id and id=(p_input->>'orderId')::uuid for update;
  if commercial.id is null or commercial.status<>'confirmed' then raise exception 'finance_project_order_invalid'; end if;
  select * into agreement from public.finance_project_current_terms
    where studio_id=p_studio_id and project_id=p_project_id and order_id=commercial.id and stream='design';
  if commercial.version is distinct from (p_input->>'version')::integer
    or agreement.id is null or agreement.id is distinct from (p_input->>'termsId')::uuid
    then raise exception 'finance_version_conflict'; end if;
  select minor_units into digits from public.finance_currencies where code=target_currency;
  if digits is null or target_currency=agreement.currency or agreement.amount is null
    then raise exception 'finance_input_invalid'; end if;

  -- Existence matters: released payments, reversed closures and reversed recognition
  -- still have immutable history denominated in the original currency.
  if exists(select 1 from public.finance_allocations a join public.finance_project_items i
    on i.studio_id=a.studio_id and i.expected_item_id=a.expected_item_id
    where i.studio_id=p_studio_id and i.order_id=commercial.id)
    then raise exception 'finance_order_currency_allocation_history'; end if;
  if exists(select 1 from public.finance_project_payment_context c
    where c.studio_id=p_studio_id and c.order_id=commercial.id)
    then raise exception 'finance_order_currency_allocation_history'; end if;
  if exists(select 1 from public.finance_settlement_adjustments a join public.finance_project_items i
    on i.studio_id=a.studio_id and i.expected_item_id=a.expected_item_id
    where i.studio_id=p_studio_id and i.order_id=commercial.id)
    then raise exception 'finance_order_currency_closure_history'; end if;
  if exists(select 1 from public.finance_recognition_entries r
    where r.studio_id=p_studio_id and private.finance_recognition_order(r.studio_id,r.id)=commercial.id)
    then raise exception 'finance_order_currency_recognition_history'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version) order by id),'[]'::jsonb)
    into known from public.finance_project_plan_items
    where studio_id=p_studio_id and project_id=p_project_id and order_id=commercial.id;
  select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) into supplied
    from jsonb_array_elements(p_input->'known');
  if known is distinct from supplied then raise exception 'finance_version_conflict'; end if;

  -- Reject a denomination that would require changing nominal amounts, VAT cents,
  -- a fixed discount, or the saved area/rate calculation to fit its minor units.
  if agreement.amount<>round(agreement.amount,digits)
    or (agreement.discount_type='fixed' and agreement.discount_value<>round(agreement.discount_value,digits))
    then raise exception 'finance_order_currency_precision'; end if;
  discount:=private.finance_discount_amount(agreement.amount,agreement.discount_type,agreement.discount_value,digits);
  select * into priced from private.finance_vat_parts(agreement.amount-discount,agreement.vat_rate,agreement.price_basis,digits);
  if discount is distinct from agreement.discount_amount
    or row(priced.net_amount,priced.vat_amount,priced.gross_amount)
      is distinct from row(agreement.net_amount,agreement.vat_amount,agreement.gross_amount)
    then raise exception 'finance_order_currency_precision'; end if;
  select * into plan from public.finance_project_plan_revisions where studio_id=p_studio_id and terms_id=agreement.id;
  if plan.pricing_method='area' and agreement.amount<>round(plan.area_snapshot*plan.rate_per_m2,digits)
    then raise exception 'finance_order_currency_precision'; end if;
  if exists(select 1 from public.finance_project_plan_items i
    where i.studio_id=p_studio_id and i.order_id=commercial.id and
      (i.currency<>agreement.currency or i.amount<>round(i.amount,digits)
        or i.net_amount<>round(i.net_amount,digits) or i.vat_amount<>round(i.vat_amount,digits)))
    then raise exception 'finance_order_currency_precision'; end if;

  -- Append the commercial amendment first so the unchanged expected-item guard
  -- can validate each in-place currency update against the new current terms.
  insert into public.finance_project_terms(studio_id,project_id,order_id,stream,revision,mode,amount,currency,
    effective_from,effective_through,reason,created_by,vat_rate,price_basis,net_amount,vat_amount,gross_amount,
    revenue_tax_rate,discount_type,discount_value,discount_amount)
  values(p_studio_id,p_project_id,commercial.id,agreement.stream,agreement.revision+1,agreement.mode,
    agreement.amount,target_currency,agreement.effective_from,agreement.effective_through,reason,auth.uid(),
    agreement.vat_rate,agreement.price_basis,agreement.net_amount,agreement.vat_amount,agreement.gross_amount,
    agreement.revenue_tax_rate,agreement.discount_type,agreement.discount_value,agreement.discount_amount)
  returning id into result;
  if plan.terms_id is not null then
    insert into public.finance_project_plan_revisions(terms_id,studio_id,project_id,pricing_method,area_snapshot,rate_per_m2,item_order,area_calculation,area_components)
      values(result,p_studio_id,p_project_id,plan.pricing_method,plan.area_snapshot,plan.rate_per_m2,plan.item_order,plan.area_calculation,plan.area_components);
  end if;
  update public.finance_expected_items e set currency=target_currency,version=e.version+1,updated_at=now()
    where e.studio_id=p_studio_id and e.commitment<>'cancelled' and exists(
      select 1 from public.finance_project_items i where i.studio_id=e.studio_id and i.expected_item_id=e.id
        and i.order_id=commercial.id and i.project_id=p_project_id and i.stream='design');
  update public.finance_project_orders set version=version+1,updated_by=auth.uid(),updated_at=now()
    where studio_id=p_studio_id and id=commercial.id;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

notify pgrst, 'reload schema';
