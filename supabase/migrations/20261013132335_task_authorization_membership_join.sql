-- Set-based equivalent of can_access_project: active studio admins, or active
-- project members whose studio membership is also active. Profile gating and
-- private productivity permissions remain at their existing boundaries.
create or replace function private.accessible_project_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select project.id
  from public.projects as project
  join public.studio_members as member on member.studio_id = project.studio_id
  where member.user_id = (select auth.uid())
    and member.is_active
    and (
      member.system_role = 'admin'
      or exists (
        select 1 from public.project_members as project_member
        where project_member.project_id = project.id
          and project_member.user_id = member.user_id
          and project_member.is_active
      )
    );
$$;
revoke all on function private.accessible_project_ids() from public, anon, service_role;
grant execute on function private.accessible_project_ids() to authenticated;
