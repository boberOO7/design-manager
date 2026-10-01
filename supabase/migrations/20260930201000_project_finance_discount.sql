-- Discount belongs to immutable design terms; amount remains the entered list basis.
alter table public.finance_project_terms
  add column discount_type text not null default 'none',
  add column discount_value numeric not null default 0,
  add column discount_amount numeric not null default 0,
  add constraint finance_project_terms_discount_check check (
    discount_type in ('none','percentage','fixed') and discount_value>=0 and discount_amount>=0
    and (stream='design' or (discount_type='none' and discount_value=0 and discount_amount=0))
    and ((discount_type='none' and discount_value=0 and discount_amount=0)
      or (amount is not null and discount_amount<amount and (
        (discount_type='percentage' and discount_value<100 and discount_value=round(discount_value,4))
        or (discount_type='fixed' and discount_value=discount_amount))))) ;
alter table public.finance_project_terms drop constraint finance_project_terms_vat_check;
alter table public.finance_project_terms add constraint finance_project_terms_vat_check check (
  (vat_rate is null and price_basis is null or vat_rate>=0 and vat_rate=round(vat_rate,4) and price_basis in ('net','gross'))
  and ((amount is null and net_amount is null and vat_amount is null and gross_amount is null)
    or (amount is not null and net_amount is not null and vat_amount is not null and gross_amount is not null
      and net_amount>=0 and vat_amount>=0 and gross_amount=net_amount+vat_amount
      and amount-discount_amount=case when price_basis='gross' then gross_amount else net_amount end)));

create or replace view public.finance_project_current_terms with(security_invoker=true) as
select distinct on(studio_id,project_id,stream) id,studio_id,project_id,stream,revision,mode,amount,currency,
  effective_from,effective_through,reason,created_by,created_at,vat_rate,price_basis,net_amount,vat_amount,gross_amount,revenue_tax_rate,
  discount_type,discount_value,discount_amount
from public.finance_project_terms order by studio_id,project_id,stream,revision desc;

create function private.finance_discount_amount(p_list numeric,p_type text,p_value numeric,p_digits integer) returns numeric
language plpgsql immutable set search_path='' as $$
declare discount numeric;
begin
  if p_type is null or p_type not in ('none','percentage','fixed') or p_value is null
    or not(p_value>=0 and p_value<=9999999999.9999)
    or (p_type='none' and p_value<>0)
    or (p_type='percentage' and (p_value>=100 or p_value<>round(p_value,4)))
    or (p_type='fixed' and p_value<>round(p_value,p_digits)) then raise exception 'finance_project_discount_invalid'; end if;
  discount:=case p_type when 'none' then 0 when 'fixed' then p_value else round(p_list*p_value/100,p_digits) end;
  if p_type<>'none' and (p_list is null or not(discount<p_list)) then raise exception 'finance_project_discount_invalid'; end if;
  return discount;
end;
$$;
revoke all on function private.finance_discount_amount(numeric,text,numeric,integer) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_finance_project_terms(p_studio_id uuid, p_request_id uuid, p_project_id uuid, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb:=jsonb_build_object('operation','project_terms','project',p_project_id,'input',p_input);
  result uuid; old public.finance_project_terms; value numeric; digits integer; scheduled numeric; start_date date;
  vat_rate numeric; basis text; net_value numeric; vat_value numeric; gross_value numeric; revenue_tax_rate numeric; discount_type text:=coalesce(p_input->>'discountType','none'); discount_value numeric:=coalesce(nullif(p_input->>'discountValue','')::numeric,0); discount_amount numeric;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.projects where id=p_project_id and studio_id=p_studio_id)
    or not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null) then raise exception 'finance_project_invalid'; end if;
  select * into old from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=p_input->>'stream';
  if coalesce(old.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  value:=nullif(p_input->>'amount','')::numeric; start_date:=nullif(p_input->>'effectiveFrom','')::date;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if digits is null or (value is not null and (value<=0 or value>9999999999.9999 or value<>round(value,digits))) then raise exception 'finance_amount_invalid'; end if;
  vat_rate:=nullif(p_input->>'vatRate','')::numeric; basis:=nullif(p_input->>'priceBasis','');
  if (vat_rate is null)<>(basis is null) or (vat_rate is not null and (vat_rate<0 or vat_rate<>round(vat_rate,4) or basis not in ('net','gross'))) then raise exception 'finance_project_vat_invalid'; end if;
  revenue_tax_rate:=nullif(p_input->>'revenueTaxRate','')::numeric;
  if revenue_tax_rate is not null and (p_input->>'stream' is distinct from 'design'
    or revenue_tax_rate<0 or revenue_tax_rate<>round(revenue_tax_rate,4)) then raise exception 'finance_project_revenue_tax_invalid'; end if;
  if p_input->>'stream'<>'design' and discount_type<>'none' then raise exception 'finance_project_discount_invalid'; end if;
  discount_amount:=private.finance_discount_amount(value,discount_type,discount_value,digits);
  if value is not null then
    select net_amount,vat_amount,gross_amount into net_value,vat_value,gross_value from private.finance_vat_parts(value-discount_amount,vat_rate,basis,digits);
    if gross_value>9999999999.9999 then raise exception 'finance_amount_invalid'; end if;
  end if;
  if p_input->>'stream'='design' then
    if exists(select 1 from public.finance_project_items where studio_id=p_studio_id and project_id=p_project_id and stream='design') and old.currency is distinct from p_input->>'currency' then raise exception 'finance_project_currency_locked'; end if;
    select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances where studio_id=p_studio_id and project_id=p_project_id and stream='design' and commitment<>'cancelled';
    if gross_value<scheduled then raise exception 'finance_project_over_scheduled'; end if;
  else
    if old.id is not null and start_date<=old.effective_from then raise exception 'finance_supervision_effective_date'; end if;
    if exists(select 1 from public.finance_project_items where studio_id=p_studio_id and project_id=p_project_id and source='monthly'
      and (period_start+interval '1 month')::date>start_date) then raise exception 'finance_supervision_generated_period'; end if;
  end if;
  insert into public.finance_project_terms(studio_id,project_id,stream,revision,mode,amount,currency,effective_from,effective_through,reason,created_by,vat_rate,price_basis,net_amount,vat_amount,gross_amount,revenue_tax_rate,discount_type,discount_value,discount_amount)
  values(p_studio_id,p_project_id,p_input->>'stream',coalesce(old.revision,0)+1,p_input->>'mode',value,p_input->>'currency',start_date,
    nullif(p_input->>'effectiveThrough','')::date,btrim(p_input->>'reason'),auth.uid(),vat_rate,basis,net_value,vat_value,gross_value,revenue_tax_rate,discount_type,discount_value,discount_amount) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_finance_project_plan(p_studio_id uuid, p_request_id uuid, p_project_id uuid, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  payload jsonb:=jsonb_build_object('operation','project_plan','project',p_project_id,'input',p_input);
  result uuid; current_terms public.finance_project_terms; old public.finance_project_plan_items;
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
  select * into current_terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream='design';
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
    into known,protected from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id;
  select coalesce(jsonb_agg(value order by value->>'id'),'[]') into supplied_known from jsonb_array_elements(p_input->'known');
  if known is distinct from supplied_known then raise exception 'finance_version_conflict'; end if;
     for row_input in select value from jsonb_array_elements(coalesce(p_input->'protectedNotes','[]'::jsonb)) loop
       if not exists(select 1 from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id and id=(row_input->>'id')::uuid and has_settlement_history) then raise exception 'finance_project_invalid'; end if;
       update public.finance_expected_items set client_note=nullif(btrim(row_input->>'clientNote'),''),version=version+1,updated_at=now()
         where studio_id=p_studio_id and id=(row_input->>'id')::uuid and client_note is distinct from nullif(btrim(row_input->>'clientNote'),'');
     end loop;
  if exists(select 1 from jsonb_array_elements(p_input->'items') x where nullif(x->>'id','') is not null group by x->>'id' having count(*)>1)
    then raise exception 'finance_input_invalid'; end if;
  select id into category_id from public.finance_categories where studio_id=p_studio_id and default_key='project_payments' and archived_at is null;
  for row_input in select value from jsonb_array_elements(p_input->'items') loop
    item_id:=nullif(row_input->>'id','')::uuid;
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id and id=item_id;
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
  for old in select * from public.finance_project_plan_items b where studio_id=p_studio_id and project_id=p_project_id and not has_settlement_history
    and not exists(select 1 from jsonb_array_elements(prepared) i where nullif(i->>'id','')::uuid=b.id)
  loop
    perform public.cancel_finance_project_expectation(p_studio_id,gen_random_uuid(),jsonb_build_object('itemId',old.id,'version',old.version,'settledAmount','0','reason',reason));
  end loop;
  -- Reductions first keep the existing per-item contract ceiling valid throughout.
  for item_input in select value from jsonb_array_elements(prepared) loop
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and id=nullif(item_input->>'id','')::uuid;
    if old.id is not null and (item_input->>'gross')::numeric<old.amount then
      perform public.save_finance_project_item(p_studio_id,gen_random_uuid(),p_project_id,jsonb_build_object('stream','design','item',jsonb_set(item_input,'{amount}',item_input->'gross',true)));
    end if;
  end loop;
  result:=public.save_finance_project_terms(p_studio_id,gen_random_uuid(),p_project_id,jsonb_build_object('stream','design','mode','design','revision',coalesce(current_terms.revision,0),'amount',total,'currency',p_input->>'currency','vatRate',vat_rate,'priceBasis',basis,'revenueTaxRate',revenue_tax_rate,'discountType',discount_type,'discountValue',discount_value,'reason',reason));
  for item_input in select value from jsonb_array_elements(prepared) loop
    item_id:=nullif(item_input->>'id','')::uuid;
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and id=item_id;
    -- Reduced rows get this revision's VAT snapshot after the agreement changes.
    if old.id is not null then item_input:=jsonb_set(item_input,'{version}',to_jsonb(old.version),true); end if;
    item_id:=public.save_finance_project_item(p_studio_id,gen_random_uuid(),p_project_id,
      jsonb_build_object('stream','design','source','manual','useCurrentTerms',true,
        'item',jsonb_set(item_input,'{amount}',item_input->'gross',true)));
    update public.finance_expected_items set net_amount=(item_input->>'net')::numeric,vat_amount=(item_input->>'vat')::numeric
      where studio_id=p_studio_id and id=item_id;
    update public.finance_expected_items set
       client_note=nullif(btrim(p_input->'items'->cardinality(ordered)->>'clientNote'),''),
       schedule_percentage=case when protected=0 and scheduled=gross_total then nullif(p_input->'items'->cardinality(ordered)->>'percentage','')::numeric else nullif(round(amount/gross_total*100,4),0) end
     where studio_id=p_studio_id and id=item_id;
     ordered:=array_append(ordered,item_id);
  end loop;
  insert into public.finance_project_plan_revisions(terms_id,studio_id,project_id,pricing_method,area_snapshot,rate_per_m2,item_order)
    values(result,p_studio_id,p_project_id,p_input->>'pricingMethod',area,rate,ordered);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.finance_proposal_source(p_studio_id uuid, p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects; terms public.finance_project_terms; pricing public.finance_project_plan_revisions;
  lead public.crm_leads; number text; next_revision integer; rows jsonb; digits integer;
begin
  select * into project from public.projects where studio_id=p_studio_id and id=p_project_id;
  select * into terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream='design';
  if project.id is null or terms.id is null then raise exception 'finance_project_agreement_required'; end if;
  select * into pricing from public.finance_project_plan_revisions where terms_id=terms.id;
  select * into lead from public.crm_leads where studio_id=p_studio_id and project_id=p_project_id;
  select snapshot->>'projectNumber' into number from public.finance_project_proposals
    where studio_id=p_studio_id and project_id=p_project_id order by revision limit 1;
  number:=coalesce(number,substring(btrim(project.name) from '^([0-9]+)(?:[[:space:]_–—-]|$)'));
  if number is null then raise exception 'finance_proposal_number_required'; end if;
  select coalesce(max(revision),0)+1 into next_revision from public.finance_project_proposals where studio_id=p_studio_id and project_id=p_project_id;
  select minor_units into digits from public.finance_currencies where code=terms.currency;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.description,'gross',i.amount::text,
    'percentage',coalesce(e.schedule_percentage,round(i.amount/terms.gross_amount*100,4))::text,
    'note',coalesce(e.client_note,'')) order by coalesce(array_position(pricing.item_order,i.id),2147483647),i.due_date nulls last,i.id),'[]')
    into rows from public.finance_project_plan_items i join public.finance_expected_items e on e.studio_id=i.studio_id and e.id=i.id
    where i.studio_id=p_studio_id and i.project_id=p_project_id;
  return jsonb_build_object('schemaVersion',1,'projectId',project.id,'projectNumber',number,'revision',next_revision,
    'date',((now() at time zone 'Europe/Kyiv')::date)::text,'projectTitle',project.name,
    'clientName',coalesce(project.client_name,lead.client_name,''),'contact',concat_ws(' · ',nullif(lead.company,''),nullif(lead.email,''),nullif(lead.phone,'')),
    'address',concat_ws(', ',nullif(project.city,''),nullif(project.site_address,'')),
    'area',coalesce(pricing.area_snapshot,project.total_area_m2)::text,
    'clientRatePerM2',case when pricing.pricing_method='area' then
      (select gross_amount::text from private.finance_vat_parts(pricing.rate_per_m2,terms.vat_rate,terms.price_basis,4)) else null end,
    'currency',terms.currency,'minorUnits',digits,'gross',terms.gross_amount::text,
    'pricing',jsonb_build_object('listAmount',terms.amount::text,'priceBasis',terms.price_basis,
      'discountType',terms.discount_type,'discountValue',terms.discount_value::text,'discountAmount',terms.discount_amount::text,
      'agreedAmount',(terms.amount-terms.discount_amount)::text,'net',terms.net_amount::text,
      'listGross',(select gross_amount::text from private.finance_vat_parts(terms.amount,terms.vat_rate,terms.price_basis,digits)),
      'discountGross',(select (gross_amount-terms.gross_amount)::text from private.finance_vat_parts(terms.amount,terms.vat_rate,terms.price_basis,digits))),
    'studioContactDetails',(select jsonb_build_object('website',coalesce(website,''),'email',coalesce(email,''),'phone',coalesce(phone,''),'businessAddress',coalesce(business_address,'')) from public.studios where id=p_studio_id),
    'vatRate',terms.vat_rate::text,'vatAmount',terms.vat_amount::text,'rows',rows,'intro','');
end;
$function$;
