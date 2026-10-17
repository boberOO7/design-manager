-- A denomination correction is an explicit amendment, never an FX conversion.
-- Keep ordinary agreement writers locked; only wholly unconsumed orders qualify.
create function public.correct_finance_project_order_currency(
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
    insert into public.finance_project_plan_revisions(terms_id,studio_id,project_id,pricing_method,area_snapshot,rate_per_m2,item_order)
      values(result,p_studio_id,p_project_id,plan.pricing_method,plan.area_snapshot,plan.rate_per_m2,plan.item_order);
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
revoke all on function public.correct_finance_project_order_currency(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.correct_finance_project_order_currency(uuid,uuid,uuid,jsonb) to authenticated;
