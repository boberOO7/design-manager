-- Lead quotes are documents, not project agreements or expected payments.
create table public.crm_lead_proposals (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete restrict,
  lead_id uuid not null,
  revision integer not null check (revision > 0),
  request_id uuid not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and snapshot->>'schemaVersion' = '3'
    and snapshot->>'leadId' = lead_id::text and snapshot->>'revision' = revision::text
    and snapshot->>'projectNumber' ~ '^[0-9]+$'),
  pdf bytea not null check (octet_length(pdf) between 5 and 10485760 and substring(pdf from 1 for 5) = decode('255044462d','hex')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(studio_id, lead_id, revision), unique(studio_id, request_id),
  foreign key(lead_id, studio_id) references public.crm_leads(id, studio_id) on delete restrict
);
create index crm_lead_proposals_creator_idx on public.crm_lead_proposals(created_by);
alter table public.crm_lead_proposals enable row level security;
revoke all on public.crm_lead_proposals from public, anon, authenticated, service_role;
grant select on public.crm_lead_proposals to authenticated;
create policy crm_lead_proposals_admin on public.crm_lead_proposals for select to authenticated
using ((select private.is_finance_admin(studio_id)));
create trigger crm_lead_proposals_immutable before update or delete on public.crm_lead_proposals
for each row execute function private.reject_finance_history_change();

create function public.save_crm_lead_proposal(p_studio_id uuid, p_lead_id uuid, p_request_id uuid,
  p_source jsonb, p_snapshot jsonb, p_pdf text, p_actor_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare lead public.crm_leads; studio public.studios; old public.crm_lead_proposals;
  next_revision integer; initial_number text; result uuid; contacts jsonb;
begin
  -- Only the trusted renderer can call this RPC; verify its authenticated actor again.
  if p_actor_id is null or not exists (select 1 from public.studio_members m join public.profiles p on p.id=m.user_id
    where m.studio_id=p_studio_id and m.user_id=p_actor_id and m.system_role='admin' and m.is_active and p.is_active)
    or (select count(*) from public.studio_members where user_id=p_actor_id and is_active)<>1 then
    raise exception 'finance_forbidden';
  end if;
  select * into studio from public.studios where id=p_studio_id for update;
  select * into lead from public.crm_leads where studio_id=p_studio_id and id=p_lead_id for update;
  if lead.id is null then raise exception 'finance_forbidden'; end if;
  if p_source is null or p_snapshot is null or p_source->>'schemaVersion' is distinct from '3'
    or p_snapshot->>'schemaVersion' is distinct from '3'
    or p_source->>'leadId' is distinct from p_lead_id::text or p_snapshot->>'leadId' is distinct from p_lead_id::text
    or p_snapshot->'projectId' is distinct from 'null'::jsonb
    or p_snapshot->'commercialTerms' is distinct from p_source->'commercialTerms'
    or coalesce(p_snapshot->>'projectNumber','') !~ '^[0-9]+$' then raise exception 'finance_input_invalid'; end if;
  select * into old from public.crm_lead_proposals where studio_id=p_studio_id and request_id=p_request_id;
  if old.id is not null then
    if old.lead_id<>p_lead_id or old.snapshot is distinct from p_snapshot then raise exception 'finance_version_conflict'; end if;
    return old.id;
  end if;
  select coalesce(max(revision),0)+1 into next_revision from public.crm_lead_proposals where studio_id=p_studio_id and lead_id=p_lead_id;
  select snapshot->>'projectNumber' into initial_number from public.crm_lead_proposals where studio_id=p_studio_id and lead_id=p_lead_id order by revision limit 1;
  contacts:=jsonb_build_object('website',coalesce(studio.website,''),'email',coalesce(studio.email,''),
    'phone',coalesce(studio.phone,''),'businessAddress',coalesce(studio.business_address,''),'contactPerson',coalesce(studio.contact_person,''));
  if (p_source->>'revision')::integer is distinct from next_revision or (p_snapshot->>'revision')::integer is distinct from next_revision
    or p_source->>'leadUpdatedAt' is distinct from lead.updated_at::text
      and (p_source->>'leadUpdatedAt')::timestamptz is distinct from lead.updated_at
    or p_source->'studioContactDetails' is distinct from contacts
    or initial_number is not null and p_snapshot->>'projectNumber' is distinct from initial_number then
    raise exception 'finance_version_conflict';
  end if;
  insert into public.crm_lead_proposals(studio_id,lead_id,revision,request_id,snapshot,pdf,created_by)
    values(p_studio_id,p_lead_id,next_revision,p_request_id,p_snapshot,decode(p_pdf,'base64'),p_actor_id) returning id into result;
  return result;
end;
$$;
revoke all on function public.save_crm_lead_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_crm_lead_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid) to service_role;
