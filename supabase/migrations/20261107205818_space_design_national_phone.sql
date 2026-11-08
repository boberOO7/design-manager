-- SPACE DESIGN accepts the common UA national 0XXXXXXXXX format. Explicit
-- international prefixes and ambiguous bare nine-digit numbers keep their country.
create function private.space_design_phone_key(p_phone text,p_country_code text)
returns text language sql immutable set search_path='' as $$
  select private.crm_lead_phone_key(p_phone,case
    when p_country_code is null and btrim(p_phone) !~ '^(\+|00)'
      and regexp_replace(p_phone,'[^0-9]','','g') ~ '^0[0-9]{9}$' then 'UA'
    else p_country_code end);
$$;
revoke all on function private.space_design_phone_key(text,text) from public,anon,authenticated,service_role;
grant execute on function private.space_design_phone_key(text,text) to authenticated,service_role;
create index crm_leads_space_design_phone_key_idx on public.crm_leads(studio_id,private.space_design_phone_key(phone,country_code));

create or replace function public.complete_space_design_lead(p_studio_id uuid,p_submission_id uuid,p_lease_token uuid)
returns text language plpgsql security definer set search_path='' as $$
declare job public.space_design_lead_jobs; lead_id uuid; phone_key text; email_key text;
begin
  select * into job from public.space_design_lead_jobs where studio_id=p_studio_id and submission_id=p_submission_id
    and status='processing' and lease_token=p_lease_token and locked_at>now()-interval '5 minutes' for update;
  if not found then return 'stale'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('studioflow:crm_lead_phone:'||job.studio_id::text,0));
  phone_key:=private.space_design_phone_key(job.payload->>'phone',null);
  email_key:=private.crm_lead_email_key(job.payload->>'email');
  if (phone_key is not null and exists(select 1 from public.crm_leads lead where lead.studio_id=job.studio_id
      and private.space_design_phone_key(lead.phone,lead.country_code)=phone_key))
    or (phone_key is null and email_key is not null and exists(select 1 from public.crm_leads lead where lead.studio_id=job.studio_id
      and private.crm_lead_email_key(lead.email)=email_key)) then
    update public.space_design_lead_jobs set status='duplicate',payload=null,completed_at=now(),lease_token=null,locked_at=null,last_error=null
      where studio_id=job.studio_id and submission_id=job.submission_id;
    return 'duplicate';
  end if;
  insert into public.crm_leads(studio_id,client_name,phone,email,country_code,source,first_contact_date,status)
    values(job.studio_id,job.payload->>'client_name',job.payload->>'phone',job.payload->>'email',
      case when phone_key ~ '^380[0-9]{9}$' then 'UA' end,'SPACE DESIGN Website',
      ((job.payload->>'submitted_at')::timestamptz at time zone 'Europe/Kyiv')::date,'new') returning id into lead_id;
  update public.space_design_lead_jobs set status='created',crm_lead_id=lead_id,payload=null,completed_at=now(),
    lease_token=null,locked_at=null,last_error=null where studio_id=job.studio_id and submission_id=job.submission_id;
  return 'created';
end;
$$;

notify pgrst, 'reload schema';
