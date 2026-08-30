create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  studio_id uuid not null references public.studios(id) on delete cascade,
  google_account_email text not null,
  google_calendar_id text not null,
  google_calendar_name text not null,
  google_calendar_timezone text not null default 'Europe/Kyiv',
  granted_scopes text[] not null default '{}'::text[],
  status text not null default 'active' check (status in ('active', 'reconnect_required')),
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, studio_id)
);

comment on table public.google_calendar_connections is
  'Authenticated-readable Google Calendar connection metadata. OAuth credentials are stored separately.';

create table public.google_calendar_server_credentials (
  connection_id uuid primary key references public.google_calendar_connections(id) on delete cascade,
  encrypted_refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.google_calendar_server_credentials is
  'Server-only AES-GCM encrypted OAuth refresh tokens. Browser roles receive no grants.';

create table public.google_calendar_event_mappings (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
  source_event_id uuid references public.calendar_events(id) on delete set null,
  source_key text not null,
  google_event_id text not null,
  payload_hash text not null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, source_key),
  unique (connection_id, google_event_id)
);

comment on table public.google_calendar_event_mappings is
  'Server-only per-connection projection identity and reconciliation state.';

create trigger set_google_calendar_connections_updated_at
  before update on public.google_calendar_connections
  for each row execute function public.set_updated_at();

create trigger set_google_calendar_server_credentials_updated_at
  before update on public.google_calendar_server_credentials
  for each row execute function public.set_updated_at();

create trigger set_google_calendar_event_mappings_updated_at
  before update on public.google_calendar_event_mappings
  for each row execute function public.set_updated_at();

alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_server_credentials enable row level security;
alter table public.google_calendar_event_mappings enable row level security;

revoke all on table public.google_calendar_connections from public, anon, authenticated, service_role;
revoke all on table public.google_calendar_server_credentials from public, anon, authenticated, service_role;
revoke all on table public.google_calendar_event_mappings from public, anon, authenticated, service_role;

grant select on table public.google_calendar_connections to authenticated;
grant select, insert, update, delete on table public.google_calendar_connections to service_role;
grant select, insert, update, delete on table public.google_calendar_server_credentials to service_role;
grant select, insert, update, delete on table public.google_calendar_event_mappings to service_role;

create policy google_calendar_connections_select_own
on public.google_calendar_connections for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_studio_member(studio_id))
);

create index google_calendar_event_mappings_connection_idx
  on public.google_calendar_event_mappings(connection_id, last_synced_at);
