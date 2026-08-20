-- The original policy predates organizer_id and did not state the project
-- boundary used by the atomic event creation RPC. Keep the RPC as an invoker:
-- this policy and the existing validation trigger remain the authorization
-- boundary for the event insert.
-- The deployed column grant predates organizer_id; without this precise grant
-- the invoker RPC fails with 42501 before RLS can accept the row.
grant insert (organizer_id) on table public.calendar_events to authenticated;

drop policy if exists calendar_events_insert_admin on public.calendar_events;

create policy calendar_events_insert_admin
on public.calendar_events
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and organizer_id = (select auth.uid())
  and (select private.is_studio_admin(studio_id))
  and (
    project_id is null
    or exists (
      select 1
      from public.projects as project
      where project.id = calendar_events.project_id
        and project.studio_id = calendar_events.studio_id
        and project.status in ('planned', 'active', 'paused')
        and (select private.can_access_project(project.id))
    )
  )
);
