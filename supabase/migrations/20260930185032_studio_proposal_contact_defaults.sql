-- Reusable business contacts belong to the existing studio profile.
alter table public.studios
  add column website text check (website is null or (char_length(website)<=300 and website ~* '^https?://[^[:space:]]+$')),
  add column email text check (email is null or (char_length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  add column phone text check (phone is null or char_length(phone)<=100),
  add column business_address text check (business_address is null or char_length(business_address)<=500);

create function public.save_studio_contact_details(p_studio_id uuid,p_website text,p_email text,p_phone text,p_business_address text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(private.is_studio_admin(p_studio_id),false)
    or not exists(select 1 from public.profiles where id=(select auth.uid()) and is_active)
    or (select count(*) from public.studio_members where user_id=(select auth.uid()) and is_active)<>1
    then raise exception 'studio_forbidden'; end if;
  update public.studios set website=nullif(btrim(p_website),''),email=nullif(btrim(p_email),''),
    phone=nullif(btrim(p_phone),''),business_address=nullif(btrim(p_business_address),'') where id=p_studio_id;
  if not found then raise exception 'studio_not_found'; end if;
end;
$$;
revoke all on function public.save_studio_contact_details(uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.save_studio_contact_details(uuid,text,text,text,text) to authenticated;

-- Keep actual contact values in the authoritative source and generated snapshot.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('private.finance_proposal_source(uuid,uuid)'::regprocedure);
  definition:=replace(definition,
    '''vatRate'',terms.vat_rate::text',
    '''studioContactDetails'',(select jsonb_build_object(''website'',coalesce(website,''''),''email'',coalesce(email,''''),''phone'',coalesce(phone,''''),''businessAddress'',coalesce(business_address,'''')) from public.studios where id=p_studio_id),
    ''vatRate'',terms.vat_rate::text');
  execute definition;
  definition:=pg_get_functiondef('public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid)'::regprocedure);
  definition:=replace(definition,'source:=private.finance_proposal_source(p_studio_id,p_project_id);',
    'perform 1 from public.studios where id=p_studio_id for share;
  source:=private.finance_proposal_source(p_studio_id,p_project_id);');
  execute definition;
end;
$$;
