begin;

select plan(10);

select ok(
  not has_table_privilege('anon', 'public.google_calendar_connections', 'select'),
  'signed-out clients cannot read Google connection metadata'
);

select ok(
  has_table_privilege('authenticated', 'public.google_calendar_connections', 'select'),
  'authenticated clients can request Google connection metadata through RLS'
);

select ok(
  not has_table_privilege('authenticated', 'public.google_calendar_connections', 'insert')
  and not has_table_privilege('authenticated', 'public.google_calendar_connections', 'update')
  and not has_table_privilege('authenticated', 'public.google_calendar_connections', 'delete'),
  'authenticated clients cannot mutate Google connection metadata'
);

select ok(
  not has_table_privilege('authenticated', 'public.google_calendar_server_credentials', 'select')
  and not has_table_privilege('authenticated', 'public.google_calendar_server_credentials', 'insert')
  and not has_table_privilege('authenticated', 'public.google_calendar_server_credentials', 'update')
  and not has_table_privilege('authenticated', 'public.google_calendar_server_credentials', 'delete'),
  'authenticated clients have no credential-table privileges'
);

select ok(
  not has_table_privilege('authenticated', 'public.google_calendar_event_mappings', 'select')
  and not has_table_privilege('authenticated', 'public.google_calendar_event_mappings', 'insert')
  and not has_table_privilege('authenticated', 'public.google_calendar_event_mappings', 'update')
  and not has_table_privilege('authenticated', 'public.google_calendar_event_mappings', 'delete'),
  'authenticated clients have no mapping-table privileges'
);

select ok(
  has_table_privilege('service_role', 'public.google_calendar_connections', 'select')
  and has_table_privilege('service_role', 'public.google_calendar_connections', 'insert')
  and has_table_privilege('service_role', 'public.google_calendar_connections', 'update')
  and has_table_privilege('service_role', 'public.google_calendar_connections', 'delete'),
  'the server role manages connection metadata'
);

select ok(
  has_table_privilege('service_role', 'public.google_calendar_server_credentials', 'select')
  and has_table_privilege('service_role', 'public.google_calendar_server_credentials', 'insert')
  and has_table_privilege('service_role', 'public.google_calendar_server_credentials', 'update')
  and has_table_privilege('service_role', 'public.google_calendar_server_credentials', 'delete'),
  'the server role manages encrypted credentials'
);

select ok(
  has_table_privilege('service_role', 'public.google_calendar_event_mappings', 'select')
  and has_table_privilege('service_role', 'public.google_calendar_event_mappings', 'insert')
  and has_table_privilege('service_role', 'public.google_calendar_event_mappings', 'update')
  and has_table_privilege('service_role', 'public.google_calendar_event_mappings', 'delete'),
  'the server role manages event mappings'
);

select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.google_calendar_connections'::regclass,
    'public.google_calendar_server_credentials'::regclass,
    'public.google_calendar_event_mappings'::regclass
  )),
  'RLS is enabled on every Google Calendar table'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'google_calendar_connections'
      and policyname = 'google_calendar_connections_select_own'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and qual like '%auth.uid()%'
      and qual like '%private.is_studio_member%'
  ),
  'metadata SELECT is scoped to the authenticated owner and active studio'
);

select * from finish();
rollback;
