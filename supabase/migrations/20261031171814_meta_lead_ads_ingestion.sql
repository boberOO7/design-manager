-- The completed inbox row is retained even if a CRM lead is deleted: Meta
-- redelivery/backfill must never recreate a lead intentionally deleted by an admin.
create table public.meta_lead_jobs (
  page_id text not null check (page_id ~ '^[0-9]+$'),
  leadgen_id text not null check (leadgen_id ~ '^[0-9]+$'),
  studio_id uuid not null references public.studios(id) on delete cascade,
  form_id text,
  ad_id text,
  submitted_at timestamptz,
  payload jsonb,
  crm_lead_id uuid,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  lease_token uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (page_id, leadgen_id),
  foreign key (crm_lead_id, studio_id) references public.crm_leads(id, studio_id)
    on delete set null (crm_lead_id)
);
create index meta_lead_jobs_ready_idx on public.meta_lead_jobs(page_id, studio_id, available_at)
  where status in ('pending', 'processing');
create trigger set_meta_lead_jobs_updated_at before update on public.meta_lead_jobs
  for each row execute function public.set_updated_at();
alter table public.meta_lead_jobs enable row level security;
revoke all on public.meta_lead_jobs from public, anon, authenticated, service_role;
grant select, insert, update on public.meta_lead_jobs to service_role;

create function public.enqueue_meta_lead_jobs(p_page_id text, p_studio_id uuid, p_events jsonb, p_retry_failed boolean default false)
returns integer language plpgsql security invoker set search_path = '' as $$
declare event jsonb; existing_studio uuid; inserted integer := 0; affected integer;
begin
  if jsonb_typeof(p_events) is distinct from 'array' then raise exception 'invalid_meta_events'; end if;
  for event in select value from jsonb_array_elements(p_events) loop
    if event->>'leadgen_id' is null then raise exception 'invalid_meta_lead_id'; end if;
    insert into public.meta_lead_jobs(page_id, leadgen_id, studio_id, form_id, ad_id, submitted_at)
    values (p_page_id, event->>'leadgen_id', p_studio_id, event->>'form_id', event->>'ad_id', (event->>'submitted_at')::timestamptz)
    on conflict (page_id, leadgen_id) do nothing;
    get diagnostics affected = row_count;
    inserted := inserted + affected;
    select studio_id into existing_studio from public.meta_lead_jobs
      where page_id = p_page_id and leadgen_id = event->>'leadgen_id' for update;
    if existing_studio is distinct from p_studio_id then raise exception 'meta_page_studio_mismatch'; end if;
    if p_retry_failed then
      update public.meta_lead_jobs set status = 'pending', attempts = 0, available_at = now(),
        locked_at = null, lease_token = null, last_error = null
      where page_id = p_page_id and leadgen_id = event->>'leadgen_id' and status = 'failed';
    end if;
  end loop;
  return inserted;
end;
$$;

create function public.claim_meta_lead_jobs(p_page_id text, p_studio_id uuid, p_limit integer default 5)
returns setof public.meta_lead_jobs language sql security invoker set search_path = '' as $$
  update public.meta_lead_jobs job
  set status = 'processing', attempts = attempts + 1, locked_at = now(), lease_token = gen_random_uuid()
  where (job.page_id, job.leadgen_id) in (
    select page_id, leadgen_id from public.meta_lead_jobs
    where page_id = p_page_id and studio_id = p_studio_id and (
      (status = 'pending' and available_at <= now()) or
      (status = 'processing' and locked_at < now() - interval '5 minutes')
    )
    order by available_at, created_at limit greatest(1, least(coalesce(p_limit, 5), 10))
    for update skip locked
  ) returning job.*;
$$;

-- Only the server role can invoke this bounded write; the tenant and status come
-- from the leased inbox row, never from Meta's payload or a browser identity.
create function public.complete_meta_lead_job(p_page_id text, p_leadgen_id text, p_studio_id uuid, p_lease_token uuid, p_lead jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare job public.meta_lead_jobs; lead_id uuid;
begin
  select * into job from public.meta_lead_jobs where page_id = p_page_id and leadgen_id = p_leadgen_id
    and studio_id = p_studio_id and status = 'processing' and lease_token = p_lease_token
    and locked_at > now() - interval '5 minutes' for update;
  if not found then return null; end if;
  if job.payload->>'id' is distinct from job.leadgen_id or job.submitted_at is null then
    raise exception 'invalid_meta_payload';
  end if;
  insert into public.crm_leads(studio_id, client_name, company, email, phone, source, city, country_code,
    site_address, internal_notes, first_contact_date, status)
  values (job.studio_id, p_lead->>'client_name', p_lead->>'company', p_lead->>'email', p_lead->>'phone',
    p_lead->>'source', p_lead->>'city', p_lead->>'country_code', p_lead->>'site_address',
    p_lead->>'internal_notes', (job.submitted_at at time zone 'Europe/Kyiv')::date, 'new')
  returning id into lead_id;
  update public.meta_lead_jobs set status = 'completed', crm_lead_id = lead_id, locked_at = null,
    lease_token = null, last_error = null where page_id = job.page_id and leadgen_id = job.leadgen_id;
  return lead_id;
end;
$$;

create function public.fail_meta_lead_job(p_page_id text, p_leadgen_id text, p_studio_id uuid, p_lease_token uuid, p_error text, p_retry boolean)
returns void language sql security invoker set search_path = '' as $$
  update public.meta_lead_jobs set
    status = case when p_retry and attempts < 8 then 'pending' else 'failed' end,
    available_at = now() + make_interval(secs => least(3600, 30 * power(2, least(attempts - 1, 7)))::integer),
    locked_at = null, lease_token = null, last_error = left(p_error, 160)
  where page_id = p_page_id and leadgen_id = p_leadgen_id and studio_id = p_studio_id
    and status = 'processing' and lease_token = p_lease_token;
$$;

revoke all on function public.enqueue_meta_lead_jobs(text, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.claim_meta_lead_jobs(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_meta_lead_job(text, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_meta_lead_job(text, text, uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.enqueue_meta_lead_jobs(text, uuid, jsonb, boolean) to service_role;
grant execute on function public.claim_meta_lead_jobs(text, uuid, integer) to service_role;
grant execute on function public.complete_meta_lead_job(text, text, uuid, uuid, jsonb) to service_role;
grant execute on function public.fail_meta_lead_job(text, text, uuid, uuid, text, boolean) to service_role;
