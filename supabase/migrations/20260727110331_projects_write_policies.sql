grant insert on table public.projects to authenticated;

-- An earlier local migration used this policy name without granting INSERT.
-- Recreate it so the full local migration chain remains replayable.
drop policy if exists "projects_insert_for_studio_admins" on public.projects;

create policy "projects_insert_for_studio_admins"
on public.projects
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.is_studio_admin(studio_id))
);

drop policy if exists "projects_select_for_studio_admins"
on public.projects;

create policy "projects_select_for_studio_admins"
on public.projects
for select
to authenticated
using (
  (select private.is_studio_admin(studio_id))
);
