revoke update on table public.projects from anon, authenticated;

grant update (
  name,
  project_code,
  client_name,
  description,
  total_area_m2,
  status,
  priority,
  start_date,
  due_date,
  completed_at,
  archived_at
) on table public.projects to authenticated;

create policy "projects_update_for_studio_admins"
on public.projects
for update
to authenticated
using (
  (select private.is_studio_admin(studio_id))
)
with check (
  (select private.is_studio_admin(studio_id))
);
