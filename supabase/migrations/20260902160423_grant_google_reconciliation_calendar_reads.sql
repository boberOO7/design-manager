-- The reconciliation worker uses the server-only Supabase client to evaluate
-- the same event, invitation, and participant relevance data for every active
-- Google connection. RLS bypass does not replace PostgreSQL table privileges.
grant select on table
  public.calendar_events,
  public.calendar_event_invites,
  public.calendar_event_participants
to service_role;
