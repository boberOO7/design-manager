-- Durable, coalescing Google Calendar reconciliation requests. Calendar writes
-- enqueue in the same database transaction; only the trusted server worker can
-- claim or manage jobs.

alter table public.google_calendar_event_mappings
  add column root_source_event_id uuid;

comment on column public.google_calendar_event_mappings.root_source_event_id is
  'Stable root calendar event or recurring-series ID. Deliberately has no foreign key so a hard-deleted event can still be reconciled out of Google.';

update public.google_calendar_event_mappings mapping
set root_source_event_id = coalesce(event.series_id, event.id)
from public.calendar_events event
where event.id = mapping.source_event_id;

create index google_calendar_event_mappings_root_idx
  on public.google_calendar_event_mappings(connection_id, root_source_event_id);

create table public.google_calendar_reconciliation_jobs (
  source_event_id uuid primary key,
  studio_id uuid not null references public.studios(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.google_calendar_reconciliation_jobs is
  'Server-only coalescing outbox. One row means reconcile the latest state of one root StudioFlow calendar event.';

create index google_calendar_reconciliation_jobs_ready_idx
  on public.google_calendar_reconciliation_jobs(status, available_at);

create trigger set_google_calendar_reconciliation_jobs_updated_at
  before update on public.google_calendar_reconciliation_jobs
  for each row execute function public.set_updated_at();

alter table public.google_calendar_reconciliation_jobs enable row level security;
revoke all on table public.google_calendar_reconciliation_jobs from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.google_calendar_reconciliation_jobs to service_role;

create or replace function private.enqueue_google_calendar_reconciliation(
  target_event_id uuid,
  target_studio_id uuid
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.google_calendar_reconciliation_jobs (
    source_event_id,
    studio_id,
    revision,
    status,
    attempts,
    available_at,
    locked_at,
    last_error
  ) values (
    target_event_id,
    target_studio_id,
    1,
    'pending',
    0,
    now(),
    null,
    null
  )
  on conflict (source_event_id) do update
  set studio_id = excluded.studio_id,
      revision = public.google_calendar_reconciliation_jobs.revision + 1,
      status = 'pending',
      attempts = 0,
      available_at = now(),
      locked_at = null,
      last_error = null;
$$;

revoke execute on function private.enqueue_google_calendar_reconciliation(uuid, uuid)
from public, anon, authenticated;

create or replace function private.enqueue_google_calendar_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.calendar_events%rowtype;
begin
  event_row := case when tg_op = 'DELETE' then old else new end;
  perform private.enqueue_google_calendar_reconciliation(
    coalesce(event_row.series_id, event_row.id),
    event_row.studio_id
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function private.enqueue_google_calendar_event_change()
from public, anon, authenticated;

create or replace function private.enqueue_google_calendar_relation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_event_id uuid;
  root_event_id uuid;
  event_studio_id uuid;
begin
  changed_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  select coalesce(event.series_id, event.id), event.studio_id
  into root_event_id, event_studio_id
  from public.calendar_events event
  where event.id = changed_event_id;

  if root_event_id is not null then
    perform private.enqueue_google_calendar_reconciliation(root_event_id, event_studio_id);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function private.enqueue_google_calendar_relation_change()
from public, anon, authenticated;

create trigger enqueue_google_calendar_event_reconciliation
after insert or update or delete on public.calendar_events
for each row execute function private.enqueue_google_calendar_event_change();

create trigger enqueue_google_calendar_invite_reconciliation
after insert or update or delete on public.calendar_event_invites
for each row execute function private.enqueue_google_calendar_relation_change();

create trigger enqueue_google_calendar_participant_reconciliation
after insert or update or delete on public.calendar_event_participants
for each row execute function private.enqueue_google_calendar_relation_change();

create or replace function public.claim_google_calendar_reconciliation_jobs(p_limit integer default 10)
returns setof public.google_calendar_reconciliation_jobs
language sql
security invoker
set search_path = ''
as $$
  update public.google_calendar_reconciliation_jobs job
  set status = 'processing',
      attempts = job.attempts + 1,
      locked_at = now()
  where job.source_event_id in (
    select candidate.source_event_id
    from public.google_calendar_reconciliation_jobs candidate
    where (
      candidate.status = 'pending'
      and candidate.available_at <= now()
    ) or (
      candidate.status = 'processing'
      and candidate.locked_at < now() - interval '10 minutes'
    )
    order by candidate.available_at, candidate.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  returning job.*;
$$;

revoke execute on function public.claim_google_calendar_reconciliation_jobs(integer)
from public, anon, authenticated;
grant execute on function public.claim_google_calendar_reconciliation_jobs(integer)
to service_role;
