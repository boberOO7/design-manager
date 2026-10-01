alter table public.studios add column contact_person text
  check (contact_person is null or char_length(contact_person)<=200);

-- The optional argument keeps existing callers compatible without clearing a saved person.
drop function public.save_studio_contact_details(uuid,text,text,text,text);
create function public.save_studio_contact_details(
  p_studio_id uuid,p_website text,p_email text,p_phone text,p_business_address text,
  p_contact_person text default null
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(private.is_studio_admin(p_studio_id),false)
    or not exists(select 1 from public.profiles where id=(select auth.uid()) and is_active)
    or (select count(*) from public.studio_members where user_id=(select auth.uid()) and is_active)<>1
    then raise exception 'studio_forbidden'; end if;
  update public.studios set website=nullif(btrim(p_website),''),email=nullif(btrim(p_email),''),
    phone=nullif(btrim(p_phone),''),business_address=nullif(btrim(p_business_address),''),
    contact_person=case when p_contact_person is null then contact_person else nullif(btrim(p_contact_person),'') end
    where id=p_studio_id;
  if not found then raise exception 'studio_not_found'; end if;
end;
$$;
revoke all on function public.save_studio_contact_details(uuid,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.save_studio_contact_details(uuid,text,text,text,text,text) to authenticated;

-- Only future draft metadata changes. Existing snapshots and PDF bytes are untouched.
do $$
declare definition text; updated text;
begin
  definition:=pg_get_functiondef('private.finance_proposal_source(uuid,uuid)'::regprocedure);
  updated:=replace(definition,
    $old$'contact',concat_ws(' · ',nullif(lead.company,''),nullif(lead.email,''),nullif(lead.phone,''))$old$,
    $new$'contact',coalesce(lead.phone,'')$new$);
  if updated=definition then raise exception 'proposal_contact_source_not_found'; end if;
  definition:=updated;
  updated:=replace(definition,
    $old$'businessAddress',coalesce(business_address,''))$old$,
    $new$'businessAddress',coalesce(business_address,''),'contactPerson',coalesce(contact_person,''))$new$);
  if updated=definition then raise exception 'studio_contact_source_not_found'; end if;
  execute updated;

  definition:=pg_get_functiondef('public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid)'::regprocedure);
  updated:=replace(definition,
    $old$snapshot:=p_source||p_presentation||jsonb_build_object('designVariant',coalesce(p_presentation->>'designVariant','classic'));$old$,
    $new$if p_presentation ? 'studioContactPerson' and (
    jsonb_typeof(p_presentation->'studioContactPerson') is distinct from 'string' or
    char_length(p_presentation->>'studioContactPerson')>200 or
    jsonb_typeof(p_source->'studioContactDetails') is distinct from 'object'
  ) then raise exception 'finance_input_invalid'; end if;
  snapshot:=p_source||(p_presentation-'studioContactPerson')||jsonb_build_object('designVariant',coalesce(p_presentation->>'designVariant','classic'));
  if p_presentation ? 'studioContactPerson' then
    snapshot:=jsonb_set(snapshot,'{studioContactDetails,contactPerson}',p_presentation->'studioContactPerson');
  end if;$new$);
  if updated=definition then raise exception 'proposal_snapshot_merge_not_found'; end if;
  definition:=updated;
  updated:=replace(definition,
    $old$'studioContacts','designVariant')$old$,
    $new$'studioContacts','designVariant','studioContactPerson')$new$);
  if updated=definition then raise exception 'proposal_presentation_allowlist_not_found'; end if;
  execute updated;
end;
$$;

notify pgrst, 'reload schema';
