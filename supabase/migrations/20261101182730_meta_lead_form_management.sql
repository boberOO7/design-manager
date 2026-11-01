create table public.meta_lead_forms (
  page_id text not null check (page_id ~ '^[0-9]+$'),
  form_id text not null check (form_id ~ '^[0-9]+$'),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text,
  meta_status text,
  meta_created_at timestamptz,
  lifetime_leads_count bigint check (lifetime_leads_count >= 0),
  sync_enabled boolean not null default false,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(page_id, form_id)
);
create index meta_lead_forms_studio_idx on public.meta_lead_forms(studio_id, page_id);
create trigger set_meta_lead_forms_updated_at before update on public.meta_lead_forms
  for each row execute function public.set_updated_at();
alter table public.meta_lead_forms enable row level security;
revoke all on public.meta_lead_forms from public, anon, authenticated, service_role;
grant select on public.meta_lead_forms to authenticated;
grant update(sync_enabled) on public.meta_lead_forms to authenticated;
grant select, insert, update on public.meta_lead_forms to service_role;
create policy meta_lead_forms_admin_read on public.meta_lead_forms for select to authenticated
  using ((select private.is_active_crm_admin(studio_id)));
create policy meta_lead_forms_admin_update on public.meta_lead_forms for update to authenticated
  using ((select private.is_active_crm_admin(studio_id)))
  with check ((select private.is_active_crm_admin(studio_id)));

alter table public.meta_lead_jobs drop constraint meta_lead_jobs_status_check;
alter table public.meta_lead_jobs add constraint meta_lead_jobs_status_check
  check (status in ('pending','processing','completed','failed','blocked','skipped'));
alter table public.meta_lead_jobs add column completed_at timestamptz;
create index meta_lead_jobs_form_status_idx on public.meta_lead_jobs(studio_id,page_id,form_id,status);
-- Existing in-flight work also needs an administrator's explicit form approval
-- and a separate manual import. Enabling a form never releases this backlog.
update public.meta_lead_jobs set status='blocked', locked_at=null, lease_token=null,
  last_error='form_not_enabled' where status in ('pending','processing');

create function public.register_meta_lead_forms(p_page_id text, p_studio_id uuid, p_forms jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb; existing_studio uuid;
begin
  for item in select value from jsonb_array_elements(p_forms) loop
    insert into public.meta_lead_forms(page_id,form_id,studio_id,name,meta_status,meta_created_at,lifetime_leads_count)
    values(p_page_id,item->>'id',p_studio_id,item->>'name',item->>'status',
      (item->>'created_time')::timestamptz,(item->>'leads_count')::bigint)
    on conflict(page_id,form_id) do update set name=excluded.name,meta_status=excluded.meta_status,
      meta_created_at=excluded.meta_created_at,lifetime_leads_count=excluded.lifetime_leads_count
      where public.meta_lead_forms.studio_id=excluded.studio_id;
    select studio_id into existing_studio from public.meta_lead_forms where page_id=p_page_id and form_id=item->>'id';
    if existing_studio is distinct from p_studio_id then raise exception 'meta_page_studio_mismatch'; end if;
  end loop;
end;
$$;
revoke all on function public.register_meta_lead_forms(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.register_meta_lead_forms(text,uuid,jsonb) to service_role;

create function private.block_disabled_meta_form_jobs() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.sync_enabled and not new.sync_enabled then
    update public.meta_lead_jobs set status='blocked',lease_token=null,locked_at=null,last_error='form_disabled'
    where page_id=new.page_id and studio_id=new.studio_id and form_id=new.form_id and status in ('pending','processing');
  end if;
  return new;
end;
$$;
revoke all on function private.block_disabled_meta_form_jobs() from public,anon,authenticated,service_role;
create trigger block_disabled_meta_form_jobs after update of sync_enabled on public.meta_lead_forms
  for each row execute function private.block_disabled_meta_form_jobs();

drop function public.enqueue_meta_lead_jobs(text,uuid,jsonb,boolean);
create function public.enqueue_meta_lead_jobs(p_page_id text,p_studio_id uuid,p_events jsonb,p_retry_failed boolean default false,p_manual boolean default false)
returns integer language plpgsql security invoker set search_path='' as $$
declare event jsonb; job public.meta_lead_jobs; form_enabled boolean; affected integer; inserted integer:=0; source_form text;
begin
  if jsonb_typeof(p_events) is distinct from 'array' then raise exception 'invalid_meta_events'; end if;
  for event in select value from jsonb_array_elements(p_events) loop
    if event->>'leadgen_id' is null then raise exception 'invalid_meta_lead_id'; end if;
    -- Share the form lock with completion. A concurrent disable waits, then
    -- invalidates every pending/processing job before it commits.
    source_form:=coalesce(event->>'form_id',(select form_id from public.meta_lead_jobs where page_id=p_page_id and leadgen_id=event->>'leadgen_id' and studio_id=p_studio_id));
    form_enabled:=false;
    select sync_enabled into form_enabled from public.meta_lead_forms
      where page_id=p_page_id and studio_id=p_studio_id and form_id=source_form for share;
    form_enabled:=coalesce(form_enabled,false);
    if p_manual and not form_enabled then raise exception 'meta_form_not_enabled'; end if;
    insert into public.meta_lead_jobs(page_id,leadgen_id,studio_id,form_id,ad_id,submitted_at,status,last_error)
    values(p_page_id,event->>'leadgen_id',p_studio_id,source_form,event->>'ad_id',
      (event->>'submitted_at')::timestamptz,case when form_enabled then 'pending' else 'blocked' end,
      case when form_enabled then null else 'form_not_enabled' end)
    on conflict(page_id,leadgen_id) do nothing;
    get diagnostics affected=row_count;
    inserted:=inserted+affected;
    select * into job from public.meta_lead_jobs where page_id=p_page_id and leadgen_id=event->>'leadgen_id' for update;
    if job.studio_id is distinct from p_studio_id then raise exception 'meta_page_studio_mismatch'; end if;
    if job.form_id is not null and event->>'form_id' is not null and job.form_id<>event->>'form_id' then raise exception 'meta_form_mismatch'; end if;
    if job.status in ('completed','skipped') then continue; end if;
    if p_manual and (job.status='blocked' or (p_retry_failed and job.status='failed')) then
      update public.meta_lead_jobs set status='pending',form_id=coalesce(job.form_id,event->>'form_id'),
        attempts=0,available_at=now(),lease_token=null,locked_at=null,last_error=null
      where page_id=p_page_id and leadgen_id=job.leadgen_id;
    elsif not form_enabled and job.status in ('pending','processing') then
      update public.meta_lead_jobs set status='blocked',lease_token=null,locked_at=null,last_error='form_not_enabled'
      where page_id=p_page_id and leadgen_id=job.leadgen_id;
    end if;
  end loop;
  return inserted;
end;
$$;
revoke all on function public.enqueue_meta_lead_jobs(text,uuid,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.enqueue_meta_lead_jobs(text,uuid,jsonb,boolean,boolean) to service_role;

drop function public.claim_meta_lead_jobs(text,uuid,integer);
create function public.claim_meta_lead_jobs(p_page_id text,p_studio_id uuid,p_limit integer default 5,p_leadgen_ids text[] default null)
returns setof public.meta_lead_jobs language sql security invoker set search_path='' as $$
  update public.meta_lead_jobs job set status='processing',attempts=attempts+1,locked_at=now(),lease_token=gen_random_uuid()
  where (job.page_id,job.leadgen_id) in (
    select candidate.page_id,candidate.leadgen_id from public.meta_lead_jobs candidate
    join public.meta_lead_forms form on form.page_id=candidate.page_id and form.form_id=candidate.form_id and form.studio_id=candidate.studio_id
    where candidate.page_id=p_page_id and candidate.studio_id=p_studio_id and form.sync_enabled
      and (p_leadgen_ids is null or candidate.leadgen_id=any(p_leadgen_ids))
      and ((candidate.status='pending' and candidate.available_at<=now()) or (candidate.status='processing' and candidate.locked_at<now()-interval '5 minutes'))
    order by candidate.available_at,candidate.created_at limit greatest(1,least(coalesce(p_limit,5),10))
    for update of candidate skip locked
  ) returning job.*;
$$;
revoke all on function public.claim_meta_lead_jobs(text,uuid,integer,text[]) from public,anon,authenticated;
grant execute on function public.claim_meta_lead_jobs(text,uuid,integer,text[]) to service_role;

create or replace function public.complete_meta_lead_job(p_page_id text,p_leadgen_id text,p_studio_id uuid,p_lease_token uuid,p_lead jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare job public.meta_lead_jobs; lead_id uuid; source_form text;
begin
  select form_id into source_form from public.meta_lead_jobs where page_id=p_page_id and leadgen_id=p_leadgen_id and studio_id=p_studio_id;
  -- Form before job is the same lock order as a disabling update + its trigger.
  perform 1 from public.meta_lead_forms where page_id=p_page_id and form_id=source_form and studio_id=p_studio_id and sync_enabled for share;
  if not found then return null; end if;
  select * into job from public.meta_lead_jobs where page_id=p_page_id and leadgen_id=p_leadgen_id and studio_id=p_studio_id
    and form_id=source_form and status='processing' and lease_token=p_lease_token and locked_at>now()-interval '5 minutes' for update;
  if not found then return null; end if;
  if job.payload->>'id' is distinct from job.leadgen_id or job.submitted_at is null then raise exception 'invalid_meta_payload'; end if;
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

create function public.set_meta_lead_exclusion(p_page_id text,p_studio_id uuid,p_form_id text,p_leadgen_id text,p_excluded boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare job public.meta_lead_jobs;
begin
  if not private.is_active_crm_admin(p_studio_id) then raise exception 'crm_admin_required'; end if;
  perform 1 from public.meta_lead_forms where page_id=p_page_id and form_id=p_form_id and studio_id=p_studio_id for share;
  if not found then raise exception 'meta_form_not_found'; end if;
  if p_leadgen_id !~ '^[0-9]+$' then raise exception 'invalid_meta_lead_id'; end if;
  insert into public.meta_lead_jobs(page_id,leadgen_id,studio_id,form_id,status,last_error)
    values(p_page_id,p_leadgen_id,p_studio_id,p_form_id,'blocked','manual_import_required') on conflict(page_id,leadgen_id) do nothing;
  select * into job from public.meta_lead_jobs where page_id=p_page_id and leadgen_id=p_leadgen_id for update;
  if job.studio_id<>p_studio_id or job.form_id is distinct from p_form_id then raise exception 'meta_form_mismatch'; end if;
  if job.status='completed' then return false; end if;
  update public.meta_lead_jobs set status=case when p_excluded then 'skipped' else 'blocked' end,
    last_error=case when p_excluded then 'admin_skipped' else 'manual_import_required' end,
    payload=null,submitted_at=null,ad_id=null,lease_token=null,locked_at=null
    where page_id=p_page_id and leadgen_id=p_leadgen_id;
  return true;
end;
$$;
revoke all on function public.set_meta_lead_exclusion(text,uuid,text,text,boolean) from public,anon,service_role;
grant execute on function public.set_meta_lead_exclusion(text,uuid,text,text,boolean) to authenticated;

create function public.get_meta_lead_management_summary(p_page_id text,p_studio_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'enabledForms',(select count(*) from public.meta_lead_forms where page_id=p_page_id and studio_id=p_studio_id and sync_enabled),
    'pending',(select count(*) from public.meta_lead_jobs where page_id=p_page_id and studio_id=p_studio_id and status in ('pending','processing')),
    'failed',(select count(*) from public.meta_lead_jobs where page_id=p_page_id and studio_id=p_studio_id and status='failed'),
    'lastSuccess',(select max(completed_at) from public.meta_lead_jobs where page_id=p_page_id and studio_id=p_studio_id and status='completed'),
    'forms',(select coalesce(jsonb_agg(jsonb_build_object(
      'form_id',form.form_id,'name',form.name,'meta_status',form.meta_status,'meta_created_at',form.meta_created_at,
      'lifetime_leads_count',form.lifetime_leads_count,'sync_enabled',form.sync_enabled,
      'imported',coalesce(counts.imported,0),'pending',coalesce(counts.pending,0),'failed',coalesce(counts.failed,0)
    ) order by form.discovered_at,form.form_id),'[]'::jsonb)
      from public.meta_lead_forms form
      left join (select form_id,count(*) filter(where status='completed') imported,
        count(*) filter(where status in ('pending','processing')) pending,count(*) filter(where status='failed') failed
        from public.meta_lead_jobs where page_id=p_page_id and studio_id=p_studio_id group by form_id) counts on counts.form_id=form.form_id
      where form.page_id=p_page_id and form.studio_id=p_studio_id)
  );
$$;
revoke all on function public.get_meta_lead_management_summary(text,uuid) from public,anon,authenticated;
grant execute on function public.get_meta_lead_management_summary(text,uuid) to service_role;

notify pgrst, 'reload schema';
