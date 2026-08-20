-- INSERT ... RETURNING checks SELECT RLS for the inserted row.  The previous
-- SELECT policy delegated every case to private.can_view_calendar_event(id),
-- which looks the row up again.  During RETURNING that nested lookup cannot
-- yet see the new row, even though the organizer can read it after the INSERT
-- statement completes.  Keep the organizer path row-local and use the helper
-- for invitee, administrator, and project-access visibility.
do $$
declare
  calendar_policy record;
begin
  -- Make the final policy set deterministic when a local environment contains
  -- policies left behind by earlier calendar iterations.
  for calendar_policy in
    select polname
    from pg_policy
    where polrelid = 'public.calendar_events'::regclass
  loop
    execute format('drop policy %I on public.calendar_events', calendar_policy.polname);
  end loop;
end;
$$;

create policy calendar_events_select_visible
on public.calendar_events for select to authenticated
using (
  case
    when organizer_id = (select auth.uid())
      and (select private.is_studio_member(studio_id))
    then true
    else (select private.can_view_calendar_event(id))
  end
);

create policy calendar_events_insert_organizer_or_admin
on public.calendar_events for insert to authenticated
with check (
  created_by = (select auth.uid())
  and organizer_id = (select auth.uid())
  and (select private.is_studio_member(studio_id))
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

create policy calendar_events_update_organizer_or_admin
on public.calendar_events for update to authenticated
using ((select private.can_manage_calendar_event(id)))
with check (
  (select private.is_studio_member(studio_id))
  and (private.is_studio_admin(studio_id) or organizer_id = (select auth.uid()))
);

-- The atomic invoker RPC explicitly writes the initial invitation status.
-- The original column grant omitted status, so event creation with invitees
-- reached the invite insert and then failed with 42501.
grant insert (event_id, user_id, status, invited_by)
on table public.calendar_event_invites to authenticated;
