-- Studio membership is retained as the historical identity record. Removing
-- access only deactivates this row and its current project memberships.
alter table public.studio_members
  add column removed_at timestamptz,
  add column removed_by uuid references public.profiles(id);

create index studio_members_former_directory_idx
  on public.studio_members (studio_id, removed_at desc)
  where is_active = false;

-- Active project membership is an access grant, so a former member must never
-- retain it. Keep the row itself for historical project attribution.
create or replace function private.can_access_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects
    where id = target_project_id and private.is_studio_admin(studio_id)
  ) or exists (
    select 1 from public.project_members as pm
    join public.projects as p on p.id = pm.project_id
    join public.studio_members as sm on sm.studio_id = p.studio_id and sm.user_id = pm.user_id
    where pm.project_id = target_project_id
      and pm.user_id = (select auth.uid())
      and pm.is_active and sm.is_active
  );
$$;

-- A current studio colleague may still resolve the preserved profile in task
-- and activity history; the Team former directory itself is administrator-only.
create or replace function private.can_view_profile(target_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    target_user_id = (select auth.uid()) or exists (
      select 1 from public.studio_members as current_member
      join public.studio_members as target_member on target_member.studio_id = current_member.studio_id
      where current_member.user_id = (select auth.uid())
        and current_member.is_active
        and target_member.user_id = target_user_id
    ), false
  );
$$;

drop policy if exists "studio_members_select_for_active_members" on public.studio_members;
create policy "studio_members_select_for_active_members_or_admin_directory"
on public.studio_members for select to authenticated
using (
  (select private.is_studio_member(studio_id))
  and (is_active or (select private.is_studio_admin(studio_id)) or user_id = (select auth.uid()))
);

-- These rows are studio data even when the recipient/requester is the caller.
-- Preserve only the user's profile and auth session after membership removal.
drop policy if exists "notifications_select_for_recipient" on public.notifications;
drop policy if exists "notifications_mark_read_for_recipient" on public.notifications;
create policy "notifications_select_for_active_recipient"
on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()) and (select private.is_studio_member(studio_id)));
create policy "notifications_mark_read_for_active_recipient"
on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()) and (select private.is_studio_member(studio_id)))
with check (recipient_id = (select auth.uid()) and (select private.is_studio_member(studio_id)));

drop policy if exists time_off_requests_select_own_or_admin on public.time_off_requests;
drop policy if exists time_off_requests_update_own_or_admin on public.time_off_requests;
create policy time_off_requests_select_active_member_or_admin
on public.time_off_requests for select to authenticated
using (
  (select private.is_studio_member(studio_id))
  and (user_id = (select auth.uid()) or (select private.is_studio_admin(studio_id)))
);
create policy time_off_requests_update_active_member_or_admin
on public.time_off_requests for update to authenticated
using (
  (select private.is_studio_member(studio_id))
  and (user_id = (select auth.uid()) or (select private.is_studio_admin(studio_id)))
)
with check (
  (select private.is_studio_member(studio_id))
  and (user_id = (select auth.uid()) or (select private.is_studio_admin(studio_id)))
);

create or replace function public.get_studio_member_removal_impact(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_studio_id uuid; v_open_count integer; v_overdue_count integer; v_project_count integer;
begin
  select sm.studio_id into v_studio_id from public.studio_members sm
  where sm.user_id = p_user_id and sm.is_active and private.is_studio_admin(sm.studio_id);
  if v_studio_id is null or p_user_id = (select auth.uid()) then raise exception 'Member cannot be removed from this studio'; end if;
  select count(*), count(*) filter (where t.due_date < current_date)
    into v_open_count, v_overdue_count
  from public.tasks t join public.projects p on p.id = t.project_id
  where p.studio_id = v_studio_id and t.assignee_id = p_user_id and t.status not in ('completed', 'cancelled');
  select count(distinct pm.project_id) into v_project_count
  from public.project_members pm join public.projects p on p.id = pm.project_id
  where p.studio_id = v_studio_id and pm.user_id = p_user_id and pm.is_active and p.status in ('planned','active','paused') and p.archived_at is null;
  return jsonb_build_object(
    'openTaskCount', v_open_count,
    'overdueTaskCount', v_overdue_count,
    'activeProjectCount', v_project_count,
    'eligibleMembers', coalesce((
      select jsonb_agg(jsonb_build_object('id', sm.user_id, 'fullName', pr.full_name) order by pr.full_name)
      from public.studio_members sm join public.profiles pr on pr.id = sm.user_id
      where sm.studio_id = v_studio_id and sm.user_id <> p_user_id and sm.is_active and pr.is_active
        and not exists (
          select 1 from public.tasks t join public.projects p on p.id = t.project_id
          where p.studio_id = v_studio_id and t.assignee_id = p_user_id and t.status not in ('completed','cancelled')
            and not exists (select 1 from public.project_members pm where pm.project_id = t.project_id and pm.user_id = sm.user_id and pm.is_active)
        )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.remove_studio_member(p_user_id uuid, p_reassignment_user_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_studio_id uuid; v_target_role text; v_open_count integer; v_eligible_count integer;
begin
  select sm.studio_id into v_studio_id from public.studio_members sm
  where sm.user_id = (select auth.uid()) and sm.is_active and sm.system_role = 'admin';
  select sm.system_role into v_target_role from public.studio_members sm
  where sm.studio_id = v_studio_id and sm.user_id = p_user_id and sm.is_active for update;
  if v_studio_id is null or v_target_role is null then raise exception 'Active studio member was not found'; end if;
  if p_user_id = (select auth.uid()) then raise exception 'You cannot remove yourself'; end if;
  perform 1 from public.studio_members sm where sm.studio_id = v_studio_id and sm.is_active and sm.system_role = 'admin' for update;
  if v_target_role = 'admin' and (select count(*) from public.studio_members where studio_id = v_studio_id and is_active and system_role = 'admin') <= 1 then raise exception 'The last active administrator cannot be removed'; end if;
  select count(*) into v_open_count from public.tasks t join public.projects p on p.id = t.project_id
    where p.studio_id = v_studio_id and t.assignee_id = p_user_id and t.status not in ('completed','cancelled');
  if v_open_count > 0 then
    if p_reassignment_user_id is null or p_reassignment_user_id = p_user_id then raise exception 'Open tasks require an eligible reassignment'; end if;
    select count(*) into v_eligible_count from public.studio_members sm join public.profiles pr on pr.id = sm.user_id
    where sm.studio_id = v_studio_id and sm.user_id = p_reassignment_user_id and sm.is_active and pr.is_active;
    if v_eligible_count <> 1 or exists (
      select 1 from public.tasks t join public.projects p on p.id = t.project_id
      where p.studio_id = v_studio_id and t.assignee_id = p_user_id and t.status not in ('completed','cancelled')
        and not exists (select 1 from public.project_members pm where pm.project_id = t.project_id and pm.user_id = p_reassignment_user_id and pm.is_active)
    ) then raise exception 'Replacement is not eligible for every open task'; end if;
    update public.tasks t set assignee_id = p_reassignment_user_id from public.projects p
      where p.id = t.project_id and p.studio_id = v_studio_id and t.assignee_id = p_user_id and t.status not in ('completed','cancelled');
  end if;
  update public.project_members pm set is_active = false, removed_at = current_date
    from public.projects p where p.id = pm.project_id and p.studio_id = v_studio_id and pm.user_id = p_user_id and pm.is_active;
  update public.studio_members set is_active = false, removed_at = now(), removed_by = (select auth.uid())
    where studio_id = v_studio_id and user_id = p_user_id and is_active;
end;
$$;

create or replace function public.restore_studio_member(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_studio_id uuid;
begin
  select sm.studio_id into v_studio_id from public.studio_members sm
  where sm.user_id = (select auth.uid()) and sm.is_active and sm.system_role = 'admin';
  update public.studio_members set is_active = true, removed_at = null, removed_by = null
  where studio_id = v_studio_id and user_id = p_user_id and not is_active;
  if not found then raise exception 'Former studio member was not found'; end if;
end;
$$;

revoke all on function public.get_studio_member_removal_impact(uuid) from public, anon;
revoke all on function public.remove_studio_member(uuid, uuid) from public, anon;
revoke all on function public.restore_studio_member(uuid) from public, anon;
grant execute on function public.get_studio_member_removal_impact(uuid) to authenticated;
grant execute on function public.remove_studio_member(uuid, uuid) to authenticated;
grant execute on function public.restore_studio_member(uuid) to authenticated;
