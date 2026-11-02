-- Percentage visibility is presentation-only and frozen in each proposal snapshot.
-- Missing legacy values retain visible percentages; stored PDFs are never rewritten.
create or replace function public.save_finance_project_proposal(
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
      ('projectTitle','clientName','contact','address','intro','studioContacts','designVariant','studioContactPerson','stageNotes','showPercentages'))
    then raise exception 'finance_input_invalid'; end if;
  if p_source->>'projectId' is distinct from p_project_id::text or
    coalesce(p_source->>'schemaVersion','') not in ('1','2') or
    (p_source->>'schemaVersion'='2' and p_source->'order'->>'id' is distinct from commercial_order.id::text)
    then raise exception 'finance_input_invalid'; end if;
  if p_presentation ? 'designVariant' and (
    jsonb_typeof(p_presentation->'designVariant') is distinct from 'string' or
    p_presentation->>'designVariant' not in ('classic','measured-space','quiet-monument','folded-plane')
  ) then raise exception 'finance_input_invalid'; end if;
  if p_presentation ? 'showPercentages' and jsonb_typeof(p_presentation->'showPercentages') is distinct from 'boolean' then
    raise exception 'finance_input_invalid';
  end if;
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

notify pgrst, 'reload schema';
