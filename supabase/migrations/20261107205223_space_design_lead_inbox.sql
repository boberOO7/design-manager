-- Secrets stay in server environment variables; this registry binds/revokes keys
-- and provides a shared, bounded rate limiter across application instances.
create table public.space_design_integration_keys (
  key_id text primary key check (key_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  studio_id uuid not null references public.studios(id) on delete cascade,
  enabled boolean not null default true,
  requests_per_minute integer not null default 60 check (requests_per_minute between 1 and 10000),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  unique (key_id, studio_id)
);
create index space_design_keys_studio_idx on public.space_design_integration_keys(studio_id);

create table public.space_design_lead_jobs (
  studio_id uuid not null references public.studios(id) on delete cascade,
  submission_id uuid not null,
  key_id text not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb,
  status text not null default 'pending' check (status in ('pending','processing','created','duplicate','failed')),
  attempts integer not null default 0 check (attempts between 0 and 8),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  lease_token uuid,
  crm_lead_id uuid,
  last_error text check (last_error in ('crm_write_failed','lease_exhausted')),
  received_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (studio_id, submission_id),
  foreign key (key_id, studio_id) references public.space_design_integration_keys(key_id, studio_id),
  foreign key (crm_lead_id, studio_id) references public.crm_leads(id, studio_id) on delete set null (crm_lead_id),
  check (payload is null or (jsonb_typeof(payload)='object' and payload->>'submission_id'=submission_id::text)),
  check (status not in ('pending','processing') or payload is not null),
  check ((status='processing') = (lease_token is not null and locked_at is not null))
);
create index space_design_jobs_ready_idx on public.space_design_lead_jobs(available_at, received_at)
  where status in ('pending','processing');
create index space_design_jobs_key_idx on public.space_design_lead_jobs(key_id, studio_id);
create index space_design_jobs_lead_idx on public.space_design_lead_jobs(crm_lead_id, studio_id) where crm_lead_id is not null;
alter table public.space_design_integration_keys enable row level security;
alter table public.space_design_lead_jobs enable row level security;
revoke all on public.space_design_integration_keys, public.space_design_lead_jobs from public, anon, authenticated, service_role;
grant select, insert, update on public.space_design_integration_keys, public.space_design_lead_jobs to service_role;

create function public.accept_space_design_lead(p_key_id text,p_studio_id uuid,p_submission_id uuid,p_payload_hash text,p_payload jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare integration public.space_design_integration_keys; previous_hash text; inserted integer;
begin
  select * into integration from public.space_design_integration_keys
    where key_id=p_key_id and studio_id=p_studio_id and enabled for update;
  if not found then return 'unauthorized'; end if;
  if integration.window_started_at <= clock_timestamp()-interval '1 minute' then
    update public.space_design_integration_keys set window_started_at=clock_timestamp(),request_count=1 where key_id=p_key_id;
  elsif integration.request_count >= integration.requests_per_minute then return 'rate_limited';
  else update public.space_design_integration_keys set request_count=request_count+1 where key_id=p_key_id;
  end if;
  insert into public.space_design_lead_jobs(studio_id,submission_id,key_id,payload_hash,payload)
    values(p_studio_id,p_submission_id,p_key_id,p_payload_hash,p_payload)
    on conflict(studio_id,submission_id) do nothing;
  get diagnostics inserted=row_count;
  if inserted=1 then return 'accepted'; end if;
  select payload_hash into previous_hash from public.space_design_lead_jobs
    where studio_id=p_studio_id and submission_id=p_submission_id;
  return case when previous_hash=p_payload_hash then 'replayed' else 'conflict' end;
end;
$$;

create function public.claim_space_design_leads(p_limit integer default 5)
returns table(studio_id uuid,submission_id uuid,lease_token uuid)
language plpgsql security invoker set search_path='' as $$
begin
  -- A worker that repeatedly crashes must eventually leave a diagnostic result.
  update public.space_design_lead_jobs job set status='failed',last_error='lease_exhausted',
    lease_token=null,locked_at=null,completed_at=now()
    where job.status='processing' and job.locked_at<=now()-interval '5 minutes' and job.attempts>=8;
  return query update public.space_design_lead_jobs job
    set status='processing',attempts=job.attempts+1,locked_at=now(),lease_token=gen_random_uuid()
    where (job.studio_id,job.submission_id) in (
      select candidate.studio_id,candidate.submission_id from public.space_design_lead_jobs candidate
      where candidate.attempts<8 and ((candidate.status='pending' and candidate.available_at<=now())
        or (candidate.status='processing' and candidate.locked_at<=now()-interval '5 minutes'))
      order by candidate.available_at,candidate.received_at
      limit greatest(1,least(coalesce(p_limit,5),10)) for update skip locked
    ) returning job.studio_id,job.submission_id,job.lease_token;
end;
$$;

create function private.crm_lead_email_key(p_email text)
returns text language sql immutable set search_path='' as $$ select nullif(lower(btrim(p_email)),''); $$;
revoke all on function private.crm_lead_email_key(text) from public,anon,authenticated,service_role;
grant execute on function private.crm_lead_email_key(text) to authenticated,service_role;
create index crm_leads_studio_email_key_idx on public.crm_leads(studio_id,private.crm_lead_email_key(email));

-- INSERT and phone/studio changes already take this lock. Include email edits
-- so email-only imports also wait for in-flight manual CRM contact writes.
create function private.lock_crm_lead_email_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.email is distinct from old.email then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('studioflow:crm_lead_phone:'||new.studio_id::text,0));
  end if;
  return new;
end;
$$;
revoke all on function private.lock_crm_lead_email_write() from public,anon,authenticated,service_role;
create trigger lock_crm_lead_email_write before update of email on public.crm_leads
  for each row execute function private.lock_crm_lead_email_write();

create function public.complete_space_design_lead(p_studio_id uuid,p_submission_id uuid,p_lease_token uuid)
returns text language plpgsql security definer set search_path='' as $$
declare job public.space_design_lead_jobs; lead_id uuid; phone_key text; email_key text;
begin
  select * into job from public.space_design_lead_jobs where studio_id=p_studio_id and submission_id=p_submission_id
    and status='processing' and lease_token=p_lease_token and locked_at>now()-interval '5 minutes' for update;
  if not found then return 'stale'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('studioflow:crm_lead_phone:'||job.studio_id::text,0));
  phone_key:=private.crm_lead_phone_key(job.payload->>'phone',null);
  email_key:=private.crm_lead_email_key(job.payload->>'email');
  if (phone_key is not null and exists(select 1 from public.crm_leads lead where lead.studio_id=job.studio_id
      and private.crm_lead_phone_key(lead.phone,lead.country_code)=phone_key))
    or (phone_key is null and email_key is not null and exists(select 1 from public.crm_leads lead where lead.studio_id=job.studio_id
      and private.crm_lead_email_key(lead.email)=email_key)) then
    update public.space_design_lead_jobs set status='duplicate',payload=null,completed_at=now(),lease_token=null,locked_at=null,last_error=null
      where studio_id=job.studio_id and submission_id=job.submission_id;
    return 'duplicate';
  end if;
  insert into public.crm_leads(studio_id,client_name,phone,email,source,first_contact_date,status)
    values(job.studio_id,job.payload->>'client_name',job.payload->>'phone',job.payload->>'email','SPACE DESIGN Website',
      ((job.payload->>'submitted_at')::timestamptz at time zone 'Europe/Kyiv')::date,'new') returning id into lead_id;
  update public.space_design_lead_jobs set status='created',crm_lead_id=lead_id,payload=null,completed_at=now(),
    lease_token=null,locked_at=null,last_error=null where studio_id=job.studio_id and submission_id=job.submission_id;
  return 'created';
end;
$$;

create function public.fail_space_design_lead(p_studio_id uuid,p_submission_id uuid,p_lease_token uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare result text;
begin
  update public.space_design_lead_jobs set status=case when attempts<8 then 'pending' else 'failed' end,
    available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts-1,7)))::integer),
    completed_at=case when attempts>=8 then now() else null end,
    lease_token=null,locked_at=null,last_error='crm_write_failed'
    where studio_id=p_studio_id and submission_id=p_submission_id and status='processing' and lease_token=p_lease_token
      and locked_at>now()-interval '5 minutes' returning status into result;
  return case result when 'pending' then 'retried' when 'failed' then 'failed' else 'stale' end;
end;
$$;

revoke all on function public.accept_space_design_lead(text,uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.claim_space_design_leads(integer) from public,anon,authenticated;
revoke all on function public.complete_space_design_lead(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.fail_space_design_lead(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.accept_space_design_lead(text,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.claim_space_design_leads(integer) to service_role;
grant execute on function public.complete_space_design_lead(uuid,uuid,uuid) to service_role;
grant execute on function public.fail_space_design_lead(uuid,uuid,uuid) to service_role;

-- Reuse existing pg_cron/pg_net/Vault installations, with independent secrets
-- and an inactive job. No existing Meta configuration or schedules are changed.
create function private.dispatch_space_design_lead_worker()
returns bigint language plpgsql security invoker set search_path='' as $$
declare worker_url text; worker_token text;
begin
  select decrypted_secret into worker_url from vault.decrypted_secrets where name='studioflow_space_design_worker_url';
  select decrypted_secret into worker_token from vault.decrypted_secrets where name='studioflow_space_design_worker_secret';
  if worker_url is null or worker_url !~ '^https://[^/?#@[:space:]]+/api/integrations/space-design/worker$'
    or worker_token is null or length(btrim(worker_token))=0 then raise exception 'space_design_scheduler_not_configured'; end if;
  return net.http_get(url:=worker_url,headers:=jsonb_build_object('Authorization','Bearer '||worker_token),timeout_milliseconds:=65000);
end;
$$;
revoke all on function private.dispatch_space_design_lead_worker() from public,anon,authenticated,service_role;
select cron.schedule_in_database('studioflow-space-design-leads-worker','* * * * *',
  'select private.dispatch_space_design_lead_worker();',current_database(),null,false);
notify pgrst, 'reload schema';
