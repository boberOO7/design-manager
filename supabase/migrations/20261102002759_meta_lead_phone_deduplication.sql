-- Presentation punctuation is not identity. Convert known Ukrainian national
-- formats only when the source explicitly supplies UA; never guess a country.
create function private.crm_lead_phone_key(p_phone text,p_country_code text)
returns text language plpgsql immutable set search_path='' as $$
declare raw text:=btrim(p_phone); digits text; ua_format boolean;
begin
  if raw is null or raw='' or raw !~ '^\+?[0-9() .-]+$' then return null; end if;
  digits:=regexp_replace(raw,'[^0-9]','','g');
  ua_format:=p_country_code='UA' and
    (case when raw like '+%' then raw like '+380%' when raw like '00%' then raw like '00380%' else true end);
  if digits like '00%' then digits:=substr(digits,3); end if;
  if ua_format then
    if length(digits)=12 and digits like '380%' then null;
    elsif length(digits)=10 and digits like '0%' then digits:='38'||digits;
    elsif length(digits)=9 then digits:='380'||digits;
    else return null;
    end if;
  end if;
  return nullif(digits,'');
end;
$$;
revoke all on function private.crm_lead_phone_key(text,text) from public,anon,authenticated,service_role;
grant execute on function private.crm_lead_phone_key(text,text) to authenticated,service_role;
create index crm_leads_studio_phone_key_idx on public.crm_leads(studio_id,private.crm_lead_phone_key(phone,country_code));

-- Manual writes retain their existing validation/creation behavior. Share a
-- short tenant-scoped lock so an importer sees committed in-flight phone writes.
create function private.lock_crm_lead_phone_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.phone is distinct from old.phone or new.country_code is distinct from old.country_code or new.studio_id is distinct from old.studio_id then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('studioflow:crm_lead_phone:'||new.studio_id::text,0));
  end if;
  return new;
end;
$$;
revoke all on function private.lock_crm_lead_phone_write() from public,anon,authenticated,service_role;
create trigger lock_crm_lead_phone_write before insert or update of phone,country_code,studio_id on public.crm_leads
  for each row execute function private.lock_crm_lead_phone_write();

-- Only the trusted integration service can check candidate contacts. Return
-- external IDs only; no CRM contact data crosses into another tenant's preview.
create function public.find_meta_lead_phone_matches(p_studio_id uuid,p_contacts jsonb)
returns table(leadgen_id text) language plpgsql stable security definer set search_path='' as $$
begin
  if jsonb_typeof(p_contacts) is distinct from 'array' or jsonb_array_length(p_contacts)>50 then raise exception 'invalid_meta_contacts'; end if;
  return query select distinct item->>'id' from jsonb_array_elements(p_contacts) item
    where private.crm_lead_phone_key(item->>'phone',item->>'country_code') is not null
      and exists(select 1 from public.crm_leads lead where lead.studio_id=p_studio_id
        and private.crm_lead_phone_key(lead.phone,lead.country_code)=private.crm_lead_phone_key(item->>'phone',item->>'country_code'));
end;
$$;
revoke all on function public.find_meta_lead_phone_matches(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.find_meta_lead_phone_matches(uuid,jsonb) to service_role;

create or replace function public.complete_meta_lead_job(p_page_id text,p_leadgen_id text,p_studio_id uuid,p_lease_token uuid,p_lead jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare job public.meta_lead_jobs; lead_id uuid; source_form text; phone_key text;
begin
  select form_id into source_form from public.meta_lead_jobs where page_id=p_page_id and leadgen_id=p_leadgen_id and studio_id=p_studio_id;
  -- Form before job is the same lock order as a disabling update + its trigger.
  perform 1 from public.meta_lead_forms where page_id=p_page_id and form_id=source_form and studio_id=p_studio_id and sync_enabled for share;
  if not found then return null; end if;
  select * into job from public.meta_lead_jobs where page_id=p_page_id and leadgen_id=p_leadgen_id and studio_id=p_studio_id
    and form_id=source_form and status='processing' and lease_token=p_lease_token and locked_at>now()-interval '5 minutes' for update;
  if not found then return null; end if;
  if job.payload->>'id' is distinct from job.leadgen_id or job.submitted_at is null then raise exception 'invalid_meta_payload'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('studioflow:crm_lead_phone:'||job.studio_id::text,0));
  phone_key:=private.crm_lead_phone_key(p_lead->>'phone',p_lead->>'country_code');
  if phone_key is not null and exists(select 1 from public.crm_leads lead where lead.studio_id=job.studio_id
    and private.crm_lead_phone_key(lead.phone,lead.country_code)=phone_key) then
    update public.meta_lead_jobs set status='skipped',last_error='duplicate_phone',lease_token=null,locked_at=null
      where page_id=job.page_id and leadgen_id=job.leadgen_id;
    return null;
  end if;
  insert into public.crm_leads(studio_id,client_name,company,email,phone,source,city,country_code,site_address,internal_notes,first_contact_date,status)
  values(job.studio_id,p_lead->>'client_name',p_lead->>'company',p_lead->>'email',p_lead->>'phone',p_lead->>'source',p_lead->>'city',
    p_lead->>'country_code',p_lead->>'site_address',p_lead->>'internal_notes',(job.submitted_at at time zone 'Europe/Kyiv')::date,'new') returning id into lead_id;
  update public.meta_lead_jobs set status='completed',crm_lead_id=lead_id,completed_at=now(),lease_token=null,locked_at=null,last_error=null
    where page_id=job.page_id and leadgen_id=job.leadgen_id;
  return lead_id;
end;
$$;
revoke all on function public.complete_meta_lead_job(text,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_meta_lead_job(text,text,uuid,uuid,jsonb) to service_role;

notify pgrst, 'reload schema';
