-- Task deletion is deliberately limited to active studio administrators.
-- The table privilege lets authenticated requests reach RLS; the policy below
-- remains the authorization boundary and leaves anon without delete access.
grant delete on table public.tasks to authenticated;

create policy "tasks_delete_for_studio_admins"
on public.tasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects as project
    where project.id = tasks.project_id
      and (select private.is_studio_admin(project.studio_id))
  )
);
