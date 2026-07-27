create policy "projects_insert_for_studio_admins"
on public.projects
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.is_studio_admin(studio_id))
);
