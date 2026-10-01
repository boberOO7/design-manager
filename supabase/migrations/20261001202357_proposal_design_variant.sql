-- Presentation only: keep the canonical Finance source, immutable history and PDF bytes.
create or replace function public.save_finance_project_proposal(
  p_studio_id uuid,p_project_id uuid,p_request_id uuid,p_source jsonb,
  p_presentation jsonb,p_pdf text,p_actor_id uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare old public.finance_project_proposals; source jsonb; snapshot jsonb; result uuid; field text;
begin
  -- Only the trusted renderer may save bytes. Verify its audited actor again in SQL.
  if p_actor_id is null or not exists(select 1 from public.studio_members m join public.profiles p on p.id=m.user_id
    where m.studio_id=p_studio_id and m.user_id=p_actor_id and m.system_role='admin' and m.is_active and p.is_active)
    or (select count(*) from public.studio_members where user_id=p_actor_id and is_active)<>1 then raise exception 'finance_forbidden'; end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  if p_presentation ? 'designVariant' and (
    jsonb_typeof(p_presentation->'designVariant') is distinct from 'string' or
    p_presentation->>'designVariant' not in ('classic','measured-space','quiet-monument','folded-plane')
  ) then raise exception 'finance_input_invalid'; end if;
  snapshot:=p_source||p_presentation||jsonb_build_object('designVariant',coalesce(p_presentation->>'designVariant','classic'));
  select * into old from public.finance_project_proposals where studio_id=p_studio_id and request_id=p_request_id;
  if old.id is not null then
    if old.project_id<>p_project_id or
      old.snapshot||jsonb_build_object('designVariant',coalesce(old.snapshot->>'designVariant','classic')) is distinct from snapshot
      then raise exception 'finance_request_conflict'; end if;
    return old.id;
  end if;
  if p_source is null or jsonb_typeof(p_presentation) is distinct from 'object' or
    exists(select 1 from jsonb_object_keys(p_presentation) k where k not in ('projectTitle','clientName','contact','address','intro','studioContacts','designVariant')) then raise exception 'finance_input_invalid'; end if;
  foreach field in array array['projectTitle','clientName','contact','address','intro'] loop
    if jsonb_typeof(p_presentation->field) is distinct from 'string' or char_length(p_presentation->>field)>(case when field in ('intro','contact','address') then 1000 else 500 end) then raise exception 'finance_input_invalid'; end if;
  end loop;
  if p_presentation ? 'studioContacts' and (jsonb_typeof(p_presentation->'studioContacts') is distinct from 'string' or char_length(p_presentation->>'studioContacts')>300) then raise exception 'finance_input_invalid'; end if;
  if char_length(btrim(p_presentation->>'projectTitle'))=0 then raise exception 'finance_input_invalid'; end if;
  perform 1 from public.projects where studio_id=p_studio_id and id=p_project_id for update;
  perform 1 from public.crm_leads where studio_id=p_studio_id and project_id=p_project_id for update;
  perform 1 from public.finance_expected_items where studio_id=p_studio_id and id in
    (select id from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id) order by id for update;
  perform 1 from public.studios where id=p_studio_id for share;
  source:=private.finance_proposal_source(p_studio_id,p_project_id);
  if source is distinct from p_source then raise exception 'finance_version_conflict'; end if;
  insert into public.finance_project_proposals(studio_id,project_id,revision,request_id,snapshot,pdf,created_by)
    values(p_studio_id,p_project_id,(source->>'revision')::integer,p_request_id,snapshot,decode(p_pdf,'base64'),p_actor_id) returning id into result;
  return result;
end;
$$;
revoke all on function public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid) to service_role;
