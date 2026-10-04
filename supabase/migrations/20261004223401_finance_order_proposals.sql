-- Orders own commercial proposals. Existing snapshots and stored PDF bytes remain immutable.
alter table public.finance_project_proposals
  drop constraint finance_project_proposals_studio_id_project_id_revision_key,
  add constraint finance_project_proposals_order_revision_key unique(studio_id,order_id,revision);

create function private.finance_proposal_source(p_studio_id uuid,p_project_id uuid,p_order_id uuid) returns jsonb
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
revoke all on function private.finance_proposal_source(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Keep the legacy SQL signatures; absent order scope resolves only the default order.
create or replace function private.finance_proposal_source(p_studio_id uuid,p_project_id uuid) returns jsonb
language sql security definer set search_path='' as $$
  select private.finance_proposal_source(p_studio_id,p_project_id,null);
$$;
create function public.get_finance_proposal_source(p_studio_id uuid,p_project_id uuid,p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(private.is_finance_admin(p_studio_id),false) then raise exception 'finance_forbidden'; end if;
  return private.finance_proposal_source(p_studio_id,p_project_id,p_order_id);
end;
$$;
revoke all on function public.get_finance_proposal_source(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_proposal_source(uuid,uuid,uuid) to authenticated;

create function public.save_finance_project_proposal(
  p_studio_id uuid,p_project_id uuid,p_request_id uuid,p_source jsonb,
  p_presentation jsonb,p_pdf text,p_actor_id uuid,p_order_id uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare old public.finance_project_proposals; source jsonb; snapshot jsonb; result uuid;
  field text; commercial_order public.finance_project_orders;
begin
  if p_actor_id is null or not exists(select 1 from public.studio_members m join public.profiles p on p.id=m.user_id
    where m.studio_id=p_studio_id and m.user_id=p_actor_id and m.system_role='admin' and m.is_active and p.is_active)
    or (select count(*) from public.studio_members where user_id=p_actor_id and is_active)<>1 then raise exception 'finance_forbidden'; end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  select * into commercial_order from public.finance_project_orders
    where studio_id=p_studio_id and project_id=p_project_id and
      ((p_order_id is not null and id=p_order_id) or (p_order_id is null and is_default and status<>'discarded')) for update;
  if commercial_order.id is null then raise exception 'finance_project_agreement_required'; end if;
  if p_source is null or jsonb_typeof(p_source) is distinct from 'object' or
    jsonb_typeof(p_presentation) is distinct from 'object' or
    exists(select 1 from jsonb_object_keys(p_presentation) k where k not in
      ('projectTitle','clientName','contact','address','intro','studioContacts','designVariant','studioContactPerson','stageNotes'))
    then raise exception 'finance_input_invalid'; end if;
  if p_source->>'projectId' is distinct from p_project_id::text or
    coalesce(p_source->>'schemaVersion','') not in ('1','2') or
    (p_source->>'schemaVersion'='2' and p_source->'order'->>'id' is distinct from commercial_order.id::text)
    then raise exception 'finance_input_invalid'; end if;
  if p_presentation ? 'designVariant' and (
    jsonb_typeof(p_presentation->'designVariant') is distinct from 'string' or
    p_presentation->>'designVariant' not in ('classic','measured-space','quiet-monument','folded-plane')
  ) then raise exception 'finance_input_invalid'; end if;
  foreach field in array array['projectTitle','clientName','contact','address','intro'] loop
    if jsonb_typeof(p_presentation->field) is distinct from 'string' or
      char_length(p_presentation->>field)>(case when field in ('intro','contact','address') then 1000 else 500 end)
      then raise exception 'finance_input_invalid'; end if;
  end loop;
  if char_length(btrim(p_presentation->>'projectTitle'))=0 then raise exception 'finance_input_invalid'; end if;
  if p_presentation ? 'studioContacts' and (jsonb_typeof(p_presentation->'studioContacts') is distinct from 'string' or char_length(p_presentation->>'studioContacts')>300) then raise exception 'finance_input_invalid'; end if;
  if p_presentation ? 'studioContactPerson' and (
    jsonb_typeof(p_presentation->'studioContactPerson') is distinct from 'string' or
    char_length(p_presentation->>'studioContactPerson')>200 or
    jsonb_typeof(p_source->'studioContactDetails') is distinct from 'object'
  ) then raise exception 'finance_input_invalid'; end if;
  snapshot:=p_source||(p_presentation-'studioContactPerson'-'stageNotes')||
    jsonb_build_object('designVariant',coalesce(p_presentation->>'designVariant','classic'));
  if p_presentation ? 'studioContactPerson' then
    snapshot:=jsonb_set(snapshot,'{studioContactDetails,contactPerson}',p_presentation->'studioContactPerson');
  end if;
  if p_presentation ? 'stageNotes' then
    if jsonb_typeof(p_presentation->'stageNotes') is distinct from 'array' or
      jsonb_typeof(p_source->'rows') is distinct from 'array' then raise exception 'finance_input_invalid'; end if;
    if exists(select 1 from jsonb_array_elements(p_presentation->'stageNotes') n where jsonb_typeof(n) is distinct from 'object') then raise exception 'finance_input_invalid'; end if;
    if exists(select 1 from jsonb_array_elements(p_presentation->'stageNotes') n where
      jsonb_typeof(n->'id') is distinct from 'string' or jsonb_typeof(n->'note') is distinct from 'string' or
      char_length(n->>'note')>300 or exists(select 1 from jsonb_object_keys(n) k where k not in ('id','note')) or
      not exists(select 1 from jsonb_array_elements(p_source->'rows') r where r->>'id'=n->>'id')
    ) or (select count(distinct n->>'id') from jsonb_array_elements(p_presentation->'stageNotes') n)<>jsonb_array_length(p_presentation->'stageNotes') then raise exception 'finance_input_invalid'; end if;
    snapshot:=jsonb_set(snapshot,'{rows}',coalesce((
      select jsonb_agg(r.value||jsonb_build_object('note',coalesce((
        select n->'note' from jsonb_array_elements(p_presentation->'stageNotes') n where n->>'id'=r.value->>'id'
      ),r.value->'note')) order by r.ordinality)
      from jsonb_array_elements(snapshot->'rows') with ordinality r(value,ordinality)
    ),'[]'::jsonb));
  end if;
  select * into old from public.finance_project_proposals where studio_id=p_studio_id and request_id=p_request_id;
  if old.id is not null then
    if old.project_id<>p_project_id or old.order_id is distinct from commercial_order.id or
      old.snapshot||jsonb_build_object('designVariant',coalesce(old.snapshot->>'designVariant','classic')) is distinct from snapshot
      then raise exception 'finance_request_conflict'; end if;
    return old.id;
  end if;
  -- A matching historical V1 request can be retried; every new save must use the current source.
  if p_source->>'schemaVersion'<>'2' then raise exception 'finance_version_conflict'; end if;
  if commercial_order.status='discarded' then raise exception 'finance_project_agreement_required'; end if;
  perform 1 from public.projects where studio_id=p_studio_id and id=p_project_id for update;
  perform 1 from public.crm_leads where studio_id=p_studio_id and project_id=p_project_id for update;
  perform 1 from public.finance_expected_items where studio_id=p_studio_id and id in
    (select expected_item_id from public.finance_project_items where studio_id=p_studio_id and project_id=p_project_id and order_id=commercial_order.id)
    order by id for update;
  perform 1 from public.studios where id=p_studio_id for share;
  source:=private.finance_proposal_source(p_studio_id,p_project_id,commercial_order.id);
  if source is distinct from p_source then raise exception 'finance_version_conflict'; end if;
  insert into public.finance_project_proposals(studio_id,project_id,order_id,revision,request_id,snapshot,pdf,created_by)
    values(p_studio_id,p_project_id,commercial_order.id,(source->>'revision')::integer,p_request_id,snapshot,decode(p_pdf,'base64'),p_actor_id)
    returning id into result;
  return result;
end;
$$;
revoke all on function public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid) to service_role;

create or replace function public.save_finance_project_proposal(
  p_studio_id uuid,p_project_id uuid,p_request_id uuid,p_source jsonb,p_presentation jsonb,p_pdf text,p_actor_id uuid
) returns uuid language sql security definer set search_path='' as $$
  select public.save_finance_project_proposal(p_studio_id,p_project_id,p_request_id,p_source,p_presentation,p_pdf,p_actor_id,null);
$$;
revoke all on function public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid) to service_role;

notify pgrst, 'reload schema';
