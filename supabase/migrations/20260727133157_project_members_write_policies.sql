revoke insert, update, delete
on table public.project_members
from anon, authenticated;

grant insert (
  project_id,
  user_id,
  project_role,
  assigned_area_m2,
  assigned_at
) on table public.project_members to authenticated;

grant update (project_role)
on table public.project_members
to authenticated;

grant delete
on table public.project_members
to authenticated;

create or replace function private.can_manage_project_members(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    where project.id = target_project_id
      and private.is_studio_admin(project.studio_id)
  );
$$;

revoke execute on function private.can_manage_project_members(uuid) from public, anon;
grant execute on function private.can_manage_project_members(uuid) to authenticated;

create or replace function private.can_assign_project_member(
  target_project_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    inner join public.studio_members as target_member
      on target_member.studio_id = project.studio_id
    where project.id = target_project_id
      and target_member.user_id = target_user_id
      and target_member.is_active = true
      and private.is_studio_admin(project.studio_id)
  );
$$;

revoke execute on function private.can_assign_project_member(uuid, uuid) from public, anon;
grant execute on function private.can_assign_project_member(uuid, uuid) to authenticated;

create policy "project_members_insert_for_studio_admins"
on public.project_members
for insert
to authenticated
with check (
  (select private.can_assign_project_member(project_id, user_id))
);

create policy "project_members_update_role_for_studio_admins"
on public.project_members
for update
to authenticated
using (
  (select private.can_manage_project_members(project_id))
)
with check (
  (select private.can_manage_project_members(project_id))
);

create policy "project_members_delete_for_studio_admins"
on public.project_members
for delete
to authenticated
using (
  (select private.can_manage_project_members(project_id))
);
